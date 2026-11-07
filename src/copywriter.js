/**
 * Módulo de Geração de Copywriting Multicanal
 * Suporta múltiplos provedores de LLM (Gemini, OpenAI, Anthropic, Groq, DeepSeek, OpenRouter, Ollama)
 * com fallback dinâmico algorítmico automático baseado 100% no conteúdo real do artigo extraído.
 */
const { generateWithLlm } = require('./llm');

// Helper para gerar URLs com parâmetros de rastreamento UTM
function getUtmUrl(targetUrl, source, slug) {
  try {
    const url = new URL(targetUrl);
    url.searchParams.set('utm_source', source);
    url.searchParams.set('utm_medium', 'social');
    url.searchParams.set('utm_campaign', slug || 'distribuicao');
    return url.toString();
  } catch {
    return targetUrl;
  }
}

/**
 * Gera o texto para o X (Twitter) contendo SOMENTE o ponto fundamental do artigo
 * (o título ficará exclusivamente sobre a imagem), respeitando a conta padrão de máx. 280 caracteres.
 */
function buildTwitterFundamentalPoint(article, client) {
  const hashtags = Array.isArray(client.defaultHashtags) && client.defaultHashtags.length > 0
    ? client.defaultHashtags.slice(0, 3).join(' ')
    : '#Inovacao #Marketing #Tecnologia';

  // 1. Extrai o ponto fundamental do artigo (sem título)
  const rawCandidate = (article.bulletPoints && article.bulletPoints[0]) ||
                       (article.headings && article.headings[0]) ||
                       article.description ||
                       (article.paragraphs && article.paragraphs[0]) ||
                       '';

  // Remove prefixos como números, asteriscos ou marcadores
  let fundamentalPoint = rawCandidate
    .replace(/^[-*•\d.]+\s*/, '')
    .replace(/:$/, '')
    .trim();

  // Se o ponto for excessivamente curto, complementa com a descrição
  if (fundamentalPoint.length < 50 && article.description && article.description !== fundamentalPoint) {
    fundamentalPoint = `${fundamentalPoint}: ${article.description}`.trim();
  }

  if (!fundamentalPoint) {
    fundamentalPoint = 'A aplicação prática dessas estratégias de ponta transforma desafios operacionais em vantagens competitivas decisivas para o negócio.';
  }

  // 2. Monta o tweet com o ponto fundamental + hashtags (SEM o título do artigo)
  let tweet = `${fundamentalPoint}\n\n${hashtags}`;

  // Se ultrapassar 280 caracteres, encurta o ponto fundamental
  if (tweet.length > 280) {
    const maxPointLen = 280 - (hashtags.length + 4);
    fundamentalPoint = fundamentalPoint.slice(0, maxPointLen - 3).replace(/[,;.\s]+$/, '') + '...';
    tweet = `${fundamentalPoint}\n\n${hashtags}`;
  }

  // Trava de segurança absoluta para o limite de 280 caracteres da conta padrão do X
  if (tweet.length > 280) {
    tweet = tweet.slice(0, 277) + '...';
  }

  return tweet.trim();
}

/**
 * Gera um resumo editorial completo para Instagram, Facebook e LinkedIn
 * com até 1700 caracteres.
 * - Modo Artigo Web: finaliza com a URL no formato "Matéria completa em (url)"
 * - Modo Interesses / Tema Livre: NÃO adiciona link de site (conteúdo 100% nativo)
 */
function buildRichSummaryPost(article, client, network = 'linkedin') {
  const isTopic = Boolean(article.isTopicMode || article.mode === 'topic' || !article.url);
  const targetUrl = isTopic ? null : (article.canonicalUrl || article.url);
  const slug = article.slug || 'artigo';
  const utmUrl = targetUrl ? getUtmUrl(targetUrl, network, slug) : null;

  const hashtags = Array.isArray(client.defaultHashtags) && client.defaultHashtags.length > 0
    ? client.defaultHashtags.join(' ')
    : '#Inovacao #Estrategia #Tendencias #Mercado';

  // Resumo/Lead envolvente
  const leadSummary = article.description || 
    (article.paragraphs && article.paragraphs[0]) || 
    'Confira uma análise aprofundada com os principais insights, desafios e caminhos práticos para navegar este cenário.';

  // Pontos de análise
  const rawPoints = (article.bulletPoints && article.bulletPoints.length >= 2)
    ? article.bulletPoints
    : (article.headings && article.headings.length >= 2)
      ? article.headings
      : (article.paragraphs ? article.paragraphs.slice(1, 4) : []);

  const points = rawPoints.slice(0, 4).map(p => 
    p.replace(/^[-*•\d.]+\s*/, '').replace(/:$/, '').trim()
  ).filter(p => p.length > 10);

  const icons = ['🔹', '⚡', '💡', '📊'];
  const formattedPoints = points.length > 0
    ? points.map((p, idx) => `${icons[idx % icons.length]} ${p}`).join('\n\n')
    : `🔹 Principais descobertas e análises aprofundadas\n\n⚡ Estratégias práticas aplicadas ao mercado atual\n\n💡 Lições essenciais para tomadores de decisão`;

  // Formato: se houver URL válida de artigo, inclui "Matéria completa em (url)"
  const footerLink = utmUrl ? `Matéria completa em (${utmUrl})` : '';

  let post = '';
  if (footerLink) {
    post = `${leadSummary}\n\nDestaques e pontos fundamentais da análise:\n\n${formattedPoints}\n\n${hashtags}\n\n${footerLink}`;
  } else {
    post = `${leadSummary}\n\nDestaques e pontos fundamentais da análise:\n\n${formattedPoints}\n\n${hashtags}`;
  }

  // Se ultrapassar 1700 caracteres, encurta o corpo preservando o rodapé
  if (post.length > 1700) {
    const fixedEnd = footerLink ? `\n\n${hashtags}\n\n${footerLink}` : `\n\n${hashtags}`;
    const availableForBody = 1700 - fixedEnd.length;
    let body = `${leadSummary}\n\nDestaques da análise:\n\n${formattedPoints}`;
    if (body.length > availableForBody) {
      body = body.slice(0, availableForBody - 3).replace(/[,;.\s]+$/, '') + '...';
    }
    post = `${body}${fixedEnd}`;
  }

  // Trava de segurança final para até 1700 caracteres
  if (post.length > 1700) {
    if (footerLink) {
      const fixedEnd = `\n\n${footerLink}`;
      const maxBody = 1700 - fixedEnd.length;
      post = `${post.slice(0, maxBody - 3).replace(/[,;.\s]+$/, '')}...${fixedEnd}`;
    } else {
      post = `${post.slice(0, 1697).replace(/[,;.\s]+$/, '')}...`;
    }
  }

  return post.trim();
}

// ---------------------------------------------------------------------------
// 1. GERADOR ALGORÍTMICO DINÂMICO (Sem necessidade de chaves de API / Offline)
// ---------------------------------------------------------------------------
function generateAlgorithmicCopies(article, client) {
  const brand = client.brandName || client.name || 'Marca';
  const handle = client.brandHandle || '';
  const hashtags = Array.isArray(client.defaultHashtags) && client.defaultHashtags.length > 0
    ? client.defaultHashtags
    : ['#Inovacao', '#Estrategia', '#Tendencias', '#Mercado'];
  const hashtagsStr = hashtags.join(' ');
  const isTopic = Boolean(article.isTopicMode || article.mode === 'topic' || !article.url);
  const targetUrl = isTopic ? null : (article.canonicalUrl || article.url);
  const slug = article.slug || 'artigo';

  // 1. X (Twitter): Somente o ponto fundamental do artigo (sem título, máx 280 chars)
  const twitterPost = buildTwitterFundamentalPoint(article, client);

  // 2. Instagram, Facebook e LinkedIn: Resumo detalhado com até 1700 caracteres (com link se web, sem link se tópico)
  const linkedinPost = buildRichSummaryPost(article, client, 'linkedin');
  const instagramPost = buildRichSummaryPost(article, client, 'instagram');
  const facebookPost = buildRichSummaryPost(article, client, 'facebook');

  // Seleção e higienização dos pontos principais extraídos
  const rawPoints = (article.bulletPoints && article.bulletPoints.length >= 2)
    ? article.bulletPoints
    : (article.headings && article.headings.length >= 2)
      ? article.headings
      : (article.paragraphs ? article.paragraphs.slice(1, 4) : []);

  const points = rawPoints.slice(0, 4).map(p => 
    p.replace(/^[-*•\d.]+\s*/, '').replace(/:$/, '').trim()
  ).filter(p => p.length > 10);

  const icons = ['🔹', '⚡', '💡', '📊'];
  const formattedPoints = points.length > 0
    ? points.map((p, idx) => `${icons[idx % icons.length]} ${p}`).join('\n')
    : `🔹 Principais descobertas e análises aprofundadas\n⚡ Estratégias práticas aplicadas ao mercado atual\n💡 Lições para tomadores de decisão`;

  // Resumo/Lead dinâmico baseado na introdução real do artigo
  const leadSummary = article.description || 
    (article.paragraphs && article.paragraphs[0]) || 
    'Confira uma análise aprofundada com os principais insights, desafios e caminhos práticos para navegar este cenário.';

  const commentTemplate = client.commentTemplate || '👉 Leia o artigo completo com todas as referências aqui: {URL}';

  // Ganchos Alternativos (A/B Hook Generator)
  const hooks = {
    contrarian: `A maioria das empresas está olhando para o lado errado quando o assunto é "${article.title}". Aqui está o que quase ninguém está admitindo publicamente:`,
    dataDriven: `Os novos números revelam uma virada de chave no mercado: quem dominar "${article.title}" terá uma vantagem competitiva desproporcional. Veja o que os dados apontam:`,
    storytelling: `Até pouco tempo atrás, esse desafio gerava perda de tempo e recursos. Mas ao analisar a estratégia por trás de "${article.title}", a resposta ficou evidente:`
  };

  // Estrutura para Carrossel em Slides
  const carousel = {
    title: article.title.length > 50 ? article.title.slice(0, 47) + '...' : article.title,
    subtitle: leadSummary.length > 90 ? leadSummary.slice(0, 87) + '...' : leadSummary,
    slides: points.slice(0, 4).map((p, idx) => ({
      headline: p.split(':')[0].slice(0, 45),
      text: p.includes(':') ? p.split(':').slice(1).join(':').trim() : p
    })),
    cta: `Salve este carrossel e siga ${handle || brand} para mais estratégias práticas.`
  };

  const linkedinComment = isTopic
    ? 'Qual é a sua visão sobre esse tema? Compartilhe sua experiência nos comentários!'
    : (targetUrl ? commentTemplate.replace('{URL}', getUtmUrl(targetUrl, 'linkedin', slug)) : 'Compartilhe sua visão nos comentários!');
  const instagramComment = isTopic
    ? 'Qual desses insights fez mais sentido para você? Comente aqui embaixo!'
    : (targetUrl ? commentTemplate.replace('{URL}', getUtmUrl(targetUrl, 'instagram', slug)) : 'Comente o que achou!');
  const facebookComment = isTopic
    ? 'Compartilhe sua experiência conosco nos comentários!'
    : (targetUrl ? commentTemplate.replace('{URL}', getUtmUrl(targetUrl, 'facebook', slug)) : 'Deixe sua opinião nos comentários!');

  // 3. INSTAGRAM (STORIES)
  const storiesCopy = isTopic
    ? `ANÁLISE ESTRATÉGICA 💡\n\n${article.title}\n\n${leadSummary.slice(0, 140)}...\n\n👉 O que você acha desse movimento? Deixe na caixinha!`
    : `NOVO ARTIGO NO AR 🚀\n\n${article.title}\n\n${leadSummary.slice(0, 140)}...\n\n👉 Toque na figurinha de link para ler na íntegra:\n${getUtmUrl(targetUrl, 'stories', slug)}`;

  // 4. X (TWITTER) - THREAD
  const twitterThread = [
    `1/4 🚨 ${article.title}\n\n${leadSummary.length > 150 ? leadSummary.slice(0, 145) + '...' : leadSummary}\n\n🧵 Segue o fio 👇`,
    `2/4 💡 Diagnóstico e pontos de partida:\n${points.slice(0, 2).map(p => `• ${p}`).join('\n')}`,
    `3/4 ⚡ Alavancas estratégicas de crescimento:\n${points.slice(2, 4).map(p => `• ${p}`).join('\n')}`,
    isTopic
      ? `4/4 🎯 Conclusão e impacto no negócio:\nDomine esses fundamentos para acelerar resultados.\n\n${hashtags.slice(0, 3).join(' ')}`
      : `4/4 🔗 Leia a análise completa e acesse todas as fontes na íntegra:\n${getUtmUrl(targetUrl, 'twitter', slug)}\n\n${hashtags.slice(0, 3).join(' ')}`
  ];

  // 5. THREADS (Post + Thread opcional)
  const threadsCopy = isTopic
    ? `${article.title}\n\n${leadSummary}\n\nPrincipais conclusões:\n${points.slice(0, 3).map(p => `→ ${p}`).join('\n')}\n\nComo você ou seu time lidam com essa questão hoje?`
    : `${article.title}\n\n${leadSummary}\n\nPrincipais conclusões:\n${points.slice(0, 3).map(p => `→ ${p}`).join('\n')}\n\n🔗 Acesse a íntegra: ${getUtmUrl(targetUrl, 'threads', slug)}\n\nComo você ou seu time lidam com essa questão hoje?`;

  const threadsThread = isTopic
    ? [
        `1/3 🚨 ${article.title}\n\n${leadSummary.slice(0, 160)}... 🧵`,
        `2/3 💡 Principais conclusões:\n${points.slice(0, 3).map(p => `→ ${p}`).join('\n')}`,
        `3/3 🎯 Lição prática e reflexão:\nO que você achou dessa mudança?`
      ]
    : [
        `1/3 🚨 ${article.title}\n\n${leadSummary.slice(0, 160)}... 🧵`,
        `2/3 💡 Principais conclusões:\n${points.slice(0, 3).map(p => `→ ${p}`).join('\n')}`,
        `3/3 🔗 Artigo completo com dados: ${getUtmUrl(targetUrl, 'threads', slug)}\n\nO que você achou dessa mudança?`
      ];

  return {
    meta: {
      generator: 'Algorithmic Dynamic v3 (X Padrão 280 + Resumo 1700)',
      provider: 'Engine Nativa (Sem IA)',
      client: client.name || client.id,
      articleTitle: article.title,
      targetUrl,
      generatedAt: new Date().toISOString()
    },
    hooks,
    carousel,
    twitter: {
      post: twitterPost,
      thread: twitterThread,
      recommendedFormat: '16:9 ou 4:5 (Ponto Fundamental - Título na Imagem)',
      charCount: twitterPost.length,
      maxLimit: 280
    },
    linkedin: {
      post: linkedinPost,
      firstComment: linkedinComment,
      recommendedFormat: '16:9 ou 4:5 Retrato',
      charCount: linkedinPost.length,
      maxLimit: 1700
    },
    instagram: {
      post: instagramPost,
      firstComment: instagramComment,
      recommendedFormat: '4:5 (Retrato Padrão)',
      charCount: instagramPost.length,
      maxLimit: 1700
    },
    facebook: {
      post: facebookPost,
      firstComment: facebookComment,
      recommendedFormat: '16:9 ou 4:5 Retrato',
      charCount: facebookPost.length,
      maxLimit: 1700
    },
    stories: {
      post: storiesCopy,
      recommendedFormat: '9:16 (Vertical)'
    },
    threads: {
      post: threadsCopy,
      thread: threadsThread,
      recommendedFormat: '1:1 ou 16:9'
    }
  };
}

// ---------------------------------------------------------------------------
// 2. ENTRADA PRINCIPAL COM SUPORTE MULTI-LLM & FALLBACK
// ---------------------------------------------------------------------------
async function generateSocialCopies(article, client, options = {}) {
  try {
    const llmResult = await generateWithLlm(article, client, options);
    if (llmResult) {
      return llmResult;
    }
  } catch (err) {
    console.warn(`   ⚠️ [IA Fallback] ${err.message}. Alternando para gerador algorítmico dinâmico.`);
  }

  // Fallback padrão se não houver IA configurada ou se todos os provedores falharem
  return generateAlgorithmicCopies(article, client);
}

module.exports = {
  generateSocialCopies,
  generateAlgorithmicCopies
};
