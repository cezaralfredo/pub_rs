require('dotenv').config();
const fs = require('fs');
const path = require('path');
const express = require('express');
const { runPipeline, loadClientConfig } = require('./src/pipeline');
const { detectAvailableProviders } = require('./src/llm');
const { validatePublicUrl, sanitizeIdentifier, safePathResolve } = require('./src/security/validator');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware de Segurança e Headers
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Rate Limiter simples em memória para geração (máximo 20 requisições por IP a cada 5 minutos)
const rateLimitMap = new Map();
function rateLimiter(req, res, next) {
  const ip = req.ip || req.connection.remoteAddress || 'unknown';
  const now = Date.now();
  const windowMs = 5 * 60 * 1000;
  const maxRequests = 30;

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
      error: 'Muitas requisições em curto período. Aguarde alguns instantes antes de gerar novamente.'
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
    version: '2.0.0',
    providers: detectAvailableProviders(),
    clients,
    hasImageGen: Boolean(process.env.OPENAI_API_KEY || process.env.GEMINI_API_KEY)
  });
});

// Listar todos os clientes cadastrados
app.get('/api/clients', (req, res) => {
  const clientsDir = path.join(__dirname, 'config', 'clients');
  if (!fs.existsSync(clientsDir)) {
    return res.json([]);
  }

  const files = fs.readdirSync(clientsDir).filter(f => f.endsWith('.json'));
  const clients = files.map(file => {
    try {
      return JSON.parse(fs.readFileSync(path.join(clientsDir, file), 'utf8'));
    } catch {
      return null;
    }
  }).filter(Boolean);

  res.json(clients);
});

// Cadastrar ou atualizar cliente
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
    const sanitizedClient = {
      id: safeId,
      name: clientData.name || clientData.brandName,
      brandName: clientData.brandName,
      brandHandle: clientData.brandHandle || '',
      tone: clientData.tone || 'Profissional e estratégico',
      targetAudience: clientData.targetAudience || 'Profissionais e tomadores de decisão',
      llmProvider: clientData.llmProvider || '',
      llmModel: clientData.llmModel || '',
      generateAiImage: Boolean(clientData.generateAiImage),
      defaultHashtags: Array.isArray(clientData.defaultHashtags) ? clientData.defaultHashtags : [],
      callToAction: clientData.callToAction || '',
      includeFirstComment: Boolean(clientData.includeFirstComment !== false),
      commentTemplate: clientData.commentTemplate || '👉 Acesse o artigo completo: {URL}',
      webhookUrl: clientData.webhookUrl || ''
    };

    fs.writeFileSync(targetFile, JSON.stringify(sanitizedClient, null, 2), 'utf8');
    res.json({ success: true, client: sanitizedClient });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// 2. HISTÓRICO DE PACOTES GERADOS
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
    res.setHeader('Cache-Control', 'public, max-age=86400'); // Cache 24h
    fs.createReadStream(filePath).pipe(res);
  } catch (err) {
    res.status(400).send('Requisição inválida.');
  }
});

// ---------------------------------------------------------------------------
// 3. EXECUÇÃO DO PIPELINE
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
