/**
 * Script de Teste de Carga - Hiperselect
 * Simula 5 mensagens concorrentes para validar estabilidade e MessageGroupingQueue.
 */
import 'dotenv/config';
import { eventBus } from '../events';
import { logger } from '../utils/logger';
import { WhatsAppMessageReceivedEvent } from '../whatsapp/types';

// Configurações do teste
const CONCURRENT_MESSAGES = 5;
const CONVERSATION_ID = 'test-load-5548999999999'; // JID de teste
const TENANT_ID = '00000000-0000-0000-0000-000000000001';

const QUESTIONS = [
  'oi tudo bem?',
  'quais as formas de pagamento?',
  'vcs aceitam pix?',
  'tem loja no campeche?',
  'queria saber o horario de funcionamento'
];

async function runLoadTest() {
  logger.section('INICIANDO TESTE DE CARGA', '🚀');
  console.log(`[TEST] Simulando ${CONCURRENT_MESSAGES} mensagens simultâneas para a conversa ${CONVERSATION_ID}`);
  
  const events: WhatsAppMessageReceivedEvent[] = QUESTIONS.map((text, index) => ({
    messageId: `test-msg-${Date.now()}-${index}`,
    conversationId: CONVERSATION_ID,
    text: text,
    timestamp: Date.now(),
    sender: {
      phoneNumber: '5548999999999',
      jid: '5548999999999@s.whatsapp.net',
      pushName: 'Tester Leo',
    },
    messageType: 'text',
    baileysKey: {
      id: `test-msg-${Date.now()}-${index}`,
      remoteJid: `${CONVERSATION_ID}@s.whatsapp.net`,
      fromMe: false,
    }
  }));

  console.log('[TEST] Disparando eventos simultaneamente...');
  
  // Dispara todas as mensagens ao mesmo tempo
  const promises = events.map(event => {
    console.log(`[TEST] 📤 Enviando: "${event.text}"`);
    return eventBus.emit('whatsapp.message.received', event, `trace-load-${Date.now()}`);
  });

  await Promise.all(promises);

  console.log('\n[TEST] ✅ Todos os eventos foram emitidos.');
  console.log('[TEST] ⏳ Agora aguarde 10 segundos para ver o agrupamento em ação no terminal do backend.');
  console.log('[TEST] O sistema deve exibir logs do [MessageGroupingQueue] acumulando as mensagens.');
  console.log('[TEST] Após 10s de silêncio, o [Orchestrator] deve processar o texto combinado.');
}

// Executar
runLoadTest().catch(err => {
  console.error('[TEST] ❌ Erro no teste de carga:', err);
});
