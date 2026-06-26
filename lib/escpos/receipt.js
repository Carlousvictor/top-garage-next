// Construção pura das "ops" de um recibo térmico (ESC/POS) — sem dependências
// de Node. Portado de lib/thermalPrinter.js. Cada op é { t:'raw', b:[...] }
// (bytes de controle) ou { t:'txt', s:'...' } (texto). A serialização pra bytes
// fica em opsToBytes.js; o transporte (WebSerial) em lib/printThermalClient.js.
import { PRINTER_CFG } from './config.js'

// ---- Helpers ESC/POS (cada um devolve uma "op") ----
const raw = (...b) => ({ t: 'raw', b })
const txt = (s) => ({ t: 'txt', s: String(s ?? '') })
const A_LEFT = raw(27, 97, 0)
const A_CENTER = raw(27, 97, 1)
const BOLD_ON = raw(27, 69, 1)
const BOLD_OFF = raw(27, 69, 0)
const SIZE_2X = raw(29, 33, 17)   // largura+altura dobradas
const SIZE_1X = raw(29, 33, 0)
const FEED = (n) => raw(27, 100, n)
const CUT = raw(29, 86, 0)

// ---- Utilitários de texto ----
function brl(n) {
    const v = (Number(n) || 0).toFixed(2)
    const [int, dec] = v.split('.')
    const withThousands = int.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
    return `R$ ${withThousands},${dec}`
}

// Linha com texto à esquerda e à direita, preenchida com espaços até `cols`.
function lineLR(left, right, cols) {
    left = String(left)
    right = String(right)
    let pad = cols - left.length - right.length
    if (pad < 1) {
        left = left.slice(0, Math.max(0, cols - right.length - 1))
        pad = Math.max(1, cols - left.length - right.length)
    }
    return left + ' '.repeat(pad) + right
}

function wrap(s, cols) {
    s = String(s)
    const out = []
    while (s.length > cols) {
        out.push(s.slice(0, cols))
        s = s.slice(cols)
    }
    out.push(s)
    return out
}

const sep = (cols, ch = '-') => ch.repeat(cols)
const linesTxt = (arr) => arr.map((l) => txt(l + '\n'))

function formatDateTime(input) {
    let d
    if (typeof input === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(input)) {
        // 'YYYY-MM-DD' do form: fixa meio-dia pra evitar shift de fuso.
        d = new Date(`${input}T12:00:00`)
    } else {
        d = input ? new Date(input) : new Date()
    }
    const date = d.toLocaleDateString('pt-BR')
    const time = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    return `${date} ${time}`
}

// Cabeçalho institucional — espelha o de components/PDVSalePrint.jsx.
const TOP_GARAGE_CNPJ_DIGITS = '37159925000190'
const TOP_GARAGE = {
    name: 'TOP GARAGE',
    lines: [
        'RUA A, 32 - JARDIM PRIMAVERA',
        'DUQUE DE CAXIAS - RJ',
        'CEP 25211-457',
        'TEL (21) 95925-7386',
        'CNPJ 37.159.925/0001-90',
    ],
}
const onlyDigits = (s) => String(s || '').replace(/\D/g, '')

// Monta as ops de um recibo de venda do PDV.
export function buildSaleReceiptOps(sale, cols = PRINTER_CFG.cols) {
    const {
        items = [],
        clientLabel = 'Consumidor',
        paymentMethod,
        splitPayment,
        payments,
        subtotal,
        discountPercent,
        discountAmount,
        total,
        serviceDate,
        observation,
        tenant,
    } = sale || {}

    const isTopGarage =
        onlyDigits(tenant?.document) === TOP_GARAGE_CNPJ_DIGITS ||
        String(tenant?.name || '').toUpperCase().includes('TOP GARAGE')

    const ops = []

    // Recibo inteiro em negrito: na cabeça térmica 203dpi o texto fino normal
    // sai apagado (meio-aquecido = cinza). BOLD dobra a cobertura de dots por
    // coluna = preto sólido — é por isso que cabeçalho/TOTAL já saíam escuros.
    // Negrito não muda a largura da célula, então lineLR/cols continuam certos.
    ops.push(BOLD_ON)

    // Cabeçalho
    ops.push(A_CENTER, SIZE_2X, txt((isTopGarage ? TOP_GARAGE.name : tenant?.name || 'RECIBO') + '\n'), SIZE_1X)
    if (isTopGarage) ops.push(...linesTxt(TOP_GARAGE.lines))
    ops.push(txt('\n'), txt('RECIBO DE VENDA - PDV\n'), A_LEFT, txt(sep(cols) + '\n'))

    // Metadados
    ops.push(txt(`Data: ${formatDateTime(serviceDate)}\n`))
    ops.push(...linesTxt(wrap(`Cliente: ${(clientLabel || 'Consumidor').toUpperCase()}`, cols)))
    ops.push(txt(sep(cols) + '\n'))

    // Itens
    for (const it of items) {
        const qty = Number(it.quantity ?? 1)
        const unit = Number(it.unit_price ?? 0)
        const name = String(it.name || it.description || 'Item').toUpperCase()
        ops.push(...linesTxt(wrap(`${qty}x ${name}`, cols)))
        ops.push(txt(lineLR('', `${brl(unit)} = ${brl(qty * unit)}`, cols) + '\n'))
    }
    ops.push(txt(sep(cols) + '\n'))

    // Totais
    const disc = Number(discountPercent) || 0
    if (disc > 0) {
        ops.push(txt(lineLR('Subtotal', brl(subtotal), cols) + '\n'))
        ops.push(txt(lineLR(`Desconto ${disc}%`, '-' + brl(discountAmount), cols) + '\n'))
    }
    ops.push(SIZE_2X, txt(lineLR('TOTAL', brl(total), Math.floor(cols / 2)) + '\n'), SIZE_1X)

    // Pagamento
    ops.push(txt(sep(cols) + '\n'))
    if (splitPayment && Array.isArray(payments)) {
        for (const p of payments) ops.push(txt(lineLR(p.method, brl(p.amount), cols) + '\n'))
    } else if (paymentMethod) {
        ops.push(txt(lineLR('Pagamento', paymentMethod, cols) + '\n'))
    }

    // Observação
    if (observation && String(observation).trim()) {
        ops.push(txt(sep(cols) + '\n'), txt('Obs:\n'))
        ops.push(...linesTxt(wrap(String(observation).trim(), cols)))
    }

    // Rodapé
    ops.push(txt('\n'), A_CENTER, txt('Obrigado pela preferencia!\n'), A_LEFT)
    ops.push(BOLD_OFF, FEED(3), CUT)
    return ops
}

// Recibo de teste — valida porta, corte e acentos.
export function buildTestOps(cols = PRINTER_CFG.cols) {
    return [
        A_CENTER, BOLD_ON, SIZE_2X, txt('TESTE\n'), SIZE_1X, txt('MPT-II\n'), BOLD_OFF, A_LEFT,
        txt(sep(cols) + '\n'),
        txt('Acentuação: ção, não, função\n'),
        txt('Cifrão e total: ' + brl(1234.56) + '\n'),
        txt('Data: ' + formatDateTime(null) + '\n'),
        txt(sep(cols) + '\n'),
        A_CENTER, txt('Impressora OK\n'), A_LEFT,
        FEED(3), CUT,
    ]
}
