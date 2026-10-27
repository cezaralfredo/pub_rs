require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { runPipeline, loadClientConfig } = require('./src/pipeline');
const { detectAvailableProviders } = require('./src/llm');
const { suggestTopicIdeas, ARCHETYPES } = require('./src/topicSynthesizer');

// CLI Arguments parser
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    url: '',
    topic: '',
    archetype: 'dica',
    style: 'dark-cinematic',
    client: 'anaue-design',
    provider: '',
    model: '',
    aiImage: false,
    suggestTopics: false,
    help: false
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg === '--url' && args[i + 1]) {
      options.url = args[i + 1];
      i++;
    } else if (arg === '--topic' && args[i + 1]) {
      options.topic = args[i + 1];
      i++;
    } else if (arg === '--archetype' && args[i + 1]) {
      options.archetype = args[i + 1];
      i++;
    } else if (arg === '--style' && args[i + 1]) {
      options.style = args[i + 1];
      i++;
    } else if (arg === '--client' && args[i + 1]) {
      options.client = args[i + 1];
      i++;
    } else if ((arg === '--provider' || arg === '-p') && args[i + 1]) {
      options.provider = args[i + 1];
      i++;
    } else if ((arg === '--model' || arg === '-m') && args[i + 1]) {
      options.model = args[i + 1];
      i++;
    } else if (arg === '--ai-image' || arg === '--generate-image') {
      options.aiImage = true;
    } else if (arg === '--suggest-topics' || arg === '--ideate') {
      options.suggestTopics = true;
    } else if (arg.startsWith('http://') || arg.startsWith('https://')) {
      options.url = arg;
    }
  }

  return options;
}

async function main() {
  const {
    url,
    topic,
    archetype,
    style: visualStyle,
    client: clientId,
    provider,
    model,
    aiImage,
    suggestTopics,
    help
  } = parseArgs();

  const clientsDir = path.join(__dirname, 'config', 'clients');
  const availableClients = fs.existsSync(clientsDir)
    ? fs.readdirSync(clientsDir).filter(f => f.endsWith('.json')).map(f => `  - ${f.replace('.json', '')}`).join('\n')
    : '  - default';

  const detectedProviders = detectAvailableProviders();
  const detectedStr = detectedProviders.length > 0 
    ? detectedProviders.map(p => `"${p}"`).join(', ') 
    : 'Nenhum detectado no .env (usando motor algorítmico nativo)';

  // 1. Caso de Sugestão de Ideias (--suggest-topics)
  if (suggestTopics) {
    const client = loadClientConfig(clientId);
    console.log(`\n======================================================`);
    console.log(`  💡 [AI BRAINSTORMING] Sugestões de Pautas`);
    console.log(`  Cliente: "${client.name || client.brandName}" (${client.id})`);
    console.log(`  Nicho: ${client.niche || 'Geral'}`);
    console.log(`======================================================`);

    const result = await suggestTopicIdeas(client, { count: 5, provider, model });
    console.log(`\nFonte: ${result.source.toUpperCase()} (${result.provider || ''})\n`);

    result.ideas.forEach((idea, idx) => {
      console.log(`📌 Ideia #${idx + 1}: ${idea.title}`);
      console.log(`   🏷️  Tema: ${idea.topic}`);
      console.log(`   🎯 Arquétipo: [${idea.archetype.toUpperCase()}]`);
      console.log(`   🪝 Gancho: "${idea.hook}"`);
      console.log(`   💡 Por que funciona: ${idea.whyItWorks}`);
      console.log(`   👉 Comando direto: node index.js --topic "${idea.topic}" --client ${clientId} --archetype ${idea.archetype}\n`);
    });

    console.log(`======================================================\n`);
    return;
  }

  // 2. Ajuda
  if ((!url && !topic) || help) {
    console.log(`
======================================================
  🤖 pub_rs v3.0 — Automação Omnichannel de Redes Sociais
======================================================
Uso:
  # Modo 1: A partir de URL de Artigo existente
  node index.js --url <URL_DO_ARTIGO> [opções]

  # Modo 2: A partir de Interesses/Tópicos do Cliente (Topic-to-Post)
  node index.js --topic "<TEMA_OU_INTERESSE>" --client <ID> [opções]

  # Modo 3: Sugestão de Pautas e Brainstorming Inteligente com IA
  node index.js --client <ID> --suggest-topics

Opções:
  --topic <TEXTO>     Tema ou interesse da marca para criar post autoral do zero
  --archetype <TIPO>  Arquétipo de post: dica (padrão), opiniao, mito, case
  --style <ESTILO>    Estilo visual IA: dark-cinematic, minimalist-3d, corporate-photo, tech-vector
  --client <ID>       ID do cliente (padrão: anaue-design)
  --provider, -p      Provedor de LLM (gemini, openai, anthropic, groq, deepseek, openrouter, ollama)
  --model, -m         Modelo específico (ex: gpt-4o-mini, gemini-2.5-flash, claude-3-5-sonnet-20241022)
  --ai-image          Força a geração de arte via IA (DALL-E 3 / Imagen 3)
  --suggest-topics    Sugere pautas inteligentes com base nos pilares cadastrados do cliente
  --help, -h          Exibe esta mensagem de ajuda

Provedores de IA ativos no ambiente:
  ${detectedStr}

Exemplos:
  # Gerar por interesse com arquétipo de opinião
  node index.js --topic "O Fim dos Cookies de Terceiros e o ROI de Anúncios" --client anaue-design --archetype opiniao

  # Gerar por URL com DALL-E 3
  node index.js --url https://anauedesign.com.br/blog/artigo --client anaue-design --ai-image

  # Descobrir pautas recomendadas para o cliente
  node index.js --client anaue-design --suggest-topics

Clientes disponíveis em config/clients/:
${availableClients}
======================================================
`);
    process.exit(help ? 0 : 1);
  }

  const isTopicMode = Boolean(topic);
  console.log(`\n🚀 [pub_rs] Iniciando automação no modo: ${isTopicMode ? 'TOPIC-TO-POST (Interesses do Cliente)' : 'URL (Scraping)'}`);
  if (isTopicMode) {
    console.log(`   📌 Tema: "${topic}"`);
    console.log(`   🏷️  Arquétipo: ${archetype} | Estilo Visual: ${visualStyle}`);
  } else {
    console.log(`   🔗 URL: ${url}`);
  }

  const result = await runPipeline({
    mode: isTopicMode ? 'topic' : 'url',
    url,
    topic,
    archetype,
    visualStyle,
    clientId,
    provider,
    model,
    aiImage: isTopicMode ? true : aiImage,
    onProgress: (p) => {
      if (p.step === 1 && (p.status === 'scraping' || p.status === 'synthesizing')) console.log(`\n⏳ [1/4] ${p.message}`);
      if (p.step === 1 && (p.status === 'scraping_done' || p.status === 'synthesizing_done')) console.log(`   ✓ Título: "${p.data.title}"`);
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
