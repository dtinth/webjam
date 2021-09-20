
export class CRC {
  private poly = ( 1 << 5 ) | ( 1 << 12 )
  private bitOutMask = 1 << 16
  private state = new Uint32Array(1)
  constructor() {
    this.reset()
  }
  reset() {
    this.state[0] = ~0
  }
  update(b: number) {
    const {state} =this
    for (let i = 0; i < 8; i++) {
      state[0] <<= 1
      if (state[0] & this.bitOutMask) {
        state[0] |= 1
      }
      if (b & (1 << (7 - i))) {
        state[0] ^= 1
      }
      if (state[0] & 1) {
        state[0] ^= this.poly
      }
    }
  }
  finalize() {
    return (~this.state[0]) & 0xFFFF
  }
}
