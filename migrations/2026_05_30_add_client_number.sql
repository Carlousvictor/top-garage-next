-- 2026-05-30: Adiciona numeração sequencial de clientes por tenant
-- + índice único de documento por tenant para evitar duplicidade.
-- Mudança puramente aditiva: nenhuma coluna existente é alterada ou removida.

-- 1) Coluna client_number (sequencial por tenant)
ALTER TABLE public.clients
    ADD COLUMN IF NOT EXISTS client_number INTEGER;

-- 2) Backfill: numera clientes existentes por tenant, ordenados por created_at
WITH numbered AS (
    SELECT id,
           ROW_NUMBER() OVER (PARTITION BY tenant_id ORDER BY created_at NULLS LAST, id) AS rn
    FROM public.clients
    WHERE client_number IS NULL
)
UPDATE public.clients c
SET client_number = n.rn
FROM numbered n
WHERE c.id = n.id;

-- 3) Índice único: (tenant_id, client_number)
CREATE UNIQUE INDEX IF NOT EXISTS clients_tenant_number_unique
    ON public.clients(tenant_id, client_number);

-- 4) Índice único parcial de documento por tenant (ignora nulos/vazios).
--    Evita CPF/CNPJ duplicado dentro do mesmo tenant.
CREATE UNIQUE INDEX IF NOT EXISTS clients_tenant_document_unique
    ON public.clients(tenant_id, document)
    WHERE document IS NOT NULL AND document <> '';
