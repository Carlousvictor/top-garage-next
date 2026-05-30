-- 2026-05-30 — Inventário (contagem física de estoque)
--
-- Mudança aditiva: 2 tabelas novas, nenhuma alteração em products/transactions.
-- Uma "sessão" de inventário congela um snapshot de todos os produtos
-- (ordem + estoque-sistema) no momento da criação. A folha impressa e a tela
-- leem o mesmo snapshot pela coluna `position`, garantindo ordem idêntica
-- mesmo que produtos sejam cadastrados/editados durante a contagem.
--
-- Segue o padrão de tenant_id/RLS já usado em transaction_partial_payments:
-- tenant_id UUID com DEFAULT user_tenant_id() + policy FOR ALL.

-- 1. Sessão de inventário (header)
CREATE TABLE IF NOT EXISTS public.inventories (
  id                BIGSERIAL PRIMARY KEY,
  tenant_id         UUID NOT NULL REFERENCES public.tenants(id) DEFAULT public.user_tenant_id(),
  status            TEXT NOT NULL DEFAULT 'open',   -- 'open' | 'closed'
  note              TEXT,
  applied_to_stock  BOOLEAN NOT NULL DEFAULT false, -- true quando a contagem foi aplicada ao products.quantity
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at         TIMESTAMPTZ
);

ALTER TABLE public.inventories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tenant Isolation - Inventories" ON public.inventories;
CREATE POLICY "Tenant Isolation - Inventories"
  ON public.inventories
  FOR ALL
  USING (tenant_id = public.user_tenant_id())
  WITH CHECK (tenant_id = public.user_tenant_id());

CREATE INDEX IF NOT EXISTS idx_inventories_tenant_status
  ON public.inventories(tenant_id, status);

-- 2. Itens da contagem (linhas congeladas, uma por produto no snapshot)
CREATE TABLE IF NOT EXISTS public.inventory_items (
  id                BIGSERIAL PRIMARY KEY,
  inventory_id      BIGINT NOT NULL REFERENCES public.inventories(id) ON DELETE CASCADE,
  tenant_id         UUID NOT NULL REFERENCES public.tenants(id) DEFAULT public.user_tenant_id(),
  product_id        BIGINT REFERENCES public.products(id) ON DELETE SET NULL,
  position          INTEGER NOT NULL,                 -- ordem congelada (índice no snapshot ordenado por nome)
  product_name      TEXT NOT NULL,                    -- snapshot do nome (estável p/ tela + impressão)
  sku               TEXT,
  system_quantity   NUMERIC(12,3) NOT NULL DEFAULT 0, -- estoque-sistema no início do inventário
  counted_quantity  NUMERIC(12,3),                    -- NULL até o operador preencher
  counted_at        TIMESTAMPTZ
);

ALTER TABLE public.inventory_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tenant Isolation - Inventory Items" ON public.inventory_items;
CREATE POLICY "Tenant Isolation - Inventory Items"
  ON public.inventory_items
  FOR ALL
  USING (tenant_id = public.user_tenant_id())
  WITH CHECK (tenant_id = public.user_tenant_id());

CREATE INDEX IF NOT EXISTS idx_inventory_items_inventory
  ON public.inventory_items(inventory_id, position);
