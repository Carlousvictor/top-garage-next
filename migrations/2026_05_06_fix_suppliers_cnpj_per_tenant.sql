-- Tornar a unicidade do CNPJ do fornecedor por tenant em vez de global.
--
-- Sintoma: ao importar XML de NFe ou cadastrar entrada manual, o backend
-- retornava "duplicate key value violates unique constraint 'supplier_cnpj'".
-- Como efeito colateral, nenhuma nota era salva e o histórico ficava vazio.
--
-- Causa raiz: a constraint UNIQUE(cnpj) nasceu single-tenant. Depois da
-- migração multi-tenant (suppliers.tenant_id NOT NULL + RLS por tenant),
-- a constraint global passou a bloquear o tenant B de cadastrar um
-- fornecedor cujo CNPJ já existe no tenant A — mesmo o RLS escondendo
-- a linha conflitante. Constraints UNIQUE são checadas no storage layer,
-- não passam pelo RLS.
--
-- Correção: derruba a UNIQUE global e cria UNIQUE(tenant_id, cnpj)
-- (parcial, ignorando NULL pra não exigir CNPJ de fornecedor estrangeiro
-- ou cadastro incompleto). Mantém a integridade intra-tenant.

DO $$
DECLARE
    cons RECORD;
BEGIN
    -- Cobre tanto o nome custom relatado no erro ("supplier_cnpj") quanto
    -- o nome auto-gerado pelo Postgres ("suppliers_cnpj_key") — instalações
    -- diferentes podem ter qualquer um dos dois.
    FOR cons IN
        SELECT conname
        FROM pg_constraint
        WHERE conrelid = 'public.suppliers'::regclass
          AND contype = 'u'
          AND conname IN ('supplier_cnpj', 'suppliers_cnpj_key')
    LOOP
        EXECUTE format('ALTER TABLE public.suppliers DROP CONSTRAINT %I', cons.conname);
    END LOOP;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS suppliers_tenant_cnpj_unique
    ON public.suppliers (tenant_id, cnpj)
    WHERE cnpj IS NOT NULL;
