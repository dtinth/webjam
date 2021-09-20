<script lang="ts">
  import { onDestroy, onMount } from "svelte";

  import { connect, connectionStatus, onData, peer, send } from "./rtc";
  import { Buffer } from "buffer";
  import consola from "consola";
  import { getBlankAudioPacket, submitOpusPacket } from "./audio";
  import { ProtocolMessage } from "./protocol";

  let lastChannelIds = [];
  let debugInfo = "Debug info";

  function onRtcData(data: Uint8Array) {
    const buf = Buffer.from(data.buffer, data.byteOffset, data.byteLength);
    if (buf[0] === 0 && buf[1] === 0) {
      // This is a protocol message.
      const messageId = buf.readInt16LE(2);

      // Handle messages
      switch (messageId) {
        case 32: {
          // Client ID
          const clientId = buf.readUInt8(7);
          consola.log("[32] Received client ID: " + clientId);
          break;
        }
        case 34: {
          // Request split message support
          consola.log("[34] Received split message support request");
          // send(
          //   new ProtocolMessage(35) // Supported
          //     .getBuffer()
          // );
          break;
        }
        case 24: {
          consola.log("[24] Received client list");
          const length = buf.readUInt16LE(5);
          const payload = buf.subarray(7, 7 + length);
          const clients = [];
          for (let i = 0; i < payload.length; ) {
            const channelId = payload.readUInt8(i);
            i += 1;
            const countryId = payload.readUInt16LE(i);
            i += 2;
            const instrumentId = payload.readUInt32LE(i);
            i += 4;
            const skillLevel = payload.readUInt8(i);
            i += 1;
            // 4 zeroes
            i += 4;
            const nameLength = payload.readUInt16LE(i);
            i += 2;
            const name = payload.toString("utf8", i, i + nameLength);
            i += nameLength;
            const cityLength = payload.readUInt16LE(i);
            i += 2;
            const city = payload.toString("utf8", i, i + cityLength);
            i += cityLength;
            const client = {
              channelId,
              countryId,
              instrumentId,
              skillLevel,
              name,
              city,
            };
            clients.push(client);
          }
          consola.log("[24] Client list: ", clients);
          const channelIds = clients.map((client) => client.channelId);
          for (const channelId of channelIds) {
            // If a channel ID is new, unmute them
            if (!lastChannelIds.includes(channelId)) {
              consola.log("[24] Unmuting channel " + channelId);
              const data = Buffer.alloc(3);
              data.writeUInt8(channelId, 0);
              data.writeUInt16LE(0x8000, 1);
              send(
                new ProtocolMessage(13) // Set channel gain
                  .add(data)
                  .getBuffer()
              );
            }
          }
          lastChannelIds = channelIds;
          break;
        }
        case 21: {
          // Request network properties
          const data = Buffer.alloc(19);
          data.writeUInt32LE(166, 0); // Packet size
          data.writeUInt16LE(2, 4); // Block size factor
          data.writeUInt8(2, 6); // Stereo
          data.writeUInt32LE(48000, 7); // Sample rate
          data.writeUInt16LE(2, 11); // Opus
          data.writeUInt16LE(1, 13); // Add sequence number support
          consola.log("[21] Sending network transport properties");
          send(
            new ProtocolMessage(20) // Network transport properties
              .add(data)
              .getBuffer()
          );
          break;
        }
        case 11: {
          // Request jitter buffer size
          const data = Buffer.alloc(2);
          data.writeUInt16LE(4);
          consola.log("[11] Sending jitter buffer size");
          send(
            new ProtocolMessage(10) // Jitter buffer size
              .add(data)
              .getBuffer()
          );
          break;
        }
        case 23: {
          // Request channel info
          const name = Buffer.from("WebJam");
          const city = Buffer.from("");

          const prefix1 = Buffer.alloc(9);
          const prefix2 = Buffer.alloc(2);
          prefix1.writeUInt16LE(name.length, 7); // Name length
          prefix2.writeUInt16LE(city.length); // City length
          consola.log("[23] Sending channel info");

          send(
            new ProtocolMessage(25) // Channel info
              .add(prefix1)
              .add(name)
              .add(prefix2)
              .add(city)
              .getBuffer()
          );
          break;
        }
        case 29: {
          consola.log("[29] Received server info");
          break;
        }
        case 33: {
          consola.log("[33] Received record state");
          break;
        }
        case 1: {
          const cnt = buf.readUInt8(4);
          const id = buf.readUInt16LE(7);
          consola.log(`[1] Received acknowledgement for [${id}] (cnt=${cnt})`);
        }
      }

      // Message with ID less than 1000 needs acks.
      if (messageId !== 1 && messageId < 1000) {
        const data = Buffer.alloc(2);
        data.writeUInt16LE(messageId);
        consola.trace(`Sending ack for message ${messageId}`);
        send(
          new ProtocolMessage(
            1, // Ack
            buf[4] // Copy counter
          )
            .add(data)
            .getBuffer()
        );
      }
    } else if (buf.length === 332) {
      let start = 0;
      debugInfo = buf.toString("hex").replace(/(\S{64})/g, "$1\n");
      for (let i = 0; i < 2; i++) {
        const sequenceNumber = buf[start + 165];
        const payload = buf.subarray(start, start + 165);
        submitOpusPacket(sequenceNumber, payload);
        start += 166;
      }
    } else {
      consola.log("Unexpected audio packet length " + buf.length);
    }
  }

  let cleanupDataListener;

  onMount(() => {
    consola.log("Mounted");
    cleanupDataListener = onData(onRtcData);
  });

  onDestroy(() => {
    consola.log("Unmounted");
    cleanupDataListener();
  });

  async function start() {
    consola.log("Starting");
    await connect();
    setInterval(() => send(getBlankAudioPacket()), 100);
  }
</script>

<main>
  <h1>WebRTC-based Jamulus client</h1>
  <button on:click={start}>Start</button>
  <p>{$connectionStatus}</p>
  <pre wrap="">{debugInfo}</pre>
</main>

<style>
  :global(body) {
    background: black;
    color: white;
  }
</style>
