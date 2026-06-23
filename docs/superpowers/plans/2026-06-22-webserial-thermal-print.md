# WebSerial Thermal Print Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Print ESC/POS receipts to the MPT-II thermal printer directly from the browser via the Web Serial API, so printing works from the cloud-hosted site on any Chrome/Edge desktop with the printer connected as a COM port.

**Architecture:** Move the receipt-building logic out of the Node server (`lib/thermalPrinter.js` + `.ps1` + API route) into browser-safe ES modules under `lib/escpos/`. The browser builds ESC/POS bytes (CP850-encoded for pt-BR accents) and writes them to a user-selected serial port via `navigator.serial`. The server is removed from the print path entirely.

**Tech Stack:** Next.js 16 / React 19 (ESM `.js`/`.jsx`), Web Serial API (Chrome/Edge), Vitest for unit-testing the pure encoders.

---

## File Structure

**New (browser-safe — no `os`/`fs`/`child_process` imports):**
- `lib/escpos/config.js` — `PRINTER_CFG` (cols, cp, escT, baudRate) with `NEXT_PUBLIC_PRINTER_*` overrides.
- `lib/escpos/cp850.js` — `encodeCp850(str) → Uint8Array`.
- `lib/escpos/opsToBytes.js` — `opsToBytes(ops, {cp, escT}) → Uint8Array`.
- `lib/escpos/receipt.js` — `buildSaleReceiptOps(sale, cols?)`, `buildTestOps(cols?)` + text helpers (ported from `thermalPrinter.js`).
- `lib/printThermalClient.js` — WebSerial transport + public API (`isSupported`, `getOrRequestPort`, `printBytes`, `printSaleThermal`, `printTestThermal`, `configurePrinter`, `ThermalClientError`).
- `lib/escpos/cp850.test.js`, `lib/escpos/opsToBytes.test.js`, `lib/escpos/receipt.test.js` — unit tests.

**Modified:**
- `package.json` — add `vitest` devDep + `test` script.
- `components/POSForm.jsx` — `handlePrintThermal` calls `printSaleThermal`; add "Configurar impressora" button + handler.
- `components/PDVSalesList.jsx` — `handlePrintThermal` calls `printSaleThermal`.

**Deleted (after grep confirms no other importers):**
- `app/api/pdv/print-thermal/route.js`
- `scripts/print-thermal.ps1`
- `lib/thermalPrinter.js`

---

## Task 1: Add Vitest

**Files:**
- Modify: `package.json`
- Create: `lib/escpos/smoke.test.js` (temporary smoke test, deleted at end of task)

- [ ] **Step 1: Add devDependency and test script**

Edit `package.json` — add `"test": "vitest run"` to `scripts` and `"vitest": "^3.2.4"` to `devDependencies`:

```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "eslint",
    "test": "vitest run"
  },
  "devDependencies": {
    "@tailwindcss/postcss": "^4",
    "dotenv": "^17.3.1",
    "eslint": "^9",
    "eslint-config-next": "16.1.6",
    "tailwindcss": "^4",
    "vitest": "^3.2.4"
  }
}
```

- [ ] **Step 2: Install**

Run: `npm install`
Expected: vitest added, no errors.

- [ ] **Step 3: Write a smoke test to confirm the runner works with ESM `.js`**

Create `lib/escpos/smoke.test.js`:

```js
import { describe, it, expect } from 'vitest'

describe('vitest runner', () => {
  it('runs ESM .js tests', () => {
    expect(1 + 1).toBe(2)
  })
})
```

- [ ] **Step 4: Run it**

Run: `npm test`
Expected: PASS (1 test passed).

- [ ] **Step 5: Delete the smoke test and commit**

```bash
rm lib/escpos/smoke.test.js
git add package.json package-lock.json
git commit -m "test: add vitest for unit-testing pure modules"
```

---

## Task 2: CP850 encoder

The browser `TextEncoder` only emits UTF-8. The printer expects CP850 (selected by `ESC t 2`). This module maps pt-BR Latin characters to their CP850 bytes. ASCII (`< 0x80`) passes through; unmapped characters become `?` (0x3F) so the printer never receives an invalid byte.

**Files:**
- Create: `lib/escpos/cp850.js`
- Test: `lib/escpos/cp850.test.js`

- [ ] **Step 1: Write the failing test**

Create `lib/escpos/cp850.test.js`:

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/escpos/cp850.test.js`
Expected: FAIL — cannot import `./cp850.js` (module not found).

- [ ] **Step 3: Write the implementation**

Create `lib/escpos/cp850.js`:

```js
// Codifica string -> bytes CP850 (code page do recibo, selecionada por ESC t 2).
// TextEncoder do browser só faz UTF-8; aqui mapeamos os caracteres Latin do
// pt-BR pros bytes CP850. ASCII (< 0x80) passa direto; char fora do mapa vira
// '?' (0x3F) pra nunca mandar byte inválido pra impressora.

// Mapa Unicode -> byte CP850 (cobre acentuação pt-BR + alguns símbolos comuns).
const CP850 = {
    'Ç': 0x80, 'ü': 0x81, 'é': 0x82, 'â': 0x83, 'ä': 0x84, 'à': 0x85, 'å': 0x86,
    'ç': 0x87, 'ê': 0x88, 'ë': 0x89, 'è': 0x8A, 'ï': 0x8B, 'î': 0x8C, 'ì': 0x8D,
    'Ä': 0x8E, 'Å': 0x8F, 'É': 0x90, 'æ': 0x91, 'Æ': 0x92, 'ô': 0x93, 'ö': 0x94,
    'ò': 0x95, 'û': 0x96, 'ù': 0x97, 'ÿ': 0x98, 'Ö': 0x99, 'Ü': 0x9A, 'ø': 0x9B,
    '£': 0x9C, 'Ø': 0x9D, '×': 0x9E, 'ƒ': 0x9F,
    'á': 0xA0, 'í': 0xA1, 'ó': 0xA2, 'ú': 0xA3, 'ñ': 0xA4, 'Ñ': 0xA5, 'ª': 0xA6,
    'º': 0xA7, '¿': 0xA8, '®': 0xA9, '¬': 0xAA, '½': 0xAB, '¼': 0xAC, '¡': 0xAD,
    '«': 0xAE, '»': 0xAF,
    'Á': 0xB5, 'Â': 0xB6, 'À': 0xB7, '©': 0xB8, '¢': 0xBD, '¥': 0xBE,
    'ã': 0xC6, 'Ã': 0xC7, '¤': 0xCF,
    'ð': 0xD0, 'Ð': 0xD1, 'Ê': 0xD2, 'Ë': 0xD3, 'È': 0xD4, 'ı': 0xD5, 'Í': 0xD6,
    'Î': 0xD7, 'Ï': 0xD8, '¦': 0xDD, 'Ì': 0xDE,
    'Ó': 0xE0, 'ß': 0xE1, 'Ô': 0xE2, 'Ò': 0xE3, 'õ': 0xE4, 'Õ': 0xE5, 'µ': 0xE6,
    'þ': 0xE7, 'Þ': 0xE8, 'Ú': 0xE9, 'Û': 0xEA, 'Ù': 0xEB, 'ý': 0xEC, 'Ý': 0xED,
    '¯': 0xEE, '´': 0xEF,
    '±': 0xF1, '¾': 0xF3, '¶': 0xF4, '§': 0xF5, '÷': 0xF6, '¸': 0xF7, '°': 0xF8,
    '¨': 0xF9, '·': 0xFA, '¹': 0xFB, '³': 0xFC, '²': 0xFD,
}

const QUESTION = 0x3F

export function encodeCp850(str) {
    const s = String(str ?? '')
    const out = []
    for (const ch of s) {
        const code = ch.codePointAt(0)
        if (code < 0x80) { out.push(code); continue }
        const mapped = CP850[ch]
        out.push(mapped !== undefined ? mapped : QUESTION)
    }
    return Uint8Array.from(out)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/escpos/cp850.test.js`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add lib/escpos/cp850.js lib/escpos/cp850.test.js
git commit -m "feat(escpos): CP850 encoder for pt-BR thermal text"
```

---

## Task 3: Config + ops→bytes serializer

`config.js` holds the printer defaults (overridable per-deploy via `NEXT_PUBLIC_PRINTER_*`). `opsToBytes` serializes the op list into the exact byte stream the old `.ps1` produced: `ESC @` (init) + `ESC t escT` (select code page) + each op's bytes.

**Files:**
- Create: `lib/escpos/config.js`
- Create: `lib/escpos/opsToBytes.js`
- Test: `lib/escpos/opsToBytes.test.js`

- [ ] **Step 1: Create the config module (no test — plain constants)**

Create `lib/escpos/config.js`:

```js
// Configuração da impressora térmica. Defaults cobrem a MPT-II em papel 58mm.
// Sobrescrevível por deploy via env NEXT_PUBLIC_PRINTER_* (precisa do prefixo
// NEXT_PUBLIC_ pra o Next inlinar o valor no bundle do browser).
const num = (v, fallback) => {
    const n = Number(v)
    return Number.isFinite(n) ? n : fallback
}

export const PRINTER_CFG = {
    cols: num(process.env.NEXT_PUBLIC_PRINTER_COLS, 32),   // 32 = 58mm, 48 = 80mm
    cp: num(process.env.NEXT_PUBLIC_PRINTER_CP, 850),
    escT: num(process.env.NEXT_PUBLIC_PRINTER_ESC_T, 2),
    baudRate: num(process.env.NEXT_PUBLIC_PRINTER_BAUD, 9600),
}
```

- [ ] **Step 2: Write the failing test**

Create `lib/escpos/opsToBytes.test.js`:

```js
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
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run lib/escpos/opsToBytes.test.js`
Expected: FAIL — cannot import `./opsToBytes.js`.

- [ ] **Step 4: Write the implementation**

Create `lib/escpos/opsToBytes.js`:

```js
// Serializa a lista de "ops" do recibo num Uint8Array ESC/POS.
// Espelha scripts/print-thermal.ps1: ESC @ (init) + ESC t escT (code page) +
// bytes de cada op. op.t === 'raw' -> bytes de controle; 'txt' -> texto CP850.
import { encodeCp850 } from './cp850.js'
import { PRINTER_CFG } from './config.js'

export function opsToBytes(ops, { cp = PRINTER_CFG.cp, escT = PRINTER_CFG.escT } = {}) {
    const buf = [27, 64, 27, 116, escT] // ESC @  +  ESC t escT
    for (const op of ops || []) {
        if (op?.t === 'raw') {
            for (const b of op.b) buf.push(b & 0xFF)
        } else if (op?.t === 'txt') {
            for (const b of encodeCp850(op.s)) buf.push(b)
        }
    }
    return Uint8Array.from(buf)
}
```

Note: `cp` is accepted for parity with the `.ps1` signature but the actual code-page byte sent is `escT` (CP850 is selected by `ESC t 2`); `cp` documents intent and is reserved for future code-page switches.

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run lib/escpos/opsToBytes.test.js`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/escpos/config.js lib/escpos/opsToBytes.js lib/escpos/opsToBytes.test.js
git commit -m "feat(escpos): printer config + ops-to-bytes serializer"
```

---

## Task 4: Receipt op builders (port from thermalPrinter.js)

Port the pure receipt-building logic from `lib/thermalPrinter.js` into a browser-safe module. This is the same layout code (header, items, totals, payment, footer, cut) with the Node imports and `printOps` removed. Layout is unchanged.

**Files:**
- Create: `lib/escpos/receipt.js`
- Test: `lib/escpos/receipt.test.js`

- [ ] **Step 1: Write the failing test**

Create `lib/escpos/receipt.test.js`:

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/escpos/receipt.test.js`
Expected: FAIL — cannot import `./receipt.js`.

- [ ] **Step 3: Write the implementation (ported, browser-safe)**

Create `lib/escpos/receipt.js`:

```js
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/escpos/receipt.test.js`
Expected: PASS.

- [ ] **Step 5: Run the whole suite**

Run: `npm test`
Expected: PASS (cp850, opsToBytes, receipt all green).

- [ ] **Step 6: Commit**

```bash
git add lib/escpos/receipt.js lib/escpos/receipt.test.js
git commit -m "feat(escpos): port receipt op builders (browser-safe)"
```

---

## Task 5: WebSerial transport client

The browser-side transport. No unit test (depends on `navigator.serial`, a browser-only API); verified manually in Task 9. Public API is consumed by the two components.

**Files:**
- Create: `lib/printThermalClient.js`

- [ ] **Step 1: Write the implementation**

Create `lib/printThermalClient.js`:

```js
// Impressão térmica via Web Serial API — roda no BROWSER (PC do balcão), não no
// servidor. O navegador abre a porta COM (Bluetooth/USB-serial) e escreve os
// bytes ESC/POS. Funciona em qualquer PC Chrome/Edge com a impressora pareada.
import { buildSaleReceiptOps, buildTestOps } from './escpos/receipt.js'
import { opsToBytes } from './escpos/opsToBytes.js'
import { PRINTER_CFG } from './escpos/config.js'

export class ThermalClientError extends Error {
    constructor(code, message) {
        super(message)
        this.name = 'ThermalClientError'
        this.code = code
    }
}

// WebSerial existe? (Chrome/Edge desktop em contexto seguro/HTTPS.)
export function isSupported() {
    return typeof navigator !== 'undefined' && 'serial' in navigator
}

// Devolve a porta concedida (reusa a já autorizada) ou abre o seletor nativo.
// requestPort() exige gesto do usuário — sempre chamado a partir de um clique.
export async function getOrRequestPort({ forcePicker = false } = {}) {
    if (!isSupported()) {
        throw new ThermalClientError('NO_WEBSERIAL', 'Navegador sem suporte a WebSerial. Use Chrome ou Edge no computador.')
    }
    if (!forcePicker) {
        const granted = await navigator.serial.getPorts()
        if (granted.length > 0) return granted[0]
    }
    try {
        return await navigator.serial.requestPort()
    } catch {
        // Usuário fechou o seletor sem escolher.
        throw new ThermalClientError('NO_PORT', 'Nenhuma porta selecionada.')
    }
}

// Abre a porta, escreve os bytes, espera o flush e fecha.
export async function printBytes(bytes, { baudRate = PRINTER_CFG.baudRate, port } = {}) {
    const target = port || (await getOrRequestPort())
    let opened = false
    try {
        await target.open({ baudRate })
        opened = true
        const writer = target.writable.getWriter()
        try {
            await writer.write(bytes)
        } finally {
            writer.releaseLock()
        }
        // Espelha o Start-Sleep do .ps1: dá tempo do buffer esvaziar antes de fechar.
        await new Promise((r) => setTimeout(r, 400))
    } catch (e) {
        if (e instanceof ThermalClientError) throw e
        throw new ThermalClientError('OPEN_FAILED', 'Não foi possível abrir a porta. Verifique se a impressora está ligada, pareada e não está em uso por outro programa.')
    } finally {
        if (opened) { try { await target.close() } catch { /* ignore */ } }
    }
}

// Imprime o recibo de uma venda do PDV.
export async function printSaleThermal(sale) {
    const ops = buildSaleReceiptOps(sale, PRINTER_CFG.cols)
    await printBytes(opsToBytes(ops))
}

// Imprime o recibo de teste (valida porta, acentos e corte).
export async function printTestThermal() {
    await printBytes(opsToBytes(buildTestOps(PRINTER_CFG.cols)))
}

// Setup numa máquina nova: força o seletor de porta e imprime um teste.
export async function configurePrinter() {
    const port = await getOrRequestPort({ forcePicker: true })
    await printBytes(opsToBytes(buildTestOps(PRINTER_CFG.cols)), { port })
}
```

- [ ] **Step 2: Verify it builds (no test runner for browser API)**

Run: `npm run build`
Expected: build succeeds (module compiles; no import errors). The API route still exists at this point, so the build must still pass.

- [ ] **Step 3: Commit**

```bash
git add lib/printThermalClient.js
git commit -m "feat(pdv): WebSerial thermal print client"
```

---

## Task 6: Wire POSForm to WebSerial + add "Configurar impressora"

**Files:**
- Modify: `components/POSForm.jsx` (`handlePrintThermal` ~lines 311-349; button block ~lines 741-749)

- [ ] **Step 1: Add the import**

At the top of `components/POSForm.jsx`, with the other imports, add:

```js
import { printSaleThermal, configurePrinter } from '@/lib/printThermalClient'
```

- [ ] **Step 2: Replace `handlePrintThermal` and add `handleConfigurePrinter`**

Replace the entire `handlePrintThermal` function (currently the `fetch('/api/pdv/print-thermal', …)` version) with:

```js
    // Imprime o recibo na impressora térmica MPT-II (ESC/POS) via Web Serial API,
    // direto do browser — funciona em qualquer PC Chrome/Edge com a impressora
    // como porta COM. Independe do checkout: falhar aqui não desfaz a venda.
    const handlePrintThermal = async () => {
        if (cart.length === 0) return
        setThermalLoading(true)
        try {
            const isSplit = splitPayment
            const payments = isSplit
                ? [
                    { method: payment1Method, amount: parseFloat(payment1Amount) || 0 },
                    { method: payment2Method, amount: parseFloat(payment2Amount) || 0 },
                ]
                : null
            await printSaleThermal({
                items: cart.map(i => ({ name: i.name, quantity: i.quantity, unit_price: i.unit_price })),
                clientLabel: resolveClientLabel(),
                paymentMethod,
                splitPayment: isSplit,
                payments,
                subtotal: calculateSubtotal(),
                discountPercent: getDiscountPercent(),
                discountAmount: calculateDiscountAmount(),
                total: calculateTotal(),
                serviceDate,
                observation: observation.trim() || null,
                tenant,
            })
            toast.success('Recibo enviado para a impressora térmica.')
        } catch (error) {
            toast.error('Impressão térmica: ' + error.message)
        } finally {
            setThermalLoading(false)
        }
    }

    // Setup da impressora numa máquina nova: abre o seletor de porta e imprime
    // um recibo de teste. Depois disso o navegador lembra a porta (impressão silenciosa).
    const handleConfigurePrinter = async () => {
        setThermalLoading(true)
        try {
            await configurePrinter()
            toast.success('Impressora configurada — recibo de teste enviado.')
        } catch (error) {
            toast.error('Configuração da impressora: ' + error.message)
        } finally {
            setThermalLoading(false)
        }
    }
```

- [ ] **Step 3: Add the "Configurar impressora" button**

Immediately after the existing "Imprimir (térmica)" button (the one with `onClick={handlePrintThermal}`), add:

```jsx
                    <button
                        type="button"
                        onClick={handleConfigurePrinter}
                        disabled={thermalLoading}
                        className="w-full mt-3 bg-neutral-800 hover:bg-neutral-700 disabled:opacity-40 text-gray-300 py-2 rounded-lg font-medium text-xs transition-colors"
                        title="Selecionar a porta da impressora térmica neste computador (uma vez por máquina) e imprimir um teste."
                    >
                        Configurar impressora
                    </button>
```

- [ ] **Step 4: Build and lint**

Run: `npm run build && npm run lint`
Expected: both succeed.

- [ ] **Step 5: Commit**

```bash
git add components/POSForm.jsx
git commit -m "feat(pdv): POSForm imprime térmica via WebSerial + botão configurar"
```

---

## Task 7: Wire PDVSalesList to WebSerial (reprint path)

**Files:**
- Modify: `components/PDVSalesList.jsx` (`handlePrintThermal` ~lines 121-155)

- [ ] **Step 1: Add the import**

At the top of `components/PDVSalesList.jsx`, with the other imports, add:

```js
import { printSaleThermal } from '@/lib/printThermalClient'
```

- [ ] **Step 2: Replace `handlePrintThermal`**

Replace the entire `handlePrintThermal` function (the `fetch('/api/pdv/print-thermal', …)` reprint version) with:

```js
    // Reimprime a venda salva na impressora térmica MPT-II (ESC/POS) via Web
    // Serial API, direto do browser. Usa os itens do snapshot da transação.
    const handlePrintThermal = async () => {
        if (!saleView || saleView.items.length === 0) return
        setThermalLoading(true)
        try {
            await printSaleThermal({
                items: saleView.items.map(it => ({
                    name: it.name || it.description,
                    quantity: it.quantity,
                    unit_price: it.unit_price,
                })),
                clientLabel: saleView.client,
                paymentMethod: saleView.method,
                splitPayment: false,
                subtotal: saleView.subtotal,
                discountPercent: saleView.discountPercent,
                discountAmount: saleView.discountAmount,
                total: saleView.total,
                serviceDate: saleView.date,
                observation: saleView.observation,
                tenant,
            })
            toast.success('Recibo enviado para a impressora térmica.')
        } catch (e) {
            toast.error('Impressão térmica: ' + e.message)
        } finally {
            setThermalLoading(false)
        }
    }
```

These field names mirror the original `fetch` body exactly (`saleView.client`, `saleView.method`, `saleView.subtotal`, `saleView.discountPercent`, `saleView.discountAmount`, `saleView.total`, `saleView.date`, `saleView.observation`) — only the transport changed from `fetch` to `printSaleThermal`.

- [ ] **Step 3: Build and lint**

Run: `npm run build && npm run lint`
Expected: both succeed.

- [ ] **Step 4: Commit**

```bash
git add components/PDVSalesList.jsx
git commit -m "feat(pdv): PDVSalesList reimprime térmica via WebSerial"
```

---

## Task 8: Remove the server-side print path

Now that the UI no longer calls `/api/pdv/print-thermal`, delete the server path.

**Files:**
- Delete: `app/api/pdv/print-thermal/route.js`
- Delete: `scripts/print-thermal.ps1`
- Delete: `lib/thermalPrinter.js`

- [ ] **Step 1: Confirm there are no remaining importers**

Run: `git grep -n "thermalPrinter\|print-thermal" -- ':!docs' ':!*.md'`
Expected: only matches inside the three files being deleted (and possibly the deleted route). If any **other** file imports `@/lib/thermalPrinter` or fetches `/api/pdv/print-thermal`, stop and wire it to the client first.

- [ ] **Step 2: Delete the files**

```bash
git rm app/api/pdv/print-thermal/route.js scripts/print-thermal.ps1 lib/thermalPrinter.js
```

- [ ] **Step 3: Build and lint to confirm nothing broke**

Run: `npm run build && npm run lint`
Expected: both succeed (no dangling imports).

- [ ] **Step 4: Run the unit suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git commit -m "refactor(pdv): remove server-side thermal print (substituído por WebSerial)"
```

---

## Task 9: Manual verification on the counter PC

No code changes — this validates the feature end-to-end on real hardware. Do this on a PC with the MPT-II connected (Bluetooth or USB) and Chrome/Edge.

- [ ] **Step 1: Deploy / serve over HTTPS**

WebSerial needs a secure context. Either push to the Vercel deploy, or run `npm run build && npm start` and access via the deployed HTTPS URL. (Plain `http://localhost` is also a secure context if testing locally.)

- [ ] **Step 2: Configure the printer**

PDV → "Configurar impressora" → the browser's serial-port picker appears → select the MPT-II port (e.g. "Standard Serial over Bluetooth (COMx)") → a test receipt prints.
Verify: accents render correctly (`Acentuação: ção, não, função`) and the paper cuts.
If the receipt prints garbage: set `NEXT_PUBLIC_PRINTER_BAUD=115200` and redeploy, then retry.
If the printer is NOT in the picker list (USB printer-class only): note it — that machine needs the `window.print()` fallback (out of scope here).

- [ ] **Step 3: Print a sale from PDV**

Add items to the cart → "Imprimir (térmica)" → the sale receipt prints. The port picker should NOT reappear (grant remembered).

- [ ] **Step 4: Reprint from the sales list**

Open a saved sale in PDVSalesList → "Térmica" → the receipt reprints from the snapshot.

- [ ] **Step 5: Confirm portability on a second PC**

Repeat Step 2 on a different Chrome/Edge PC with the printer → first print prompts the picker once, then prints. Confirms no machine-specific config.

- [ ] **Step 6: Push**

```bash
git push origin main
```

If Vercel auto-deploys on push, the feature goes live after the build.

---

## Notes for the implementer

- **TDD scope:** the three pure modules (`cp850`, `opsToBytes`, `receipt`) are unit-tested. The WebSerial transport and the React wiring can't be unit-tested without a browser; they're verified in Task 9.
- **Do not** reintroduce any `process.env` without the `NEXT_PUBLIC_` prefix in client modules — non-prefixed env vars are `undefined` in the browser bundle.
- **Frequent commits:** one per task as shown.
- **Caveman note for the human reviewer:** commit messages and code stay normal prose/style.
```
