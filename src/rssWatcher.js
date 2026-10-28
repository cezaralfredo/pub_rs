const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');
const { runPipeline, loadClientConfig } = require('./pipeline');
const { enqueueJob } = require('./queue');
const { getNextAvailableSlot } = require('./smartScheduler');

/**
 * pub_rs — Autonomous RSS & Sitemap Watcher
 * Monitora feeds de blogs de clientes, detecta novos artigos e aciona o pipeline automaticamente.
 */

const HISTORY_FILE = path.join(__dirname, '..', 'data', 'rss_history.json');

function ensureHistoryFile() {
  const dir = path.dirname(HISTORY_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(HISTORY_FILE)) {
    fs.writeFileSync(HISTORY_FILE, JSON.stringify({
      processedUrls: [],
      lastCheck: null,
      checksCount: 0,
      ingestedCount: 0,
      logs: []
    }, null, 2), 'utf8');
  }
}

function loadRssHistory() {
  ensureHistoryFile();
  try {
    return JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8'));
  } catch {
    return { processedUrls: [], lastCheck: null, checksCount: 0, ingestedCount: 0, logs: [] };
  }
}

function saveRssHistory(history) {
  ensureHistoryFile();
  fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2), 'utf8');
}

/**
 * Faz o download e parse de um feed RSS ou Atom usando cheerio em modo XML.
 */
async function fetchAndParseRss(feedUrl) {
  if (!feedUrl || !feedUrl.startsWith('http')) {
    throw new Error('URL de feed RSS inválida.');
  }

  const res = await fetch(feedUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) pub_rs/3.0 RSSBot',
      'Accept': 'application/rss+xml, application/xml, text/xml, */*'
    }
  });

  if (!res.ok) {
    throw new Error(`Falha HTTP ${res.status} ao acessar feed RSS (${feedUrl}).`);
  }

  const xml = await res.text();
  const $ = cheerio.load(xml, { xmlMode: true });

  const items = [];

  // Padrão RSS 2.0 (<item>)
  $('item').each((_, el) => {
    const title = $(el).find('title').text().trim();
    let link = $(el).find('link').text().trim();
    if (!link) {
      link = $(el).find('guid').text().trim();
    }
    const pubDate = $(el).find('pubDate').text().trim();
    const guid = $(el).find('guid').text().trim() || link;

    if (link && link.startsWith('http')) {
      items.push({ title, link, pubDate, guid });
    }
  });

  // Padrão Atom (<entry>) caso não seja RSS padrão
  if (items.length === 0) {
    $('entry').each((_, el) => {
      const title = $(el).find('title').text().trim();
      let link = $(el).find('link').attr('href') || $(el).find('link').text().trim();
      const pubDate = $(el).find('published, updated').first().text().trim();
      const guid = $(el).find('id').text().trim() || link;

      if (link && link.startsWith('http')) {
        items.push({ title, link, pubDate, guid });
      }
    });
  }

  return items;
}

/**
 * Executa checagem de feeds RSS para os clientes cadastrados.
 */
async function checkClientFeeds({ force = false, clientId = null } = {}) {
  const clientsDir = path.join(__dirname, '..', 'config', 'clients');
  if (!fs.existsSync(clientsDir)) return { processed: 0, newArticles: [] };

  const history = loadRssHistory();
  const files = fs.readdirSync(clientsDir).filter(f => f.endsWith('.json'));

  const newArticles = [];
  const now = new Date();

  console.log(`\n📡 [RSS WATCHER] Iniciando checagem de feeds de blogs (${files.length} clientes)...`);

  for (const file of files) {
    const rawId = file.replace('.json', '');
    if (clientId && clientId !== rawId) continue;

    try {
      const client = loadClientConfig(rawId);
      const rssConfig = client.rss || {};

      // Se o RSS não estiver ativo e não for chamada forçada, pula
      if (!rssConfig.enabled && !force) continue;

      const feedUrl = rssConfig.feedUrl;
      if (!feedUrl) continue;

      console.log(`   🔎 [RSS] Verificando feed de "${client.brandName}": ${feedUrl}`);
      const items = await fetchAndParseRss(feedUrl);
      console.log(`      ✓ ${items.length} artigo(s) encontrados no XML.`);

      for (const item of items) {
        const isProcessed = history.processedUrls.includes(item.link);
        if (isProcessed && !force) continue;

        console.log(`      🚀 [NOVO ARTIGO DETECTADO] "${item.title}"`);
        console.log(`         URL: ${item.link}`);

        // Dispara o pipeline automaticamente (Zero-Click)
        try {
          const pipelineResult = await runPipeline({
            mode: 'url',
            url: item.link,
            clientId: client.id
          });

          // Se autoPublish estiver ligado, agenda automaticamente no próximo slot ideal
          let scheduledJob = null;
          if (rssConfig.autoPublish) {
            const nextSlot = getNextAvailableSlot(client.id);
            scheduledJob = enqueueJob({
              packageId: pipelineResult.packageId,
              clientId: client.id,
              scheduledFor: nextSlot.slotDate,
              targetChannels: ['linkedin', 'instagram', 'twitter', 'facebook']
            });
            console.log(`         ⏰ Agendado automaticamente para: ${nextSlot.formatted}`);
          }

          history.processedUrls.push(item.link);
          history.ingestedCount = (history.ingestedCount || 0) + 1;

          newArticles.push({
            title: item.title,
            link: item.link,
            client: client.id,
            packageId: pipelineResult.packageId,
            autoScheduled: Boolean(scheduledJob),
            scheduledFor: scheduledJob?.scheduledFor || null
          });
        } catch (pipeErr) {
          console.error(`      ❌ Falha no processamento automático de ${item.link}:`, pipeErr.message);
        }
      }
    } catch (err) {
      console.warn(`   ⚠️ Erro ao checar feed do cliente "${rawId}": ${err.message}`);
    }
  }

  history.lastCheck = now.toISOString();
  history.checksCount = (history.checksCount || 0) + 1;

  if (newArticles.length > 0) {
    history.logs.unshift({
      timestamp: now.toISOString(),
      articlesFound: newArticles.length,
      articles: newArticles
    });
    history.logs = history.logs.slice(0, 30); // Mantém últimos 30 logs
  }

  saveRssHistory(history);
  console.log(`📡 [RSS WATCHER] Checagem finalizada. ${newArticles.length} novo(s) artigo(s) processado(s).\n`);

  return {
    lastCheck: history.lastCheck,
    checksCount: history.checksCount,
    ingestedCount: history.ingestedCount,
    newArticles
  };
}

/**
 * Inicia o monitor autônomo em background com intervalo configurado.
 */
let watcherInterval = null;
function startRssWatcher(intervalMinutes = 30) {
  if (watcherInterval) return;

  const ms = intervalMinutes * 60 * 1000;
  console.log(`📡 [RSS WATCHER] Monitor autônomo de blogs ativado (intervalo: ${intervalMinutes} minutos).`);

  // Checagem inicial após 1 minuto de inicialização do servidor
  setTimeout(() => {
    checkClientFeeds().catch(() => {});
  }, 60000);

  watcherInterval = setInterval(() => {
    checkClientFeeds().catch(() => {});
  }, ms);

  if (watcherInterval.unref) {
    watcherInterval.unref();
  }
}

module.exports = {
  fetchAndParseRss,
  checkClientFeeds,
  startRssWatcher,
  loadRssHistory
};
