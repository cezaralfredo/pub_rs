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
 * Constrói um prompt visual editorial otimizado para geradores de imagem.
 */
function buildVisualPrompt(title, description, client = {}, options = {}) {
  const cleanTitle = (title || 'Innovation and Strategy').replace(/["\n\r]/g, ' ').trim();
  const cleanDesc = (description || '').slice(0, 240).replace(/["\n\r]/g, ' ').trim();
  const visualHint = (options.visualPromptHint || '').replace(/["\n\r]/g, ' ').trim();

  // Determina o estilo visual selecionado ou o padrão do cliente
  const requestedStyle = options.visualStyle || options.style || client.visualIdentity?.style || 'dark-cinematic';
  const stylePrompt = STYLE_DESCRIPTIONS[requestedStyle] || STYLE_DESCRIPTIONS['dark-cinematic'];

  // Cores da marca
  const colors = client.visualIdentity?.preferredColors;
  const colorHint = Array.isArray(colors) && colors.length > 0
    ? `Color grading featuring subtle accents of ${colors.join(', ')}.`
    : '';

  // Cena visual principal (usa dica conceitual sintetizada se houver)
  const sceneDescription = visualHint 
    ? `Conceptual visual scene: ${visualHint}. Core theme: "${cleanTitle}".`
    : `Conceptual visual representation of: "${cleanTitle}". Narrative context: ${cleanDesc || 'Modern business strategy, technological innovation and future market impact'}.`;

  return `Award-winning high-end editorial conceptual artwork. ${sceneDescription} Style aesthetic: ${stylePrompt} ${colorHint} Masterpiece composition, perfectly balanced, volumetric soft studio lighting, ultra-detailed textures. CRITICAL CONSTRAINT: Absolutely NO text, NO typography, NO letters, NO words, NO logos, NO watermarks, NO interface elements. Aspect ratio 16:9.`.trim();
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
      size: '1792x1024', // Formato paisagem aproximado de 16:9
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
    provider: 'OpenAI',
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
    provider: 'Google Imagen',
    model
  };
}

/**
 * Gerador via Pollinations.ai (Flux)
 * Motor autônomo de alta resolução (16:9), sem necessidade de API key,
 * produzindo artes conceituais fotorrealistas e cinematográficas de alto nível.
 */
async function generatePollinations(prompt, options = {}) {
  const cleanPrompt = encodeURIComponent(prompt.slice(0, 650));
  const seed = options.seed || Math.floor(Math.random() * 9999999);
  const url = `https://image.pollinations.ai/prompt/${cleanPrompt}?width=1280&height=720&model=flux&nologo=true&seed=${seed}`;

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
      provider: 'Pollinations AI',
      model: 'flux'
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Tenta gerar a imagem via IA utilizando o melhor provedor configurado.
 */
async function generateAiImageIfPossible({ title, description, client, options = {} }) {
  const prompt = buildVisualPrompt(title, description, client, options);

  const preferredProvider = (options.imageProvider || options.provider || process.env.IMAGE_PROVIDER || '').toLowerCase();
  const clientKey = client?.llm?.apiKey;
  const openAiKey = (client?.llm?.provider === 'openai' && clientKey) ? clientKey : process.env.OPENAI_API_KEY;
  const geminiKey = (client?.llm?.provider === 'gemini' && clientKey) ? clientKey : process.env.GEMINI_API_KEY;

  // 1. OpenAI DALL-E 3 (se configurado ou se tiver chave da OpenAI)
  if ((preferredProvider === 'openai' || (!geminiKey && preferredProvider !== 'pollinations')) && openAiKey) {
    try {
      console.log(`   🎨 [DALL-E 3] Solicitando geração de arte alinhada ao estilo "${options.visualStyle || client?.visualIdentity?.style || 'dark-cinematic'}"...`);
      return await generateDallE(prompt, openAiKey, options.imageModel || process.env.IMAGE_MODEL || 'dall-e-3');
    } catch (err) {
      console.warn(`   ⚠️ [DALL-E Erro] ${err.message}.`);
      if (geminiKey) {
        console.log(`   🔄 Tentando fallback para Google Imagen 3...`);
        try {
          return await generateImagen(prompt, geminiKey);
        } catch (imgErr) {
          console.warn(`   ⚠️ [Imagen Erro] ${imgErr.message}.`);
        }
      }
    }
  }

  // 2. Google Imagen 3 (se configurado ou se tiver chave do Gemini)
  if (geminiKey && preferredProvider !== 'pollinations') {
    try {
      console.log(`   🎨 [Google Imagen 3] Solicitando geração de arte no estilo "${options.visualStyle || client?.visualIdentity?.style || 'dark-cinematic'}"...`);
      return await generateImagen(prompt, geminiKey, options.imageModel || process.env.IMAGE_MODEL || 'imagen-3.0-generate-002');
    } catch (err) {
      console.warn(`   ⚠️ [Imagen Erro] ${err.message}.`);
      if (openAiKey) {
        console.log(`   🔄 Tentando fallback para OpenAI DALL-E 3...`);
        try {
          return await generateDallE(prompt, openAiKey);
        } catch (dalErr) {
          console.warn(`   ⚠️ [DALL-E Erro] ${dalErr.message}.`);
        }
      }
    }
  }

  // 3. Provedor Autônomo de Alta Resolução via Pollinations AI (Flux)
  try {
    console.log(`   🎨 [Pollinations Flux] Gerando imagem de background conceitual em 16:9...`);
    return await generatePollinations(prompt, options);
  } catch (err) {
    console.warn(`   ⚠️ [Pollinations Erro] ${err.message}.`);
  }

  return null;
}

module.exports = {
  STYLE_DESCRIPTIONS,
  buildVisualPrompt,
  generateAiImageIfPossible,
  generateDallE,
  generateImagen,
  generatePollinations
};
