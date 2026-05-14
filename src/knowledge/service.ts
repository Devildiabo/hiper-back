import { createClient } from '@supabase/supabase-js';
import { OpenAI } from 'openai';

export class KnowledgeService {
  private supabase;
  private openai;

  constructor() {
    this.supabase = createClient(
      process.env.SUPABASE_URL || '',
      process.env.SUPABASE_SERVICE_ROLE_KEY || ''
    );
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }

  async getAll(tenantId: string) {
    const { data, error } = await this.supabase
      .from('knowledge_base')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data;
  }

  async create(content: string, tenantId: string, metadata: any = {}) {
    // 1. Gerar Embedding
    const embeddingRes = await this.openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: content,
    });
    const embedding = embeddingRes.data[0].embedding;

    // 2. Salvar no Banco
    const { data, error } = await this.supabase
      .from('knowledge_base')
      .insert({
        content,
        content_embedding: embedding,
        metadata
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async update(id: string, content: string, tenantId: string, metadata: any = {}) {
    // 1. Gerar Novo Embedding
    const embeddingRes = await this.openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: content,
    });
    const embedding = embeddingRes.data[0].embedding;

    // 2. Atualizar no Banco
    const { data, error } = await this.supabase
      .from('knowledge_base')
      .update({
        content,
        content_embedding: embedding,
        metadata,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async delete(id: string, tenantId: string) {
    const { error } = await this.supabase
      .from('knowledge_base')
      .delete()
      .eq('id', id);

    if (error) throw error;
    return true;
  }
}
