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
 * Orquestrador central de publicação para todos os canais ativados no cliente.
 */
async function dispatchToClientChannels({ client, copies, images, article, packageId, outputDir }) {
  const channels = client.channels || {};
  const dispatchResults = {
    packageId,
    dispatchedAt: new Date().toISOString(),
    channels: {}
  };

  // 1. Webhook Principal (n8n / Make / Metricool)
  const webhookUrl = channels.webhook?.url || client.webhookUrl || process.env.DEFAULT_WEBHOOK_URL;
  if (channels.webhook?.enabled !== false && webhookUrl) {
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
  if (channels.buffer?.enabled && channels.buffer?.accessToken) {
    console.log(`🚀 [DISPATCH] Agendando via Buffer API...`);
    dispatchResults.channels.buffer = await publishToBuffer(channels.buffer, copies, packageId);
  }

  // 3. LinkedIn Direto
  if (channels.linkedin?.enabled && channels.linkedin?.accessToken) {
    console.log(`🚀 [DISPATCH] Publicando diretamente no LinkedIn...`);
    dispatchResults.channels.linkedin = await publishToLinkedIn(channels.linkedin, copies);
  }

  // 4. X (Twitter) Direto
  if (channels.twitter?.enabled && (channels.twitter?.bearerToken || channels.twitter?.accessToken)) {
    console.log(`🚀 [DISPATCH] Publicando fio na API do X (Twitter)...`);
    dispatchResults.channels.twitter = await publishToTwitter(channels.twitter, copies);
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
  publishToTwitter
};
