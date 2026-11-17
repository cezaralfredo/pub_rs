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

// Gravação atômica segura para evitar corrupção em caso de encerramento inesperado
function atomicWriteJson(filePath, data) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const tempPath = `${filePath}.${Date.now()}.${Math.random().toString(36).slice(2, 7)}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), 'utf8');
  try {
    fs.renameSync(tempPath, filePath);
  } catch {
    try {
      fs.copyFileSync(tempPath, filePath);
      fs.unlinkSync(tempPath);
    } catch {
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
      try { fs.unlinkSync(tempPath); } catch {}
    }
  }
}

// Garante que o arquivo da fila existe
function ensureQueueFile() {
  const dir = path.dirname(QUEUE_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  if (!fs.existsSync(QUEUE_FILE)) {
    atomicWriteJson(QUEUE_FILE, []);
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

// Salva fila de forma atômica
function saveQueue(queue) {
  atomicWriteJson(QUEUE_FILE, queue);
}

// Atualiza um job na fila recarregando os dados mais recentes do disco para evitar condições de corrida
function updateJobInQueue(jobId, updaterFn) {
  const queue = loadQueue();
  const index = queue.findIndex(j => j.id === jobId);
  if (index !== -1) {
    updaterFn(queue[index]);
    saveQueue(queue);
    return queue[index];
  }
  return null;
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
      updateJobInQueue(job.id, j => { j.status = 'processing'; });

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

        // Auto-reparo de copies se estiverem vazias
        let copies = payload.copies;
        if (!copies || !copies.linkedin?.post || copies.linkedin.post.trim().length === 0) {
          const { generateAlgorithmicCopies } = require('./copywriter');
          copies = generateAlgorithmicCopies(payload.article || { title: job.packageId }, client);
          payload.copies = copies;
          try {
            fs.writeFileSync(payloadPath, JSON.stringify(payload, null, 2), 'utf8');
          } catch {}
        }

        const dispatchResult = await dispatchToClientChannels({
          client,
          copies,
          images: payload.images,
          article: payload.article,
          packageId: job.packageId,
          outputDir: packageDir,
          targetChannels: job.targetChannels
        });

        updateJobInQueue(job.id, j => {
          j.status = 'published';
          j.executedAt = new Date().toISOString();
          j.results = dispatchResult;
          j.error = null;
        });
        console.log(`✅ [BACKGROUND QUEUE] Job ${job.id} publicado com sucesso!`);
      } catch (err) {
        console.error(`❌ [BACKGROUND QUEUE ERRO] Job ${job.id}:`, err.message);
        updateJobInQueue(job.id, j => {
          j.retries = (j.retries || 0) + 1;
          j.error = err.message;

          if (j.retries >= (j.maxRetries || 3)) {
            j.status = 'failed';
            j.executedAt = new Date().toISOString();
          } else {
            // Re-agenda com backoff exponencial (1min, 2min, 4min)
            const backoffMinutes = Math.pow(2, j.retries);
            j.status = 'scheduled';
            j.scheduledFor = new Date(Date.now() + backoffMinutes * 60000).toISOString();
            console.log(`🔄 [BACKGROUND QUEUE] Job ${job.id} reagendado para daqui a ${backoffMinutes} minuto(s).`);
          }
        });
      }
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
