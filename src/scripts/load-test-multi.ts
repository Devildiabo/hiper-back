/**
 * Script de Teste de Carga Multi-Usuário - Hiperselect
 * Simula 5 mensagens concorrentes de 5 NÚMEROS DIFERENTES.
 * Objetivo: Verificar se o sistema processa múltiplas conversas em paralelo sem misturar os contextos.
 */
import 'dotenv/config';
import { eventBus } from '../events';
import { logger } from '../utils/logger';
import { WhatsAppMessageReceivedEvent } from '../whatsapp/types';

// Configurações do teste
const USERS = [
  { id: '5548000000001', name: 'Cliente A', text: 'Quais as formas de pagamento?' },
  { id: '5548000000002', name: 'Cliente B', text: 'Vocês aceitam pix?' },
  { id: '5548000000003', name: 'Cliente C', text: 'Onde fica a loja do Campeche?' },
  { id: '5548000000004', name: 'Cliente D', text: 'Qual o horário de funcionamento?' },
  { id: '5548000000005', name: 'Cliente E', text: 'Como funciona o cashback?' }
];

const TENANT_ID = '00000000-0000-0000-0000-000000000001';

async function runMultiUserLoadTest() {
  logger.section('TESTE DE CARGA MULTI-USUÁRIO', '👥');
  console.log(`[TEST] Simulando ${USERS.length} usuários diferentes enviando mensagens ao mesmo tempo.`);
  
  const events: WhatsAppMessageReceivedEvent[] = USERS.map((user, index) => ({
    messageId: `test-multi-msg-${Date.now()}-${index}`,
    conversationId: user.id,
    text: user.text,
    timestamp: Date.now(),
    sender: {
      phoneNumber: user.id,
      jid: `${user.id}@s.whatsapp.net`,
      pushName: user.name,
    },
    messageType: 'text',
    baileysKey: {
      id: `test-multi-msg-${Date.now()}-${index}`,
      remoteJid: `${user.id}@s.whatsapp.net`,
      fromMe: false,
    }
  }));

  console.log('[TEST] Disparando eventos para múltiplos usuários simultaneamente...');
  
  const promises = events.map(event => {
    console.log(`[TEST] 📤 Usuário ${event.conversationId} (${event.sender.pushName}): "${event.text}"`);
    return eventBus.emit('whatsapp.message.received', event, `trace-multi-${Date.now()}-${event.conversationId}`);
  });

  await Promise.all(promises);

  console.log('\n[TEST] ✅ Todos os eventos foram emitidos.');
  console.log('[TEST] O sistema deve criar 5 grupos de agrupamento separados no [MessageGroupingQueue].');
  console.log('[TEST] Cada conversa terá seu próprio timer de 10s independente.');
  console.log('[TEST] Após 10s, a IA processará 5 respostas em paralelo.');
}

// Executar
runMultiUserLoadTest().catch(err => {
  console.error('[TEST] ❌ Erro no teste multi-usuário:', err);
});
