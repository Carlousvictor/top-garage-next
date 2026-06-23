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
    } catch (e) {
        // Normalmente o usuário fechou o seletor sem escolher; loga o erro real
        // pra depuração caso seja outra causa (permissão, contexto, etc.).
        console.warn('[WebSerial] requestPort falhou:', e)
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
            await writer.close()        // flush + fecha o WritableStream antes de fechar a porta
        } catch (e) {
            try { await writer.abort() } catch { /* ignore */ }
            throw e
        } finally {
            writer.releaseLock()
        }
        // Dá tempo do buffer Bluetooth esvaziar antes de fechar a porta.
        await new Promise((r) => setTimeout(r, 400))
    } catch (e) {
        if (e instanceof ThermalClientError) throw e
        if (!opened) {
            throw new ThermalClientError('OPEN_FAILED', 'Não foi possível abrir a porta. Verifique se a impressora está ligada, pareada e não está em uso por outro programa.')
        }
        throw new ThermalClientError('WRITE_FAILED', 'Erro ao enviar dados para a impressora. Verifique a conexão e tente de novo.')
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
