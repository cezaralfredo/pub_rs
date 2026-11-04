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
 * Quebra texto em linhas para renderização com <tspan> em SVG.
 */
function wrapText(text, maxCharsPerLine = 34, maxLines = 4) {
  const words = (text || '').trim().split(/\s+/);
  const lines = [];
  let currentLine = '';

  for (const word of words) {
    if ((currentLine + ' ' + word).trim().length <= maxCharsPerLine) {
      currentLine = (currentLine + ' ' + word).trim();
    } else {
      if (currentLine) lines.push(currentLine);
      currentLine = word;
      if (lines.length >= maxLines - 1) {
        break;
      }
    }
  }
  if (currentLine && lines.length < maxLines) {
    lines.push(currentLine);
  }
  return lines;
}

/**
 * Cria um card gráfico moderno de backup quando o artigo não tem imagem original.
 */
async function generateFallbackCard(width, height, title, brandName, brandHandle, client = {}) {
  const cleanTitle = escapeXml(title || 'Artigo em Destaque');
  const cleanBrand = escapeXml(brandName || 'Onda Conecta').toUpperCase();
  const cleanHandle = escapeXml(brandHandle || '');
  const lines = wrapText(title, 32, 4);

  const colors = client.visualIdentity?.preferredColors || ['#38bdf8', '#818cf8'];
  const color1 = colors[0] || '#38bdf8';
  const color2 = colors[1] || colors[0] || '#818cf8';

  const tspans = lines.map((line, idx) => 
    `<tspan x="100" dy="${idx === 0 ? 0 : 58}">${escapeXml(line)}</tspan>`
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
    <rect x="100" y="90" width="${cleanBrand.length * 14 + 60}" height="42" rx="21" fill="#ffffff" fill-opacity="0.08" stroke="#38bdf8" stroke-width="1.5" />
    <text x="130" y="117" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="16" font-weight="700" fill="#38bdf8" letter-spacing="2">
      ${cleanBrand}
    </text>

    <!-- Título do Artigo -->
    <text x="100" y="240" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="46" font-weight="800" fill="#f8fafc" letter-spacing="-0.5">
      ${tspans}
    </text>

    <!-- Rodapé / CTA -->
    <line x1="100" y1="${height - 110}" x2="${width - 100}" y2="${height - 110}" stroke="#334155" stroke-width="1" />
    <text x="100" y="${height - 70}" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="18" font-weight="600" fill="#94a3b8">
      NOVO ARTIGO NO BLOG
    </text>
    <text x="${width - 100}" y="${height - 70}" text-anchor="end" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="18" font-weight="600" fill="#38bdf8">
      ${cleanHandle || 'Leia na íntegra ➔'}
    </text>
  </svg>
  `;

  return sharp(Buffer.from(svg)).png().toBuffer();
}

/**
 * Cria overlay com o título do artigo, badge da marca e rodapé editorial
 * para sobrepor sobre a imagem nos 4 formatos oficiais das redes sociais.
 */
function createTitleOverlaySvg({ width, height, title, brandName, brandHandle, colors = [], format }) {
  const cleanTitle = escapeXml(title || 'Artigo em Destaque');
  const cleanBrand = escapeXml(brandName || 'Onda Conecta').toUpperCase();
  const cleanHandle = escapeXml(brandHandle || '');
  const color1 = colors[0] || '#0052FF';
  const colorAccent = colors[2] || colors[0] || '#00D2FF';

  if (format === 'linkedin_twitter_facebook_16x9') {
    // 1200 x 675 (Horizontal - LinkedIn, X/Twitter, Facebook)
    const lines = wrapText(cleanTitle, 34, 3);
    const lineHeight = 54;
    const startY = height - 120 - ((lines.length - 1) * lineHeight);

    const tspans = lines.map((l, i) =>
      `<tspan x="80" dy="${i === 0 ? 0 : lineHeight}">${l}</tspan>`
    ).join('\n');

    return Buffer.from(`
    <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="overlayGrad16x9" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#050a14" stop-opacity="0" />
          <stop offset="25%" stop-color="#050a14" stop-opacity="0.25" />
          <stop offset="60%" stop-color="#050a14" stop-opacity="0.82" />
          <stop offset="100%" stop-color="#050a14" stop-opacity="0.96" />
        </linearGradient>
      </defs>

      <!-- Gradiente escuro para legibilidade máxima -->
      <rect x="0" y="0" width="${width}" height="${height}" fill="url(#overlayGrad16x9)" />

      <!-- Badge de Marca no canto superior -->
      <g transform="translate(80, 50)">
        <rect x="0" y="0" width="${cleanBrand.length * 11 + 40}" height="34" rx="17" fill="#000000" fill-opacity="0.6" stroke="${colorAccent}" stroke-width="1.5" />
        <text x="20" y="22" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="13" font-weight="700" fill="${colorAccent}" letter-spacing="1.5">
          ${cleanBrand}
        </text>
      </g>

      <!-- Título do Artigo -->
      <g filter="drop-shadow(0px 3px 6px rgba(0,0,0,0.85))">
        <text x="80" y="${startY}" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="44" font-weight="800" fill="#ffffff" letter-spacing="-0.5">
          ${tspans}
        </text>
      </g>

      <!-- Rodapé / CTA -->
      <line x1="80" y1="${height - 60}" x2="${width - 80}" y2="${height - 60}" stroke="#334155" stroke-width="1" opacity="0.6" />
      <text x="80" y="${height - 35}" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="14" font-weight="600" fill="#94a3b8" letter-spacing="1">
        ARTIGO COMPLETO
      </text>
      <text x="${width - 80}" y="${height - 35}" text-anchor="end" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="14" font-weight="600" fill="${colorAccent}">
        ${cleanHandle ? `${cleanHandle} · Leia agora ➔` : 'Leia na íntegra ➔'}
      </text>
    </svg>
    `);
  }

  if (format === 'instagram_threads_square_1x1') {
    // 1080 x 1080 (Quadrado - Instagram, Threads)
    const lines = wrapText(cleanTitle, 28, 3);
    const lineHeight = 54;
    const startY = height - 140 - ((lines.length - 1) * lineHeight);

    const tspans = lines.map((l, i) =>
      `<tspan x="70" dy="${i === 0 ? 0 : lineHeight}">${l}</tspan>`
    ).join('\n');

    return Buffer.from(`
    <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="overlayGrad1x1" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#050a14" stop-opacity="0" />
          <stop offset="30%" stop-color="#050a14" stop-opacity="0.25" />
          <stop offset="60%" stop-color="#050a14" stop-opacity="0.85" />
          <stop offset="100%" stop-color="#050a14" stop-opacity="0.96" />
        </linearGradient>
      </defs>

      <!-- Gradiente escuro para legibilidade -->
      <rect x="0" y="0" width="${width}" height="${height}" fill="url(#overlayGrad1x1)" />

      <!-- Badge de Marca -->
      <g transform="translate(70, 60)">
        <rect x="0" y="0" width="${cleanBrand.length * 11 + 40}" height="36" rx="18" fill="#000000" fill-opacity="0.6" stroke="${colorAccent}" stroke-width="1.5" />
        <text x="20" y="23" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="14" font-weight="700" fill="${colorAccent}" letter-spacing="1.5">
          ${cleanBrand}
        </text>
      </g>

      <!-- Título do Artigo -->
      <g filter="drop-shadow(0px 3px 6px rgba(0,0,0,0.85))">
        <text x="70" y="${startY}" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="44" font-weight="800" fill="#ffffff" letter-spacing="-0.5">
          ${tspans}
        </text>
      </g>

      <!-- Rodapé -->
      <line x1="70" y1="${height - 70}" x2="${width - 70}" y2="${height - 70}" stroke="#334155" stroke-width="1" opacity="0.6" />
      <text x="70" y="${height - 40}" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="15" font-weight="600" fill="#94a3b8">
        ANÁLISE &amp; ESTRATÉGIA
      </text>
      <text x="${width - 70}" y="${height - 40}" text-anchor="end" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="15" font-weight="600" fill="${colorAccent}">
        ${cleanHandle ? `${cleanHandle} · Salve este post` : 'Toque para conferir ➔'}
      </text>
    </svg>
    `);
  }

  // Formatos Verticais (4:5 e 9:16)
  const is4x5 = format === 'instagram_feed_portrait_4x5';
  const lines = wrapText(cleanTitle, is4x5 ? 26 : 24, 4);
  const lineHeight = 56;
  const cardHeight = lines.length * lineHeight + 100;
  const cardY = is4x5 ? height - cardHeight - 120 : height - cardHeight - 200;

  const tspans = lines.map((l, i) =>
    `<tspan x="${width / 2}" dy="${i === 0 ? 0 : lineHeight}">${l}</tspan>`
  ).join('\n');

  return Buffer.from(`
  <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="cardGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#0a0f1d" stop-opacity="0.92" />
        <stop offset="100%" stop-color="#050a14" stop-opacity="0.98" />
      </linearGradient>
    </defs>

    <!-- Barra Superior -->
    <rect x="0" y="0" width="${width}" height="140" fill="#000000" fill-opacity="0.55" />
    <text x="${width / 2}" y="85" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="24" font-weight="800" fill="#ffffff" letter-spacing="3">
      ${cleanBrand}
    </text>

    <!-- Card Central com o Título sobre a Imagem -->
    <rect x="50" y="${cardY}" width="${width - 100}" height="${cardHeight}" rx="24" fill="url(#cardGrad)" stroke="${colorAccent}" stroke-width="1.5" stroke-opacity="0.7" />
    <rect x="${width / 2 - 40}" y="${cardY + 20}" width="80" height="4" rx="2" fill="${colorAccent}" />

    <!-- Título do Artigo Centralizado -->
    <g filter="drop-shadow(0px 3px 6px rgba(0,0,0,0.85))">
      <text x="${width / 2}" y="${cardY + 75}" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="42" font-weight="800" fill="#ffffff" letter-spacing="-0.5">
        ${tspans}
      </text>
    </g>

    <!-- Barra Inferior -->
    <rect x="0" y="${height - 130}" width="${width}" height="130" fill="#000000" fill-opacity="0.65" />
    <text x="${width / 2}" y="${height - 65}" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="22" font-weight="600" fill="${colorAccent}">
      ${cleanHandle ? `${cleanHandle} · Toque para ler o artigo completo` : '👉 Toque para ler o artigo completo'}
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
        inputBuffer = await generateFallbackCard(1200, 675, articleTitle, brandName, brandHandle, options.client);
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
        // Formatos verticais (4:5 ou 9:16):
        // Cria fundo estendido com blur suave e posiciona a imagem original nítida ao centro
        const background = await sharp(inputBuffer)
          .resize(fmt.width, fmt.height, { fit: 'cover' })
          .blur(30)
          .modulate({ brightness: 0.60 })
          .toBuffer();

        const mainOverlay = await sharp(inputBuffer)
          .resize(fmt.width, Math.round(fmt.width * (9 / 16)), { fit: 'contain' })
          .toBuffer();

        const brandedOverlay = createTitleOverlaySvg({
          width: fmt.width,
          height: fmt.height,
          title: articleTitle,
          brandName,
          brandHandle,
          colors,
          format: fmt.name
        });

        const compositeLayers = [
          { input: mainOverlay, gravity: 'center' },
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
          // Sobrepõe título, badge e degradê para máxima legibilidade e clareza aos leitores
          const titleOverlay = createTitleOverlaySvg({
            width: fmt.width,
            height: fmt.height,
            title: articleTitle,
            brandName,
            brandHandle,
            colors,
            format: fmt.name
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
