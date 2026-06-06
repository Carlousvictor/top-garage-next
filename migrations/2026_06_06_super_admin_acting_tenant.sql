-- =====================================================================
-- 2026-06-06 — Super_admin "entrar com sair seguro" (acting_tenant_id)
-- =====================================================================
-- Problema corrigido: enterTenant sobrescrevia profiles.tenant_id do
-- super_admin (destruía o tenant de origem) e não havia "sair". Resultado:
-- super_admin ficava preso vendo os dados do último tenant em que entrou.
--
-- Solução (aditiva): super_admin deixa de usar tenant_id pra escopo de dados.
-- Nova coluna profiles.acting_tenant_id = tenant que ele está inspecionando.
--   - acting_tenant_id NULL  => super_admin vê NADA (isolamento por padrão).
--   - acting_tenant_id setado => vê só aquele tenant.
-- enterTenant seta acting_tenant_id; exitTenant zera. tenant_id (home) nunca
-- mais é tocado pra super_admin.
--
-- Usuário comum (role <> 'super_admin'): comportamento IDÊNTICO ao de antes
-- (continua escopado por tenant_id). Nada muda pra eles.
--
-- Idempotente. Aplicar via Supabase SQL Editor.
-- =====================================================================

-- 1. Coluna acting_tenant_id (nullable). FK pra tenants; se o tenant some,
--    volta a NULL (neutro) em vez de apontar pra lixo.
-- ---------------------------------------------------------------------
ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS acting_tenant_id UUID REFERENCES public.tenants(id) ON DELETE SET NULL;

-- 2. user_tenant_id(): super_admin escopa por acting_tenant_id; demais por
--    tenant_id. SECURITY DEFINER pra ler profiles sem recursão de RLS.
--    A coluna acting_tenant_id já existe (passo 1 acima), então a função
--    pode referenciá-la com segurança.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.user_tenant_id() RETURNS UUID AS $$
    SELECT CASE
        WHEN p.role = 'super_admin' THEN p.acting_tenant_id
        ELSE p.tenant_id
    END
    FROM public.profiles p
    WHERE p.user_id = auth.uid()
    LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- 3. Remediação imediata: zera acting de todos os super_admins, deixando-os
--    no estado neutro (não veem dados de tenant nenhum até "Entrar"
--    explicitamente). Conserta o super_admin que estava preso no Top Garage.
-- ---------------------------------------------------------------------
UPDATE public.profiles
    SET acting_tenant_id = NULL
    WHERE role = 'super_admin';

-- Nota: o profiles.tenant_id dos super_admins pode estar "sujo" (apontando
-- pro último tenant em que entraram). Não é mais usado pra escopo de dados
-- deles (a função acima ignora), então fica inofensivo. Se quiser limpar
-- visualmente, ajuste manualmente pra um tenant admin dedicado.
