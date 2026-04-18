-- Run this in your Supabase SQL Editor to add the payment_method column to the transactions table.

ALTER TABLE public.transactions
ADD COLUMN IF NOT EXISTS payment_method TEXT;

-- Optional: You can set a default value or leave it as null for older transactions.
-- To set a default for older records (e.g., 'Dinheiro') you can run:
-- UPDATE public.transactions SET payment_method = 'Dinheiro' WHERE payment_method IS NULL;


-- =====================================================================
-- DAILY CLOSURES (Fechamento do Movimento Diário)
-- Snapshot imutável do movimento do dia. Usado pelo dashboard e relatórios.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.daily_closures (
    id SERIAL PRIMARY KEY,
    tenant_id UUID NOT NULL,
    closure_date DATE NOT NULL,
    total_income NUMERIC(12,2) NOT NULL DEFAULT 0,
    total_expense NUMERIC(12,2) NOT NULL DEFAULT 0,
    net_balance NUMERIC(12,2) NOT NULL DEFAULT 0,
    breakdown_by_method JSONB NOT NULL DEFAULT '{}'::jsonb,
    status TEXT NOT NULL DEFAULT 'closed',
    observation TEXT,
    closed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    closed_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT daily_closures_tenant_date_unique UNIQUE (tenant_id, closure_date),
    CONSTRAINT daily_closures_status_chk CHECK (status IN ('closed','pending'))
);

CREATE INDEX IF NOT EXISTS idx_daily_closures_tenant_date
    ON public.daily_closures (tenant_id, closure_date DESC);

-- RLS (usa a mesma helper function do restante do schema multi-tenant)
ALTER TABLE public.daily_closures ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tenant Isolation - Daily Closures" ON public.daily_closures;
CREATE POLICY "Tenant Isolation - Daily Closures"
    ON public.daily_closures
    FOR ALL
    USING (tenant_id = public.user_tenant_id())
    WITH CHECK (tenant_id = public.user_tenant_id());
