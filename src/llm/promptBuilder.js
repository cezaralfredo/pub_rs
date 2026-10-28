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
Sua missão é transformar ${contextDescription} em um pacote completo de alta conversão, autoridade e engajamento para as redes sociais:

1. LinkedIn (post executivo, reflexivo, com storytelling ou framework claro, focado em tomadores de decisão. NÃO inclua links no corpo do post, use indicação para o primeiro comentário!).
2. Instagram Feed (formato carrossel/retrato com gancho magnético nos primeiros 100 caracteres, 3-4 lições escaneáveis, chamada para comentar para receber link no direct ou visitar a bio).
3. Instagram Stories (texto curto, teaser instigante com chamada para figurinha de link/interação).
4. X (Twitter) (thread magnética de 3 a 4 tweets concisos: 1º Tweet gancho com "🧵 Segue o fio 👇", 2º e 3º tweets com os pontos principais e dados, último tweet com conclusão e link {TWITTER_URL}).
5. Threads (post conversacional, ágil, sem jargões corporativos pesados, com pergunta instigante no final).
6. Facebook (post editorial persuasivo, explicativo e completo com indicação de link no primeiro comentário).
7. Ganchos Alternativos (A/B Hooks): Crie 3 variações magnéticas de introdução (Contrariano/Provocativo, Baseado em Dados/Métricas e Storytelling/Desafio Prático).
8. Carrossel Estruturado (LinkedIn Document / Instagram Slides): Estruture os slides em sequência lógica (Capa + 3 a 4 Insights Práticos + CTA final).

IMPORTANTE SOBRE LINKS / UTMS:
Onde houver indicação de link, use EXATAMENTE os seguintes marcadores para que o sistema injete os parâmetros UTM corretos:
- {LINKEDIN_URL}
- {INSTAGRAM_URL}
- {STORIES_URL}
- {TWITTER_URL}
- {THREADS_URL}
- {FACEBOOK_URL}

No LinkedIn, Instagram Feed e Facebook, produza também o texto do "primeiro comentário" contendo o link correspondente ({LINKEDIN_URL}, {INSTAGRAM_URL} e {FACEBOOK_URL}) para garantir o alcance orgânico sem penalização algorítmica.

${negativeDirective}

RETORNO ESTRITAMENTE EM JSON:
Você DEVE responder EXCLUSIVAMENTE um objeto JSON válido, sem texto introdutório e sem explicações antes ou depois.
Estrutura exigida:
{
  "hooks": {
    "contrarian": "Gancho provocativo que quebra o senso comum (1 a 2 frases)...",
    "dataDriven": "Gancho focado em números, métricas, porcentagens ou impacto no negócio (1 a 2 frases)...",
    "storytelling": "Gancho narrativo sobre um obstáculo prático superado (1 a 2 frases)..."
  },
  "carousel": {
    "title": "Título conciso da capa (máx 50 caracteres)",
    "subtitle": "Subtítulo de apoio da capa (máx 90 caracteres)",
    "slides": [
      {
        "headline": "Título do Insight 1",
        "text": "Explicação prática e escaneável de 2 a 3 frases."
      },
      {
        "headline": "Título do Insight 2",
        "text": "Explicação prática e escaneável de 2 a 3 frases."
      },
      {
        "headline": "Título do Insight 3",
        "text": "Explicação prática e escaneável de 2 a 3 frases."
      },
      {
        "headline": "Título do Insight 4",
        "text": "Explicação prática e escaneável de 2 a 3 frases."
      }
    ],
    "cta": "Salve este carrossel e siga a marca para mais estratégias diárias."
  },
  "linkedin": {
    "post": "Texto completo do post...",
    "firstComment": "Texto do primeiro comentário com {LINKEDIN_URL}..."
  },
  "instagram": {
    "post": "Texto completo para a legenda...",
    "firstComment": "Texto do primeiro comentário com {INSTAGRAM_URL}..."
  },
  "stories": {
    "post": "Texto curto para os stories com {STORIES_URL}..."
  },
  "twitter": {
    "thread": [
      "1/4 🚨 Tweet de abertura com gancho... 🧵 Segue o fio 👇",
      "2/4 💡 Ponto central 1 com dados...",
      "3/4 ⚡ Ponto central 2 prático...",
      "4/4 🔗 Leia a análise completa na íntegra: {TWITTER_URL}"
    ]
  },
  "threads": {
    "post": "Texto conversacional para o Threads com {THREADS_URL}...",
    "thread": [
      "1/3 Gancho no Threads...",
      "2/3 Principais lições...",
      "3/3 Conclusão e link {THREADS_URL}..."
    ]
  },
  "facebook": {
    "post": "Texto completo para o Facebook...",
    "firstComment": "Texto do primeiro comentário com {FACEBOOK_URL}..."
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
