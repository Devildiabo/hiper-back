/**
 * Media Processor - Estabilizado (Apenas OpenAI)
 * Foco: Transcrição (Whisper) e Visão (GPT-4o-mini)
 */
import OpenAI from 'openai';
import { generateText } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';

export class MediaProcessor {
  private openai: OpenAI;
  private openaiAI: any;

  constructor(private deps: { openaiApiKey: string }) {
    this.openai = new OpenAI({ apiKey: deps.openaiApiKey });
    this.openaiAI = createOpenAI({ apiKey: deps.openaiApiKey });
  }

  async processMedia(media: any, baileysMessage: any): Promise<string | null> {
    const mimeType = media.mimetype || '';

    // ÁUDIO: Whisper (OpenAI)
    if (mimeType.startsWith('audio/')) {
      try {
        console.log(`[DEBUG-IA] 🎙️ [OPENAI] Transcrevendo com Whisper...`);
        // Aqui viria a lógica de download + whisper
        return "Transcrição via Whisper (Placeholder)";
      } catch (error) {
        return null;
      }
    }

    // IMAGEM: GPT-4o-mini (OpenAI Vision)
    if (mimeType.startsWith('image/')) {
      try {
        console.log(`[DEBUG-IA] 📷 [OPENAI] Analisando imagem com GPT-4o-mini...`);
        const { text } = await generateText({
          model: this.openaiAI('gpt-4o-mini'),
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: 'Descreva os produtos desta imagem de supermercado.' },
                // Imagem seria anexada aqui via base64 após o download
              ]
            }
          ]
        });
        return text;
      } catch (error: any) {
        console.error(`[DEBUG-IA] ❌ [OPENAI] Erro na visão: ${error.message}`);
        return null;
      }
    }

    return null;
  }
}
