/**
 * Agente Pensador - Thinking Agent (O Cérebro)
 * Versão GPT-5-NANO
 */
import { generateText } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';

export interface ThinkingInput {
  userMessage: string;
  intent: string;
  sentiment: string;
  executorData: any;
  suggestedAnswer?: string;
  currentTime?: string;
}

export class ThinkingAgent {
  private openaiProvider: any;

  constructor(private deps: { openaiApiKey: string }) {
    if (this.deps.openaiApiKey) {
      this.openaiProvider = createOpenAI({ apiKey: this.deps.openaiApiKey });
    }
  }

  /**
   * Raciocina sobre a pergunta e os dados para gerar um rascunho factual
   */
  async think(input: ThinkingInput): Promise<{ draft: string; usage: any }> {
    if (!this.openaiProvider) return { draft: "Solicitar ajuda humana.", usage: null };

    const prompt = `
<identity>
Você é o "Cérebro" do sistema de atendimento do HiperSelect. Sua função é analisar friamente os dados e a pergunta do usuário para decidir EXATAMENTE o que deve ser comunicado. Você não se preocupa com o estilo, apenas com a precisão e a lógica.
</identity>

<instructions>
1. **Ultra-Conciso**: Seu rascunho deve ter o MÍNIMO de palavras possível. Se faltar informação (ex: qual loja), apenas diga: "Pedir o bairro da loja".
2. **Sem Explicações**: Não explique por que você não sabe a resposta. Vá direto ao ponto.
3. **NÃO mencione o horário**: Nunca inclua o horário atual no rascunho, a menos que a loja esteja a menos de 1 hora de fechar.
4. **Espelhamento**: Apenas cite termos do usuário se for estritamente necessário para a lógica.
5. **Output**: Retorne apenas instruções curtas. Ex: "Pedir loja", "Informar que aceita PicPay", "Avisar que fecha às 22h".
</instructions>

<context>
- Pergunta do Usuário: ${input.userMessage}
- Intenção: ${input.intent}
- Sentimento: ${input.sentiment}
- Horário Atual: ${input.currentTime || 'N/A'}
- Dados do Sistema (Executor): ${JSON.stringify(input.executorData)}
- Conhecimento Sugerido (RAG): ${input.suggestedAnswer || 'Nenhum'}
</context>

<constraints>
- PROIBIDO: Inventar informações ou incluir o horário atual (salvo exceção de fechamento).
- PROIBIDO: Ser "educado" demais ou explicativo. Seja um cérebro técnico.
- REGRA DE OURO: Se não souber a loja, apenas diga: "Pedir o bairro da loja".
</constraints>

Retorne apenas o rascunho factual.`;

    try {
      const result = await generateText({
        model: this.openaiProvider('gpt-5-nano'),
        prompt
      });

      const { text, usage } = result;

      return {
        draft: text.trim(),
        usage: {
          totalTokens: usage.totalTokens,
          promptTokens: (usage as any).promptTokens,
          completionTokens: (usage as any).completionTokens
        }
      };
    } catch (error: any) {
      console.error(`[DEBUG-IA] ❌ Erro no Pensador: ${error.message}`);
      return {
        draft: "Ocorreu um erro no processamento lógico. Encaminhar para humano.",
        usage: { totalTokens: 0, promptTokens: 0, completionTokens: 0 }
      };
    }
  }
}
