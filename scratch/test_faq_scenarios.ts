import { createOpenAI } from '@ai-sdk/openai';
import { generateText } from 'ai';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function runTest(testName: string, userMessage: string, context: string, intent: string) {
    console.log(`\n=== TESTE: ${testName} ===`);
    console.log(`Mensagem: "${userMessage}"`);

    const prompt = `
<identity>
Você é um atendente ágil e prestativo do HiperSelect. Sua comunicação deve ser natural, direta e sem enrolação, como se estivesse conversando rapidamente no balcão da loja.
</identity>

<instructions>
1. **Naturalidade**: Use um português do dia a dia (PT-BR neutro). Evite termos robóticos como "unidade habitual", "melhor orientação" ou "procedimentos".
2. **Foco Total**: Responda APENAS o que foi perguntado. Se o usuário perguntou "onde fica", não mencione horário. Se perguntou "preço", não mencione entrega.
3. **Greeting Protocol**: Se o usuário te deu um "oi", responda com um "Oi!" ou "Olá!". Se a conversa já está rolando, vá direto ao ponto.
4. **Curto e Grosso**: Otimize para leitura rápida no WhatsApp. Máximo de 2 frases curtas.
5. **Sem Emojis**: Mantenha o padrão da marca, sem ícones ou emojis.
</instructions>

<constraints>
- PROIBIDO: Inventar informações.
- PROIBIDO: Usar termos formais demais ou robóticos.
- REGRA DE OURO: Se precisar de uma informação (ex: qual loja), peça de forma simples: "Qual loja você gostaria de saber?" ou "Em qual bairro?".
</constraints>

<context>
- Client Name: Leo
- Raw Intent: ${intent}
- Client Tone: NEUTRAL
- Original Message: ${userMessage}
- Source of Truth (FAQ): ${context}
</context>

<output_format>
Return only the final message text in Portuguese (PT-BR). No explanations or markdown tags.
</output_format>`;

    try {
        const { text } = await generateText({
            model: openai('gpt-4o-mini'),
            prompt,
        });
        console.log(`Resposta IA: "${text}"`);
    } catch (e: any) {
        console.error(`Erro: ${e.message}`);
    }
}

async function start() {
    // 1. Pagamento específico
    await runTest(
        "Bandeira Sodexo",
        "Aceitam Sodexo?",
        "Aceitamos Vouchers (Ticket, Alelo e Sodexo) tanto no site oficial quanto nas lojas físicas.",
        "FAQ_QUERY"
    );

    // 2. Mínimo Site
    await runTest(
        "Mínimo Site",
        "Qual o valor mínimo pra entrega do site?",
        "O pedido mínimo para compras no nosso site oficial é a partir de R$ 80,00.",
        "FAQ_QUERY"
    );

    // 3. Problema App
    await runTest(
        "Problema App",
        "Meu código de confirmação não chega no e-mail, como recupero a senha?",
        "Nesse caso, por favor entre em contato com o nosso SAC pelo e-mail: sac@hiperselect.com.br",
        "FAQ_QUERY"
    );

    // 4. RH
    await runTest(
        "RH/Emprego",
        "Onde mando meu currículo?",
        "Os currículos podem ser enviados para o e-mail Rh@hiperselect.com.br ou pelo WhatsApp (48) 99169-1345.",
        "FAQ_QUERY"
    );

    // 5. Pagamento Aproximação
    await runTest(
        "Aproximação",
        "Dá pra pagar com o celular por aproximação?",
        "Sim, aceitamos pagamentos por aproximação (NFC) em todas as nossas unidades.",
        "FAQ_QUERY"
    );
}

start();
