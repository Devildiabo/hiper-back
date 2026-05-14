/**
 * SCRIPT DE POPULAÇÃO - BASE DE OURO (LAB) - VERSÃO COMPLETA (25+ PERGUNTAS)
 */

import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import * as dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

const GOLD_LIST = [
  // --- PAGAMENTOS ---
  {
    question: "Quais bandeiras de cartões vocês aceitam no Hiper Select?",
    content: "Aceitamos: Alelo, Amex, Banricompras, Banricard, Ben, Cabal, Diners, Elo, JCB, LeCard, Maestro, MasterCard, Personal Card, PicPay, Pix, Senff, Sodexo, Sorocred, Ticket, Tricard, Rede Shop, Calcard, Credsystem, Policard, BIQ, Cooper Card, Auxílio Emergencial, HiperBom, Hiper, Eucard, Good Card, GreenCard, Trio Card, Vegas, Visa, Hipercard, Util, VerdeCard e VR Benefícios.",
    metadata: { category: "payment", type: "list" }
  },
  {
    question: "Aceita Alelo, Sodexo, Ticket ou VR?",
    content: "Sim, aceitamos as principais bandeiras de vale-alimentação e refeição, incluindo Alelo, Sodexo, Ticket e VR Benefícios, tanto no caixa físico quanto no site.",
    metadata: { category: "payment", type: "voucher" }
  },
  {
    question: "Vocês aceitam PIX?",
    content: "Sim, aceitamos PIX como forma de pagamento nos caixas das lojas físicas e também em pedidos de delivery.",
    metadata: { category: "payment", type: "pix" }
  },
  {
    question: "Dá para pagar por aproximação (Apple Pay/Google Pay)?",
    content: "Sim, aceitamos pagamentos por aproximação via celular, relógio ou cartões Contactless em todas as nossas unidades.",
    metadata: { category: "payment", type: "contactless" }
  },
  {
    question: "Aceita vale-alimentação no site oficial?",
    content: "Sim, nosso site oficial aceita o pagamento com vale-alimentação das principais bandeiras.",
    metadata: { category: "payment", type: "ecommerce_voucher" }
  },

  // --- SUPORTE & TROCAS ---
  {
    question: "Comprei um pão mofado, estragado ou produto vencido.",
    content: "Pedimos desculpas pelo ocorrido. Se a compra foi pelo iFood, acione o suporte no próprio app. Se foi pelo site oficial, ligue para (48) 99174-6702. Para loja física, use sac@hiperselect.com.br.",
    metadata: { category: "support", type: "complaint" }
  },
  {
    question: "Como peço estorno ou reembolso de um produto ruim?",
    content: "Para solicitar estornos ou reembolsos de produtos com problemas, envie um e-mail para sac@hiperselect.com.br com os dados da compra.",
    metadata: { category: "support", type: "refund" }
  },
  {
    question: "Meu pedido do iFood veio errado ou incompleto.",
    content: "Problemas com pedidos iFood devem ser resolvidos diretamente pelo suporte dentro do aplicativo iFood.",
    metadata: { category: "support", type: "ifood_error" }
  },
  {
    question: "Meu pedido do site oficial veio faltando itens.",
    content: "Se o seu pedido feito pelo nosso site oficial veio incompleto, ligue imediatamente para o número (48) 99174-6702.",
    metadata: { category: "support", type: "site_error" }
  },
  {
    question: "Quanto tempo tenho para devolver um produto do site?",
    content: "Você tem um prazo de até 3 dias após o recebimento para realizar a troca ou devolução de itens comprados no site oficial.",
    metadata: { category: "support", type: "return_policy" }
  },

  // --- LOGÍSTICA & ENTREGAS ---
  {
    question: "Faz entrega na Palhoça / Ilha / Bairro X?",
    content: "Nossa área de entrega é dinâmica. O canal oficial para confirmar se entregamos no seu endereço é inserindo seu CEP no site oficial ou no iFood.",
    metadata: { category: "delivery", type: "area_check" }
  },
  {
    question: "Qual o valor mínimo para entrega?",
    content: "O valor mínimo varia por canal: No iFood o pedido mínimo é R$50,00. No site oficial Hiper Select, o mínimo é R$80,00.",
    metadata: { category: "delivery", type: "minimum_value" }
  },
  {
    question: "Posso comprar online e retirar na loja?",
    content: "Compras pelo site oficial podem ser retiradas apenas na loja Rio Tavares. No iFood, a retirada está disponível na unidade mais próxima que oferecer essa opção no app.",
    metadata: { category: "delivery", type: "pickup" }
  },

  // --- CLUBE SELECT & CASHBACK ---
  {
    question: "Como funciona o cashback?",
    content: "Nosso sistema de cashback permite acumular saldo em compras identificadas. Confira o regulamento em: https://hiperselect.com.br/2851/regulamento-cashback",
    metadata: { category: "loyalty", type: "cashback" }
  },
  {
    question: "Onde vejo meu saldo de cashback?",
    content: "Seu saldo de cashback fica disponível na aba 'Cashback' dentro do aplicativo 'Clube Select'.",
    metadata: { category: "loyalty", type: "cashback_view" }
  },
  {
    question: "Como recupero minha senha do aplicativo Clube Select?",
    content: "Caso não consiga recuperar sua senha ou não receba o código no e-mail, entre em contato com nosso SAC pelo e-mail sac@hiperselect.com.br.",
    metadata: { category: "loyalty", type: "app_password" }
  },
  {
    question: "Não recebi o código de confirmação do app no meu e-mail.",
    content: "Se o código de confirmação não chegou, verifique a caixa de spam ou entre em contato com o SAC: sac@hiperselect.com.br.",
    metadata: { category: "loyalty", type: "app_support" }
  },
  {
    question: "Como ativo os descontos exclusivos no caixa?",
    content: "Para garantir os descontos, baixe o app Clube Select, faça o cadastro e informe seu CPF no caixa antes de passar os produtos.",
    metadata: { category: "loyalty", type: "discounts" }
  },

  // --- RH & INSTITUCIONAL ---
  {
    question: "Onde mando meu currículo ou vejo vagas?",
    content: "Currículos podem ser enviados para o e-mail Rh@hiperselect.com.br ou pelo WhatsApp de recrutamento: (48) 99169-1345.",
    metadata: { category: "hr", type: "jobs" }
  },
  {
    question: "Como faço uma reclamação do atendimento ou de funcionário?",
    content: "Registramos todas as reclamações e sugestões através do nosso canal oficial de SAC: sac@hiperselect.com.br.",
    metadata: { category: "support", type: "complaint" }
  },
  {
    question: "A loja tem estacionamento?",
    content: "A maioria de nossas unidades possui estacionamento próprio. Para confirmar em uma loja específica, por favor, ligue para a unidade desejada.",
    metadata: { category: "store", type: "amenity" }
  },

  // --- ATENDIMENTO HUMANO ---
  {
    question: "Quero falar com um atendente humano agora.",
    content: "Estou te transferindo agora mesmo para um de nossos especialistas humanos. Por favor, aguarde um instante.",
    metadata: { category: "support", type: "human_transfer" }
  },
  {
    question: "A IA não está me ajudando, preciso de uma pessoa.",
    content: "Entendo perfeitamente. Vou te conectar com nossa equipe de atendimento agora para resolvermos isso.",
    metadata: { category: "support", type: "human_transfer" }
  },

  // --- OMNICANALIDADE ---
  {
    question: "Quero o telefone de uma loja específica.",
    content: "Você pode encontrar o telefone de todas as nossas unidades em nosso site ou me perguntar o nome do bairro que eu te informo agora mesmo.",
    metadata: { category: "store", type: "phone" }
  },
  {
    question: "Tem promoção de cerveja ou ofertas hoje?",
    content: "As ofertas são atualizadas diariamente. Você pode conferir as promoções em tempo real no App 'Clube Select', no nosso site ou no iFood.",
    metadata: { category: "promo", type: "inquiry" }
  }
];

async function populate() {
  console.log('🚀 Iniciando população da Base de Ouro (LAB) - Versão 25 Perguntas...');

  for (const item of GOLD_LIST) {
    console.log(`- Processando: ${item.question}`);
    
    const embeddingResponse = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: item.question,
    });

    const embedding = embeddingResponse.data[0].embedding;

    const { error } = await supabase
      .from('knowledge_lab')
      .insert({
        question: item.question,
        content: item.content,
        embedding: embedding,
        metadata: item.metadata
      });

    if (error) {
      console.error(`❌ Erro ao inserir "${item.question}":`, error.message);
    }
  }

  console.log('✅ Base de Ouro populada com sucesso!');
}

populate().catch(console.error);
