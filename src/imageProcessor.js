const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

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
async function generateFallbackCard(width, height, title, brandName, brandHandle) {
  const cleanTitle = escapeXml(title || 'Artigo em Destaque');
  const cleanBrand = escapeXml(brandName || 'Onda Conecta').toUpperCase();
  const cleanHandle = escapeXml(brandHandle || '');
  const lines = wrapText(title, 32, 4);

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
        <stop offset="0%" stop-color="#38bdf8" />
        <stop offset="100%" stop-color="#818cf8" />
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
 * Cria overlay com badge e rodapé de marca para formatos verticais.
 */
function createBrandedOverlaySvg(width, height, brandName, brandHandle) {
  const cleanBrand = escapeXml(brandName || 'Onda Conecta').toUpperCase();
  const cleanHandle = escapeXml(brandHandle || '');

  return Buffer.from(`
  <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
    <!-- Barra Superior -->
    <rect x="0" y="0" width="${width}" height="140" fill="black" fill-opacity="0.35" />
    <text x="${width / 2}" y="85" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="24" font-weight="800" fill="#f8fafc" letter-spacing="3">
      ${cleanBrand}
    </text>

    <!-- Barra Inferior -->
    <rect x="0" y="${height - 130}" width="${width}" height="130" fill="black" fill-opacity="0.45" />
    <text x="${width / 2}" y="${height - 65}" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="22" font-weight="600" fill="#38bdf8">
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

    let inputBuffer = null;

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

    // Se não houver imagem válida baixada, gera card moderno premium como base
    if (!inputBuffer) {
      console.log(`   🎨 [Mídia] Gerando card gráfico profissional com o título e marca do cliente...`);
      inputBuffer = await generateFallbackCard(1200, 675, articleTitle, brandName, brandHandle);
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

        const brandedOverlay = createBrandedOverlaySvg(fmt.width, fmt.height, brandName, brandHandle);

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
        // Formatos horizontais e quadrados
        await sharp(inputBuffer)
          .resize(fmt.width, fmt.height, { fit: 'cover', position: 'center' })
          .webp({ quality: 90 })
          .toFile(webpPath);

        await sharp(inputBuffer)
          .resize(fmt.width, fmt.height, { fit: 'cover', position: 'center' })
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

module.exports = { processSocialImages };
