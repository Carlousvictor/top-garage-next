-- Adiciona "Outras Despesas" às entradas manuais de NF.
-- Aditivo: linhas existentes default 0, comportamento de XML/entradas antigas inalterado.
--
-- Semântica (decisão do operador): diferente do frete, "outras despesas" NÃO é
-- rateado no custo dos produtos. Entra apenas no total_value da nota e no
-- lançamento financeiro (contas a pagar). O custo/preço de venda de cada produto
-- continua derivado só de subtotal + frete - desconto.

ALTER TABLE public.stock_entries
    ADD COLUMN IF NOT EXISTS other_expenses NUMERIC(12,2) NOT NULL DEFAULT 0;
