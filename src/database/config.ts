import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.warn('[Database] ⚠️  SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY não definidos ainda. Cliente Supabase pode falhar.');
}

// Criar cliente Supabase (usando strings vazias como fallback para evitar crash na criação)
export const supabase = createClient(supabaseUrl || '', supabaseServiceKey || '', {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

// Testar conexão ao inicializar
(async () => {
  try {
    console.log('[Database] Testing Supabase connection...');
    const { data, error } = await supabase.from('conversations').select('count').limit(1);
    
    if (error) {
      console.error('[Database] ❌ Connection test failed:', error.message);
      console.error('[Database] Error code:', error.code);
      console.error('[Database] Error details:', JSON.stringify(error, null, 2));
      
      if (error.code === '42P01') {
        console.error('[Database] ❌ ERROR: Table "conversations" does not exist!');
        console.error('[Database] 💡 Please run the SQL schema in Supabase SQL Editor');
        console.error('[Database] 💡 Schema file: backend/database/schema.sql');
      }
    } else {
      console.log('[Database] ✅ Supabase connection successful');
      console.log('[Database] ✅ Tables are accessible');
    }
  } catch (error) {
    console.error('[Database] ❌ Failed to test connection:', error);
  }
})();

console.log('[Database] ✅ Supabase client initialized');

