/**
 * Módulo de Autenticação JWT e Middleware de Proteção de Rotas (SaaS Enterprise)
 */

const jwt = require('jsonwebtoken');
const { findUserById, sanitizeUser } = require('./userStore');

const JWT_SECRET = process.env.JWT_SECRET || 'pub_rs_enterprise_saas_jwt_secret_key_2026_x89a';
const TOKEN_EXPIRY = '7d';

/**
 * Gera um token JWT assinado para a sessão do usuário.
 */
function generateToken(user) {
  const payload = {
    id: user.id,
    email: user.email,
    role: user.role || 'creator',
    plan: user.plan || 'pro',
    name: user.name
  };

  return jwt.sign(payload, JWT_SECRET, { expiresIn: TOKEN_EXPIRY });
}

/**
 * Decodifica e verifica a autenticidade de um token JWT.
 */
function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (err) {
    return null;
  }
}

/**
 * Middleware de proteção obrigatória de rotas (Require Authentication).
 * Aceita token via cabeçalho "Authorization: Bearer <token>" ou query string "?token=<token>" (necessário para SSE streaming).
 */
function requireAuth(req, res, next) {
  let token = null;

  // 1. Tenta extrair do cabeçalho Authorization
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.slice(7).trim();
  }

  // 2. Fallback para query param (usado por EventSource para SSE)
  if (!token && req.query?.token) {
    token = req.query.token;
  }

  if (!token) {
    return res.status(401).json({
      error: 'Acesso não autorizado. Faça login para continuar.',
      code: 'AUTH_REQUIRED'
    });
  }

  const decoded = verifyToken(token);
  if (!decoded || !decoded.id) {
    return res.status(401).json({
      error: 'Sessão expirada ou inválida. Faça login novamente.',
      code: 'INVALID_TOKEN'
    });
  }

  const user = findUserById(decoded.id);
  if (!user) {
    return res.status(401).json({
      error: 'Conta de usuário não encontrada.',
      code: 'USER_NOT_FOUND'
    });
  }

  req.user = sanitizeUser(user);
  next();
}

/**
 * Middleware para rotas que exigem perfil Administrador.
 */
function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({
      error: 'Acesso restrito a administradores.',
      code: 'ADMIN_REQUIRED'
    });
  }
  next();
}

/**
 * Rate Limiter específico para tentativas de login (Prevenção de Força Bruta)
 */
const loginAttemptsMap = new Map();

function loginRateLimiter(req, res, next) {
  const ip = req.ip || req.connection.remoteAddress || 'unknown';
  const now = Date.now();
  const windowMs = 15 * 60 * 1000; // 15 minutos
  const maxAttempts = 10;

  const record = loginAttemptsMap.get(ip) || { count: 0, firstAttempt: now };

  if (now - record.firstAttempt > windowMs) {
    record.count = 1;
    record.firstAttempt = now;
  } else {
    record.count++;
  }

  loginAttemptsMap.set(ip, record);

  if (record.count > maxAttempts) {
    return res.status(429).json({
      error: 'Muitas tentativas consecutivas de login. Aguarde 15 minutos antes de tentar novamente.',
      code: 'TOO_MANY_ATTEMPTS'
    });
  }

  next();
}

module.exports = {
  generateToken,
  verifyToken,
  requireAuth,
  requireAdmin,
  loginRateLimiter
};
