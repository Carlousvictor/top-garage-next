-- =====================================================================
-- 2026-06-06 — Consolidação de RLS (remove furos acumulados)
-- =====================================================================
-- A auditoria de 2026-06-06 achou policies redundantes de 3 épocas
-- empilhadas em cada tabela. Como policies PERMISSIVAS se somam por OR no
-- Postgres, a mais frouxa vencia. Furos ativos:
--
--   * USING (true) em products/brands/categories  -> vazamento cross-tenant
--     pra QUALQUER usuário autenticado.
--   * "OR (auth.uid() IS NULL)" em ~12 tabelas     -> acesso total a anônimo
--     (sem login).
--   * "OR is_super_admin()" nas policies de dados  -> super_admin via tudo
--     mesclado (contraria isolamento estrito; o escopo do super_admin agora
--     é o acting_tenant_id via user_tenant_id()).
--   * tenants "viewable by everyone"               -> lista de empresas/CNPJ
--     exposta a anônimo.
--
-- Esta migration, pra cada tabela de dados, DERRUBA todas as policies e cria
-- UMA só, estrita:
--     FOR ALL TO authenticated
--     USING (tenant_id = user_tenant_id()) WITH CHECK (tenant_id = user_tenant_id())
-- Sem true, sem anon, sem is_super_admin() bypass. Mais ENABLE + FORCE RLS.
--
-- NÃO é aditivo (aperta acesso) — mas é correção de segurança. Usuário comum:
-- comportamento idêntico (continua vendo só o próprio tenant). super_admin:
-- passa a depender de "Entrar" (acting_tenant_id) em vez de ver tudo mesclado.
-- Anônimo: perde acesso (o app é todo autenticado; login não lê essas tabelas).
--
-- PRÉ-REQUISITO: rodar 2026_06_06_super_admin_acting_tenant.sql ANTES (ou
-- junto), pra que user_tenant_id() já seja acting-aware. Idempotente.
-- Aplicar no Supabase SQL Editor.
-- =====================================================================

-- 1. Tabelas escopadas puramente por tenant_id -> uma policy estrita.
-- ---------------------------------------------------------------------
DO $$
DECLARE
    t TEXT;
    pol TEXT;
    tables TEXT[] := ARRAY[
        'brands','categories','clients','daily_closures',
        'inventories','inventory_items','products',
        'service_order_items','service_orders','services',
        'stock_entries','stock_entry_items','suppliers',
        'transaction_partial_payments','transactions','vehicles',
        'product_similarities'
    ];
BEGIN
    FOREACH t IN ARRAY tables LOOP
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.tables
            WHERE table_schema = 'public' AND table_name = t
        ) THEN
            CONTINUE;
        END IF;

        -- Derruba TODAS as policies existentes (limpa o acúmulo de nomes).
        FOR pol IN
            SELECT policyname FROM pg_policies
            WHERE schemaname = 'public' AND tablename = t
        LOOP
            EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol, t);
        END LOOP;

        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
        EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);

        EXECUTE format(
            'CREATE POLICY "Tenant Isolation - %s" ON public.%I '
            'FOR ALL TO authenticated '
            'USING (tenant_id = public.user_tenant_id()) '
            'WITH CHECK (tenant_id = public.user_tenant_id())',
            t, t
        );
    END LOOP;
END $$;

-- 2. transaction_payments — escopo por tenant_id OU via JOIN com a transação
-- pai (linhas antigas podem não ter tenant_id preenchido). Sem is_super_admin.
-- ---------------------------------------------------------------------
DO $$
DECLARE
    pol TEXT;
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'transaction_payments'
    ) THEN
        FOR pol IN
            SELECT policyname FROM pg_policies
            WHERE schemaname = 'public' AND tablename = 'transaction_payments'
        LOOP
            EXECUTE format('DROP POLICY IF EXISTS %I ON public.transaction_payments', pol);
        END LOOP;

        ALTER TABLE public.transaction_payments ENABLE ROW LEVEL SECURITY;
        ALTER TABLE public.transaction_payments FORCE ROW LEVEL SECURITY;

        CREATE POLICY "Tenant Isolation - Transaction Payments"
            ON public.transaction_payments
            FOR ALL TO authenticated
            USING (
                tenant_id = public.user_tenant_id()
                OR EXISTS (
                    SELECT 1 FROM public.transactions tx
                    WHERE tx.id = transaction_payments.transaction_id
                      AND tx.tenant_id = public.user_tenant_id()
                )
            )
            WITH CHECK (
                tenant_id = public.user_tenant_id()
                OR EXISTS (
                    SELECT 1 FROM public.transactions tx
                    WHERE tx.id = transaction_payments.transaction_id
                      AND tx.tenant_id = public.user_tenant_id()
                )
            );
    END IF;
END $$;

-- 3. tenants — remove "viewable by everyone". Usuário lê só o próprio tenant;
-- super_admin lê/escreve todos (precisa pro painel admin). Login NÃO lê tenants
-- (usa env var pra branding), então tirar o acesso anônimo é seguro.
-- ---------------------------------------------------------------------
DO $$
DECLARE
    pol TEXT;
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'tenants'
    ) THEN
        FOR pol IN
            SELECT policyname FROM pg_policies
            WHERE schemaname = 'public' AND tablename = 'tenants'
        LOOP
            EXECUTE format('DROP POLICY IF EXISTS %I ON public.tenants', pol);
        END LOOP;

        ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
        ALTER TABLE public.tenants FORCE ROW LEVEL SECURITY;

        CREATE POLICY "Tenants self read" ON public.tenants
            FOR SELECT TO authenticated
            USING (id = public.user_tenant_id() OR public.is_super_admin());

        CREATE POLICY "Tenants super admin write" ON public.tenants
            FOR ALL TO authenticated
            USING (public.is_super_admin())
            WITH CHECK (public.is_super_admin());
    END IF;
END $$;

-- 4. Auditoria final: lista qualquer policy permissiva remanescente que use
-- 'true' ou 'auth.uid() IS NULL' (não deveria sobrar nenhuma nas tabelas acima).
-- ---------------------------------------------------------------------
DO $$
DECLARE
    r RECORD;
    n INT := 0;
BEGIN
    FOR r IN
        SELECT tablename, policyname, qual
        FROM pg_policies
        WHERE schemaname = 'public'
          AND (qual = 'true' OR qual ILIKE '%auth.uid() IS NULL%')
    LOOP
        RAISE WARNING 'Policy permissiva remanescente: %.% -> %', r.tablename, r.policyname, r.qual;
        n := n + 1;
    END LOOP;
    IF n = 0 THEN
        RAISE NOTICE 'Auditoria OK: nenhuma policy "true"/anon nas tabelas tratadas.';
    END IF;
END $$;
