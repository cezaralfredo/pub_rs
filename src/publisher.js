const fs = require('fs');
const path = require('path');

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
 * Publicação via Buffer API (Agendamento / Publicação em lote multicanal)
 * Endpoint oficial: POST https://api.bufferapp.com/1/updates/create.json
 */
async function publishToBuffer(config, copies, packageId) {
  const { accessToken, profileIds, now = true } = config;

  if (!accessToken || !profileIds || profileIds.length === 0) {
    return { status: 'skipped', message: 'Credenciais do Buffer incompletas (accessToken ou profileIds ausentes).' };
  }

  const results = [];

  for (const profileId of profileIds) {
    try {
      const params = new URLSearchParams();
      params.append('access_token', accessToken);
      params.append('profile_ids[]', profileId);
      params.append('text', copies.linkedin?.post || copies.twitter?.post || copies.threads?.post || 'Novo artigo publicado');
      if (now) params.append('now', 'true');

      const res = await fetch('https://api.bufferapp.com/1/updates/create.json', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params
      });

      const data = await res.json();
      results.push({
        profileId,
        status: res.ok ? 'success' : 'error',
        statusCode: res.status,
        data
      });
    } catch (err) {
      results.push({ profileId, status: 'error', error: err.message });
    }
  }

  return { status: 'completed', results };
}

/**
 * Publicação direta no LinkedIn via REST API v2
 * Endpoint: POST https://api.linkedin.com/v2/ugcPosts
 */
async function publishToLinkedIn(config, copies) {
  const { accessToken, authorUrn } = config;

  if (!accessToken || !authorUrn) {
    return { status: 'skipped', message: 'Credenciais do LinkedIn não configuradas (accessToken ou authorUrn).' };
  }

  try {
    const postText = copies.linkedin?.post;
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
    return {
      status: res.ok ? 'success' : 'error',
      statusCode: res.status,
      postId: data.id,
      postUrl: data.id ? `https://www.linkedin.com/feed/update/${data.id}` : null,
      response: data
    };
  } catch (err) {
    return { status: 'error', error: err.message };
  }
}

/**
 * Publicação direta no X (Twitter) via API v2
 * Endpoint: POST https://api.twitter.com/2/tweets
 */
async function publishToTwitter(config, copies) {
  const { bearerToken, accessToken } = config;
  const token = bearerToken || accessToken;

  if (!token) {
    return { status: 'skipped', message: 'Token do X/Twitter não configurado.' };
  }

  try {
    const thread = copies.twitter?.thread;
    const tweetsToPost = Array.isArray(thread) && thread.length > 0
      ? thread
      : [copies.twitter?.post || 'Novo artigo publicado'];

    let previousTweetId = null;
    const publishedTweets = [];

    for (const text of tweetsToPost) {
      const payload = { text };
      if (previousTweetId) {
        payload.reply = { in_reply_to_tweet_id: previousTweetId };
      }

      const res = await fetch('https://api.twitter.com/2/tweets', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(`Erro Twitter API (${res.status}): ${JSON.stringify(data)}`);
      }

      previousTweetId = data?.data?.id;
      publishedTweets.push(data?.data);
    }

    return {
      status: 'success',
      tweetsCount: publishedTweets.length,
      firstTweetUrl: previousTweetId ? `https://twitter.com/i/status/${publishedTweets[0]?.id}` : null,
      tweets: publishedTweets
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
      const token = channelConfig?.accessToken;
      if (!token) return { ok: false, error: 'Access Token do Buffer ausente.' };
      try {
        const res = await fetch(`https://api.bufferapp.com/1/user.json?access_token=${token}`);
        const data = await res.json();
        if (res.ok && data) {
          return {
            ok: true,
            message: `Buffer conectado com sucesso (Usuário: ${data.name || data.id || 'OK'}).`
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
        // Se der 403 por escopo, mas token foi aceito:
        if (res.status === 403 || res.status === 200) {
          return { ok: true, message: `Token do LinkedIn aceito pelo servidor (Status ${res.status}).` };
        }
        return { ok: false, error: `LinkedIn retornou HTTP ${res.status}.` };
      } catch (err) {
        return { ok: false, error: err.message };
      }
    }

    case 'twitter': {
      const token = channelConfig?.bearerToken || channelConfig?.accessToken;
      if (!token) return { ok: false, error: 'Token do X/Twitter ausente.' };
      try {
        const res = await fetch('https://api.twitter.com/2/users/me', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          return { ok: true, message: `X (Twitter) conectado: @${data?.data?.username || 'OK'}` };
        }
        return { ok: false, error: `X (Twitter) API retornou HTTP ${res.status}.` };
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
async function dispatchToClientChannels({ client, copies, images, article, packageId, outputDir, targetChannels }) {
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
      packageId
    });
  }

  // 2. Buffer API
  if (isChannelAllowed('buffer') && channels.buffer?.enabled && channels.buffer?.accessToken) {
    console.log(`🚀 [DISPATCH] Agendando via Buffer API...`);
    dispatchResults.channels.buffer = await publishToBuffer(channels.buffer, copies, packageId);
  }

  // 3. LinkedIn Direto
  if (isChannelAllowed('linkedin') && channels.linkedin?.enabled && channels.linkedin?.accessToken) {
    console.log(`🚀 [DISPATCH] Publicando diretamente no LinkedIn...`);
    dispatchResults.channels.linkedin = await publishToLinkedIn(channels.linkedin, copies);
  }

  // 4. X (Twitter) Direto
  if (isChannelAllowed('twitter') && channels.twitter?.enabled && (channels.twitter?.bearerToken || channels.twitter?.accessToken)) {
    console.log(`🚀 [DISPATCH] Publicando fio na API do X (Twitter)...`);
    dispatchResults.channels.twitter = await publishToTwitter(channels.twitter, copies);
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
