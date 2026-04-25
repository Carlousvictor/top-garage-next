-- Adiciona coluna `transmission` (câmbio/caixa) na tabela vehicles.
-- Vem do campo `extra.caixa_cambio` da API Placas; pode ficar vazio quando a API não retorna.
-- Roda no SQL Editor do Supabase.

ALTER TABLE vehicles
    ADD COLUMN IF NOT EXISTS transmission TEXT;
