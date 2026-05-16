-- =====================================================================
-- 2026-05-16 — 3 casas decimais em campos monetários de entrada de nota
-- =====================================================================
-- Aditivo: amplia precisão de NUMERIC(12,2) → NUMERIC(13,3) nas colunas
-- usadas em entrada de nota (preço de custo, venda, frete e desconto).
-- Valores existentes preservados sem perda (truncar 2 → 3 casas é seguro).
--
-- Demais áreas (transactions, daily_closures, paid_amount, etc) continuam
-- com 2 casas — padrão financeiro brasileiro do PDV/OS não tem 3 casas.
--
-- Idempotente: usa CASE/IF pra checar se já está em (13,3) antes de alterar.
-- =====================================================================

DO $$
DECLARE
    r RECORD;
    cols TEXT[][] := ARRAY[
        ARRAY['stock_entry_items','cost_price'],
        ARRAY['stock_entry_items','selling_price'],
        ARRAY['stock_entries','freight_amount'],
        ARRAY['stock_entries','discount_amount'],
        ARRAY['stock_entry_items','discount_amount'],
        ARRAY['products','cost_price'],
        ARRAY['products','selling_price'],
        ARRAY['products','price']
    ];
    tbl TEXT;
    col TEXT;
    current_precision INT;
    current_scale INT;
BEGIN
    FOR i IN 1..array_length(cols, 1) LOOP
        tbl := cols[i][1];
        col := cols[i][2];

        -- Tabela existe?
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.tables
            WHERE table_schema = 'public' AND table_name = tbl
        ) THEN
            CONTINUE;
        END IF;

        -- Coluna existe?
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = tbl AND column_name = col
        ) THEN
            CONTINUE;
        END IF;

        SELECT numeric_precision, numeric_scale INTO current_precision, current_scale
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = tbl AND column_name = col;

        -- Já está em 13,3 (ou superior em scale)? skip
        IF current_scale >= 3 THEN
            RAISE NOTICE 'Skip %.%: já tem % casas.', tbl, col, current_scale;
            CONTINUE;
        END IF;

        EXECUTE format(
            'ALTER TABLE public.%I ALTER COLUMN %I TYPE NUMERIC(13,3)',
            tbl, col
        );
        RAISE NOTICE 'Ampliado %.% de (%, %) para (13,3).', tbl, col, current_precision, current_scale;
    END LOOP;
END $$;
