const fs = require('fs');
const path = require('path');
const { loadClientConfig } = require('./pipeline');

/**
 * pub_rs — Smart Scheduler & Editorial Calendar Engine
 * Calcula horários ideais de engajamento por rede e consolida eventos do calendário.
 */

// Horários ideais padrão caso o cliente não defina customizados
const DEFAULT_SLOTS = [
  { time: '08:30', days: [1, 2, 3, 4, 5], label: 'Manhã (Pico LinkedIn / B2B)' },
  { time: '12:15', days: [1, 2, 3, 4, 5, 6], label: 'Almoço (Pico Instagram / Threads)' },
  { time: '18:45', days: [1, 2, 3, 4, 5], label: 'Fim de Tarde (Pico Facebook / Multicanal)' }
];

const QUEUE_FILE = path.join(__dirname, '..', 'output', 'dispatch_queue.json');

function getQueueJobs() {
  try {
    if (fs.existsSync(QUEUE_FILE)) {
      return JSON.parse(fs.readFileSync(QUEUE_FILE, 'utf8'));
    }
  } catch {}
  return [];
}

/**
 * Calcula o próximo slot ideal livre para o cliente.
 */
function getNextAvailableSlot(clientId = 'anaue-design') {
  const client = loadClientConfig(clientId);
  const queue = getQueueJobs();
  const slotsConfig = client.smartSlots?.slots || DEFAULT_SLOTS;

  const now = new Date();
  const minStartTime = new Date(now.getTime() + 45 * 60 * 1000); // Mínimo 45 minutos no futuro

  // Busca os próximos 14 dias
  for (let dayOffset = 0; dayOffset < 14; dayOffset++) {
    const candidateDay = new Date(now);
    candidateDay.setDate(candidateDay.getDate() + dayOffset);
    const dayOfWeek = candidateDay.getDay(); // 0 = Domingo, 1 = Segunda, etc.

    // Filtra slots que rodam neste dia da semana
    const matchingSlots = slotsConfig.filter(s => {
      const days = s.days || [1, 2, 3, 4, 5];
      return days.includes(dayOfWeek);
    });

    for (const slot of matchingSlots) {
      const [hours, minutes] = slot.time.split(':').map(Number);
      const slotDate = new Date(candidateDay);
      slotDate.setHours(hours, minutes, 0, 0);

      // Deve ser no futuro
      if (slotDate < minStartTime) continue;

      // Verifica se já existe um job agendado para este cliente nesta mesma faixa (janela de 90 min)
      const hasConflict = queue.some(j => {
        if (j.status === 'cancelled' || j.status === 'failed') return false;
        if (j.clientId && j.clientId !== client.id) return false;
        const jobDate = new Date(j.scheduledFor || j.createdAt);
        return Math.abs(jobDate.getTime() - slotDate.getTime()) < 90 * 60 * 1000;
      });

      if (!hasConflict) {
        const daysMap = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
        return {
          slotDate: slotDate.toISOString(),
          iso: slotDate.toISOString(),
          time: slot.time,
          dayName: daysMap[dayOfWeek],
          formatted: `${slotDate.toLocaleDateString('pt-BR')} às ${slot.time}`,
          label: slot.label || 'Horário de Pico'
        };
      }
    }
  }

  // Fallback para amanhã às 09:00
  const fallbackDate = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  fallbackDate.setHours(9, 0, 0, 0);
  return {
    slotDate: fallbackDate.toISOString(),
    iso: fallbackDate.toISOString(),
    time: '09:00',
    dayName: 'Amanhã',
    formatted: `${fallbackDate.toLocaleDateString('pt-BR')} às 09:00`,
    label: 'Horário Matinal'
  };
}

/**
 * Consolida todos os pacotes gerados e trabalhos na fila em eventos para o Calendário.
 */
function getCalendarEvents({ year, month, clientId } = {}) {
  const outputBase = path.join(__dirname, '..', 'output');
  const events = [];

  const queue = getQueueJobs();

  // 1. Pacotes físicos gerados
  if (fs.existsSync(outputBase)) {
    const dirs = fs.readdirSync(outputBase, { withFileTypes: true })
      .filter(d => d.isDirectory() && d.name.startsWith('20'))
      .map(d => d.name);

    for (const dirName of dirs) {
      try {
        const payloadPath = path.join(outputBase, dirName, 'payload.json');
        if (!fs.existsSync(payloadPath)) continue;

        const payload = JSON.parse(fs.readFileSync(payloadPath, 'utf8'));
        const pkgClientId = payload.client || 'default';

        if (clientId && clientId !== 'all' && pkgClientId !== clientId) {
          continue;
        }

        const dateStr = payload.generatedAt || payload.article?.pubDate || dirName.slice(0, 10);
        const eventDate = new Date(dateStr);

        // Verifica se há job na fila para este pacote
        const linkedJob = queue.find(j => j.packageId === dirName);
        let status = 'draft';
        let scheduledFor = null;

        if (linkedJob) {
          status = linkedJob.status;
          scheduledFor = linkedJob.scheduledFor;
        }

        events.push({
          id: `pkg_${dirName}`,
          packageId: dirName,
          title: payload.article?.title || dirName,
          client: pkgClientId,
          brandName: payload.brand || pkgClientId,
          date: (scheduledFor || eventDate).toISOString(),
          displayTime: new Date(scheduledFor || eventDate).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
          status, // 'published', 'scheduled', 'draft', 'failed'
          hasCarousel: Boolean(payload.carousel),
          targetChannels: linkedJob ? linkedJob.targetChannels : ['linkedin', 'instagram', 'twitter', 'facebook'],
          thumbnailUrl: `/api/media/${dirName}/images/instagram_feed_portrait_4x5.jpg`
        });
      } catch {}
    }
  }

  // 2. Estatísticas do calendário
  const stats = {
    totalEvents: events.length,
    scheduled: events.filter(e => e.status === 'scheduled').length,
    published: events.filter(e => e.status === 'published').length,
    drafts: events.filter(e => e.status === 'draft').length
  };

  const metrics = {
    total: stats.totalEvents,
    scheduled: stats.scheduled,
    published: stats.published,
    drafts: stats.drafts
  };

  return {
    events,
    stats,
    metrics,
    nextSlot: getNextAvailableSlot(clientId && clientId !== 'all' ? clientId : 'anaue-design')
  };
}

module.exports = {
  DEFAULT_SLOTS,
  getNextAvailableSlot,
  getCalendarEvents
};
