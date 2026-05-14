/**
 * validateEnv — Pre-flight Environment Guard
 *
 * Deve ser invocado como a PRIMEIRA operação no bootstrap.
 * Em produção (NODE_ENV=production), qualquer variável crítica ausente
 * causa process.exit(1) antes que qualquer serviço seja inicializado.
 * Em desenvolvimento, emite warnings mas permite iniciar.
 */

type EnvRule = {
  key: string;
  description: string;
  /** Se true, bloqueia mesmo em dev */
  alwaysRequired?: boolean;
  /** Validação extra além de "não-vazio" */
  validate?: (value: string) => string | null; // retorna mensagem de erro ou null se ok
};

const CRITICAL_RULES: EnvRule[] = [
  {
    key: 'SUPABASE_URL',
    description: 'URL do projeto Supabase (ex: https://<project-id>.supabase.co)',
  },
  {
    key: 'SUPABASE_SERVICE_ROLE_KEY',
    description: 'Chave service_role do Supabase (bypassa RLS — mantenha segura)',
    validate: (v) =>
      v.length < 100
        ? 'Parece um placeholder. Use a chave real gerada no painel do Supabase.'
        : null,
  },
  {
    key: 'OPENAI_API_KEY',
    description: 'Chave da API OpenAI (começa com sk-)',
    validate: (v) =>
      !v.startsWith('sk-')
        ? 'Deve começar com "sk-". Verifique no painel da OpenAI.'
        : null,
  },
  {
    key: 'JWT_SECRET',
    description: 'Segredo para assinatura de tokens JWT (mínimo 32 caracteres)',
    validate: (v) => {
      const PLACEHOLDER_VALUES = [
        'change-me-in-production',
        'your-super-secret-jwt-key-change-in-production',
        'secret',
        'jwt_secret',
      ];
      if (PLACEHOLDER_VALUES.some((p) => v.toLowerCase().includes(p.toLowerCase()))) {
        return 'Valor de placeholder detectado. Gere um secret seguro: openssl rand -base64 48';
      }
      if (v.length < 32) {
        return `Muito curto (${v.length} chars). Mínimo: 32 caracteres aleatórios.`;
      }
      return null;
    },
  },
];

const OPTIONAL_RULES: EnvRule[] = [
  {
    key: 'REDIS_PUBLIC_URL',
    description: 'URL pública do Redis para BullMQ (necessário se USE_BULLMQ=true)',
  },
  {
    key: 'SUPABASE_ANON_KEY',
    description: 'Chave anônima do Supabase (necessária para Supabase Auth)',
  },
  {
    key: 'WHATSAPP_SESSION_PATH',
    description: 'Caminho de persistência de sessão WhatsApp (default: ./sessions)',
  },
];

export function validateEnv(): void {
  const isProduction = process.env.NODE_ENV === 'production';
  const errors: string[] = [];
  const warnings: string[] = [];

  console.log('\n╔═══════════════════════════════════════════════════════════╗');
  console.log('║           PRE-FLIGHT ENVIRONMENT VALIDATION              ║');
  console.log('╚═══════════════════════════════════════════════════════════╝');
  console.log(`[ValidateEnv] Modo: ${isProduction ? '🔴 PRODUCTION' : '🟡 DEVELOPMENT'}\n`);

  // — Verificar variáveis críticas —
  for (const rule of CRITICAL_RULES) {
    const value = process.env[rule.key];

    if (!value || value.trim() === '') {
      const msg = `❌ ${rule.key} não definida. ${rule.description}`;
      errors.push(msg);
      console.error(`[ValidateEnv] ${msg}`);
      continue;
    }

    if (rule.validate) {
      const validationError = rule.validate(value.trim());
      if (validationError) {
        const msg = `⚠️  ${rule.key}: ${validationError}`;
        if (isProduction) {
          errors.push(msg);
          console.error(`[ValidateEnv] ${msg}`);
        } else {
          warnings.push(msg);
          console.warn(`[ValidateEnv] ${msg}`);
        }
        continue;
      }
    }

    console.log(`[ValidateEnv] ✅ ${rule.key}`);
  }

  // — Verificar BullMQ Redis quando ativado —
  if (process.env.USE_BULLMQ === 'true' || process.env.USE_BULLMQ === '1') {
    const hasRedis =
      !!process.env.REDIS_PUBLIC_URL ||
      !!process.env.REDIS_URL ||
      !!process.env.REDIS_HOST;

    if (!hasRedis) {
      const msg =
        '❌ USE_BULLMQ=true mas nenhuma variável Redis encontrada. Configure REDIS_PUBLIC_URL ou REDIS_URL.';
      errors.push(msg);
      console.error(`[ValidateEnv] ${msg}`);
    } else {
      console.log('[ValidateEnv] ✅ Redis config detectada para BullMQ');
    }
  }

  // — Avisos opcionais (não-bloqueantes) —
  for (const rule of OPTIONAL_RULES) {
    if (!process.env[rule.key]) {
      console.log(`[ValidateEnv] 💡 ${rule.key} não definida (opcional). ${rule.description}`);
    }
  }

  console.log('');

  // — Decisão final —
  if (errors.length > 0) {
    if (isProduction) {
      console.error('[ValidateEnv] ❌ FALHA CRÍTICA: Variáveis obrigatórias ausentes em produção.');
      console.error('[ValidateEnv] Copie .env.example para .env e preencha os valores corretos.');
      console.error('[ValidateEnv] Encerrando processo.\n');
      process.exit(1);
    } else {
      console.warn(
        '[ValidateEnv] ⚠️  Variáveis ausentes em desenvolvimento. O sistema pode não funcionar corretamente.',
      );
      console.warn(
        '[ValidateEnv] Em produção (NODE_ENV=production), estas ausências causariam process.exit(1).\n',
      );
    }
  } else if (warnings.length > 0) {
    console.warn('[ValidateEnv] ⚠️  Validação concluída com avisos. Revise os itens acima.\n');
  } else {
    console.log('[ValidateEnv] ✅ Todas as variáveis críticas estão presentes e válidas.\n');
  }
}
