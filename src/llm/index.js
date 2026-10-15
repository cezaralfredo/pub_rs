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
async function callProvider(providerName, systemInstructions, userContent, modelOverride) {
  const p = providerName.toLowerCase();

  switch (p) {
    case 'gemini':
    case 'google': {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) throw new Error('GEMINI_API_KEY não encontrada no .env');
      return await callGemini({
        systemInstructions,
        userContent,
        apiKey,
        model: modelOverride || process.env.GEMINI_MODEL || process.env.LLM_MODEL || 'gemini-2.5-flash'
      });
    }

    case 'openai': {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) throw new Error('OPENAI_API_KEY não encontrada no .env');
      return await callOpenAICompatible({
        systemInstructions,
        userContent,
        apiKey,
        baseUrl: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
        model: modelOverride || process.env.OPENAI_MODEL || process.env.LLM_MODEL || 'gpt-4o-mini',
        providerName: 'OpenAI'
      });
    }

    case 'anthropic':
    case 'claude': {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) throw new Error('ANTHROPIC_API_KEY não encontrada no .env');
      return await callAnthropic({
        systemInstructions,
        userContent,
        apiKey,
        model: modelOverride || process.env.ANTHROPIC_MODEL || process.env.LLM_MODEL || 'claude-3-5-sonnet-20241022'
      });
    }

    case 'groq': {
      const apiKey = process.env.GROQ_API_KEY;
      if (!apiKey) throw new Error('GROQ_API_KEY não encontrada no .env');
      return await callOpenAICompatible({
        systemInstructions,
        userContent,
        apiKey,
        baseUrl: 'https://api.groq.com/openai/v1',
        model: modelOverride || process.env.GROQ_MODEL || process.env.LLM_MODEL || 'llama-3.3-70b-versatile',
        providerName: 'Groq'
      });
    }

    case 'deepseek': {
      const apiKey = process.env.DEEPSEEK_API_KEY;
      if (!apiKey) throw new Error('DEEPSEEK_API_KEY não encontrada no .env');
      return await callOpenAICompatible({
        systemInstructions,
        userContent,
        apiKey,
        baseUrl: 'https://api.deepseek.com',
        model: modelOverride || process.env.DEEPSEEK_MODEL || process.env.LLM_MODEL || 'deepseek-chat',
        providerName: 'DeepSeek'
      });
    }

    case 'openrouter': {
      const apiKey = process.env.OPENROUTER_API_KEY;
      if (!apiKey) throw new Error('OPENROUTER_API_KEY não encontrada no .env');
      return await callOpenAICompatible({
        systemInstructions,
        userContent,
        apiKey,
        baseUrl: 'https://openrouter.ai/api/v1',
        model: modelOverride || process.env.OPENROUTER_MODEL || process.env.LLM_MODEL || 'openai/gpt-4o-mini',
        providerName: 'OpenRouter'
      });
    }

    case 'ollama': {
      return await callOllama({
        systemInstructions,
        userContent,
        baseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
        model: modelOverride || process.env.OLLAMA_MODEL || process.env.LLM_MODEL || 'llama3'
      });
    }

    default:
      throw new Error(`Provedor desconhecido: "${providerName}". Disponíveis: gemini, openai, anthropic, groq, deepseek, openrouter, ollama.`);
  }
}

/**
 * Orquestrador principal de geração com LLM.
 * Tenta o provedor preferencial e executa cadeia de fallback em caso de falha.
 */
async function generateWithLlm(article, client, options = {}) {
  const { systemInstructions, userContent } = buildCopywriterPrompt(article, client);

  const preferredProvider = options.provider || client.llmProvider || process.env.LLM_PROVIDER;
  const preferredModel = options.model || client.llmModel || process.env.LLM_MODEL;

  const availableProviders = detectAvailableProviders();

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
      result = await callProvider(provider, systemInstructions, userContent, preferredModel);
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
  detectAvailableProviders
};
