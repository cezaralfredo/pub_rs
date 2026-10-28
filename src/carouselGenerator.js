const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

/**
 * Escapa caracteres para renderização segura em SVG.
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
 * Quebra texto em linhas respeitando limites de caracteres e linhas máximas.
 */
function wrapLines(text, maxCharsPerLine = 30, maxLines = 4) {
  const words = (text || '').trim().split(/\s+/);
  const lines = [];
  let currentLine = '';

  for (const word of words) {
    if ((currentLine + ' ' + word).trim().length <= maxCharsPerLine) {
      currentLine = (currentLine + ' ' + word).trim();
    } else {
      if (currentLine) lines.push(currentLine);
      currentLine = word;
      if (lines.length >= maxLines - 1) break;
    }
  }
  if (currentLine && lines.length < maxLines) {
    lines.push(currentLine);
  }
  return lines;
}

/**
 * Monta o arquivo PDF a partir de uma lista de buffers JPEG.
 * Padrão oficial PDF-1.4 compatível com o LinkedIn Document Posts.
 */
function compileJpegsToPdf(images) {
  const chunks = [];
  const offsets = [];
  let currentOffset = 0;

  function write(strOrBuffer) {
    const buf = Buffer.isBuffer(strOrBuffer) ? strOrBuffer : Buffer.from(strOrBuffer, 'binary');
    chunks.push(buf);
    currentOffset += buf.length;
  }

  write('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');

  const pageCount = images.length;
  const catalogObjNum = 1;
  const pagesObjNum = 2;

  // Obj 1: Catalog
  offsets[catalogObjNum] = currentOffset;
  write(`${catalogObjNum} 0 obj\n<< /Type /Catalog /Pages ${pagesObjNum} 0 R >>\nendobj\n`);

  // Obj 2: Pages root
  const pageObjNums = [];
  for (let i = 0; i < pageCount; i++) {
    pageObjNums.push(`${3 + 3 * i} 0 R`);
  }
  offsets[pagesObjNum] = currentOffset;
  write(`${pagesObjNum} 0 obj\n<< /Type /Pages /Kids [ ${pageObjNums.join(' ')} ] /Count ${pageCount} >>\nendobj\n`);

  // Cada página
  for (let i = 0; i < pageCount; i++) {
    const pageNum = 3 + 3 * i;
    const contentNum = 4 + 3 * i;
    const imageNum = 5 + 3 * i;
    const img = images[i];

    // Page
    offsets[pageNum] = currentOffset;
    write(`${pageNum} 0 obj\n<< /Type /Page /Parent ${pagesObjNum} 0 R /MediaBox [ 0 0 ${img.width} ${img.height} ] /Contents ${contentNum} 0 R /Resources << /XObject << /Im${i + 1} ${imageNum} 0 R >> >> >>\nendobj\n`);

    // Content Stream
    const contentStream = `q\n${img.width} 0 0 ${img.height} 0 0 cm\n/Im${i + 1} Do\nQ\n`;
    offsets[contentNum] = currentOffset;
    write(`${contentNum} 0 obj\n<< /Length ${contentStream.length} >>\nstream\n${contentStream}\nendstream\nendobj\n`);

    // Image XObject
    offsets[imageNum] = currentOffset;
    write(`${imageNum} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${img.width} /Height ${img.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${img.buffer.length} >>\nstream\n`);
    write(img.buffer);
    write('\nendstream\nendobj\n');
  }

  // Tabela XREF
  const startXref = currentOffset;
  const totalObjects = 2 + 3 * pageCount;
  write(`xref\n0 ${totalObjects + 1}\n`);
  write('0000000000 65535 f \n');
  for (let i = 1; i <= totalObjects; i++) {
    const offsetStr = String(offsets[i] || 0).padStart(10, '0');
    write(`${offsetStr} 00000 n \n`);
  }

  // Trailer
  write(`trailer\n<< /Size ${totalObjects + 1} /Root ${catalogObjNum} 0 R >>\nstartxref\n${startXref}\n%%EOF\n`);

  return Buffer.concat(chunks);
}

/**
 * Extrai a lista de slides para o carrossel (de copies.carousel ou do próprio artigo).
 */
function extractCarouselSlidesData(article, client, copies = {}) {
  const brand = client.brandName || client.name || 'Marca';
  const handle = client.brandHandle || '';
  const title = article.title || 'Guia Prático Estratégico';
  const description = article.description || (article.paragraphs && article.paragraphs[0]) || 'Principais insights e aprendizados práticos.';

  // Se o LLM já forneceu estrutura de carrossel
  if (copies.carousel && Array.isArray(copies.carousel.slides) && copies.carousel.slides.length >= 3) {
    return {
      title: copies.carousel.title || title,
      subtitle: copies.carousel.subtitle || description,
      slides: copies.carousel.slides.map((s, idx) => ({
        step: String(idx + 1).padStart(2, '0'),
        headline: s.headline || `Ponto ${idx + 1}`,
        text: s.text || s.body || ''
      })),
      cta: copies.carousel.cta || `Gostou da análise? Salve este carrossel e siga ${handle || brand}!`
    };
  }

  // Extração algorítmica a partir dos dados do artigo
  const rawPoints = (article.bulletPoints && article.bulletPoints.length >= 2)
    ? article.bulletPoints
    : (article.headings && article.headings.length >= 2)
      ? article.headings
      : (article.paragraphs ? article.paragraphs.slice(1, 5) : []);

  const cleanedPoints = rawPoints
    .map(p => p.replace(/^[-*•\d.]+\s*/, '').replace(/:$/, '').trim())
    .filter(p => p.length > 8)
    .slice(0, 4);

  const fallbackPoints = [
    {
      step: '01',
      headline: 'Diagnóstico & Desafio do Cenário',
      text: 'Compreender as mudanças estruturais do mercado e identificar os gargalos que impactam os resultados da sua operação.'
    },
    {
      step: '02',
      headline: 'Metodologia e Implementação Prática',
      text: 'Adotar processos replicáveis com foco em produtividade, automação e redução de atrito nas tomadas de decisão.'
    },
    {
      step: '03',
      headline: 'Métricas e Alavancas de Crescimento',
      text: 'Acompanhar indicadores-chave com clareza para otimizar conversões e potencializar o retorno sobre o investimento.'
    },
    {
      step: '04',
      headline: 'Próximos Passos & Visão de Futuro',
      text: 'Antecipar tendências e posicionar sua marca como referência no setor com autoridade e consistência.'
    }
  ];

  const slides = cleanedPoints.length >= 2
    ? cleanedPoints.map((pt, idx) => {
        // Tenta dividir em headline e texto se tiver ':' ou '-'
        let headline = pt;
        let text = 'Aplicação prática e direcionamento estratégico para potencializar a presença e o crescimento da sua marca.';
        if (pt.includes(':')) {
          const parts = pt.split(':');
          headline = parts[0].trim();
          text = parts.slice(1).join(':').trim();
        } else if (pt.includes(' - ')) {
          const parts = pt.split(' - ');
          headline = parts[0].trim();
          text = parts.slice(1).join(' - ').trim();
        }
        return {
          step: String(idx + 1).padStart(2, '0'),
          headline: headline.slice(0, 48),
          text: text.slice(0, 160)
        };
      })
    : fallbackPoints;

  return {
    title,
    subtitle: description,
    slides,
    cta: `Gostou da análise? Salve este carrossel e siga ${handle || brand} para mais insights diários!`
  };
}

/**
 * Gera o SVG de um slide específico no padrão 1080x1350 (4:5 Retrato).
 */
function renderSlideSvg({
  type = 'content', // 'cover', 'content', 'cta'
  slideIndex = 1,
  totalSlides = 6,
  title = '',
  subtitle = '',
  headline = '',
  text = '',
  brandName = 'Marca',
  brandHandle = '',
  colors = ['#38bdf8', '#818cf8']
}) {
  const width = 1080;
  const height = 1350;

  const color1 = colors[0] || '#38bdf8';
  const color2 = colors[1] || '#818cf8';

  const cleanBrand = escapeXml(brandName).toUpperCase();
  const cleanHandle = escapeXml(brandHandle);

  if (type === 'cover') {
    const titleLines = wrapLines(title, 24, 4);
    const subLines = wrapLines(subtitle, 34, 3);

    const titleSpans = titleLines.map((line, idx) =>
      `<tspan x="90" dy="${idx === 0 ? 0 : 74}">${escapeXml(line)}</tspan>`
    ).join('\n');

    const subSpans = subLines.map((line, idx) =>
      `<tspan x="90" dy="${idx === 0 ? 0 : 44}">${escapeXml(line)}</tspan>`
    ).join('\n');

    return `
    <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#070c18" />
          <stop offset="60%" stop-color="#0f172a" />
          <stop offset="100%" stop-color="#1e1b4b" />
        </linearGradient>
        <linearGradient id="accentGrad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stop-color="${color1}" />
          <stop offset="100%" stop-color="${color2}" />
        </linearGradient>
      </defs>

      <!-- Background escuro com profundidade -->
      <rect width="100%" height="100%" fill="url(#bgGrad)" />

      <!-- Luzes volumétricas sutis -->
      <circle cx="${width - 150}" cy="220" r="350" fill="${color1}" opacity="0.12" filter="blur(90px)" />
      <circle cx="150" cy="${height - 220}" r="320" fill="${color2}" opacity="0.10" filter="blur(80px)" />

      <!-- Barra superior / Header -->
      <rect x="90" y="80" width="${cleanBrand.length * 15 + 50}" height="42" rx="21" fill="#ffffff" fill-opacity="0.08" stroke="${color1}" stroke-width="1.5" />
      <text x="115" y="107" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="16" font-weight="700" fill="${color1}" letter-spacing="2">
        ${cleanBrand}
      </text>

      <text x="${width - 90}" y="108" text-anchor="end" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="16" font-weight="600" fill="#94a3b8" letter-spacing="1">
        CARROSSEL EXCLUSIVO
      </text>

      <!-- Badge de Categoria / Tag -->
      <rect x="90" y="240" width="180" height="36" rx="8" fill="${color1}" fill-opacity="0.15" />
      <text x="180" y="264" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="15" font-weight="700" fill="${color1}" letter-spacing="1.5">
        GUIA PRÁTICO
      </text>

      <!-- Título Principal -->
      <text x="90" y="380" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="58" font-weight="800" fill="#f8fafc" letter-spacing="-1">
        ${titleSpans}
      </text>

      <!-- Linha divisória de destaque -->
      <line x1="90" y1="780" x2="320" y2="780" stroke="url(#accentGrad)" stroke-width="4" stroke-linecap="round" />

      <!-- Subtítulo / Lead -->
      <text x="90" y="850" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="28" font-weight="400" fill="#cbd5e1" letter-spacing="-0.2">
        ${subSpans}
      </text>

      <!-- Rodapé / Indicador de Swipe -->
      <rect x="90" y="${height - 180}" width="${width - 180}" height="90" rx="18" fill="#ffffff" fill-opacity="0.05" stroke="#334155" stroke-width="1" />
      <text x="140" y="${height - 128}" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="20" font-weight="600" fill="#f8fafc">
        Deslize para ver os insights
      </text>
      <text x="${width - 140}" y="${height - 126}" text-anchor="end" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="28" font-weight="800" fill="${color1}">
        ➔
      </text>
    </svg>
    `;
  }

  if (type === 'cta') {
    const ctaLines = wrapLines(headline || 'Gostou deste conteúdo?', 22, 3);
    const subLines = wrapLines(text || `Siga ${cleanHandle || cleanBrand} para receber novas análises e estratégias práticas.`, 30, 4);

    const ctaSpans = ctaLines.map((line, idx) =>
      `<tspan x="${width / 2}" dy="${idx === 0 ? 0 : 66}">${escapeXml(line)}</tspan>`
    ).join('\n');

    const subSpans = subLines.map((line, idx) =>
      `<tspan x="${width / 2}" dy="${idx === 0 ? 0 : 44}">${escapeXml(line)}</tspan>`
    ).join('\n');

    return `
    <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#070c18" />
          <stop offset="50%" stop-color="#0f172a" />
          <stop offset="100%" stop-color="#1e1b4b" />
        </linearGradient>
        <linearGradient id="btnGrad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stop-color="${color1}" />
          <stop offset="100%" stop-color="${color2}" />
        </linearGradient>
      </defs>

      <rect width="100%" height="100%" fill="url(#bgGrad)" />

      <!-- Glow central -->
      <circle cx="${width / 2}" cy="${height / 2}" r="380" fill="${color1}" opacity="0.12" filter="blur(100px)" />

      <!-- Top Header -->
      <text x="${width / 2}" y="120" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="20" font-weight="700" fill="${color1}" letter-spacing="3">
        ${cleanBrand}
      </text>

      <!-- Ícone de Salvamento / Destaque -->
      <rect x="${width / 2 - 45}" y="280" width="90" height="90" rx="45" fill="${color1}" fill-opacity="0.15" stroke="${color1}" stroke-width="2" />
      <text x="${width / 2}" y="338" text-anchor="middle" font-size="38">💾</text>

      <!-- Headline de Fechamento -->
      <text x="${width / 2}" y="480" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="52" font-weight="800" fill="#f8fafc" letter-spacing="-0.5">
        ${ctaSpans}
      </text>

      <!-- Subtítulo -->
      <text x="${width / 2}" y="680" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="26" font-weight="400" fill="#94a3b8">
        ${subSpans}
      </text>

      <!-- Cards de Ação Recomendada -->
      <g transform="translate(100, 840)">
        <!-- Ação 1: Salvar -->
        <rect x="0" y="0" width="${width - 200}" height="84" rx="16" fill="#ffffff" fill-opacity="0.04" stroke="#334155" stroke-width="1" />
        <text x="35" y="52" font-size="28">📌</text>
        <text x="85" y="52" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="22" font-weight="600" fill="#f8fafc">
          Salve este post para consultar quando precisar
        </text>

        <!-- Ação 2: Compartilhar -->
        <rect x="0" y="105" width="${width - 200}" height="84" rx="16" fill="#ffffff" fill-opacity="0.04" stroke="#334155" stroke-width="1" />
        <text x="35" y="157" font-size="28">💬</text>
        <text x="85" y="157" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="22" font-weight="600" fill="#f8fafc">
          Deixe sua visão nos comentários
        </text>

        <!-- Ação 3: Seguir -->
        <rect x="0" y="210" width="${width - 200}" height="84" rx="16" fill="#ffffff" fill-opacity="0.04" stroke="#334155" stroke-width="1" />
        <text x="35" y="262" font-size="28">🚀</text>
        <text x="85" y="262" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="22" font-weight="600" fill="#f8fafc">
          Siga ${cleanHandle || cleanBrand} para mais estratégias
        </text>
      </g>

      <!-- Rodapé -->
      <text x="${width / 2}" y="${height - 70}" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="18" font-weight="600" fill="#64748b">
        pub_rs · Automação Omnichannel de Distribuição
      </text>
    </svg>
    `;
  }

  // Slide de Conteúdo Normal (Passo a Passo / Insights)
  const headLines = wrapLines(headline, 24, 3);
  const textLines = wrapLines(text, 34, 5);

  const headSpans = headLines.map((line, idx) =>
    `<tspan x="90" dy="${idx === 0 ? 0 : 54}">${escapeXml(line)}</tspan>`
  ).join('\n');

  const textSpans = textLines.map((line, idx) =>
    `<tspan x="90" dy="${idx === 0 ? 0 : 44}">${escapeXml(line)}</tspan>`
  ).join('\n');

  const stepNumber = String(slideIndex).padStart(2, '0');
  const totalNumber = String(totalSlides).padStart(2, '0');

  return `
  <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#070c18" />
        <stop offset="50%" stop-color="#0f172a" />
        <stop offset="100%" stop-color="#141d33" />
      </linearGradient>
      <linearGradient id="accentGrad" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="${color1}" />
        <stop offset="100%" stop-color="${color2}" />
      </linearGradient>
    </defs>

    <rect width="100%" height="100%" fill="url(#bgGrad)" />

    <!-- Iluminação de fundo -->
    <circle cx="${width - 100}" cy="180" r="300" fill="${color1}" opacity="0.08" filter="blur(80px)" />

    <!-- Barra Superior: Nome da Marca & Contador de Slides -->
    <text x="90" y="105" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="18" font-weight="700" fill="${color1}" letter-spacing="2">
      ${cleanBrand}
    </text>

    <!-- Indicador de Página (ex: 02 / 06) -->
    <rect x="${width - 210}" y="74" width="120" height="40" rx="20" fill="#ffffff" fill-opacity="0.08" stroke="#334155" stroke-width="1" />
    <text x="${width - 150}" y="100" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="16" font-weight="700" fill="#f8fafc">
      ${stepNumber} / ${totalNumber}
    </text>

    <!-- Linha de Progresso Visual -->
    <rect x="90" y="140" width="${width - 180}" height="4" rx="2" fill="#1e293b" />
    <rect x="90" y="140" width="${((width - 180) / totalSlides) * slideIndex}" height="4" rx="2" fill="url(#accentGrad)" />

    <!-- Badge do Número do Passo / Insight -->
    <g transform="translate(90, 240)">
      <rect x="0" y="0" width="140" height="64" rx="14" fill="${color1}" fill-opacity="0.15" stroke="${color1}" stroke-width="1.5" />
      <text x="70" y="42" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="28" font-weight="800" fill="${color1}" letter-spacing="2">
        #${stepNumber}
      </text>
    </g>

    <!-- Headline do Ponto Chave -->
    <text x="90" y="420" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="44" font-weight="800" fill="#f8fafc" letter-spacing="-0.5">
      ${headSpans}
    </text>

    <!-- Box de Conteúdo Explicativo com Card Escuro -->
    <rect x="90" y="660" width="${width - 180}" height="420" rx="24" fill="#ffffff" fill-opacity="0.03" stroke="#334155" stroke-width="1.2" />
    <line x1="90" y1="660" x2="90" y2="1080" stroke="${color1}" stroke-width="6" />

    <text x="135" y="740" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="28" font-weight="400" fill="#cbd5e1" letter-spacing="-0.1">
      ${textSpans}
    </text>

    <!-- Rodapé -->
    <text x="90" y="${height - 90}" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="18" font-weight="600" fill="#64748b">
      ${cleanHandle || cleanBrand}
    </text>
    <text x="${width - 90}" y="${height - 90}" text-anchor="end" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="18" font-weight="700" fill="${color1}">
      Deslize ➔
    </text>
  </svg>
  `;
}

/**
 * Motor Principal: Gera todos os slides do carrossel e compila o PDF.
 */
async function generateCarousel({ article, client, copies = {}, outputDir }) {
  const brandName = client.brandName || client.name || 'Marca';
  const brandHandle = client.brandHandle || '';
  const colors = client.visualIdentity?.preferredColors || ['#38bdf8', '#818cf8'];

  // Diretório do carrossel
  const carouselDir = path.join(outputDir, 'images', 'carousel');
  if (!fs.existsSync(carouselDir)) {
    fs.mkdirSync(carouselDir, { recursive: true });
  }

  // 1. Extrai conteúdo estruturado dos slides
  const data = extractCarouselSlidesData(article, client, copies);
  const slidesData = data.slides || [];
  const totalSlides = slidesData.length + 2; // Capa + Conteúdo + CTA

  console.log(`   📑 [CARROSSEL] Gerando ${totalSlides} slides no formato 4:5 (1080x1350)...`);

  const slideImages = [];
  const generatedSlidesInfo = [];

  // Slide 1: Capa
  const coverSvg = renderSlideSvg({
    type: 'cover',
    slideIndex: 1,
    totalSlides,
    title: data.title,
    subtitle: data.subtitle,
    brandName,
    brandHandle,
    colors
  });
  const coverJpg = await sharp(Buffer.from(coverSvg)).jpeg({ quality: 92 }).toBuffer();
  const coverWebp = await sharp(Buffer.from(coverSvg)).webp({ quality: 92 }).toBuffer();
  fs.writeFileSync(path.join(carouselDir, 'slide_01.jpg'), coverJpg);
  fs.writeFileSync(path.join(carouselDir, 'slide_01.webp'), coverWebp);
  slideImages.push({ buffer: coverJpg, width: 1080, height: 1350 });
  generatedSlidesInfo.push({
    index: 1,
    type: 'cover',
    name: 'Capa / Gancho',
    jpg: 'slide_01.jpg',
    webp: 'slide_01.webp'
  });

  // Slides 2 a N-1: Conteúdo dos Insights
  for (let i = 0; i < slidesData.length; i++) {
    const s = slidesData[i];
    const currentIndex = i + 2;
    const slideNumberStr = String(currentIndex).padStart(2, '0');

    const contentSvg = renderSlideSvg({
      type: 'content',
      slideIndex: currentIndex,
      totalSlides,
      headline: s.headline,
      text: s.text,
      brandName,
      brandHandle,
      colors
    });

    const contentJpg = await sharp(Buffer.from(contentSvg)).jpeg({ quality: 92 }).toBuffer();
    const contentWebp = await sharp(Buffer.from(contentSvg)).webp({ quality: 92 }).toBuffer();
    const jpgName = `slide_${slideNumberStr}.jpg`;
    const webpName = `slide_${slideNumberStr}.webp`;

    fs.writeFileSync(path.join(carouselDir, jpgName), contentJpg);
    fs.writeFileSync(path.join(carouselDir, webpName), contentWebp);
    slideImages.push({ buffer: contentJpg, width: 1080, height: 1350 });
    generatedSlidesInfo.push({
      index: currentIndex,
      type: 'content',
      name: s.headline,
      jpg: jpgName,
      webp: webpName
    });
  }

  // Slide N: CTA / Fechamento
  const ctaSvg = renderSlideSvg({
    type: 'cta',
    slideIndex: totalSlides,
    totalSlides,
    headline: 'Gostou desta análise estratégica?',
    text: data.cta,
    brandName,
    brandHandle,
    colors
  });
  const ctaJpg = await sharp(Buffer.from(ctaSvg)).jpeg({ quality: 92 }).toBuffer();
  const ctaWebp = await sharp(Buffer.from(ctaSvg)).webp({ quality: 92 }).toBuffer();
  const lastIndexStr = String(totalSlides).padStart(2, '0');
  fs.writeFileSync(path.join(carouselDir, `slide_${lastIndexStr}.jpg`), ctaJpg);
  fs.writeFileSync(path.join(carouselDir, `slide_${lastIndexStr}.webp`), ctaWebp);
  slideImages.push({ buffer: ctaJpg, width: 1080, height: 1350 });
  generatedSlidesInfo.push({
    index: totalSlides,
    type: 'cta',
    name: 'Fechamento & CTA',
    jpg: `slide_${lastIndexStr}.jpg`,
    webp: `slide_${lastIndexStr}.webp`
  });

  // 2. Compilar PDF oficial multipáginas
  console.log(`   📄 [CARROSSEL PDF] Compilando ${slideImages.length} páginas em carousel_linkedin.pdf...`);
  const pdfBuffer = compileJpegsToPdf(slideImages);

  const pdfPathInside = path.join(carouselDir, 'carousel_linkedin.pdf');
  const pdfPathRoot = path.join(outputDir, 'images', 'carousel_linkedin.pdf');

  fs.writeFileSync(pdfPathInside, pdfBuffer);
  fs.writeFileSync(pdfPathRoot, pdfBuffer); // Copia também na raiz de images para acesso rápido via /api/media/:packageId/carousel_linkedin.pdf

  console.log(`   ✓ Carrossel PDF gerado com sucesso! (${(pdfBuffer.length / 1024).toFixed(1)} KB)`);

  return {
    pdfFileName: 'carousel_linkedin.pdf',
    pdfPath: pdfPathRoot,
    pdfSizeKb: Math.round(pdfBuffer.length / 1024),
    slidesCount: totalSlides,
    slides: generatedSlidesInfo,
    title: data.title
  };
}

module.exports = {
  generateCarousel,
  compileJpegsToPdf,
  renderSlideSvg
};
