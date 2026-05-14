/**
 * Agente Boca - Humanizer (Versão GPT-5-NANO)
 */
import { generateText } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';

export class Humanizer {
  private openaiProvider: any;

  constructor(private deps: { openaiApiKey: string }) {
    if (this.deps.openaiApiKey) {
      this.openaiProvider = createOpenAI({ apiKey: this.deps.openaiApiKey });
    }
  }
  async humanize(input: {
    userName: string;
    userMessage: string;
    thinkingDraft: string;
    currentTime?: string;
    closingTime?: string;
    intent: string;
  }): Promise<{ text: string; usage: any }> {
    if (!this.openaiProvider) return { text: "Em que posso ajudar hoje? 😊", usage: null };

    const prompt = `
<identity>
Você é o "Agente Boca", o carismático atendente manezinho do HiperSelect. Sua única função é dar "voz" e "estilo" ao rascunho técnico que você recebeu.
</identity>

<instructions>
1. **Curto e Direto (WhatsApp Style)**: Sua resposta deve ser o mais curta possível. Idealmente apenas 1 frase. 
2. **Transformação de Estilo**: Pegue o "Rascunho do Pensador" e transforme em uma fala natural de balcão.
3. **Personalização**: Use o nome do cliente (${input.userName || 'Cliente'}) apenas uma vez.
4. **Saudação Condicional**: "Oi [Nome]," ou "Olá [Nome]," APENAS se o usuário cumprimentou. Se não, comece direto pelo nome.
5. **Tom Manezinho**: Use "Mas ó", "fica atento", "olha só" apenas se couber na frase curta.
6. **ZERO Enrolação**: Não repita o que o Pensador disse se for óbvio. Vá direto para a pergunta ou resposta.
</instructions>

<input_data>
- Rascunho do Pensador (O que dizer): ${input.thinkingDraft}
- Mensagem Original do Cliente: ${input.userMessage}
- Nome do Cliente: ${input.userName || 'Cliente'}
</input_data>

Retorne apenas o texto final da mensagem em português (PT-BR).`;

    console.log(`[DEBUG-IA] 🗣️ [OPENAI] Humanizando com GPT-5-NANO...`);

    // X-RAY DEBUG: Mostra o prompt completo no console
    console.log("\n" + "=".repeat(60));
    console.log("🎨 [X-RAY] PROMPT ENVIADO AO BOCA:");
    console.log(prompt);
    console.log("=".repeat(60) + "\n");

    try {
      const result = await generateText({
        model: this.openaiProvider('gpt-5-nano'), 
        prompt
      });
      const { text, usage } = result;

      console.log("\n" + "=".repeat(40));
      console.log("📊 [ECONOMIA] CONSUMO DE TOKENS (BOCA)");
      console.log(`- Total: ${usage.totalTokens} tokens`);
      console.log("=".repeat(40) + "\n");

      // Sanitização de segurança para evitar vazamento de tags
      const sanitizedText = text.replace(/\{[\s\S]*\}/, '').trim() || "Em que posso ajudar?";
      
      return {
        text: sanitizedText,
        usage: {
          totalTokens: usage.totalTokens,
          promptTokens: (usage as any).promptTokens,
          completionTokens: (usage as any).completionTokens
        }
      };
    } catch (error: any) {
      console.error(`[DEBUG-IA] ❌ Erro na voz (Boca): ${error.message}`);
      return {
        text: "Um momento, já te atendemos.",
        usage: { totalTokens: 0, promptTokens: 0, completionTokens: 0 }
      };
    }
  }
}
