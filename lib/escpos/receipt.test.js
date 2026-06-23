import { describe, it, expect } from 'vitest'
import { buildTestOps, buildSaleReceiptOps } from './receipt.js'

describe('buildTestOps', () => {
  it('produces ops ending with a feed and a cut', () => {
    const ops = buildTestOps(32)
    expect(Array.isArray(ops)).toBe(true)
    const last = ops[ops.length - 1]
    expect(last).toEqual({ t: 'raw', b: [29, 86, 0] }) // CUT (GS V 0)
  })

  it('includes accented text to validate the code page', () => {
    const ops = buildTestOps(32)
    const text = ops.filter(o => o.t === 'txt').map(o => o.s).join('')
    expect(text).toContain('ção')
  })
})

describe('buildSaleReceiptOps', () => {
  const sale = {
    items: [{ name: 'Troca de óleo', quantity: 2, unit_price: 50 }],
    clientLabel: 'João',
    paymentMethod: 'Dinheiro',
    subtotal: 100,
    total: 100,
    serviceDate: '2026-06-22',
    tenant: { name: 'Oficina X' },
  }

  it('renders item, total and ends with a cut', () => {
    const ops = buildSaleReceiptOps(sale, 32)
    const text = ops.filter(o => o.t === 'txt').map(o => o.s).join('')
    expect(text.toUpperCase()).toContain('TROCA DE') // item name upper-cased
    expect(text).toContain('TOTAL')
    expect(text).toContain('JOÃO') // client label upper-cased
    expect(ops[ops.length - 1]).toEqual({ t: 'raw', b: [29, 86, 0] })
  })

  it('shows discount lines only when a discount percent is present', () => {
    const withDisc = buildSaleReceiptOps({ ...sale, discountPercent: 10, discountAmount: 10, subtotal: 100, total: 90 }, 32)
    const text = withDisc.filter(o => o.t === 'txt').map(o => o.s).join('')
    expect(text).toContain('Subtotal')
    expect(text).toContain('Desconto 10%')
  })
})
