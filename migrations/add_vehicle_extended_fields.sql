-- 2026-04-18: Expansão dos dados do veículo — trazer o máximo que a APIBrasil devolve.
-- Roda depois de `add_vehicle_api_fields.sql`. Idempotente.

ALTER TABLE public.vehicles
    ADD COLUMN IF NOT EXISTS submodel             TEXT,
    ADD COLUMN IF NOT EXISTS manufacture_year     TEXT,
    ADD COLUMN IF NOT EXISTS engine_displacement  TEXT,
    ADD COLUMN IF NOT EXISTS city                 TEXT,
    ADD COLUMN IF NOT EXISTS state                TEXT;
