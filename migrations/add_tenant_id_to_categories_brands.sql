-- Garante que categories e brands tenham tenant_id para isolamento multi-tenant.
-- Execute no SQL Editor do Supabase.
-- É idempotente: pode rodar mais de uma vez sem efeito colateral.

-- ───────────────────────────────────────────────
-- 1. categories — cria se não existir, senão só adiciona tenant_id
-- ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.categories (
    id   SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    tenant_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Adiciona tenant_id caso a tabela já existia sem ela
ALTER TABLE public.categories
    ADD COLUMN IF NOT EXISTS tenant_id UUID;

-- Índice de lookup
CREATE INDEX IF NOT EXISTS idx_categories_tenant_id
    ON public.categories (tenant_id);

-- Unicidade: mesma oficina não duplica categoria
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE tablename = 'categories' AND indexname = 'idx_categories_tenant_name'
    ) THEN
        CREATE UNIQUE INDEX idx_categories_tenant_name
            ON public.categories (tenant_id, name);
    END IF;
END$$;

-- RLS
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tenant Isolation - Categories" ON public.categories;
CREATE POLICY "Tenant Isolation - Categories"
    ON public.categories FOR ALL
    USING  (tenant_id = public.user_tenant_id())
    WITH CHECK (tenant_id = public.user_tenant_id());

-- ───────────────────────────────────────────────
-- 2. brands — mesma abordagem
-- ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.brands (
    id   SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    tenant_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.brands
    ADD COLUMN IF NOT EXISTS tenant_id UUID;

CREATE INDEX IF NOT EXISTS idx_brands_tenant_id
    ON public.brands (tenant_id);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE tablename = 'brands' AND indexname = 'idx_brands_tenant_name'
    ) THEN
        CREATE UNIQUE INDEX idx_brands_tenant_name
            ON public.brands (tenant_id, name);
    END IF;
END$$;

ALTER TABLE public.brands ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tenant Isolation - Brands" ON public.brands;
CREATE POLICY "Tenant Isolation - Brands"
    ON public.brands FOR ALL
    USING  (tenant_id = public.user_tenant_id())
    WITH CHECK (tenant_id = public.user_tenant_id());
