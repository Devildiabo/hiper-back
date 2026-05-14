/**
 * Server-Sent Events (SSE) endpoint para eventos em tempo real (Status WhatsApp, Novas Mensagens)
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { WhatsAppAdapter } from '../../whatsapp/adapter';
import { eventBus } from '../../events';

type SSERoutesDependencies = {
  whatsAppAdapter: WhatsAppAdapter;
};

// Armazenar clientes conectados
const connectedClients = new Set<FastifyReply>();

/**
 * Broadcast de evento genérico para todos os clientes conectados
 */
export function broadcastRealtimeEvent(type: string, data: any): void {
  const message = JSON.stringify({
    type,
    data,
    timestamp: new Date().toISOString(),
  });

  // Enviar para todos os clientes conectados
  connectedClients.forEach((client) => {
    try {
      client.raw.write(`data: ${message}\n\n`);
    } catch (error) {
      // Cliente desconectado, remover da lista
      connectedClients.delete(client);
      console.error('[SSE] Erro ao enviar para cliente:', error);
    }
  });
}

/**
 * Broadcast status do WhatsApp (mantendo compatibilidade)
 */
export function broadcastWhatsAppStatus(status: {
  status: 'connected' | 'disconnected' | 'connecting' | 'error';
  reason?: string;
  error?: string;
}): void {
  broadcastRealtimeEvent('whatsapp_status', {
    status: status.status === 'connected' ? 'online' : 'offline',
    reason: status.reason || status.error || 'unknown',
  });
}

export const registerWhatsAppStatusSSERoutes = (
  fastify: FastifyInstance,
  deps: SSERoutesDependencies
): void => {
  console.log('[Routes] Registering Realtime Events SSE routes...');

  // Handler OPTIONS para preflight CORS
  fastify.options('/api/whatsapp/status/stream', async (request: FastifyRequest, reply: FastifyReply) => {
    reply.raw.setHeader('Access-Control-Allow-Origin', '*');
    reply.raw.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    reply.raw.setHeader('Access-Control-Allow-Headers', 'Cache-Control, Authorization');
    reply.code(204).send();
  });

  // Endpoint SSE para eventos em tempo real
  fastify.get('/api/whatsapp/status/stream', async (request: FastifyRequest, reply: FastifyReply) => {
    console.log('[SSE] Cliente conectado ao stream de eventos em tempo real');

    // Configurar CORS headers para SSE
    reply.raw.setHeader('Access-Control-Allow-Origin', '*');
    reply.raw.setHeader('Access-Control-Allow-Credentials', 'true');
    reply.raw.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    reply.raw.setHeader('Access-Control-Allow-Headers', 'Cache-Control, Authorization');
    
    // Configurar headers para SSE
    reply.raw.setHeader('Content-Type', 'text/event-stream');
    reply.raw.setHeader('Cache-Control', 'no-cache');
    reply.raw.setHeader('Connection', 'keep-alive');
    reply.raw.setHeader('X-Accel-Buffering', 'no');

    // Adicionar cliente à lista
    connectedClients.add(reply);

    // Enviar status inicial imediatamente
    const initialStatus = deps.whatsAppAdapter.getConnectionStatus();
    const initialStatusValue = initialStatus.status === 'connected' ? 'online' : 'offline';
    
    const initialMessage = JSON.stringify({
      type: 'whatsapp_status',
      data: {
        status: initialStatusValue,
        reason: initialStatus.status === 'connected' ? 'connected' : (initialStatus.error || 'disconnected'),
      },
      timestamp: new Date().toISOString(),
    });
    
    reply.raw.write(`data: ${initialMessage}\n\n`);

    // Enviar heartbeat a cada 30 segundos
    const heartbeatInterval = setInterval(() => {
      try {
        reply.raw.write(`: heartbeat\n\n`);
      } catch (error) {
        clearInterval(heartbeatInterval);
        connectedClients.delete(reply);
      }
    }, 30000);

    // Limpar quando cliente desconectar
    request.raw.on('close', () => {
      console.log('[SSE] Cliente desconectado do stream de eventos');
      clearInterval(heartbeatInterval);
      connectedClients.delete(reply);
    });

    return reply;
  });

  console.log('[Routes] Realtime Events SSE routes registered');
};
