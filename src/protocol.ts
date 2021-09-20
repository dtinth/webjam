import { Buffer } from 'buffer'
import { CRC } from './crc'

let counter = 0
const crc = new CRC()

export function getNextMessageCounter() {
  const n = counter
  counter = (counter + 1) % 0xff
  return n
}

export class ProtocolMessage {
  header = Buffer.alloc(7)
  parts = []
  dataSize = 0
  constructor(
    public messageId: number,
    public counter = getNextMessageCounter(),
  ) {
    this.header.writeUInt16LE(messageId, 2)
    this.header.writeUInt8(counter, 4)
  }
  add(part: Uint8Array) {
    this.parts.push(part)
    this.dataSize += part.length
    return this
  }
  getBuffer() {
    const { header, parts } = this
    const buffer = Buffer.alloc(9 + this.dataSize)
    let j = 0
    crc.reset()
    header.writeInt16LE(this.dataSize, 5)
    for (let i = 0; i < header.length; i++) {
      buffer[j++] = header[i]
      crc.update(header[i])
    }
    for (const part of parts) {
      for (let i = 0; i < part.length; i++) {
        buffer[j++] = part[i]
        crc.update(part[i])
      }
    }
    buffer.writeUInt16LE(crc.finalize(), j)
    return buffer
  }
}
