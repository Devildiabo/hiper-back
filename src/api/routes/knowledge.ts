import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { KnowledgeService } from '../../knowledge/service';

const CreateKnowledgeSchema = z.object({
  content: z.string().min(1, 'Conteúdo é obrigatório'),
  metadata: z.record(z.any()).optional(),
});

const UpdateKnowledgeSchema = CreateKnowledgeSchema.partial().extend({
  id: z.string().uuid('ID inválido'),
});

export const registerKnowledgeRoutes = (
  fastify: FastifyInstance,
  knowledgeService: KnowledgeService
): void => {
  
  // GET /api/v1/knowledge - Listar todos os itens
  fastify.get('/api/v1/knowledge', async (request, reply) => {
    try {
      const tenantId = request.tenantId;
      if (!tenantId) {
        return reply.code(401).send({ success: false, message: 'Unauthorized' });
      }
      const data = await knowledgeService.getAll(tenantId);
      return { success: true, data };
    } catch (error) {
      console.error('[API] Error fetching knowledge:', error);
      return reply.code(500).send({ success: false, message: 'Failed to fetch' });
    }
  });

  // POST /api/v1/knowledge - Criar novo item
  fastify.post('/api/v1/knowledge', async (request, reply) => {
    try {
      const tenantId = request.tenantId;
      if (!tenantId) {
        return reply.code(401).send({ success: false, message: 'Unauthorized' });
      }

      const body = request.body as any;
      const validation = CreateKnowledgeSchema.safeParse(body);

      if (!validation.success) {
        return reply.code(400).send({ success: false, errors: validation.error.errors });
      }

      const item = await knowledgeService.create(validation.data.content, tenantId, validation.data.metadata);
      return { success: true, data: item };
    } catch (error) {
      console.error('[API] Error creating knowledge:', error);
      return reply.code(500).send({ success: false, message: 'Failed to create' });
    }
  });

  // PUT /api/v1/knowledge/:id - Atualizar item
  fastify.put('/api/v1/knowledge/:id', async (request, reply) => {
    try {
      const tenantId = request.tenantId;
      if (!tenantId) {
        return reply.code(401).send({ success: false, message: 'Unauthorized' });
      }

      const { id } = request.params as { id: string };
      const body = request.body as any;
      const validation = UpdateKnowledgeSchema.safeParse({ ...body, id });

      if (!validation.success) {
        return reply.code(400).send({ success: false, errors: validation.error.errors });
      }

      const item = await knowledgeService.update(id, validation.data.content!, tenantId, validation.data.metadata);
      return { success: true, data: item };
    } catch (error) {
      console.error('[API] Error updating knowledge:', error);
      return reply.code(500).send({ success: false, message: 'Failed to update' });
    }
  });

  // DELETE /api/v1/knowledge/:id - Deletar item
  fastify.delete('/api/v1/knowledge/:id', async (request, reply) => {
    try {
      const tenantId = request.tenantId;
      if (!tenantId) {
        return reply.code(401).send({ success: false, message: 'Unauthorized' });
      }

      const { id } = request.params as { id: string };
      await knowledgeService.delete(id, tenantId);
      return { success: true, message: 'Deleted successfully' };
    } catch (error) {
      console.error('[API] Error deleting knowledge:', error);
      return reply.code(500).send({ success: false, message: 'Failed to delete' });
    }
  });
};
