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

  // Injeção de URLs com parâmetros UTM oficiais
  const targetUrl = article.canonicalUrl || article.url;
  const slug = article.slug;
  const replaceUrls = (txt, src) => (txt || '').replace(/\{[A-Z_]+_URL\}/g, getUtmUrl(targetUrl, src, slug));

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
    linkedin: {
      post: replaceUrls(parsed.linkedin?.post, 'linkedin'),
      firstComment: replaceUrls(parsed.linkedin?.firstComment, 'linkedin'),
      recommendedFormat: '16:9 ou 1:1'
    },
    instagram: {
      post: replaceUrls(parsed.instagram?.post, 'instagram'),
      firstComment: replaceUrls(parsed.instagram?.firstComment, 'instagram'),
      recommendedFormat: '4:5 (Feed) e 9:16 (Stories)'
    },
    stories: {
      post: replaceUrls(parsed.stories?.post, 'stories'),
      recommendedFormat: '9:16 (Vertical)'
    },
    twitter: {
      thread: Array.isArray(parsed.twitter?.thread)
        ? parsed.twitter.thread.map(t => replaceUrls(t, 'twitter'))
        : [replaceUrls(parsed.twitter?.post, 'twitter')],
      recommendedFormat: '16:9 (Horizontal)'
    },
    threads: {
      post: replaceUrls(parsed.threads?.post, 'threads'),
      recommendedFormat: '1:1 ou 16:9'
    },
    facebook: {
      post: replaceUrls(parsed.facebook?.post, 'facebook'),
      recommendedFormat: '16:9 (Horizontal)'
    }
  };
}

module.exports = {
  generateWithLlm,
  detectAvailableProviders,
  testLlmConnection,
  callProvider
};
