const fs = require('fs');
const path = require('path');
const { scrapeArticle } = require('./scraper');
const { processSocialImages } = require('./imageProcessor');
const { generateSocialCopies } = require('./copywriter');
const { exportAndDispatch } = require('./dispatcher');
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
 */
async function runPipeline({
  url,
  clientId = 'anaue-design',
  provider,
  model,
  aiImage = false,
  onProgress = () => {}
}) {
  // 0. Validação de Segurança
  const safeUrl = validatePublicUrl(url);
  const clientConfig = loadClientConfig(clientId);

  onProgress({
    step: 0,
    status: 'starting',
    message: `Iniciando automação omnichannel para o cliente "${clientConfig.name || clientConfig.brandName}"...`
  });

  // 1. Scraping
  onProgress({
    step: 1,
    status: 'scraping',
    message: 'Extraindo dados semânticos, JSON-LD e conteúdo da URL...'
  });

  const article = await scrapeArticle(safeUrl);

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

  const images = await processSocialImages(article.imageUrl, outputDir, {
    client: clientConfig,
    title: article.title,
    article,
    aiImage,
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

  // 4. Exportação e Despacho
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
    dispatchResult
  };
}

module.exports = {
  runPipeline,
  loadClientConfig
};
