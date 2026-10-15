/**
 * Módulo de Geração de Copywriting Multicanal
 * Suporta Inteligência Artificial via Google Gemini API (quando GEMINI_API_KEY estiver configurada)
 * com fallback dinâmico algorítmico automático baseado 100% no conteúdo real do artigo extraído.
 */

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

// ---------------------------------------------------------------------------
// 1. GERADOR ALGORÍTMICO DINÂMICO (Sem necessidade de chaves de API)
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

  // Seleção e higienização dos pontos principais extraídos
  const rawPoints = (article.bulletPoints && article.bulletPoints.length >= 2)
    ? article.bulletPoints
    : (article.headings && article.headings.length >= 2)
      ? article.headings
      : article.paragraphs.slice(1, 4);

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

  const cta = client.callToAction || 'Qual a sua visão sobre esse tema? Compartilhe nos comentários:';
  const commentTemplate = client.commentTemplate || '👉 Leia o artigo completo com todas as referências aqui: {URL}';

  // 1. LINKEDIN
  const linkedinCopy = 
`${article.title}

${leadSummary}

Destaques e pontos-chave abordados na análise:

${formattedPoints}

${cta}

👇 O link com o artigo completo e todos os detalhes está no primeiro comentário deste post.

---
${hashtagsStr}`;

  const linkedinComment = commentTemplate.replace('{URL}', getUtmUrl(targetUrl, 'linkedin', slug));

  // 2. INSTAGRAM (FEED)
  const instagramCopy = 
`✦ ${article.title.toUpperCase()} ✦

${leadSummary}

📌 Principais tópicos para salvar e aplicar:

${formattedPoints}

💬 Quer conferir o conteúdo completo? Comente "LINK" aqui embaixo ou acesse o link disponível na bio ${handle ? `(${handle})` : ''}!
💾 Salve este post para consultar depois.

.
.
.
${hashtagsStr}`;

  const instagramComment = commentTemplate.replace('{URL}', getUtmUrl(targetUrl, 'instagram', slug));

  // 3. INSTAGRAM (STORIES)
  const storiesCopy = 
`NOVO ARTIGO NO AR 🚀

${article.title}

${leadSummary.slice(0, 140)}...

👉 Toque na figurinha de link para ler na íntegra:
${getUtmUrl(targetUrl, 'stories', slug)}`;

  // 4. X (TWITTER) - THREAD
  const twitterThread = [
    `1/3 🚨 ${article.title}

${leadSummary.length > 160 ? leadSummary.slice(0, 155) + '...' : leadSummary}`,

    `2/3 💡 Pontos centrais da análise:

${points.slice(0, 3).map(p => `• ${p}`).join('\n')}`,

    `3/3 🔗 Leia a matéria na íntegra com todos os dados:
${getUtmUrl(targetUrl, 'twitter', slug)}

${hashtags.slice(0, 3).join(' ')}`
  ];

  // 5. THREADS
  const threadsCopy = 
`${article.title}

${leadSummary}

Principais conclusões:
${points.slice(0, 3).map(p => `→ ${p}`).join('\n')}

🔗 Acesse a íntegra: ${getUtmUrl(targetUrl, 'threads', slug)}

Como você ou seu time lidam com essa questão hoje?`;

  // 6. FACEBOOK
  const facebookCopy = 
`${article.title}

${leadSummary}

Pontos em destaque:
${formattedPoints}

Acesse o artigo completo com todas as fontes e insights no link:
${getUtmUrl(targetUrl, 'facebook', slug)}

${hashtagsStr}`;

  return {
    meta: {
      generator: 'Algorithmic Dynamic v2',
      client: client.name || client.id,
      articleTitle: article.title,
      targetUrl,
      generatedAt: new Date().toISOString()
    },
    linkedin: {
      post: linkedinCopy,
      firstComment: linkedinComment,
      recommendedFormat: '16:9 ou 1:1'
    },
    instagram: {
      post: instagramCopy,
      firstComment: instagramComment,
      recommendedFormat: '4:5 (Feed) e 9:16 (Stories)'
    },
    stories: {
      post: storiesCopy,
      recommendedFormat: '9:16 (Vertical)'
    },
    twitter: {
      thread: twitterThread,
      recommendedFormat: '16:9 (Horizontal)'
    },
    threads: {
      post: threadsCopy,
      recommendedFormat: '1:1 ou 16:9'
    },
    facebook: {
      post: facebookCopy,
      recommendedFormat: '16:9 (Horizontal)'
    }
  };
}

// ---------------------------------------------------------------------------
// 2. GERADOR COM IA VIA GOOGLE GEMINI API
// ---------------------------------------------------------------------------
async function generateGeminiCopies(article, client, apiKey) {
  const prompt = `
Você é um estrategista sênior de Marketing de Conteúdo, Copywriting e Social Media.
Sua missão é criar o pacote definitivo de distribuição em redes sociais para o seguinte artigo já publicado.

=== DADOS DO ARTIGO ===
Título: "${article.title}"
Descrição/Resumo: "${article.description}"
Subtítulos/Tópicos: ${JSON.stringify(article.headings)}
Pontos/Bullets: ${JSON.stringify(article.bulletPoints)}
Trechos do Conteúdo:
"""
${article.fullTextSnippet || article.paragraphs.slice(0, 4).join('\n\n')}
"""
URL Original: "${article.canonicalUrl || article.url}"
Slug: "${article.slug}"

=== PERFIL DO CLIENTE ===
Nome da Marca: "${client.name || client.brandName}"
Handle/Arroba: "${client.brandHandle || ''}"
Tom de Voz: "${client.tone || 'Profissional, autoritário, estratégico e dinâmico'}"
Público-Alvo: "${client.targetAudience || 'Profissionais, gestores e tomadores de decisão'}"
Hashtags Padrão: ${JSON.stringify(client.defaultHashtags || [])}
Chamada para Ação (CTA): "${client.callToAction || ''}"
Template de 1º Comentário: "${client.commentTemplate || '👉 Leia o artigo completo aqui: {URL}'}"

=== DIRETRIZES DE REDAÇÃO POR REDE ===
1. LinkedIn: Post de alto impacto para executivos/profissionais. Gancho forte no início, desenvolvimento com bullets/insights, reflexão estratégica e aviso de que o link está no primeiro comentário. NÃO coloque links no corpo do post do LinkedIn.
2. Instagram (Feed): Formato carrossel/feed portrait. Gancho visual magnético, 3 a 4 lições em bullets escaneáveis, chamada para comentar para receber o link no direct ou visitar a bio, hashtags ao final.
3. Instagram (Stories): Texto curto e direto para figurinha de link com sticker/teaser.
4. X (Twitter): Thread de exatamente 3 tweets concisos, com gancho, síntese de lições e link com hashtags no último tweet.
5. Threads: Texto nativo, conversacional, sem jargões corporativos vazios, com gancho instigante e pergunta aberta para incentivar respostas.
6. Facebook: Post editorial completo, explicativo e persuasivo com link no corpo.
7. UTM URLs: Utilize {LINKEDIN_URL}, {INSTAGRAM_URL}, {STORIES_URL}, {TWITTER_URL}, {THREADS_URL}, {FACEBOOK_URL} nos devidos locais.

Retorne ESTRITAMENTE um objeto JSON válido, sem crases markdown adicionais ao redor se possível, com a seguinte estrutura:
{
  "linkedin": { "post": "...", "firstComment": "..." },
  "instagram": { "post": "...", "firstComment": "..." },
  "stories": { "post": "..." },
  "twitter": { "thread": ["tweet 1", "tweet 2", "tweet 3"] },
  "threads": { "post": "..." },
  "facebook": { "post": "..." }
}
`;

  const model = 'gemini-2.5-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.7
      }
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini API error (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!rawText) {
    throw new Error('Resposta vazia da API do Gemini');
  }

  const cleanedJson = rawText.replace(/^```json\s*/, '').replace(/\s*```$/, '').trim();
  const parsed = JSON.parse(cleanedJson);

  // Substituir tokens de URLs UTM
  const targetUrl = article.canonicalUrl || article.url;
  const slug = article.slug;
  const replaceUrls = (txt, src) => txt.replace(/\{[A-Z_]+_URL\}/g, getUtmUrl(targetUrl, src, slug));

  return {
    meta: {
      generator: `Google Gemini (${model})`,
      client: client.name || client.id,
      articleTitle: article.title,
      targetUrl,
      generatedAt: new Date().toISOString()
    },
    linkedin: {
      post: replaceUrls(parsed.linkedin.post, 'linkedin'),
      firstComment: replaceUrls(parsed.linkedin.firstComment, 'linkedin'),
      recommendedFormat: '16:9 ou 1:1'
    },
    instagram: {
      post: replaceUrls(parsed.instagram.post, 'instagram'),
      firstComment: replaceUrls(parsed.instagram.firstComment, 'instagram'),
      recommendedFormat: '4:5 (Feed) e 9:16 (Stories)'
    },
    stories: {
      post: replaceUrls(parsed.stories.post, 'stories'),
      recommendedFormat: '9:16 (Vertical)'
    },
    twitter: {
      thread: parsed.twitter.thread.map(t => replaceUrls(t, 'twitter')),
      recommendedFormat: '16:9 (Horizontal)'
    },
    threads: {
      post: replaceUrls(parsed.threads.post, 'threads'),
      recommendedFormat: '1:1 ou 16:9'
    },
    facebook: {
      post: replaceUrls(parsed.facebook.post, 'facebook'),
      recommendedFormat: '16:9 (Horizontal)'
    }
  };
}

// ---------------------------------------------------------------------------
// 3. ENTRADA PRINCIPAL
// ---------------------------------------------------------------------------
async function generateSocialCopies(article, client) {
  const geminiApiKey = process.env.GEMINI_API_KEY;

  if (geminiApiKey) {
    try {
      console.log(`   🤖 [IA] Gerando copies refinadas via Google Gemini API...`);
      return await generateGeminiCopies(article, client, geminiApiKey);
    } catch (err) {
      console.warn(`   ⚠️ [IA Aviso] Falha na Gemini API (${err.message}). Utilizando gerador dinâmico.`);
    }
  }

  // Fallback padrão algorítmico (dinâmico e contextual)
  return generateAlgorithmicCopies(article, client);
}

module.exports = { generateSocialCopies };
