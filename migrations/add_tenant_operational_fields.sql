-- Fase 2: Campos operacionais em tenants
-- Motivação: o admin panel precisa gravar CNPJ, telefone, email e status quando
-- super admins cadastram novos clientes. A tabela tenants hoje só tem id/name/logo_url/primary_color/created_at.

ALTER TABLE public.tenants
    ADD COLUMN IF NOT EXISTS document TEXT,
    ADD COLUMN IF NOT EXISTS phone    TEXT,
    ADD COLUMN IF NOT EXISTS email    TEXT,
    ADD COLUMN IF NOT EXISTS status   TEXT NOT NULL DEFAULT 'active';

-- CNPJ único quando preenchido (nulo permitido, duplicata não)
CREATE UNIQUE INDEX IF NOT EXISTS idx_tenants_document
ON public.tenants (document)
WHERE document IS NOT NULL;
