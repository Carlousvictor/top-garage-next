-- Adiciona visibilidade do desconto aplicado nas transações.
-- Antes, o desconto era só uma tag textual em description ("- Desc 10%").
-- Agora persistimos os 3 valores estruturados pra mostrar bruto, desconto e líquido
-- nos relatórios e listagens.
--
-- Mudança aditiva: amount continua sendo o LÍQUIDO (sem mudança de semântica),
-- todas as queries existentes que somam amount continuam corretas.
-- Registros antigos ficam NULL nas 3 colunas — fallback automático ao layout antigo.

ALTER TABLE public.transactions
    ADD COLUMN IF NOT EXISTS subtotal_amount NUMERIC(12,2) NULL,
    ADD COLUMN IF NOT EXISTS discount_percent NUMERIC(5,2) NULL,
    ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(12,2) NULL;
