/**
 * Conversation Orchestrator - Orquestrador Principal
 * 
 * Nova arquitetura Router-Executor-Humanizer
 * 
 * Fluxo:
 * 1. Router: Classifica intent e analisa sentimento
 * 2. Executor: Executa ação baseada no intent
 * 3. Humanizer: Humaniza resposta final
 * 
 * Responsabilidade:
 * - Orquestrar as 3 camadas
 * - Gerenciar ContextSnapshot
 * - Emitir eventos apropriados
 * - Garantir rastreabilidade com traceId
 */
import { eventBus } from '../../events';
import { logger } from '../../utils/logger';
import type { MessageService } from '../../messages';
import type { StoreService } from '../../stores';
import type { TicketService } from '../../tickets';
import type { ConversationTaskService } from '../../conversation-tasks/service';
import type { NotificationService } from '../../notifications/service';
import { MediaProcessor } from '../media-processor/media-processor';
import type { ContextSnapshot } from '../intent-router/types';
import type { FeedbackQueue } from '../queue/feedback-queue';
import type { WhatsAppAdapter } from '../../whatsapp/adapter';
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import { IntentRouter } from '../intent-router/router';
import { 
  runRAGSpecialist, 
  runStoreAgent, 
  runSmallTalkAgent, 
  runVoiceAgent 
} from '../ai-agents/specialists';

type OrchestratorDependencies = {
  messageService: MessageService;
  storeService: StoreService;
  ticketService?: TicketService;
  taskService?: ConversationTaskService;
  notificationService?: NotificationService;
  feedbackQueue?: FeedbackQueue;
  whatsAppAdapter: WhatsAppAdapter;
  openaiApiKey: string;
};

export class ConversationOrchestrator {
  private mediaProcessor: MediaProcessor;
  private processedMessages: Set<string> = new Set();
  private openai: OpenAI;
  private supabase: any;
  private router: IntentRouter;

  constructor(private deps: OrchestratorDependencies) {
    this.mediaProcessor = new MediaProcessor({
      openaiApiKey: deps.openaiApiKey,
      whatsAppAdapter: deps.whatsAppAdapter,
    });

    this.openai = new OpenAI({ apiKey: deps.openaiApiKey });
    this.supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    this.router = new IntentRouter({ openaiApiKey: deps.openaiApiKey });
  }

  /**
   * Processa uma mensagem através do novo pipeline
   */
  async processMessage(messageId: string, conversationId: string): Promise<void> {
    console.log('--- DEBUG_RAW: processMessage START ---', { messageId, conversationId });
    const processKey = `${messageId}:${conversationId}`;
    if (this.processedMessages.has(processKey)) {
      logger.warning('⚠️ Mensagem já processada - ignorando duplicata', {
        prefix: '[Orchestrator]',
        emoji: '⚠️',
        messageId,
        conversationId,
      });
      return;
    }
    this.processedMessages.add(processKey);

    // Limpar mensagens antigas do guard
    if (this.processedMessages.size > 1000) {
      const entries = Array.from(this.processedMessages);
      this.processedMessages.clear();
      entries.slice(-500).forEach(key => this.processedMessages.add(key));
    }

    const traceId = this.generateTraceId();
    logger.section('Conversation Orchestrator', '🎯');
    logger.pipeline('Processando mensagem', {
      messageId,
      conversationId,
      traceId,
    });

    try {
      // Passo 1: Buscar mensagem e conversa (mensagem pode ter sido agrupada)
      const message = await this.deps.messageService.getMessageById(messageId);
      if (!message) {
        logger.warning('Mensagem não encontrada', {
          prefix: '[Orchestrator]',
          emoji: '⚠️',
        });
        return;
      }

      const tenantId = await this.deps.messageService.getConversationTenantId(conversationId);
      if (!tenantId) {
        logger.error('❌ tenantId não encontrado', {
          prefix: '[Orchestrator]',
          emoji: '❌',
          conversationId,
        });
        return;
      }

      // Buscar conversa ANTES de qualquer uso (para evitar ReferenceError)
      const conversation = await this.deps.messageService.getConversationById(conversationId, tenantId);
      if (!conversation) {
        logger.warning('Conversa não encontrada', {
          prefix: '[Orchestrator]',
          emoji: '⚠️',
        });
        return;
      }

      // Passo 1.1: Protocolo de 6 Horas - Auto-Reativação
      if (!conversation.aiEnabled && conversation.aiDisabledAt) {
        const cooldownMs = 6 * 60 * 60 * 1000;
        const timePassed = Date.now() - new Date(conversation.aiDisabledAt).getTime();
        
        if (timePassed >= cooldownMs) {
          logger.pipeline('🔄 Janela de 6h expirada - Reativando IA automaticamente', {
            conversationId,
            disabledAt: conversation.aiDisabledAt,
            timePassedHours: (timePassed / (1000 * 60 * 60)).toFixed(1),
          });
          console.log(`[DEBUG-IA] 🔄 Janela de 6h expirada. Reativando IA para a conversa ${conversationId}.`);
          
          await this.deps.messageService.updateAIControl(conversationId, {
            aiEnabled: true,
            aiDisabledBy: null,
            aiDisabledReason: 'Auto-reativação após ciclo de 6 horas',
          }, tenantId);
          
          // Atualizar objeto local para continuar processamento
          conversation.aiEnabled = true;
        } else {
          logger.pipeline('⏹️ IA desativada (Janela de 6h ativa)', {
            conversationId,
            hoursRemaining: ((cooldownMs - timePassed) / (1000 * 60 * 60)).toFixed(1),
          });
          console.log(`[DEBUG-IA] ⏹️ IA bloqueada pelo Protocolo de 6 Horas. Restam ${((cooldownMs - timePassed) / (1000 * 60 * 60)).toFixed(1)}h.`);
          return; // Aborta processamento de IA
        }
      } else if (!conversation.aiEnabled) {
        // Se estiver desativado sem timestamp (ex: manual via dashboard sem protocolo)
        // Só processamos se o usuário explicitamente pedir (mas aqui abortamos por segurança)
        logger.pipeline('⏹️ IA desativada manualmente para esta conversa', { conversationId });
        return;
      }



      // Passo 1.5: Processar mídia (áudio ou imagem) se necessário
      // Isso deve acontecer ANTES de verificar se há texto
      let processedText = message.text;
      if (!processedText && message.media && message.baileysMessage) {
        logger.pipeline('📦 Processando mídia para gerar texto...', {
          mediaType: message.media.type,
          traceId,
        });

        const mediaText = await this.mediaProcessor.processMedia(
          message.media,
          message.baileysMessage,
          message.text
        );

        if (mediaText) {
          processedText = mediaText;
          
          // Atualizar mensagem no banco com texto processado
          try {
            await this.deps.messageService.updateMessageText(messageId, processedText, tenantId);
            logger.success('✅ Texto processado da mídia atualizado na mensagem', {
              prefix: '[Orchestrator]',
              emoji: '✅',
              messageId,
              textLength: processedText.length,
            });
          } catch (updateError) {
            logger.warning('⚠️ Erro ao atualizar texto da mensagem (continuando processamento)', {
              prefix: '[Orchestrator]',
              emoji: '⚠️',
              error: updateError instanceof Error ? updateError.message : String(updateError),
            });
          }
        } else {
          logger.warning('⚠️ Não foi possível processar mídia - mensagem sem texto processável', {
            prefix: '[Orchestrator]',
            emoji: '⚠️',
            mediaType: message.media.type,
          });
          // Continuar processamento mesmo sem texto - pode ser uma mensagem apenas de mídia
        }
      }

      // Se ainda não houver texto após processar mídia, verificar se podemos continuar
      if (!processedText || processedText.trim().length === 0) {
        logger.warning('⚠️ Mensagem sem texto processável - pulando processamento de IA', {
          prefix: '[Orchestrator]',
          emoji: '⚠️',
          hasMedia: !!message.media,
          mediaType: message.media?.type,
        });
        // Não retornar - continuar para processar outras partes se necessário
        // Mas não processar pelo pipeline de IA sem texto
        return;
      }


      // GATE: Verificar se há ticket não resolvido para esta conversa
      // Se houver ticket com status != 'closed', manter IA desligada
      if (this.deps.ticketService) {

        try {
          logger.pipeline('🔍 Verificando tickets pendentes', {
            conversationId,
            tenantId,
            traceId,
          });
          
          // Usar método do service que já valida tenantId
          const tickets = await this.deps.ticketService.getByConversationId(conversationId, tenantId);
            
          // Validação: garantir que tickets é um array (mesmo que vazio)
          const ticketsArray = Array.isArray(tickets) ? tickets : [];
          
          logger.pipeline('📋 Tickets encontrados', {
            traceId,
            tenantId,
            count: ticketsArray.length,
            hasTickets: ticketsArray.length > 0,
          });
          
          // Verificar se há ticket não resolvido
          const unresolvedTicket = ticketsArray.find((t: any) => {
            // Validação: garantir que t é um objeto com status
            if (!t || typeof t !== 'object') return false;
            return t.status && t.status !== 'closed';
          });
          
          if (unresolvedTicket) {
            logger.pipeline('🚫 Ticket não resolvido encontrado - mantendo IA desligada', {
              conversationId,
              tenantId,
              traceId,
              ticketId: unresolvedTicket.id,
              ticketStatus: unresolvedTicket.status,
              ticketPriority: unresolvedTicket.priority,
            });
            // Não processa mensagem - modo humano puro enquanto ticket não resolvido
            return;
          }
        } catch (error) {
          // Se houver erro ao verificar tickets, continuar processamento (não bloquear)
          logger.warning('⚠️ Erro ao verificar tickets - continuando processamento', {
            prefix: '[Orchestrator]',
            emoji: '⚠️',
            traceId,
            error: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined,
          });
        }
      }

      // Passo 2: Construir ContextSnapshot
      const contextSnapshot = await this.buildContextSnapshot(conversation, tenantId, traceId);

      // Passo 2.5: Buscar últimas 5 mensagens para memória de janela
      const recentMessages = await this.deps.messageService.getMessagesByConversationId(
        conversationId,
        tenantId,
        5
      );
      
      // Construir histórico formatado para o Router
      const messageHistory = recentMessages
        .slice(-5) // Garantir apenas 5 mensagens
        .map(msg => ({
          role: msg.sender.phoneNumber === 'system' || msg.baileysKey?.fromMe ? 'assistant' : 'user',
          content: msg.text || '',
        }))
        .filter(msg => msg.content.trim().length > 0); // Remover mensagens vazias

      // Detectar última ação do sistema (Context-Aware)
      const lastSystemAction = this.detectLastSystemAction(messageHistory);

      logger.pipeline('📚 Histórico de mensagens preparado', {
        traceId,
        messagesCount: messageHistory.length,
        lastMessageRole: messageHistory[messageHistory.length - 1]?.role,
        lastSystemAction,
      });

      // Acumulador de uso de tokens para a sessão
      let totalUsage = 0;

      // Passo 2.6: Buscar lista de lojas para o Router fazer matching preciso
      let availableStores: Array<{ id: string; name: string; neighborhood: string }> = [];
      try {
        const stores = await this.deps.storeService.getAllStores(tenantId);
        availableStores = stores.map(s => ({
          id: s.id,
          name: s.name,
          neighborhood: s.neighborhood,
        }));
        logger.pipeline('🏪 Lista de lojas preparada para Router', {
          traceId,
          storesCount: availableStores.length,
        });
      } catch (error) {
        logger.warning('⚠️ Erro ao buscar lojas para Router - continuando sem lista', {
          traceId,
          error: error instanceof Error ? error.message : String(error),
        });
      }

      // Passo 3: Chamada do Novo Orquestrador Local (MULT-AGENT PIPELINE)
      logger.section('Orquestrador de Agentes (Local)', '🚀');
      
      const messageTextToProcess = processedText || message.text || '';
      const userName = message.sender.pushName || conversation.participantName || 'Cliente';

      // 3.1: Roteamento de Intenção
      logger.pipeline('[IA] Acionando Intent Router Local...', { traceId });
      const routerResult = await this.router.classify({
        messageText: messageTextToProcess,
        messageHistory: messageHistory
      });
      
      logger.pipeline(`[IA] ✅ Intenção: ${routerResult.intent}`, { traceId });
      
      let agentResponse: string | null = null;
      let shouldSend = true;

      // 3.2: Execução do Especialista
      if (['FAQ_QUERY', 'URGENT_COMPLAINT'].includes(routerResult.intent)) {
        logger.pipeline('[FLOW] Acionando RAG Specialist...', { traceId });
        const identifiedStore = routerResult.entities?.store_name || null;
        agentResponse = await runRAGSpecialist(
          this.openai, 
          this.supabase, 
          messageTextToProcess, 
          messageHistory, 
          routerResult.intent,
          identifiedStore
        );
      } 
      else if (routerResult.intent === 'STORE_INFO') {
        const storeSearchTerm = routerResult.entities?.store_name || routerResult.subject || '';
        logger.pipeline(`[DB] Buscando dados da loja para: ${storeSearchTerm}...`, { traceId });
        
        // Busca fuzzy de loja no DB
        const { data: storeData } = await this.supabase
          .from('stores')
          .select('*')
          .or(`name.ilike.%${storeSearchTerm}%,neighborhood.ilike.%${storeSearchTerm}%`)
          .eq('tenant_id', tenantId)
          .eq('is_active', true)
          .limit(1);

        const targetStore = storeData?.[0] || null;
        if (targetStore) {
          logger.pipeline(`[DB] ✅ Loja encontrada: ${targetStore.name}`, { traceId });
        } else {
          logger.warning(`[DB] ⚠️ Nenhuma loja encontrada para o termo: ${storeSearchTerm}`, { traceId });
        }

        const now = new Date();
        const days = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
        const currentTime = `${days[now.getDay()]}, ${now.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' })}`;
        
        agentResponse = await runStoreAgent(this.openai, targetStore, messageTextToProcess, messageHistory, currentTime);
      }
      else if (routerResult.intent === 'SALUTATION' || routerResult.intent === 'ACKNOWLEDGMENT') {
        logger.pipeline('[FLOW] Acionando Small Talk Agent...', { traceId });
        const talkResponse = await runSmallTalkAgent(this.openai, messageTextToProcess, messageHistory);
        
        if (talkResponse?.includes('[IGNORE]')) {
          logger.pipeline('[SYSTEM] IA em silêncio para evitar loop.', { traceId });
          shouldSend = false;
        } else {
          agentResponse = talkResponse;
        }
      }
      else if (routerResult.intent === 'HUMAN_REQUEST') {
        logger.pipeline('[SYSTEM] Handoff solicitado pelo usuário.', { traceId });
        agentResponse = "Vou te passar agora mesmo para um de nossos atendentes humanos. Só um instantinho!";
      }
      else {
        logger.pipeline('[SYSTEM] Intenção não mapeada ou ambígua.', { traceId });
        agentResponse = "Não entendi muito bem. Poderia me explicar de outra forma para eu te ajudar melhor?";
      }

      // 3.3: Detecção de Handoff e Humanização Final
      let finalResponse = agentResponse || "";
      let isHandoffTriggered = agentResponse?.includes('[HANDOFF]') || routerResult.intent === 'HUMAN_REQUEST';

      if (shouldSend && agentResponse) {
          logger.pipeline('[VOICE] Humanizando resposta com Agente de Voz...', { traceId });
          const technicalToHumanize = agentResponse.replace('[HANDOFF]', '').trim();
          const userName = message.sender.pushName || conversation.participantName || 'Cliente';
          finalResponse = await runVoiceAgent(this.openai, technicalToHumanize, messageTextToProcess, userName) || technicalToHumanize;
      }

      // Passo 4: Executar ação baseada no retorno
      if (shouldSend && finalResponse) {
        eventBus.emit('conversation.response.generated', {
          messageId,
          conversationId,
          response: { text: finalResponse },
          brainDecision: isHandoffTriggered ? 'WAIT_FOR_HUMAN' : 'ALLOW_AUTO_RESPONSE',
          timestamp: Date.now(),
          traceId,
        }, traceId);

        logger.success('✅ Resposta da IA enviada via WhatsApp', { traceId });
      }

      // Se for Handoff (explícito, via [HANDOFF] ou via reclamação urgente)
      if (isHandoffTriggered || routerResult.intent === 'URGENT_COMPLAINT') {
        const reason = isHandoffTriggered ? 'ai_handoff_requested' : 'urgent_complaint';
        
        await this.deps.messageService.updateAIControl(conversationId, {
          aiEnabled: false,
          aiDisabledBy: 'system',
          aiDisabledReason: `Handoff automático: ${reason}`,
          aiDisabledAt: new Date().toISOString()
        }, tenantId);

        // Criar Ticket se o serviço estiver disponível
        if (this.deps.ticketService && routerResult.intent === 'URGENT_COMPLAINT') {
          try {
            await this.deps.ticketService.create({
              tenant_id: tenantId,
              conversation_id: conversationId,
              title: `Reclamação Urgente: ${routerResult.subject || 'Problema com produto/entrega'}`,
              description: `O cliente relatou: "${messageTextToProcess}"`,
              status: 'open',
              priority: 'high',
              source: 'whatsapp'
            });
            logger.success('✅ Ticket de reclamação criado com sucesso', { traceId });
          } catch (ticketError) {
            logger.error('❌ Erro ao criar ticket automático', { traceId, error: ticketError });
          }
        }

        eventBus.emit('conversation.handoff.requested', {
          tenantId,
          conversationId,
          storeId: contextSnapshot.selectedStoreId || null,
          reason: reason,
          severity: routerResult.intent === 'URGENT_COMPLAINT' ? 'high' : 'normal',
          timestamp: Date.now(),
          lastMessagePreview: messageTextToProcess.substring(0, 100),
        }, traceId);
      }

      logger.success('✅ Processamento concluído (Nova Arquitetura)', {
        prefix: '[Orchestrator]',
        emoji: '✅',
        traceId,
      });

    } catch (error) {
      console.log('--- DEBUG_RAW: CRITICAL ERROR IN ORCHESTRATOR ---');
      console.log('Error Message:', error instanceof Error ? error.message : String(error));
      
      // Fallback amigável para o usuário antes de passar para o humano
      try {
        const fallbackText = "No momento estamos com uma alta demanda e instabilidade nos nossos sistemas. Mas não se preocupe, um de nossos atendentes humanos já vai te ajudar por aqui em instantes! 😊";
        
        eventBus.emit('conversation.response.generated', {
          messageId,
          conversationId,
          response: { text: fallbackText },
          brainDecision: 'WAIT_FOR_HUMAN',
          timestamp: Date.now(),
          traceId,
        }, traceId);

        // Garantir que a conversa mude para waiting_human
        const tenantId = await this.deps.messageService.getConversationTenantId(conversationId);
        if (tenantId) {
          await this.deps.messageService.updateConversationState(conversationId, 'waiting_human', tenantId);
          await this.deps.messageService.updateAIControl(conversationId, {
            aiEnabled: false,
            aiDisabledBy: 'system',
            aiDisabledReason: 'Erro crítico no pipeline (Fallback de Emergência)',
          }, tenantId);
        }
      } catch (fallbackError) {
        console.error('❌ Falha ao enviar resposta de fallback:', fallbackError);
      }
    }
  }

  /**
   * Detecta a última ação do sistema baseado nas mensagens do histórico
   * Retorna o tipo de ação para injeção de contexto no Router
   */
  private detectLastSystemAction(messageHistory: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>): string | undefined {
    if (!messageHistory || messageHistory.length === 0) {
      return undefined;
    }

    // Buscar última mensagem do sistema (assistant/system)
    for (let i = messageHistory.length - 1; i >= 0; i--) {
      const msg = messageHistory[i];
      if (msg.role === 'assistant' || msg.role === 'system') {
        const content = msg.content.toLowerCase();
        
        // Detectar feedback_checkin
        if (content.includes('passaria') || 
            content.includes('retirada') || 
            content.includes('atendido') || 
            content.includes('deu tudo certo') || 
            content.includes('foi bem atendido')) {
          return 'feedback_checkin';
        }
        
        // Detectar asking_store (perguntando loja)
        if (content.includes('qual unidade') || 
            content.includes('qual loja') || 
            content.includes('em qual unidade') ||
            content.includes('em qual loja') ||
            (content.includes('unidade') && (content.includes('você está') || content.includes('está'))) ||
            (content.includes('loja') && (content.includes('você está') || content.includes('está')))) {
          return 'asking_store';
        }
        
        // Detectar asking_product (perguntando produto)
        if (content.includes('qual produto') || 
            content.includes('que produto') ||
            content.includes('produto você') ||
            (content.includes('produto') && (content.includes('gostaria') || content.includes('quer')))) {
          return 'asking_product';
        }
        
        // Detectar confirming_order (confirmando reserva)
        if (content.includes('confirmada') || 
            (content.includes('reserva') && (content.includes('confirmada') || content.includes('separar'))) ||
            (content.includes('mandei') && content.includes('separar'))) {
          return 'confirming_order';
        }
        
        // Detectar asking_pickup_time (perguntando horário de retirada)
        if (content.includes('horário') || 
            content.includes('horario') ||
            content.includes('que horas') ||
            content.includes('que hora') ||
            (content.includes('retirar') && (content.includes('quando') || content.includes('que horas')))) {
          return 'asking_pickup_time';
        }
        
        // Detectar asking_quantity (perguntando quantidade)
        if (content.includes('quantidade') || 
            content.includes('quantos') ||
            content.includes('quantas') ||
            (content.includes('unidades') && content.includes('quer'))) {
          return 'asking_quantity';
        }
        
        // Detectar offering_reservation (oferecendo reserva)
        if (content.includes('quer que eu peça') || 
            content.includes('separarem') ||
            (content.includes('reservar') && (content.includes('quer') || content.includes('gostaria')))) {
          return 'offering_reservation';
        }
        
        // Detectar greeting (saudação inicial)
        if (content.includes('bem-vindo') || 
            content.includes('bem vindo') ||
            content.includes('como posso ajudar') ||
            ((content.includes('olá') || content.includes('oi')) && content.includes('bem-vindo'))) {
          return 'greeting';
        }
        
        // Se não detectar ação específica, retornar undefined
        return undefined;
      }
    }
    
    return undefined;
  }

  /**
   * Constrói ContextSnapshot a partir da conversa
   */
  private async buildContextSnapshot(conversation: any, tenantId: string, traceId: string): Promise<ContextSnapshot> {
    try {
      // Buscar histórico de sentimentos (últimas 3 mensagens)
      const recentMessages = await this.deps.messageService.getMessagesByConversationId(
        conversation.conversationId,
        tenantId,
        3
      );

      // Validação: garantir que recentMessages é um array
      const messagesArray = Array.isArray(recentMessages) ? recentMessages : [];

      // Por enquanto, usar sentimento neutro (será atualizado pelo Router)
      const sentimentHistory: any[] = [];

      // Carregar entities persistidas e lastSystemAction do banco
      const contextEntities = conversation.context_entities || undefined;
      const lastSystemAction = conversation.lastSystemAction || undefined;
      const retryCount = conversation.retryCount || undefined;

      logger.pipeline('📥 ContextSnapshot construído', {
        traceId,
        messagesCount: messagesArray.length,
        hasSelectedStore: !!conversation.selectedStoreId,
        isReputationAtRisk: conversation.isReputationAtRisk || false,
        hasContextEntities: !!contextEntities,
        lastSystemAction,
        retryCount,
      });

      return {
        currentIntent: undefined, // Será preenchido pelo Router
        selectedStoreId: conversation.selectedStoreId,
        selectedStoreName: conversation.selectedStoreName,
        isReputationAtRisk: conversation.isReputationAtRisk || false,
        lastInteractionAt: conversation.lastMessageAt || Date.now(),
        sentimentHistory,
        pendingFields: conversation.pendingFields || undefined,
        entities: contextEntities, // Entities persistidas para Entity Merging
        lastSystemAction, // Última ação do sistema para anti-loop
        retryCount, // Contador de tentativas para anti-loop
      };
    } catch (error) {
      logger.error('❌ Erro ao construir ContextSnapshot - usando snapshot mínimo', {
        traceId,
        error: error instanceof Error ? error.message : String(error),
      });
      
      // Retornar snapshot mínimo em caso de erro
      return {
        currentIntent: undefined,
        selectedStoreId: conversation.selectedStoreId,
        selectedStoreName: conversation.selectedStoreName,
        isReputationAtRisk: conversation.isReputationAtRisk || false,
        lastInteractionAt: conversation.lastMessageAt || Date.now(),
        sentimentHistory: [],
        pendingFields: conversation.pendingFields || undefined,
        entities: conversation.context_entities || undefined,
        lastSystemAction: conversation.lastSystemAction || undefined,
        retryCount: conversation.retryCount || undefined,
      };
    }
  }

  /**
   * Incrementa o uso de tokens da conversa
   */
  private async trackTokenUsage(conversationId: string, tokens: number, tenantId: string, traceId: string): Promise<void> {
    try {
      // Cálculo simplificado: US$ 0.00015 por 1k tokens (média gpt-4o-mini input/output + embeddings)
      const costUsd = (tokens / 1000) * 0.00015;
      
      await this.deps.messageService.incrementTokenUsage(conversationId, tokens, costUsd, tenantId);
      
      logger.pipeline('💰 Token usage trackeado', {
        traceId,
        tokens,
        costUsd,
      });
    } catch (error) {
      logger.error('❌ Erro ao trackear uso de tokens', {
        traceId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private generateTraceId(): string {
    return `trace_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * Helper para pegar o horário atual em Brasília/Floripa
   */
  private getCurrentTimeBr(): string {
    const now = new Date();
    const brTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
    return `${brTime.getHours().toString().padStart(2, '0')}:${brTime.getMinutes().toString().padStart(2, '0')}`;
  }

  /**
   * Helper para extrair o horário de fechamento da string de openingHours
   * Formato esperado: "08:00 às 22:00"
   */
  private extractClosingTime(openingHours?: string): string | null {
    if (!openingHours || !openingHours.includes('às')) return null;
    const parts = openingHours.split('às').map(p => p.trim());
    if (parts.length < 2) return null;
    return parts[1]; // Ex: "22:00"
  }
}
