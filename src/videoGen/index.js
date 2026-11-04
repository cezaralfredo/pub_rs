const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const sharp = require('sharp');

/**
 * Escapa caracteres especiais para SVG seguro.
 */
function escapeXml(unsafe) {
  if (!unsafe) return '';
  return String(unsafe)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Quebra texto em linhas para renderização com <tspan> em SVG.
 */
function wrapText(text, maxCharsPerLine = 24, maxLines = 4) {
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
 * Sintetiza voz (TTS) para um texto em português brasileiro (pt-BR).
 * Utiliza o motor neural primário ou OpenAI TTS caso apiKey esteja configurada.
 */
async function synthesizeSpeech(text, voice = 'pt-BR', options = {}) {
  const cleanText = text.replace(/[*#_~`]/g, '').trim();

  // Opção 1: Se o usuário tiver chave OpenAI configurada e solicitar voz OpenAI
  if (options.apiKey && options.provider === 'openai') {
    try {
      const openAiVoice = options.voice || 'onyx';
      const res = await fetch('https://api.openai.com/v1/audio/speech', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${options.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'tts-1',
          input: cleanText,
          voice: openAiVoice,
          response_format: 'mp3'
        })
      });
      if (res.ok) {
        return Buffer.from(await res.arrayBuffer());
      }
    } catch (err) {
      console.warn(`[VideoGen TTS] Falha ao usar OpenAI TTS (${err.message}). Alternando para motor nativo.`);
    }
  }

  // Opção 2: Motor Neural Gratuito sem chaves (Google Speech pt-BR)
  const sentences = cleanText.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [cleanText];
  const chunks = [];

  for (let s of sentences) {
    s = s.trim();
    if (!s) continue;
    if (s.length > 180) {
      const words = s.split(/\s+/);
      let cur = '';
      for (const w of words) {
        if ((cur + ' ' + w).length <= 180) {
          cur = (cur + ' ' + w).trim();
        } else {
          if (cur) chunks.push(cur);
          cur = w;
        }
      }
      if (cur) chunks.push(cur);
    } else {
      chunks.push(s);
    }
  }

  const buffers = [];
  for (const chunk of chunks) {
    const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(chunk)}&tl=pt-BR&client=tw-ob`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36'
      }
    });
    if (!res.ok) {
      throw new Error(`TTS HTTP ${res.status}`);
    }
    const buf = Buffer.from(await res.arrayBuffer());
    buffers.push(buf);
  }

  return Buffer.concat(buffers);
}

/**
 * Cria o roteiro estruturado em cenas com locução e legendas de alto impacto.
 */
function buildVideoScript(article, client, copies = {}) {
  const brand = client.brandName || client.name || 'Marca';
  const handle = client.brandHandle || '';
  const title = (article.title || 'Artigo Estratégico').trim();

  // Extrai pontos centrais do artigo
  const points = (article.keyPoints && article.keyPoints.length > 0)
    ? article.keyPoints
    : (article.paragraphs && article.paragraphs.length > 1 ? article.paragraphs.slice(1, 4) : [
        'Estratégias práticas para acelerar resultados de forma escalável.',
        'Métricas reais e alavancas de crescimento para o seu negócio.',
        'Implementação direta e otimização contínua de performance.'
      ]);

  const cleanPoint = (p) => p.replace(/^[-•*]\s*/, '').replace(/[*_#]/g, '').trim();

  const p1 = cleanPoint(points[0] || 'Otimização com foco em resultados mensuráveis.');
  const p2 = cleanPoint(points[1] || 'Decisões guiadas por dados reais de mercado.');
  const p3 = cleanPoint(points[2] || points[0] || 'Vantagem competitiva e diferenciação.');

  return [
    {
      sceneNumber: 1,
      badge: '🔥 ALERTA DE MERCADO',
      caption: title,
      speech: `Atenção: ${title}. Veja os três pontos mais importantes que você precisa dominar agora:`
    },
    {
      sceneNumber: 2,
      badge: '01. PONTO CHAVE',
      caption: p1.slice(0, 110),
      speech: `Primeiro ponto: ${p1}.`
    },
    {
      sceneNumber: 3,
      badge: '02. ESTRATÉGIA',
      caption: p2.slice(0, 110),
      speech: `Segundo: ${p2}.`
    },
    {
      sceneNumber: 4,
      badge: '03. IMPACTO REAL',
      caption: p3.slice(0, 110),
      speech: `E terceiro: ${p3}.`
    },
    {
      sceneNumber: 5,
      badge: '🚀 LEITURA COMPLETA',
      caption: `Artigo Completo no Blog\n${handle || brand}`,
      speech: `Quer aplicar isso na prática? Acesse a análise completa agora no link da bio da ${brand}.`
    }
  ];
}

/**
 * Renderiza o frame visual SVG para cada cena do vídeo vertical 9:16 (1080x1920).
 */
function renderSceneSvg({ scene, totalScenes, brandName, brandHandle, colors, width = 1080, height = 1920 }) {
  const cleanBrand = escapeXml(brandName || 'Onda Conecta').toUpperCase();
  const cleanHandle = escapeXml(brandHandle || '');
  const cleanBadge = escapeXml(scene.badge || 'DESTAQUE').toUpperCase();
  const color1 = colors[0] || '#0052FF';
  const colorAccent = colors[2] || colors[0] || '#00D2FF';

  const lines = wrapText(scene.caption, 22, 4);
  const lineHeight = 66;
  const cardHeight = Math.max(380, lines.length * lineHeight + 180);
  const cardY = Math.round((height - cardHeight) / 2);

  const tspans = lines.map((l, i) =>
    `<tspan x="${width / 2}" dy="${i === 0 ? 0 : lineHeight}">${escapeXml(l)}</tspan>`
  ).join('\n');

  // Barra de progresso visual no rodapé
  const progressPct = Math.round((scene.sceneNumber / totalScenes) * 100);
  const progressWidth = Math.round(((width - 160) * progressPct) / 100);

  return Buffer.from(`
  <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="cardBg" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#070b16" stop-opacity="0.94" />
        <stop offset="100%" stop-color="#0f172a" stop-opacity="0.98" />
      </linearGradient>
      <linearGradient id="progGrad" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="${color1}" />
        <stop offset="100%" stop-color="${colorAccent}" />
      </linearGradient>
    </defs>

    <!-- Barra Superior da Marca -->
    <rect x="0" y="0" width="${width}" height="180" fill="#000000" fill-opacity="0.65" />
    <g transform="translate(60, 75)">
      <rect x="0" y="0" width="${cleanBrand.length * 12 + 40}" height="40" rx="20" fill="#000000" fill-opacity="0.8" stroke="${colorAccent}" stroke-width="2" />
      <text x="20" y="26" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="16" font-weight="800" fill="${colorAccent}" letter-spacing="2">
        ${cleanBrand}
      </text>
    </g>

    <text x="${width - 70}" y="102" text-anchor="end" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="18" font-weight="700" fill="#94a3b8" letter-spacing="1">
      CENA ${scene.sceneNumber} / ${totalScenes}
    </text>

    <!-- Card de Legenda Centralizada Dinâmica (Estilo Reels / TikTok) -->
    <rect x="60" y="${cardY}" width="${width - 120}" height="${cardHeight}" rx="28" fill="url(#cardBg)" stroke="${colorAccent}" stroke-width="2" stroke-opacity="0.8" />
    
    <!-- Badge da Cena -->
    <rect x="${width / 2 - 130}" y="${cardY + 35}" width="260" height="38" rx="19" fill="${colorAccent}" fill-opacity="0.15" stroke="${colorAccent}" stroke-width="1.5" />
    <text x="${width / 2}" y="${cardY + 60}" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="14" font-weight="800" fill="${colorAccent}" letter-spacing="2">
      ${cleanBadge}
    </text>

    <!-- Texto / Legenda em Letras Grandes com Sombra -->
    <g filter="drop-shadow(0px 4px 8px rgba(0,0,0,0.9))">
      <text x="${width / 2}" y="${cardY + 155}" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="48" font-weight="800" fill="#ffffff" letter-spacing="-0.5">
        ${tspans}
      </text>
    </g>

    <!-- Barra de Progresso do Vídeo -->
    <rect x="80" y="${height - 180}" width="${width - 160}" height="8" rx="4" fill="#334155" fill-opacity="0.6" />
    <rect x="80" y="${height - 180}" width="${progressWidth}" height="8" rx="4" fill="url(#progGrad)" />

    <!-- Barra Inferior de Rodapé -->
    <rect x="0" y="${height - 150}" width="${width}" height="150" fill="#000000" fill-opacity="0.75" />
    <text x="${width / 2}" y="${height - 75}" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="24" font-weight="700" fill="${colorAccent}">
      ${cleanHandle ? `${cleanHandle} · Toque para ler o artigo completo` : '👉 Toque para ler o artigo completo'}
    </text>
  </svg>
  `);
}

/**
 * Orquestrador principal de geração de vídeo automático com Locução IA e Legendas.
 */
async function generateAiVideoForPackage(packageDir, packageId, options = {}) {
  const payloadPath = path.join(packageDir, 'payload.json');
  if (!fs.existsSync(payloadPath)) {
    throw new Error('Arquivo payload.json do pacote não encontrado.');
  }

  const payload = JSON.parse(fs.readFileSync(payloadPath, 'utf8'));
  const article = payload.article || { title: packageId };
  const client = payload.clientConfig || options.client || {};
  const brandName = client.brandName || client.name || 'Marca';
  const brandHandle = client.brandHandle || '';
  const colors = client.visualIdentity?.preferredColors || ['#0052FF', '#0A0E17', '#00D2FF'];

  const imagesDir = path.join(packageDir, 'images');
  if (!fs.existsSync(imagesDir)) {
    fs.mkdirSync(imagesDir, { recursive: true });
  }

  const tempDir = path.join(packageDir, '.video_temp');
  if (fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
  fs.mkdirSync(tempDir, { recursive: true });

  console.log(`🎬 [VideoGen IA] Iniciando geração de vídeo vertical para o pacote ${packageId}...`);

  try {
    // 1. Roteirização inteligente
    const script = buildVideoScript(article, client, payload.copies || {});
    console.log(`   📝 Roteiro estruturado em ${script.length} cenas.`);

    // 2. Busca imagem de base para os fundos
    let baseImageBuffer = null;
    const possibleBases = [
      path.join(imagesDir, 'instagram_stories_reels_9x16.jpg'),
      path.join(imagesDir, 'instagram_feed_portrait_4x5.jpg'),
      path.join(imagesDir, 'linkedin_twitter_facebook_16x9.jpg')
    ];
    for (const pb of possibleBases) {
      if (fs.existsSync(pb)) {
        baseImageBuffer = fs.readFileSync(pb);
        break;
      }
    }

    // Se não houver imagem prévia, cria um fundo escuro elegante
    if (!baseImageBuffer) {
      const darkSvg = `<svg width="1080" height="1920"><rect width="100%" height="100%" fill="#0a0f1d"/></svg>`;
      baseImageBuffer = await sharp(Buffer.from(darkSvg)).jpeg().toBuffer();
    }

    // Fundo desfocado cinematográfico comum para as cenas
    const cinematicBg = await sharp(baseImageBuffer)
      .resize(1080, 1920, { fit: 'cover' })
      .blur(30)
      .modulate({ brightness: 0.50 })
      .toBuffer();

    const sceneVideoFiles = [];

    // 3. Renderiza áudio, legenda e clipe MP4 de cada cena
    for (let i = 0; i < script.length; i++) {
      const scene = script[i];
      const idxStr = String(i + 1).padStart(2, '0');
      console.log(`   🎙️ Sintetizando áudio da cena ${scene.sceneNumber}/${script.length}: "${scene.badge}"...`);

      // 3.1 Síntese de áudio
      const audioBuffer = await synthesizeSpeech(scene.speech, 'pt-BR', {
        provider: client.llm?.provider,
        apiKey: client.llm?.apiKey,
        voice: options.voice
      });

      const sceneAudioPath = path.join(tempDir, `scene_${idxStr}.mp3`);
      fs.writeFileSync(sceneAudioPath, audioBuffer);

      // 3.2 Renderização da imagem da cena com legendas
      const sceneSvg = renderSceneSvg({
        scene,
        totalScenes: script.length,
        brandName,
        brandHandle,
        colors
      });

      const sceneJpgPath = path.join(tempDir, `scene_${idxStr}.jpg`);
      await sharp(cinematicBg)
        .composite([{ input: sceneSvg, top: 0, left: 0 }])
        .jpeg({ quality: 92 })
        .toFile(sceneJpgPath);

      // 3.3 Renderização do clipe da cena com ffmpeg
      const sceneMp4Path = path.join(tempDir, `scene_${idxStr}.mp4`);
      execSync(`ffmpeg -y -loop 1 -i "${sceneJpgPath}" -i "${sceneAudioPath}" -c:v libx264 -tune stillimage -c:a aac -b:a 192k -pix_fmt yuv420p -shortest -movflags +faststart "${sceneMp4Path}"`, {
        stdio: 'ignore'
      });

      sceneVideoFiles.push(sceneMp4Path);
    }

    // 4. Concatena todos os clipes no vídeo final
    const concatListPath = path.join(tempDir, 'concat_list.txt');
    const concatContent = sceneVideoFiles.map(f => `file '${f.replace(/\\/g, '/')}'`).join('\n');
    fs.writeFileSync(concatListPath, concatContent, 'utf8');

    const outputMp4Path = path.join(imagesDir, 'video_post.mp4');
    console.log(`   🎞️ Concatenando ${sceneVideoFiles.length} cenas no arquivo final MP4...`);

    execSync(`ffmpeg -y -f concat -safe 0 -i "${concatListPath}" -c copy -movflags +faststart "${outputMp4Path}"`, {
      stdio: 'ignore'
    });

    const finalSize = fs.statSync(outputMp4Path).size;
    console.log(`   ✓ Vídeo final gerado com sucesso! Tamanho: ${(finalSize / (1024 * 1024)).toFixed(2)} MB`);

    // 5. Atualiza o payload.json do pacote
    const videoData = {
      filename: 'video_post.mp4',
      type: 'ai_generated',
      format: '9:16 Vertical (Reels / Shorts / TikTok)',
      scenesCount: script.length,
      size: finalSize,
      generatedAt: new Date().toISOString(),
      url: `/api/media/${packageId}/video_post.mp4`
    };

    payload.video = videoData;
    fs.writeFileSync(payloadPath, JSON.stringify(payload, null, 2), 'utf8');

    // Limpa a pasta temporária
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}

    const baseUrl = process.env.BASE_URL || 'https://social360.anauedesign.com.br';
    return {
      success: true,
      message: 'Vídeo com locução IA e legendas dinâmicas gerado com sucesso!',
      video: {
        ...videoData,
        publicUrl: `${baseUrl}${videoData.url}`
      }
    };

  } catch (error) {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
    throw new Error(`Erro na geração de vídeo IA: ${error.message}`);
  }
}

module.exports = {
  generateAiVideoForPackage,
  buildVideoScript,
  synthesizeSpeech
};
