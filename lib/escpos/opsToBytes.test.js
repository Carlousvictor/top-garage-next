import { describe, it, expect } from 'vitest'
import { opsToBytes } from './opsToBytes.js'

const arr = (ops, opts) => Array.from(opsToBytes(ops, opts))

describe('opsToBytes', () => {
  it('prepends ESC @ init and ESC t escT code-page select', () => {
    const out = arr([], { cp: 850, escT: 2 })
    expect(out).toEqual([27, 64, 27, 116, 2])
  })

  it('uses escT from options for the code-page byte', () => {
    const out = arr([], { cp: 850, escT: 16 })
    expect(out.slice(0, 5)).toEqual([27, 64, 27, 116, 16])
  })

  it('passes raw op bytes through verbatim', () => {
    const out = arr([{ t: 'raw', b: [27, 97, 1] }], { cp: 850, escT: 2 })
    expect(out).toEqual([27, 64, 27, 116, 2, 27, 97, 1])
  })

  it('encodes txt ops as CP850', () => {
    const out = arr([{ t: 'txt', s: 'Aç' }], { cp: 850, escT: 2 })
    expect(out).toEqual([27, 64, 27, 116, 2, 0x41, 0x87]) // 'A', 'ç'
  })

  it('handles a mix of raw and txt in order', () => {
    const out = arr([{ t: 'raw', b: [10] }, { t: 'txt', s: 'x' }], { cp: 850, escT: 2 })
    expect(out).toEqual([27, 64, 27, 116, 2, 10, 0x78])
  })

  it('returns a Uint8Array', () => {
    expect(opsToBytes([], { cp: 850, escT: 2 })).toBeInstanceOf(Uint8Array)
  })
})
