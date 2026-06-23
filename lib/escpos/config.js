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
