-- Additive: adiciona número da NF e data de emissão em stock_entries.
-- Aceita NULL pra preservar entradas antigas (XML antigo + manuais antigas).
-- Fluxo novo grava sempre. UI usa fallback created_at quando emission_date é NULL.

ALTER TABLE public.stock_entries
    ADD COLUMN IF NOT EXISTS invoice_number TEXT,
    ADD COLUMN IF NOT EXISTS emission_date DATE;

-- Índice opcional pra busca por nº de nota no histórico.
CREATE INDEX IF NOT EXISTS idx_stock_entries_invoice_number
    ON public.stock_entries (tenant_id, invoice_number);
