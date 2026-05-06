-- Persiste o desconto em % aplicado na OS (campo do form ServiceOrderForm).
-- Antes: o desconto era em-memória durante a edição e só ia parar na transação
-- ao finalizar. Quando o usuário salvava sem finalizar e reabria, o campo do
-- form voltava em branco — o valor sumia.
--
-- Mudança aditiva: coluna nullable; OSs antigas ficam NULL e o form mostra vazio
-- (comportamento atual preservado). Apenas novas escritas passam a persistir.

ALTER TABLE public.service_orders
    ADD COLUMN IF NOT EXISTS discount_percent NUMERIC(5,2) NULL;
