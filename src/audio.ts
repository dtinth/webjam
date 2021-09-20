import { Buffer } from 'buffer'
import opus from './vendor/libopus?url'
import opusWorklet from './opusWorklet?url'
import consola from 'consola'

let nextSequenceNumber = 0

function getNextSequenceNumber() {
  const n = nextSequenceNumber
  nextSequenceNumber++
  nextSequenceNumber %= 256
  return n
}

export function getBlankAudioPacket() {
  const packet = Buffer.alloc(332)
  for (let i = 0; i < 2; i++) {
    const start = i * 166
    packet[start] = 4 // Stereo
    packet[start + 1] = 0xff
    packet[start + 2] = 0xfe
    packet[start + 165] = getNextSequenceNumber()
  }
  return packet
}

export const audioContext = new AudioContext({
  latencyHint: 'interactive',
  sampleRate: 48000,
})
consola.success(
  'Audio context initialized with baseLatency ' + audioContext.baseLatency,
)

let decoderNode: RealtimeOpusDecoderNode = null

class RealtimeOpusDecoderNode extends AudioWorkletNode {
  constructor(context) {
    super(context, 'realtime-opus-decoder-processor', {
      outputChannelCount: [2],
    })
  }
}

audioContext.audioWorklet.addModule(opus).then(async (r) => {
  consola.info('Opus loaded')
  await audioContext.audioWorklet.addModule(opusWorklet)
  decoderNode = new RealtimeOpusDecoderNode(audioContext)
  consola.success('Opus worklet loaded')
  decoderNode.connect(audioContext.destination)
})

export function submitOpusPacket(sequenceNumber: number, payload: Buffer) {
  decoderNode.port.postMessage({ sequenceNumber, payload })
}

Object.assign(window, { getBlankAudioPacket })

window.addEventListener('click', () => {
  if (audioContext.state === 'suspended') {
    consola.info('Resuming audio')
    audioContext.resume()
  }
})
