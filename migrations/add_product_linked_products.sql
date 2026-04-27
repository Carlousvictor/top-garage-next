-- Adiciona coluna de produtos equivalentes na tabela products.
-- Produtos equivalentes são itens de fabricantes diferentes que servem
-- para o mesmo veículo (mesmo número OEM, peça intercambiável etc.).
-- A coluna armazena um array de UUIDs referenciando outros products.id
-- dentro do mesmo tenant.

ALTER TABLE public.products
ADD COLUMN IF NOT EXISTS linked_products UUID[] NOT NULL DEFAULT '{}';

-- Índice GIN para buscas eficientes dentro do array
CREATE INDEX IF NOT EXISTS idx_products_linked_products
    ON public.products USING GIN (linked_products);
