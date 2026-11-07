/**
 * Módulo de Geração de Imagens via IA (DALL-E 3 e Google Imagen 3)
 * Cria ilustrações, fotos conceituais e renders 3D de alta definição alinhados
 * à identidade visual da marca e aos interesses/tópicos do cliente.
 */

const STYLE_DESCRIPTIONS = {
  'dark-cinematic': 'Dark moody cinematic atmosphere, deep obsidian and charcoal background, dramatic volumetric rim lighting, subtle neon cyan or electric blue glows, ultra-high-definition 8k cinematic composition, sleek depth of field.',
  'minimalist-3d': 'Clean minimalist 3D isometric render, smooth matte clay textures, floating geometric shapes, frosted glass details, soft studio ambient lighting, elegant contemporary design inspired by Apple and Stripe aesthetics.',
  'corporate-photo': 'Prestigious editorial business photography, authentic modern high-tech workspace, natural directional window light, shallow depth of field, candid executive posture, shot on Hasselblad 100mm lens.',
  'tech-vector': 'Sleek futuristic digital vector illustration, refined network nodes and data flow connections, sophisticated enterprise tech gradients, clean isometric technology architecture.'
};

/**
 * Converte o título e tema do artigo em uma cena visual concreta em inglês,
 * alinhada diretamente ao critério central do título para gerar a imagem perfeita.
 */
async function deriveVisualSceneFromTitle({ title, description, client = {}, visualStyle, promptHint }) {
  if (promptHint && typeof promptHint === 'string' && promptHint.trim().length > 20 && !/[ãõáéíóúç]/i.test(promptHint)) {
    return promptHint.trim();
  }

  const cleanTitle = (title || 'Estratégia e Inovação').replace(/["\n\r]/g, ' ').trim();
  const cleanDesc = (description || '').slice(0, 300).replace(/["\n\r]/g, ' ').trim();

  // 1. Tenta sintetizar com a LLM configurada para máxima precisão contextual
  const clientLlm = client?.llm;
  if (clientLlm && clientLlm.apiKey) {
    try {
      const { callProvider } = require('../llm');
      const systemPrompt = `You are a world-class cinematic art director.
Your task: Given an article title and brief context, write a single concise, vivid English description (1-2 sentences) of a concrete, physical, photographic or 3D visual scene that directly and specifically represents the central theme of the title.
CRITICAL RULES:
- Depict concrete, tangible visual objects, environment, atmosphere, and lighting.
- Absolutely NO text, NO typography, NO letters, NO words, NO logos, NO brand marks.
- Output ONLY the English visual scene description without introduction or quotes.`;

      const userPrompt = `Title: "${cleanTitle}"\nContext: "${cleanDesc}"\nNiche: "${client.niche || 'Business and Innovation'}"`;

      const result = await callProvider(
        clientLlm.provider || 'openrouter',
        systemPrompt,
        userPrompt,
        clientLlm.model,
        clientLlm.apiKey,
        clientLlm.baseUrl
      );

      if (result && result.text) {
        const text = result.text.replace(/["\n\r]/g, ' ').trim();
        if (text.length > 15) {
          return text;
        }
      }
    } catch (err) {
      console.warn(`[Visual Scene Warning] Falha ao derivar cena via LLM (${err.message}). Usando extrator semântico.`);
    }
  }

  // 2. Extrator Semântico Algorítmico Inteligente (Keyword-to-Visual Scene)
  const lower = cleanTitle.toLowerCase();
  const visualTokens = [];

  if (lower.includes('ia') || lower.includes('inteligência artificial') || lower.includes('artificial intelligence') || lower.includes('machine learning')) {
    visualTokens.push('luminous AI neural network holographic interface with glowing cybernetic data flows');
  }
  if (lower.includes('custo') || lower.includes('financeir') || lower.includes('orçamento') || lower.includes('roi') || lower.includes('investimento') || lower.includes('preço') || lower.includes('viabilidade')) {
    visualTokens.push('high-tech financial scale balancing glowing data metrics and executive charts');
  }
  if (lower.includes('open source') || lower.includes('software') || lower.includes('plataforma') || lower.includes('código') || lower.includes('programação')) {
    visualTokens.push('sleek modular open-source digital architecture with illuminated holographic code nodes');
  }
  if (lower.includes('marketing') || lower.includes('mídia') || lower.includes('tráfego') || lower.includes('conversão') || lower.includes('vendas')) {
    visualTokens.push('modern dynamic digital marketing analytics boardroom with panoramic screens');
  }
  if (lower.includes('camarão') || lower.includes('frutos do mar') || lower.includes('peixe') || lower.includes('tilápia') || lower.includes('pescado') || lower.includes('culinária') || lower.includes('alimento')) {
    visualTokens.push('exquisite gourmet culinary presentation of fresh premium prawns and seafood on dark slate plate with delicate herbs');
  }
  if (lower.includes('imóve') || lower.includes('construção') || lower.includes('arquitetura') || lower.includes('casa') || lower.includes('edifício')) {
    visualTokens.push('luxurious modern architectural structure with dramatic floor-to-ceiling glass and ambient landscape lighting');
  }
  if (lower.includes('saúde') || lower.includes('médic') || lower.includes('clínic') || lower.includes('bem-estar')) {
    visualTokens.push('state-of-the-art modern clinical wellness sanctuary with serene organic curves and soft directional light');
  }

  const baseScene = visualTokens.length > 0
    ? visualTokens.join(', ')
    : `sophisticated modern business and technological environment conceptually representing ${cleanTitle.replace(/[:?,]/g, '')}`;

  return `Conceptual visual scene: ${baseScene}. Atmospheric cinematic boardroom setting with glowing technological accents`;
}

/**
 * Constrói um prompt visual editorial otimizado para geradores de imagem,
 * colocando o sujeito temático derivado do título em primeiro lugar.
 */
function buildVisualPrompt(title, description, client = {}, options = {}) {
  const cleanTitle = (title || 'Innovation and Strategy').replace(/["\n\r]/g, ' ').trim();
  const visualScene = (options.visualPromptHint || options.visualScene || '').replace(/["\n\r]/g, ' ').trim() ||
    `Conceptual visual scene representing "${cleanTitle}"`;

  // Determina o estilo visual selecionado ou o padrão do cliente
  const requestedStyle = options.visualStyle || options.style || client.visualIdentity?.style || 'dark-cinematic';
  const stylePrompt = STYLE_DESCRIPTIONS[requestedStyle] || STYLE_DESCRIPTIONS['dark-cinematic'];

  // Cores da marca
  const colors = client.visualIdentity?.preferredColors;
  const colorHint = Array.isArray(colors) && colors.length > 0
    ? `Color grading featuring subtle accents of ${colors.join(', ')}.`
    : '';

  // ESTRUTURA COM O SUJEITO EM PRIMEIRO LUGAR (Prioridade máxima nos modelos de difusão)
  return `${visualScene}. Award-winning editorial conceptual visual representing "${cleanTitle}". Style aesthetic: ${stylePrompt}. ${colorHint} Masterpiece composition, perfectly balanced, volumetric soft studio lighting, ultra-detailed textures, 8k resolution. CRITICAL CONSTRAINT: Absolutely NO text, NO typography, NO letters, NO words, NO logos, NO watermarks, NO interface elements. Aspect ratio 16:9.`.trim();
}

/**
 * Gerador via OpenAI DALL-E 3
 */
async function generateDallE(prompt, apiKey, model = 'dall-e-3') {
  const url = 'https://api.openai.com/v1/images/generations';

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model,
      prompt,
      n: 1,
      size: '1792x1024',
      quality: 'standard',
      response_format: 'b64_json'
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI DALL-E (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  const b64 = data?.data?.[0]?.b64_json;
  if (!b64) {
    throw new Error('DALL-E não retornou a imagem base64 esperada.');
  }

  return {
    buffer: Buffer.from(b64, 'base64'),
    provider: 'OpenAI DALL-E 3',
    model,
    revisedPrompt: data?.data?.[0]?.revised_prompt
  };
}

/**
 * Gerador via Google Imagen 3 (Gemini API)
 */
async function generateImagen(prompt, apiKey, model = 'imagen-3.0-generate-002') {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:predict?key=${apiKey}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      instances: [{ prompt }],
      parameters: {
        sampleCount: 1,
        aspectRatio: '16:9',
        outputOptions: {
          mimeType: 'image/jpeg'
        }
      }
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Google Imagen (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  const b64 = data?.predictions?.[0]?.bytesBase64Encoded;
  if (!b64) {
    throw new Error('Google Imagen não retornou dados de imagem em base64.');
  }

  return {
    buffer: Buffer.from(b64, 'base64'),
    provider: 'Google Imagen 3',
    model
  };
}

/**
 * Gerador via Pollinations.ai (Flux / Sana)
 * Motor autônomo gratuito de alta resolução (1024x576 em 16:9),
 * produzindo artes conceituais fotorrealistas e cinematográficas de alto nível.
 */
async function generatePollinations(prompt, options = {}) {
  const cleanPrompt = encodeURIComponent(prompt.slice(0, 600));
  const seed = options.seed || Math.floor(Math.random() * 9999999);
  // Usa o endpoint estável gratuito sem parâmetro de modelo restrito
  const url = `https://image.pollinations.ai/prompt/${cleanPrompt}?width=1024&height=576&nologo=true&seed=${seed}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 35000);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36'
      }
    });

    if (!response.ok) {
      throw new Error(`Pollinations HTTP ${response.status}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    if (buffer.length < 5000) {
      throw new Error('Imagem retornada pelo Pollinations é inválida ou muito pequena.');
    }

    return {
      buffer,
      provider: 'IA Visual Nativa (Flux / Sana)',
      model: 'flux-sana'
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Tenta gerar a imagem via IA utilizando o melhor provedor configurado.
 * Garante que a cena visual respeite estritamente o critério do título do artigo.
 */
async function generateAiImageIfPossible({ title, description, client, options = {} }) {
  // 1. Deriva ou garante a cena visual alinhada ao critério do título
  let visualHint = options.visualPromptHint;
  if (!visualHint || !visualHint.trim()) {
    visualHint = await deriveVisualSceneFromTitle({
      title,
      description,
      client,
      visualStyle: options.visualStyle,
      promptHint: options.visualPromptHint
    });
  }

  const prompt = buildVisualPrompt(title, description, client, {
    ...options,
    visualPromptHint: visualHint
  });

  const preferredProvider = (options.imageProvider || options.imageEngine || options.provider || process.env.IMAGE_PROVIDER || 'pollinations').toLowerCase();
  const clientKey = client?.llm?.apiKey;
  const openAiKey = (client?.llm?.provider === 'openai' && clientKey) ? clientKey : process.env.OPENAI_API_KEY;
  const geminiKey = (client?.llm?.provider === 'gemini' && clientKey) ? clientKey : process.env.GEMINI_API_KEY;

  // 1. Se preferir OpenAI DALL-E 3 explicitamente
  if ((preferredProvider === 'openai' || preferredProvider === 'dalle') && openAiKey) {
    try {
      console.log(`   🎨 [DALL-E 3] Solicitando geração de arte no estilo "${options.visualStyle || client?.visualIdentity?.style || 'dark-cinematic'}"...`);
      const res = await generateDallE(prompt, openAiKey, options.imageModel || process.env.IMAGE_MODEL || 'dall-e-3');
      res.visualPromptHint = visualHint;
      return res;
    } catch (err) {
      console.warn(`   ⚠️ [DALL-E Erro] ${err.message}.`);
      if (geminiKey) {
        console.log(`   🔄 Tentando fallback para Google Imagen 3...`);
        try {
          const res = await generateImagen(prompt, geminiKey);
          res.visualPromptHint = visualHint;
          return res;
        } catch (imgErr) {
          console.warn(`   ⚠️ [Imagen Erro] ${imgErr.message}.`);
        }
      }
    }
  }

  // 2. Se preferir Google Imagen 3 explicitamente
  if ((preferredProvider === 'gemini' || preferredProvider === 'imagen') && geminiKey) {
    try {
      console.log(`   🎨 [Google Imagen 3] Solicitando geração de arte no estilo "${options.visualStyle || client?.visualIdentity?.style || 'dark-cinematic'}"...`);
      const res = await generateImagen(prompt, geminiKey, options.imageModel || process.env.IMAGE_MODEL || 'imagen-3.0-generate-002');
      res.visualPromptHint = visualHint;
      return res;
    } catch (err) {
      console.warn(`   ⚠️ [Imagen Erro] ${err.message}.`);
      if (openAiKey) {
        console.log(`   🔄 Tentando fallback para OpenAI DALL-E 3...`);
        try {
          const res = await generateDallE(prompt, openAiKey);
          res.visualPromptHint = visualHint;
          return res;
        } catch (dalErr) {
          console.warn(`   ⚠️ [DALL-E Erro] ${dalErr.message}.`);
        }
      }
    }
  }

  // 3. Provedor Autônomo de Alta Resolução via Pollinations AI (Flux / Sana)
  try {
    console.log(`   🎨 [IA Visual Nativa] Gerando background conceitual para: "${title.slice(0, 60)}..."`);
    const res = await generatePollinations(prompt, options);
    res.visualPromptHint = visualHint;
    return res;
  } catch (err) {
    console.warn(`   ⚠️ [IA Visual Nativa Erro] ${err.message}.`);
  }

  return null;
}

module.exports = {
  STYLE_DESCRIPTIONS,
  deriveVisualSceneFromTitle,
  buildVisualPrompt,
  generateAiImageIfPossible,
  generateDallE,
  generateImagen,
  generatePollinations
};
