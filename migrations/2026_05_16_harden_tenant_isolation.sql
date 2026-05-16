-- =====================================================================
-- 2026-05-16 — Hardening do isolamento multi-tenant
-- =====================================================================
-- Aditivo: garante RLS habilitado e policy de isolamento em TODAS as
-- tabelas com tenant_id ou que carregam dados de tenant via FK.
-- Idempotente: roda múltiplas vezes sem efeito colateral (DROP POLICY IF
-- EXISTS + CREATE POLICY). Não remove dados nem altera schema existente.
--
-- Aplicar via Supabase SQL Editor.
--
-- Nota sobre profiles.id vs profiles.user_id:
--   profiles.id é bigint (serial PK), profiles.user_id é uuid (= auth.uid()).
--   O "dual-key" do app (eq('id', user.id)) NUNCA casou DB-side por type
--   mismatch (maybeSingle engole o erro). Aqui SÓ usamos user_id, que é o
--   campo correto e canônico.
--
-- Política de super_admin:
--   super_admin NÃO bypassa RLS em tabelas de dados. Ele só vê o tenant
--   em que está "logado" via profiles.tenant_id (atualizado via
--   actions/admin.js::enterTenant). Sem isso, super_admin via tudo
--   misturado e quebrava o conceito de "entrar como tenant X".
--   Bypass de is_super_admin() fica restrito às tabelas administrativas
--   (tenants, companies) e a profiles (gestão de usuários).
-- =====================================================================

-- 1. Helpers SECURITY DEFINER — bypassam RLS na própria checagem, evitando
-- recursão de policy.
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.user_tenant_id() RETURNS UUID AS $$
    SELECT tenant_id FROM public.profiles
    WHERE user_id = auth.uid()
    LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION public.is_super_admin() RETURNS BOOLEAN AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.profiles
        WHERE user_id = auth.uid()
          AND role = 'super_admin'
    );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- 2. Tabelas com tenant_id direto — RLS estrita por tenant.
-- super_admin NÃO bypassa aqui: ele enxerga só o tenant em que está logado.
-- ---------------------------------------------------------------------
DO $$
DECLARE
    t TEXT;
    tables TEXT[] := ARRAY[
        'clients','vehicles','services','products','suppliers',
        'stock_entries','stock_entry_items',
        'service_orders','service_order_items',
        'transactions','transaction_partial_payments',
        'daily_closures','categories','brands'
    ];
BEGIN
    FOREACH t IN ARRAY tables LOOP
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.tables
            WHERE table_schema = 'public' AND table_name = t
        ) THEN
            CONTINUE;
        END IF;

        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
        EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);
        EXECUTE format('DROP POLICY IF EXISTS "Tenant Isolation - %s" ON public.%I', t, t);
        EXECUTE format(
            'CREATE POLICY "Tenant Isolation - %s" ON public.%I '
            'FOR ALL TO authenticated '
            'USING (tenant_id = public.user_tenant_id()) '
            'WITH CHECK (tenant_id = public.user_tenant_id())',
            t, t
        );
    END LOOP;
END $$;

-- 3. profiles — usuário vê o próprio + perfis do mesmo tenant.
-- super_admin vê todos (precisa pra gerenciar usuários e fazer enterTenant).
-- ---------------------------------------------------------------------
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Tenant Isolation - Profiles" ON public.profiles;
DROP POLICY IF EXISTS "Profiles self read" ON public.profiles;
DROP POLICY IF EXISTS "Profiles tenant scope" ON public.profiles;

CREATE POLICY "Profiles tenant scope" ON public.profiles
    FOR ALL TO authenticated
    USING (
        tenant_id = public.user_tenant_id()
        OR user_id = auth.uid()
        OR public.is_super_admin()
    )
    WITH CHECK (
        tenant_id = public.user_tenant_id()
        OR public.is_super_admin()
    );

-- 4. transaction_payments — isolamento por tenant_id + JOIN com transactions.
-- super_admin sem bypass aqui.
-- ---------------------------------------------------------------------
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'transaction_payments'
    ) THEN
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = 'transaction_payments'
              AND column_name = 'tenant_id'
        ) THEN
            ALTER TABLE public.transaction_payments
                ADD COLUMN tenant_id UUID;
        END IF;

        UPDATE public.transaction_payments tp
            SET tenant_id = t.tenant_id
            FROM public.transactions t
            WHERE tp.transaction_id = t.id
              AND tp.tenant_id IS NULL;

        EXECUTE 'ALTER TABLE public.transaction_payments
                 ALTER COLUMN tenant_id SET DEFAULT public.user_tenant_id()';

        ALTER TABLE public.transaction_payments ENABLE ROW LEVEL SECURITY;
        ALTER TABLE public.transaction_payments FORCE ROW LEVEL SECURITY;
        DROP POLICY IF EXISTS "Tenant Isolation - Transaction Payments"
            ON public.transaction_payments;

        CREATE POLICY "Tenant Isolation - Transaction Payments"
            ON public.transaction_payments
            FOR ALL TO authenticated
            USING (
                tenant_id = public.user_tenant_id()
                OR EXISTS (
                    SELECT 1 FROM public.transactions t
                    WHERE t.id = transaction_payments.transaction_id
                      AND t.tenant_id = public.user_tenant_id()
                )
            )
            WITH CHECK (
                tenant_id = public.user_tenant_id()
                OR EXISTS (
                    SELECT 1 FROM public.transactions t
                    WHERE t.id = transaction_payments.transaction_id
                      AND t.tenant_id = public.user_tenant_id()
                )
            );
    END IF;
END $$;

-- 5. tenants — usuário só lê o próprio tenant. super_admin lê/escreve todos
-- (precisa pra cadastrar novos clientes e gerir o painel admin).
-- ---------------------------------------------------------------------
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'tenants'
    ) THEN
        ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
        ALTER TABLE public.tenants FORCE ROW LEVEL SECURITY;

        DROP POLICY IF EXISTS "Tenants self read" ON public.tenants;
        DROP POLICY IF EXISTS "Tenants super admin write" ON public.tenants;

        CREATE POLICY "Tenants self read" ON public.tenants
            FOR SELECT TO authenticated
            USING (id = public.user_tenant_id() OR public.is_super_admin());

        CREATE POLICY "Tenants super admin write" ON public.tenants
            FOR ALL TO authenticated
            USING (public.is_super_admin())
            WITH CHECK (public.is_super_admin());
    END IF;
END $$;

-- 6. companies — tabela legada. Leitura só pra super_admin, escrita bloqueada.
-- ---------------------------------------------------------------------
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'companies'
    ) THEN
        ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
        ALTER TABLE public.companies FORCE ROW LEVEL SECURITY;

        DROP POLICY IF EXISTS "Companies super admin read" ON public.companies;
        CREATE POLICY "Companies super admin read" ON public.companies
            FOR SELECT TO authenticated
            USING (public.is_super_admin());
    END IF;
END $$;

-- 7. Auditoria final.
-- ---------------------------------------------------------------------
DO $$
DECLARE
    r RECORD;
    leak_count INT := 0;
BEGIN
    FOR r IN
        SELECT c.table_name
        FROM information_schema.columns c
        JOIN information_schema.tables t
          ON t.table_schema = c.table_schema AND t.table_name = c.table_name
        WHERE c.table_schema = 'public'
          AND c.column_name = 'tenant_id'
          AND t.table_type = 'BASE TABLE'
          AND NOT EXISTS (
              SELECT 1 FROM pg_class pc
              JOIN pg_namespace pn ON pn.oid = pc.relnamespace
              WHERE pn.nspname = 'public'
                AND pc.relname = c.table_name
                AND pc.relrowsecurity = true
          )
    LOOP
        RAISE WARNING 'Tabela sem RLS apesar de ter tenant_id: %', r.table_name;
        leak_count := leak_count + 1;
    END LOOP;

    IF leak_count = 0 THEN
        RAISE NOTICE 'Auditoria OK: todas as tabelas com tenant_id tem RLS habilitada.';
    END IF;
END $$;
