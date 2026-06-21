// Impressão em impressora térmica (ESC/POS) — usada pelo PDV.
//
// Arquitetura: este módulo monta o recibo como uma lista de "ops" (segmentos
// de bytes crus de controle ESC/POS ou texto) e delega o envio ao script
// scripts/print-thermal.ps1, que escreve direto na porta serial Bluetooth via
// CreateFile (Win32). O texto é codificado no PowerShell com o code page certo,
// então acentos pt-BR saem corretos sem hardcodar tabela de bytes aqui.
//
// SÓ funciona quando o servidor Node roda na MESMA máquina Windows onde a
// impressora está pareada (caso do top_garage_rj rodando localmente).

import os from 'os'
import path from 'path'
import { writeFile, unlink } from 'fs/promises'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { randomUUID } from 'crypto'

const execFileP = promisify(execFile)
const PS1 = path.join(process.cwd(), 'scripts', 'print-thermal.ps1')

// Configuração (sobrescrevível por env em .env.local).
// PRINTER_CP / PRINTER_ESC_T definem o code page; o par padrão (850 / ESC t 2)
// cobre pt-BR na maioria das térmicas. Ajuste se os acentos saírem errados.
export const PRINTER_CFG = {
    mac: (process.env.PRINTER_MAC || '606E413CED28').replace(/[^0-9a-fA-F]/g, '').toUpperCase(),
    com: process.env.PRINTER_COM || '',                 // ex: 'COM7' força a porta
    cols: Number(process.env.PRINTER_COLS) || 32,       // 32 = papel 58mm; 48 = 80mm
    cp: Number(process.env.PRINTER_CP) || 850,
    escT: Number.isFinite(Number(process.env.PRINTER_ESC_T)) ? Number(process.env.PRINTER_ESC_T) : 2,
}

export class ThermalError extends Error {
    constructor(message, code) {
        super(message)
        this.name = 'ThermalError'
        this.code = code
    }
}

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

// Monta as ops de um recibo de venda do PDV. Mesma forma de dados que o
// componente PDVSalePrint recebe (items, clientLabel, pagamento, total, etc).
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

    // Cabeçalho
    ops.push(A_CENTER, BOLD_ON, SIZE_2X, txt((isTopGarage ? TOP_GARAGE.name : tenant?.name || 'RECIBO') + '\n'), SIZE_1X, BOLD_OFF)
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
    ops.push(BOLD_ON, SIZE_2X, txt(lineLR('TOTAL', brl(total), Math.floor(cols / 2)) + '\n'), SIZE_1X, BOLD_OFF)

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
    ops.push(FEED(3), CUT)
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

// Envia as ops à impressora. Resolve a porta, encoda e escreve via PS1.
// Lança ThermalError com mensagem amigável (code: NOT_PAIRED | OPEN_FAILED | UNKNOWN).
export async function printOps(ops, cfg = PRINTER_CFG) {
    const jsonPath = path.join(os.tmpdir(), `tg-thermal-${randomUUID()}.json`)
    await writeFile(jsonPath, JSON.stringify(ops), 'utf8')
    try {
        const args = [
            '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', PS1,
            '-JsonPath', jsonPath,
            '-Mac', cfg.mac,
            '-Cp', String(cfg.cp),
            '-EscT', String(cfg.escT),
        ]
        if (cfg.com) args.push('-Com', cfg.com)

        const { stdout } = await execFileP('powershell.exe', args, { windowsHide: true, timeout: 15000 })
        const m = String(stdout).match(/OK:(COM\d+):(\d+)/)
        return { ok: true, com: m ? m[1] : cfg.com, bytes: m ? Number(m[2]) : undefined }
    } catch (e) {
        const s = String(e?.stderr || e?.message || '')
        if (s.includes('PRINTER_NOT_PAIRED')) {
            throw new ThermalError('Impressora MPT-II não está pareada neste computador. Pareie via Bluetooth e tente de novo.', 'NOT_PAIRED')
        }
        const open = s.match(/PRINTER_OPEN_FAILED:(\d+)/)
        if (open) {
            const code = open[1]
            const hint =
                code === '121' || code === '1167' ? 'Verifique se a impressora está ligada e ao alcance do Bluetooth.' :
                code === '5' ? 'A porta está em uso por outro programa.' :
                code === '2' ? 'A porta não existe — refaça o pareamento.' :
                `(erro ${code})`
            throw new ThermalError(`Não foi possível acessar a impressora MPT-II. ${hint}`, 'OPEN_FAILED')
        }
        throw new ThermalError('Falha na impressão térmica: ' + s.slice(0, 300), 'UNKNOWN')
    } finally {
        unlink(jsonPath).catch(() => {})
    }
}
