/**
 * MessageGroupingQueue - Debounce de Mensagens por Conversação
 *
 * Responsabilidade:
 * - Agrupar mensagens fragmentadas do mesmo usuário (ex: "Oi" + "tudo bem?")
 * - Aguardar 10 segundos de silêncio antes de chamar o Orquestrador
 * - Usar Redis apenas para acumular texto; o temporizador é nativo (setTimeout)
 */
import { Queue, Worker, QueueEvents, Job } from 'bullmq';
import Redis from 'ioredis';
import { logger } from '../../utils/logger';
import type { ConversationOrchestrator } from '../orchestrator/orchestrator';
import type { MessageService } from '../../messages';

type MessageGroupingQueueDependencies = {
  conversationOrchestrator: ConversationOrchestrator;
  messageService: MessageService;
  redisConnection: string | {
    host: string;
    port: number;
    password?: string;
    username?: string;
  };
};

type GroupedMessageData = {
  conversationId: string;
  messageIds: string[];
  accumulatedText: string;
  firstMessageId: string;
  lastMessageTimestamp: number;
};

const REDIS_KEY_PREFIX = 'msg_group:';
const GROUPING_DELAY_MS = 3000; // 3 segundos

function createRedisClient(
  connection: string | { host: string; port: number; password?: string; username?: string }
): Redis {
  const opts = {
    maxRetriesPerRequest: null as any,
    enableReadyCheck: false,
    lazyConnect: false,
    retryStrategy: (times: number) => {
      if (times > 10) return null;
      return Math.min(times * 100, 5000);
    },
  };
  return typeof connection === 'string'
    ? new Redis(connection, opts)
    : new Redis({ ...connection, ...opts });
}

export class MessageGroupingQueue {
  private queue!: Queue;
  private worker!: Worker;
  private queueEvents!: QueueEvents;
  private redisClient!: Redis;       // Conexão da Queue (escrita/leitura)
  private workerRedisClient!: Redis; // Conexão dedicada do Worker (bloqueante - NÃO compartilhar)
  private isReady: boolean = false;
  private readyPromise!: Promise<void>;

  // Debounce nativo por conversação (substitui o delay do BullMQ que falhava silenciosamente)
  private debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(private deps: MessageGroupingQueueDependencies) {
    console.log('[DEBUG-IA] 🏗️  MessageGroupingQueue constructor INICIADO');
    logger.section('Inicializando MessageGroupingQueue', '🔧');

    if (!deps.redisConnection) {
      throw new Error('Redis connection is required for MessageGroupingQueue');
    }

    // Duas conexões separadas: Queue NÃO pode compartilhar com Worker no BullMQ
    console.log('[DEBUG-IA] 🔌 Criando conexões Redis (Queue + Worker dedicado)...');
    this.redisClient = createRedisClient(deps.redisConnection);
    this.workerRedisClient = createRedisClient(deps.redisConnection);

    // Promise que resolve quando o Redis principal está pronto
    this.readyPromise = new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Redis timeout após 30s')), 30000);

      if (this.redisClient.status === 'ready') {
        clearTimeout(timeout);
        this.isReady = true;
        resolve();
        return;
      }

      this.redisClient.once('ready', () => {
        clearTimeout(timeout);
        this.isReady = true;
        logger.success('✅ Redis pronto para MessageGroupingQueue');
        resolve();
      });

      this.redisClient.once('error', (err) => {
        clearTimeout(timeout);
        logger.error('❌ Erro Redis (MessageGroupingQueue)', { error: err.message });
        reject(err);
      });
    });

    this.redisClient.on('connect', () => logger.debug('🔗 Redis conectado para MessageGroupingQueue'));
    this.redisClient.on('error', (e) => logger.error('❌ Erro Redis (Queue)', { error: e.message }));

    // Criar Queue BullMQ (Mantido para compatibilidade, embora o setTimeout gerencie o delay agora)
    try {
      this.queue = new Queue('message-grouping', {
        connection: this.redisClient,
        defaultJobOptions: { removeOnComplete: true, removeOnFail: true, attempts: 1 },
      });
      logger.success('✅ Fila BullMQ criada com sucesso', { queueName: 'message-grouping' });
    } catch (error) {
      logger.error('❌ Erro ao criar fila BullMQ', { error: error instanceof Error ? error.message : String(error) });
      this.queue = null as any;
    }

    // Criar QueueEvents
    try {
      this.queueEvents = new QueueEvents('message-grouping', { connection: this.redisClient });
    } catch (error) {
      logger.error('❌ Erro ao criar QueueEvents', { error: error instanceof Error ? error.message : String(error) });
    }

    // Worker desativado para evitar processamento paralelo com o setTimeout (Novo Padrão)
    /*
    this.readyPromise
      .then(() => {
        if (!this.queue) return;
        try {
          this.worker = new Worker(
            'message-grouping',
            async (job: Job<GroupedMessageData>) => {
              console.log(`[DEBUG-IA] ⚡ Worker BullMQ processando job!`);
              return this.handleGroupedMessage(job.data);
            },
            {
              connection: this.workerRedisClient,
              concurrency: 5,
            }
          );
          console.log('[DEBUG-IA] ✅ Worker BullMQ pronto.');
        } catch (error) {
          console.error('[DEBUG-IA] ❌ Erro ao criar worker:', error);
        }
      })
      .catch(() => {});
    */

    logger.success('✅ MessageGroupingQueue inicializada');
  }

  async waitForReady(): Promise<void> {
    await this.readyPromise;
  }

  /**
   * Adiciona uma mensagem ao grupo com debounce nativo (setTimeout por conversação).
   */
  async addMessage(
    conversationId: string,
    messageId: string,
    text: string | null,
    timestamp: number
  ): Promise<void> {
    console.log(`[DEBUG-IA] 📦 Mensagem recebida (ID: ${messageId}) | Conv: ${conversationId}`);

    const textToGroup = text || '';
    const redisKey = `${REDIS_KEY_PREFIX}${conversationId}`;

    if (this.redisClient.status !== 'ready') {
      await this.readyPromise.catch(() => {});
    }

    // 1. Acumular no Redis
    try {
      const existingData = await this.redisClient.get(redisKey);
      let groupedData: GroupedMessageData;

      if (existingData) {
        groupedData = JSON.parse(existingData);
        groupedData.messageIds.push(messageId);
        groupedData.accumulatedText += ` ${textToGroup}`;
        groupedData.lastMessageTimestamp = timestamp;
        console.log(`[DEBUG-IA] ➕ Acumulando mensagem (total: ${groupedData.messageIds.length})`);
      } else {
        groupedData = {
          conversationId,
          messageIds: [messageId],
          accumulatedText: textToGroup,
          firstMessageId: messageId,
          lastMessageTimestamp: timestamp,
        };
        console.log(`[DEBUG-IA] 🆕 Novo grupo para ${conversationId}`);
      }

      await this.redisClient.setex(redisKey, 120, JSON.stringify(groupedData));
    } catch (error) {
      console.error(`[DEBUG-IA] ❌ Erro Redis:`, error);
      await this.deps.conversationOrchestrator.processMessage(messageId, conversationId).catch(console.error);
      return;
    }

    // 2. Debounce Nativo
    if (this.debounceTimers.has(conversationId)) {
      clearTimeout(this.debounceTimers.get(conversationId)!);
      console.log(`[DEBUG-IA] ⏳ Cronômetro resetado para ${conversationId}`);
    }

    const timer = setTimeout(async () => {
      this.debounceTimers.delete(conversationId);
      console.log(`\n[DEBUG-IA] ⚡ ${GROUPING_DELAY_MS / 1000}s de silêncio detectados! Disparando Orquestrador para ${conversationId}\n`);

      try {
        const redisData = await this.redisClient.get(redisKey);
        if (!redisData) return;

        const data: GroupedMessageData = JSON.parse(redisData);
        await this.redisClient.del(redisKey);

        // Atualizar texto
        try {
          await this.deps.messageService.updateMessageText(data.firstMessageId, data.accumulatedText.trim());
        } catch (e) {}

        console.log(`[DEBUG-IA] 🚀 Chamando Orquestrador (${data.messageIds.length} msg(s))`);
        await this.deps.conversationOrchestrator.processMessage(data.firstMessageId, conversationId);
        console.log(`[DEBUG-IA] ✅ Orquestrador concluído.`);
      } catch (error) {
        console.error(`[DEBUG-IA] ❌ Erro no debounce:`, error);
      }
    }, GROUPING_DELAY_MS);

    this.debounceTimers.set(conversationId, timer);
    console.log(`[DEBUG-IA] ⏰ Aguardando silêncio de ${GROUPING_DELAY_MS / 1000}s...`);
  }

  private async handleGroupedMessage(data: GroupedMessageData): Promise<void> {
    await this.deps.conversationOrchestrator.processMessage(data.firstMessageId, data.conversationId);
  }

  async hasActiveJob(conversationId: string): Promise<boolean> {
    return this.debounceTimers.has(conversationId);
  }

  async close(): Promise<void> {
    for (const [id, timer] of this.debounceTimers) clearTimeout(timer);
    this.debounceTimers.clear();
    try {
      if (this.worker) await this.worker.close();
      if (this.queue) await this.queue.close();
      if (this.redisClient) await this.redisClient.quit();
      if (this.workerRedisClient) await this.workerRedisClient.quit();
    } catch (e) {}
  }
}
