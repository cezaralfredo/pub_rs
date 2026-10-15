const path = require('path');
const { URL } = require('url');

/**
 * Módulo de Segurança e Validação contra SSRF, Path Traversal e Injeções
 */

// Faixas de IP privadas e reservadas que devem ser bloqueadas para evitar SSRF
const PRIVATE_HOST_PATTERNS = [
  /^localhost$/i,
  /^127\./,
  /^0\./,
  /^10\./,
  /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
  /^192\.168\./,
  /^169\.254\./, // AWS / Cloud metadata service
  /^::1$/,
  /^fd[0-9a-f]{2}:/i,
  /^fe80:/i
];

/**
 * Valida se uma URL é segura para scraping público (Prevenção de SSRF).
 */
function validatePublicUrl(targetUrl) {
  if (!targetUrl || typeof targetUrl !== 'string') {
    throw new Error('URL inválida ou não informada.');
  }

  const trimmed = targetUrl.trim();
  let parsed;

  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error('Formato de URL inválido. Certifique-se de incluir http:// ou https://');
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`Protocolo "${parsed.protocol}" não permitido. Apenas http e https são aceitos.`);
  }

  const hostname = parsed.hostname.toLowerCase();

  for (const pattern of PRIVATE_HOST_PATTERNS) {
    if (pattern.test(hostname)) {
      throw new Error(`Acesso ao host "${hostname}" foi bloqueado por motivos de segurança (SSRF).`);
    }
  }

  return parsed.toString();
}

/**
 * Valida e sanitiza IDs de clientes e slugs de pacotes para evitar Path Traversal.
 */
function sanitizeIdentifier(id) {
  if (!id || typeof id !== 'string') {
    return 'default';
  }
  // Permite apenas letras, números, hífens e underscores
  const clean = id.trim().replace(/[^a-zA-Z0-9_-]/g, '');
  if (!clean || clean.includes('..')) {
    throw new Error(`Identificador inválido: "${id}".`);
  }
  return clean;
}

/**
 * Garante que um arquivo requisitado esteja estritamente dentro do diretório base permitido.
 */
function safePathResolve(baseDir, subPath) {
  const resolvedBase = path.resolve(baseDir);
  const resolvedTarget = path.resolve(baseDir, subPath);

  if (!resolvedTarget.startsWith(resolvedBase)) {
    throw new Error('Acesso negado: tentativa de escape de diretório (Path Traversal).');
  }

  return resolvedTarget;
}

module.exports = {
  validatePublicUrl,
  sanitizeIdentifier,
  safePathResolve
};
