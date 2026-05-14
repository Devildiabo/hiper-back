import path from 'path';
import dotenv from 'dotenv';

// Forçar carregamento do .env IMEDIATAMENTE no import
const envPath = path.resolve(process.cwd(), '.env');
dotenv.config({ path: envPath });

console.log('===========================================================');
console.log(`[Pre-Bootstrap] 📂 .env loaded from: ${envPath}`);
console.log(`[Pre-Bootstrap] SUPABASE_URL: ${process.env.SUPABASE_URL ? '✅' : '❌'}`);
console.log(`[Pre-Bootstrap] USE_BULLMQ: ${process.env.USE_BULLMQ}`);
console.log('===========================================================');
