-- Habilitar a extensão pgvector para busca semântica
CREATE EXTENSION IF NOT EXISTS vector;

-- Tabela de Base de Conhecimento (FAQ)
CREATE TABLE IF NOT EXISTS knowledge_base (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  content_embedding vector(1536), -- Compatível com text-embedding-3-small ou large truncado
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabela de Logs de Interação (Auditoria de Agentes)
CREATE TABLE IF NOT EXISTS interaction_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id TEXT,
  conversation_id TEXT,
  agent_name TEXT NOT NULL, -- 'sentinela', 'bibliotecario', 'voz'
  input JSONB,
  output JSONB,
  model TEXT,
  latency_ms INTEGER,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Habilitar busca por similaridade de cosseno
CREATE INDEX ON knowledge_base USING ivfflat (content_embedding vector_cosine_ops)
WITH (lists = 100);

-- Função para busca semântica
CREATE OR REPLACE FUNCTION match_knowledge(
  query_embedding vector(1536),
  match_threshold float,
  match_count int
)
returns table (
  id uuid,
  content text,
  metadata jsonb,
  similarity float
)
language plpgsql
as $$
begin
  return query
  select
    knowledge_base.id,
    knowledge_base.content,
    knowledge_base.metadata,
    1 - (knowledge_base.content_embedding <=> query_embedding) as similarity
  from knowledge_base
  where 1 - (knowledge_base.content_embedding <=> query_embedding) > match_threshold
  order by similarity desc
  limit match_count;
end;
$$;
