/**
 * Intent Router - Analista Comportamental de Alta Precisão (Agentic Edition)
 */
import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';

export class IntentRouter {
  private openai: OpenAI;
  private supabase: any;

  constructor(private deps: { openaiApiKey: string }) {
    this.openai = new OpenAI({ apiKey: this.deps.openaiApiKey });
    
    this.supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
  }

  async classify(input: any): Promise<any> {
    const SYSTEM_PROMPT_ROUTER = `
# HIPERSELECT INTENT ARCHITECT 🧠
Você é o arquiteto de intenções do ecossistema HiperSelect. Sua missão é decidir qual AGENTE ESPECIALISTA deve assumir o controle.

## HIERARQUIA DE INTENÇÕES (DECISÃO CRÍTICA):
1. "FAQ_QUERY": Use para QUALQUER SERVIÇO ou PROCEDIMENTO (Entrega, Delivery, Trocas, Reembolso, Pagamento, RH, Site/App).
   - REGRA DE OURO: Se a pergunta envolver "Entrega" ou "Delivery", este agente SEMPRE ganha, mesmo que o usuário mencione um bairro.
2. "STORE_INFO": Use APENAS para dados FÍSICOS e ESTÁTICOS: Endereço, Horários, Telefone da unidade, Estacionamento ou infraestrutura (ex: "Tem farmácia?").
3. "URGENT_COMPLAINT": Use para erros em pedidos, produtos mofados/vencidos ou problemas graves.
4. "HUMAN_REQUEST": Use apenas se o cliente pedir explicitamente ou após frustração extrema.
5. "SALUTATION" / "ACKNOWLEDGMENT": Para saudações e agradecimentos.

## NORMALIZAÇÃO DE LOJAS (ENTIDADES):
Mapeie variações para os nomes oficiais abaixo no campo "store_name":
- Campeche (Variações: Campexe, Canpeche, Sul da Ilha)
- Rio Tavares (Variações: RT, Tavares, Pedrita)
- Centro (Variações: Downtown, Deodoro, Centro Floripa)
- Córrego Grande (Variações: Corrego, UFSC)
- Lagoa (Variações: Lagoa da Conceição, Centrinho)
- Armação (Variações: Armaçao, Matadeiro)
- Carianos (Variações: Aeroporto)

## CONTEXTO OPERACIONAL:
- ANTI-PÂNICO: Mantenha em URGENT_COMPLAINT para que o Especialista RAG possa dar a instrução técnica primeiro.
- Anti-Loop: Se o cliente estiver repetindo a mesma pergunta, sinalize no reasoning.

## REGRAS DE SAÍDA (JSON):
- "intent": Nome exato do agente.
- "subject": O tópico principal normalizado (Nome da loja se for STORE_INFO, ou o assunto se for FAQ).
- "sentiment": "POSITIVE", "NEUTRAL" ou "NEGATIVE".
- "confidence": 0.0 a 1.0.
- "reasoning": Por que escolheu esse agente? (Seja breve).
- "entities": { "store_name": "Nome oficial da loja ou null" }

Responda APENAS o JSON.
`;

    const history = input.messageHistory || [];

    try {
      const completion = await this.openai.chat.completions.create({
        model: 'gpt-4o',
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT_ROUTER },
          ...history.map((m: any) => ({
            role: m.role === 'user' ? 'user' : 'assistant',
            content: m.text || m.content || ''
          })),
          { role: 'user', content: input.messageText },
        ],
      });

      const result = JSON.parse(completion.choices[0].message.content || '{}');
      
      // Log de Depuração (X-RAY)
      console.log(`[DEBUG-IA] 🧠 [ROUTER] ✅ Intenção: ${result.intent} | Subj: ${result.subject}`);
      
      return result;
    } catch (error: any) {
      console.error(`[DEBUG-IA] ❌ Erro no Router: ${error.message}`);
      return { intent: 'UNKNOWN', confidence: 0 };
    }
  }
}
