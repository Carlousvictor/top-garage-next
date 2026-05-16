import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// IMPORTANTE: a versão antiga deste arquivo tinha SUPABASE_URL e SERVICE_ROLE_KEY
// hardcoded no código. Se o repositório já foi exposto a outras pessoas (push pra
// remote, compartilhamento de zip etc) considere essa chave COMPROMETIDA e rotacione
// imediatamente no painel do Supabase: Project Settings → API → Reset service role key.
// Após rotacionar, atualize SUPABASE_SERVICE_ROLE_KEY em .env.local e em qualquer
// outro local que use o serviço (Vercel / produção).

dotenv.config({ path: './.env.local' });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
    console.error('Faltam NEXT_PUBLIC_SUPABASE_URL e/ou SUPABASE_SERVICE_ROLE_KEY no .env.local. Abortando.');
    process.exit(1);
}

const supabase = createClient(url, key);

async function cleanupOrphanedEntries() {
    console.log('Fetching stock entries...');

    const { data: entries, error: err1 } = await supabase
        .from('stock_entries')
        .select('id');

    if (err1) {
        console.error(err1);
        return;
    }

    for (const entry of entries) {
        const { data: items } = await supabase
            .from('stock_entry_items')
            .select('id')
            .eq('stock_entry_id', entry.id);

        if (items && items.length === 0) {
            console.log(`Deleting orphaned stock_entry: ${entry.id}`);
            await supabase.from('stock_entries').delete().eq('id', entry.id);
        }
    }
    console.log('Cleanup complete!');
}

cleanupOrphanedEntries();
