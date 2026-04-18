-- 2026-04-18: Adiciona campo de custo ao cadastro de serviços.
-- Permite cálculo de margem e lucro nos relatórios financeiros.
-- Idempotente.

ALTER TABLE public.services
    ADD COLUMN IF NOT EXISTS cost NUMERIC(10, 2) DEFAULT 0;

COMMENT ON COLUMN public.services.cost IS
'Custo direto do serviço (mão de obra, insumos) usado para calcular margem.';
