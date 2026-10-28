const fs = require('fs');
const path = require('path');
const { scrapeArticle } = require('./scraper');
const { processSocialImages } = require('./imageProcessor');
const { generateSocialCopies } = require('./copywriter');
const { generateCarousel } = require('./carouselGenerator');
const { exportAndDispatch } = require('./dispatcher');
const { synthesizeTopicContent } = require('./topicSynthesizer');
const { validatePublicUrl, sanitizeIdentifier } = require('./security/validator');

/**
 * Carrega a configuração do cliente a partir do disco.
 */
function loadClientConfig(clientId) {
  const safeId = sanitizeIdentifier(clientId);
  const clientsDir = path.join(__dirname, '..', 'config', 'clients');
  const configPath = path.join(clientsDir, `${safeId}.json`);

  if (fs.existsSync(configPath)) {
    try {
      return JSON.parse(fs.readFileSync(configPath, 'utf8'));
    } catch {
      // JSON corrompido, tenta default
    }
  }

  const defaultPath = path.join(clientsDir, 'default.json');
  if (fs.existsSync(defaultPath)) {
    return JSON.parse(fs.readFileSync(defaultPath, 'utf8'));
  }

  return { id: 'default', brandName: 'Marca', defaultHashtags: [] };
}

/**
 * Executa o pipeline completo de forma unificada para CLI e API Web.
 * Suporta dois modos de operação:
 * 1. Modo 'url': Extrai conteúdo de um artigo web existente via scraping.
 * 2. Modo 'topic': Cria conteúdo autoral a partir de tópicos/interesses do cliente.
 */
async function runPipeline({
  mode = 'url',
  url,
  topic,
  archetype = 'dica',
  visualStyle,
  clientId = 'anaue-design',
  provider,
  model,
  aiImage = false,
  onProgress = () => {}
}) {
  const clientConfig = loadClientConfig(clientId);
  const isTopicMode = mode === 'topic' || (Boolean(topic) && !url);

  onProgress({
    step: 0,
    status: 'starting',
    message: isTopicMode
      ? `Iniciando criação autoral para o cliente "${clientConfig.name || clientConfig.brandName}"...`
      : `Iniciando automação omnichannel para o cliente "${clientConfig.name || clientConfig.brandName}"...`
  });

  let article = null;
  let effectiveAiImage = aiImage;

  // 1. Obtenção do Conteúdo (Scraping ou Síntese de Tópico)
  if (isTopicMode) {
    if (!topic || !topic.trim()) {
      throw new Error('Informe um tópico ou interesse do cliente para a geração.');
    }

    onProgress({
      step: 1,
      status: 'synthesizing',
      message: `Sintetizando conteúdo estratégico para o tema: "${topic}"...`
    });

    article = await synthesizeTopicContent({
      topic,
      archetype,
      client: clientConfig,
      visualStyle,
      options: { provider, model }
    });

    // No modo tópico, a geração visual de IA é ativada por padrão para criar arte autoral
    effectiveAiImage = true;

    onProgress({
      step: 1,
      status: 'synthesizing_done',
      message: `Conteúdo estruturado com sucesso: "${article.title}"`,
      data: {
        title: article.title,
        description: article.description,
        archetype: article.archetype,
        headingsCount: article.headings.length,
        isTopicMode: true
      }
    });
  } else {
    // Modo clássico por URL
    if (!url) {
      throw new Error('A URL do artigo é obrigatória para o modo de scraping.');
    }

    const safeUrl = validatePublicUrl(url);

    onProgress({
      step: 1,
      status: 'scraping',
      message: 'Extraindo dados semânticos, JSON-LD e conteúdo da URL...'
    });

    article = await scrapeArticle(safeUrl);

    onProgress({
      step: 1,
      status: 'scraping_done',
      message: `Conteúdo extraído com sucesso: "${article.title}"`,
      data: {
        title: article.title,
        description: article.description,
        imageUrl: article.imageUrl,
        headingsCount: article.headings.length
      }
    });
  }

  // Diretório de saída
  const dateStr = new Date().toISOString().slice(0, 10);
  const outputDir = path.join(__dirname, '..', 'output', `${dateStr}_${article.slug}`);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // 2. Processamento Gráfico & Imagens
  onProgress({
    step: 2,
    status: 'imaging',
    message: 'Gerando mídias nos 4 padrões oficiais (16:9, 4:5, 1:1, 9:16) com branding...'
  });

  const images = await processSocialImages(article.imageUrl || null, outputDir, {
    client: clientConfig,
    title: article.title,
    article,
    aiImage: effectiveAiImage,
    visualStyle: visualStyle || article.visualStyle,
    visualPromptHint: article.visualPromptHint,
    provider
  });

  onProgress({
    step: 2,
    status: 'imaging_done',
    message: 'Formatos de mídia renderizados em WebP e JPG.',
    data: { imagesCount: images.length }
  });

  // 3. Copywriting Multicanal com IA
  onProgress({
    step: 3,
    status: 'copywriting',
    message: 'Redigindo copies nativas por rede social com estratégia de primeiro comentário...'
  });

  const copies = await generateSocialCopies(article, clientConfig, { provider, model });

  onProgress({
    step: 3,
    status: 'copywriting_done',
    message: `Copies geradas via ${copies.meta?.generator || 'Motor Dinâmico'}.`,
    data: {
      generator: copies.meta?.generator,
      networks: ['linkedin', 'instagram', 'stories', 'twitter', 'threads', 'facebook']
    }
  });

  // 4. Geração de Carrossel em Slides e Compilação PDF
  let carousel = null;
  try {
    onProgress({
      step: 3,
      status: 'carousel',
      message: 'Gerando carrossel de slides 4:5 e compilando PDF para o LinkedIn...'
    });

    carousel = await generateCarousel({
      article,
      client: clientConfig,
      copies,
      outputDir
    });

    onProgress({
      step: 3,
      status: 'carousel_done',
      message: `Carrossel gerado com ${carousel.slidesCount} slides e PDF pronto.`,
      data: { slidesCount: carousel.slidesCount }
    });
  } catch (carouselErr) {
    console.warn(`   ⚠️ [CARROSSEL AVISO] Falha ao gerar carrossel (${carouselErr.message}). Continuando...`);
  }

  // 5. Exportação e Despacho
  onProgress({
    step: 4,
    status: 'exporting',
    message: 'Consolidando pacote de distribuição e disparando integrações...'
  });

  const dispatchResult = await exportAndDispatch({
    article,
    client: clientConfig,
    copies,
    images,
    carousel,
    outputDir
  });

  onProgress({
    step: 4,
    status: 'completed',
    message: 'Pacote concluído com sucesso e pronto para publicação!',
    data: {
      outputDir,
      packageId: `${dateStr}_${article.slug}`
    }
  });

  return {
    packageId: `${dateStr}_${article.slug}`,
    outputDir,
    article,
    client: clientConfig,
    copies,
    images,
    carousel,
    dispatchResult
  };
}

module.exports = {
  runPipeline,
  loadClientConfig
};
