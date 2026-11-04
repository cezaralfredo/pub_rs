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
 * Gera conteúdo textual unificado para Twitter, Instagram Feed, Facebook e LinkedIn,
 * obedecendo rigorosamente à quantidade máxima de caracteres que caiba em todas as redes
 * (Limite máximo de 280 caracteres do Twitter/X).
 */
function buildUnifiedSocialPost(article, client) {
  const title = (article.title || '').trim();
  const rawLead = (article.description || (article.paragraphs && article.paragraphs[0]) || '').trim();
  const hashtags = Array.isArray(client.defaultHashtags) && client.defaultHashtags.length > 0
    ? client.defaultHashtags.slice(0, 3).join(' ')
    : '#Inovacao #Marketing #Tecnologia';

  // Montagem padrão com título, resumo conciso e hashtags
  let text = '';
  if (rawLead) {
    text = `${title}\n\n${rawLead}\n\n${hashtags}`;
  } else {
    text = `${title}\n\n${hashtags}`;
  }

  // Se ultrapassar 280 caracteres, encurta o texto proporcionalmente
  if (text.length > 280) {
    const fixedLen = title.length + hashtags.length + 4; // quebras e espaços
    const availableForLead = 280 - fixedLen;
    if (availableForLead > 35 && rawLead) {
      const truncatedLead = rawLead.slice(0, availableForLead - 3).replace(/[,;.\s]+$/, '') + '...';
      text = `${title}\n\n${truncatedLead}\n\n${hashtags}`;
    } else {
      const maxTitle = 280 - (hashtags.length + 4);
      const cleanTitle = title.length > maxTitle ? title.slice(0, maxTitle - 3) + '...' : title;
      text = `${cleanTitle}\n\n${hashtags}`;
    }
  }

  // Trava final de segurança
  if (text.length > 280) {
    text = text.slice(0, 277) + '...';
  }

  return text.trim();
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
  const targetUrl = article.canonicalUrl || article.url;
  const slug = article.slug || 'artigo';

  // Conteúdo textual unificado para Twitter, Instagram Feed, Facebook e LinkedIn (<= 280 chars)
  const unifiedCopy = buildUnifiedSocialPost(article, client);

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

  const linkedinComment = commentTemplate.replace('{URL}', getUtmUrl(targetUrl, 'linkedin', slug));
  const instagramComment = commentTemplate.replace('{URL}', getUtmUrl(targetUrl, 'instagram', slug));
  const facebookComment = commentTemplate.replace('{URL}', getUtmUrl(targetUrl, 'facebook', slug));

  // 3. INSTAGRAM (STORIES)
  const storiesCopy = 
`NOVO ARTIGO NO AR 🚀

${article.title}

${leadSummary.slice(0, 140)}...

👉 Toque na figurinha de link para ler na íntegra:
${getUtmUrl(targetUrl, 'stories', slug)}`;

  // 4. X (TWITTER) - THREAD
  const twitterThread = [
    `1/4 🚨 ${article.title}

${leadSummary.length > 150 ? leadSummary.slice(0, 145) + '...' : leadSummary}

🧵 Segue o fio 👇`,

    `2/4 💡 Diagnóstico e pontos de partida:
${points.slice(0, 2).map(p => `• ${p}`).join('\n')}`,

    `3/4 ⚡ Alavancas estratégicas de crescimento:
${points.slice(2, 4).map(p => `• ${p}`).join('\n')}`,

    `4/4 🔗 Leia a análise completa e acesse todas as fontes na íntegra:
${getUtmUrl(targetUrl, 'twitter', slug)}

${hashtags.slice(0, 3).join(' ')}`
  ];

  // 5. THREADS (Post + Thread opcional)
  const threadsCopy = 
`${article.title}

${leadSummary}

Principais conclusões:
${points.slice(0, 3).map(p => `→ ${p}`).join('\n')}

🔗 Acesse a íntegra: ${getUtmUrl(targetUrl, 'threads', slug)}

Como você ou seu time lidam com essa questão hoje?`;

  const threadsThread = [
    `1/3 🚨 ${article.title}\n\n${leadSummary.slice(0, 160)}... 🧵`,
    `2/3 💡 Principais conclusões:\n${points.slice(0, 3).map(p => `→ ${p}`).join('\n')}`,
    `3/3 🔗 Artigo completo com dados: ${getUtmUrl(targetUrl, 'threads', slug)}\n\nO que você achou dessa mudança?`
  ];

  return {
    meta: {
      generator: 'Algorithmic Dynamic v2 (Unificado)',
      provider: 'Engine Nativa (Sem IA)',
      client: client.name || client.id,
      articleTitle: article.title,
      targetUrl,
      generatedAt: new Date().toISOString()
    },
    hooks,
    carousel,
    unified: {
      post: unifiedCopy,
      charCount: unifiedCopy.length,
      maxLimit: 280
    },
    linkedin: {
      post: unifiedCopy,
      firstComment: linkedinComment,
      recommendedFormat: '16:9 ou 4:5'
    },
    instagram: {
      post: unifiedCopy,
      firstComment: instagramComment,
      recommendedFormat: '4:5 (Retrato Padrão)'
    },
    stories: {
      post: storiesCopy,
      recommendedFormat: '9:16 (Vertical)'
    },
    twitter: {
      post: unifiedCopy,
      thread: twitterThread,
      recommendedFormat: '16:9 (Horizontal)'
    },
    threads: {
      post: threadsCopy,
      thread: threadsThread,
      recommendedFormat: '1:1 ou 16:9'
    },
    facebook: {
      post: unifiedCopy,
      firstComment: facebookComment,
      recommendedFormat: '16:9 (Horizontal)'
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
