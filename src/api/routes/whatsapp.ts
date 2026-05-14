import type { FastifyInstance } from 'fastify';
import QRCode from 'qrcode';
import type { WhatsAppAdapter } from '../../whatsapp';
import { eventBus } from '../../events';
import { logger } from '../../utils/logger';

type WhatsAppRoutesDependencies = {
  whatsAppAdapter: WhatsAppAdapter;
};

export const registerWhatsAppRoutes = (
  fastify: FastifyInstance,
  deps: WhatsAppRoutesDependencies
): void => {
  console.log('[Routes] Registering WhatsApp routes...');
  
  fastify.get('/api/whatsapp/status', async (request, reply) => {
    console.log('[API] GET /api/whatsapp/status - Request received');
    try {
      const status = deps.whatsAppAdapter.getConnectionStatus();
      const qrCode = deps.whatsAppAdapter.getQRCode();
      console.log('[API] WhatsApp Status:', JSON.stringify(status, null, 2));
      console.log('[API] QR Code available:', !!qrCode);

      let qrCodeImage: string | null = null;
      if (qrCode) {
        try {
          console.log('[API] Generating QR code image...');
          qrCodeImage = await QRCode.toDataURL(qrCode);
          console.log('[API] QR code image generated successfully');
        } catch (error) {
          console.error('[API] Failed to generate QR code image:', error);
        }
      }

      const response = {
        success: true,
        data: {
          ...status,
          qrCode: qrCodeImage,
        },
      };
      console.log('[API] Returning status response');
      reply.type('application/json');
      return response;
    } catch (error) {
      console.error('[API] Error getting WhatsApp status:', error);
      console.error('Stack:', error instanceof Error ? error.stack : 'No stack');
      return reply.code(500).send({
        success: false,
        message: 'Failed to get WhatsApp status',
        errorCode: 'INTERNAL_ERROR',
      });
    }
  });

  fastify.get('/api/whatsapp/qr', async (request, reply) => {
    console.log('[API] GET /api/whatsapp/qr - Request received');
    try {
      const qrCode = deps.whatsAppAdapter.getQRCode();
      console.log('[API] QR Code available:', !!qrCode);

      let qrCodeImage: string | null = null;
      if (qrCode) {
        try {
          console.log('[API] Generating QR code image...');
          qrCodeImage = await QRCode.toDataURL(qrCode);
          console.log('[API] QR code image generated successfully');
        } catch (error) {
          console.error('[API] Failed to generate QR code image:', error);
        }
      }

      reply.type('application/json');
      return {
        success: true,
        data: {
          qrCode: qrCodeImage,
        },
      };
    } catch (error) {
      console.error('[API] Error getting QR code:', error);
      console.error('Stack:', error instanceof Error ? error.stack : 'No stack');
      return reply.code(500).send({
        success: false,
        message: 'Failed to get QR code',
        errorCode: 'INTERNAL_ERROR',
      });
    }
  });

  fastify.post('/api/whatsapp/connect', async (request, reply) => {
    console.log('[API] POST /api/whatsapp/connect - Request received');
    try {
      console.log('[API] Initiating WhatsApp connection...');
      await deps.whatsAppAdapter.connect();
      console.log('[API] WhatsApp connection initiated successfully');
      reply.type('application/json');
      return {
        success: true,
        message: 'WhatsApp connection initiated',
      };
    } catch (error) {
      console.error('[API] Error connecting WhatsApp:', error);
      console.error('Stack:', error instanceof Error ? error.stack : 'No stack');
      return reply.code(500).send({
        success: false,
        message: 'Failed to connect WhatsApp',
        errorCode: 'INTERNAL_ERROR',
      });
    }
  });

  fastify.post('/api/whatsapp/disconnect', async (request, reply) => {
    console.log('[API] POST /api/whatsapp/disconnect - Request received');
    try {
      console.log('[API] Disconnecting WhatsApp and clearing session...');
      // Desconectar e limpar sessão completamente
      deps.whatsAppAdapter.disconnectAndClearSession();
      console.log('[API] WhatsApp disconnected and session cleared successfully');
      reply.type('application/json');
      return {
        success: true,
        message: 'WhatsApp desconectado e sessão limpa. Próxima conexão exigirá novo QR code.',
      };
    } catch (error) {
      console.error('[API] Error disconnecting WhatsApp:', error);
      console.error('Stack:', error instanceof Error ? error.stack : 'No stack');
      return reply.code(500).send({
        success: false,
        message: 'Failed to disconnect WhatsApp',
        errorCode: 'INTERNAL_ERROR',
      });
    }
  });

  fastify.post('/api/whatsapp/reconnect', async (request, reply) => {
    console.log('[API] POST /api/whatsapp/reconnect - Request received');
    try {
      console.log('[API] Reconnecting WhatsApp...');
      await deps.whatsAppAdapter.reconnect();
      console.log('[API] WhatsApp reconnection initiated successfully');
      reply.type('application/json');
      return {
        success: true,
        message: 'WhatsApp reconnection initiated',
      };
    } catch (error) {
      console.error('[API] Error reconnecting WhatsApp:', error);
      console.error('Stack:', error instanceof Error ? error.stack : 'No stack');
      return reply.code(500).send({
        success: false,
        message: 'Failed to reconnect WhatsApp',
        errorCode: 'INTERNAL_ERROR',
      });
    }
  });

  // ROTA DE DEBUG: POST para teste de qualidade individual (usado pelo script scratch)
  fastify.post('/api/whatsapp/debug/load-test', async (request: any, reply) => {
    const { message, phone, name } = request.body;
    const traceId = `test-trace-${Date.now()}-${phone}`;

    logger.section('DEBUG: TESTE DE QUALIDADE INDIVIDUAL', '🧪');
    logger.info(`[Test] Recebido de ${name} (${phone}): ${message}`);

    try {
      const event = {
        messageId: `test-msg-${Date.now()}`,
        conversationId: phone,
        text: message,
        timestamp: Date.now(),
        sender: {
          phoneNumber: phone,
          jid: `${phone}@s.whatsapp.net`,
          pushName: name,
        },
        messageType: 'text' as const,
        baileysKey: {
          id: `test-msg-${Date.now()}`,
          remoteJid: `${phone}@s.whatsapp.net`,
          fromMe: false,
        }
      };

      // Emitimos o evento que o orquestrador escuta
      eventBus.emit('whatsapp.message.received', event, traceId);

      return {
        success: true,
        message: 'Mensagem enviada ao orquestrador. Verifique o Dashboard ou Logs para a resposta.',
        traceId
      };
    } catch (error: any) {
      return reply.code(500).send({
        success: false,
        message: error.message
      });
    }
  });

  // ROTA DE DEBUG: GET para teste de carga massivo
  fastify.get('/api/whatsapp/debug/load-test', async (request, reply) => {
    logger.section('DEBUG: DISPARANDO TESTE DE CARGA', '🚀');
    
    const USERS = [
      { id: '5548000000001', name: 'Marcos', text: 'vcs fais entega no rio tavares ou so no i fode?' },
      { id: '5548000000002', name: 'Ana', text: 'qual o orario da loja do centro no domingu?' },
      { id: '5548000000003', name: 'Ricardo', text: 'comprei um pão mofadu oq eu fasso agr?' },
      { id: '5548000000004', name: 'Julia', text: 'aceita ticket alimentasão no site?' },
      { id: '5548000000005', name: 'Pedro', text: 'queria trabaiar com vcs como mando curriculu?' },
      { id: '5548000000006', name: 'Carla', text: 'tem pão de queju quentinhu na lagoa agora?' },
      { id: '5548000000007', name: 'Fabio', text: 'qual o valo minimo pra pedi no ifood?' },
      { id: '5548000000008', name: 'Mariana', text: 'onde fica a loja do campexe?' },
      { id: '5548000000009', name: 'Lucas', text: 'vcs parcela compra no cartao?' },
      { id: '5548000000010', name: 'Beatriz', text: 'meu pedido veiu faltando um leite, ajuda nois' },
      { id: '5548000000011', name: 'Andre', text: 'tem estacionamentu na loja da armaçao?' },
      { id: '5548000000012', name: 'Fernanda', text: 'faz entrega na palhoça ou so na ilha?' },
      { id: '5548000000013', name: 'Gustavo', text: 'queria fala com um atendenti mano, cansei de robo' },
      { id: '5548000000014', name: 'Camila', text: 'tem promoçao de cervesa hj?' },
      { id: '5548000000015', name: 'Rodrigo', text: 'aceita pix na hora que o motoboy chega?' },
      { id: '5548000000016', name: 'Aline', text: 'como fasso pra recupera a senha do app que esqueci?' },
      { id: '5548000000017', name: 'Roberto', text: 'vcs abre no feriado de amanha?' }
    ];

    try {
      for (let i = 0; i < USERS.length; i++) {
        const user = USERS[i];
        const event = {
          messageId: `debug-load-${Date.now()}-${i}`,
          conversationId: user.id,
          text: user.text,
          timestamp: Date.now(),
          sender: {
            phoneNumber: user.id,
            jid: `${user.id}@s.whatsapp.net`,
            pushName: user.name,
          },
          messageType: 'text' as const,
          baileysKey: {
            id: `debug-load-${Date.now()}-${i}`,
            remoteJid: `${user.id}@s.whatsapp.net`,
            fromMe: false,
          }
        };

        logger.info(`[Debug] Disparando mensagem de ${user.name}...`);
        eventBus.emit('whatsapp.message.received', event, `debug-trace-${Date.now()}-${user.id}`);
      }

      return {
        success: true,
        message: 'Teste de carga disparado internamente. Verifique os logs do backend e o Dashboard.',
        usersSimulated: USERS.length
      };
    } catch (error: any) {
      return reply.code(500).send({
        success: false,
        message: error.message
      });
    }
  });
  
  // ROTA DE DEBUG: Testar FAQ de Cartões
  fastify.get('/api/whatsapp/debug/test-cards', async (request, reply) => {
    logger.section('DEBUG: TESTANDO FAQ DE CARTÕES', '💳');
    
    const USERS = [
      { id: '5548000000018', name: 'Zezinho', text: 'vcs aceita alelo na loja do campexe?' },
      { id: '5548000000019', name: 'Maria', text: 'pode paga com sodexo ou so dinhero?' },
      { id: '5548000000020', name: 'Joao', text: 'quais cartao passa ai?' },
      { id: '5548000000021', name: 'Paula', text: 'aceita o cartao do auxilio mergencial?' },
      { id: '5548000000022', name: 'Beto', text: 'vcs aceitao ticket de comer?' }
    ];

    try {
      for (let i = 0; i < USERS.length; i++) {
        const user = USERS[i];
        const event = {
          messageId: `debug-cards-${Date.now()}-${i}`,
          conversationId: user.id,
          text: user.text,
          timestamp: Date.now(),
          sender: {
            phoneNumber: user.id,
            jid: `${user.id}@s.whatsapp.net`,
            pushName: user.name,
          },
          messageType: 'text' as const,
          baileysKey: {
            id: `debug-cards-${Date.now()}-${i}`,
            remoteJid: `${user.id}@s.whatsapp.net`,
            fromMe: false,
          }
        };

        logger.info(`[Debug] Simulando dúvida de cartão de ${user.name}...`);
        eventBus.emit('whatsapp.message.received', event, `debug-trace-${Date.now()}-${user.id}`);
      }

      return {
        success: true,
        message: 'Teste de cartões disparado.',
        usersSimulated: USERS.length
      };
    } catch (error: any) {
      return reply.code(500).send({ success: false, message: error.message });
    }
  });
  
  console.log('[Routes] WhatsApp routes registered successfully');
  console.log('[Routes] Available routes:');
  console.log('  - GET /api/whatsapp/status');
  console.log('  - GET /api/whatsapp/qr');
  console.log('  - POST /api/whatsapp/connect');
  console.log('  - POST /api/whatsapp/disconnect');
  console.log('  - POST /api/whatsapp/reconnect');
};
