import axios from 'axios';

/**
 * AI QUALITY & LOAD TEST - HIPER SELECT
 * Este script dispara as perguntas da Base de Ouro para validar a precisão do RAG e do Router.
 */

const TEST_ENDPOINT = 'http://localhost:3005/api/whatsapp/debug/load-test'; // Ajuste conforme seu endpoint

const TEST_CASES = [
  { name: "Pagamento/Cartões", question: "Quais cartões vcs aceitam no mercado?" },
  { name: "Pagamento/Pix", question: "Aceita pix no delivery?" },
  { name: "Pagamento/Voucher", question: "Dá pra pagar com Ticket ou Alelo no site?" },
  { name: "Suporte/Mofado", question: "comprei um pão mofadu oq eu fasso agr?" },
  { name: "Suporte/Erro iFood", question: "meu pedido do ifood veio errado" },
  { name: "Suporte/Erro Site", question: "faltou item na minha compra que fiz no site" },
  { name: "Logística/Palhoça", question: "faz entrega na palhoça ou so na ilha?" },
  { name: "Logística/Valor Mínimo", question: "qual o valor minimo pra entrega no site?" },
  { name: "Logística/Retirada", question: "posso comprar online e retirar na loja da armação?" },
  { name: "Fidelidade/Cashback", question: "como funciona esse negócio de cashback?" },
  { name: "Fidelidade/Senha", question: "nao consigo recuperar minha senha do app clube select" },
  { name: "Fidelidade/Ativar", question: "como eu ganho os descontos do clube select no caixa?" },
  { name: "RH/Vagas", question: "vcs tem vaga de emprego aberta? onde mando curriculo?" },
  { name: "Loja/Estacionamento", question: "loja da lagoa tem estacionamento?" },
  { name: "Loja/Telefone", question: "qual o numero de telefone da loja do centro?" },
  { name: "Humano/Direto", question: "quero falar com um atendente agora" },
  { name: "Humano/Frustração", question: "a ia nao ta ajudando, passa pra uma pessoa" },
  { name: "Omni/Promo", question: "tem promo de cerveja hoje?" },
  { name: "Geral/Aproximação", question: "aceita pagar com o celular por aproximação?" },
  { name: "Geral/Devolução", question: "quanto tempo tenho pra devolver algo que comprei no site?" }
];

async function runTest() {
  console.log('🧪 Iniciando Teste de Qualidade da IA (Hiper Select)...');
  console.log(`📡 Endpoint: ${TEST_ENDPOINT}\n`);

  for (let i = 0; i < TEST_CASES.length; i++) {
    const test = TEST_CASES[i];
    const uniquePhone = `55489000${(i + 1).toString().padStart(4, '0')}`;
    const uniqueName = `TestUser_${i + 1}`;

    console.log(`[TESTE ${i + 1}] ${test.name}`);
    console.log(`[USER]  ${uniqueName} (${uniquePhone}): ${test.question}`);
    
    try {
      const response = await axios.post(TEST_ENDPOINT, {
        message: test.question,
        phone: uniquePhone,
        name: uniqueName
      });

      console.log(`[SYS]   ${response.data.message}`);
      console.log('--------------------------------------------------');
    } catch (error: any) {
      console.error(`❌ Erro no teste "${test.name}":`, error.response?.data || error.message);
    }

    // Pequeno delay para não atropelar o processamento
    await new Promise(resolve => setTimeout(resolve, 1500));
  }

  console.log('\n✅ Teste de Qualidade Finalizado!');
}

runTest().catch(console.error);
