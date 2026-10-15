require('dotenv').config();
const fs = require('fs');
const path = require('path');
const express = require('express');
const { runPipeline, loadClientConfig } = require('./src/pipeline');
const { detectAvailableProviders } = require('./src/llm');
const { validatePublicUrl, sanitizeIdentifier, safePathResolve } = require('./src/security/validator');
const { maskClientSecrets, mergeClientSecrets } = require('./src/security/masker');
const { dispatchToClientChannels, publishToWebhook } = require('./src/publisher');

const app = express();
const PORT = process.env.PORT || 3001;

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
  const maxRequests = 40;

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
    version: '2.5.0',
    providers: detectAvailableProviders(),
    clients,
    hasImageGen: Boolean(process.env.OPENAI_API_KEY || process.env.GEMINI_API_KEY)
  });
});

// Listar todos os clientes cadastrados (com segredos mascarados)
app.get('/api/clients', (req, res) => {
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
app.get('/api/clients/:id', (req, res) => {
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
app.post('/api/clients', (req, res) => {
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
      tone: merged.tone || 'Profissional e estratégico',
      targetAudience: merged.targetAudience || 'Profissionais e tomadores de decisão',
      llm: {
        provider: merged.llm?.provider || merged.llmProvider || 'auto',
        model: merged.llm?.model || merged.llmModel || '',
        apiKey: merged.llm?.apiKey || ''
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
        meta: {
          enabled: Boolean(merged.channels?.meta?.enabled),
          pageAccessToken: merged.channels?.meta?.pageAccessToken || '',
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
app.delete('/api/clients/:id', (req, res) => {
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

// Testar conexão de LLM ou Canais do Cliente
app.post('/api/clients/:id/test-connection', async (req, res) => {
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

    // 1. Testar Webhook se configurado
    if (client.channels?.webhook?.url) {
      testResults.webhook = await publishToWebhook(client.channels.webhook.url, {
        test: true,
        message: 'Teste de conectividade do pub_rs Studio',
        client: client.id,
        timestamp: new Date().toISOString()
      });
    }

    // 2. Testar LLM dedicada se configurada
    if (client.llm?.apiKey) {
      testResults.llm = {
        configured: true,
        provider: client.llm.provider,
        hasCustomKey: true,
        message: 'Chave de API dedicada registrada no cliente.'
      };
    } else {
      testResults.llm = {
        configured: false,
        message: 'Cliente utiliza as chaves de API globais do sistema (.env).'
      };
    }

    res.json({ success: true, client: client.id, testResults });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// 2. DISPARO E PUBLICAÇÃO MULTICANAL DE PACOTES GERADOS
// ---------------------------------------------------------------------------

// Publicar pacote diretamente nos canais do cliente
app.post('/api/packages/:packageId/publish', rateLimiter, async (req, res) => {
  try {
    const safePackageId = sanitizeIdentifier(req.params.packageId);
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
      outputDir: packageDir
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
app.get('/api/packages/:packageId/dispatch-log', (req, res) => {
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
app.get('/api/packages', (req, res) => {
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
app.get('/api/packages/:packageId', (req, res) => {
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

// Servir arquivos de imagem gerados com segurança
app.get('/api/media/:packageId/:filename', (req, res) => {
  try {
    const safePackageId = sanitizeIdentifier(req.params.packageId);
    const safeFilename = path.basename(req.params.filename);

    const outputBase = path.join(__dirname, 'output');
    const filePath = safePathResolve(path.join(outputBase, safePackageId, 'images'), safeFilename);

    if (!fs.existsSync(filePath)) {
      return res.status(404).send('Arquivo não encontrado.');
    }

    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes = {
      '.webp': 'image/webp',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png'
    };

    res.setHeader('Content-Type', mimeTypes[ext] || 'application/octet-stream');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    fs.createReadStream(filePath).pipe(res);
  } catch (err) {
    res.status(400).send('Requisição inválida.');
  }
});

// ---------------------------------------------------------------------------
// 4. EXECUÇÃO DO PIPELINE
// ---------------------------------------------------------------------------

// Execução padrão via POST JSON
app.post('/api/generate', rateLimiter, async (req, res) => {
  try {
    const { url, clientId, provider, model, aiImage } = req.body;

    if (!url) {
      return res.status(400).json({ error: 'A URL do artigo é obrigatória.' });
    }

    const result = await runPipeline({
      url,
      clientId: clientId || 'anaue-design',
      provider,
      model,
      aiImage: Boolean(aiImage)
    });

    res.json({
      success: true,
      packageId: result.packageId,
      article: result.article,
      client: result.client,
      copies: result.copies,
      images: result.images,
      webhookResult: result.dispatchResult.webhookResult
    });
  } catch (err) {
    console.error('[API ERRO]:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Execução em tempo real com streaming SSE (Server-Sent Events)
app.get('/api/generate/stream', rateLimiter, async (req, res) => {
  const { url, clientId, provider, model, aiImage } = req.query;

  if (!url) {
    return res.status(400).json({ error: 'A URL do artigo é obrigatória.' });
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
    sendEvent('progress', { step: 0, status: 'started', message: 'Iniciando automação...' });

    const result = await runPipeline({
      url,
      clientId: clientId || 'anaue-design',
      provider,
      model,
      aiImage: aiImage === 'true' || aiImage === true,
      onProgress: (progress) => {
        sendEvent('progress', progress);
      }
    });

    sendEvent('done', {
      success: true,
      packageId: result.packageId,
      article: result.article,
      client: result.client,
      copies: result.copies,
      images: result.images,
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
});
