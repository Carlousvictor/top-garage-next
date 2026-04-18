-- 2026-04-18: Adiciona campos que a APIBrasil retorna e uma nota livre
-- pro veículo. Rode no Supabase > SQL Editor.
-- Idempotente: pode rodar duas vezes sem erro.

ALTER TABLE public.vehicles
    ADD COLUMN IF NOT EXISTS fuel_type   TEXT,
    ADD COLUMN IF NOT EXISTS chassi      TEXT,
    ADD COLUMN IF NOT EXISTS renavam     TEXT,
    ADD COLUMN IF NOT EXISTS observations TEXT;

-- Índice no chassi ajuda busca quando o cliente chega sem placa
-- (ex: comprou o carro recentemente e ainda tem o documento anterior).
CREATE INDEX IF NOT EXISTS vehicles_chassi_idx ON public.vehicles (chassi);
