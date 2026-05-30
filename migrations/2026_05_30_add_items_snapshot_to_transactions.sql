-- Persiste os itens da venda do PDV dentro da própria transação.
-- Antes, o checkout do PDV (/api/pdv/checkout) gravava só UMA linha em
-- transactions com o total — os produtos do carrinho eram perdidos. Sem isso
-- não dá pra exibir/imprimir os itens de uma venda já registrada.
--
-- Mudança aditiva:
--  - Coluna nova, NULLABLE. Vendas antigas ficam NULL → a tela "Ver" mostra
--    "itens não registrados nesta venda" (fallback gracioso).
--  - JSONB herda automaticamente as policies RLS de transactions (tenant_id),
--    então não precisa de policy nova como precisaria uma tabela filha.
--  - Nenhuma query existente lê items_snapshot — comportamento financeiro
--    (amount, status, relatórios) fica idêntico.
--
-- Formato do JSON: array de itens no mesmo shape que o PDVSalePrint consome:
--   [{ "product_id": 12, "name": "Óleo 5W30", "quantity": 2, "unit_price": 35.00 }]

ALTER TABLE public.transactions
    ADD COLUMN IF NOT EXISTS items_snapshot JSONB NULL;
