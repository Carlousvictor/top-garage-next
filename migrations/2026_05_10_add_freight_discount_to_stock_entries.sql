-- Add freight + discount tracking to manual stock entries.
-- Additive only: existing rows default to 0, behavior unchanged for XML entries.
--
-- discount mode on entry: 'total' rateado entre itens, ou 'per_item' (cada item carrega o próprio).
-- Quando per_item, discount_amount em stock_entries fica 0 e o desconto vive em stock_entry_items.discount_amount.

ALTER TABLE public.stock_entries
    ADD COLUMN IF NOT EXISTS freight_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS discount_mode TEXT NOT NULL DEFAULT 'total'
        CHECK (discount_mode IN ('total', 'per_item'));

ALTER TABLE public.stock_entry_items
    ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(12,2) NOT NULL DEFAULT 0;
