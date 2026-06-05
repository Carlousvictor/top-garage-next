-- Campo livre de observações em transações.
-- Usado pelo PDV (campo "Observações" do checkout) pra anexar uma nota à venda
-- que aparece também na impressão do recibo.
--
-- Mudança aditiva:
--  - Coluna nova, NULLABLE. Vendas/lançamentos antigos ficam NULL → nenhuma
--    tela quebra (o bloco de observação só é renderizado quando há texto).
--  - TEXT herda automaticamente as policies RLS de transactions (tenant_id).
--  - Nenhuma query financeira existente lê observation — amount/status/relatórios
--    ficam idênticos.
--  - Nome "observation" alinhado com service_orders.observation.

ALTER TABLE public.transactions
    ADD COLUMN IF NOT EXISTS observation TEXT NULL;
