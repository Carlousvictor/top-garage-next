-- Remove sufixos do tipo "(Matriz)" / "(Filial)" do nome dos tenants.
-- Roda direto no SQL Editor do Supabase.
-- Pré-visualiza antes de aplicar:
--   SELECT id, name, regexp_replace(name, '\s*\([^)]*\)\s*$', '') AS new_name FROM tenants WHERE name ~ '\(.*\)$';

UPDATE tenants
SET name = trim(regexp_replace(name, '\s*\([^)]*\)\s*$', ''))
WHERE name ~ '\(.*\)$';
