"use client"
import { useState, useEffect, useRef } from 'react'

// Input monetário com máscara R$ 0,00 (pt-BR).
// Mantém value externo como Number (parent state segue numérico).
// Estado interno = string mascarada pra UI controlada sem trocar caret.
//
// Comportamento:
//  - Aceita só dígitos. Cada dígito é interpretado como casa decimal (típico
//    de máscara monetária — usuário não precisa digitar vírgula).
//  - Backspace remove o último decimal.
//  - Quando o pai muda `value` programaticamente (reset de form, recálculo),
//    o input ressincroniza se o número divergir do texto atual.
//  - `onChange` recebe Number (não evento).
//
// Props:
//  - decimals (default 2): número de casas decimais aceitas. Use 3 em campos
//    de entrada de nota (preço unitário, frete) que precisam de precisão
//    maior por causa de notas com 3 casas. Mantém 2 nos demais (PDV, OS).
//
// Demais props (className, placeholder, disabled, min, etc.) são spread.

const fmt = (n, decimals = 2) => {
    const num = Number(n) || 0
    return num.toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL',
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
    })
}

const parseFromMasked = (txt, decimals = 2) => {
    if (!txt) return 0
    const digits = String(txt).replace(/\D/g, '')
    if (!digits) return 0
    return parseInt(digits, 10) / Math.pow(10, decimals)
}

export default function CurrencyInput({
    value,
    onChange,
    className = '',
    placeholder,
    disabled = false,
    decimals = 2,
    ...rest
}) {
    const placeholderResolved = placeholder ?? (decimals === 3 ? 'R$ 0,000' : 'R$ 0,00')
    const [text, setText] = useState(() => fmt(value, decimals))
    const lastEmitted = useRef(Number(value) || 0)

    // Ressincroniza quando o pai muda value programaticamente OU quando
    // decimals muda em runtime (raro, mas evita inconsistência da máscara).
    useEffect(() => {
        const incoming = Number(value) || 0
        const tolerance = decimals === 3 ? 0.0005 : 0.005
        if (Math.abs(incoming - lastEmitted.current) > tolerance) {
            setText(fmt(incoming, decimals))
            lastEmitted.current = incoming
        }
    }, [value, decimals])

    const handleChange = (e) => {
        const raw = e.target.value
        const num = parseFromMasked(raw, decimals)
        const masked = fmt(num, decimals)
        setText(masked)
        lastEmitted.current = num
        if (typeof onChange === 'function') onChange(num)
    }

    const handleFocus = (e) => {
        // Seleciona tudo no foco pra facilitar digitação completa.
        e.target.select()
    }

    return (
        <input
            type="text"
            inputMode="numeric"
            value={text}
            onChange={handleChange}
            onFocus={handleFocus}
            placeholder={placeholderResolved}
            disabled={disabled}
            className={className}
            {...rest}
        />
    )
}
