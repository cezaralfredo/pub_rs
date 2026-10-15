require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { runPipeline } = require('./src/pipeline');
const { detectAvailableProviders } = require('./src/llm');

// CLI Arguments parser
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    url: '',
    client: 'anaue-design',
    provider: '',
    model: '',
    aiImage: false,
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
    } else if (args[i] === '--ai-image' || args[i] === '--generate-image') {
      options.aiImage = true;
    } else if (args[i].startsWith('http')) {
      options.url = args[i];
    }
  }

  return options;
}

async function main() {
  const { url, client: clientId, provider, model, aiImage, help } = parseArgs();

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
  --ai-image          Gera arte via IA (DALL-E 3 / Imagen 3) caso o artigo não tenha imagem original
  --help, -h          Exibe esta mensagem de ajuda

Provedores de IA ativos no ambiente:
  ${detectedStr}

Exemplos:
  node index.js --url https://site.com/artigo --client anaue-design
  node index.js --url https://site.com/artigo --ai-image
  node index.js --url https://site.com/artigo --provider groq --model llama-3.3-70b-versatile
  node index.js --url https://site.com/artigo --provider anthropic

Clientes disponíveis em config/clients/:
${availableClients}
======================================================
`);
    process.exit(help ? 0 : 1);
  }

  console.log(`\n🚀 [pub_rs] Iniciando automação para: ${url}`);

  const result = await runPipeline({
    url,
    clientId,
    provider,
    model,
    aiImage,
    onProgress: (p) => {
      if (p.step === 1 && p.status === 'scraping') console.log(`\n⏳ [1/4] ${p.message}`);
      if (p.step === 1 && p.status === 'scraping_done') console.log(`   ✓ Título: "${p.data.title}"`);
      if (p.step === 2 && p.status === 'imaging') console.log(`\n🎨 [2/4] ${p.message}`);
      if (p.step === 2 && p.status === 'imaging_done') console.log(`   ✓ Formatos oficiais gerados (16:9, 4:5, 1:1, 9:16).`);
      if (p.step === 3 && p.status === 'copywriting') console.log(`\n✍️  [3/4] ${p.message}`);
      if (p.step === 3 && p.status === 'copywriting_done') console.log(`   ✓ Motor: ${p.data.generator}`);
      if (p.step === 4 && p.status === 'exporting') console.log(`\n📦 [4/4] ${p.message}`);
    }
  });

  console.log(`\n======================================================`);
  console.log(`✨ [CONCLUÍDO COM SUCESSO!]`);
  console.log(`📁 Pacote gerado em: ${result.outputDir}`);
  console.log(`📄 Relatório completo: ${path.join(result.outputDir, 'PACOTE_REDES_SOCIAIS.md')}`);
  console.log(`🖼️  Imagens salvas em: ${path.join(result.outputDir, 'images')}`);
  console.log(`📝 Textos prontos em: ${result.dispatchResult.copysDir}`);
  if (result.dispatchResult.webhookResult) {
    console.log(`🌐 Webhook status:`, result.dispatchResult.webhookResult);
  }
  console.log(`======================================================\n`);
}

main().catch(err => {
  console.error(`\n❌ [ERRO NO PIPELINE]:`, err.message);
  process.exit(1);
});
