import { describe, it, expect } from 'vitest'
import { encodeCp850 } from './cp850.js'

const bytes = (s) => Array.from(encodeCp850(s))

describe('encodeCp850', () => {
  it('passes ASCII through unchanged', () => {
    expect(bytes('RECIBO 123')).toEqual([...'RECIBO 123'].map(c => c.charCodeAt(0)))
  })

  it('maps lowercase pt-BR accents to CP850 bytes', () => {
    expect(bytes('ç')).toEqual([0x87])
    expect(bytes('ã')).toEqual([0xC6])
    expect(bytes('õ')).toEqual([0xE4])
    expect(bytes('á')).toEqual([0xA0])
    expect(bytes('é')).toEqual([0x82])
    expect(bytes('í')).toEqual([0xA1])
    expect(bytes('ó')).toEqual([0xA2])
    expect(bytes('ú')).toEqual([0xA3])
    expect(bytes('â')).toEqual([0x83])
    expect(bytes('ê')).toEqual([0x88])
    expect(bytes('ô')).toEqual([0x93])
    expect(bytes('à')).toEqual([0x85])
  })

  it('maps uppercase pt-BR accents (names are upper-cased on receipts)', () => {
    expect(bytes('Ç')).toEqual([0x80])
    expect(bytes('Ã')).toEqual([0xC7])
    expect(bytes('Õ')).toEqual([0xE5])
    expect(bytes('Á')).toEqual([0xB5])
    expect(bytes('É')).toEqual([0x90])
  })

  it('maps a full word', () => {
    expect(bytes('função')).toEqual([0x66, 0x75, 0x6E, 0x87, 0xC6, 0x6F]) // f u n ç ã o
  })

  it('replaces unmapped chars with ? (0x3F)', () => {
    expect(bytes('€')).toEqual([0x3F])
  })

  it('returns a Uint8Array', () => {
    expect(encodeCp850('a')).toBeInstanceOf(Uint8Array)
  })
})
