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

    // 3. Conteúdo textual específico por canal:
    // - Twitter / X: Somente o ponto fundamental (sem título, max 280 chars)
    // - Instagram, Facebook, LinkedIn: Resumo detalhado de até 1700 chars com "Matéria completa em (url)"
    let postText = '';
    if (service === 'twitter') {
      postText = (typeof copies.twitter === 'string' ? copies.twitter : copies.twitter?.post) || (article?.description || 'Novo artigo publicado');
      postText = postText.trim();
      if (postText.length > 280) {
        postText = postText.slice(0, 277) + '...';
      }
    } else if (service === 'instagram') {
      postText = (typeof copies.instagram === 'string' ? copies.instagram : copies.instagram?.post) || copies.facebook?.post || copies.linkedin?.post || (article?.title || 'Novo artigo publicado');
      postText = postText.trim();
      if (postText.length > 1700) {
        postText = postText.slice(0, 1697) + '...';
      }
    } else if (service === 'linkedin') {
      postText = (typeof copies.linkedin === 'string' ? copies.linkedin : copies.linkedin?.post) || copies.facebook?.post || copies.instagram?.post || (article?.title || 'Novo artigo publicado');
      postText = postText.trim();
      if (postText.length > 1700) {
        postText = postText.slice(0, 1697) + '...';
      }
    } else if (service === 'facebook') {
      postText = (typeof copies.facebook === 'string' ? copies.facebook : copies.facebook?.post) || copies.linkedin?.post || copies.instagram?.post || (article?.title || 'Novo artigo publicado');
      postText = postText.trim();
      if (postText.length > 1700) {
        postText = postText.slice(0, 1697) + '...';
      }
    } else {
      postText = copies.facebook?.post || copies.linkedin?.post || copies.twitter?.post || (article?.title || 'Novo artigo publicado');
      postText = postText.trim();
      if (postText.length > 1700) {
        postText = postText.slice(0, 1697) + '...';
      }
    }

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
/**
 * Publicação direta no LinkedIn via UGC Posts API (v2)
 * Suporta:
 * 1. Perfil Pessoal (Author URN: urn:li:person:...) com escopo w_member_social
 * 2. Company Page (Author URN: urn:li:organization:...) com escopo w_organization_social
 * 3. Modo Ambos (publica em ambos os perfis sequencialmente)
 * Endpoint: POST https://api.linkedin.com/v2/ugcPosts
 */
async function publishToLinkedIn(config, copies, article = {}) {
  const { accessToken, profileType = 'person' } = config;
  let authorUrn = (config.authorUrn || '').trim();
  const organizationUrn = (config.organizationUrn || '').trim();

  if (!accessToken) {
    return { status: 'skipped', message: 'Credenciais do LinkedIn não configuradas (accessToken ausente).' };
  }

  // Se o Author URN pessoal não estiver preenchido, detecta automaticamente via userinfo
  if (!authorUrn || authorUrn === 'auto' || (!authorUrn.includes(':') && profileType !== 'organization')) {
    try {
      const userRes = await fetch('https://api.linkedin.com/v2/userinfo', {
        headers: { 'Authorization': `Bearer ${accessToken.trim()}` }
      });
      if (userRes.ok) {
        const userData = await userRes.json();
        const memberId = userData.sub || userData.id;
        if (memberId) {
          authorUrn = `urn:li:person:${memberId}`;
        }
      }
    } catch {}
  }

  // Lista de destinos a serem publicados
  const targets = [];
  if (profileType === 'both') {
    if (authorUrn) targets.push({ urn: authorUrn, type: 'person', label: 'Perfil Pessoal' });
    if (organizationUrn) targets.push({ urn: organizationUrn, type: 'organization', label: 'Company Page' });
  } else if (profileType === 'organization') {
    const org = organizationUrn || authorUrn;
    if (org) targets.push({ urn: org, type: 'organization', label: 'Company Page' });
  } else {
    // Default: perfil pessoal
    if (authorUrn) targets.push({ urn: authorUrn, type: 'person', label: 'Perfil Pessoal' });
  }

  if (targets.length === 0) {
    return { status: 'skipped', message: 'Nenhum Author URN informado ou detectado para o LinkedIn (preencha o URN pessoal ou da empresa).' };
  }

  let postText = (typeof copies?.linkedin === 'string' ? copies.linkedin : copies?.linkedin?.post) || '';

  // Fallbacks resilientes se a copy específica do LinkedIn estiver vazia
  if (!postText.trim()) {
    postText = (typeof copies?.facebook === 'string' ? copies.facebook : copies?.facebook?.post) || '';
  }
  if (!postText.trim()) {
    postText = (typeof copies?.instagram === 'string' ? copies.instagram : copies?.instagram?.post) || '';
  }
  if (!postText.trim() && article) {
    postText = (article.description || article.title || 'Novo artigo publicado').trim();
  }

  postText = postText.trim();
  if (!postText) throw new Error('Copy do LinkedIn não encontrada no pacote.');

  // Limite oficial do LinkedIn (resumo de até 1700 caracteres)
  if (postText.length > 1700) {
    postText = postText.slice(0, 1697) + '...';
  }

  const targetUrl = article?.canonicalUrl || article?.url;
  const isTopic = Boolean(article.isTopicMode || article.mode === 'topic' || !targetUrl);

  const results = [];
  let allSuccess = true;

  for (const target of targets) {
    const shareContent = {
      shareCommentary: { text: postText },
      shareMediaCategory: 'NONE'
    };

    // Se houver URL válida de artigo (não-tópico), formata como preview card oficial de artigo
    if (targetUrl && targetUrl.startsWith('http') && !isTopic) {
      shareContent.shareMediaCategory = 'ARTICLE';
      shareContent.media = [
        {
          status: 'READY',
          description: { text: (article.description || article.title || '').slice(0, 250) },
          originalUrl: targetUrl,
          title: { text: (article.title || 'Novo Artigo').slice(0, 200) }
        }
      ];
    }

    const payload = {
      author: target.urn,
      lifecycleState: 'PUBLISHED',
      specificContent: {
        'com.linkedin.ugc.ShareContent': shareContent
      },
      visibility: {
        'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC'
      }
    };

    try {
      const res = await fetch('https://api.linkedin.com/v2/ugcPosts', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken.trim()}`,
          'Content-Type': 'application/json',
          'X-Restli-Protocol-Version': '2.0.0'
        },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      let errorDetail = res.ok ? null : (data.message || `LinkedIn retornou HTTP ${res.status}`);

      // Tratamento especializado e explicativo para erro 403 / Access Denied no campo /author
      if (!res.ok && res.status === 403 && (errorDetail.includes('/author') || errorDetail.includes('Data Processing Exception') || errorDetail.includes('ACCESS_DENIED'))) {
        if (target.urn.includes(':organization:')) {
          errorDetail = 'Permissão Insuficiente (403 no /author): O token do LinkedIn não tem autorização para publicar em nome da Company Page (empresa). O LinkedIn exige aprovação prévia do produto "Community Management API" (escopo w_organization_social) para postar em páginas empresariais. Para Company Pages, utilize o Buffer API ou selecione o modo "Perfil Pessoal".';
        } else {
          errorDetail = 'Permissão Insuficiente (403 no /author): O URN de autor informado não corresponde ao usuário autenticado por este token do LinkedIn.';
        }
      }

      if (!res.ok) allSuccess = false;

      results.push({
        target: target.label,
        urn: target.urn,
        status: res.ok ? 'success' : 'error',
        statusCode: res.status,
        postId: data.id,
        postUrl: data.id ? `https://www.linkedin.com/feed/update/${data.id}` : null,
        error: errorDetail,
        response: data
      });
    } catch (err) {
      allSuccess = false;
      results.push({
        target: target.label,
        urn: target.urn,
        status: 'error',
        error: err.message
      });
    }
  }

  // Se publicou apenas em um destino, mantém compatibilidade com retorno tradicional
  if (results.length === 1) {
    const single = results[0];
    return {
      status: single.status,
      statusCode: single.statusCode,
      postId: single.postId,
      postUrl: single.postUrl,
      error: single.error,
      target: single.target,
      urn: single.urn,
      response: single.response
    };
  }

  return {
    status: allSuccess ? 'success' : (results.some(r => r.status === 'success') ? 'partial' : 'error'),
    results,
    message: allSuccess ? 'Publicado com sucesso no Perfil Pessoal e na Company Page do LinkedIn!' : 'Disparo concluído com avisos em um ou mais destinos.'
  };
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
    // Conta padrão do X: Somente o ponto fundamental do artigo (sem título, max 280 caracteres)
    let postText = (typeof copies?.twitter === 'string' ? copies.twitter : copies?.twitter?.post) || (article?.description || 'Novo artigo publicado').trim();
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
 * Publicação via Google Business Profile (Google Meu Negócio) API
 * Endpoint: POST https://mybusiness.googleapis.com/v4/accounts/{accountId}/locations/{locationId}/localPosts
 */
async function publishToGoogleBusiness(config, copies, packageId, options = {}) {
  const { accessToken, accountId, locationId } = config;
  const { images = [], article = {}, outputDir } = options;

  if (!accessToken) {
    return { status: 'skipped', message: 'Access Token do Google Business Profile não configurado.' };
  }
  if (!locationId) {
    return { status: 'skipped', message: 'Location ID do Google Business Profile não configurado.' };
  }

  const baseUrl = process.env.BASE_URL || 'https://social360.anauedesign.com.br';
  let postImageUrl = null;

  if (packageId && outputDir) {
    const imagesDir = fs.existsSync(path.join(outputDir, 'images')) ? path.join(outputDir, 'images') : outputDir;
    if (fs.existsSync(path.join(imagesDir, 'linkedin_twitter_facebook_16x9.jpg'))) {
      postImageUrl = `${baseUrl}/api/media/${packageId}/linkedin_twitter_facebook_16x9.jpg`;
    } else if (fs.existsSync(path.join(imagesDir, 'instagram_threads_square_1x1.jpg'))) {
      postImageUrl = `${baseUrl}/api/media/${packageId}/instagram_threads_square_1x1.jpg`;
    }
  }

  if (!postImageUrl && Array.isArray(images) && images.length > 0) {
    const imgObj = images.find(img => img.url || img.src);
    if (imgObj) postImageUrl = imgObj.url || imgObj.src;
  }

  const title = article?.title || 'Novidades';
  let summary = (typeof copies?.googlebusiness === 'string' ? copies.googlebusiness : copies?.googlebusiness?.post) ||
    (typeof copies?.linkedin === 'string' ? copies.linkedin : copies?.linkedin?.post) ||
    (typeof copies?.facebook === 'string' ? copies.facebook : copies?.facebook?.post) ||
    title;
  summary = summary.trim();
  if (summary.length > 1500) {
    summary = summary.slice(0, 1497) + '...';
  }

  const targetUrl = article?.canonicalUrl || article?.url;

  const cleanLoc = (locationId || '').trim().replace(/^locations\//, '');
  const cleanAcc = (accountId || '').trim().replace(/^accounts\//, '');
  const resourcePath = cleanAcc
    ? `accounts/${cleanAcc}/locations/${cleanLoc}`
    : `locations/${cleanLoc}`;

  const postPayload = {
    languageCode: 'pt-BR',
    summary,
    topicType: 'STANDARD'
  };

  if (targetUrl && targetUrl.startsWith('http')) {
    postPayload.callToAction = {
      actionType: 'LEARN_MORE',
      url: targetUrl
    };
  }

  if (postImageUrl && postImageUrl.startsWith('http')) {
    postPayload.media = [
      {
        mediaFormat: 'PHOTO',
        sourceUrl: postImageUrl
      }
    ];
  }

  try {
    const endpoint = `https://mybusiness.googleapis.com/v4/${resourcePath}/localPosts`;
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken.trim()}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(postPayload)
    });

    const data = await res.json().catch(() => null);

    if (res.ok) {
      return {
        status: 'success',
        postId: data?.name || data?.id,
        postUrl: data?.searchUrl || null,
        response: data
      };
    }

    return {
      status: 'error',
      statusCode: res.status,
      error: data?.error?.message || `Google Business API retornou HTTP ${res.status}: ${JSON.stringify(data)}`,
      response: data
    };
  } catch (err) {
    return { status: 'error', error: err.message };
  }
}

/**
 * Publicação via TikTok Content Posting API v2
 * Endpoint: POST https://open.tiktokapis.com/v2/post/publish/video/init/
 */
async function publishToTikTok(config, copies, packageId, options = {}) {
  const { accessToken } = config;
  const { article = {}, outputDir, video = null } = options;

  if (!accessToken) {
    return { status: 'skipped', message: 'Access Token do TikTok não configurado.' };
  }

  const baseUrl = process.env.BASE_URL || 'https://social360.anauedesign.com.br';
  let packageVideoUrl = null;

  if (video && video.url) {
    packageVideoUrl = video.url.startsWith('http') ? video.url : `${baseUrl}${video.url}`;
  }

  if (!packageVideoUrl && packageId && outputDir) {
    const imagesDir = fs.existsSync(path.join(outputDir, 'images')) ? path.join(outputDir, 'images') : outputDir;
    const videoFiles = ['video_post.mp4', 'video_post.mov', 'video_post.webm'];
    for (const vf of videoFiles) {
      if (fs.existsSync(path.join(imagesDir, vf))) {
        packageVideoUrl = `${baseUrl}/api/media/${packageId}/${vf}`;
        break;
      }
    }
  }

  // O TikTok exige estritamente um arquivo de vídeo para publicação via API
  if (!packageVideoUrl) {
    return {
      status: 'skipped',
      message: 'O TikTok exige um arquivo de vídeo (.mp4 vertical 9:16). Como este pacote não possui vídeo gerado ou anexado, a publicação no TikTok foi ignorada. Utilize a aba "Estúdio de Vídeo" para gerar o vídeo com IA antes do disparo.'
    };
  }

  let caption = (typeof copies?.tiktok === 'string' ? copies.tiktok : copies?.tiktok?.post) ||
    (typeof copies?.twitter === 'string' ? copies.twitter : copies?.twitter?.post) ||
    article?.title || 'Confira!';
  caption = caption.trim();
  if (caption.length > 2200) {
    caption = caption.slice(0, 2197) + '...';
  }

  const payload = {
    post_info: {
      title: caption,
      privacy_level: 'PUBLIC_TO_EVERYONE',
      disable_duet: false,
      disable_stitch: false,
      disable_comment: false,
      video_cover_timestamp_ms: 1000
    },
    source_info: {
      source: 'PULL_FROM_URL',
      video_url: packageVideoUrl
    }
  };

  try {
    const res = await fetch('https://open.tiktokapis.com/v2/post/publish/video/init/', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken.trim()}`,
        'Content-Type': 'application/json; charset=UTF-8'
      },
      body: JSON.stringify(payload)
    });

    const data = await res.json().catch(() => null);

    if (res.ok && data?.data?.publish_id) {
      return {
        status: 'success',
        publishId: data.data.publish_id,
        message: 'Vídeo enviado para processamento e publicação no TikTok com sucesso!',
        response: data
      };
    }

    const errMsg = data?.error?.message || data?.error?.code || `TikTok API retornou HTTP ${res.status}`;
    return {
      status: 'error',
      statusCode: res.status,
      error: errMsg,
      response: data
    };
  } catch (err) {
    return { status: 'error', error: err.message };
  }
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
      const token = (channelConfig?.accessToken || '').trim();
      let urn = (channelConfig?.authorUrn || '').trim();
      const profileType = channelConfig?.profileType || 'person';

      if (!token) {
        return { ok: false, error: 'Access Token do LinkedIn ausente. Informe seu token OAuth 2.0.' };
      }

      try {
        let memberData = null;
        let memberId = null;
        let memberName = null;

        // 1. Tenta OpenID Connect userinfo
        const resUserInfo = await fetch('https://api.linkedin.com/v2/userinfo', {
          headers: { 'Authorization': `Bearer ${token}` }
        });

        if (resUserInfo.ok) {
          memberData = await resUserInfo.json();
          memberId = memberData.sub;
          memberName = memberData.name || `${memberData.given_name || ''} ${memberData.family_name || ''}`.trim();
        } else if (resUserInfo.status === 401) {
          return {
            ok: false,
            error: 'Erro 401 (Não Autorizado): Token do LinkedIn expirado ou inválido. Gere um novo token no LinkedIn Developers.'
          };
        } else {
          // 2. Fallback para rota legada /v2/me
          try {
            const resMe = await fetch('https://api.linkedin.com/v2/me', {
              headers: { 'Authorization': `Bearer ${token}` }
            });
            if (resMe.ok) {
              const dataMe = await resMe.json();
              memberId = dataMe.id;
              memberName = `${dataMe.localizedFirstName || ''} ${dataMe.localizedLastName || ''}`.trim() || dataMe.id;
            }
          } catch {}
        }

        const detectedPersonalUrn = memberId ? `urn:li:person:${memberId}` : null;
        const targetUrn = urn || detectedPersonalUrn;

        if (!targetUrn) {
          return {
            ok: false,
            error: 'Não foi possível identificar o ID do perfil pessoal com este token. Verifique se o app possui os escopos "openid", "profile" e "w_member_social".'
          };
        }

        const isPersonal = targetUrn.includes(':person:');
        const isOrg = targetUrn.includes(':organization:');

        let msg = `LinkedIn conectado com sucesso!`;
        if (isPersonal) {
          msg += ` Perfil Pessoal de ${memberName || 'Usuário'} (${targetUrn}). Pronto para postagens com escopo w_member_social!`;
        } else if (isOrg) {
          msg += ` Company Page: ${targetUrn} (Autenticado por: ${memberName || 'Usuário'}).`;
        } else {
          msg += ` Autor configurado: ${targetUrn}.`;
        }

        return {
          ok: true,
          message: msg,
          detectedPersonalUrn,
          memberName,
          authorUrn: targetUrn
        };
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

    case 'googlebusiness': {
      const token = (channelConfig?.accessToken || '').trim();
      const locationId = (channelConfig?.locationId || '').trim();
      if (!token) return { ok: false, error: 'Access Token do Google Business Profile ausente.' };

      try {
        const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json().catch(() => null);

        if (res.ok && data) {
          const userStr = data.email || data.name || 'OK';
          let msg = `Google conectado com sucesso (${userStr})!`;
          if (locationId) {
            msg += ` Local configurado: ${locationId}.`;
          } else {
            msg += ` (Atenção: Location ID ainda não preenchido).`;
          }
          return { ok: true, message: msg };
        }

        if (res.status === 401) {
          return {
            ok: false,
            error: 'Erro 401 (Não Autorizado): Token da Google inválido ou expirado. Gere um novo OAuth 2.0 Access Token no Google Cloud Console com o escopo https://www.googleapis.com/auth/business.manage.'
          };
        }

        return { ok: false, error: `Google API retornou HTTP ${res.status}: ${data?.error_description || data?.error || 'Falha na validação'}` };
      } catch (err) {
        return { ok: false, error: err.message };
      }
    }

    case 'tiktok': {
      const token = (channelConfig?.accessToken || '').trim();
      if (!token) return { ok: false, error: 'Access Token do TikTok ausente.' };

      try {
        const res = await fetch('https://open.tiktokapis.com/v2/user/info/?fields=open_id,union_id,avatar_url,display_name', {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
        const data = await res.json().catch(() => null);

        if (res.ok && data?.data?.user) {
          const u = data.data.user;
          return {
            ok: true,
            message: `TikTok conectado com sucesso: @${u.display_name || u.open_id || 'OK'}`
          };
        }

        if (data?.error && data.error.code !== 'ok') {
          if (data.error.code === 'access_token_invalid') {
            return {
              ok: false,
              error: 'Erro TikTok: Access Token inválido ou expirado. Gere um novo token no TikTok for Developers.'
            };
          }
          return {
            ok: false,
            error: `TikTok API retornou erro [${data.error.code}]: ${data.error.message || 'Falha'}`
          };
        }

        return { ok: false, error: `TikTok retornou HTTP ${res.status}` };
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
  if (isChannelAllowed('webhook')) {
    if (channels.webhook?.enabled !== false && webhookUrl) {
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
    } else if (targetChannels && targetChannels.includes('webhook')) {
      dispatchResults.channels.webhook = {
        status: 'skipped',
        message: 'Webhook desativado ou URL vazia no perfil do cliente.'
      };
    }
  }

  // 2. Buffer API
  if (isChannelAllowed('buffer')) {
    if (channels.buffer?.enabled && channels.buffer?.accessToken) {
      console.log(`🚀 [DISPATCH] Agendando via Buffer API...`);
      dispatchResults.channels.buffer = await publishToBuffer(channels.buffer, copies, packageId, { images, article, outputDir, video });
    } else if (targetChannels && targetChannels.includes('buffer')) {
      dispatchResults.channels.buffer = {
        status: 'skipped',
        message: !channels.buffer?.enabled
          ? 'Buffer API desativado nas configurações do cliente.'
          : 'Access Token do Buffer não configurado nas configurações do cliente.'
      };
    }
  }

  // 3. LinkedIn Direto
  if (isChannelAllowed('linkedin')) {
    if (channels.linkedin?.enabled && channels.linkedin?.accessToken) {
      console.log(`🚀 [DISPATCH] Publicando diretamente no LinkedIn...`);
      dispatchResults.channels.linkedin = await publishToLinkedIn(channels.linkedin, copies, article);
    } else if (targetChannels && targetChannels.includes('linkedin')) {
      dispatchResults.channels.linkedin = {
        status: 'skipped',
        message: !channels.linkedin?.enabled
          ? 'LinkedIn Direto desativado nas configurações do cliente.'
          : 'Access Token do LinkedIn ausente nas configurações do cliente.'
      };
    }
  }

  // 4. X (Twitter) Direto
  if (isChannelAllowed('twitter')) {
    if (channels.twitter?.enabled && (channels.twitter?.bearerToken || channels.twitter?.accessToken)) {
      console.log(`🚀 [DISPATCH] Publicando na API do X (Twitter)...`);
      dispatchResults.channels.twitter = await publishToTwitter(channels.twitter, copies, article);
    } else if (targetChannels && targetChannels.includes('twitter')) {
      dispatchResults.channels.twitter = {
        status: 'skipped',
        message: !channels.twitter?.enabled
          ? 'X (Twitter) Direto desativado nas configurações do cliente.'
          : 'Credenciais de API / Access Token do X ausentes nas configurações do cliente.'
      };
    }
  }

  // 5. Telegram
  if (isChannelAllowed('telegram')) {
    if (channels.telegram?.enabled && channels.telegram?.botToken) {
      console.log(`🚀 [DISPATCH] Publicando no Telegram...`);
      dispatchResults.channels.telegram = await publishToTelegram(channels.telegram, copies, article);
    } else if (targetChannels && targetChannels.includes('telegram')) {
      dispatchResults.channels.telegram = {
        status: 'skipped',
        message: !channels.telegram?.enabled
          ? 'Telegram Bot desativado nas configurações do cliente.'
          : 'Bot Token do Telegram ausente nas configurações do cliente.'
      };
    }
  }

  // 6. Meta (Facebook / Instagram)
  if (isChannelAllowed('meta')) {
    if (channels.meta?.enabled && channels.meta?.pageAccessToken) {
      console.log(`🚀 [DISPATCH] Publicando na Meta...`);
      dispatchResults.channels.meta = await publishToMeta(channels.meta, copies, article);
    } else if (targetChannels && targetChannels.includes('meta')) {
      dispatchResults.channels.meta = {
        status: 'skipped',
        message: !channels.meta?.enabled
          ? 'Meta Direct desativado nas configurações do cliente.'
          : 'Page Access Token da Meta ausente nas configurações do cliente.'
      };
    }
  }

  // 7. Google Perfil da Empresa (Google Business Profile API)
  if (isChannelAllowed('googlebusiness')) {
    if (channels.googlebusiness?.enabled && channels.googlebusiness?.accessToken && channels.googlebusiness?.locationId) {
      console.log(`🚀 [DISPATCH] Publicando no Google Perfil da Empresa...`);
      dispatchResults.channels.googlebusiness = await publishToGoogleBusiness(channels.googlebusiness, copies, packageId, { images, article, outputDir, video });
    } else if (targetChannels && targetChannels.includes('googlebusiness')) {
      dispatchResults.channels.googlebusiness = {
        status: 'skipped',
        message: !channels.googlebusiness?.enabled
          ? 'Google Perfil da Empresa desativado nas configurações do cliente.'
          : 'Access Token ou Location ID do Google ausente nas configurações do cliente.'
      };
    }
  }

  // 8. TikTok (Content Posting API)
  if (isChannelAllowed('tiktok')) {
    if (channels.tiktok?.enabled && channels.tiktok?.accessToken) {
      console.log(`🚀 [DISPATCH] Publicando no TikTok...`);
      dispatchResults.channels.tiktok = await publishToTikTok(channels.tiktok, copies, packageId, { images, article, outputDir, video });
    } else if (targetChannels && targetChannels.includes('tiktok')) {
      dispatchResults.channels.tiktok = {
        status: 'skipped',
        message: !channels.tiktok?.enabled
          ? 'TikTok desativado nas configurações do cliente.'
          : 'Access Token do TikTok ausente nas configurações do cliente.'
      };
    }
  }

  if (Object.keys(dispatchResults.channels).length === 0) {
    dispatchResults.channels.info = {
      status: 'skipped',
      message: 'Nenhum canal de publicação está ativado ou possui credenciais configuradas neste cliente.'
    };
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
  publishToGoogleBusiness,
  publishToTikTok,
  testChannelConnection
};
