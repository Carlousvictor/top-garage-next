import { describe, it, expect, vi } from 'vitest'

// Stub mínimo de localStorage (Map por trás).
function makeLocalStorage() {
    const m = new Map()
    return {
        getItem: (k) => (m.has(k) ? m.get(k) : null),
        setItem: (k, v) => m.set(k, String(v)),
        removeItem: (k) => m.delete(k),
        clear: () => m.clear(),
    }
}

function makePort(info = {}) {
    return { getInfo: () => info }
}

// Carrega o módulo com estado fresco (selectedPort em memória zera) e com
// navigator.serial / localStorage stubados.
async function load({ ports = [], picked = null }) {
    vi.resetModules()
    vi.stubGlobal('localStorage', makeLocalStorage())
    const requestPort = vi.fn(async () => {
        if (!picked) {
            const e = new Error('No port selected by the user.')
            e.name = 'NotFoundError'
            throw e
        }
        return picked
    })
    vi.stubGlobal('navigator', {
        serial: { getPorts: vi.fn(async () => ports), requestPort },
    })
    const mod = await import('./printThermalClient.js')
    return { mod, requestPort }
}

describe('getOrRequestPort — seleção de porta', () => {
    it('reusa a porta escolhida no seletor, não getPorts()[0]', async () => {
        const portA = makePort({}) // getPorts()[0] — NÃO é a impressora
        const portB = makePort({}) // a que o usuário escolhe
        const { mod } = await load({ ports: [portA, portB], picked: portB })

        // "Configurar impressora" força o seletor; usuário escolhe portB.
        const chosen = await mod.getOrRequestPort({ forcePicker: true })
        expect(chosen).toBe(portB)

        // Print seguinte (sem forçar) DEVE reusar portB — não portA (granted[0]).
        const reused = await mod.getOrRequestPort()
        expect(reused).toBe(portB)
        expect(reused).not.toBe(portA)
    })

    it('forcePicker reabre o seletor mesmo com porta já selecionada', async () => {
        const portB = makePort({})
        const { mod, requestPort } = await load({ ports: [portB], picked: portB })

        await mod.getOrRequestPort({ forcePicker: true })
        expect(requestPort).toHaveBeenCalledTimes(1)
        await mod.getOrRequestPort({ forcePicker: true })
        expect(requestPort).toHaveBeenCalledTimes(2)
    })

    it('lança NO_PORT quando o usuário cancela e não há porta conhecida', async () => {
        const { mod } = await load({ ports: [], picked: null })
        await expect(mod.getOrRequestPort()).rejects.toMatchObject({ code: 'NO_PORT' })
    })

    it('lança NO_WEBSERIAL quando navigator.serial não existe', async () => {
        vi.resetModules()
        vi.stubGlobal('localStorage', makeLocalStorage())
        vi.stubGlobal('navigator', {})
        const mod = await import('./printThermalClient.js')
        await expect(mod.getOrRequestPort()).rejects.toMatchObject({ code: 'NO_WEBSERIAL' })
    })
})
