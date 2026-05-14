import { createOpenAI } from '@ai-sdk/openai';
import { generateText } from 'ai';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function runTest(testName: string, userMessage: string, context: string, intent: string) {
    console.log(`\n=== TESTE: ${testName} ===`);
    console.log(`Mensagem: "${userMessage}"`);
    console.log(`Contexto Técnico: "${context}"`);

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
            model: openai('gpt-4o-mini'), // Usando mini aqui para o script de teste local ser rápido
            prompt,
        });
        console.log(`Resposta IA: "${text}"`);
    } catch (e: any) {
        console.error(`Erro: ${e.message}`);
    }
}

async function start() {
    // 1. Saudação
    await runTest(
        "Saudação",
        "oi tudo bem?",
        "Apenas uma saudação inicial. Seja cordial e pergunte como pode ajudar.",
        "SALUTATION"
    );

    // 2. Onde fica (Sem loja)
    await runTest(
        "Endereço Vago",
        "Onde fica a loja de vocês?",
        "Para te passar as informações corretas, preciso saber em qual de nossas lojas você gostaria de consultar.",
        "STORE_INFO"
    );

    // 3. Endereço Específico (Só endereço)
    await runTest(
        "Endereço Específico",
        "Qual o endereço da loja do Canto da Lagoa?",
        "Unidade: Canto da Lagoa. Endereço: Rua Laurindo Januário da Silveira, 2000. Horário: 08:00 às 22:00.",
        "STORE_INFO"
    );

    // 4. Cashback/Saldo
    await runTest(
        "Cashback",
        "Como vejo meu saldo do clube?",
        "Basta acessar o APP 'Clube Select', entrar com seu login e senha e acessar a aba 'Cashback'.",
        "FAQ_QUERY"
    );

    // 5. Reclamação
    await runTest(
        "Reclamação",
        "Meu pedido veio todo errado!",
        "Transferência para atendimento humano.",
        "URGENT_COMPLAINT"
    );
}

start();
