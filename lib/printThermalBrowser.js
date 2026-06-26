// Impressão térmica 58mm via navegador (Rota A).
//
// Por que existe: a impressão térmica antiga (lib/thermalPrinter.js + PS1, e a
// variante WebSerial) só alcança impressora exposta como porta SERIAL/COM
// (ex.: MPT-II Bluetooth -> COM7 na máquina de dev). No cliente a impressora é
// uma POS58 USB com driver Windows (porta USB002) — não há COM, então WebSerial
// não a enxerga e o PS1 não roda no Vercel. Esta abordagem renderiza o recibo
// como HTML 58mm e manda pro DRIVER instalado via print() do navegador.
//
// Funciona em qualquer máquina (dev e cliente) e é 100% client-side, então
// roda numa app hospedada no Vercel sem servidor local.
//
// Técnica: monta um <iframe> isolado com o HTML do recibo (com seu próprio
// @page size:58mm) e chama iframe.contentWindow.print(). Imprimir o documento
// DO IFRAME (e não a página) evita conflito com o CSS de impressão A4 do app
// (components/PDVSalePrint.jsx continua sendo o recibo A4 / "Imprimir / PDF").

const TOP_GARAGE_CNPJ_DIGITS = '37159925000190'
const TOP_GARAGE_INFO = {
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

// Largura útil do recibo em mm. Papel 58mm tem área imprimível de ~48mm
// (384 dots @ 203dpi) numa POS58 — passar disso faz o driver cortar o texto
// nas bordas. Reduza (46/44) se ainda cortar; aumente (50) se sobrar margem.
const RECEIPT_WIDTH_MM = 48

function brl(n) {
    const v = (Number(n) || 0).toFixed(2)
    const [int, dec] = v.split('.')
    const withThousands = int.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
    return `R$ ${withThousands},${dec}`
}

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

// Escapa texto livre (nome do item, cliente, observação) antes de injetar no
// HTML do recibo — evita quebra de markup e injeção.
function esc(s) {
    return String(s ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
}

// Monta o HTML completo (auto-contido) de um recibo de venda do PDV em 58mm.
// `sale` tem a mesma forma que o componente PDVSalePrint / buildSaleReceiptOps.
export function buildSaleReceiptHTML(sale) {
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

    const headerName = isTopGarage ? TOP_GARAGE_INFO.name : (tenant?.name || 'RECIBO')
    const headerLines = isTopGarage ? TOP_GARAGE_INFO.lines : []

    const itemsHtml = items.map((it) => {
        const qty = Number(it.quantity ?? 1)
        const unit = Number(it.unit_price ?? 0)
        const name = esc(String(it.name || it.description || 'Item').toUpperCase())
        return `
      <div class="item">
        <div class="item-name">${qty}x ${name}</div>
        <div class="row sub">
          <span>${esc(brl(unit))}</span>
          <span>${esc(brl(qty * unit))}</span>
        </div>
      </div>`
    }).join('')

    const disc = Number(discountPercent) || 0
    const totalsHtml = `
      ${disc > 0 ? `
      <div class="row"><span>Subtotal</span><span>${esc(brl(subtotal))}</span></div>
      <div class="row"><span>Desconto ${disc}%</span><span>-${esc(brl(discountAmount))}</span></div>` : ''}
      <div class="row total"><span>TOTAL</span><span>${esc(brl(total))}</span></div>`

    let paymentHtml = ''
    if (splitPayment && Array.isArray(payments)) {
        paymentHtml = payments
            .map((p) => `<div class="row"><span>${esc(p.method)}</span><span>${esc(brl(p.amount))}</span></div>`)
            .join('')
    } else if (paymentMethod) {
        paymentHtml = `<div class="row"><span>Pagamento</span><span>${esc(paymentMethod)}</span></div>`
    }

    const obs = observation && String(observation).trim()
    const obsHtml = obs
        ? `<div class="sep"></div><div class="obs"><strong>Obs:</strong><br>${esc(String(observation).trim()).replace(/\n/g, '<br>')}</div>`
        : ''

    return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<title>Recibo</title>
<style>
  @page { size: ${RECEIPT_WIDTH_MM}mm auto; margin: 0; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: ${RECEIPT_WIDTH_MM}mm; background: #fff; }
  body {
    font-family: 'Courier New', 'Courier', monospace;
    font-size: 12px;
    /* Texto inteiro em bold: numa cabeca termica 203dpi, traco fino +
       antialiasing do navegador vira cinza = impressao apagada. Bold
       empilha dots 100% aquecidos = preto solido (vide cabecalho/total
       que ja saiam escuros por serem weight 800). */
    font-weight: 700;
    line-height: 1.3;
    color: #000;
    padding: 1mm 0.5mm 4mm;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .center { text-align: center; }
  .name { font-size: 15px; font-weight: 800; letter-spacing: .3px; margin-bottom: 1mm; }
  .small { font-size: 10px; line-height: 1.25; }
  .title { font-weight: 800; margin: 1.5mm 0; }
  .sep { border-top: 1px solid #000; margin: 1.5mm 0; }
  .meta { font-size: 11px; word-break: break-word; }
  .item { margin-bottom: 1mm; }
  .item-name { font-weight: 800; word-break: break-word; }
  .row { display: flex; justify-content: space-between; gap: 4px; }
  .row.sub { font-size: 11px; }
  .row.total { font-size: 14px; font-weight: 800; margin-top: 1mm; }
  .obs { font-size: 11px; word-break: break-word; }
  .footer { margin-top: 4mm; font-weight: 800; }
</style>
</head>
<body>
  <div class="center name">${esc(headerName)}</div>
  ${headerLines.map((l) => `<div class="center small">${esc(l)}</div>`).join('')}
  <div class="center title">RECIBO DE VENDA - PDV</div>
  <div class="sep"></div>
  <div class="meta">Data: ${esc(formatDateTime(serviceDate))}</div>
  <div class="meta">Cliente: ${esc(String(clientLabel || 'Consumidor').toUpperCase())}</div>
  <div class="sep"></div>
  ${itemsHtml}
  <div class="sep"></div>
  ${totalsHtml}
  <div class="sep"></div>
  ${paymentHtml}
  ${obsHtml}
  <div class="sep"></div>
  <div class="center footer">Obrigado pela preferencia!</div>
</body>
</html>`
}

// Renderiza o recibo num iframe oculto e dispara o print do DOCUMENTO do iframe.
// Resolve quando o print termina (ou após timeout de segurança). O navegador
// mostra o diálogo de impressão; pra impressão silenciosa no balcão, abrir o
// Chrome com a flag --kiosk-printing (imprime direto na impressora padrão).
export function printSaleReceiptThermal(sale) {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
        return Promise.reject(new Error('Impressão só roda no navegador.'))
    }
    return new Promise((resolve, reject) => {
        let iframe
        try {
            const html = buildSaleReceiptHTML(sale)
            iframe = document.createElement('iframe')
            iframe.setAttribute('aria-hidden', 'true')
            // Fora da tela e sem tamanho; imprime o doc do iframe, então não
            // precisa estar visível. (Não usar visibility:hidden — alguns
            // navegadores imprimem em branco.)
            iframe.style.cssText = 'position:fixed;left:-9999px;top:0;width:80mm;height:0;border:0;'
            iframe.srcdoc = html

            let done = false
            const cleanup = () => {
                if (iframe && iframe.parentNode) iframe.parentNode.removeChild(iframe)
            }
            const finish = () => {
                if (done) return
                done = true
                // Atrasa a remoção pra não cortar o spool do print.
                setTimeout(() => { cleanup(); resolve() }, 300)
            }

            iframe.onload = () => {
                try {
                    const win = iframe.contentWindow
                    if (!win) { cleanup(); reject(new Error('Falha ao preparar o recibo (iframe).')); return }
                    win.onafterprint = finish
                    win.focus()
                    win.print()
                    // Fallback: nem todo navegador dispara onafterprint.
                    setTimeout(finish, 2000)
                } catch (e) {
                    cleanup()
                    reject(e)
                }
            }

            document.body.appendChild(iframe)
        } catch (e) {
            if (iframe && iframe.parentNode) iframe.parentNode.removeChild(iframe)
            reject(e)
        }
    })
}
