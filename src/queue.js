const fs = require('fs');
const path = require('path');
const { loadClientConfig } = require('./pipeline');
const { dispatchToClientChannels } = require('./publisher');

/**
 * pub_rs — Sistema de Background Fila & Agendador de Publicação Multicanal
 * Gerencia a fila de disparos imediatos e programados em segundo plano,
 * com persistência em disco, retentativas automáticas e controle de status.
 */

const QUEUE_FILE = path.join(__dirname, '..', 'output', 'dispatch_queue.json');

// Garante que o arquivo da fila existe
function ensureQueueFile() {
  const dir = path.dirname(QUEUE_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  if (!fs.existsSync(QUEUE_FILE)) {
    fs.writeFileSync(QUEUE_FILE, JSON.stringify([], null, 2), 'utf8');
  }
}

// Carrega fila
function loadQueue() {
  ensureQueueFile();
  try {
    const raw = fs.readFileSync(QUEUE_FILE, 'utf8');
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

// Salva fila
function saveQueue(queue) {
  ensureQueueFile();
  fs.writeFileSync(QUEUE_FILE, JSON.stringify(queue, null, 2), 'utf8');
}

/**
 * Enfileira um pacote para publicação em background (agora ou agendado)
 */
function enqueueJob({ packageId, clientId, scheduledFor = null, targetChannels = [] }) {
  const queue = loadQueue();
  const now = new Date();
  const scheduleDate = scheduledFor ? new Date(scheduledFor) : now;

  const job = {
    id: `job_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    packageId,
    clientId: clientId || 'anaue-design',
    targetChannels: Array.isArray(targetChannels) ? targetChannels : [],
    status: 'scheduled', // 'scheduled' | 'processing' | 'published' | 'failed' | 'cancelled'
    createdAt: now.toISOString(),
    scheduledFor: scheduleDate.toISOString(),
    executedAt: null,
    retries: 0,
    maxRetries: 3,
    error: null,
    results: null
  };

  queue.unshift(job);
  saveQueue(queue);

  // Se agendado para o presente/passado, executa imediatamente em background
  if (scheduleDate <= now) {
    setImmediate(() => processQueue());
  }

  return job;
}

/**
 * Retorna todos os trabalhos da fila
 */
function getJobs(limit = 50) {
  const queue = loadQueue();
  return queue.slice(0, limit);
}

/**
 * Retorna um trabalho específico por ID
 */
function getJob(jobId) {
  const queue = loadQueue();
  return queue.find(j => j.id === jobId) || null;
}

/**
 * Cancela um trabalho agendado
 */
function cancelJob(jobId) {
  const queue = loadQueue();
  const job = queue.find(j => j.id === jobId);
  if (!job) return null;

  if (job.status === 'scheduled') {
    job.status = 'cancelled';
    job.executedAt = new Date().toISOString();
    saveQueue(queue);
    return job;
  }
  return job;
}

/**
 * Força a repetição (Retry) de um trabalho
 */
function retryJob(jobId) {
  const queue = loadQueue();
  const job = queue.find(j => j.id === jobId);
  if (!job) return null;

  job.status = 'scheduled';
  job.scheduledFor = new Date().toISOString();
  job.error = null;
  saveQueue(queue);

  setImmediate(() => processQueue());
  return job;
}

/**
 * Limpa trabalhos concluídos ou cancelados antigos
 */
function clearCompleted() {
  let queue = loadQueue();
  const countBefore = queue.length;
  queue = queue.filter(j => j.status === 'scheduled' || j.status === 'processing');
  saveQueue(queue);
  return { removed: countBefore - queue.length };
}

/**
 * Processador principal da fila em background
 */
let isProcessing = false;
async function processQueue() {
  if (isProcessing) return;
  isProcessing = true;

  try {
    const queue = loadQueue();
    const now = new Date();

    // Filtra trabalhos prontos para execução
    const dueJobs = queue.filter(j => 
      j.status === 'scheduled' && 
      new Date(j.scheduledFor) <= now
    );

    for (const job of dueJobs) {
      console.log(`\n⏳ [BACKGROUND QUEUE] Processando job ${job.id} (Pacote: ${job.packageId})...`);
      job.status = 'processing';
      saveQueue(queue);

      try {
        const outputBase = path.join(__dirname, '..', 'output');
        const packageDir = path.join(outputBase, job.packageId);

        if (!fs.existsSync(packageDir)) {
          throw new Error(`Diretório do pacote "${job.packageId}" não foi encontrado em output/`);
        }

        const payloadPath = path.join(packageDir, 'payload.json');
        if (!fs.existsSync(payloadPath)) {
          throw new Error(`payload.json do pacote "${job.packageId}" não foi encontrado.`);
        }

        const payload = JSON.parse(fs.readFileSync(payloadPath, 'utf8'));
        const client = loadClientConfig(job.clientId || payload.client || 'default');

        const dispatchResult = await dispatchToClientChannels({
          client,
          copies: payload.copies,
          images: payload.images,
          article: payload.article,
          packageId: job.packageId,
          outputDir: packageDir,
          targetChannels: job.targetChannels
        });

        job.status = 'published';
        job.executedAt = new Date().toISOString();
        job.results = dispatchResult;
        job.error = null;
        console.log(`✅ [BACKGROUND QUEUE] Job ${job.id} publicado com sucesso!`);
      } catch (err) {
        console.error(`❌ [BACKGROUND QUEUE ERRO] Job ${job.id}:`, err.message);
        job.retries = (job.retries || 0) + 1;
        job.error = err.message;

        if (job.retries >= (job.maxRetries || 3)) {
          job.status = 'failed';
          job.executedAt = new Date().toISOString();
        } else {
          // Re-agenda com backoff exponencial (1min, 2min, 4min)
          const backoffMinutes = Math.pow(2, job.retries);
          job.status = 'scheduled';
          job.scheduledFor = new Date(Date.now() + backoffMinutes * 60000).toISOString();
          console.log(`🔄 [BACKGROUND QUEUE] Job ${job.id} reagendado para daqui a ${backoffMinutes} minuto(s).`);
        }
      }

      saveQueue(queue);
    }
  } catch (err) {
    console.error('[BACKGROUND QUEUE FATAL]:', err.message);
  } finally {
    isProcessing = false;
  }
}

/**
 * Inicia o worker em background com verificação periódica
 */
let workerInterval = null;
function startBackgroundWorker(intervalMs = 25000) {
  if (workerInterval) return;

  console.log(`⚙️ [BACKGROUND WORKER] Agendador de disparos em background ativo (intervalo: ${intervalMs / 1000}s).`);
  // Primeira checagem imediata
  processQueue();

  workerInterval = setInterval(() => {
    processQueue();
  }, intervalMs);

  if (workerInterval.unref) {
    workerInterval.unref();
  }
}

module.exports = {
  enqueueJob,
  getJobs,
  getJob,
  cancelJob,
  retryJob,
  clearCompleted,
  processQueue,
  startBackgroundWorker
};
