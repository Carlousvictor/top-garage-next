-- Adiciona client_label em service_orders pra suportar OS de Terceiros
-- com cliente avulso (sem cadastro em clients).
-- Quando preenchido, client_id deve ser NULL e vice-versa.
-- Mudança aditiva: registros antigos ficam NULL nessa coluna sem efeito.

ALTER TABLE public.service_orders
    ADD COLUMN IF NOT EXISTS client_label TEXT NULL;
