/**
 * Módulo de Segurança para Mascaramento e Proteção de Chaves de API e Tokens
 */

/**
 * Mascara uma string sensível (API key, token, secret) para exibição segura na UI.
 * Exemplo: "sk-proj-1234567890abcdef" -> "sk-proj-...cdef"
 */
function maskSecret(secret) {
  if (!secret || typeof secret !== 'string') return '';
  const trimmed = secret.trim();
  if (trimmed.length <= 8) {
    return '••••••••';
  }
  const prefix = trimmed.slice(0, 7);
  const suffix = trimmed.slice(-4);
  return `${prefix}...${suffix}`;
}

/**
 * Verifica se um valor recebido da UI é uma string mascarada (para preservar o valor original).
 */
function isMaskedValue(value) {
  if (!value || typeof value !== 'string') return false;
  return value.includes('...') || value.includes('••••');
}

/**
 * Sanitiza o objeto de cliente para envio ao frontend, mascarando todos os tokens e chaves privadas.
 */
function maskClientSecrets(client) {
  if (!client) return null;
  const safeClient = JSON.parse(JSON.stringify(client));

  // Mascara chaves de LLM do cliente
  if (safeClient.llm?.apiKey) {
    safeClient.llm.hasCustomKey = true;
    safeClient.llm.apiKey = maskSecret(safeClient.llm.apiKey);
  } else if (safeClient.llm) {
    safeClient.llm.hasCustomKey = false;
  }

  // Mascara tokens de canais
  if (safeClient.channels) {
    if (safeClient.channels.linkedin?.accessToken) {
      safeClient.channels.linkedin.hasToken = true;
      safeClient.channels.linkedin.accessToken = maskSecret(safeClient.channels.linkedin.accessToken);
    }
    if (safeClient.channels.twitter?.apiSecret) {
      safeClient.channels.twitter.hasSecret = true;
      safeClient.channels.twitter.apiSecret = maskSecret(safeClient.channels.twitter.apiSecret);
    }
    if (safeClient.channels.twitter?.accessToken) {
      safeClient.channels.twitter.accessToken = maskSecret(safeClient.channels.twitter.accessToken);
    }
    if (safeClient.channels.meta?.pageAccessToken) {
      safeClient.channels.meta.hasToken = true;
      safeClient.channels.meta.pageAccessToken = maskSecret(safeClient.channels.meta.pageAccessToken);
    }
    if (safeClient.channels.telegram?.botToken) {
      safeClient.channels.telegram.hasToken = true;
      safeClient.channels.telegram.botToken = maskSecret(safeClient.channels.telegram.botToken);
    }
    if (safeClient.channels.buffer?.accessToken) {
      safeClient.channels.buffer.hasToken = true;
      safeClient.channels.buffer.accessToken = maskSecret(safeClient.channels.buffer.accessToken);
    }
  }

  return safeClient;
}

/**
 * Mescla os dados recebidos do formulário mantendo as chaves originais caso tenham sido enviadas mascaradas.
 */
function mergeClientSecrets(newData, existingData = {}) {
  const merged = JSON.parse(JSON.stringify(newData));

  // Preserva chave de LLM se foi enviada mascarada
  if (merged.llm && isMaskedValue(merged.llm.apiKey)) {
    merged.llm.apiKey = existingData.llm?.apiKey || '';
  }

  // Preserva credenciais dos canais se foram enviadas mascaradas
  if (merged.channels && existingData.channels) {
    if (merged.channels.linkedin && isMaskedValue(merged.channels.linkedin.accessToken)) {
      merged.channels.linkedin.accessToken = existingData.channels.linkedin?.accessToken || '';
    }
    if (merged.channels.twitter) {
      if (isMaskedValue(merged.channels.twitter.apiKey)) {
        merged.channels.twitter.apiKey = existingData.channels.twitter?.apiKey || '';
      }
      if (isMaskedValue(merged.channels.twitter.apiSecret)) {
        merged.channels.twitter.apiSecret = existingData.channels.twitter?.apiSecret || '';
      }
      if (isMaskedValue(merged.channels.twitter.accessToken)) {
        merged.channels.twitter.accessToken = existingData.channels.twitter?.accessToken || '';
      }
      if (isMaskedValue(merged.channels.twitter.accessSecret)) {
        merged.channels.twitter.accessSecret = existingData.channels.twitter?.accessSecret || '';
      }
      if (isMaskedValue(merged.channels.twitter.bearerToken)) {
        merged.channels.twitter.bearerToken = existingData.channels.twitter?.bearerToken || '';
      }
    }
    if (merged.channels.telegram && isMaskedValue(merged.channels.telegram.botToken)) {
      merged.channels.telegram.botToken = existingData.channels.telegram?.botToken || '';
    }
    if (merged.channels.meta && isMaskedValue(merged.channels.meta.pageAccessToken)) {
      merged.channels.meta.pageAccessToken = existingData.channels.meta?.pageAccessToken || '';
    }
    if (merged.channels.buffer && isMaskedValue(merged.channels.buffer.accessToken)) {
      merged.channels.buffer.accessToken = existingData.channels.buffer?.accessToken || '';
    }
  }

  return merged;
}

module.exports = {
  maskSecret,
  isMaskedValue,
  maskClientSecrets,
  mergeClientSecrets
};
