"use client"
import { useState, useEffect, useRef } from 'react'

// Input monetário com máscara R$ 0,00 (pt-BR).
// Mantém value externo como Number (parent state segue numérico).
// Estado interno = string mascarada pra UI controlada sem trocar caret.
//
// Comportamento:
//  - Aceita só dígitos. Cada dígito é interpretado como centavos (típico de
//    máscara monetária — usuário não precisa digitar vírgula).
//  - Backspace remove o último centavo.
//  - Quando o pai muda `value` programaticamente (reset de form, recálculo),
//    o input ressincroniza se o número divergir do texto atual.
//  - `onChange` recebe Number (não evento).
//
// Props extras (className, placeholder, disabled, min, etc.) são spread.

const fmt = (n) => {
    const num = Number(n) || 0
    return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

const parseFromMasked = (txt) => {
    if (!txt) return 0
    const digits = String(txt).replace(/\D/g, '')
    if (!digits) return 0
    return parseInt(digits, 10) / 100
}

export default function CurrencyInput({
    value,
    onChange,
    className = '',
    placeholder = 'R$ 0,00',
    disabled = false,
    ...rest
}) {
    const [text, setText] = useState(() => fmt(value))
    const lastEmitted = useRef(Number(value) || 0)

    // Ressincroniza quando o pai muda value programaticamente.
    useEffect(() => {
        const incoming = Number(value) || 0
        if (Math.abs(incoming - lastEmitted.current) > 0.005) {
            setText(fmt(incoming))
            lastEmitted.current = incoming
        }
    }, [value])

    const handleChange = (e) => {
        const raw = e.target.value
        const num = parseFromMasked(raw)
        const masked = fmt(num)
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
            placeholder={placeholder}
            disabled={disabled}
            className={className}
            {...rest}
        />
    )
}
