/**
 * Script de Sincronização de FAQ - Versão TURBO (Com Keywords)
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { embed } from 'ai';
import { openai } from '@ai-sdk/openai';
import { FAQ_LIST } from '../ai/faq';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function sync() {
  console.log(`🚀 Sincronizando ${FAQ_LIST.length} itens com Keywords...`);

  await supabase.from('knowledge_base').delete().neq('content', 'placeholder');

  for (const item of FAQ_LIST) {
    // Agora incluímos as keywords no topo para o vetor dar um match certeiro
    const textToEmbed = `TAGS: ${item.keywords.join(', ')}\nPERGUNTA: ${item.question}\nRESPOSTA: ${item.answer}`;
    
    try {
      console.log(`📡 Vetorizando: ${item.question.substring(0, 40)}...`);
      
      const { embedding } = await embed({
        model: openai.embedding('text-embedding-3-small'),
        value: textToEmbed,
      });

      await supabase.from('knowledge_base').insert({
        content: textToEmbed,
        content_embedding: embedding,
        metadata: {
          category: item.category,
          original_question: item.question
        }
      });
    } catch (e: any) {
      console.error(`❌ Erro: ${e.message}`);
    }
  }
  console.log(`✅ Sincronização concluída!`);
}

sync();
