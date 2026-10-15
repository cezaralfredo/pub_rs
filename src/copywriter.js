function generateSocialCopies(article, client) {
  const brand = client.brandName || 'Anauê Design';
  const hashtags = client.defaultHashtags || ['#MarketingDigital', '#Performance', '#Growth'];
  const hashtagsStr = hashtags.join(' ');
  const targetUrl = article.canonicalUrl || article.url;

  // Extrair pontos principais
  const points = article.bulletPoints.length >= 3 
    ? article.bulletPoints.slice(0, 4) 
    : article.headings.slice(0, 4);

  const formattedPoints = points.map((p, idx) => {
    const clean = p.replace(/^[-*•\d.]+\s*/, '').replace(/:$/, '');
    const icons = ['🔹', '⚡', '💡', '📊'];
    return `${icons[idx % icons.length]} ${clean}`;
  }).join('\n');

  // UTM tracking URLs
  const getUtmUrl = (source) => {
    const url = new URL(targetUrl);
    url.searchParams.set('utm_source', source);
    url.searchParams.set('utm_medium', 'social');
    url.searchParams.set('utm_campaign', article.slug);
    return url.toString();
  };

  // 1. LINKEDIN
  const linkedinCopy = 
`${article.title}

Se a sua empresa ainda mede o sucesso de campanhas digitais apenas por métricas como CPC ou o ROAS isolado de painéis, é provável que esteja enfrentando um dilema comum: relatórios bonitos na agência, mas pouca margem no caixa.

Com as restrições brutais de privacidade (Apple ATT, Safari ITP e bloqueadores nativos), depender apenas de pixels no navegador faz com que até 35% a 40% das conversões reais se tornem invisíveis.

Para onde o mercado de alta performance está migrando:

${formattedPoints}

A verdade é direta: quem depende exclusivamente de audiência alugada fica à mercê das mudanças de leilão das Big Techs. Quem constrói funis orientados a First-Party Data e atribuição real domina o CAC no longo prazo.

${client.callToAction || 'Como a sua organização está lidando com a mensuração de resultados neste cenário?'}

👇 O link completo com todos os dados técnicos e o estudo de caso prático está no primeiro comentário deste post.

---
${hashtagsStr}`;

  const linkedinComment = (client.commentTemplate || '👉 Acesse o artigo completo e todos os dados aqui: {URL}')
    .replace('{URL}', getUtmUrl('linkedin'));


  // 2. INSTAGRAM (FEED)
  const instagramCopy = 
`✦ ${article.title.toUpperCase()} ✦

Por que tantas empresas comemoram dashboards cheios de cliques, mas sentem o Custo de Aquisição (CAC) subir mês após mês? 🤔

O fim dos cookies de terceiros e a cegueira algorítmica exigiram uma mudança radical na forma de comprar mídia e estruturar funis digitais.

Principais lições práticas que você precisa aplicar:

${formattedPoints}

📌 Salve este post para consultar com seu time de marketing e tecnologia!

💬 Quer se aprofundar na análise completa? Comente "QUERO" aqui embaixo que enviamos o link direto no seu direct, ou acesse o link na nossa bio.

.
.
.
${hashtagsStr}`;

  const instagramComment = (client.commentTemplate || '👉 Leia a matéria na íntegra: {URL}')
    .replace('{URL}', getUtmUrl('instagram'));


  // 3. INSTAGRAM (STORIES)
  const storiesCopy = 
`NOVO ARTIGO NO AR 🚀

${article.title}

Como construir funis de alta performance e fugir das métricas de vaidade.

👉 Toque na figurinha de link para ler na íntegra:
${getUtmUrl('stories')}`;


  // 4. X (TWITTER) - THREAD
  const twitterThread = [
    `1/3 🚨 ${article.title}

Você ainda comemora ROAS de 10x no gerenciador de anúncios? Atenção: com a perda de cookies e bloqueadores, até 40% dos dados de conversão estão sendo ignorados ou contados duas vezes.`,

    `2/3 💡 Para onde as operações de alta performance estão indo:

${points.slice(0, 3).map(p => `• ${p.replace(/^[-*•\d.]+\s*/, '')}`).join('\n')}

Mudar para First-Party Data e Server-Side Tracking não é luxo, é sobrevivência.`,

    `3/3 🔗 Confira a análise completa com estudo de caso de redução de 28% no CAC no blog:
${getUtmUrl('twitter')}

${hashtags.slice(0, 3).join(' ')}`
  ];


  // 5. THREADS
  const threadsCopy = 
`Mídia paga além da vaidade: a maioria dos painéis de anúncios mostra números inflados porque Google e Meta disputam o crédito pela mesma venda.

O verdadeiro indicador de saúde financeira não é o ROAS de tela, é o MER (Marketing Efficiency Ratio) somado ao First-Party Data.

Acabamos de publicar uma matéria aprofundada explicando como reverter esse cenário com arquitetura de dados e rastreamento server-side:

🔗 ${getUtmUrl('threads')}

Qual métrica seu time mais acompanha hoje?`;


  // 6. FACEBOOK
  const facebookCopy = 
`${article.title}

Entenda como estruturar campanhas de tráfego pago orientadas a lucro líquido, superando as limitações do fim dos cookies com First-Party Data, rastreamento via servidor e modelos modernos de atribuição.

Destaques da matéria:
${formattedPoints}

Leia o artigo completo no link:
${getUtmUrl('facebook')}

${hashtagsStr}`;

  return {
    meta: {
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

module.exports = { generateSocialCopies };
