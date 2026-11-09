require('dotenv').config();
const fs = require('fs');
const path = require('path');
const express = require('express');
const { runPipeline, loadClientConfig } = require('./src/pipeline');
const { detectAvailableProviders, testLlmConnection } = require('./src/llm');
const { suggestTopicIdeas, ARCHETYPES } = require('./src/topicSynthesizer');
const { STYLE_DESCRIPTIONS } = require('./src/imageGen');
const { validatePublicUrl, sanitizeIdentifier, safePathResolve } = require('./src/security/validator');
const { maskClientSecrets, mergeClientSecrets } = require('./src/security/masker');
const { dispatchToClientChannels, publishToWebhook, testChannelConnection } = require('./src/publisher');
const { evaluateContentWithJev, testJevConnection } = require('./src/decision/jev');
const {
  enqueueJob,
  getJobs,
  getJob,
  cancelJob,
  retryJob,
  clearCompleted,
  startBackgroundWorker
} = require('./src/queue');
const {
  getCalendarEvents,
  getNextAvailableSlot
} = require('./src/smartScheduler');
const {
  checkClientFeeds,
  startRssWatcher,
  loadRssHistory
} = require('./src/rssWatcher');
const {
  getConsolidatedAnalytics,
  prepareEvergreenRecycle
} = require('./src/analyticsTracker');
const {
  initUserStore,
  findUserByEmail,
  createUser,
  verifyPassword,
  sanitizeUser,
  incrementUserUsage,
  checkUserQuota,
  updateUser
} = require('./src/security/userStore');
const {
  generateToken,
  requireAuth,
  requireAdmin,
  loginRateLimiter
} = require('./src/security/auth');

const app = express();
const PORT = process.env.PORT || 3001;
const BASE_URL = process.env.BASE_URL || 'https://social360.anauedesign.com.br';

// Habilita proxy reverso para identificar IP e protocolo HTTPS reais através do Nginx Proxy Manager
app.set('trust proxy', 1);

// Inicializa a base de dados de usuários do SaaS (cria admin se não existir)
initUserStore();

// Middleware de Segurança e Headers
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Rate Limiter simples em memória
const rateLimitMap = new Map();
function rateLimiter(req, res, next) {
  const ip = req.ip || req.connection.remoteAddress || 'unknown';
  const now = Date.now();
  const windowMs = 5 * 60 * 1000;
  const maxRequests = 60;

  const userStats = rateLimitMap.get(ip) || { count: 0, firstRequest: now };

  if (now - userStats.firstRequest > windowMs) {
    userStats.count = 1;
    userStats.firstRequest = now;
  } else {
    userStats.count++;
  }

  rateLimitMap.set(ip, userStats);

  if (userStats.count > maxRequests) {
    return res.status(429).json({
      error: 'Muitas requisições em curto período. Aguarde alguns instantes antes de tentar novamente.'
    });
  }

  next();
}

// ---------------------------------------------------------------------------
// 0. AUTENTICAÇÃO E GESTÃO SAAS (AUTH & TENANCY)
// ---------------------------------------------------------------------------

// Login com email e senha
app.post('/api/auth/login', loginRateLimiter, async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: 'E-mail e senha são obrigatórios.' });
    }

    const user = findUserByEmail(email);
    if (!user) {
      return res.status(401).json({ error: 'Credenciais inválidas. Verifique seu e-mail e senha.' });
    }

    const isMatch = await verifyPassword(password, user.passwordHash);
    if (!isMatch) {
      return res.status(401).json({ error: 'Credenciais inválidas. Verifique seu e-mail e senha.' });
    }

    const token = generateToken(user);
    res.json({
      success: true,
      message: 'Login realizado com sucesso!',
      token,
      user: sanitizeUser(user)
    });
  } catch (err) {
    console.error('[AUTH LOGIN ERRO]:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Registro de Nova Conta / Tenant
app.post('/api/auth/register', loginRateLimiter, async (req, res) => {
  try {
    const { name, email, password, company, plan } = req.body || {};
    const newUser = await createUser({ name, email, password, company, plan });
    const token = generateToken(newUser);

    res.status(201).json({
      success: true,
      message: 'Conta criada com sucesso!',
      token,
      user: newUser
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Perfil do Usuário Autenticado
app.get('/api/auth/me', requireAuth, (req, res) => {
  res.json({
    success: true,
    user: req.user
  });
});

// Atualizar Perfil do Usuário
app.put('/api/auth/profile', requireAuth, async (req, res) => {
  try {
    const { name, company, newPassword } = req.body || {};
    const updated = await updateUser(req.user.id, { name, company, newPassword });
    res.json({
      success: true,
      message: 'Perfil atualizado com sucesso!',
      user: updated
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Logout (para conformidade de sessão)
app.post('/api/auth/logout', (req, res) => {
  res.json({ success: true, message: 'Sessão encerrada com sucesso.' });
});

// ---------------------------------------------------------------------------
// 1. ROTAS DE ESTADO E INFORMAÇÕES
// ---------------------------------------------------------------------------

// Status do sistema e provedores disponíveis
app.get('/api/status', (req, res) => {
  const clientsDir = path.join(__dirname, 'config', 'clients');
  const clients = fs.existsSync(clientsDir)
    ? fs.readdirSync(clientsDir).filter(f => f.endsWith('.json')).map(f => f.replace('.json', ''))
    : ['default'];

  res.json({
    name: 'pub_rs Studio',
    version: '3.0.0',
    providers: detectAvailableProviders(),
    clients,
    archetypes: ARCHETYPES,
    visualStyles: STYLE_DESCRIPTIONS,
    hasImageGen: true,
    imageProviders: ['Pollinations AI (Flux)', Boolean(process.env.OPENAI_API_KEY) && 'OpenAI (DALL-E 3)', Boolean(process.env.GEMINI_API_KEY) && 'Google (Imagen 3)'].filter(Boolean)
  });
});

// Listar todos os clientes cadastrados (com segredos mascarados)
app.get('/api/clients', requireAuth, (req, res) => {
  const clientsDir = path.join(__dirname, 'config', 'clients');
  if (!fs.existsSync(clientsDir)) {
    return res.json([]);
  }

  const files = fs.readdirSync(clientsDir).filter(f => f.endsWith('.json'));
  const clients = files.map(file => {
    try {
      const raw = JSON.parse(fs.readFileSync(path.join(clientsDir, file), 'utf8'));
      return maskClientSecrets(raw);
    } catch {
      return null;
    }
  }).filter(Boolean);

  res.json(clients);
});

// Obter detalhes de um cliente específico (mascarado)
app.get('/api/clients/:id', requireAuth, (req, res) => {
  try {
    const safeId = sanitizeIdentifier(req.params.id);
    const clientsDir = path.join(__dirname, 'config', 'clients');
    const filePath = safePathResolve(clientsDir, `${safeId}.json`);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Cliente não encontrado.' });
    }

    const client = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    res.json(maskClientSecrets(client));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Cadastrar ou atualizar cliente (com fusão segura de tokens e segredos)
app.post('/api/clients', requireAuth, (req, res) => {
  try {
    const clientData = req.body;
    if (!clientData || !clientData.id || !clientData.brandName) {
      return res.status(400).json({ error: 'Campos "id" e "brandName" são obrigatórios.' });
    }

    const safeId = sanitizeIdentifier(clientData.id);
    const clientsDir = path.join(__dirname, 'config', 'clients');
    if (!fs.existsSync(clientsDir)) {
      fs.mkdirSync(clientsDir, { recursive: true });
    }

    const targetFile = safePathResolve(clientsDir, `${safeId}.json`);

    // Carrega versão existente para preservar tokens não alterados
    let existingClient = {};
    if (fs.existsSync(targetFile)) {
      try { existingClient = JSON.parse(fs.readFileSync(targetFile, 'utf8')); } catch {}
    }

    // Mescla preservando segredos originais caso venham mascarados
    const merged = mergeClientSecrets(clientData, existingClient);

    const sanitizedClient = {
      id: safeId,
      name: merged.name || merged.brandName,
      brandName: merged.brandName,
      brandHandle: merged.brandHandle || '',
      niche: merged.niche || '',
      contentPillars: Array.isArray(merged.contentPillars)
        ? merged.contentPillars
        : (typeof merged.contentPillars === 'string'
          ? merged.contentPillars.split('\n').map(s => s.trim()).filter(Boolean)
          : []),
      visualIdentity: {
        style: merged.visualIdentity?.style || 'dark-cinematic',
        preferredColors: Array.isArray(merged.visualIdentity?.preferredColors)
          ? merged.visualIdentity.preferredColors
          : ['#0052FF', '#0A0E17', '#00D2FF'],
        brandBadgePosition: merged.visualIdentity?.brandBadgePosition || 'top-right'
      },
      negativeKeywords: Array.isArray(merged.negativeKeywords)
        ? merged.negativeKeywords
        : (typeof merged.negativeKeywords === 'string'
          ? merged.negativeKeywords.split(',').map(s => s.trim()).filter(Boolean)
          : []),
      tone: merged.tone || 'Profissional e estratégico',
      targetAudience: merged.targetAudience || 'Profissionais e tomadores de decisão',
      llm: {
        provider: merged.llm?.provider || merged.llmProvider || 'auto',
        model: merged.llm?.model || merged.llmModel || '',
        apiKey: merged.llm?.apiKey || '',
        baseUrl: merged.llm?.baseUrl || ''
      },
      jev: {
        enabled: Boolean(merged.jev?.enabled !== false),
        apiKey: merged.jev?.apiKey || ''
      },
      channels: {
        webhook: {
          enabled: Boolean(merged.channels?.webhook?.enabled !== false),
          url: merged.channels?.webhook?.url || merged.webhookUrl || ''
        },
        linkedin: {
          enabled: Boolean(merged.channels?.linkedin?.enabled),
          accessToken: merged.channels?.linkedin?.accessToken || '',
          authorUrn: merged.channels?.linkedin?.authorUrn || ''
        },
        twitter: {
          enabled: Boolean(merged.channels?.twitter?.enabled),
          apiKey: merged.channels?.twitter?.apiKey || '',
          apiSecret: merged.channels?.twitter?.apiSecret || '',
          accessToken: merged.channels?.twitter?.accessToken || '',
          accessTokenSecret: merged.channels?.twitter?.accessTokenSecret || merged.channels?.twitter?.accessSecret || '',
          bearerToken: merged.channels?.twitter?.bearerToken || ''
        },
        telegram: {
          enabled: Boolean(merged.channels?.telegram?.enabled),
          botToken: merged.channels?.telegram?.botToken || '',
          chatId: merged.channels?.telegram?.chatId || ''
        },
        meta: {
          enabled: Boolean(merged.channels?.meta?.enabled),
          pageAccessToken: merged.channels?.meta?.pageAccessToken || '',
          pageId: merged.channels?.meta?.pageId || '',
          instagramAccountId: merged.channels?.meta?.instagramAccountId || ''
        },
        buffer: {
          enabled: Boolean(merged.channels?.buffer?.enabled),
          accessToken: merged.channels?.buffer?.accessToken || '',
          profileIds: Array.isArray(merged.channels?.buffer?.profileIds)
            ? merged.channels.buffer.profileIds
            : (typeof merged.channels?.buffer?.profileIds === 'string'
              ? merged.channels.buffer.profileIds.split(',').map(s => s.trim()).filter(Boolean)
              : [])
        }
      },
      generateAiImage: Boolean(merged.generateAiImage),
      defaultHashtags: Array.isArray(merged.defaultHashtags) ? merged.defaultHashtags : [],
      callToAction: merged.callToAction || '',
      includeFirstComment: Boolean(merged.includeFirstComment !== false),
      commentTemplate: merged.commentTemplate || '👉 Acesse o artigo completo: {URL}'
    };

    fs.writeFileSync(targetFile, JSON.stringify(sanitizedClient, null, 2), 'utf8');
    res.json({ success: true, client: maskClientSecrets(sanitizedClient) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Deletar cliente
app.delete('/api/clients/:id', requireAuth, (req, res) => {
  try {
    const safeId = sanitizeIdentifier(req.params.id);
    if (safeId === 'default' || safeId === 'anaue-design') {
      return res.status(400).json({ error: 'Clientes padrão do sistema não podem ser excluídos.' });
    }

    const clientsDir = path.join(__dirname, 'config', 'clients');
    const filePath = safePathResolve(clientsDir, `${safeId}.json`);

    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      return res.json({ success: true, message: `Cliente ${safeId} excluído com sucesso.` });
    }
    res.status(404).json({ error: 'Cliente não encontrado.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Testar conexão de LLM ou Canais do Cliente salvo
app.post('/api/clients/:id/test-connection', requireAuth, async (req, res) => {
  try {
    const safeId = sanitizeIdentifier(req.params.id);
    const clientsDir = path.join(__dirname, 'config', 'clients');
    const filePath = safePathResolve(clientsDir, `${safeId}.json`);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Cliente não encontrado.' });
    }

    const client = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const { target = 'all' } = req.body || {};

    const testResults = {};

    // 1. Testar LLM
    if (target === 'all' || target === 'llm') {
      testResults.llm = await testLlmConnection({
        provider: client.llm?.provider,
        apiKey: client.llm?.apiKey,
        model: client.llm?.model,
        baseUrl: client.llm?.baseUrl
      });
    }

    // 2. Testar Canais de Redes Sociais
    const channels = client.channels || {};
    const channelKeys = ['webhook', 'telegram', 'buffer', 'linkedin', 'twitter', 'meta', 'googlebusiness', 'tiktok'];

    for (const ch of channelKeys) {
      if ((target === 'all' || target === ch) && channels[ch]?.enabled) {
        testResults[ch] = await testChannelConnection(ch, channels[ch]);
      }
    }

    res.json({ success: true, client: client.id, testResults });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Testar conexão de LLM diretamente com dados do formulário da UI
app.post('/api/clients/test-llm-direct', requireAuth, async (req, res) => {
  try {
    const { provider, apiKey, model, baseUrl, clientId } = req.body || {};
    let realApiKey = apiKey;

    // Se a chave veio mascarada da UI, recupera a chave real do cliente salvo
    if (clientId && apiKey && (apiKey.includes('...') || apiKey.includes('••••'))) {
      const safeId = sanitizeIdentifier(clientId);
      const clientsDir = path.join(__dirname, 'config', 'clients');
      const filePath = safePathResolve(clientsDir, `${safeId}.json`);
      if (fs.existsSync(filePath)) {
        try {
          const client = JSON.parse(fs.readFileSync(filePath, 'utf8'));
          realApiKey = client.llm?.apiKey || '';
        } catch {}
      }
    }

    const result = await testLlmConnection({
      provider: provider || 'auto',
      apiKey: realApiKey,
      model,
      baseUrl
    });

    res.json(result);
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Testar canal de rede social diretamente com dados do formulário da UI
app.post('/api/clients/test-channel-direct', requireAuth, async (req, res) => {
  try {
    const { channel, config, clientId } = req.body || {};
    let testConfig = { ...(config || {}) };

    // Se tokens vieram mascarados, recupera da configuração salva
    if (clientId) {
      const safeId = sanitizeIdentifier(clientId);
      const clientsDir = path.join(__dirname, 'config', 'clients');
      const filePath = safePathResolve(clientsDir, `${safeId}.json`);
      if (fs.existsSync(filePath)) {
        try {
          const client = JSON.parse(fs.readFileSync(filePath, 'utf8'));
          const existingCh = client.channels?.[channel] || {};
          for (const key of Object.keys(testConfig)) {
            if (typeof testConfig[key] === 'string' && (testConfig[key].includes('...') || testConfig[key].includes('••••'))) {
              testConfig[key] = existingCh[key] || '';
            }
          }
        } catch {}
      }
    }

    const result = await testChannelConnection(channel, testConfig);
    res.json(result);
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ---------------------------------------------------------------------------
// 1.5. MOTOR DE DECISÃO INTELIGENTE: JEV (TYPESAFE AI)
// ---------------------------------------------------------------------------

// Status do motor Jev
app.get('/api/jev/status', requireAuth, (req, res) => {
  const hasEnvKey = Boolean(process.env.TYPESAFE_API_KEY || process.env.JEV_API_KEY);
  res.json({
    active: true,
    model: 'jev-system-one',
    provider: 'TypeSafe AI',
    hasGlobalKey: hasEnvKey,
    mode: hasEnvKey ? 'typesafe_cloud' : 'hybrid_heuristic',
    description: 'Motor de decisão inteligente para triagem, brand safety, pontuação de aderência e roteamento multicanal.'
  });
});

// Testar conexão/chave do Jev (TypeSafe AI)
app.post('/api/jev/test', requireAuth, async (req, res) => {
  try {
    const { apiKey, clientId } = req.body || {};
    let keyToTest = apiKey;

    if (clientId && (!keyToTest || keyToTest.includes('...') || keyToTest.includes('••••'))) {
      const safeId = sanitizeIdentifier(clientId);
      const clientsDir = path.join(__dirname, 'config', 'clients');
      const filePath = safePathResolve(clientsDir, `${safeId}.json`);
      if (fs.existsSync(filePath)) {
        try {
          const client = JSON.parse(fs.readFileSync(filePath, 'utf8'));
          keyToTest = client.jev?.apiKey || process.env.TYPESAFE_API_KEY || process.env.JEV_API_KEY || '';
        } catch {}
      }
    }

    if (!keyToTest) {
      keyToTest = process.env.TYPESAFE_API_KEY || process.env.JEV_API_KEY || '';
    }

    const result = await testJevConnection(keyToTest);
    res.json(result);
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Avaliar conteúdo pontual via Jev
app.post('/api/jev/evaluate', requireAuth, async (req, res) => {
  try {
    const { title, text, clientId } = req.body || {};
    let clientConfig = {};

    if (clientId) {
      const safeId = sanitizeIdentifier(clientId);
      const clientsDir = path.join(__dirname, 'config', 'clients');
      const filePath = safePathResolve(clientsDir, `${safeId}.json`);
      if (fs.existsSync(filePath)) {
        try {
          clientConfig = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        } catch {}
      }
    }

    const evaluation = await evaluateContentWithJev({
      title: title || 'Conteúdo de Análise',
      text: text || '',
      client: clientConfig
    });

    res.json({ success: true, evaluation });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ---------------------------------------------------------------------------
// 2. BACKGROUND QUEUE & AGENDAMENTO MULTICANAL
// ---------------------------------------------------------------------------

// Listar todos os trabalhos na fila de background
app.get('/api/queue', requireAuth, (req, res) => {
  try {
    const jobs = getJobs();
    res.json(jobs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Enfileirar pacote para publicação imediata ou agendada em background
app.post('/api/queue', requireAuth, rateLimiter, (req, res) => {
  try {
    const { packageId, clientId, scheduledFor, targetChannels } = req.body || {};

    if (!packageId) {
      return res.status(400).json({ error: 'packageId é obrigatório para agendamento na fila.' });
    }

    const safePackageId = sanitizeIdentifier(packageId);
    const job = enqueueJob({
      packageId: safePackageId,
      clientId: clientId ? sanitizeIdentifier(clientId) : 'default',
      scheduledFor,
      targetChannels: Array.isArray(targetChannels) ? targetChannels : []
    });

    res.json({
      success: true,
      message: job.status === 'scheduled' && scheduledFor
        ? `Pacote agendado para publicação em ${new Date(scheduledFor).toLocaleString('pt-BR')}`
        : 'Disparo em background iniciado.',
      job
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Repetir disparo de um trabalho da fila
app.post('/api/queue/:id/retry', requireAuth, (req, res) => {
  try {
    const job = retryJob(req.params.id);
    if (!job) return res.status(404).json({ error: 'Job não encontrado na fila.' });
    res.json({ success: true, message: 'Tentativa de disparo reiniciada.', job });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Cancelar agendamento de um trabalho da fila
app.delete('/api/queue/:id', requireAuth, (req, res) => {
  try {
    const job = cancelJob(req.params.id);
    if (!job) return res.status(404).json({ error: 'Job não encontrado na fila.' });
    res.json({ success: true, message: 'Agendamento cancelado com sucesso.', job });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Limpar trabalhos concluídos ou cancelados
app.post('/api/queue/clear-completed', requireAuth, (req, res) => {
  try {
    const result = clearCompleted();
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// 2.5. CALENDÁRIO EDITORIAL INTELIGENTE & AUTOMAÇÃO RSS (FASE 2)
// ---------------------------------------------------------------------------

// Obter eventos consolidados do calendário (agendamentos futuros + histórico)
app.get('/api/calendar/events', requireAuth, (req, res) => {
  try {
    const { year, month, clientId } = req.query;
    const parsedYear = year ? parseInt(year, 10) : undefined;
    const parsedMonth = month ? parseInt(month, 10) : undefined;

    const data = getCalendarEvents({
      year: parsedYear,
      month: parsedMonth,
      clientId: clientId && clientId !== 'all' ? clientId : undefined
    });

    res.json({
      success: true,
      ...data
    });
  } catch (err) {
    console.error('[CALENDAR API ERRO]:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Sugerir o próximo horário de pico / ideal (Smart Scheduler)
app.get('/api/schedule/next-slot', requireAuth, (req, res) => {
  try {
    const { clientId, preferredHour } = req.query;
    const hour = preferredHour ? parseInt(preferredHour, 10) : undefined;

    const slot = getNextAvailableSlot(clientId || 'anaue-design', hour);

    res.json({
      success: true,
      slot
    });
  } catch (err) {
    console.error('[SMART SCHEDULER ERRO]:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Disparar checagem autônoma de RSS dos clientes (Zero-Click Ingestor)
app.post('/api/rss/check', requireAuth, async (req, res) => {
  try {
    const { force, clientId } = req.body || {};
    const result = await checkClientFeeds({
      force: Boolean(force),
      clientId: clientId && clientId !== 'all' ? clientId : undefined
    });

    res.json({
      success: true,
      ...result
    });
  } catch (err) {
    console.error('[RSS CHECK API ERRO]:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Obter status e histórico de execuções do RSS Watcher
app.get('/api/rss/status', requireAuth, (req, res) => {
  try {
    const history = loadRssHistory();
    res.json({
      success: true,
      ...history
    });
  } catch (err) {
    console.error('[RSS STATUS API ERRO]:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// 2.8. ANALYTICS UNIFICADO, MÉTRICAS DE ENGAJAMENTO & EVERGREEN (FASE 3)
// ---------------------------------------------------------------------------

// Visão geral consolidada de Analytics e KPIs
app.get('/api/analytics/overview', requireAuth, (req, res) => {
  try {
    const { clientId, periodDays } = req.query;
    const days = periodDays ? parseInt(periodDays, 10) : 30;

    const data = getConsolidatedAnalytics({
      clientId: clientId && clientId !== 'all' ? clientId : undefined,
      periodDays: days
    });

    res.json({
      success: true,
      ...data
    });
  } catch (err) {
    console.error('[ANALYTICS API ERRO]:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Oportunidades de reciclagem de conteúdo Evergreen
app.get('/api/analytics/evergreen', requireAuth, (req, res) => {
  try {
    const { clientId } = req.query;
    const data = getConsolidatedAnalytics({
      clientId: clientId && clientId !== 'all' ? clientId : undefined,
      periodDays: 0 // Sem corte de dias para evergreen
    });

    res.json({
      success: true,
      evergreenPosts: data.evergreenPosts || []
    });
  } catch (err) {
    console.error('[EVERGREEN API ERRO]:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Disparar reciclagem de post com hook alternativo no Smart Slot
app.post('/api/analytics/recycle', requireAuth, (req, res) => {
  try {
    const { packageId, hookType } = req.body || {};
    if (!packageId) {
      return res.status(400).json({ error: 'packageId é obrigatório.' });
    }

    const recyclePlan = prepareEvergreenRecycle(packageId, hookType || 'contrarian');

    // Enfileira o job na fila de background usando o próximo smart slot
    const slot = getNextAvailableSlot(recyclePlan.client || 'anaue-design');
    const job = enqueueJob({
      packageId,
      clientId: recyclePlan.client,
      targetChannels: recyclePlan.suggestedChannels,
      scheduledFor: slot.iso
    });

    res.json({
      success: true,
      message: `Conteúdo evergreen reciclado com sucesso para ${slot.formatted}!`,
      recyclePlan,
      scheduledSlot: slot,
      job
    });
  } catch (err) {
    console.error('[RECYCLE API ERRO]:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Exportar relatório de performance em CSV
app.get('/api/analytics/export', requireAuth, (req, res) => {
  try {
    const { clientId, periodDays } = req.query;
    const data = getConsolidatedAnalytics({
      clientId: clientId && clientId !== 'all' ? clientId : undefined,
      periodDays: periodDays ? parseInt(periodDays, 10) : 30
    });

    const headers = ['Data', 'ID do Pacote', 'Título', 'Marca', 'Alcance', 'Impressões', 'Cliques', 'Curtidas', 'Comentários', 'Compartilhamentos', 'Taxa Engajamento (%)', 'Carrossel'];
    const rows = (data.posts || []).map(p => [
      `"${p.formattedDate}"`,
      `"${p.packageId}"`,
      `"${(p.title || '').replace(/"/g, '""')}"`,
      `"${p.brandName || p.client}"`,
      p.reach,
      p.impressions,
      p.clicks,
      p.likes,
      p.comments,
      p.shares,
      `"${p.engagementRate}%"`,
      p.hasCarousel ? 'Sim' : 'Não'
    ]);

    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="pub_rs_analytics_${Date.now()}.csv"`);
    res.send('\uFEFF' + csvContent); // BOM UTF-8 para Excel
  } catch (err) {
    console.error('[EXPORT API ERRO]:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// 3. DISPARO DIRETO E HISTÓRICO DE PACOTES GERADOS
// ---------------------------------------------------------------------------

// Publicar pacote diretamente nos canais do cliente
app.post('/api/packages/:packageId/publish', requireAuth, rateLimiter, async (req, res) => {
  try {
    const safePackageId = sanitizeIdentifier(req.params.packageId);
    const { targetChannels } = req.body || {};
    const outputBase = path.join(__dirname, 'output');
    const packageDir = safePathResolve(outputBase, safePackageId);

    if (!fs.existsSync(packageDir)) {
      return res.status(404).json({ error: 'Pacote não encontrado.' });
    }

    const payloadPath = path.join(packageDir, 'payload.json');
    if (!fs.existsSync(payloadPath)) {
      return res.status(400).json({ error: 'payload.json do pacote não encontrado.' });
    }

    const payload = JSON.parse(fs.readFileSync(payloadPath, 'utf8'));
    let clientId = 'default';
    if (typeof payload.client === 'object' && payload.client) {
      clientId = payload.client.id || 'default';
    } else if (typeof payload.client === 'string' && payload.client) {
      clientId = payload.client;
    }
    const client = loadClientConfig(clientId);

    // Auto-reparo: se porventura o pacote foi salvo com copies vazias, regenera dinamicamente antes de despachar
    let copies = payload.copies;
    if (!copies || !copies.linkedin?.post || copies.linkedin.post.trim().length === 0) {
      console.warn(`[PUBLISH API] Copies ausentes ou vazias no pacote ${safePackageId}. Gerando cópias de contingência...`);
      const { generateAlgorithmicCopies } = require('./src/copywriter');
      copies = generateAlgorithmicCopies(payload.article || { title: safePackageId }, client);
      payload.copies = copies;
      try {
        fs.writeFileSync(payloadPath, JSON.stringify(payload, null, 2), 'utf8');
      } catch {}
    }

    console.log(`\n🚀 [PUBLISH API] Disparando pacote ${safePackageId} para os canais de "${client.brandName}"...`);

    const dispatchResult = await dispatchToClientChannels({
      client,
      copies,
      images: payload.images,
      article: payload.article,
      video: payload.video,
      packageId: safePackageId,
      outputDir: packageDir,
      targetChannels: Array.isArray(targetChannels) ? targetChannels : null
    });

    res.json({
      success: true,
      packageId: safePackageId,
      dispatchResult
    });
  } catch (err) {
    console.error('[PUBLISH API ERRO]:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Obter logs de despacho de um pacote
app.get('/api/packages/:packageId/dispatch-log', requireAuth, (req, res) => {
  try {
    const safePackageId = sanitizeIdentifier(req.params.packageId);
    const outputBase = path.join(__dirname, 'output');
    const logPath = safePathResolve(path.join(outputBase, safePackageId), 'dispatch_log.json');

    if (!fs.existsSync(logPath)) {
      return res.json({ dispatched: false, message: 'Nenhum disparo registrado para este pacote.' });
    }

    const log = JSON.parse(fs.readFileSync(logPath, 'utf8'));
    res.json({ dispatched: true, log });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// 3. HISTÓRICO DE PACOTES GERADOS
// ---------------------------------------------------------------------------

// Listar pacotes salvos em output/
app.get('/api/packages', requireAuth, (req, res) => {
  const outputBase = path.join(__dirname, 'output');
  if (!fs.existsSync(outputBase)) {
    return res.json([]);
  }

  const dirs = fs.readdirSync(outputBase, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name)
    .sort()
    .reverse();

  const packages = dirs.map(dirName => {
    try {
      const payloadPath = path.join(outputBase, dirName, 'payload.json');
      if (fs.existsSync(payloadPath)) {
        const payload = JSON.parse(fs.readFileSync(payloadPath, 'utf8'));
        return {
          id: dirName,
          title: payload.article?.title || dirName,
          url: payload.article?.url || '',
          client: payload.brand || payload.client,
          generatedAt: payload.generatedAt || '',
          generator: payload.copies?.meta?.generator || 'pub_rs Engine'
        };
      }
    } catch {
      // Ignora erro de leitura
    }
    return {
      id: dirName,
      title: dirName.replace(/^\d{4}-\d{2}-\d{2}_/, '').replace(/-/g, ' '),
      client: 'output'
    };
  });

  res.json(packages);
});

// Obter detalhes de um pacote salvo
app.get('/api/packages/:packageId', requireAuth, (req, res) => {
  try {
    const safePackageId = sanitizeIdentifier(req.params.packageId);
    const outputBase = path.join(__dirname, 'output');
    const packageDir = safePathResolve(outputBase, safePackageId);

    if (!fs.existsSync(packageDir)) {
      return res.status(404).json({ error: 'Pacote não encontrado.' });
    }

    const payloadPath = path.join(packageDir, 'payload.json');
    const reportPath = path.join(packageDir, 'PACOTE_REDES_SOCIAIS.md');

    let payload = null;
    let reportMd = '';

    if (fs.existsSync(payloadPath)) {
      payload = JSON.parse(fs.readFileSync(payloadPath, 'utf8'));
    }
    if (fs.existsSync(reportPath)) {
      reportMd = fs.readFileSync(reportPath, 'utf8');
    }

    // Listar mídias disponíveis
    const imagesDir = path.join(packageDir, 'images');
    const mediaFiles = fs.existsSync(imagesDir)
      ? fs.readdirSync(imagesDir).map(file => ({
          fileName: file,
          format: file.replace(/\.(webp|jpg|mp4|mov|webm)$/, ''),
          ext: path.extname(file).replace('.', ''),
          url: `/api/media/${safePackageId}/${file}`
        }))
      : [];

    // Identificar se há vídeo anexado
    let videoInfo = payload?.video || null;
    if (!videoInfo && fs.existsSync(imagesDir)) {
      const videoFiles = ['video_post.mp4', 'video_post.mov', 'video_post.webm'];
      for (const vf of videoFiles) {
        const vp = path.join(imagesDir, vf);
        if (fs.existsSync(vp)) {
          videoInfo = {
            filename: vf,
            size: fs.statSync(vp).size,
            url: `/api/media/${safePackageId}/${vf}`
          };
          break;
        }
      }
    }

    res.json({
      packageId: safePackageId,
      payload,
      reportMd,
      mediaFiles,
      video: videoInfo
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Deletar pacote salvo do histórico
app.delete('/api/packages/:packageId', requireAuth, (req, res) => {
  try {
    const safePackageId = sanitizeIdentifier(req.params.packageId);
    const outputBase = path.join(__dirname, 'output');
    const packageDir = safePathResolve(outputBase, safePackageId);

    if (!fs.existsSync(packageDir)) {
      return res.status(404).json({ error: 'Pacote não encontrado.' });
    }

    fs.rmSync(packageDir, { recursive: true, force: true });
    res.json({ success: true, message: `Pacote ${safePackageId} removido com sucesso.` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Servir arquivos de mídia, vídeos e carrossel PDF gerados com segurança
function serveMediaFile(req, res, packageId, subDir, filename) {
  try {
    const safePackageId = sanitizeIdentifier(packageId);
    const safeFilename = path.basename(filename);
    const outputBase = path.join(__dirname, 'output');
    const targetDir = subDir 
      ? path.join(outputBase, safePackageId, 'images', subDir)
      : path.join(outputBase, safePackageId, 'images');
    const filePath = safePathResolve(targetDir, safeFilename);

    if (!fs.existsSync(filePath)) {
      return res.status(404).send('Arquivo não encontrado.');
    }

    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes = {
      '.webp': 'image/webp',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.pdf': 'application/pdf',
      '.mp4': 'video/mp4',
      '.mov': 'video/quicktime',
      '.webm': 'video/webm'
    };

    const contentType = mimeTypes[ext] || 'application/octet-stream';
    res.setHeader('Content-Type', contentType);
    if (ext === '.pdf') {
      res.setHeader('Content-Disposition', `inline; filename="${safeFilename}"`);
    }

    // Suporte nativo a streaming de vídeo com HTTP Range (206 Partial Content) para navegadores e APIs de redes sociais (Buffer/Instagram)
    if (ext === '.mp4' || ext === '.mov' || ext === '.webm') {
      return res.sendFile(path.resolve(filePath));
    }

    res.setHeader('Cache-Control', 'public, max-age=86400');
    fs.createReadStream(filePath).pipe(res);
  } catch (err) {
    res.status(400).send('Requisição inválida.');
  }
}

app.get('/api/media/:packageId/carousel/:filename', (req, res) => {
  serveMediaFile(req, res, req.params.packageId, 'carousel', req.params.filename);
});

app.get('/api/media/:packageId/:filename', (req, res) => {
  serveMediaFile(req, res, req.params.packageId, null, req.params.filename);
});

// Anexar vídeo pronto (.mp4, .mov, .webm) ao pacote de publicação
app.post('/api/packages/:packageId/video', requireAuth, express.raw({ type: ['video/*', 'application/octet-stream'], limit: '250mb' }), async (req, res) => {
  try {
    const safePackageId = sanitizeIdentifier(req.params.packageId);
    const outputBase = path.join(__dirname, 'output');
    const packageDir = safePathResolve(outputBase, safePackageId);
    const imagesDir = path.join(packageDir, 'images');

    if (!fs.existsSync(packageDir)) {
      return res.status(404).json({ error: 'Pacote não encontrado.' });
    }

    if (!fs.existsSync(imagesDir)) {
      fs.mkdirSync(imagesDir, { recursive: true });
    }

    if (!req.body || !Buffer.isBuffer(req.body) || req.body.length === 0) {
      return res.status(400).json({ error: 'Nenhum dado de vídeo foi enviado no corpo da requisição.' });
    }

    const originalName = req.query.filename ? path.basename(req.query.filename) : 'video_post.mp4';
    const ext = path.extname(originalName).toLowerCase() || '.mp4';
    if (!['.mp4', '.mov', '.webm'].includes(ext)) {
      return res.status(400).json({ error: 'Formato inválido. Envie um vídeo .mp4, .mov ou .webm.' });
    }

    const videoFilename = `video_post${ext}`;
    const videoPath = path.join(imagesDir, videoFilename);
    fs.writeFileSync(videoPath, req.body);

    // Registra o vídeo anexado no payload.json do pacote
    const payloadPath = path.join(packageDir, 'payload.json');
    if (fs.existsSync(payloadPath)) {
      try {
        const payload = JSON.parse(fs.readFileSync(payloadPath, 'utf8'));
        payload.video = {
          filename: videoFilename,
          originalName,
          size: req.body.length,
          uploadedAt: new Date().toISOString(),
          url: `/api/media/${safePackageId}/${videoFilename}`
        };
        fs.writeFileSync(payloadPath, JSON.stringify(payload, null, 2), 'utf8');
      } catch {}
    }

    const baseUrl = process.env.BASE_URL || 'https://social360.anauedesign.com.br';
    console.log(`🎬 [VÍDEO] Novo vídeo anexado ao pacote ${safePackageId}: ${videoFilename} (${(req.body.length / (1024 * 1024)).toFixed(2)} MB)`);

    res.json({
      success: true,
      message: 'Vídeo anexado com sucesso ao pacote!',
      video: {
        filename: videoFilename,
        size: req.body.length,
        url: `/api/media/${safePackageId}/${videoFilename}`,
        publicUrl: `${baseUrl}/api/media/${safePackageId}/${videoFilename}`
      }
    });
  } catch (err) {
    res.status(500).json({ error: `Erro ao processar upload de vídeo: ${err.message}` });
  }
});

// Remover vídeo anexado do pacote
app.delete('/api/packages/:packageId/video', requireAuth, (req, res) => {
  try {
    const safePackageId = sanitizeIdentifier(req.params.packageId);
    const outputBase = path.join(__dirname, 'output');
    const packageDir = safePathResolve(outputBase, safePackageId);
    const imagesDir = path.join(packageDir, 'images');

    const videoFiles = ['video_post.mp4', 'video_post.mov', 'video_post.webm'];
    for (const vf of videoFiles) {
      const p = path.join(imagesDir, vf);
      if (fs.existsSync(p)) {
        try { fs.unlinkSync(p); } catch {}
      }
    }

    const payloadPath = path.join(packageDir, 'payload.json');
    if (fs.existsSync(payloadPath)) {
      try {
        const payload = JSON.parse(fs.readFileSync(payloadPath, 'utf8'));
        delete payload.video;
        fs.writeFileSync(payloadPath, JSON.stringify(payload, null, 2), 'utf8');
      } catch {}
    }

    console.log(`🗑 [VÍDEO] Vídeo removido do pacote ${safePackageId}.`);
    res.json({ success: true, message: 'Vídeo removido com sucesso.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Gerar vídeo com locução IA e legendas dinâmicas para o pacote (Opção C)
app.post('/api/packages/:packageId/generate-video', requireAuth, rateLimiter, async (req, res) => {
  try {
    const safePackageId = sanitizeIdentifier(req.params.packageId);
    const outputBase = path.join(__dirname, 'output');
    const packageDir = safePathResolve(outputBase, safePackageId);

    if (!fs.existsSync(packageDir)) {
      return res.status(404).json({ error: 'Pacote não encontrado.' });
    }

    const { voice, speed } = req.body || {};
    const { generateAiVideoForPackage } = require('./src/videoGen');

    const payloadPath = path.join(packageDir, 'payload.json');
    let clientConfig = {};
    if (fs.existsSync(payloadPath)) {
      try {
        const payload = JSON.parse(fs.readFileSync(payloadPath, 'utf8'));
        const clientId = payload.client || 'anaue-design';
        clientConfig = loadClientConfig(clientId);
      } catch {}
    }

    console.log(`\n🎬 [VIDEOGEN IA] Solicitando geração de vídeo para pacote ${safePackageId}...`);
    const result = await generateAiVideoForPackage(packageDir, safePackageId, {
      voice,
      speed,
      client: clientConfig
    });

    res.json(result);
  } catch (err) {
    console.error(`[VIDEOGEN ERRO] Falha ao gerar vídeo IA para ${req.params.packageId}:`, err.message);
    res.status(500).json({ error: err.message });
  }
});

// Regenerar imagem conceitual de background com IA para o pacote (Estúdio de Mídias)
app.post('/api/packages/:packageId/regenerate-image', requireAuth, rateLimiter, async (req, res) => {
  try {
    const safePackageId = sanitizeIdentifier(req.params.packageId);
    const outputBase = path.join(__dirname, 'output');
    const packageDir = safePathResolve(outputBase, safePackageId);

    if (!fs.existsSync(packageDir)) {
      return res.status(404).json({ error: 'Pacote não encontrado.' });
    }

    const payloadPath = path.join(packageDir, 'payload.json');
    let payload = {};
    if (fs.existsSync(payloadPath)) {
      payload = JSON.parse(fs.readFileSync(payloadPath, 'utf8'));
    }

    const { loadClientConfig } = require('./src/pipeline');
    const { processSocialImages } = require('./src/imageProcessor');
    const { generateCarousel } = require('./src/carouselGenerator');

    const clientId = payload.client || 'anaue-design';
    const client = loadClientConfig(clientId);
    const article = payload.article || { title: 'Artigo', slug: safePackageId };
    const imageProvider = (req.body?.imageProvider || req.body?.imageEngine || 'pollinations').toLowerCase();
    const visualStyle = req.body?.visualStyle || article.visualStyle;

    // Deriva a cena visual específica conforme o critério do título em questão
    const { deriveVisualSceneFromTitle } = require('./src/imageGen');
    const visualPromptHint = await deriveVisualSceneFromTitle({
      title: article.title,
      description: article.description,
      client,
      visualStyle,
      promptHint: req.body?.promptHint
    });

    console.log(`\n🎨 [ESTÚDIO DE MÍDIAS] Regenerando background com motor "${imageProvider}" conforme critério do título: "${article.title}"...`);
    const images = await processSocialImages(null, packageDir, {
      client,
      title: article.title,
      article,
      aiImage: true,
      imageProvider,
      visualStyle,
      visualPromptHint,
      seed: Math.floor(Math.random() * 9999999)
    });

    article.visualPromptHint = visualPromptHint;
    payload.article.visualPromptHint = visualPromptHint;

    let carousel = null;
    if (payload.copies) {
      try {
        carousel = await generateCarousel({
          article,
          client,
          copies: payload.copies,
          outputDir: packageDir
        });
      } catch (err) {
        console.warn(`[Aviso Carrossel] Falha ao atualizar carrossel: ${err.message}`);
      }
    }

    payload.images = images;
    if (carousel) payload.carousel = carousel;
    fs.writeFileSync(payloadPath, JSON.stringify(payload, null, 2));

    res.json({
      success: true,
      images,
      carousel,
      message: 'Imagem de background regenerada com sucesso!'
    });
  } catch (err) {
    console.error(`[IMAGEM ERRO] Falha ao regenerar imagem para ${req.params.packageId}:`, err.message);
    res.status(500).json({ error: err.message });
  }
});

// Upload manual de nova imagem de background para o pacote (Estúdio de Mídias)
app.post('/api/packages/:packageId/upload-image', requireAuth, express.raw({ type: ['image/*', 'application/octet-stream'], limit: '30mb' }), async (req, res) => {
  try {
    const safePackageId = sanitizeIdentifier(req.params.packageId);
    const outputBase = path.join(__dirname, 'output');
    const packageDir = safePathResolve(outputBase, safePackageId);

    if (!fs.existsSync(packageDir)) {
      return res.status(404).json({ error: 'Pacote não encontrado.' });
    }

    if (!req.body || req.body.length === 0) {
      return res.status(400).json({ error: 'Nenhum dado de imagem recebido no upload.' });
    }

    const imagesDir = path.join(packageDir, 'images');
    if (!fs.existsSync(imagesDir)) fs.mkdirSync(imagesDir, { recursive: true });

    const customImgPath = path.join(imagesDir, 'custom_cover_original.jpg');
    fs.writeFileSync(customImgPath, req.body);

    const payloadPath = path.join(packageDir, 'payload.json');
    let payload = {};
    if (fs.existsSync(payloadPath)) {
      payload = JSON.parse(fs.readFileSync(payloadPath, 'utf8'));
    }

    const { loadClientConfig } = require('./src/pipeline');
    const { processSocialImages } = require('./src/imageProcessor');
    const { generateCarousel } = require('./src/carouselGenerator');

    const clientId = payload.client || 'anaue-design';
    const client = loadClientConfig(clientId);
    const article = payload.article || { title: 'Artigo', slug: safePackageId };

    console.log(`\n📤 [ESTÚDIO DE MÍDIAS] Nova imagem de background recebida via upload (${(req.body.length / 1024).toFixed(1)} KB)...`);
    const images = await processSocialImages(customImgPath, packageDir, {
      client,
      title: article.title,
      article
    });

    let carousel = null;
    if (payload.copies) {
      try {
        carousel = await generateCarousel({
          article,
          client,
          copies: payload.copies,
          outputDir: packageDir
        });
      } catch (err) {
        console.warn(`[Aviso Carrossel] Falha ao atualizar carrossel: ${err.message}`);
      }
    }

    payload.images = images;
    if (carousel) payload.carousel = carousel;
    fs.writeFileSync(payloadPath, JSON.stringify(payload, null, 2));

    res.json({
      success: true,
      images,
      carousel,
      message: 'Nova imagem de background aplicada com sucesso às peças!'
    });
  } catch (err) {
    console.error(`[UPLOAD IMAGEM ERRO] Falha no upload para ${req.params.packageId}:`, err.message);
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// 4. EXECUÇÃO DO PIPELINE & IDEAÇÃO DE PAUTAS
// ---------------------------------------------------------------------------

// Sugerir ideias de pautas com base nos interesses/pilares do cliente (AI Brainstorming)
app.post('/api/topics/suggest', requireAuth, rateLimiter, async (req, res) => {
  try {
    const { clientId, count, provider, model } = req.body || {};
    const safeClientId = clientId ? sanitizeIdentifier(clientId) : 'anaue-design';
    const client = loadClientConfig(safeClientId);

    console.log(`\n💡 [AI BRAINSTORMING] Gerando sugestões de pautas para "${client.name || client.brandName}"...`);
    const result = await suggestTopicIdeas(client, {
      count: parseInt(count, 10) || 4,
      provider,
      model
    });

    res.json({
      success: true,
      clientId: client.id,
      ...result
    });
  } catch (err) {
    console.error('[TOPIC SUGGEST ERRO]:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Execução padrão via POST JSON
app.post('/api/generate', requireAuth, rateLimiter, async (req, res) => {
  try {
    // Validação de cota do plano SaaS
    const quotaCheck = checkUserQuota(req.user.id);
    if (!quotaCheck.allowed) {
      return res.status(403).json({ error: quotaCheck.error, code: 'QUOTA_EXCEEDED' });
    }

    const { mode = 'url', url, topic, archetype, visualStyle, clientId, provider, model, aiImage } = req.body;
    const isTopicMode = mode === 'topic' || (Boolean(topic) && !url);

    if (!isTopicMode && !url) {
      return res.status(400).json({ error: 'A URL do artigo é obrigatória para o modo por URL.' });
    }
    if (isTopicMode && (!topic || !topic.trim())) {
      return res.status(400).json({ error: 'O tema/tópico é obrigatório para o modo por interesses.' });
    }

    const result = await runPipeline({
      mode: isTopicMode ? 'topic' : 'url',
      url,
      topic,
      archetype,
      visualStyle,
      clientId: clientId || 'anaue-design',
      provider,
      model,
      aiImage: Boolean(aiImage)
    });

    // Incrementa o uso mensal do plano do usuário
    incrementUserUsage(req.user.id);

    res.json({
      success: true,
      packageId: result.packageId,
      article: result.article,
      client: result.client,
      copies: result.copies,
      images: result.images,
      carousel: result.carousel,
      webhookResult: result.dispatchResult.webhookResult
    });
  } catch (err) {
    console.error('[API ERRO]:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Execução em tempo real com streaming SSE (Server-Sent Events)
app.get('/api/generate/stream', requireAuth, rateLimiter, async (req, res) => {
  // Validação de cota do plano SaaS
  const quotaCheck = checkUserQuota(req.user.id);
  if (!quotaCheck.allowed) {
    return res.status(403).json({ error: quotaCheck.error, code: 'QUOTA_EXCEEDED' });
  }

  const { mode = 'url', url, topic, archetype, visualStyle, clientId, provider, model, aiImage, imageProvider } = req.query;
  const isTopicMode = mode === 'topic' || (Boolean(topic) && !url);

  if (!isTopicMode && !url) {
    return res.status(400).json({ error: 'A URL do artigo é obrigatória para o modo por URL.' });
  }
  if (isTopicMode && (!topic || !topic.trim())) {
    return res.status(400).json({ error: 'O tema/tópico é obrigatório para o modo por interesses.' });
  }

  // Configuração SSE
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive'
  });

  const sendEvent = (event, data) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  try {
    sendEvent('progress', {
      step: 0,
      status: 'started',
      message: isTopicMode ? 'Iniciando criação a partir de interesses...' : 'Iniciando automação por URL...'
    });

    const result = await runPipeline({
      mode: isTopicMode ? 'topic' : 'url',
      url,
      topic,
      archetype,
      visualStyle,
      clientId: clientId || 'anaue-design',
      provider,
      model,
      aiImage: aiImage === 'true' || aiImage === true,
      imageProvider: imageProvider || 'pollinations',
      onProgress: (progress) => {
        sendEvent('progress', progress);
      }
    });

    // Incrementa cota do plano do usuário ao finalizar com sucesso
    incrementUserUsage(req.user.id);

    sendEvent('done', {
      success: true,
      packageId: result.packageId,
      article: result.article,
      client: result.client,
      copies: result.copies,
      images: result.images,
      carousel: result.carousel,
      webhookResult: result.dispatchResult?.webhookResult
    });
  } catch (err) {
    sendEvent('error', { error: err.message });
  } finally {
    res.end();
  }
});

// Inicialização do Servidor
app.listen(PORT, () => {
  console.log(`
======================================================
  🌐 Social360 Studio — Plataforma Omnichannel Ativa!
======================================================
  Produção: ${BASE_URL}
  Local:    http://localhost:${PORT}
  API:      http://localhost:${PORT}/api/status
======================================================
`);

  // Inicia o worker de publicação e agendamento em background
  startBackgroundWorker(25000);

  // Inicia o Ingestor Autônomo de RSS / Sitemaps dos Clientes (Zero-Click)
  const rssInterval = parseInt(process.env.RSS_INTERVAL_MINUTES, 10) || 30;
  startRssWatcher(rssInterval);
});
