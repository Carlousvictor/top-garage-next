-- 2026-05-03 — Pagamento parcial em Contas a Pagar
--
-- 1. Adiciona coluna paid_amount em transactions (running total das parciais).
--    Default 0; backfill para transactions já 'paid' (foram pagas integralmente).
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS paid_amount NUMERIC(12,2) NOT NULL DEFAULT 0;

UPDATE public.transactions
   SET paid_amount = amount
 WHERE status = 'paid' AND paid_amount = 0;

-- 2. Tabela de log de parciais (uma linha por pagamento parcial).
CREATE TABLE IF NOT EXISTS public.transaction_partial_payments (
  id              BIGSERIAL PRIMARY KEY,
  transaction_id  BIGINT NOT NULL REFERENCES public.transactions(id) ON DELETE CASCADE,
  tenant_id       UUID NOT NULL REFERENCES public.tenants(id) DEFAULT public.user_tenant_id(),
  amount          NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  payment_method  TEXT NOT NULL DEFAULT 'Dinheiro',
  paid_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes           TEXT
);

ALTER TABLE public.transaction_partial_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant Isolation - Partial Payments"
  ON public.transaction_partial_payments
  FOR ALL USING (tenant_id = public.user_tenant_id());

CREATE INDEX IF NOT EXISTS idx_partial_payments_tx
  ON public.transaction_partial_payments(transaction_id);

CREATE INDEX IF NOT EXISTS idx_partial_payments_paid_at
  ON public.transaction_partial_payments(paid_at);
