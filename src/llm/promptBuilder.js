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

  const linkDirective = isTopic
    ? `2. INSTAGRAM FEED, FACEBOOK E LINKEDIN (RESUMO COM ATÉ 1700 CARACTERES - CONTEÚDO NATIVO SEM LINKS):
   - Produza um resumo editorial aprofundado, envolvente e escaneável (com até 1700 caracteres).
   - Destaque o contexto de mercado, os pontos práticos essenciais e lições estratégicas.
   - ATENÇÃO CRÍTICA: Como este conteúdo foi gerado a partir de interesses / tema livre (não existe artigo publicado no site), NÃO adicione links de site e NUNCA insira 'Matéria completa em...'.
   - Finalize o texto com um CTA engajador convidando para discussão nos comentários e as hashtags da marca.`
    : `2. INSTAGRAM FEED, FACEBOOK E LINKEDIN (RESUMO COM ATÉ 1700 CARACTERES):
   - Produza um resumo editorial aprofundado, envolvente e escaneável (com até 1700 caracteres).
   - Destaque o contexto de mercado, os pontos práticos essenciais e lições estratégicas.
   - AO FINAL DO RESUMO, insira obrigatoriamente a URL da matéria no formato:
     Matéria completa em ({URL})
     (onde {URL} é {INSTAGRAM_URL}, {FACEBOOK_URL} ou {LINKEDIN_URL}).
   - Limite estrito de até 1700 caracteres no total.`;

  const linkUtmSection = isTopic
    ? `IMPORTANTE SOBRE CONTEÚDO AUTORAL (SEM LINKS DE SITE):
Este conteúdo é autoral e nativo para redes sociais gerado por interesses/tema livre. NÃO inclua links fictícios de site nem marcadores de URL nas postagens ou comentários.`
    : `IMPORTANTE SOBRE LINKS / UTMS:
Onde houver indicação de link, use EXATAMENTE os seguintes marcadores para que o sistema injete os parâmetros UTM corretos:
- {LINKEDIN_URL}
- {INSTAGRAM_URL}
- {STORIES_URL}
- {TWITTER_URL}
- {THREADS_URL}
- {FACEBOOK_URL}

No LinkedIn, Instagram Feed e Facebook, você pode produzir também o texto de comentário complementar contendo o link correspondente caso desejado.`;

  const sampleLinkedinPost = isTopic
    ? `"post": "Resumo analítico completo da matéria (até 1700 caracteres)...\\n\\n#Inovacao #Estrategia",\n    "firstComment": "Qual é a sua visão sobre esse tema? Deixe sua experiência nos comentários!"`
    : `"post": "Resumo analítico completo da matéria (até 1700 caracteres)...\\n\\nMatéria completa em ({LINKEDIN_URL})",\n    "firstComment": "Texto do primeiro comentário com {LINKEDIN_URL}..."`;

  const sampleInstagramPost = isTopic
    ? `"post": "Resumo completo da matéria formatado para o feed (até 1700 caracteres)...\\n\\n#Tendencias #Mercado",\n    "firstComment": "Qual insight fez mais sentido para a sua rotina? Compartilhe abaixo!"`
    : `"post": "Resumo completo da matéria formatado para o feed (até 1700 caracteres)...\\n\\nMatéria completa em ({INSTAGRAM_URL})",\n    "firstComment": "Texto do primeiro comentário com {INSTAGRAM_URL}..."`;

  const sampleFacebookPost = isTopic
    ? `"post": "Resumo editorial completo da matéria (até 1700 caracteres)...\\n\\n#Inovacao #Estrategia",\n    "firstComment": "Compartilhe sua experiência conosco nos comentários!"`
    : `"post": "Resumo editorial completo da matéria (até 1700 caracteres)...\\n\\nMatéria completa em ({FACEBOOK_URL})",\n    "firstComment": "Texto do primeiro comentário com {FACEBOOK_URL}..."`;

  const sampleTwitterThreadEnd = isTopic
    ? `"3/3 Conclusão e lição estratégica."`
    : `"3/3 Conclusão: {TWITTER_URL}"`;

  const sampleStoriesPost = isTopic
    ? `"Texto curto e instigante para os stories convidando a interagir com a caixinha de perguntas..."`
    : `"Texto curto para os stories com {STORIES_URL}..."`;

  const sampleThreadsEnd = isTopic
    ? `"3/3 Conclusão e ponto de reflexão para debate."`
    : `"3/3 Conclusão e link {THREADS_URL}..."`;

  const systemInstructions = `Você é um estrategista sênior de Marketing de Conteúdo, Copywriting e Social Media Omnichannel de nível internacional.
Sua missão é transformar ${contextDescription} em um pacote completo de alta conversão, autoridade e engajamento para as redes sociais:

DIRETRIZES ESPECÍFICAS POR CANAL:

1. X (TWITTER) - CONTA PADRÃO (MÁXIMO DE 280 CARACTERES):
   - Adicione SOMENTE o ponto fundamental / principal aprendizado do artigo.
   - O título do artigo NÃO DEVE APARECER no texto do tweet (o título ficará exclusivamente sobre a imagem!).
   - Respeite rigorosamente o limite de 280 caracteres (incluindo hashtags).

${linkDirective}

3. Instagram Stories (texto curto, teaser instigante com chamada para figurinha de interação ou caixinha de perguntas).
4. Threads (post conversacional ou thread opcional com pergunta instigante).
5. Ganchos Alternativos (A/B Hooks): Crie 3 variações magnéticas de introdução (Contrariano/Provocativo, Baseado em Dados/Métricas e Storytelling/Desafio Prático).
6. Carrossel Estruturado (LinkedIn Document / Instagram Slides 4:5): Estruture os slides em sequência lógica (Capa + 3 a 4 Insights Práticos + CTA final).

${linkUtmSection}

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
  "twitter": {
    "post": "Texto contendo SOMENTE o ponto fundamental do artigo (sem título, máx 280 caracteres)...",
    "thread": [
      "1/3 Ponto central com dados...",
      "2/3 Estratégia prática...",
      ${sampleTwitterThreadEnd}
    ]
  },
  "linkedin": {
    ${sampleLinkedinPost}
  },
  "instagram": {
    ${sampleInstagramPost}
  },
  "stories": {
    "post": ${sampleStoriesPost}
  },
  "threads": {
    "post": "Texto conversacional para o Threads...",
    "thread": [
      "1/3 Gancho no Threads...",
      "2/3 Principais lições...",
      ${sampleThreadsEnd}
    ]
  },
  "facebook": {
    ${sampleFacebookPost}
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
