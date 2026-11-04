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
 * Cria um card gráfico moderno de backup quando o artigo não tem imagem original.
 */
async function generateFallbackCard(width, height, title, brandName, brandHandle, client = {}, footerText) {
  const cleanTitle = (title || 'Artigo em Destaque').trim();
  const cleanBrand = escapeXml(brandName || 'Anauê Design').toUpperCase();
  const cleanFooter = escapeXml(footerText || client.footerText || 'Design - Marketing - IA  |  anauedesign.com.br');

  let maxChars = 32;
  let fontSize = 44;
  let lineHeight = 54;
  if (cleanTitle.length > 110) {
    maxChars = 44;
    fontSize = 28;
    lineHeight = 36;
  } else if (cleanTitle.length > 70) {
    maxChars = 38;
    fontSize = 34;
    lineHeight = 44;
  }

  const lines = wrapFullText(cleanTitle, maxChars);
  const colors = client.visualIdentity?.preferredColors || ['#38bdf8', '#818cf8'];
  const color1 = colors[0] || '#38bdf8';
  const color2 = colors[1] || colors[0] || '#818cf8';

  const tspans = lines.map((line, idx) => 
    `<tspan x="100" dy="${idx === 0 ? 0 : lineHeight}">${escapeXml(line)}</tspan>`
  ).join('\n');

  const svg = `
  <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#0a0f1d" />
        <stop offset="50%" stop-color="#0f172a" />
        <stop offset="100%" stop-color="#1e1b4b" />
      </linearGradient>
      <linearGradient id="accentGrad" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="${color1}" />
        <stop offset="100%" stop-color="${color2}" />
      </linearGradient>
    </defs>

    <!-- Fundo Escuro Gradiente -->
    <rect width="100%" height="100%" fill="url(#bgGrad)" />

    <!-- Grade / Glow Sutil -->
    <circle cx="${width - 150}" cy="150" r="320" fill="#38bdf8" opacity="0.08" filter="blur(80px)" />
    <circle cx="150" cy="${height - 150}" r="280" fill="#818cf8" opacity="0.08" filter="blur(70px)" />

    <!-- Badge da Marca -->
    <rect x="100" y="80" width="${cleanBrand.length * 14 + 60}" height="42" rx="21" fill="#ffffff" fill-opacity="0.08" stroke="#38bdf8" stroke-width="1.5" />
    <text x="130" y="107" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="16" font-weight="700" fill="#38bdf8" letter-spacing="2">
      ${cleanBrand}
    </text>

    <!-- Título do Artigo Completo -->
    <text x="100" y="210" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="${fontSize}" font-weight="800" fill="#f8fafc" letter-spacing="-0.5">
      ${tspans}
    </text>

    <!-- Rodapé: estritamente a informação solicitada pelo cliente -->
    <line x1="100" y1="${height - 80}" x2="${width - 100}" y2="${height - 80}" stroke="#334155" stroke-width="1" />
    <text x="${width / 2}" y="${height - 40}" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="16" font-weight="600" fill="#94a3b8" letter-spacing="1">
      ${cleanFooter}
    </text>
  </svg>
  `;

  return sharp(Buffer.from(svg)).png().toBuffer();
}

/**
 * Cria overlay com o título do artigo completo, badge da marca e rodapé editorial
 * para sobrepor sobre a imagem nos 4 formatos oficiais das redes sociais.
 */
function createTitleOverlaySvg({ width, height, title, brandName, brandHandle, colors = [], format, footerText }) {
  const cleanTitle = (title || 'Artigo em Destaque').trim();
  const cleanBrand = escapeXml(brandName || 'Anauê Design').toUpperCase();
  const cleanFooter = escapeXml(footerText || 'Design - Marketing - IA  |  anauedesign.com.br');
  const color1 = colors[0] || '#0052FF';
  const colorAccent = colors[2] || colors[0] || '#00D2FF';

  if (format === 'linkedin_twitter_facebook_16x9') {
    // 1200 x 675 (Horizontal - LinkedIn, X/Twitter, Facebook)
    let maxChars = 34;
    let fontSize = 42;
    let lineHeight = 50;

    if (cleanTitle.length > 110) {
      maxChars = 44;
      fontSize = 26;
      lineHeight = 34;
    } else if (cleanTitle.length > 70) {
      maxChars = 38;
      fontSize = 32;
      lineHeight = 40;
    }

    const lines = wrapFullText(cleanTitle, maxChars);
    const startY = height - 70 - ((lines.length - 1) * lineHeight);

    const tspans = lines.map((l, i) =>
      `<tspan x="80" dy="${i === 0 ? 0 : lineHeight}">${escapeXml(l)}</tspan>`
    ).join('\n');

    return Buffer.from(`
    <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="overlayGrad16x9" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#050a14" stop-opacity="0" />
          <stop offset="25%" stop-color="#050a14" stop-opacity="0.3" />
          <stop offset="55%" stop-color="#050a14" stop-opacity="0.85" />
          <stop offset="100%" stop-color="#050a14" stop-opacity="0.98" />
        </linearGradient>
      </defs>

      <!-- Gradiente escuro para legibilidade máxima -->
      <rect x="0" y="0" width="${width}" height="${height}" fill="url(#overlayGrad16x9)" />

      <!-- Badge de Marca no canto superior -->
      <g transform="translate(80, 50)">
        <rect x="0" y="0" width="${cleanBrand.length * 11 + 40}" height="34" rx="17" fill="#000000" fill-opacity="0.65" stroke="${colorAccent}" stroke-width="1.5" />
        <text x="20" y="22" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="13" font-weight="700" fill="${colorAccent}" letter-spacing="1.5">
          ${cleanBrand}
        </text>
      </g>

      <!-- Título do Artigo Completo -->
      <g filter="drop-shadow(0px 3px 6px rgba(0,0,0,0.85))">
        <text x="80" y="${startY}" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="${fontSize}" font-weight="800" fill="#ffffff" letter-spacing="-0.5">
          ${tspans}
        </text>
      </g>

      <!-- Rodapé: estritamente a informação solicitada -->
      <line x1="80" y1="${height - 50}" x2="${width - 80}" y2="${height - 50}" stroke="#334155" stroke-width="1" opacity="0.6" />
      <text x="${width / 2}" y="${height - 22}" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="14" font-weight="600" fill="#94a3b8" letter-spacing="1">
        ${cleanFooter}
      </text>
    </svg>
    `);
  }

  if (format === 'instagram_threads_square_1x1') {
    // 1080 x 1080 (Quadrado - Instagram, Threads)
    let maxChars = 28;
    let fontSize = 42;
    let lineHeight = 52;

    if (cleanTitle.length > 110) {
      maxChars = 38;
      fontSize = 28;
      lineHeight = 36;
    } else if (cleanTitle.length > 70) {
      maxChars = 32;
      fontSize = 34;
      lineHeight = 44;
    }

    const lines = wrapFullText(cleanTitle, maxChars);
    const startY = height - 90 - ((lines.length - 1) * lineHeight);

    const tspans = lines.map((l, i) =>
      `<tspan x="70" dy="${i === 0 ? 0 : lineHeight}">${escapeXml(l)}</tspan>`
    ).join('\n');

    return Buffer.from(`
    <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="overlayGrad1x1" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#050a14" stop-opacity="0" />
          <stop offset="30%" stop-color="#050a14" stop-opacity="0.3" />
          <stop offset="60%" stop-color="#050a14" stop-opacity="0.88" />
          <stop offset="100%" stop-color="#050a14" stop-opacity="0.98" />
        </linearGradient>
      </defs>

      <!-- Gradiente escuro para legibilidade -->
      <rect x="0" y="0" width="${width}" height="${height}" fill="url(#overlayGrad1x1)" />

      <!-- Badge de Marca -->
      <g transform="translate(70, 60)">
        <rect x="0" y="0" width="${cleanBrand.length * 11 + 40}" height="36" rx="18" fill="#000000" fill-opacity="0.65" stroke="${colorAccent}" stroke-width="1.5" />
        <text x="20" y="23" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="14" font-weight="700" fill="${colorAccent}" letter-spacing="1.5">
          ${cleanBrand}
        </text>
      </g>

      <!-- Título do Artigo Completo -->
      <g filter="drop-shadow(0px 3px 6px rgba(0,0,0,0.85))">
        <text x="70" y="${startY}" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="${fontSize}" font-weight="800" fill="#ffffff" letter-spacing="-0.5">
          ${tspans}
        </text>
      </g>

      <!-- Rodapé: estritamente a informação solicitada -->
      <line x1="70" y1="${height - 60}" x2="${width - 70}" y2="${height - 60}" stroke="#334155" stroke-width="1" opacity="0.6" />
      <text x="${width / 2}" y="${height - 28}" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="15" font-weight="600" fill="#94a3b8" letter-spacing="1">
        ${cleanFooter}
      </text>
    </svg>
    `);
  }

  // Formatos Verticais: 4:5 Retrato (Padrão Instagram) e 9:16 Vertical
  const is4x5 = format === 'instagram_feed_portrait_4x5';
  let maxChars = is4x5 ? 26 : 24;
  let fontSize = 36;
  let lineHeight = 46;

  if (cleanTitle.length > 120) {
    maxChars = is4x5 ? 36 : 32;
    fontSize = 24;
    lineHeight = 32;
  } else if (cleanTitle.length > 80) {
    maxChars = is4x5 ? 32 : 28;
    fontSize = 28;
    lineHeight = 38;
  } else if (cleanTitle.length > 50) {
    maxChars = is4x5 ? 28 : 26;
    fontSize = 32;
    lineHeight = 42;
  }

  const lines = wrapFullText(cleanTitle, maxChars);
  const cardPaddingY = 30;
  const cardHeight = lines.length * lineHeight + (cardPaddingY * 2) + 16;
  const footerHeight = is4x5 ? 75 : 95;
  const cardY = is4x5
    ? Math.max(height - cardHeight - footerHeight - 25, 870)
    : Math.max(height - cardHeight - footerHeight - 50, 1220);

  const tspans = lines.map((l, i) =>
    `<tspan x="${width / 2}" dy="${i === 0 ? 0 : lineHeight}">${escapeXml(l)}</tspan>`
  ).join('\n');

  return Buffer.from(`
  <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="cardGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#0a0f1d" stop-opacity="0.94" />
        <stop offset="100%" stop-color="#050a14" stop-opacity="0.98" />
      </linearGradient>
    </defs>

    <!-- Barra Superior -->
    <rect x="0" y="0" width="${width}" height="${is4x5 ? 115 : 140}" fill="#000000" fill-opacity="0.65" />
    <text x="${width / 2}" y="${is4x5 ? 72 : 85}" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="${is4x5 ? 22 : 24}" font-weight="800" fill="#ffffff" letter-spacing="3">
      ${cleanBrand}
    </text>

    <!-- Card Central com o Título sobre a Imagem (Tamanho Dinâmico para Título 100% Completo) -->
    <rect x="50" y="${cardY}" width="${width - 100}" height="${cardHeight}" rx="22" fill="url(#cardGrad)" stroke="${colorAccent}" stroke-width="1.5" stroke-opacity="0.75" />
    <rect x="${width / 2 - 40}" y="${cardY + 16}" width="80" height="4" rx="2" fill="${colorAccent}" />

    <!-- Título do Artigo Completo -->
    <g filter="drop-shadow(0px 3px 6px rgba(0,0,0,0.85))">
      <text x="${width / 2}" y="${cardY + 32 + fontSize}" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="${fontSize}" font-weight="800" fill="#ffffff" letter-spacing="-0.5">
        ${tspans}
      </text>
    </g>

    <!-- Barra Inferior: estritamente a informação solicitada -->
    <rect x="0" y="${height - footerHeight}" width="${width}" height="${footerHeight}" fill="#000000" fill-opacity="0.85" />
    <line x1="0" y1="${height - footerHeight}" x2="${width}" y2="${height - footerHeight}" stroke="#334155" stroke-width="1" opacity="0.6" />
    <text x="${width / 2}" y="${height - Math.round(footerHeight / 2) + 6}" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="${is4x5 ? 17 : 19}" font-weight="600" fill="#94a3b8" letter-spacing="1">
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
      const shouldTryAi = options.aiImage ||
                          options.client?.generateAiImage ||
                          process.env.GENERATE_AI_IMAGE === 'true' ||
                          process.env.GENERATE_AI_IMAGE === 'auto';

      const hasAiKey = Boolean(process.env.OPENAI_API_KEY || process.env.GEMINI_API_KEY);

      if (shouldTryAi && hasAiKey) {
        try {
          console.log(`   🎨 [IA Visual] Solicitando arte conceitual via IA...`);
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
            console.log(`   ✓ Arte gerada com sucesso via ${aiImageResult.provider} (${aiImageResult.model})!`);
          }
        } catch (aiErr) {
          console.warn(`   ⚠️ [IA Visual Aviso] Falha ao gerar via IA (${aiErr.message}). Alternando para card SVG.`);
        }
      }

      // Fallback para card gráfico elegante em SVG se a IA não gerou
      if (!inputBuffer) {
        console.log(`   🎨 [Mídia] Gerando card gráfico profissional com o título e marca do cliente...`);
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
        const mainOverlay = await sharp(inputBuffer)
          .resize(targetWidth, targetHeight, { fit: 'cover', position: 'center' })
          .extract({
            left: Math.round((targetWidth - fmt.width) / 2),
            top: 0,
            width: fmt.width,
            height: targetHeight
          })
          .toBuffer();

        // 2. Posicionamento vertical:
        // Sobe um pouco mais da linha do centro para que o texto/card não cubra a imagem
        // No 4:5 (1080x1350): centro é 675. Posiciona em top=135 (centro fica em ~515, 160px acima do centro).
        // No 9:16 (1080x1920): centro é 960. Posiciona em top=360 (centro fica em ~740, 220px acima do centro).
        const overlayTop = is4x5 ? 135 : 360;

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

        if (isFallbackCard && fmt.name === 'linkedin_twitter_facebook_16x9') {
          // O fallback SVG já possui título e layout completo em 16:9
          await sharp(baseLayer).webp({ quality: 90 }).toFile(webpPath);
          await sharp(baseLayer).jpeg({ quality: 90 }).toFile(jpgPath);
        } else {
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

module.exports = { processSocialImages };
