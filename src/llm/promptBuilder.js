/**
 * Constrói o prompt padrão e diretrizes para qualquer provedor de LLM.
 * Suporta modo clássico (Artigo Web/URL) e novo modo autoral (Interesses/Tópicos do Cliente).
 */
function buildCopywriterPrompt(article, client) {
  const brandName = client.name || client.brandName || 'Marca';
  const brandHandle = client.brandHandle || '';
  const tone = client.tone || 'Profissional, autoritário, estratégico e dinâmico';
  const audience = client.targetAudience || 'Profissionais, gestores e tomadores de decisão';
  const hashtags = Array.isArray(client.defaultHashtags) ? client.defaultHashtags : [];
  const cta = client.callToAction || 'Qual a sua visão sobre esse tema? Deixe nos comentários:';
  const commentTpl = client.commentTemplate || '👉 Acesse o conteúdo completo e todos os dados aqui: {URL}';
  const negativeKeywords = Array.isArray(client.negativeKeywords) ? client.negativeKeywords : [];

  const isTopic = Boolean(article.isTopicMode);
  const archetype = article.archetype || 'dica';

  const contextDescription = isTopic
    ? `um TEMA ESTRATÉGICO AUTORAL (${article.title}) alinhado aos pilares de interesse da marca (Arquétipo: "${archetype}")`
    : `um artigo publicado na web ("${article.title}")`;

  const negativeDirective = negativeKeywords.length > 0
    ? `PALAVRAS E EXPRESSÕES ESTRITAMENTE PROIBIDAS (NÃO utilize de forma alguma): ${JSON.stringify(negativeKeywords)}`
    : '';

  const systemInstructions = `Você é um estrategista sênior de Marketing de Conteúdo, Copywriting e Social Media Omnichannel de nível internacional.
Sua missão é transformar ${contextDescription} em um pacote de alta conversão, autoridade e engajamento para 6 redes sociais:

1. LinkedIn (post executivo, reflexivo, com storytelling ou framework claro, focado em tomadores de decisão. NÃO inclua links no corpo do post!).
2. Instagram Feed (formato carrossel/retrato com gancho magnético nos primeiros 100 caracteres, 3-4 lições escaneáveis, chamada para comentar para receber link no direct ou visitar a bio).
3. Instagram Stories (texto curto, teaser instigante com chamada para figurinha de link/interação).
4. X (Twitter) (thread magnética de exatamente 3 tweets concisos: Gancho de impacto no 1º, desenvolvimento e dados no 2º, conclusão com link {TWITTER_URL} no 3º).
5. Threads (post conversacional, ágil, sem jargões corporativos pesados, com pergunta instigante no final).
6. Facebook (post editorial persuasivo, explicativo e completo com link {FACEBOOK_URL}).

IMPORTANTE SOBRE LINKS / UTMS:
Onde houver indicação de link, use EXATAMENTE os seguintes marcadores para que o sistema injete os parâmetros UTM corretos:
- {LINKEDIN_URL}
- {INSTAGRAM_URL}
- {STORIES_URL}
- {TWITTER_URL}
- {THREADS_URL}
- {FACEBOOK_URL}

No LinkedIn e Instagram Feed, produza também o texto do "primeiro comentário" contendo o link correspondente ({LINKEDIN_URL} e {INSTAGRAM_URL}).

${negativeDirective}

RETORNO ESTRITAMENTE EM JSON:
Você DEVE responder EXCLUSIVAMENTE um objeto JSON válido, sem texto introdutório e sem explicações antes ou depois.
Estrutura exigida:
{
  "linkedin": {
    "post": "Texto completo do post...",
    "firstComment": "Texto do primeiro comentário..."
  },
  "instagram": {
    "post": "Texto completo para a legenda...",
    "firstComment": "Texto do primeiro comentário..."
  },
  "stories": {
    "post": "Texto curto para os stories..."
  },
  "twitter": {
    "thread": [
      "1/3 Tweet de abertura com gancho...",
      "2/3 Tweet com os pontos principais...",
      "3/3 Tweet final com conclusão e link {TWITTER_URL}..."
    ]
  },
  "threads": {
    "post": "Texto para o Threads com link {THREADS_URL}..."
  },
  "facebook": {
    "post": "Texto completo para o Facebook com link {FACEBOOK_URL}..."
  }
}`;

  const userContent = `=== CONTEÚDO BASE (${isTopic ? 'TÓPICO AUTORAL DO CLIENTE' : 'ARTIGO WEB'}) ===
Título: "${article.title}"
Descrição/Resumo: "${article.description || 'Não especificado'}"
Subtítulos/Seções: ${JSON.stringify(article.headings || [])}
Destaques em Lista: ${JSON.stringify(article.bulletPoints || [])}
Trechos Relevantes:
"""
${article.fullTextSnippet || (article.paragraphs && article.paragraphs.slice(0, 5).join('\n\n')) || ''}
"""
URL / Destino: "${article.canonicalUrl || article.url}"

=== DIRETRIZES DA MARCA ===
Nome da Marca: "${brandName}"
Handle/Arroba: "${brandHandle}"
Tom de Voz: "${tone}"
Público-Alvo: "${audience}"
Hashtags da Marca: ${JSON.stringify(hashtags)}
CTA Principal: "${cta}"
Template de 1º Comentário: "${commentTpl}"

Crie agora o pacote completo no formato JSON solicitado.`;

  return { systemInstructions, userContent };
}

module.exports = { buildCopywriterPrompt };
