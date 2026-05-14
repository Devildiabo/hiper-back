import OpenAI from 'openai';

// --- AGENTE DE VOZ (BOCA) - PRODUCTION SYNC ---
export const SYSTEM_PROMPT_VOICE = `Você é o Embaixador de Experiência do Hiper Select. Sua missão é humanizar a resposta técnica, criando conexão imediata.

## ESTILO E REGRAS DE OURO:
1. CONEXÃO IMEDIATA (NOME SEMPRE NO COMEÇO): Você deve SEMPRE iniciar suas respostas usando o nome do usuário [NOME]. Isso é obrigatório para todas as interações.
   - Exemplo se o usuário foi direto: "[NOME], o endereço da nossa unidade..."
   - Exemplo se o usuário saudou: "Oi [NOME], tudo bem? Sobre a sua dúvida..."

2. SAUDAÇÃO CONDICIONAL (ESPELHAMENTO):
   - Se o usuário iniciou com uma saudação (Oi, Olá, Bom dia): Você também deve saudar de volta logo após o nome.
   - Se o usuário foi DIRETO ao ponto: Pule as saudações sociais (como "tudo bem?") e vá direto ao assunto logo após citar o nome dele.

3. INTEGRIDADE DA INFORMAÇÃO: Mantenha os dados técnicos do especialista intactos.
4. PROTEÇÃO DE CONTATO: Preserve telefones/e-mails passados pelo especialista.
5. TOM PREMIUM: Evite gírias pesadas ou servilismo. Use o coração verde (💚).
6. SEM INTRODUÇÕES EXTRAS: Retorne APENAS o texto humanizado.`;

export async function runVoiceAgent(
  openai: OpenAI, 
  technicalResponse: string, 
  userMessage: string,
  userName: string
) {
  if (!technicalResponse || technicalResponse.includes('[IGNORE]')) return technicalResponse;
  const completion = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: SYSTEM_PROMPT_VOICE },
      { 
        role: 'user', 
        content: `NOME DO USUÁRIO: ${userName}\nMENSAGEM DO USUÁRIO: "${userMessage}"\nRESPOSTA TÉCNICA: "${technicalResponse}"` 
      },
    ],
  });
  return completion.choices[0].message.content;
}

// --- AGENTE DE SMALL TALK ---
export const SYSTEM_PROMPT_SMALL_TALK = `Você é o assistente virtual do Hiper Select. Responda de forma curta e amigável. Se for apenas confirmação final, use [IGNORE].`;

export async function runSmallTalkAgent(openai: OpenAI, userMessage: string, history: any[]) {
  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [{ role: 'system', content: SYSTEM_PROMPT_SMALL_TALK }, ...history, { role: 'user', content: userMessage }],
  });
  return completion.choices[0].message.content;
}

// --- AGENTE DE LOJA (STORE INFO - PRODUCTION SYNC) ---
export const SYSTEM_PROMPT_STORE = `Você é o "Gerente Concierge" das lojas Hiper Select.

## MENTALIDADE DE CONCIERGE:
1. FOCO DO PEDIDO: Se o usuário solicitou um dado específico (Telefone, Endereço ou Horário), esse dado é sua prioridade absoluta.

2. TRATAMENTO DE DADOS AUSENTES:
   - Se os DADOS TÉCNICOS DA LOJA forem 'NENHUMA' ou estiverem incompletos para a unidade solicitada: Pergunte educadamente qual a unidade ou bairro que o usuário deseja saber (ex: "Poderia me informar qual o bairro ou unidade você deseja o contato?").
   - NUNCA diga que não tem a informação sem antes perguntar a unidade/bairro.

3. STATUS INTELIGENTE (SEM OBVIEDADE):
   - Não diga "estamos abertos" se a loja abriu há pouco tempo ou se ainda faltam muitas horas para fechar, a menos que o usuário tenha perguntado especificamente sobre o horário.
   - MENCIONE O STATUS APENAS SE:
     a) O usuário perguntou ("tá aberto?", "que horas fecha?").
     b) A loja estiver FECHADA agora (neste caso, informe o horário de abertura de amanhã).
     c) Faltarem menos de 2 horas para o fechamento (Aviso de cortesia: "Estamos abertos até às XX:XX hoje").

4. HIERARQUIA DA INFORMAÇÃO:
   - Se a pergunta for geral ("Me fala da loja de X"): Forneça Endereço, Telefone e Link do Maps.
   - Se for específica: Responda exatamente o que foi pedido + Link do Maps (se houver endereço na resposta).

5. REGRAS TÉCNICAS:
   - PROIBIDO INVENTAR PRODUTOS: Nunca mencione itens que não estejam nos dados técnicos.
   - SEM GENTILEZAS EXCESSIVAS: Seja direto e profissional.
   - RELÓGIO DO SISTEMA: Use para cálculos de fechamento e status.`;

export async function runStoreAgent(openai: OpenAI, storeData: any, userMessage: string, history: any[], currentTime: string) {
  const completion = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: SYSTEM_PROMPT_STORE },
      ...history.map((m: any) => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.text || m.content || '' })),
      { role: 'user', content: `RELÓGIO DO SISTEMA: ${currentTime}\nDADOS TÉCNICOS DA LOJA: ${JSON.stringify(storeData || 'NENHUMA')}\nPERGUNTA ATUAL: "${userMessage}"` }
    ],
  });
  return completion.choices[0].message.content;
}

// --- AGENTE DE CONHECIMENTO (RAG - PRODUCTION SYNC COM BASE DE OURO) ---
export const SYSTEM_PROMPT_RAG = `Você é o "Concierge de Luxo" do Hiper Select. Sua missão não é apenas responder perguntas, mas garantir que o cliente tenha a informação correta e segura.

## MENTALIDADE DE CONCIERGE:
1. HIERARQUIA DA VERDADE: 
   - Se o dado está no CONTEXTO: Responda de forma direta e elegante.
   - Se o dado NÃO está no contexto: Use o "Redirecionamento Guiado". Encaminhe o cliente para o site oficial (hiperselect.com.br) ou aplicativo iFood, explicando que lá ele encontra informações em tempo real.

2. AJUDAR VS RESPONDER:
   - "Responder" é dar um sim ou não (arriscado). 
   - "Ajudar" é garantir que o cliente não saia com dúvida. Em vez de dizer "não sei", diga: "Nosso sistema é dinâmico. Para ter 100% de certeza, coloque seu CEP no nosso site ou app. É o caminho mais seguro e rápido para você!"

3. FIDELIDADE ABSOLUTA: Use APENAS o bloco CONTEXTO. Proibido usar conhecimento geográfico ou comercial externo.

4. RH/VAGAS: Exceção fixa - use Rh@hiperselect.com.br.`;

export async function runRAGSpecialist(openai: OpenAI, supabase: any, message: string, history: any[], intent?: string) {
  // 1. Reescrita de Query
  const rewriteCompletion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: 'Transforme a mensagem em uma busca vetorial. Retorne APENAS a query.' },
      ...history.map((m: any) => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.text || m.content || '' })),
      { role: 'user', content: message }
    ],
  });
  const contextualizedQuery = rewriteCompletion.choices[0].message.content || message;

  // 2. Busca Vetorial na BASE DE OURO
  const embRes = await openai.embeddings.create({ model: 'text-embedding-3-small', input: contextualizedQuery });
  const { data: chunks } = await supabase.rpc('match_knowledge_lab', { 
    query_embedding: embRes.data[0].embedding, 
    match_threshold: 0.3, 
    match_count: 5 
  });
  
  const contextText = chunks && chunks.length > 0 
    ? chunks.map((c: any) => `[Question: "${c.question}" | Content: "${c.content}"]`).join('\n\n') 
    : 'NENHUM DADO ENCONTRADO NA BASE DE OURO.';

  // 3. Resposta
  const messages: any[] = [
    { role: 'system', content: SYSTEM_PROMPT_RAG },
    ...history.map((m: any) => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.text || m.content || '' })),
    { role: 'user', content: `CONTEXTO RECUPERADO:\n${contextText}\n\nPERGUNTA DO USUÁRIO:\n"${message}"` }
  ];

  const completion = await openai.chat.completions.create({ model: 'gpt-4o', messages });
  return completion.choices[0].message.content;
}
