
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import dotenv from 'dotenv';

dotenv.config({ path: './.env' });

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

async function addKnowledge() {
  const content = `TAGS: taxa, entrega, delivery, valor, custo, frete, checkout, rio tavares, campeche
PERGUNTA: Qual o valor da taxa de entrega para o meu endereço?
RESPOSTA: O valor da taxa de entrega é calculado automaticamente no momento da finalização do pedido em nosso site ou aplicativo iFood, pois pode variar conforme a localização e o horário selecionado. Por exemplo, entregas para regiões como Rio Tavares e Campeche costumam variar em torno de R$ 12,90 dependendo do slot de horário. Para conferir o valor exato, basta simular o fechamento do pedido informando seu endereço. Se precisar de uma mãozinha, chama a gente pelo número (48) 99174-6702. 💚`;

  console.log('Gerando embedding...');
  const embeddingRes = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: content,
  });
  const embedding = embeddingRes.data[0].embedding;

  console.log('Salvando no banco...');
  const { data, error } = await supabase
    .from('knowledge_base')
    .insert({
      content,
      content_embedding: embedding,
      metadata: { source: 'Taxas de Entrega', category: 'delivery' }
    })
    .select()
    .single();

  if (error) {
    console.error('Erro:', error);
  } else {
    console.log('Sucesso! Item adicionado com ID:', data.id);
  }
}

addKnowledge();
