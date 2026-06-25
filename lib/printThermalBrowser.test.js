import { describe, it, expect } from 'vitest'
import { buildSaleReceiptHTML } from './printThermalBrowser.js'

const baseSale = {
    items: [
        { name: 'Troca de óleo', quantity: 2, unit_price: 50 },
    ],
    clientLabel: 'Maria',
    paymentMethod: 'PIX',
    subtotal: 100,
    total: 100,
    serviceDate: '2026-06-25',
    tenant: { name: 'TOP GARAGE', document: '37.159.925/0001-90' },
}

describe('buildSaleReceiptHTML', () => {
    it('define a largura útil do recibo (48mm) e zera as margens', () => {
        const html = buildSaleReceiptHTML(baseSale)
        expect(html).toContain('@page { size: 48mm auto; margin: 0; }')
        expect(html).toContain('width: 48mm')
    })

    it('mostra cabeçalho da Top Garage quando o tenant é Top Garage', () => {
        const html = buildSaleReceiptHTML(baseSale)
        expect(html).toContain('TOP GARAGE')
        expect(html).toContain('CNPJ 37.159.925/0001-90')
    })

    it('lista o item em maiúsculas com qtd e formata o total em BRL', () => {
        const html = buildSaleReceiptHTML(baseSale)
        expect(html).toContain('2x TROCA DE ÓLEO')
        expect(html).toContain('R$ 100,00')
    })

    it('só mostra subtotal/desconto quando há desconto', () => {
        const semDesc = buildSaleReceiptHTML(baseSale)
        expect(semDesc).not.toContain('Subtotal')

        const comDesc = buildSaleReceiptHTML({
            ...baseSale, discountPercent: 10, discountAmount: 10, subtotal: 100, total: 90,
        })
        expect(comDesc).toContain('Subtotal')
        expect(comDesc).toContain('Desconto 10%')
    })

    it('renderiza cada forma no pagamento dividido', () => {
        const html = buildSaleReceiptHTML({
            ...baseSale,
            splitPayment: true,
            payments: [
                { method: 'PIX', amount: 60 },
                { method: 'Cartão', amount: 40 },
            ],
        })
        expect(html).toContain('PIX')
        expect(html).toContain('Cartão')
        expect(html).toContain('R$ 60,00')
        expect(html).toContain('R$ 40,00')
    })

    it('escapa HTML em texto livre (nome do item, cliente, observação)', () => {
        const html = buildSaleReceiptHTML({
            ...baseSale,
            clientLabel: '<script>alert(1)</script>',
            observation: 'a & b <tag>',
            items: [{ name: 'Item <b>x</b>', quantity: 1, unit_price: 10 }],
        })
        expect(html).not.toContain('<script>')
        // clientLabel é normalizado pra maiúsculas antes do escape
        expect(html).toContain('&lt;SCRIPT&gt;')
        expect(html).toContain('a &amp; b &lt;tag&gt;')
        expect(html).toContain('ITEM &lt;B&gt;X&lt;/B&gt;')
    })
})
