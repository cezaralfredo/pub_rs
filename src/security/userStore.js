/**
 * Módulo de Armazenamento e Gerenciamento de Usuários (SaaS Multi-tenant)
 * Armazena contas, credenciais criptografadas e limites de planos.
 */

const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');

// Planos e Limites do SaaS
const SAAS_PLANS = {
  starter: {
    id: 'starter',
    name: 'Starter',
    monthlyGenerations: 50,
    maxClients: 2,
    badgeColor: '#38bdf8'
  },
  pro: {
    id: 'pro',
    name: 'Pro Creator',
    monthlyGenerations: 200,
    maxClients: 10,
    badgeColor: '#818cf8'
  },
  agency: {
    id: 'agency',
    name: 'Agency Enterprise',
    monthlyGenerations: 1000,
    maxClients: 50,
    badgeColor: '#f59e0b'
  }
};

const ADMIN_DEFAULT_EMAIL = 'gerandoparceria@gmail.com';
const ADMIN_DEFAULT_PASSWORD_HASH = '$2b$10$Qs4rG9fA5wjD/.SdExIM2OBDLOoy7i9uR7kYQmJ5SkL3a35/oYama'; // Mkt*111069

/**
 * Garante que o diretório de dados e o arquivo de usuários existam com o admin padrão.
 */
function initUserStore() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  if (!fs.existsSync(USERS_FILE)) {
    // Cria usuário administrador inicial oficial
    const initialUsers = [
      {
        id: 'usr_admin_master',
        name: 'Administrador Social360',
        email: ADMIN_DEFAULT_EMAIL,
        company: 'Social360 / Anauê Design',
        passwordHash: ADMIN_DEFAULT_PASSWORD_HASH,
        role: 'admin',
        plan: 'agency',
        usage: {
          generationsCount: 0,
          monthlyLimit: 1000,
          currentMonth: new Date().toISOString().slice(0, 7)
        },
        createdAt: new Date().toISOString()
      }
    ];

    fs.writeFileSync(USERS_FILE, JSON.stringify(initialUsers, null, 2), 'utf8');
    console.log(`🔒 [SaaS Auth] Usuário administrador inicializado (${ADMIN_DEFAULT_EMAIL}).`);
  } else {
    // Se o arquivo já existe (ex: volume persistente do Docker na VPS), atualiza a conta master para as novas credenciais
    try {
      const users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
      let modified = false;

      const adminUser = users.find(u => u.id === 'usr_admin_master' || u.role === 'admin' || u.email === 'admin@pubrs.com');
      if (adminUser) {
        if (adminUser.email !== ADMIN_DEFAULT_EMAIL || adminUser.passwordHash !== ADMIN_DEFAULT_PASSWORD_HASH) {
          adminUser.email = ADMIN_DEFAULT_EMAIL;
          adminUser.passwordHash = ADMIN_DEFAULT_PASSWORD_HASH;
          adminUser.name = 'Administrador Social360';
          adminUser.company = 'Social360 / Anauê Design';
          modified = true;
        }
      }

      if (modified) {
        fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf8');
        console.log(`🔒 [SaaS Auth] Credenciais do administrador atualizadas com sucesso (${ADMIN_DEFAULT_EMAIL}).`);
      }
    } catch (err) {
      console.error('[SaaS Auth] Erro ao verificar credenciais do administrador:', err.message);
    }
  }
}

/**
 * Lê todos os usuários do arquivo.
 */
function readUsers() {
  initUserStore();
  try {
    const raw = fs.readFileSync(USERS_FILE, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    console.error('Erro ao ler users.json:', err.message);
    return [];
  }
}

/**
 * Escreve a lista de usuários no arquivo.
 */
function writeUsers(users) {
  initUserStore();
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf8');
}

/**
 * Higieniza o objeto do usuário para não expor o hash da senha.
 */
function sanitizeUser(user) {
  if (!user) return null;
  const { passwordHash, ...safeUser } = user;
  const planInfo = SAAS_PLANS[safeUser.plan] || SAAS_PLANS.starter;
  return {
    ...safeUser,
    planDetails: planInfo
  };
}

/**
 * Busca usuário por e-mail (case-insensitive).
 */
function findUserByEmail(email) {
  if (!email) return null;
  const cleanEmail = email.trim().toLowerCase();
  const users = readUsers();
  return users.find(u => u.email.toLowerCase() === cleanEmail) || null;
}

/**
 * Busca usuário por ID.
 */
function findUserById(id) {
  if (!id) return null;
  const users = readUsers();
  return users.find(u => u.id === id) || null;
}

/**
 * Cria um novo usuário no sistema.
 */
async function createUser({ name, email, password, company, plan = 'pro' }) {
  if (!email || !password || !name) {
    throw new Error('Nome, e-mail e senha são obrigatórios.');
  }

  const cleanEmail = email.trim().toLowerCase();
  const existing = findUserByEmail(cleanEmail);
  if (existing) {
    throw new Error('Este endereço de e-mail já está cadastrado.');
  }

  if (password.length < 6) {
    throw new Error('A senha deve ter no mínimo 6 caracteres.');
  }

  const salt = await bcrypt.genSalt(10);
  const passwordHash = await bcrypt.hash(password, salt);
  const planKey = SAAS_PLANS[plan] ? plan : 'pro';
  const planInfo = SAAS_PLANS[planKey];

  const newUser = {
    id: `usr_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    name: name.trim(),
    email: cleanEmail,
    company: (company || 'Minha Empresa').trim(),
    passwordHash,
    role: 'creator',
    plan: planKey,
    usage: {
      generationsCount: 0,
      monthlyLimit: planInfo.monthlyGenerations,
      currentMonth: new Date().toISOString().slice(0, 7)
    },
    createdAt: new Date().toISOString()
  };

  const users = readUsers();
  users.push(newUser);
  writeUsers(users);

  return sanitizeUser(newUser);
}

/**
 * Valida a senha do usuário.
 */
async function verifyPassword(plainPassword, passwordHash) {
  return await bcrypt.compare(plainPassword, passwordHash);
}

/**
 * Incrementa o contador de gerações do usuário.
 */
function incrementUserUsage(userId) {
  const users = readUsers();
  const currentMonth = new Date().toISOString().slice(0, 7);

  const updated = users.map(user => {
    if (user.id === userId) {
      const usage = user.usage || { generationsCount: 0, monthlyLimit: 200 };
      // Reseta se mudou o mês
      if (usage.currentMonth !== currentMonth) {
        usage.generationsCount = 1;
        usage.currentMonth = currentMonth;
      } else {
        usage.generationsCount = (usage.generationsCount || 0) + 1;
      }
      return { ...user, usage };
    }
    return user;
  });

  writeUsers(updated);
}

/**
 * Verifica se o usuário ainda possui cota disponível no mês atual.
 */
function checkUserQuota(userId) {
  const user = findUserById(userId);
  if (!user) return { allowed: false, error: 'Usuário não encontrado.' };
  if (user.role === 'admin') return { allowed: true, remaining: 99999 };

  const currentMonth = new Date().toISOString().slice(0, 7);
  const usage = user.usage || { generationsCount: 0, monthlyLimit: 200, currentMonth };
  const currentCount = usage.currentMonth === currentMonth ? (usage.generationsCount || 0) : 0;
  const limit = usage.monthlyLimit || 200;

  if (currentCount >= limit) {
    return {
      allowed: false,
      error: `Limite mensal do plano atingido (${currentCount}/${limit}). Faça upgrade para continuar gerando posts.`,
      currentCount,
      limit
    };
  }

  return { allowed: true, currentCount, limit, remaining: limit - currentCount };
}

/**
 * Atualiza dados de um usuário (perfil ou senha).
 */
async function updateUser(id, { name, company, newPassword }) {
  const users = readUsers();
  let updatedUser = null;

  for (let i = 0; i < users.length; i++) {
    if (users[i].id === id) {
      if (name) users[i].name = name.trim();
      if (company) users[i].company = company.trim();
      if (newPassword && newPassword.length >= 6) {
        const salt = await bcrypt.genSalt(10);
        users[i].passwordHash = await bcrypt.hash(newPassword, salt);
      }
      updatedUser = users[i];
      break;
    }
  }

  if (updatedUser) {
    writeUsers(users);
    return sanitizeUser(updatedUser);
  }
  return null;
}

module.exports = {
  SAAS_PLANS,
  initUserStore,
  findUserByEmail,
  findUserById,
  createUser,
  verifyPassword,
  sanitizeUser,
  incrementUserUsage,
  checkUserQuota,
  updateUser
};

