-- Fase 1: Identidade de produto por EAN/GTIN
-- Objetivo: evitar duplicação de produto quando o mesmo item vem de fornecedores diferentes.
-- Match durante importação de XML passa a ser prioritariamente por EAN; SKU+supplier_id fica como fallback.

-- 1. Coluna nullable (produtos legados não têm EAN, backfill acontece na próxima importação).
ALTER TABLE public.products
ADD COLUMN IF NOT EXISTS ean TEXT;

-- 2. Index parcial pra lookup rápido por EAN dentro do tenant.
--    Não é UNIQUE de propósito: dados legados podem ter duplicações antes da limpeza;
--    a garantia de unicidade fica no código da importação por enquanto.
CREATE INDEX IF NOT EXISTS idx_products_tenant_ean
ON public.products (tenant_id, ean)
WHERE ean IS NOT NULL;
