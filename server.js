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
    hasImageGen: Boolean(process.env.OPENAI_API_KEY || process.env.GEMINI_API_KEY)
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
          bearerToken: merged.channels?.twitter?.bearerToken || '',
          accessToken: merged.channels?.twitter?.accessToken || ''
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
    const channelKeys = ['webhook', 'telegram', 'buffer', 'linkedin', 'twitter', 'meta'];

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
    const clientId = payload.client || 'default';
    const client = loadClientConfig(clientId);

    console.log(`\n🚀 [PUBLISH API] Disparando pacote ${safePackageId} para os canais de "${client.brandName}"...`);

    const dispatchResult = await dispatchToClientChannels({
      client,
      copies: payload.copies,
      images: payload.images,
      article: payload.article,
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
          format: file.replace(/\.(webp|jpg)$/, ''),
          ext: path.extname(file).replace('.', ''),
          url: `/api/media/${safePackageId}/${file}`
        }))
      : [];

    res.json({
      packageId: safePackageId,
      payload,
      reportMd,
      mediaFiles
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

// Servir arquivos de mídia e carrossel PDF gerados com segurança
function serveMediaFile(res, packageId, subDir, filename) {
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
      '.pdf': 'application/pdf'
    };

    res.setHeader('Content-Type', mimeTypes[ext] || 'application/octet-stream');
    if (ext === '.pdf') {
      res.setHeader('Content-Disposition', `inline; filename="${path.basename(filePath)}"`);
    }
    res.setHeader('Cache-Control', 'public, max-age=86400');
    fs.createReadStream(filePath).pipe(res);
  } catch (err) {
    res.status(400).send('Requisição inválida.');
  }
}

app.get('/api/media/:packageId/carousel/:filename', (req, res) => {
  serveMediaFile(res, req.params.packageId, 'carousel', req.params.filename);
});

app.get('/api/media/:packageId/:filename', (req, res) => {
  serveMediaFile(res, req.params.packageId, null, req.params.filename);
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

  const { mode = 'url', url, topic, archetype, visualStyle, clientId, provider, model, aiImage } = req.query;
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
  🌐 pub_rs Studio — Plataforma Omnichannel Ativa!
======================================================
  Local:   http://localhost:${PORT}
  API:     http://localhost:${PORT}/api/status
======================================================
`);

  // Inicia o worker de publicação e agendamento em background
  startBackgroundWorker(25000);

  // Inicia o Ingestor Autônomo de RSS / Sitemaps dos Clientes (Zero-Click)
  const rssInterval = parseInt(process.env.RSS_INTERVAL_MINUTES, 10) || 30;
  startRssWatcher(rssInterval);
});
