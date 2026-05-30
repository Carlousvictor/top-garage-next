-- 2026-05-30: Rastreia se uma OS já baixou estoque.
-- Permite baixar estoque ao SALVAR a OS (não só ao finalizar) sem risco de
-- dupla baixa: o save reconcilia por delta e o finish pula a baixa quando
-- a OS já está marcada como baixada.
-- Mudança aditiva: coluna nova com default; OS antigas ficam false e mantêm
-- o comportamento legado (baixa só no finish).

ALTER TABLE public.service_orders
    ADD COLUMN IF NOT EXISTS stock_deducted BOOLEAN NOT NULL DEFAULT false;
