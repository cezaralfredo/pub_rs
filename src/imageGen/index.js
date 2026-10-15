/**
 * Módulo de Geração de Imagens via IA (DALL-E 3 e Google Imagen 3)
 * Cria ilustrações e fotos conceituais de alta definição a partir do título e contexto do artigo.
 */

/**
 * Constrói um prompt visual editorial otimizado para geradores de imagem.
 */
function buildVisualPrompt(title, description, client) {
  const brandTone = client?.tone || 'Modern, clean and professional';
  const cleanTitle = (title || 'Innovation and Technology').replace(/["\n\r]/g, ' ').trim();
  const cleanDesc = (description || '').slice(0, 200).replace(/["\n\r]/g, ' ').trim();

  // Prompt estruturado em inglês para máxima aderência estética dos modelos de imagem
  return `A high-end, award-winning editorial conceptual visual representing: "${cleanTitle}". Context: ${cleanDesc || 'Future of technology, strategy and modern business'}. Style: minimalist, elegant corporate aesthetic, 3D modern geometric elements or premium editorial photography, soft cinematic studio lighting, balanced composition, vibrant yet sophisticated color grading. IMPORTANT: Absolutely NO text, NO typography, NO words, NO letters, NO watermarks. 16:9 aspect ratio.`;
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
 * Tenta gerar a imagem via IA utilizando o melhor provedor configurado.
 */
async function generateAiImageIfPossible({ title, description, client, options = {} }) {
  const prompt = buildVisualPrompt(title, description, client);

  const preferredProvider = (options.provider || process.env.IMAGE_PROVIDER || '').toLowerCase();
  const openAiKey = process.env.OPENAI_API_KEY;
  const geminiKey = process.env.GEMINI_API_KEY;

  // Se preferir OpenAI explicitamente ou se tiver chave da OpenAI
  if ((preferredProvider === 'openai' || !geminiKey) && openAiKey) {
    try {
      console.log(`   🎨 [DALL-E 3] Solicitando geração de imagem para a OpenAI...`);
      return await generateDallE(prompt, openAiKey, options.imageModel || process.env.IMAGE_MODEL || 'dall-e-3');
    } catch (err) {
      console.warn(`   ⚠️ [DALL-E Erro] ${err.message}.`);
      if (geminiKey) {
        console.log(`   🔄 Tentando fallback para Google Imagen 3...`);
        return await generateImagen(prompt, geminiKey);
      }
      throw err;
    }
  }

  // Se tiver chave do Google Gemini / Imagen
  if (geminiKey) {
    try {
      console.log(`   🎨 [Google Imagen 3] Solicitando geração de imagem conceitual...`);
      return await generateImagen(prompt, geminiKey, options.imageModel || process.env.IMAGE_MODEL || 'imagen-3.0-generate-002');
    } catch (err) {
      console.warn(`   ⚠️ [Imagen Erro] ${err.message}.`);
      if (openAiKey) {
        console.log(`   🔄 Tentando fallback para OpenAI DALL-E 3...`);
        return await generateDallE(prompt, openAiKey);
      }
      throw err;
    }
  }

  return null;
}

module.exports = {
  buildVisualPrompt,
  generateAiImageIfPossible,
  generateDallE,
  generateImagen
};
