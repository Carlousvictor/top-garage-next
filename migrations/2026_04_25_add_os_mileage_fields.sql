-- Adiciona campos de quilometragem na ordem de serviço.
-- KM no OS (não no vehicle) porque é métrica time-series — cada OS captura o KM
-- daquele momento, e o histórico fica naturalmente preservado em service_orders.
-- Vehicle só guarda atributos estáticos (placa, marca, chassi, etc).

ALTER TABLE service_orders
    ADD COLUMN IF NOT EXISTS current_km        INTEGER,
    ADD COLUMN IF NOT EXISTS next_revision_km  INTEGER;
