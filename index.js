require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { scrapeArticle } = require('./src/scraper');
const { processSocialImages } = require('./src/imageProcessor');
const { generateSocialCopies } = require('./src/copywriter');
const { exportAndDispatch } = require('./src/dispatcher');
const { detectAvailableProviders } = require('./src/llm');

// CLI Arguments parser
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    url: '',
    client: 'anaue-design',
    provider: '',
    model: '',
    help: false
  };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--help' || args[i] === '-h') {
      options.help = true;
    } else if (args[i] === '--url' && args[i + 1]) {
      options.url = args[i + 1];
      i++;
    } else if (args[i] === '--client' && args[i + 1]) {
      options.client = args[i + 1];
      i++;
    } else if ((args[i] === '--provider' || args[i] === '-p') && args[i + 1]) {
      options.provider = args[i + 1];
      i++;
    } else if ((args[i] === '--model' || args[i] === '-m') && args[i + 1]) {
      options.model = args[i + 1];
      i++;
    } else if (args[i].startsWith('http')) {
      options.url = args[i];
    }
  }

  return options;
}

// Carregar perfil do cliente
function loadClientConfig(clientId) {
  const configPath = path.join(__dirname, 'config', 'clients', `${clientId}.json`);
  if (fs.existsSync(configPath)) {
    return JSON.parse(fs.readFileSync(configPath, 'utf8'));
  }
  const defaultPath = path.join(__dirname, 'config', 'clients', 'default.json');
  if (fs.existsSync(defaultPath)) {
    console.log(`[INFO] Config para "${clientId}" não encontrada. Usando perfil default.`);
    return JSON.parse(fs.readFileSync(defaultPath, 'utf8'));
  }
  return { id: 'default', brandName: 'Marca', defaultHashtags: [] };
}

async function main() {
  const { url, client: clientId, provider, model, help } = parseArgs();

  const clientsDir = path.join(__dirname, 'config', 'clients');
  const availableClients = fs.existsSync(clientsDir)
    ? fs.readdirSync(clientsDir).filter(f => f.endsWith('.json')).map(f => `  - ${f.replace('.json', '')}`).join('\n')
    : '  - default';

  const detectedProviders = detectAvailableProviders();
  const detectedStr = detectedProviders.length > 0 
    ? detectedProviders.map(p => `"${p}"`).join(', ') 
    : 'Nenhum detectado no .env (usando motor algorítmico nativo)';

  if (!url || help) {
    console.log(`
======================================================
  🤖 pub_rs — Automação Omnichannel de Redes Sociais
======================================================
Uso:
  node index.js --url <URL_DO_ARTIGO> [opções]

Opções:
  --client <ID>       ID do cliente (padrão: anaue-design)
  --provider, -p      Provedor de LLM (gemini, openai, anthropic, groq, deepseek, openrouter, ollama)
  --model, -m         Modelo específico (ex: gpt-4o-mini, gemini-2.5-flash, claude-3-5-sonnet-20241022)
  --help, -h          Exibe esta mensagem de ajuda

Provedores de IA ativos no ambiente:
  ${detectedStr}

Exemplos:
  node index.js --url https://site.com/artigo --client anaue-design
  node index.js --url https://site.com/artigo --provider groq --model llama-3.3-70b-versatile
  node index.js --url https://site.com/artigo --provider anthropic

Clientes disponíveis em config/clients/:
${availableClients}
======================================================
`);
    process.exit(help ? 0 : 1);
  }

  console.log(`\n🚀 [pub_rs] Iniciando pipeline para: ${url}`);
  const clientConfig = loadClientConfig(clientId);
  console.log(`👤 [Cliente]: ${clientConfig.name || clientConfig.brandName} (${clientConfig.id})`);

  // 1. Scraping
  console.log(`\n⏳ [1/4] Extraindo metadados e conteúdo da URL...`);
  const article = await scrapeArticle(url);
  console.log(`   ✓ Título identificado: "${article.title}"`);
  console.log(`   ✓ Imagem de capa: ${article.imageUrl || '(gerando card dinâmico com branding)'}`);
  console.log(`   ✓ Tópicos extraídos: ${article.headings.length} seções`);

  // Diretório de saída do artigo
  const dateStr = new Date().toISOString().slice(0, 10);
  const outputDir = path.join(__dirname, 'output', `${dateStr}_${article.slug}`);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // 2. Processamento Gráfico
  console.log(`\n🎨 [2/4] Gerando cortes inteligentes e formatos de mídia oficiais...`);
  const images = await processSocialImages(article.imageUrl, outputDir, {
    client: clientConfig,
    title: article.title,
    article
  });
  console.log(`   ✓ Formatos gerados em 16:9, 4:5, 1:1 e 9:16 (WebP e JPG).`);

  // 3. Geração de Copywriting Multicanal
  console.log(`\n✍️  [3/4] Redigindo copies nativas por rede social e 1º comentário...`);
  const copies = await generateSocialCopies(article, clientConfig, { provider, model });
  console.log(`   ✓ Motor utilizado: ${copies.meta?.generator || 'Algorítmico Dinâmico'}`);
  console.log(`   ✓ LinkedIn: copy executiva + 1º comentário com link.`);
  console.log(`   ✓ Instagram: feed portrait (4:5) + stories teaser (9:16) + 1º comentário.`);
  console.log(`   ✓ X (Twitter): thread em 3 partes.`);
  console.log(`   ✓ Threads & Facebook: posts adaptados.`);

  // 4. Exportação e Despacho
  console.log(`\n📦 [4/4] Salvando pacote e disparando integração...`);
  const dispatchResult = await exportAndDispatch({
    article,
    client: clientConfig,
    copies,
    images,
    outputDir
  });

  console.log(`\n======================================================`);
  console.log(`✨ [CONCLUÍDO COM SUCESSO!]`);
  console.log(`📁 Pacote gerado em: ${outputDir}`);
  console.log(`📄 Relatório completo: ${path.join(outputDir, 'PACOTE_REDES_SOCIAIS.md')}`);
  console.log(`🖼️  Imagens salvas em: ${path.join(outputDir, 'images')}`);
  console.log(`📝 Textos prontos em: ${dispatchResult.copysDir}`);
  if (dispatchResult.webhookResult) {
    console.log(`🌐 Webhook status:`, dispatchResult.webhookResult);
  }
  console.log(`======================================================\n`);
}

main().catch(err => {
  console.error(`\n❌ [ERRO NO PIPELINE]:`, err.message);
  process.exit(1);
});
