const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { generateAiImageIfPossible } = require('./imageGen');

/**
 * Escapa caracteres especiais para SVG seguro.
 */
function escapeXml(unsafe) {
  if (!unsafe) return '';
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Quebra texto em linhas completas para renderização com <tspan> em SVG.
 * NÃO descarta nenhuma palavra: garante o título 100% completo na imagem.
 */
function wrapFullText(text, maxCharsPerLine = 34) {
  const words = (text || '').trim().split(/\s+/).filter(Boolean);
  const lines = [];
  let currentLine = '';

  for (const word of words) {
    if ((currentLine + ' ' + word).trim().length <= maxCharsPerLine) {
      currentLine = (currentLine + ' ' + word).trim();
    } else {
      if (currentLine) lines.push(currentLine);
      currentLine = word;
    }
  }
  if (currentLine) {
    lines.push(currentLine);
  }
  return lines;
}

// Mantido para compatibilidade onde necessário
function wrapText(text, maxCharsPerLine = 34, maxLines = 4) {
  const allLines = wrapFullText(text, maxCharsPerLine);
  return allLines.slice(0, maxLines);
}

/**
 * Decompõe o título em 2 camadas tipográficas editoriais:
 * 1. Kicker / Gancho Inicial (Serif em itálico - tom autoral e humano)
 * 2. Manchete Principal (Sans-Serif em negrito 800 - força visual e clareza)
 */
function parseDualFontTitle(rawTitle, maxCharsHeadline = 24, maxCharsKicker = 28) {
  const clean = (rawTitle || 'Artigo em Destaque').trim();

  // Padrão 1: Título com separador oficial (ex: "GEO: O Guia Definitivo..." ou "Vendas - Estratégia...")
  // Não quebra em hífens internos de palavras (como First-Party)
  const separatorMatch = clean.match(/^([^:—]+?)(?:\s*:\s*|\s+[—\-]\s+)(.+)$/);
  if (separatorMatch) {
    const kickerRaw = separatorMatch[1].trim();
    const mainRaw = separatorMatch[2].trim();

    if (kickerRaw.length <= 55) {
      return {
        hasKicker: true,
        kickerLines: wrapFullText(kickerRaw, maxCharsKicker),
        headlineLines: wrapFullText(mainRaw, maxCharsHeadline)
      };
    }
  }

  // Padrão 2: Sem separador - a primeira linha atua como gancho editorial expressivo em Serif
  const allLines = wrapFullText(clean, maxCharsHeadline);
  if (allLines.length <= 1) {
    return {
      hasKicker: false,
      kickerLines: [],
      headlineLines: allLines
    };
  }

  return {
    hasKicker: true,
    kickerLines: [allLines[0]],
    headlineLines: allLines.slice(1)
  };
}

/**
 * Cria uma textura de background gráfico moderno de backup quando não há imagem.
 */
async function generateFallbackCard(width, height, title, brandName, brandHandle, client = {}, footerText) {
  const colors = client.visualIdentity?.preferredColors || ['#0052FF', '#0A0E17', '#00D2FF'];
  const color1 = colors[0] || '#0052FF';
  const colorAccent = colors[2] || colors[0] || '#00D2FF';

  const svg = `
  <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="fallbackBgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#050811" />
        <stop offset="45%" stop-color="#090f1f" />
        <stop offset="100%" stop-color="#0d1830" />
      </linearGradient>
      <radialGradient id="glowTopRight" cx="80%" cy="20%" r="60%">
        <stop offset="0%" stop-color="${colorAccent}" stop-opacity="0.35" />
        <stop offset="60%" stop-color="${colorAccent}" stop-opacity="0.05" />
        <stop offset="100%" stop-color="${colorAccent}" stop-opacity="0" />
      </radialGradient>
      <radialGradient id="glowBottomLeft" cx="20%" cy="80%" r="60%">
        <stop offset="0%" stop-color="${color1}" stop-opacity="0.4" />
        <stop offset="60%" stop-color="${color1}" stop-opacity="0.08" />
        <stop offset="100%" stop-color="${color1}" stop-opacity="0" />
      </radialGradient>
      <pattern id="dotGrid" width="40" height="40" patternUnits="userSpaceOnUse">
        <circle cx="20" cy="20" r="1.2" fill="#ffffff" fill-opacity="0.06" />
      </pattern>
    </defs>

    <!-- Fundo Escuro Gradiente -->
    <rect width="100%" height="100%" fill="url(#fallbackBgGrad)" />

    <!-- Grid Sutil Tech -->
    <rect width="100%" height="100%" fill="url(#dotGrid)" />

    <!-- Luminous Ambient Glows -->
    <rect width="100%" height="100%" fill="url(#glowTopRight)" />
    <rect width="100%" height="100%" fill="url(#glowBottomLeft)" />

    <!-- Linhas Abstratas Sutis -->
    <line x1="0" y1="${height * 0.3}" x2="${width}" y2="${height * 0.4}" stroke="${colorAccent}" stroke-opacity="0.12" stroke-width="1.5" />
    <line x1="0" y1="${height * 0.7}" x2="${width}" y2="${height * 0.6}" stroke="${color1}" stroke-opacity="0.15" stroke-width="1.5" />
  </svg>
  `;

  return sharp(Buffer.from(svg)).png().toBuffer();
}

/**
 * Cria overlay com o título do artigo em tipografia dual (Serif + Sans),
 * sem retângulo/card fechado, com degradê suave e rodapé editorial limpo.
 */
function createTitleOverlaySvg({ width, height, title, brandName, brandHandle, colors = [], format, footerText }) {
  const cleanBrand = escapeXml(brandName || 'Anauê Design').toUpperCase();
  const cleanFooter = escapeXml(footerText || 'Design  •  Marketing  •  IA   |   anauedesign.com.br');
  const colorAccent = colors[2] || colors[0] || '#00D2FF';

  // Configuração padrão: instagram_feed_portrait_4x5 (1080x1350) - Retrato Feed Instagram com fonte +50%
  let maxCharsHeadline = 16;
  let maxCharsKicker = 20;
  let kickerFontSize = 51;      // +50% para leitura nítida no feed
  let kickerLineHeight = 64;
  let headlineFontSize = 71;    // +50% para destaque editorial impactante
  let headlineLineHeight = 88;
  let startX = 80;
  let textBottomMargin = 95;
  let vignetteTop = height * 0.40;
  let brandY = 50;

  if (format === 'linkedin_twitter_facebook_16x9') {
    // 1200 x 675 (Horizontal - LinkedIn, X/Twitter, Facebook)
    maxCharsHeadline = 28;
    maxCharsKicker = 32;
    kickerFontSize = 30;
    kickerLineHeight = 38;
    headlineFontSize = 50;
    headlineLineHeight = 60;
    startX = 80;
    textBottomMargin = 72;
    vignetteTop = height * 0.25;
    brandY = 45;
  } else if (format === 'instagram_threads_square_1x1') {
    // 1080 x 1080 (Quadrado - Instagram, Threads) com fonte +50%
    maxCharsHeadline = 15;
    maxCharsKicker = 19;
    kickerFontSize = 54;      // +50%
    kickerLineHeight = 68;
    headlineFontSize = 80;    // +50%
    headlineLineHeight = 96;
    startX = 75;
    textBottomMargin = 90;
    vignetteTop = height * 0.35;
    brandY = 45;
  } else if (format === 'instagram_stories_reels_9x16') {
    // 1080 x 1920 (Vertical 9:16 - Stories e Reels) com fonte +50%
    maxCharsHeadline = 16;
    maxCharsKicker = 20;
    kickerFontSize = 51;      // +50%
    kickerLineHeight = 64;
    headlineFontSize = 71;    // +50%
    headlineLineHeight = 88;
    startX = 80;
    textBottomMargin = 150;
    vignetteTop = height * 0.44;
    brandY = 135;
  }

  const parsed = parseDualFontTitle(title, maxCharsHeadline, maxCharsKicker);

  // Escala dinâmica suave para títulos muito longos
  const totalChars = (title || '').length;
  if (totalChars > 115) {
    headlineFontSize = Math.round(headlineFontSize * 0.82);
    headlineLineHeight = Math.round(headlineLineHeight * 0.84);
    kickerFontSize = Math.round(kickerFontSize * 0.85);
    kickerLineHeight = Math.round(kickerLineHeight * 0.85);
  } else if (totalChars > 80) {
    headlineFontSize = Math.round(headlineFontSize * 0.90);
    headlineLineHeight = Math.round(headlineLineHeight * 0.90);
  }

  const kickerBlockHeight = parsed.hasKicker ? (parsed.kickerLines.length * kickerLineHeight) : 0;
  const headlineBlockHeight = parsed.headlineLines.length * headlineLineHeight;
  const gap = parsed.hasKicker ? 16 : 0;
  const totalTextHeight = kickerBlockHeight + gap + headlineBlockHeight;

  const textBottomY = height - textBottomMargin;
  const textStartY = textBottomY - totalTextHeight;

  const kickerTspans = parsed.kickerLines.map((l, i) =>
    `<tspan x="${startX}" dy="${i === 0 ? 0 : kickerLineHeight}">${escapeXml(l)}</tspan>`
  ).join('\n');

  const headlineStartY = parsed.hasKicker ? (textStartY + kickerBlockHeight + gap) : textStartY;
  const headlineTspans = parsed.headlineLines.map((l, i) =>
    `<tspan x="${startX}" dy="${i === 0 ? 0 : headlineLineHeight}">${escapeXml(l)}</tspan>`
  ).join('\n');

  const footerLineY = height - Math.round(textBottomMargin * 0.65);
  const footerTextY = height - Math.round(textBottomMargin * 0.28);

  return Buffer.from(`
  <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="editorialVignette_${format}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#040711" stop-opacity="0" />
        <stop offset="28%" stop-color="#040711" stop-opacity="0.45" />
        <stop offset="65%" stop-color="#040711" stop-opacity="0.88" />
        <stop offset="100%" stop-color="#040711" stop-opacity="0.98" />
      </linearGradient>
    </defs>

    <!-- Degradê suave na base para contraste impecável e visual fluido (sem caixas) -->
    <rect x="0" y="${vignetteTop}" width="${width}" height="${height - vignetteTop}" fill="url(#editorialVignette_${format})" />

    <!-- Cápsula da Marca Minimalista e Elegante -->
    <g transform="translate(${startX}, ${brandY})">
      <rect x="0" y="0" width="${cleanBrand.length * 10 + 36}" height="32" rx="16" fill="#000000" fill-opacity="0.55" stroke="${colorAccent}" stroke-width="1.2" stroke-opacity="0.8" />
      <text x="18" y="21" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="12" font-weight="700" fill="${colorAccent}" letter-spacing="1.8">
        ${cleanBrand}
      </text>
    </g>

    <!-- Fonte 1: Kicker / Gancho Editorial em Serif Itálico (Humano e Expressivo) -->
    ${parsed.hasKicker ? `
    <g filter="drop-shadow(0 2px 6px rgba(0,0,0,0.85))">
      <line x1="${startX}" y1="${textStartY - 6}" x2="${startX + 45}" y2="${textStartY - 6}" stroke="${colorAccent}" stroke-width="2.5" stroke-linecap="round" />
      <text x="${startX}" y="${textStartY + kickerFontSize}" font-family="'Playfair Display', 'Newsreader', 'Georgia', 'DejaVu Serif', serif" font-style="italic" font-size="${kickerFontSize}" font-weight="600" fill="${colorAccent}" letter-spacing="0.5">
        ${kickerTspans}
      </text>
    </g>
    ` : ''}

    <!-- Fonte 2: Manchete Principal em Sans-Serif Bold 800 (Forte e Nítido) -->
    <g filter="drop-shadow(0 3px 10px rgba(0,0,0,0.92))">
      <text x="${startX}" y="${headlineStartY + headlineFontSize}" font-family="'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'DejaVu Sans', Roboto, sans-serif" font-size="${headlineFontSize}" font-weight="800" fill="#ffffff" letter-spacing="-0.5">
        ${headlineTspans}
      </text>
    </g>

    <!-- Rodapé Editorial Minimalista -->
    <line x1="${startX}" y1="${footerLineY}" x2="${width - startX}" y2="${footerLineY}" stroke="#334155" stroke-width="1" opacity="0.6" />
    <text x="${width / 2}" y="${footerTextY}" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="${width >= 1200 ? 14 : 15}" font-weight="600" fill="#94a3b8" letter-spacing="1.5">
      ${cleanFooter}
    </text>
  </svg>
  `);
}

/**
 * Processamento e redimensionamento inteligente de mídias para redes sociais.
 */
async function processSocialImages(imageUrl, outputDir, options = {}) {
  try {
    const imagesDir = path.join(outputDir, 'images');
    if (!fs.existsSync(imagesDir)) {
      fs.mkdirSync(imagesDir, { recursive: true });
    }

    const brandName = options.client?.brandName || options.client?.name || 'Marca';
    const brandHandle = options.client?.brandHandle || '';
    const articleTitle = options.title || options.article?.title || 'Artigo em Destaque';
    const colors = options.client?.visualIdentity?.preferredColors || ['#0052FF', '#0A0E17', '#00D2FF'];
    const footerText = options.footerText || options.client?.footerText || options.client?.visualIdentity?.footerText || 'Design - Marketing - IA  |  anauedesign.com.br';

    let inputBuffer = null;
    let isFallbackCard = false;

    if (imageUrl && (imageUrl.startsWith('http://') || imageUrl.startsWith('https://'))) {
      try {
        const res = await fetch(imageUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36'
          }
        });
        if (res.ok) {
          inputBuffer = Buffer.from(await res.arrayBuffer());
        }
      } catch (err) {
        console.warn(`[AVISO] Falha ao baixar imagem remota (${imageUrl}): ${err.message}`);
      }
    } else if (imageUrl && fs.existsSync(imageUrl)) {
      inputBuffer = fs.readFileSync(imageUrl);
    }

    // Se não houver imagem válida baixada:
    if (!inputBuffer) {
      const isTopic = Boolean(options.article?.isTopicMode || options.isTopicMode || !imageUrl);
      const shouldTryAi = options.aiImage ||
                          isTopic ||
                          options.client?.generateAiImage ||
                          process.env.GENERATE_AI_IMAGE === 'true' ||
                          process.env.GENERATE_AI_IMAGE === 'auto';

      if (shouldTryAi) {
        try {
          console.log(`   🎨 [IA Visual] Solicitando arte conceitual de background via IA...`);
          const aiImageResult = await generateAiImageIfPossible({
            title: articleTitle,
            description: options.article?.description,
            client: options.client,
            options: {
              ...options,
              visualStyle: options.visualStyle || options.article?.visualStyle,
              visualPromptHint: options.visualPromptHint || options.article?.visualPromptHint
            }
          });

          if (aiImageResult && aiImageResult.buffer) {
            inputBuffer = aiImageResult.buffer;
            const aiOriginalPath = path.join(imagesDir, 'ai_cover_original.jpg');
            fs.writeFileSync(aiOriginalPath, inputBuffer);
            console.log(`   ✓ Arte de background gerada com sucesso via ${aiImageResult.provider} (${aiImageResult.model})!`);
          }
        } catch (aiErr) {
          console.warn(`   ⚠️ [IA Visual Aviso] Falha ao gerar via IA (${aiErr.message}). Alternando para textura abstrata.`);
        }
      }

      // Fallback para textura gráfica abstrata elegante em SVG se a IA não gerou
      if (!inputBuffer) {
        console.log(`   🎨 [Mídia] Gerando textura gráfica abstrata de background para o cliente...`);
        inputBuffer = await generateFallbackCard(1200, 675, articleTitle, brandName, brandHandle, options.client, footerText);
        isFallbackCard = true;
      }
    }

    const formats = [
      {
        name: 'linkedin_twitter_facebook_16x9',
        width: 1200,
        height: 675,
        desc: 'Horizontal 16:9 (Ideal para LinkedIn, X/Twitter e Facebook)'
      },
      {
        name: 'instagram_feed_portrait_4x5',
        width: 1080,
        height: 1350,
        desc: 'Vertical 4:5 (Padrão ouro do Feed do Instagram - maior retenção)'
      },
      {
        name: 'instagram_threads_square_1x1',
        width: 1080,
        height: 1080,
        desc: 'Quadrado 1:1 (Feed quadrado, Threads e carrossel)'
      },
      {
        name: 'instagram_stories_reels_9x16',
        width: 1080,
        height: 1920,
        desc: 'Vertical 9:16 (Stories do Instagram, Reels e WhatsApp Status)'
      }
    ];

    const results = [];

    for (const fmt of formats) {
      const baseName = fmt.name;
      const webpPath = path.join(imagesDir, `${baseName}.webp`);
      const jpgPath = path.join(imagesDir, `${baseName}.jpg`);

      if (fmt.height > fmt.width) {
        // Formatos verticais (4:5 Retrato Padrão e 9:16 Vertical)
        // Fundo estendido com blur suave
        const background = await sharp(inputBuffer)
          .resize(fmt.width, fmt.height, { fit: 'cover' })
          .blur(30)
          .modulate({ brightness: 0.55 })
          .toBuffer();

        // 1. Ampliação da imagem original em 25% (1.25x)
        const is4x5 = fmt.name === 'instagram_feed_portrait_4x5';
        const meta = await sharp(inputBuffer).metadata().catch(() => ({}));
        const aspect = (meta.width && meta.height) ? (meta.width / meta.height) : (16 / 9);
        const zoom = 1.25;
        const targetWidth = Math.round(fmt.width * zoom); // 1080 * 1.25 = 1350

        let targetHeight = Math.round(targetWidth / aspect);
        const maxHeight = is4x5 ? 780 : 920;
        if (targetHeight > maxHeight) targetHeight = maxHeight;

        // Recorta a faixa centralizada de largura fmt.width (1080)
        const croppedImage = await sharp(inputBuffer)
          .resize(targetWidth, targetHeight, { fit: 'cover', position: 'center' })
          .extract({
            left: Math.round((targetWidth - fmt.width) / 2),
            top: 0,
            width: fmt.width,
            height: targetHeight
          })
          .toBuffer();

        // Aplica ligeiro degradê transparente na base da imagem vinda do post (transição suave e humana)
        const fadeMaskSvg = Buffer.from(`
          <svg width="${fmt.width}" height="${targetHeight}" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <linearGradient id="imgBaseFade_${fmt.name}" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="#ffffff" stop-opacity="1" />
                <stop offset="55%" stop-color="#ffffff" stop-opacity="1" />
                <stop offset="85%" stop-color="#ffffff" stop-opacity="0.4" />
                <stop offset="100%" stop-color="#ffffff" stop-opacity="0" />
              </linearGradient>
            </defs>
            <rect width="100%" height="100%" fill="url(#imgBaseFade_${fmt.name})" />
          </svg>
        `);

        const mainOverlay = await sharp(croppedImage)
          .composite([{ input: fadeMaskSvg, blend: 'dest-in' }])
          .png()
          .toBuffer();

        // 2. Posicionamento vertical:
        const overlayTop = is4x5 ? 110 : 280;

        const brandedOverlay = createTitleOverlaySvg({
          width: fmt.width,
          height: fmt.height,
          title: articleTitle,
          brandName,
          brandHandle,
          colors,
          format: fmt.name,
          footerText
        });

        const compositeLayers = [
          { input: mainOverlay, top: overlayTop, left: 0 },
          { input: brandedOverlay, top: 0, left: 0 }
        ];

        await sharp(background)
          .composite(compositeLayers)
          .webp({ quality: 90 })
          .toFile(webpPath);

        await sharp(background)
          .composite(compositeLayers)
          .jpeg({ quality: 90 })
          .toFile(jpgPath);

      } else {
        // Formatos horizontais (16:9) e quadrados (1:1)
        const baseLayer = await sharp(inputBuffer)
          .resize(fmt.width, fmt.height, { fit: 'cover', position: 'center' })
          .toBuffer();

        // Sobrepõe título completo, badge e degradê com rodapé exclusivo
        const titleOverlay = createTitleOverlaySvg({
          width: fmt.width,
          height: fmt.height,
          title: articleTitle,
          brandName,
          brandHandle,
          colors,
          format: fmt.name,
          footerText
        });

        await sharp(baseLayer)
          .composite([{ input: titleOverlay, top: 0, left: 0 }])
          .webp({ quality: 90 })
          .toFile(webpPath);

        await sharp(baseLayer)
          .composite([{ input: titleOverlay, top: 0, left: 0 }])
          .jpeg({ quality: 90 })
          .toFile(jpgPath);
      }

      results.push({
        format: fmt.name,
        width: fmt.width,
        height: fmt.height,
        description: fmt.desc,
        files: {
          webp: webpPath,
          jpg: jpgPath
        }
      });
    }

    return results;
  } catch (error) {
    throw new Error(`Erro no processamento de imagens: ${error.message}`);
  }
}

module.exports = { processSocialImages, createTitleOverlaySvg };
