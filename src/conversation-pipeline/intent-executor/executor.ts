/**
 * Intent Executor - Camada de Ações Estratégicas
 * 
 * Responsabilidade:
 * - Executar ações baseadas no Intent classificado
 * - Gerenciar crise para URGENT_COMPLAINT
 * - Processar consultas de preços com verificação de gerente
 * - Fornecer informações de loja
 * - Tratar saudações
 * 
 * NÃO classifica - apenas executa ações
 */
import { logger } from '../../utils/logger';
import type { ExecutorInput, ExecutorOutput, ExecutorData, HandoffData, NeedInputData, SalutationData, StoreInfoData, PriceInquiryData, TaskCreatedData, ReservationRequestData, FeedbackPromoterData, FeedbackDissatisfiedData, FAQData } from './types';
import { FAQ_LIST } from '../../ai/faq';

import type { StoreService } from '../../stores';
import type { TicketService } from '../../tickets';
import type { NotificationService } from '../../notifications/service';
import type { MessageService } from '../../messages';
import type { FeedbackQueue } from '../queue/feedback-queue';
import type { ConversationTaskService } from '../../conversation-tasks/service';
import type { Entities } from '../intent-router/schemas';
import { findBestStoreMatch } from '../../utils/store-matcher';

type ExecutorDependencies = {
  storeService: StoreService;
  ticketService?: TicketService;
  notificationService?: NotificationService;
  messageService: MessageService; // Tornar obrigatório para salvar loja
  feedbackQueue?: FeedbackQueue;
  taskService?: ConversationTaskService; // Para verificar tasks pendentes
};

export class IntentExecutor {
  constructor(private deps: ExecutorDependencies) {}

  /**
   * Faz merge de entidades: valor atual sobrescreve, mas se for null, herda do contexto
   */
  private mergeEntities(currentEntities: Entities, contextEntities?: Entities | null): Entities {
    if (!contextEntities) {
      return currentEntities;
    }

    return {
      store_name: currentEntities.store_name || contextEntities.store_name || null,
      store: currentEntities.store || contextEntities.store || null,
      product_name: currentEntities.product_name || contextEntities.product_name || null,
      product: currentEntities.product || contextEntities.product || null,
      department: currentEntities.department || contextEntities.department || null,
      price: currentEntities.price || contextEntities.price || null,
      location: currentEntities.location || contextEntities.location || null,
      is_promotion_query: currentEntities.is_promotion_query !== null 
        ? currentEntities.is_promotion_query 
        : (contextEntities.is_promotion_query !== null ? contextEntities.is_promotion_query : null),
      pickup_time: currentEntities.pickup_time || contextEntities.pickup_time || null,
      quantity: currentEntities.quantity || contextEntities.quantity || null,
    };
  }

  /**
   * Verifica se o sistema está entrando em loop (perguntando a mesma coisa repetidamente)
   * Retorna true se deve fazer handoff, false se pode continuar
   */
  private checkAntiLoop(
    nextAction: string,
    contextSnapshot: ExecutorInput['contextSnapshot'],
    retryCount?: Record<string, number>
  ): { shouldHandoff: boolean; reason?: string; updatedRetryCount: Record<string, number> } {
    const currentRetryCount = retryCount || contextSnapshot.retryCount || {};
    const lastAction = contextSnapshot.lastSystemAction;

    // Se a próxima ação é a mesma da última, incrementar contador
    if (lastAction === nextAction) {
      const count = (currentRetryCount[nextAction] || 0) + 1;
      const updatedRetryCount = { ...currentRetryCount, [nextAction]: count };

      logger.pipeline('⚠️ Anti-Loop: Ação repetida detectada', {
        action: nextAction,
        count,
        lastAction,
      });

      // Se perguntou a mesma coisa 3 vezes, fazer handoff
      if (count >= 3) {
        logger.warning('🚨 Anti-Loop: Handoff forçado após 3 tentativas', {
          action: nextAction,
          count,
        });
        return {
          shouldHandoff: true,
          reason: 'repeated_failures',
          updatedRetryCount,
        };
      }

      return {
        shouldHandoff: false,
        updatedRetryCount,
      };
    }

    // Se mudou de ação, resetar contador dessa ação específica
    const updatedRetryCount = { ...currentRetryCount };
    if (lastAction && lastAction !== nextAction) {
      // Manter contadores de outras ações, mas resetar a atual se mudou
      delete updatedRetryCount[nextAction];
    }

    return {
      shouldHandoff: false,
      updatedRetryCount,
    };
  }

  /**
   * Executa ação baseada no Intent classificado
   */
  async execute(input: ExecutorInput): Promise<ExecutorOutput> {
    logger.section('Intent Executor - Executando Ação', '⚙️');
    
    const { routerResult, contextSnapshot, tenantId } = input;
    
    logger.pipeline('Processando intent', {
      intent: routerResult.intent,
      sentiment: routerResult.sentiment,
      isReputationAtRisk: routerResult.isReputationAtRisk,
    });

    try {


    // Roteamento por Intent
      let result: ExecutorOutput;
      
      console.log(`[DEBUG-IA] ⚙️ Executor: Processando intent "${routerResult.intent}"`);

      switch (routerResult.intent) {
        case 'URGENT_COMPLAINT':
          logger.pipeline('🚨 Roteando para handleUrgentComplaint', {});
          console.log(`[DEBUG-IA] 🚨 Roteando para Protocolo de Crise (URGENT_COMPLAINT)`);
          result = await this.handleUrgentComplaint(input);
          break;

        case 'FAQ_QUERY':
          console.log(`[DEBUG-IA] ❓ Roteando para FAQ_QUERY`);
          result = await this.handleFAQQuery(input);
          break;

        case 'STORE_INFO':
          logger.pipeline('🏪 Roteando para handleStoreInfo', {});
          console.log(`[DEBUG-IA] 🏪 Roteando para STORE_INFO`);
          result = await this.handleStoreInfo(input);
          break;
          
        case 'SALUTATION':
          logger.pipeline('👋 Roteando para handleSalutation', {});
          console.log(`[DEBUG-IA] 👋 Roteando para SALUTATION`);
          result = await this.handleSalutation(input);
          break;
        
        case 'HUMAN_REQUEST':
          logger.pipeline('👤 Roteando para handleHumanRequest', {});
          console.log(`[DEBUG-IA] 👤 Roteando para HUMAN_REQUEST (Desativando IA por 6h)`);
          result = await this.handleHumanRequest(input);
          break;

        
        case 'ACKNOWLEDGMENT':
          logger.pipeline('✅ Roteando para handleAcknowledgment (Silent Drop)', {});
          console.log(`[DEBUG-IA] ✅ Roteando para ACKNOWLEDGMENT (Silent Drop)`);
          result = await this.handleAcknowledgment(input);
          break;
      
      default:
        logger.warning('⚠️ Intent desconhecido ou não suportado - forçando handoff', {
          intent: routerResult.intent,
        });
        console.log(`[DEBUG-IA] ⚠️ Intent desconhecido: "${routerResult.intent}". Forçando HUMAN_REQUEST.`);
        result = await this.handleHumanRequest(input);
      }

      
      logger.pipeline('✅ Executor concluído com sucesso', {
        status: result.status,
        dataType: result.data.type,
        hasTaskRequest: !!result.taskRequest,
      });
      
      return result;
    } catch (error) {
      logger.error('❌ Erro no Executor.execute', {
        intent: routerResult.intent,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      throw error; // Re-throw para ser capturado pelo orchestrator
    }
  }

  /**
   * Gestão de Crise - URGENT_COMPLAINT
   */
  private async handleUrgentComplaint(input: ExecutorInput): Promise<ExecutorOutput> {
    logger.pipeline('🚨 Processando reclamação urgente', {
      messageId: input.messageId,
      conversationId: input.conversationId,
    });

    const { ticketService, notificationService, messageService } = this.deps;
    const { routerResult, contextSnapshot, tenantId } = input;

    // Criar ticket URGENTE imediatamente
    let ticketCreated = false;
    if (ticketService) {
      try {
        const store = contextSnapshot.selectedStoreId 
          ? await this.deps.storeService.getStoreById(contextSnapshot.selectedStoreId, tenantId)
          : null;

        await ticketService.createTicketFromHandoff({
          tenantId,
          conversationId: input.conversationId,
          storeId: contextSnapshot.selectedStoreId || null,
          priority: 'urgent',
          title: 'Reclamação Urgente - Atendimento Imediato Necessário',
          summary: input.messageText.substring(0, 500),
          reason: 'urgent_complaint',
          source: 'system',
          category: 'complaint',
        });

        ticketCreated = true;
        logger.success('✅ Ticket URGENTE criado', {
          conversationId: input.conversationId,
        });
      } catch (error) {
        logger.error('❌ Erro ao criar ticket urgente', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // Criar notificação URGENTE com alerta
    let notificationCreated = false;
    if (notificationService) {
      try {
        const store = contextSnapshot.selectedStoreId 
          ? await this.deps.storeService.getStoreById(contextSnapshot.selectedStoreId, tenantId)
          : null;

        await notificationService.createNotification({
          tenantId,
          type: 'urgent_alert',
          conversationId: input.conversationId,
          metadata: {
            reason: 'urgent_complaint',
            storeId: contextSnapshot.selectedStoreId || undefined,
            storeName: store?.name || contextSnapshot.selectedStoreName || undefined,
            lastMessagePreview: input.messageText.substring(0, 100),
            priority: 'urgent',
          },
        });

        notificationCreated = true;
        logger.success('✅ Notificação URGENTE criada', {
          conversationId: input.conversationId,
        });
      } catch (error) {
        logger.error('❌ Erro ao criar notificação urgente', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // Retornar dados estruturados para o Agente Boca
    return {
      status: 'handoff',
      handoffReason: 'urgent_complaint',
      data: {
        type: 'handoff',
        reason: 'urgent_complaint',
        ticketCreated,
      } as HandoffData,
      ticketCreated,
      notificationCreated,
    };
  }

  /**
   * Responde dúvidas frequentes - FAQ_QUERY
   */
  private async handleFAQQuery(input: ExecutorInput): Promise<ExecutorOutput> {
    const { messageText } = input;
    
    return {
      status: 'done',
      data: {
        type: 'faq_query',
        question: messageText,
        answer: 'IA deve usar FAQ_LIST para responder',
      } as FAQData,
    };
  }

  /**
   * Fornece informações de loja - STORE_INFO
   */
  private async handleStoreInfo(input: ExecutorInput): Promise<ExecutorOutput> {
    const { tenantId, routerResult, contextSnapshot } = input;
    const { storeService, messageService } = this.deps;

    // 1. Unir entidades atuais com as do contexto
    const mergedEntities = this.mergeEntities(routerResult.entities, contextSnapshot.contextEntities);

    // 2. Tentar identificar a loja
    let storeId = contextSnapshot.selectedStoreId;
    let storeName = mergedEntities.store_name;

    // Se não temos storeId mas temos um nome de loja nas entidades, buscar match
    if (!storeId && storeName) {
      const allStores = await storeService.getAllStores(tenantId);
      const matchedStore = findBestStoreMatch(storeName, allStores);
      if (matchedStore) {
        storeId = matchedStore.id;
        // Salvar loja na conversa para contexto futuro
        if (messageService) {
          await messageService.updateConversation(input.conversationId, {
            selected_store_id: storeId,
            selected_store_name: matchedStore.name
          }, tenantId);
          console.log(`[DEBUG-IA] 🏪 Loja "${matchedStore.name}" identificada e salva no contexto.`);
        }
      }
    }

    // 3. Se temos a loja, retornar os dados reais do banco
    if (storeId) {
      const store = await storeService.getStoreById(storeId, tenantId);
      if (store) {
        return {
          status: 'done',
          data: {
            type: 'store_info',
            store: {
              name: store.name,
              address: store.address,
              phone: store.phone,
              openingHours: store.openingHours,
              neighborhood: store.neighborhood,
              city: store.city,
            }
          } as StoreInfoData,
          mergedEntities
        };
      }
    }

    // 4. Se não identificou a loja, PEDIR AO USUÁRIO (não dar handoff)
    return {
      status: 'need_input',
      data: {
        type: 'need_input',
        context: 'Para te passar as informações corretas, preciso saber em qual de nossas lojas você gostaria de consultar.'
      } as NeedInputData,
      mergedEntities,
      nextSystemAction: 'asking_store'
    };
  }



  /**
   * Saudação - SALUTATION
   */
  private async handleSalutation(input: ExecutorInput): Promise<ExecutorOutput> {
    logger.pipeline('👋 Processando saudação', {
      messageId: input.messageId,
    });

    // Retornar dados estruturados para saudação
    return {
      status: 'done',
      data: {
        type: 'salutation',
      } as SalutationData,
    };
  }

  /**
   * Pedido de atendimento humano - HUMAN_REQUEST
   */
  private async handleHumanRequest(input: ExecutorInput): Promise<ExecutorOutput> {
    logger.pipeline('👤 Processando pedido de humano', {
      messageId: input.messageId,
      conversationId: input.conversationId,
    });

    const { ticketService, messageService } = this.deps;
    const { tenantId } = input;

    // 1. Criar ticket se serviço disponível
    let ticketCreated = false;
    if (ticketService) {
      try {
        await ticketService.createTicketFromHandoff({
          tenantId,
          conversationId: input.conversationId,
          storeId: input.contextSnapshot.selectedStoreId || null,
          priority: 'normal',
          title: 'Atendimento Humano Solicitado',
          summary: input.messageText.substring(0, 500),
          reason: 'human_request',
          source: 'user',
          category: 'support',
        });
        ticketCreated = true;
        logger.success('✅ Ticket criado para atendimento humano', { conversationId: input.conversationId });
      } catch (error) {
        logger.error('❌ Erro ao criar ticket', { error });
      }
    }

    // 2. Desativar IA e gravar timestamp (Protocolo 6 Horas)
    if (messageService) {
      try {
        await messageService.updateAIControl(input.conversationId, {
          aiEnabled: false,
          aiDisabledBy: 'human',
          aiDisabledReason: 'Transferência para atendimento humano (Ciclo de 6h)',
        }, tenantId);
        logger.success('🤖 IA desativada para a conversa', { conversationId: input.conversationId });
      } catch (error) {
        logger.error('❌ Erro ao desativar IA', { error });
      }
    }

    // 3. Definir estado da conversa como waiting_human
    if (messageService) {
      try {
        await messageService.updateConversationState(input.conversationId, 'waiting_human', tenantId);
      } catch (error) {
        logger.error('❌ Erro ao atualizar estado da conversa', { error });
      }
    }

    return {
      status: 'handoff',
      handoffReason: 'human_request',
      data: {
        type: 'handoff',
        reason: 'human_request',
        ticketCreated,
      } as HandoffData,
      ticketCreated,
    };
  }




  /**
   * Handler para ACKNOWLEDGMENT (Silent Drop)
   * 
   * Se o usuário apenas confirmou/agradeceu e há uma task pendente ou não há pergunta ativa,
   * retorna silent_drop para evitar resposta desnecessária.
   */
  private async handleAcknowledgment(input: ExecutorInput): Promise<ExecutorOutput> {
    logger.pipeline('✅ Processando ACKNOWLEDGMENT (Silent Drop)', {
      messageId: input.messageId,
      conversationId: input.conversationId,
      lastSystemAction: input.contextSnapshot.lastSystemAction,
    });

    const { contextSnapshot, conversationId, tenantId } = input;

    // Verificar se há task pendente (se taskService estiver disponível)
    let hasPendingTask = false;
    if (this.deps.ticketService) {
      // Nota: O Executor não tem acesso direto ao taskService, mas podemos inferir
      // pela lastSystemAction se estamos aguardando algo
      const waitingActions = ['waiting_manager_response', 'task_created', 'awaiting_confirmation'];
      hasPendingTask = contextSnapshot.lastSystemAction 
        ? waitingActions.some(action => contextSnapshot.lastSystemAction?.includes(action))
        : false;
    }

    // Verificar se não há pergunta ativa pendente
    // Se lastSystemAction não indica uma pergunta ativa (ex: "asking_store", "asking_product"),
    // então não há pergunta pendente
    const askingActions = ['asking_store', 'asking_product', 'asking_pickup_time', 'asking_quantity'];
    const hasActiveQuestion = contextSnapshot.lastSystemAction 
      ? askingActions.some(action => contextSnapshot.lastSystemAction?.includes(action))
      : false;

    // Se há task pendente OU não há pergunta ativa, fazer silent drop
    if (hasPendingTask || !hasActiveQuestion) {
      const reason = hasPendingTask 
        ? 'acknowledgment_with_pending_task' 
        : 'acknowledgment_no_active_question';

      logger.pipeline('🔇 Silent Drop aplicado', {
        reason,
        hasPendingTask,
        hasActiveQuestion,
        lastSystemAction: contextSnapshot.lastSystemAction,
      });

      return {
        status: 'silent_drop',
        data: {
          type: 'silent_drop',
          reason,
        } as import('./types').SilentDropData,
      };
    }

    // Se há pergunta ativa, tratar como resposta normal (pode ser que o usuário esteja respondendo)
    // Mas como foi classificado como ACKNOWLEDGMENT, provavelmente é apenas confirmação
    // Vamos fazer silent drop mesmo assim para evitar "Politeness Loop"
    logger.pipeline('🔇 Silent Drop aplicado (mesmo com pergunta ativa - evita Politeness Loop)', {
      lastSystemAction: contextSnapshot.lastSystemAction,
    });

    return {
      status: 'silent_drop',
      data: {
        type: 'silent_drop',
        reason: 'acknowledgment_avoid_politeness_loop',
      } as import('./types').SilentDropData,
    };
  }

  /**
   * Trabalho Sujo: Calcula se a loja está aberta em tempo real
   */
  private calculateStoreStatus(openingHours: string): { isOpen: boolean; message: string } {
    try {
      if (!openingHours || !openingHours.includes('às')) {
        return { isOpen: true, message: "Horário não informado." };
      }

      // 1. Pegar hora atual em Brasília/Floripa
      const now = new Date();
      const brTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
      const currentHour = brTime.getHours();
      const currentMin = brTime.getMinutes();
      const currentTimeInMins = currentHour * 60 + currentMin;

      // 2. Parsear horário (ex: "08:00 às 22:00")
      const parts = openingHours.split('às').map(p => p.trim());
      const [startH, startM] = parts[0].split(':').map(Number);
      const [endH, endM] = parts[1].split(':').map(Number);

      const startInMins = startH * 60 + (startM || 0);
      const endInMins = endH * 60 + (endM || 0);

      // 3. Comparar
      const isOpen = currentTimeInMins >= startInMins && currentTimeInMins < endInMins;

      if (isOpen) {
        const remainingMins = endInMins - currentTimeInMins;
        if (remainingMins <= 60) {
          return { isOpen: true, message: `A loja está aberta, mas fecha logo (daqui a ${remainingMins} minutos).` };
        }
        return { isOpen: true, message: "A loja está aberta no momento." };
      } else {
        return { isOpen: false, message: `A loja está fechada no momento. O horário de funcionamento é das ${parts[0]} às ${parts[1]}.` };
      }
    } catch (e) {
      return { isOpen: true, message: "Consulte o horário no local." };
    }
  }
}
