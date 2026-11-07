const { buildCopywriterPrompt } = require('./promptBuilder');
const { callGemini } = require('./providers/gemini');
const { callOpenAICompatible } = require('./providers/openai');
const { callAnthropic } = require('./providers/anthropic');
const { callOllama } = require('./providers/ollama');

/**
 * Utilitário para extrair e fazer parse de JSON de respostas de LLM.
 */
function parseLlmJson(rawText) {
  let cleaned = rawText.trim();

  // Remove blocos de código markdown ```json ... ```
  const codeBlockMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (codeBlockMatch && codeBlockMatch[1]) {
    cleaned = codeBlockMatch[1].trim();
  }

  // Tenta parse direto
  try {
    return JSON.parse(cleaned);
  } catch (err1) {
    // Tenta isolar o conteúdo entre o primeiro { e o último }
    const firstBrace = cleaned.indexOf('{');
    const lastBrace = cleaned.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      const jsonCandidate = cleaned.slice(firstBrace, lastBrace + 1);
      return JSON.parse(jsonCandidate);
    }
    throw new Error(`Falha ao converter resposta da IA em JSON: ${err1.message}`);
  }
}

/**
 * Gera URL com UTMs para cada rede social
 */
function getUtmUrl(targetUrl, source, slug) {
  try {
    const url = new URL(targetUrl);
    url.searchParams.set('utm_source', source);
    url.searchParams.set('utm_medium', 'social');
    url.searchParams.set('utm_campaign', slug || 'distribuicao');
    return url.toString();
  } catch {
    return targetUrl;
  }
}

/**
 * Identifica os provedores configurados e disponíveis no ambiente.
 */
function detectAvailableProviders() {
  const providers = [];

  if (process.env.GEMINI_API_KEY) providers.push('gemini');
  if (process.env.OPENAI_API_KEY) providers.push('openai');
  if (process.env.ANTHROPIC_API_KEY) providers.push('anthropic');
  if (process.env.GROQ_API_KEY) providers.push('groq');
  if (process.env.DEEPSEEK_API_KEY) providers.push('deepseek');
  if (process.env.OPENROUTER_API_KEY) providers.push('openrouter');
  if (process.env.OLLAMA_BASE_URL || process.env.OLLAMA_MODEL) providers.push('ollama');

  return providers;
}

/**
 * Executa uma chamada para o provedor especificado.
 */
async function callProvider(providerName, systemInstructions, userContent, modelOverride, apiKeyOverride, baseUrlOverride) {
  const p = providerName.toLowerCase();

  switch (p) {
    case 'gemini':
    case 'google': {
      const apiKey = apiKeyOverride || process.env.GEMINI_API_KEY;
      if (!apiKey) throw new Error('Chave da Gemini API não encontrada (nem no cliente nem no .env).');
      return await callGemini({
        systemInstructions,
        userContent,
        apiKey,
        model: modelOverride || process.env.GEMINI_MODEL || process.env.LLM_MODEL || 'gemini-2.5-flash'
      });
    }

    case 'openai': {
      const apiKey = apiKeyOverride || process.env.OPENAI_API_KEY;
      if (!apiKey) throw new Error('Chave da OpenAI API não encontrada (nem no cliente nem no .env).');
      return await callOpenAICompatible({
        systemInstructions,
        userContent,
        apiKey,
        baseUrl: baseUrlOverride || process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
        model: modelOverride || process.env.OPENAI_MODEL || process.env.LLM_MODEL || 'gpt-4o-mini',
        providerName: 'OpenAI'
      });
    }

    case 'anthropic':
    case 'claude': {
      const apiKey = apiKeyOverride || process.env.ANTHROPIC_API_KEY;
      if (!apiKey) throw new Error('Chave da Anthropic Claude API não encontrada (nem no cliente nem no .env).');
      return await callAnthropic({
        systemInstructions,
        userContent,
        apiKey,
        model: modelOverride || process.env.ANTHROPIC_MODEL || process.env.LLM_MODEL || 'claude-3-5-sonnet-20241022'
      });
    }

    case 'groq': {
      const apiKey = apiKeyOverride || process.env.GROQ_API_KEY;
      if (!apiKey) throw new Error('Chave da Groq API não encontrada (nem no cliente nem no .env).');
      return await callOpenAICompatible({
        systemInstructions,
        userContent,
        apiKey,
        baseUrl: baseUrlOverride || 'https://api.groq.com/openai/v1',
        model: modelOverride || process.env.GROQ_MODEL || process.env.LLM_MODEL || 'llama-3.3-70b-versatile',
        providerName: 'Groq'
      });
    }

    case 'deepseek': {
      const apiKey = apiKeyOverride || process.env.DEEPSEEK_API_KEY;
      if (!apiKey) throw new Error('Chave da DeepSeek API não encontrada (nem no cliente nem no .env).');
      return await callOpenAICompatible({
        systemInstructions,
        userContent,
        apiKey,
        baseUrl: baseUrlOverride || 'https://api.deepseek.com',
        model: modelOverride || process.env.DEEPSEEK_MODEL || process.env.LLM_MODEL || 'deepseek-chat',
        providerName: 'DeepSeek'
      });
    }

    case 'openrouter': {
      const apiKey = apiKeyOverride || process.env.OPENROUTER_API_KEY;
      if (!apiKey) throw new Error('Chave da OpenRouter API não encontrada (nem no cliente nem no .env).');
      return await callOpenAICompatible({
        systemInstructions,
        userContent,
        apiKey,
        baseUrl: baseUrlOverride || 'https://openrouter.ai/api/v1',
        model: modelOverride || process.env.OPENROUTER_MODEL || process.env.LLM_MODEL || 'openai/gpt-4o-mini',
        providerName: 'OpenRouter'
      });
    }

    case 'ollama': {
      return await callOllama({
        systemInstructions,
        userContent,
        baseUrl: baseUrlOverride || process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
        model: modelOverride || process.env.OLLAMA_MODEL || process.env.LLM_MODEL || 'llama3'
      });
    }

    default:
      throw new Error(`Provedor desconhecido: "${providerName}". Disponíveis: gemini, openai, anthropic, groq, deepseek, openrouter, ollama.`);
  }
}

/**
 * Testa a conectividade com o provedor de LLM configurado (para validação de credenciais do cliente)
 */
async function testLlmConnection({ provider, apiKey, model, baseUrl }) {
  const p = (provider || 'auto').toLowerCase();
  const startTime = Date.now();

  let targetProvider = p;
  if (p === 'auto') {
    const available = detectAvailableProviders();
    if (available.length === 0 && !apiKey) {
      return {
        ok: false,
        error: 'Nenhum provedor de IA configurado no ambiente nem chave informada no cliente.'
      };
    }
    targetProvider = apiKey ? 'openai' : available[0];
  }

  try {
    const testResult = await callProvider(
      targetProvider,
      'Você é um verificador de conectividade de IA do pub_rs. Responda estritamente a palavra: OK',
      'ping',
      model,
      apiKey,
      baseUrl
    );

    const latencyMs = Date.now() - startTime;
    return {
      ok: true,
      provider: testResult.provider,
      model: testResult.model,
      latencyMs,
      message: `Conexão bem-sucedida com ${testResult.provider.toUpperCase()} (${testResult.model}) em ${latencyMs}ms.`
    };
  } catch (err) {
    return {
      ok: false,
      provider: targetProvider,
      error: err.message
    };
  }
}

/**
 * Orquestrador principal de geração com LLM.
 * Tenta o provedor preferencial e executa cadeia de fallback em caso de falha.
 */
async function generateWithLlm(article, client, options = {}) {
  const { systemInstructions, userContent } = buildCopywriterPrompt(article, client);

  const clientLlmProvider = client.llm?.provider || client.llmProvider;
  const clientLlmModel = client.llm?.model || client.llmModel;
  const clientApiKey = client.llm?.apiKey;
  const clientBaseUrl = client.llm?.baseUrl;

  const preferredProvider = options.provider || clientLlmProvider || process.env.LLM_PROVIDER;
  const preferredModel = options.model || clientLlmModel || process.env.LLM_MODEL;

  const availableProviders = detectAvailableProviders();

  // Se o cliente possuir chave própria configurada para um provedor, adiciona à lista
  if (clientLlmProvider && clientApiKey && !availableProviders.includes(clientLlmProvider)) {
    availableProviders.unshift(clientLlmProvider);
  }

  // Lista de tentativas: primeiro a preferência, depois os demais disponíveis
  const providersToTry = [];
  if (preferredProvider && preferredProvider !== 'auto') {
    providersToTry.push(preferredProvider);
  }
  for (const prov of availableProviders) {
    if (!providersToTry.includes(prov)) {
      providersToTry.push(prov);
    }
  }

  if (providersToTry.length === 0) {
    return null; // Nenhum provedor de IA configurado
  }

  let lastError = null;
  let result = null;

  for (const provider of providersToTry) {
    try {
      console.log(`   🤖 [IA] Gerando copies via provedor: ${provider.toUpperCase()}...`);
      result = await callProvider(provider, systemInstructions, userContent, preferredModel, clientApiKey, clientBaseUrl);
      if (result && result.text) {
        break; // Sucesso!
      }
    } catch (err) {
      console.warn(`   ⚠️ [IA Aviso] Falha em ${provider} (${err.message}). Tentando próximo...`);
      lastError = err;
    }
  }

  if (!result || !result.text) {
    throw new Error(`Todos os provedores de LLM falharam. Último erro: ${lastError?.message}`);
  }

  const parsed = parseLlmJson(result.text);

  // Normalização e extração flexível caso a LLM retorne string direta ou objeto com .post
  const linkedinPostRaw = (typeof parsed.linkedin === 'string' ? parsed.linkedin : parsed.linkedin?.post) || '';
  const linkedinCommentRaw = (typeof parsed.linkedin === 'object' ? parsed.linkedin?.firstComment : '') || '';

  const instagramPostRaw = (typeof parsed.instagram === 'string' ? parsed.instagram : parsed.instagram?.post) || '';
  const instagramCommentRaw = (typeof parsed.instagram === 'object' ? parsed.instagram?.firstComment : '') || '';

  const facebookPostRaw = (typeof parsed.facebook === 'string' ? parsed.facebook : parsed.facebook?.post) || '';
  const facebookCommentRaw = (typeof parsed.facebook === 'object' ? parsed.facebook?.firstComment : '') || '';

  // Validação de qualidade: se a LLM não gerou conteúdo de texto para os canais principais, aciona o fallback dinâmico
  if (linkedinPostRaw.trim().length < 25 && instagramPostRaw.trim().length < 25 && facebookPostRaw.trim().length < 25) {
    throw new Error(`O modelo de IA ${result.provider} (${result.model}) retornou campos de texto vazios.`);
  }

  // Validação de modo de criação: URL de artigo real vs Interesses / Tema Livre
  const isTopic = Boolean(article.isTopicMode || article.mode === 'topic' || !article.url);
  const targetUrl = isTopic ? null : (article.canonicalUrl || article.url);
  const slug = article.slug || 'artigo';
  const replaceUrls = (txt, src) => {
    if (!txt) return '';
    if (targetUrl) {
      return txt.replace(/\{[A-Z_]+_URL\}/g, getUtmUrl(targetUrl, src, slug));
    }
    // No modo por interesses / tema livre (sem site):
    return txt
      .replace(/\n*Matéria completa em\s*\([^\)]*\)/gi, '')
      .replace(/\{[A-Z_]+_URL\}/g, '')
      .trim();
  };

  // 1. Processamento específico para o X (Twitter): Somente ponto fundamental, sem título, máx 280 caracteres
  let twitterPostRaw = (typeof parsed.twitter === 'string' ? parsed.twitter : parsed.twitter?.post) || '';
  if (article.title && twitterPostRaw.toLowerCase().startsWith(article.title.toLowerCase().slice(0, 30))) {
    // Se a IA incluiu o título no início, remove o título e mantém apenas o ponto fundamental
    twitterPostRaw = twitterPostRaw.slice(article.title.length).replace(/^[:\-\s\n]+/, '').trim();
  }
  if (!twitterPostRaw.trim()) {
    twitterPostRaw = article.description || (article.bulletPoints && article.bulletPoints[0]) || 'Análise estratégica de ponta com insights práticos.';
  }
  let finalTwitterPost = replaceUrls(twitterPostRaw.trim(), 'twitter');
  if (finalTwitterPost.length > 280) {
    finalTwitterPost = finalTwitterPost.slice(0, 277) + '...';
  }

  // 2. Processamento para LinkedIn, Instagram e Facebook: Resumo de até 1700 caracteres
  // Se for artigo de blog real: finaliza com "Matéria completa em (url)"
  // Se for interesse / tema livre: NÃO inclui link de site (conteúdo 100% nativo)
  const formatRichSummary = (rawText, network) => {
    let text = (rawText || '').trim();
    if (!text) {
      text = article.description || 'Confira os destaques da análise estratégica.';
    }

    if (isTopic || !targetUrl) {
      text = text.replace(/\n*Matéria completa em\s*\([^\)]*\)/gi, '');
      text = replaceUrls(text, network);
      text = text.trim();
      if (text.length > 1700) {
        text = `${text.slice(0, 1697).replace(/[,;.\s]+$/, '')}...`;
      }
      return text.trim();
    }

    // Modo artigo web real:
    const netUrl = getUtmUrl(targetUrl, network, slug);
    const linkSuffix = `Matéria completa em (${netUrl})`;

    text = replaceUrls(text, network);
    if (!text.includes('Matéria completa em')) {
      text = `${text}\n\n${linkSuffix}`;
    }

    // Limite máximo de até 1700 caracteres preservando o link intacto
    if (text.length > 1700) {
      const fixedEnd = `\n\n${linkSuffix}`;
      const maxBody = 1700 - fixedEnd.length;
      text = `${text.slice(0, maxBody - 3).replace(/[,;.\s]+$/, '')}...${fixedEnd}`;
    }

    return text.trim();
  };

  const finalLinkedinPost = formatRichSummary(linkedinPostRaw, 'linkedin');
  const finalInstagramPost = formatRichSummary(instagramPostRaw, 'instagram');
  const finalFacebookPost = formatRichSummary(facebookPostRaw, 'facebook');

  const cleanFirstComment = (rawComment, network, fallbackPrompt) => {
    let comment = replaceUrls(rawComment, network);
    comment = comment.replace(/\n*Matéria completa em\s*\([^\)]*\)/gi, '').trim();
    if (!comment && isTopic) {
      return fallbackPrompt;
    }
    return comment;
  };

  const finalLinkedinComment = isTopic
    ? cleanFirstComment(linkedinCommentRaw, 'linkedin', 'Qual é a sua perspectiva sobre esse tema? Compartilhe sua visão nos comentários!')
    : replaceUrls(linkedinCommentRaw, 'linkedin');

  const finalInstagramComment = isTopic
    ? cleanFirstComment(instagramCommentRaw, 'instagram', 'Qual desses insights fez mais sentido para você? Comente aqui embaixo!')
    : replaceUrls(instagramCommentRaw, 'instagram');

  const finalFacebookComment = isTopic
    ? cleanFirstComment(facebookCommentRaw, 'facebook', 'Compartilhe sua experiência conosco nos comentários!')
    : replaceUrls(facebookCommentRaw, 'facebook');

  const ensureHeading = (rawText, title, prefix = '') => {
    const txt = (rawText || '').trim();
    const cleanT = (title || '').trim();
    if (!cleanT || !txt) return txt;
    if (txt.toLowerCase().includes(cleanT.toLowerCase().slice(0, 30))) return txt;
    return `${prefix ? prefix + ' ' : ''}${cleanT}${prefix ? ' ' + prefix : ''}\n\n${txt}`;
  };

  return {
    meta: {
      generator: `LLM (${result.provider} · ${result.model})`,
      provider: result.provider,
      model: result.model,
      client: client.name || client.id,
      articleTitle: article.title,
      targetUrl,
      generatedAt: new Date().toISOString()
    },
    hooks: {
      contrarian: parsed.hooks?.contrarian || '',
      dataDriven: parsed.hooks?.dataDriven || '',
      storytelling: parsed.hooks?.storytelling || ''
    },
    carousel: parsed.carousel || null,
    twitter: {
      post: finalTwitterPost,
      thread: Array.isArray(parsed.twitter?.thread)
        ? parsed.twitter.thread.map(t => replaceUrls(t, 'twitter'))
        : [finalTwitterPost].filter(Boolean),
      recommendedFormat: '16:9 ou 4:5 (Ponto Fundamental - Título na Imagem)',
      charCount: finalTwitterPost.length,
      maxLimit: 280
    },
    linkedin: {
      post: finalLinkedinPost,
      firstComment: finalLinkedinComment,
      recommendedFormat: '16:9 ou 4:5 Retrato',
      charCount: finalLinkedinPost.length,
      maxLimit: 1700
    },
    instagram: {
      post: finalInstagramPost,
      firstComment: finalInstagramComment,
      recommendedFormat: '4:5 (Retrato Padrão)',
      charCount: finalInstagramPost.length,
      maxLimit: 1700
    },
    facebook: {
      post: finalFacebookPost,
      firstComment: finalFacebookComment,
      recommendedFormat: '16:9 ou 4:5 Retrato',
      charCount: finalFacebookPost.length,
      maxLimit: 1700
    },
    stories: {
      post: replaceUrls(ensureHeading(parsed.stories?.post || parsed.stories, article.title, '🚀'), 'stories'),
      recommendedFormat: '9:16 (Vertical)'
    },
    threads: {
      post: replaceUrls(parsed.threads?.post || parsed.threads, 'threads'),
      thread: Array.isArray(parsed.threads?.thread)
        ? parsed.threads.thread.map(t => replaceUrls(t, 'threads'))
        : null,
      recommendedFormat: '1:1 ou 16:9'
    }
  };
}

module.exports = {
  generateWithLlm,
  detectAvailableProviders,
  testLlmConnection,
  callProvider
};
