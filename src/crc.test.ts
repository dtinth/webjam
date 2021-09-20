import {CRC} from './crc'

it('computes the correct CRC', () => {
  const message = "\x00\x00\x19\x00\x03\x1a\x00\xd3\x00\x07\x00\x00\x00\x01\x0f\x00\x64\x74\x69\x6e\x74\x68\x20\x2f\x20\x6c\x69\x73\x74\x65\x6e\x00\x00"
  expect(crcOf(message)).toBe(0x4D1C)
})

function crcOf (binaryString: string) {
  const crc = new CRC()
  for (let i = 0; i < binaryString.length; i++) {
    crc.update(binaryString.charCodeAt(i))
  }
  return crc.finalize()
}