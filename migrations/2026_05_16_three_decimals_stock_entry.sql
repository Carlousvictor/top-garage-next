-- =====================================================================
-- 2026-05-16 — Precisão decimal em campos monetários de entrada de nota
-- =====================================================================
-- Aditivo: amplia precisão das colunas usadas em entrada de nota.
--   - cost_price / selling_price → NUMERIC(14,4) (4 casas — pra reconciliar
--     total da NF quando a divisão total/qty dá dízima, ex: 960,23 / 24).
--   - frete / desconto → NUMERIC(13,3) (3 casas — suficiente).
-- Valores existentes preservados sem perda.
--
-- Demais áreas (transactions, daily_closures, paid_amount, etc) continuam
-- com 2 casas — padrão financeiro brasileiro do PDV/OS não tem decimais
-- estendidos.
--
-- Idempotente: checa scale atual antes de alterar; skip se já tá igual ou maior.
-- =====================================================================

DO $$
DECLARE
    -- [tabela, coluna, precisão_alvo, scale_alvo]
    cols TEXT[][] := ARRAY[
        ARRAY['stock_entry_items','cost_price','14','4'],
        ARRAY['stock_entry_items','selling_price','14','4'],
        ARRAY['products','cost_price','14','4'],
        ARRAY['products','selling_price','14','4'],
        ARRAY['products','price','14','4'],
        ARRAY['stock_entries','freight_amount','13','3'],
        ARRAY['stock_entries','discount_amount','13','3'],
        ARRAY['stock_entry_items','discount_amount','13','3']
    ];
    tbl TEXT;
    col TEXT;
    target_precision INT;
    target_scale INT;
    current_precision INT;
    current_scale INT;
BEGIN
    FOR i IN 1..array_length(cols, 1) LOOP
        tbl := cols[i][1];
        col := cols[i][2];
        target_precision := cols[i][3]::INT;
        target_scale := cols[i][4]::INT;

        IF NOT EXISTS (
            SELECT 1 FROM information_schema.tables
            WHERE table_schema = 'public' AND table_name = tbl
        ) THEN
            CONTINUE;
        END IF;

        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = tbl AND column_name = col
        ) THEN
            CONTINUE;
        END IF;

        SELECT numeric_precision, numeric_scale INTO current_precision, current_scale
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = tbl AND column_name = col;

        IF current_scale >= target_scale AND current_precision >= target_precision THEN
            RAISE NOTICE 'Skip %.%: já está em (%,%).', tbl, col, current_precision, current_scale;
            CONTINUE;
        END IF;

        EXECUTE format(
            'ALTER TABLE public.%I ALTER COLUMN %I TYPE NUMERIC(%s,%s)',
            tbl, col, target_precision, target_scale
        );
        RAISE NOTICE 'Ampliado %.% de (%,%) para (%,%).',
            tbl, col, current_precision, current_scale, target_precision, target_scale;
    END LOOP;
END $$;
