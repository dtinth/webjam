/**
 * Holds Opus packet waiting to be decoded and played.
 */
class OpusPacketJitterBuffer {
  bufferSize = 64
  playableSize = 16
  maxLag = 24
  buffers = Array(this.bufferSize).fill(null)
  playing = false
  maxReceivedSequenceNumber = null
  nextSequenceNumberToConsume = null

  constructor() {}

  isAfter(a, b) {
    if (a === b) {
      return false
    }
    if (a > b) {
      return true
    }
    return b - a >= 128
  }

  receivePacket(sequenceNumber, payload) {
    const arrayIndex = sequenceNumber % this.bufferSize
    if (!this.buffers[arrayIndex]) {
      this.buffers[arrayIndex] = { sequenceNumber, payload }
    } else {
      this.buffers[arrayIndex].sequenceNumber = sequenceNumber
      this.buffers[arrayIndex].payload = payload
    }
    if (
      this.maxReceivedSequenceNumber === null ||
      this.isAfter(sequenceNumber, this.maxReceivedSequenceNumber)
    ) {
      this.maxReceivedSequenceNumber = sequenceNumber

      if (this.nextSequenceNumberToConsume === null) {
        this.nextSequenceNumberToConsume = sequenceNumber
      }

      let lowerBound = this.maxReceivedSequenceNumber - this.maxLag + 1
      if (lowerBound < 0) lowerBound += 256

      if (this.isAfter(lowerBound, this.nextSequenceNumberToConsume)) {
        // Stream is lagging behind, reset the next sequence number to consume
        this.nextSequenceNumberToConsume =
          this.maxReceivedSequenceNumber - this.playableSize
        if (this.nextSequenceNumberToConsume < 0)
          this.nextSequenceNumberToConsume += 256
      }
    }
  }

  getNextPacket() {
    if (!this.playing) {
      // Wait for the packet
      const toWaitFor =
        (this.nextSequenceNumberToConsume + this.playableSize) % 256
      if (!this.isAfter(this.maxReceivedSequenceNumber, toWaitFor)) {
        return
      } else {
        this.playing = true
      }
    }

    // Find the next consumable packet
    for (
      let i = this.nextSequenceNumberToConsume;
      this.isAfter(this.maxReceivedSequenceNumber, i);
      i = (i + 1) % 256
    ) {
      const arrayIndex = i % this.bufferSize
      if (
        this.buffers[arrayIndex] &&
        this.buffers[arrayIndex].sequenceNumber === i
      ) {
        this.nextSequenceNumberToConsume = (i + 1) % 256
        return {
          payload: this.buffers[arrayIndex].payload,
          sequenceNumber: i,
        }
      }
    }

    // No packet found
    this.playing = false
  }
}

class RealtimeOpusDecoderProcessor extends AudioWorkletProcessor {
  constructor() {
    super()
    this.jitterBuffer = new OpusPacketJitterBuffer()
    this.decoder = new libopus.Decoder(2, 48000)
    this.port.onmessage = (event) => {
      this.jitterBuffer.receivePacket(
        event.data.sequenceNumber,
        event.data.payload,
      )
    }
    this.current = null
    this.currentIndex = 0
    this.logged = 0
  }

  process(inputs, outputs, parameters) {
    const output = outputs[0]
    const length = output[0].length
    let min = 0,
      max = 0
    for (let i = 0; i < length; i++) {
      if (!this.current || this.currentIndex >= this.current.length) {
        // Try to get a decoded output from decoder.
        const output = this.decoder.output()
        if (output) {
          this.current = output
          this.currentIndex = 0
        } else {
          // Try to decode more packet
          const packet = this.jitterBuffer.getNextPacket()
          // If there is no packet, output silence
          if (!packet) {
            return true
          }
          console.log('Decoding sequence number ' + packet.sequenceNumber)
          if (this.logged < 10) {
            // console.log('Payload to decode', packet.payload)
            this.logged++
          }
          this.decoder.input(packet.payload)
          const output = this.decoder.output()
          if (output) {
            if (this.logged < 10) {
              // console.log('Output', output)
              this.logged++
            }
            this.current = output
            this.currentIndex = 0
          } else {
            // If there is no output, output silence
            return true
          }
        }
      }
      output[0][i] = this.current[this.currentIndex++] / 32768
      output[1][i] = this.current[this.currentIndex++] / 32768
      min = Math.min(min, output[0][i], output[1][i])
      max = Math.max(max, output[0][i], output[1][i])
    }
    // console.log(`${min} ${max}`)
    return true
  }
}

registerProcessor(
  'realtime-opus-decoder-processor',
  RealtimeOpusDecoderProcessor,
)
