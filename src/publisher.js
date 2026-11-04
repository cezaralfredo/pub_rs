const fs = require('fs');
const path = require('path');
const { buildOAuth1Header } = require('./security/oauth1');

/**
 * Módulo de Disparo e Publicação Multicanal Direta
 * Gerencia o envio das copies e mídias para as APIs das redes sociais configuradas no perfil do cliente.
 */

/**
 * Dispara webhook customizado (n8n, Make, Metricool, Zapier)
 */
async function publishToWebhook(url, payload) {
  if (!url || !url.startsWith('http')) {
    return { status: 'skipped', message: 'URL de webhook não configurada.' };
  }

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'pub_rs-Publisher/2.0'
      },
      body: JSON.stringify(payload)
    });

    const responseText = await res.text();
    let responseData;
    try { responseData = JSON.parse(responseText); } catch { responseData = responseText; }

    return {
      status: res.ok ? 'success' : 'error',
      statusCode: res.status,
      ok: res.ok,
      response: responseData
    };
  } catch (err) {
    return {
      status: 'error',
      error: err.message
    };
  }
}

/**
 * Consulta todos os canais da organização no Buffer via GraphQL
 */
async function getBufferOrganizationChannels(token) {
  try {
    const r1 = await fetch('https://api.buffer.com', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'query { account { organizations { id } } }' })
    });
    const d1 = await r1.json();
    const orgId = d1?.data?.account?.organizations?.[0]?.id;
    if (!orgId) return [];

    const r2 = await fetch('https://api.buffer.com', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: 'query GetChannels($input: ChannelsInput!) { channels(input: $input) { id name service type } }',
        variables: { input: { organizationId: orgId } }
      })
    });
    const d2 = await r2.json();
    return d2?.data?.channels || [];
  } catch (err) {
    return [];
  }
}

/**
 * Consulta informações do canal no Buffer via GraphQL
 */
async function getBufferChannel(channelId, token) {
  try {
    const res = await fetch('https://api.buffer.com', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        query: `query GetChannel($input: ChannelInput!) {
          channel(input: $input) {
            id
            service
            name
            type
          }
        }`,
        variables: { input: { id: channelId } }
      })
    });
    if (res.ok) {
      const data = await res.json();
      return data?.data?.channel || null;
    }
  } catch (err) {
    console.warn(`[Buffer GraphQL] Não foi possível obter dados do canal ${channelId}:`, err.message);
  }
  return null;
}

/**
 * Publicação via Buffer API (Agendamento / Publicação direta multicanal)
 * Suporta a API GraphQL Moderna Oficial (https://api.buffer.com)
 */
async function publishToBuffer(config, copies, packageId, options = {}) {
  const { accessToken, profileIds, now = true } = config;
  const { images = [], article = {}, outputDir, video = null } = options;
  const token = (accessToken || '').trim();

  let idList = Array.isArray(profileIds)
    ? profileIds
    : (typeof profileIds === 'string' ? profileIds.split(',').map(s => s.trim()).filter(Boolean) : []);

  if (!token) {
    return { status: 'skipped', message: 'Access Token do Buffer ausente.' };
  }

  // Se nenhum profileId foi informado, busca dinamicamente todos os canais ativos da conta
  let activeOrgChannels = null;
  if (idList.length === 0) {
    activeOrgChannels = await getBufferOrganizationChannels(token);
    idList = activeOrgChannels.map(c => c.id);
  }

  if (idList.length === 0) {
    return { status: 'skipped', message: 'Nenhum canal ativo foi informado ou encontrado no Buffer.' };
  }

  // Tenta localizar imagens e vídeos do pacote para canais visuais (Instagram, LinkedIn, Twitter)
  const baseUrl = process.env.BASE_URL || 'https://social360.anauedesign.com.br';
  let instagramImageUrl = null;
  let genericImageUrl = null;
  let packageVideoUrl = null;

  if (video && video.url) {
    packageVideoUrl = video.url.startsWith('http') ? video.url : `${baseUrl}${video.url}`;
  }

  if (packageId) {
    const imagesDir = outputDir && fs.existsSync(path.join(outputDir, 'images'))
      ? path.join(outputDir, 'images')
      : (outputDir && fs.existsSync(outputDir) ? outputDir : null);

    if (imagesDir && fs.existsSync(imagesDir)) {
      // Localiza vídeos anexados
      if (!packageVideoUrl) {
        const videoFiles = ['video_post.mp4', 'video_post.mov', 'video_post.webm'];
        for (const vf of videoFiles) {
          if (fs.existsSync(path.join(imagesDir, vf))) {
            packageVideoUrl = `${baseUrl}/api/media/${packageId}/${vf}`;
            break;
          }
        }
      }

      if (fs.existsSync(path.join(imagesDir, 'instagram_feed_portrait_4x5.jpg'))) {
        instagramImageUrl = `${baseUrl}/api/media/${packageId}/instagram_feed_portrait_4x5.jpg`;
      } else if (fs.existsSync(path.join(imagesDir, 'instagram_threads_square_1x1.jpg'))) {
        instagramImageUrl = `${baseUrl}/api/media/${packageId}/instagram_threads_square_1x1.jpg`;
      }

      if (fs.existsSync(path.join(imagesDir, 'linkedin_twitter_facebook_16x9.jpg'))) {
        genericImageUrl = `${baseUrl}/api/media/${packageId}/linkedin_twitter_facebook_16x9.jpg`;
      }
    }
  }

  if (!instagramImageUrl && !genericImageUrl && Array.isArray(images) && images.length > 0) {
    const imgObj = images.find(img => img.url || img.src);
    if (imgObj) {
      genericImageUrl = imgObj.url || imgObj.src;
      instagramImageUrl = imgObj.url || imgObj.src;
    }
  }

  if (packageVideoUrl) {
    console.log(`🎬 [Buffer] Pacote possui vídeo anexado: ${packageVideoUrl}`);
  }

  const results = [];
  const mutation = `mutation CreatePost($input: CreatePostInput!) {
    createPost(input: $input) {
      ... on PostActionSuccess {
        post { id status text }
      }
      ... on MutationError {
        message
      }
    }
  }`;

  for (const profileId of idList) {
    // 1. Identifica os metadados do canal (twitter, googlebusiness, linkedin, instagram, facebook, etc.)
    const channelInfo = await getBufferChannel(profileId, token);

    // Se o canal não existe no Buffer (ex: ID antigo removido/desconectado)
    if (!channelInfo) {
      if (!activeOrgChannels) {
        activeOrgChannels = await getBufferOrganizationChannels(token);
      }
      const activeSummary = activeOrgChannels.length > 0
        ? `Canais ativos encontrados na sua conta: ${activeOrgChannels.map(c => `${c.name} (${c.service}): ${c.id}`).join(', ')}`
        : 'Nenhum canal ativo encontrado nesta conta.';

      results.push({
        profileId,
        channelName: profileId,
        service: 'desconhecido',
        status: 'error',
        api: 'graphql',
        error: `Canal ${profileId} não foi encontrado no Buffer (pode ter sido desconectado ou substituído). ${activeSummary}`
      });
      continue;
    }

    const service = (channelInfo.service || '').toLowerCase();
    const channelName = channelInfo.name || profileId;

    // 2. Proteção Especial para Instagram: Instagram NÃO aceita publicações de texto puro (exige imagem ou vídeo)
    const postImage = (service === 'instagram') ? (instagramImageUrl || genericImageUrl) : genericImageUrl;
    const hasMedia = Boolean(packageVideoUrl || postImage);
    if (service === 'instagram' && !hasMedia) {
      console.warn(`[Buffer] Canal Instagram ${channelName} ignorado: pacote sem imagem ou vídeo anexado.`);
      results.push({
        profileId,
        channelName,
        service,
        status: 'skipped',
        api: 'graphql',
        error: 'O Instagram exige imagem ou vídeo obrigatório. Como este pacote não possui mídia anexada, a publicação no Instagram foi ignorada.'
      });
      continue;
    }

    // 3. Seleciona e formata a copy mais contextualizada para a rede social do canal
    let postText = '';
    if (service === 'twitter') {
      // Para o Twitter/X: formato padrão direto (mídia + sobre ela o título do artigo, sem carrossel/threads)
      postText = (article?.title || copies.twitter?.post || 'Novo artigo publicado').trim();
      // Twitter / X limita tweets estritamente a 280 caracteres
      if (postText.length > 280) {
        postText = postText.slice(0, 277) + '...';
      }
    } else if (service === 'instagram') {
      postText = copies.instagram?.post || copies.facebook?.post || copies.linkedin?.post;
      if (article?.title && postText && !postText.toLowerCase().includes(article.title.toLowerCase().slice(0, 30))) {
        postText = `✦ ${article.title.toUpperCase()} ✦\n\n${postText}`;
      }
    } else if (service === 'googlebusiness') {
      postText = copies.facebook?.post || copies.linkedin?.post || copies.twitter?.post;
      if (article?.title && postText && !postText.toLowerCase().includes(article.title.toLowerCase().slice(0, 30))) {
        postText = `${article.title}\n\n${postText}`;
      }
    } else if (service === 'linkedin') {
      postText = copies.linkedin?.post || copies.facebook?.post || copies.twitter?.post;
      if (article?.title && postText && !postText.toLowerCase().includes(article.title.toLowerCase().slice(0, 30))) {
        postText = `${article.title}\n\n${postText}`;
      }
    }

    if (!postText || typeof postText !== 'string' || !postText.trim()) {
      postText = copies.linkedin?.post || copies.twitter?.post || copies.threads?.post || 'Novo artigo publicado';
    }
    postText = postText.trim();

    // 4. Monta o input GraphQL em estrita conformidade com o schema do Buffer
    const input = {
      channelId: profileId,
      text: postText,
      schedulingType: 'automatic',
      mode: now ? 'shareNow' : 'addToQueue',
      needsApproval: false
    };

    // Anexa vídeo ou imagem se houver
    if (packageVideoUrl) {
      input.assets = [
        {
          video: {
            url: packageVideoUrl
          }
        }
      ];
    } else if (postImage) {
      input.assets = [
        {
          image: {
            url: postImage
          }
        }
      ];
    }

    // Google Business Profile exige a especificação do tipo no metadata
    if (service === 'googlebusiness') {
      input.metadata = { google: { type: 'whats_new' } };
    }

    // Instagram exige metadata com type (reel para vídeo ou post para imagem) e shouldShareToFeed
    if (service === 'instagram') {
      input.metadata = {
        instagram: {
          type: packageVideoUrl ? 'reel' : 'post',
          shouldShareToFeed: true
        }
      };
    }

    let success = false;
    let postData = null;
    let errorMessage = null;

    try {
      let resGql = await fetch('https://api.buffer.com', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          query: mutation,
          variables: { input }
        })
      });

      let gqlData = await resGql.json().catch(() => null);
      let postResult = gqlData?.data?.createPost;

      // Fallback 1: Se falhar por ausência de horário configurado na fila com 'addToQueue', tenta via 'shareNow'
      if (postResult?.message && postResult.message.includes('No posting schedule configured')) {
        console.warn(`[Buffer GraphQL] Canal ${channelName} sem horário agendado. Retentando via shareNow...`);
        input.mode = 'shareNow';
        resGql = await fetch('https://api.buffer.com', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            query: mutation,
            variables: { input }
          })
        });
        gqlData = await resGql.json().catch(() => null);
        postResult = gqlData?.data?.createPost;
      }

      // Fallback 2: Se falhar por tipo do Google Business
      if (postResult?.message && postResult.message.includes('Google Business Profiles posts require a type')) {
        console.warn(`[Buffer GraphQL] Injetando metadata whats_new para Google Business (${channelName})...`);
        input.metadata = { google: { type: 'whats_new' } };
        resGql = await fetch('https://api.buffer.com', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            query: mutation,
            variables: { input }
          })
        });
        gqlData = await resGql.json().catch(() => null);
        postResult = gqlData?.data?.createPost;
      }

      if (postResult?.post?.id) {
        success = true;
        postData = postResult.post;
      } else {
        errorMessage = postResult?.message || gqlData?.errors?.[0]?.message || 'Resposta não reconhecida do Buffer GraphQL';
      }
    } catch (errGql) {
      errorMessage = errGql.message;
    }

    if (success) {
      results.push({
        profileId,
        channelName,
        service: service || 'buffer',
        status: 'success',
        api: 'graphql',
        data: postData,
        postId: postData.id,
        postStatus: postData.status
      });
    } else {
      results.push({
        profileId,
        channelName,
        service: service || 'buffer',
        status: 'error',
        api: 'graphql',
        error: errorMessage
      });
    }
  }

  const successCount = results.filter(r => r.status === 'success').length;
  const failCount = results.filter(r => r.status === 'error').length;
  const skippedCount = results.filter(r => r.status === 'skipped').length;

  if (successCount === 0 && failCount > 0) {
    const combinedErrors = results.filter(r => r.status === 'error').map(r => `${r.channelName}: ${r.error}`).join(' | ');
    return {
      status: 'error',
      message: `Falha ao publicar no Buffer: ${combinedErrors}`,
      error: combinedErrors,
      results
    };
  }

  if (successCount === 0 && failCount === 0 && skippedCount > 0) {
    return {
      status: 'skipped',
      message: 'Todos os canais do Buffer foram ignorados (ex: Instagram sem imagem anexada).',
      results
    };
  }

  const isPartial = failCount > 0;
  const summaryMsg = isPartial
    ? `${successCount} canal(is) publicado(s) com sucesso, mas ${failCount} com falha: ${results.filter(r => r.status === 'error').map(r => `${r.channelName}: ${r.error}`).join(', ')}`
    : `${successCount} canal(is) publicado(s) com sucesso via Buffer API.`;

  return {
    status: 'success',
    message: summaryMsg,
    successCount,
    failCount,
    results
  };
}

/**
 * Publicação direta no LinkedIn via REST API v2
 * Endpoint: POST https://api.linkedin.com/v2/ugcPosts
 */
async function publishToLinkedIn(config, copies, article = {}) {
  const { accessToken, authorUrn } = config;

  if (!accessToken || !authorUrn) {
    return { status: 'skipped', message: 'Credenciais do LinkedIn não configuradas (accessToken ou authorUrn).' };
  }

  try {
    let postText = (typeof copies?.linkedin === 'string' ? copies.linkedin : copies?.linkedin?.post) || '';

    // Fallbacks resilientes se a copy específica do LinkedIn estiver vazia
    if (!postText.trim()) {
      postText = (typeof copies?.facebook === 'string' ? copies.facebook : copies?.facebook?.post) || '';
    }
    if (!postText.trim()) {
      postText = (typeof copies?.threads === 'string' ? copies.threads : copies?.threads?.post) || '';
    }
    if (!postText.trim()) {
      postText = (typeof copies?.instagram === 'string' ? copies.instagram : copies?.instagram?.post) || '';
    }
    if (!postText.trim() && article) {
      const title = article.title || 'Artigo Estratégico';
      const desc = article.description || article.content || 'Confira a análise completa e as principais diretrizes.';
      const url = article.canonicalUrl || article.url || '';
      postText = `${title}\n\n${desc}${url ? `\n\n👉 Acesse a matéria completa: ${url}` : ''}`;
    }

    postText = postText.trim();
    if (!postText) throw new Error('Copy do LinkedIn não encontrada no pacote.');

    const payload = {
      author: authorUrn, // ex: urn:li:organization:123456 ou urn:li:person:abcdef
      lifecycleState: 'PUBLISHED',
      specificContent: {
        'com.linkedin.ugc.ShareContent': {
          shareCommentary: { text: postText },
          shareMediaCategory: 'NONE'
        }
      },
      visibility: {
        'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC'
      }
    };

    const res = await fetch('https://api.linkedin.com/v2/ugcPosts', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'X-Restli-Protocol-Version': '2.0.0'
      },
      body: JSON.stringify(payload)
    });

    const data = await res.json();

    let errorDetail = res.ok ? null : (data.message || `LinkedIn retornou HTTP ${res.status}`);

    // Tratamento especializado e explicativo para erro 403 / Access Denied no campo /author
    if (!res.ok && res.status === 403 && (errorDetail.includes('/author') || errorDetail.includes('Data Processing Exception') || errorDetail.includes('ACCESS_DENIED'))) {
      if (authorUrn.includes(':organization:')) {
        errorDetail = 'Permissão Insuficiente (403 no /author): O token do LinkedIn não tem autorização para publicar em nome da Company Page (empresa). O LinkedIn exige formalmente a aprovação do produto "Community Management API" (escopo w_organization_social) para publicação direta em páginas empresariais. Alternativa recomendada: conecte sua Company Page do LinkedIn via Buffer API (onde a publicação é imediata e sem burocracia de desenvolvedor) ou utilize um URN de perfil pessoal (urn:li:person:...).';
      } else {
        errorDetail = 'Permissão Insuficiente (403 no /author): O URN de autor informado não corresponde ao usuário autenticado por este token do LinkedIn.';
      }
    }

    return {
      status: res.ok ? 'success' : 'error',
      statusCode: res.status,
      postId: data.id,
      postUrl: data.id ? `https://www.linkedin.com/feed/update/${data.id}` : null,
      error: errorDetail,
      response: data
    };
  } catch (err) {
    return { status: 'error', error: err.message };
  }
}

/**
 * Publicação direta no X (Twitter) via API v2
 * Suporta OAuth 1.0a User Context (API Key + Secret e Access Token + Secret) ou OAuth 2.0 User Token
 * Endpoint: POST https://api.twitter.com/2/tweets
 */
async function publishToTwitter(config, copies, article = {}) {
  const { bearerToken, accessToken, apiKey, apiSecret, accessTokenSecret } = config;
  const tokenSecret = accessTokenSecret || config.accessSecret;
  const hasOAuth1 = Boolean(apiKey && apiSecret && accessToken && tokenSecret);
  const token = bearerToken || accessToken;

  if (!hasOAuth1 && !token) {
    return { status: 'skipped', message: 'Credenciais do X/Twitter não configuradas (informe as 4 chaves OAuth 1.0a ou Bearer Token).' };
  }

  try {
    // Formato padrão simples: somente a mídia e sobre ela o título do artigo (sem carrossel / thread)
    let postText = (article?.title || copies.twitter?.post || 'Novo artigo publicado').trim();
    if (postText.length > 280) {
      postText = postText.slice(0, 277) + '...';
    }

    const payload = { text: postText };

    let authHeader;
    if (hasOAuth1) {
      authHeader = buildOAuth1Header({
        method: 'POST',
        url: 'https://api.twitter.com/2/tweets',
        apiKey,
        apiSecret,
        accessToken,
        accessTokenSecret: tokenSecret
      });
    } else {
      authHeader = `Bearer ${token}`;
    }

    const res = await fetch('https://api.twitter.com/2/tweets', {
      method: 'POST',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(`Erro Twitter API (${res.status}): ${JSON.stringify(data)}`);
    }

    const tweetId = data?.data?.id;

    return {
      status: 'success',
      tweetsCount: 1,
      firstTweetUrl: tweetId ? `https://twitter.com/i/status/${tweetId}` : null,
      tweet: data?.data
    };
  } catch (err) {
    return { status: 'error', error: err.message };
  }
}

/**
 * Publicação via Telegram Bot API
 * Endpoint: POST https://api.telegram.org/bot<token>/sendMessage
 */
async function publishToTelegram(config, copies, article) {
  const { botToken, chatId } = config;

  if (!botToken || !chatId) {
    return { status: 'skipped', message: 'Credenciais do Telegram não configuradas (botToken ou chatId ausente).' };
  }

  try {
    const title = article?.title || 'Novo artigo publicado';
    const textPost = copies?.linkedin?.post || copies?.twitter?.post || title;
    const url = article?.canonicalUrl || article?.url || '';

    const messageHtml = `<b>📢 ${title}</b>\n\n${textPost.slice(0, 3800)}${url ? `\n\n👉 <a href="${url}">Acesse a matéria completa</a>` : ''}`;

    const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: messageHtml,
        parse_mode: 'HTML',
        disable_web_page_preview: false
      })
    });

    const data = await res.json();
    return {
      status: res.ok ? 'success' : 'error',
      statusCode: res.status,
      messageId: data?.result?.message_id,
      response: data
    };
  } catch (err) {
    return { status: 'error', error: err.message };
  }
}

/**
 * Publicação via Meta Graph API (Facebook Page & Instagram)
 */
async function publishToMeta(config, copies, article) {
  const { pageAccessToken, pageId, instagramAccountId } = config;

  if (!pageAccessToken) {
    return { status: 'skipped', message: 'Token de acesso da Meta (pageAccessToken) não configurado.' };
  }

  const results = {};

  // 1. Facebook Page Post
  if (pageId) {
    try {
      const message = copies?.facebook?.post || copies?.linkedin?.post || article?.title;
      const url = article?.canonicalUrl || article?.url;

      const res = await fetch(`https://graph.facebook.com/v19.0/${pageId}/feed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message,
          link: url,
          access_token: pageAccessToken
        })
      });

      const data = await res.json();
      results.facebook = {
        status: res.ok ? 'success' : 'error',
        postId: data?.id,
        response: data
      };
    } catch (err) {
      results.facebook = { status: 'error', error: err.message };
    }
  }

  return { status: 'completed', results };
}

/**
 * Validação / Teste de Conexão para Canais Individuais
 */
async function testChannelConnection(channelName, channelConfig) {
  const ch = (channelName || '').toLowerCase();

  switch (ch) {
    case 'webhook': {
      const url = channelConfig?.url;
      if (!url || !url.startsWith('http')) {
        return { ok: false, error: 'URL do Webhook não configurada ou inválida.' };
      }
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'User-Agent': 'pub_rs-Test/2.0' },
          body: JSON.stringify({
            test: true,
            ping: 'pub_rs-connection-check',
            timestamp: new Date().toISOString()
          })
        });
        return {
          ok: res.ok,
          status: res.status,
          message: res.ok ? `Webhook respondeu com HTTP ${res.status} (OK).` : `Webhook retornou HTTP ${res.status}.`
        };
      } catch (err) {
        return { ok: false, error: `Falha ao alcançar Webhook: ${err.message}` };
      }
    }

    case 'telegram': {
      const token = channelConfig?.botToken;
      if (!token) return { ok: false, error: 'Bot Token do Telegram ausente.' };
      try {
        const res = await fetch(`https://api.telegram.org/bot${token}/getMe`);
        const data = await res.json();
        if (data.ok) {
          return {
            ok: true,
            message: `Bot conectado: @${data.result.username} (${data.result.first_name}).`
          };
        }
        return { ok: false, error: data.description || 'Token inválido do Telegram.' };
      } catch (err) {
        return { ok: false, error: err.message };
      }
    }

    case 'buffer': {
      const token = (channelConfig?.accessToken || '').trim();
      if (!token) return { ok: false, error: 'Access Token / API Key do Buffer ausente.' };

      // 1. Tenta validar no novo Buffer GraphQL API Oficial (https://api.buffer.com)
      try {
        const resGql = await fetch('https://api.buffer.com', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            query: 'query { account { id email organizations { id name channelCount } } }'
          })
        });

        const dataGql = await resGql.json().catch(() => null);

        if (resGql.ok && dataGql?.data?.account) {
          const email = dataGql.data.account.email || dataGql.data.account.id;
          const orgId = dataGql.data.account.organizations?.[0]?.id;
          let channelsList = [];

          if (orgId) {
            try {
              const resCh = await fetch('https://api.buffer.com', {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${token}`,
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                  query: 'query GetChannels($input: ChannelsInput!) { channels(input: $input) { id name service type } }',
                  variables: { input: { organizationId: orgId } }
                })
              });
              if (resCh.ok) {
                const dataCh = await resCh.json();
                channelsList = dataCh?.data?.channels || [];
              }
            } catch {}
          }

          let msg = `Buffer conectado com sucesso (Conta: ${email})!`;
          if (channelsList.length > 0) {
            msg += ` Canais ativos encontrados (${channelsList.length}): ${channelsList.map(c => `${c.name} (${c.service}): ${c.id}`).join(' | ')}`;
          }

          return {
            ok: true,
            message: msg,
            channels: channelsList
          };
        }

        if (dataGql?.errors && dataGql.errors.length > 0) {
          const errMsg = dataGql.errors[0]?.message || '';
          if (errMsg.toLowerCase().includes('token') || errMsg.toLowerCase().includes('not valid')) {
            // Continua para o fallback antes de retornar erro
          }
        }
      } catch (errGql) {
        // Ignora erro e tenta rota legada
      }

      // 2. Fallback para rota REST legada (https://api.bufferapp.com/1/user.json)
      try {
        const res = await fetch(`https://api.bufferapp.com/1/user.json?access_token=${token}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json().catch(() => null);

        if (res.ok && data) {
          return {
            ok: true,
            message: `Buffer conectado com sucesso (Usuário: ${data.name || data.id || 'OK'}).`
          };
        }

        if (res.status === 401) {
          return {
            ok: false,
            error: 'Erro 401 (Não Autorizado): A chave do Buffer é inválida ou expirou. Gere sua API Key oficial em publish.buffer.com/settings/api (Menu Settings > API) e verifique se copiou o token completo sem espaços.'
          };
        }

        return { ok: false, error: data?.message || `Buffer retornou HTTP ${res.status}` };
      } catch (err) {
        return { ok: false, error: err.message };
      }
    }

    case 'linkedin': {
      const token = channelConfig?.accessToken;
      const urn = channelConfig?.authorUrn;
      if (!token || !urn) {
        return { ok: false, error: 'Credenciais incompletas: informe Access Token e Author URN.' };
      }
      try {
        const res = await fetch('https://api.linkedin.com/v2/userinfo', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          return { ok: true, message: `LinkedIn conectado: ${data.name || urn}` };
        }
        if (res.status === 403) {
          if (urn.includes(':organization:')) {
            return {
              ok: false,
              error: 'Atenção LinkedIn (HTTP 403): O token não possui permissão para publicar em Company Page. A API direta do LinkedIn exige o produto "Community Management API" (escopo w_organization_social) aprovado. Para Company Pages, recomendamos publicar através da integração com o Buffer (sem burocracia) ou utilizar um URN de perfil pessoal (urn:li:person:...).'
            };
          }
          return {
            ok: false,
            error: 'LinkedIn retornou HTTP 403: O token não possui os escopos necessários (ex: w_member_social ou openid/profile).'
          };
        }
        if (res.status === 401) {
          return {
            ok: false,
            error: 'Erro 401 (Não Autorizado): Token do LinkedIn expirado ou inválido. Gere um novo token no LinkedIn Developers.'
          };
        }
        return { ok: false, error: `LinkedIn retornou HTTP ${res.status}.` };
      } catch (err) {
        return { ok: false, error: err.message };
      }
    }

    case 'twitter': {
      const { apiKey, apiSecret, accessToken, accessTokenSecret, bearerToken } = channelConfig || {};
      const tokenSecret = accessTokenSecret || channelConfig?.accessSecret;
      const hasOAuth1 = Boolean(apiKey && apiSecret && accessToken && tokenSecret);
      const token = bearerToken || accessToken;

      if (!hasOAuth1 && !token) {
        return {
          ok: false,
          error: 'Credenciais do X/Twitter ausentes. Informe as chaves OAuth 1.0a (API Key + Secret e Access Token + Secret) ou um OAuth 2.0 User Token.'
        };
      }

      try {
        let authHeader;
        if (hasOAuth1) {
          authHeader = buildOAuth1Header({
            method: 'GET',
            url: 'https://api.twitter.com/2/users/me',
            apiKey,
            apiSecret,
            accessToken,
            accessTokenSecret: tokenSecret
          });
        } else {
          authHeader = `Bearer ${token}`;
        }

        const res = await fetch('https://api.twitter.com/2/users/me', {
          headers: { 'Authorization': authHeader }
        });

        const data = await res.json().catch(() => null);

        if (res.ok) {
          return { ok: true, message: `X (Twitter) conectado: @${data?.data?.username || 'OK'}` };
        }

        if (res.status === 403) {
          const detail = (data?.detail || data?.title || '');
          const detailLower = detail.toLowerCase();
          if (detailLower.includes('application-only') || detailLower.includes('unsupported authentication') || detailLower.includes('oauth 2.0 application-only')) {
            return {
              ok: false,
              error: 'Erro 403 (Unsupported Authentication): O Bearer Token informado é de Aplicação (App-Only). O X não permite consultar perfil nem postar tweets com token de aplicativo. Você precisa preencher as 4 chaves OAuth 1.0a (API Key + Secret e Access Token + Secret) com permissão "Read and write" no portal do X, ou conectar via Buffer.'
            };
          }
          return {
            ok: false,
            error: `X (Twitter) retornou HTTP 403: ${detail || 'Permissão insuficiente. Certifique-se de que o App possui permissão "Read and Write" em Settings e suas chaves foram regeneradas.'}`
          };
        }

        if (res.status === 401) {
          return {
            ok: false,
            error: 'Erro 401 (Não Autorizado): Chaves ou tokens inválidos do X. Verifique se foram copiados corretamente.'
          };
        }

        return {
          ok: false,
          error: `X (Twitter) API retornou HTTP ${res.status}: ${data?.detail || data?.title || 'Falha na autenticação'}`
        };
      } catch (err) {
        return { ok: false, error: err.message };
      }
    }

    case 'meta': {
      const token = channelConfig?.pageAccessToken;
      if (!token) return { ok: false, error: 'Page Access Token da Meta ausente.' };
      try {
        const res = await fetch(`https://graph.facebook.com/v19.0/me?access_token=${token}`);
        if (res.ok) {
          const data = await res.json();
          return { ok: true, message: `Meta conectada: ${data.name || data.id}` };
        }
        return { ok: false, error: `Meta API retornou HTTP ${res.status}.` };
      } catch (err) {
        return { ok: false, error: err.message };
      }
    }

    default:
      return { ok: false, error: `Canal não reconhecido para teste: "${channelName}"` };
  }
}

/**
 * Orquestrador central de publicação para todos os canais ativados no cliente.
 */
async function dispatchToClientChannels({ client, copies, images, article, packageId, outputDir, targetChannels, video = null }) {
  const channels = client.channels || {};
  const isChannelAllowed = (ch) => !targetChannels || targetChannels.length === 0 || targetChannels.includes(ch);

  const dispatchResults = {
    packageId,
    dispatchedAt: new Date().toISOString(),
    channels: {}
  };

  // 1. Webhook Principal (n8n / Make / Metricool)
  const webhookUrl = channels.webhook?.url || client.webhookUrl || process.env.DEFAULT_WEBHOOK_URL;
  if (isChannelAllowed('webhook') && channels.webhook?.enabled !== false && webhookUrl) {
    console.log(`\n🚀 [DISPATCH] Enviando para Webhook...`);
    dispatchResults.channels.webhook = await publishToWebhook(webhookUrl, {
      client: client.id,
      brand: client.brandName,
      article,
      copies,
      images,
      packageId,
      video
    });
  }

  // 2. Buffer API
  if (isChannelAllowed('buffer') && channels.buffer?.enabled && channels.buffer?.accessToken) {
    console.log(`🚀 [DISPATCH] Agendando via Buffer API...`);
    dispatchResults.channels.buffer = await publishToBuffer(channels.buffer, copies, packageId, { images, article, outputDir, video });
  }

  // 3. LinkedIn Direto
  if (isChannelAllowed('linkedin') && channels.linkedin?.enabled && channels.linkedin?.accessToken) {
    console.log(`🚀 [DISPATCH] Publicando diretamente no LinkedIn...`);
    dispatchResults.channels.linkedin = await publishToLinkedIn(channels.linkedin, copies, article);
  }

  // 4. X (Twitter) Direto
  if (isChannelAllowed('twitter') && channels.twitter?.enabled && (channels.twitter?.bearerToken || channels.twitter?.accessToken)) {
    console.log(`🚀 [DISPATCH] Publicando na API do X (Twitter)...`);
    dispatchResults.channels.twitter = await publishToTwitter(channels.twitter, copies, article);
  }

  // 5. Telegram
  if (isChannelAllowed('telegram') && channels.telegram?.enabled && channels.telegram?.botToken) {
    console.log(`🚀 [DISPATCH] Publicando no Telegram...`);
    dispatchResults.channels.telegram = await publishToTelegram(channels.telegram, copies, article);
  }

  // 6. Meta (Facebook / Instagram)
  if (isChannelAllowed('meta') && channels.meta?.enabled && channels.meta?.pageAccessToken) {
    console.log(`🚀 [DISPATCH] Publicando na Meta...`);
    dispatchResults.channels.meta = await publishToMeta(channels.meta, copies, article);
  }

  // Grava o log de despacho na pasta do pacote
  if (outputDir && fs.existsSync(outputDir)) {
    const logPath = path.join(outputDir, 'dispatch_log.json');
    fs.writeFileSync(logPath, JSON.stringify(dispatchResults, null, 2), 'utf8');
  }

  return dispatchResults;
}

module.exports = {
  dispatchToClientChannels,
  publishToWebhook,
  publishToBuffer,
  publishToLinkedIn,
  publishToTwitter,
  publishToTelegram,
  publishToMeta,
  testChannelConnection
};
