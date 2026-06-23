# WebSerial Thermal Print — Design

**Date:** 2026-06-22
**Status:** Approved (design phase)
**Module area:** PDV / impressão térmica (MPT-II)

## Problem

A impressão térmica atual (`lib/thermalPrinter.js` + `scripts/print-thermal.ps1` +
`app/api/pdv/print-thermal/route.js`) roda **no servidor Node**: faz `spawn` de
`powershell.exe` e escreve bytes ESC/POS crus na porta serial Bluetooth (COM)
via `CreateFile`.

Isso só funciona quando o servidor Node roda na **mesma máquina Windows** onde a
impressora está pareada. O sistema está hospedado na **Vercel** (servidor Linux
em datacenter), que não tem PowerShell, nem COM, nem Bluetooth, nem está no
balcão. Resultado: `spawn powershell.exe ENOENT` e a impressão nunca funciona a
partir do site publicado.

Requisito adicional do usuário: precisa funcionar em **qualquer computador** que
use o sistema (a impressora será instalada em outros PCs do balcão), sem instalar
servidor local em cada máquina.

## Solution

Mover a impressão para o **navegador** usando a **Web Serial API**. O navegador
roda no PC do balcão (onde a impressora está), então é ele — não o servidor —
que abre a porta COM e escreve os bytes ESC/POS. O código de impressão vive no
app na nuvem; qualquer PC com Chrome/Edge e a impressora conectada como porta
COM consegue imprimir.

Essa abordagem é **mais portátil** que a atual: o caminho server-side ficava
preso a uma única máquina (a que roda o Node); o WebSerial funciona em cada PC
independentemente, com uma autorização única por máquina/navegador.

### Por que WebSerial (e não as alternativas)

- **Bridge local** (app no PC ouvindo localhost): exige um processo extra rodando
  em cada balcão. Mais coisa pra instalar e manter.
- **`window.print()` via driver "Generic / Text Only"**: abre diálogo a cada
  impressão e tem controle limitado de corte/formatação ESC/POS.
- **Rodar o app local em cada PC**: mantém duas cópias (local + nuvem) e perde o
  benefício do deploy único.
- **WebSerial**: mesma fidelidade ESC/POS já construída (corte, negrito, 2x),
  sem processo extra, autorização única por máquina, sem código por máquina.

## Constraints / Environment

- Navegador do balcão: **Chrome ou Edge desktop** (WebSerial não existe em
  Firefox, Safari ou mobile). Confirmado pelo usuário.
- Site servido por **HTTPS** (Vercel) — requisito de contexto seguro do WebSerial. OK.
- Impressora conecta por **Bluetooth (vira COM)** ou **USB**, dependendo do PC.
  WebSerial cobre os dois **desde que o dispositivo enumere como porta serial COM**
  (USB-CDC). Edge case: se algum PC expuser a impressora **apenas** como impressora
  USB (printer-class, sem COM), WebSerial não a lista — ver Known Risks.
- Sem COM/MAC hardcoded: o número da porta varia por máquina. Operador escolhe a
  porta no seletor nativo do navegador; o navegador memoriza a concessão por origem.

## Architecture

```
Browser (PC do balcão, Chrome/Edge)
  POSForm / PDVSalesList  (clique "Imprimir térmica" ou "Configurar impressora")
        │  monta objeto `sale`
        ▼
  lib/escpos/receipt.js      buildSaleReceiptOps(sale) / buildTestOps()  → ops[]
        ▼
  lib/escpos/opsToBytes.js   opsToBytes(ops)  → Uint8Array  (ESC @ + ESC t 2 + ...)
        │  usa
        ▼
  lib/escpos/cp850.js        encodeCp850(str) → bytes (acentos pt-BR)
        ▼
  lib/printThermalClient.js  WebSerial: getOrRequestPort → port.open({baudRate})
                             → writer.write(bytes) → flush → close
        ▼
  Porta COM (Bluetooth/USB-serial) → impressora MPT-II
```

Nenhuma chamada de rede para impressão. Servidor não participa.

### Modules

Todos **browser-safe** (sem `import` de `os`/`fs`/`child_process`).

| Módulo | Responsabilidade | Interface |
|--------|------------------|-----------|
| `lib/escpos/receipt.js` | Construção pura das "ops" do recibo + helpers de texto e cabeçalho institucional. Portado de `lib/thermalPrinter.js` (parte pura). | `buildSaleReceiptOps(sale, cols?)`, `buildTestOps(cols?)`, `PRINTER_CFG` |
| `lib/escpos/cp850.js` | Codifica string → bytes CP850 (acentos pt-BR). ASCII passa direto; chars Latin mapeados; desconhecido → `?` (0x3F). | `encodeCp850(str) → Uint8Array` |
| `lib/escpos/opsToBytes.js` | Serializa ops → `Uint8Array`. Prefixa `ESC @` (27,64) + `ESC t escT` (27,116,escT); `raw`→bytes, `txt`→`encodeCp850`. Espelha `print-thermal.ps1`. | `opsToBytes(ops, {cp, escT}) → Uint8Array` |
| `lib/printThermalClient.js` | Transporte WebSerial + API pública usada pela UI. | ver abaixo |

`lib/printThermalClient.js` exporta:

- `isSupported()` → `boolean` (`!!navigator.serial`)
- `getOrRequestPort({ forcePicker })` → `SerialPort` — reusa porta concedida
  (`navigator.serial.getPorts()`); se vazio ou `forcePicker`, chama
  `navigator.serial.requestPort()` (precisa de gesto do usuário).
- `printBytes(bytes, { baudRate })` → abre, escreve em chunks, espera ~400ms
  (flush, espelha o `Start-Sleep` do `.ps1`), fecha.
- `printSaleThermal(sale)` → `opsToBytes(buildSaleReceiptOps(sale))` + `printBytes`.
- `printTestThermal()` → `buildTestOps`.

### Op shape (inalterado)

`{ t: 'raw', b: number[] }` (bytes de controle) ou `{ t: 'txt', s: string }` (texto).
Mantém o mesmo formato atual pra portar `buildSaleReceiptOps`/`buildTestOps` sem
reescrever a lógica de layout.

### Configuração

Defaults no código, sobrescrevíveis por env `NEXT_PUBLIC_PRINTER_*` (precisa do
prefixo `NEXT_PUBLIC_` pra chegar no browser):

| Config | Default | Env |
|--------|---------|-----|
| `cols` | 32 (papel 58mm) | `NEXT_PUBLIC_PRINTER_COLS` |
| `cp` | 850 | `NEXT_PUBLIC_PRINTER_CP` |
| `escT` | 2 | `NEXT_PUBLIC_PRINTER_ESC_T` |
| `baudRate` | 9600 | `NEXT_PUBLIC_PRINTER_BAUD` |

## UI changes

- **`components/POSForm.jsx`** — `handlePrintThermal`: troca o bloco
  `fetch('/api/pdv/print-thermal', …)` por `await printSaleThermal(sale)` (mesmo
  objeto `sale` já montado). Mantém `thermalLoading` e os toasts.
- **`components/PDVSalesList.jsx`** — mesma troca no `handlePrintThermal` de
  reimpressão.
- **Botão "Configurar impressora"** (PDV) — novo. Chama
  `getOrRequestPort({ forcePicker: true })` + `printTestThermal()`. Fluxo de
  setup por máquina nova:
  `parear/conectar impressora → abrir site → "Configurar impressora" → escolher porta → teste sai → pronto`.
  Depois disso, toda impressão é silenciosa (concessão persiste por origem).

## Removals

Após portar a lógica pura:

- `app/api/pdv/print-thermal/route.js` (rota server-side)
- `scripts/print-thermal.ps1`
- `lib/thermalPrinter.js` (lógica pura migrou pra `lib/escpos/`; parte Node fica obsoleta)

**Antes de deletar:** `grep` por importadores de `@/lib/thermalPrinter` e
`/api/pdv/print-thermal` pra garantir que só os dois componentes e a rota usam.

## Error handling

| Situação | Mensagem (toast) |
|----------|------------------|
| `!navigator.serial` | "Navegador sem suporte a WebSerial. Use Chrome ou Edge no computador." |
| `requestPort()` cancelado pelo usuário | info silenciosa: "Nenhuma porta selecionada." |
| `port.open` falha | "Não foi possível abrir a porta. Verifique se a impressora está ligada, pareada e não está em uso por outro programa." |
| Erro de escrita / inesperado | "Falha na impressão térmica: <msg>" |

Como hoje: falhar na impressão **não** desfaz nem bloqueia a venda.

## Testing

- **Unit (puro, sem browser):**
  - `cp850.js`: `encodeCp850('ção')`, `'não'`, `'função'`, `'R$ 1.234,56'` →
    bytes CP850 corretos (ç=0x87, ã=0xC6, õ=0xE4, á=0xA0, é=0x82, etc.); ASCII
    intacto; char fora do mapa → 0x3F.
  - `opsToBytes.js`: prefixo `27,64,27,116,2`; `raw` preserva bytes; `txt` chama
    encoder.
  - `receipt.js`: `buildTestOps()` e `buildSaleReceiptOps(saleFixture)` produzem
    a sequência de ops esperada (cabeçalho, itens, totais, corte).
- **Manual (PC do balcão, Chrome/Edge):**
  1. "Configurar impressora" → seletor aparece → escolher a porta da MPT-II →
     recibo de teste sai com acentos corretos (ção, não) e corta o papel.
  2. PDV: carrinho com itens → "Imprimir (térmica)" → recibo da venda sai;
     segunda impressão **não** mostra seletor (concessão lembrada).
  3. PDVSalesList: abrir venda salva → "Térmica" → reimprime do snapshot.
  4. Repetir o passo 1 num **segundo PC** → confirma portabilidade.

## Known Risks

1. **Baud rate**: SPP Bluetooth normalmente ignora baud, mas `port.open()` exige
   um valor. Default 9600; se sair lixo, subir pra 115200 (via
   `NEXT_PUBLIC_PRINTER_BAUD`). O teste valida.
2. **USB printer-class**: se algum PC expuser a MPT-II só como impressora USB
   (sem COM), WebSerial não lista a porta. Mitigação: o seletor de
   "Configurar impressora" revela na hora; se acontecer, adicionar fallback
   `window.print()` pra aquele PC depois. Não bloqueia Bluetooth/USB-serial.
3. **Gesto do usuário**: `requestPort()` exige clique. Os botões de impressão/
   configuração satisfazem isso.

## Out of scope

- Fallback `window.print()` / WebUSB (só se aparecer PC printer-class-only).
- Detecção/seleção automática de porta por MAC (substituída pelo seletor nativo).
- Mudanças no layout do recibo (portado como está).
