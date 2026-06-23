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
