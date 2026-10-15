/**
 * pub_rs Studio — Lógica de Interface e Conexão em Tempo Real (SSE)
 */

document.addEventListener('DOMContentLoaded', () => {
  // Estado da Aplicação
  const state = {
    currentPackage: null,
    currentNetwork: 'linkedin',
    clients: [],
    status: null
  };

  // Elementos do DOM
  const elements = {
    // Topbar
    providerPill: document.getElementById('provider-status-text'),
    topClientSelect: document.getElementById('top-client-select'),
    btnHistory: document.getElementById('btn-history'),
    btnManageClients: document.getElementById('btn-manage-clients'),
    btnInfo: document.getElementById('btn-info'),

    // Generator Form
    generateForm: document.getElementById('generate-form'),
    inputUrl: document.getElementById('input-url'),
    btnPasteUrl: document.getElementById('btn-paste-url'),
    formClientSelect: document.getElementById('form-client-select'),
    formProviderSelect: document.getElementById('form-provider-select'),
    formModelInput: document.getElementById('form-model-input'),
    toggleAiImage: document.getElementById('toggle-ai-image'),
    btnGenerate: document.getElementById('btn-generate'),
    btnGenerateText: document.getElementById('btn-generate-text'),

    // Pipeline Monitor
    pipelineMonitor: document.getElementById('pipeline-monitor'),
    pipelineMainStatus: document.getElementById('pipeline-main-status'),
    steps: {
      1: { card: document.getElementById('step-1'), detail: document.getElementById('step-1-detail') },
      2: { card: document.getElementById('step-2'), detail: document.getElementById('step-2-detail') },
      3: { card: document.getElementById('step-3'), detail: document.getElementById('step-3-detail') },
      4: { card: document.getElementById('step-4'), detail: document.getElementById('step-4-detail') }
    },

    // Results Studio
    resultsStudio: document.getElementById('results-studio'),
    resClientTag: document.getElementById('res-client-tag'),
    resArticleTitle: document.getElementById('res-article-title'),
    resEngineTag: document.getElementById('res-engine-tag'),
    resDateTag: document.getElementById('res-date-tag'),
    resArticleLink: document.getElementById('res-article-link'),
    btnDownloadJson: document.getElementById('btn-download-json'),
    btnCopyAll: document.getElementById('btn-copy-all'),

    // Copy Tabs
    currentNetName: document.getElementById('current-net-name'),
    currentNetFormat: document.getElementById('current-net-format'),
    currentCharCount: document.getElementById('current-char-count'),
    currentPostText: document.getElementById('current-post-text'),
    firstCommentWrap: document.getElementById('first-comment-wrap'),
    currentCommentText: document.getElementById('current-comment-text'),
    btnCopyPost: document.getElementById('btn-copy-post'),
    btnCopyComment: document.getElementById('btn-copy-comment'),

    // Media Cards
    img16x9: document.getElementById('img-16x9'),
    img4x5: document.getElementById('img-4x5'),
    img1x1: document.getElementById('img-1x1'),
    img9x16: document.getElementById('img-9x16'),
    linkWebp16x9: document.getElementById('link-webp-16x9'),
    linkJpg16x9: document.getElementById('link-jpg-16x9'),
    linkWebp4x5: document.getElementById('link-webp-4x5'),
    linkJpg4x5: document.getElementById('link-jpg-4x5'),
    linkWebp1x1: document.getElementById('link-webp-1x1'),
    linkJpg1x1: document.getElementById('link-jpg-1x1'),
    linkWebp9x16: document.getElementById('link-webp-9x16'),
    linkJpg9x16: document.getElementById('link-jpg-9x16'),

    // Report & Payload
    reportContainer: document.getElementById('report-md-container'),
    payloadContainer: document.getElementById('payload-json-container'),
    btnCopyJson: document.getElementById('btn-copy-json'),

    // Modal Clients
    modalClients: document.getElementById('modal-clients'),
    btnCloseModalClients: document.getElementById('btn-close-modal-clients'),
    btnCancelClient: document.getElementById('btn-cancel-client'),
    formEditClient: document.getElementById('form-edit-client'),

    // Drawer History
    drawerHistory: document.getElementById('drawer-history'),
    btnCloseDrawer: document.getElementById('btn-close-drawer'),
    historyContainer: document.getElementById('history-items-container'),

    // Toast Container
    toastContainer: document.getElementById('toast-container')
  };

  // ===========================================================================
  // 1. INICIALIZAÇÃO & DADOS INICIAIS
  // ===========================================================================
  async function init() {
    setupEventListeners();
    await loadStatus();
    await loadClients();
  }

  async function loadStatus() {
    try {
      const res = await fetch('/api/status');
      const data = await res.json();
      state.status = data;

      if (data.providers && data.providers.length > 0) {
        elements.providerPill.textContent = `IA Ativa: ${data.providers.join(', ').toUpperCase()}`;
      } else {
        elements.providerPill.textContent = 'Motor Dinâmico Nativo (Sem IA)';
      }
    } catch {
      elements.providerPill.textContent = 'pub_rs Conectado';
    }
  }

  async function loadClients() {
    try {
      const res = await fetch('/api/clients');
      const clients = await res.json();
      state.clients = clients;

      // Atualiza os dropdowns
      const optionsHtml = clients.map(c => 
        `<option value="${c.id}">${c.name || c.brandName} (${c.id})</option>`
      ).join('');

      elements.topClientSelect.innerHTML = optionsHtml;
      elements.formClientSelect.innerHTML = optionsHtml;

      // Sincroniza seletor da topbar com o formulário
      elements.topClientSelect.addEventListener('change', (e) => {
        elements.formClientSelect.value = e.target.value;
      });
      elements.formClientSelect.addEventListener('change', (e) => {
        elements.topClientSelect.value = e.target.value;
      });
    } catch (err) {
      console.error('Falha ao carregar clientes:', err);
    }
  }

  // ===========================================================================
  // 2. EVENT LISTENERS
  // ===========================================================================
  function setupEventListeners() {
    // Botão Colar URL
    elements.btnPasteUrl.addEventListener('click', async () => {
      try {
        const text = await navigator.clipboard.readText();
        if (text && (text.startsWith('http://') || text.startsWith('https://'))) {
          elements.inputUrl.value = text.trim();
          showToast('URL colada com sucesso!', 'success');
        } else {
          showToast('Nenhuma URL válida encontrada na área de transferência.', 'warning');
        }
      } catch {
        elements.inputUrl.focus();
      }
    });

    // Submissão do Formulário de Geração
    elements.generateForm.addEventListener('submit', (e) => {
      e.preventDefault();
      startGenerationStream();
    });

    // Navegação das Abas Principais do Studio
    document.querySelectorAll('.studio-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.studio-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));

        tab.classList.add('active');
        const targetId = tab.getAttribute('data-tab');
        const targetPanel = document.getElementById(targetId);
        if (targetPanel) targetPanel.classList.add('active');
      });
    });

    // Navegação das Redes Sociais
    document.querySelectorAll('.net-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.net-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        const net = btn.getAttribute('data-network');
        state.currentNetwork = net;
        renderCurrentNetworkCopy();
      });
    });

    // Botões de Cópia
    elements.btnCopyPost.addEventListener('click', () => {
      copyToClipboard(elements.currentPostText.textContent, 'Texto do post copiado!');
    });

    elements.btnCopyComment.addEventListener('click', () => {
      copyToClipboard(elements.currentCommentText.textContent, '1º Comentário copiado!');
    });

    elements.btnCopyJson.addEventListener('click', () => {
      copyToClipboard(elements.payloadContainer.textContent, 'JSON copiado!');
    });

    elements.btnCopyAll.addEventListener('click', () => {
      if (state.currentPackage?.reportMd) {
        copyToClipboard(state.currentPackage.reportMd, 'Relatório executivo copiado!');
      }
    });

    elements.btnDownloadJson.addEventListener('click', () => {
      if (state.currentPackage?.payload) {
        const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(state.currentPackage.payload, null, 2));
        const dlAnchor = document.createElement('a');
        dlAnchor.setAttribute('href', dataStr);
        dlAnchor.setAttribute('download', `payload_${state.currentPackage.packageId}.json`);
        dlAnchor.click();
      }
    });

    // Modal Clientes
    elements.btnManageClients.addEventListener('click', () => {
      elements.modalClients.classList.remove('hidden');
    });
    elements.btnCloseModalClients.addEventListener('click', () => {
      elements.modalClients.classList.add('hidden');
    });
    elements.btnCancelClient.addEventListener('click', () => {
      elements.modalClients.classList.add('hidden');
    });

    // Salvar Novo Cliente
    elements.formEditClient.addEventListener('submit', async (e) => {
      e.preventDefault();
      const newClient = {
        id: document.getElementById('cl-id').value.trim(),
        brandName: document.getElementById('cl-brandName').value.trim(),
        brandHandle: document.getElementById('cl-handle').value.trim(),
        tone: document.getElementById('cl-tone').value.trim(),
        targetAudience: document.getElementById('cl-audience').value.trim(),
        llmProvider: document.getElementById('cl-provider').value,
        defaultHashtags: document.getElementById('cl-hashtags').value.split(',').map(s => s.trim()).filter(Boolean),
        callToAction: document.getElementById('cl-cta').value.trim(),
        webhookUrl: document.getElementById('cl-webhook').value.trim()
      };

      try {
        const res = await fetch('/api/clients', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(newClient)
        });
        if (res.ok) {
          showToast(`Cliente "${newClient.brandName}" salvo com sucesso!`, 'success');
          elements.modalClients.classList.add('hidden');
          elements.formEditClient.reset();
          await loadClients();
          elements.formClientSelect.value = newClient.id;
          elements.topClientSelect.value = newClient.id;
        } else {
          const errData = await res.json();
          showToast(`Erro: ${errData.error}`, 'error');
        }
      } catch (err) {
        showToast(`Erro ao salvar cliente: ${err.message}`, 'error');
      }
    });

    // Drawer Histórico
    elements.btnHistory.addEventListener('click', async () => {
      elements.drawerHistory.classList.remove('hidden');
      await loadHistory();
    });
    elements.btnCloseDrawer.addEventListener('click', () => {
      elements.drawerHistory.classList.add('hidden');
    });

    // Botão Info
    elements.btnInfo.addEventListener('click', () => {
      showToast('pub_rs Studio v2.0 · Automação Omnichannel com Multi-LLM e Sharp.', 'info');
    });
  }

  // ===========================================================================
  // 3. FLUXO DE EXECUÇÃO EM TEMPO REAL (SSE STREAMING)
  // ===========================================================================
  function startGenerationStream() {
    const url = elements.inputUrl.value.trim();
    if (!url) {
      showToast('Por favor, informe a URL do artigo.', 'warning');
      return;
    }

    const clientId = elements.formClientSelect.value;
    const provider = elements.formProviderSelect.value;
    const model = elements.formModelInput.value.trim();
    const aiImage = elements.toggleAiImage.checked;

    // Atualiza estado visual de início
    setLoadingState(true);
    resetStepCards();
    elements.pipelineMonitor.classList.remove('hidden');
    elements.resultsStudio.classList.add('hidden');
    elements.pipelineMonitor.scrollIntoView({ behavior: 'smooth', block: 'start' });

    // Monta URL do endpoint SSE
    const streamUrl = `/api/generate/stream?url=${encodeURIComponent(url)}&clientId=${encodeURIComponent(clientId)}&provider=${encodeURIComponent(provider)}&model=${encodeURIComponent(model)}&aiImage=${aiImage}`;

    const eventSource = new EventSource(streamUrl);

    eventSource.addEventListener('progress', (e) => {
      try {
        const data = JSON.parse(e.data);
        handleStepProgress(data);
      } catch (err) {
        console.error('Erro ao interpretar evento progress:', err);
      }
    });

    eventSource.addEventListener('done', (e) => {
      try {
        const data = JSON.parse(e.data);
        eventSource.close();
        setLoadingState(false);
        markAllStepsCompleted();
        displayResults(data);
        showToast('Pacote omnichannel concluído com sucesso!', 'success');
      } catch (err) {
        console.error('Erro ao interpretar evento done:', err);
      }
    });

    eventSource.addEventListener('error', (e) => {
      eventSource.close();
      setLoadingState(false);
      try {
        const data = JSON.parse(e.data || '{}');
        showToast(data.error || 'Ocorreu uma falha no processamento.', 'error');
      } catch {
        showToast('Falha na conexão com o servidor.', 'error');
      }
      elements.pipelineMainStatus.textContent = 'Erro';
      elements.pipelineMainStatus.style.color = '#f43f5e';
    });
  }

  function handleStepProgress(data) {
    const { step, status, message } = data;

    if (elements.pipelineMainStatus) {
      elements.pipelineMainStatus.textContent = message || 'Processando...';
    }

    // Gerencia o status visual de cada etapa (1 a 4)
    for (let i = 1; i <= 4; i++) {
      const card = elements.steps[i].card;
      if (i < step) {
        card.className = 'step-card completed';
      } else if (i === step) {
        card.className = 'step-card active';
        if (elements.steps[i].detail && message) {
          elements.steps[i].detail.textContent = message;
        }
      } else {
        card.className = 'step-card';
      }
    }
  }

  function markAllStepsCompleted() {
    for (let i = 1; i <= 4; i++) {
      elements.steps[i].card.className = 'step-card completed';
    }
    elements.pipelineMainStatus.textContent = 'Concluído com Sucesso!';
  }

  function resetStepCards() {
    elements.pipelineMainStatus.textContent = 'Iniciando pipeline...';
    for (let i = 1; i <= 4; i++) {
      elements.steps[i].card.className = 'step-card';
      elements.steps[i].detail.textContent = 'Aguardando...';
    }
  }

  function setLoadingState(isLoading) {
    elements.btnGenerate.disabled = isLoading;
    if (isLoading) {
      elements.btnGenerateText.textContent = 'Processando Artigo...';
      elements.btnGenerate.style.opacity = '0.7';
    } else {
      elements.btnGenerateText.textContent = 'Gerar Pacote Omnichannel';
      elements.btnGenerate.style.opacity = '1';
    }
  }

  // ===========================================================================
  // 4. EXIBIÇÃO DOS RESULTADOS NO STUDIO
  // ===========================================================================
  function displayResults(data) {
    state.currentPackage = data;

    // Metadados do Artigo
    elements.resClientTag.textContent = data.client?.brandName || data.client?.name || 'Cliente';
    elements.resArticleTitle.textContent = data.article?.title || 'Artigo Processado';
    elements.resEngineTag.textContent = `⚡ Motor: ${data.copies?.meta?.generator || 'IA'}`;
    elements.resDateTag.textContent = `📅 ${new Date().toLocaleDateString('pt-BR')}`;
    elements.resArticleLink.href = data.article?.canonicalUrl || data.article?.url || '#';

    // 1. Copies
    state.currentNetwork = 'linkedin';
    document.querySelectorAll('.net-btn').forEach(b => b.classList.remove('active'));
    document.querySelector('.net-btn[data-network="linkedin"]')?.classList.add('active');
    renderCurrentNetworkCopy();

    // 2. Mídias
    renderMediaGallery(data.packageId);

    // 3. Relatório Executivo
    if (data.reportMd) {
      elements.reportContainer.innerHTML = simpleMarkdownToHtml(data.reportMd);
    } else {
      elements.reportContainer.innerHTML = simpleMarkdownToHtml(generateSummaryMarkdown(data));
    }

    // 4. Payload JSON
    const fullPayload = {
      client: data.client,
      article: data.article,
      copies: data.copies,
      images: data.images,
      webhookResult: data.webhookResult
    };
    elements.payloadContainer.textContent = JSON.stringify(fullPayload, null, 2);

    // Exibe o painel de resultados com animação suave
    elements.resultsStudio.classList.remove('hidden');
    elements.resultsStudio.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function renderCurrentNetworkCopy() {
    if (!state.currentPackage?.copies) return;
    const copies = state.currentPackage.copies;
    const net = state.currentNetwork;

    const netLabels = {
      linkedin: 'LinkedIn Post',
      instagram: 'Instagram Feed (Carrossel / Retrato)',
      stories: 'Instagram Stories (Teaser)',
      twitter: 'X (Twitter) Thread',
      threads: 'Threads Post',
      facebook: 'Facebook Post'
    };

    elements.currentNetName.textContent = netLabels[net] || 'Post';

    let postText = '';
    let firstComment = '';
    let formatDesc = '';

    if (net === 'linkedin') {
      postText = copies.linkedin?.post || '';
      firstComment = copies.linkedin?.firstComment || '';
      formatDesc = 'Formato ideal: 16:9 ou 1:1';
    } else if (net === 'instagram') {
      postText = copies.instagram?.post || '';
      firstComment = copies.instagram?.firstComment || '';
      formatDesc = 'Formato ideal: 4:5 Retrato (Feed)';
    } else if (net === 'stories') {
      postText = copies.stories?.post || '';
      formatDesc = 'Formato ideal: 9:16 Vertical';
    } else if (net === 'twitter') {
      postText = Array.isArray(copies.twitter?.thread) 
        ? copies.twitter.thread.join('\n\n───────────────\n\n')
        : (copies.twitter?.post || '');
      formatDesc = 'Formato ideal: 16:9 Horizontal';
    } else if (net === 'threads') {
      postText = copies.threads?.post || '';
      formatDesc = 'Formato ideal: 1:1 Quadrado';
    } else if (net === 'facebook') {
      postText = copies.facebook?.post || '';
      formatDesc = 'Formato ideal: 16:9 Horizontal';
    }

    elements.currentNetFormat.textContent = formatDesc;
    elements.currentPostText.textContent = postText;
    elements.currentCharCount.textContent = `${postText.length} caracteres`;

    // 1º Comentário
    if (firstComment) {
      elements.firstCommentWrap.classList.remove('hidden');
      elements.currentCommentText.textContent = firstComment;
    } else {
      elements.firstCommentWrap.classList.add('hidden');
    }
  }

  function renderMediaGallery(packageId) {
    if (!packageId) return;

    // Atualiza URLs das imagens
    const setImg = (elImg, elWebp, elJpg, baseName) => {
      const webpUrl = `/api/media/${packageId}/${baseName}.webp`;
      const jpgUrl = `/api/media/${packageId}/${baseName}.jpg`;

      elImg.src = webpUrl;
      elImg.onerror = () => { elImg.src = jpgUrl; };

      elWebp.href = webpUrl;
      elJpg.href = jpgUrl;
    };

    setImg(elements.img16x9, elements.linkWebp16x9, elements.linkJpg16x9, 'linkedin_twitter_facebook_16x9');
    setImg(elements.img4x5, elements.linkWebp4x5, elements.linkJpg4x5, 'instagram_feed_portrait_4x5');
    setImg(elements.img1x1, elements.linkWebp1x1, elements.linkJpg1x1, 'instagram_threads_square_1x1');
    setImg(elements.img9x16, elements.linkWebp9x16, elements.linkJpg9x16, 'instagram_stories_reels_9x16');
  }

  // ===========================================================================
  // 5. CARREGAR HISTÓRICO
  // ===========================================================================
  async function loadHistory() {
    try {
      const res = await fetch('/api/packages');
      const packages = await res.json();

      if (!packages || packages.length === 0) {
        elements.historyContainer.innerHTML = '<p class="history-empty">Nenhum pacote anterior encontrado.</p>';
        return;
      }

      elements.historyContainer.innerHTML = packages.map(pkg => `
        <div class="history-item" data-id="${pkg.id}">
          <div class="history-item-title">${escapeHtml(pkg.title)}</div>
          <div class="history-item-meta">
            <span>Cliente: ${pkg.client || 'Padrão'}</span> · 
            <span>${pkg.id.slice(0, 10)}</span>
          </div>
        </div>
      `).join('');

      // Adiciona clique para abrir pacote anterior
      document.querySelectorAll('.history-item').forEach(item => {
        item.addEventListener('click', async () => {
          const pkgId = item.getAttribute('data-id');
          await openSavedPackage(pkgId);
          elements.drawerHistory.classList.add('hidden');
        });
      });
    } catch (err) {
      elements.historyContainer.innerHTML = `<p class="history-empty">Erro ao carregar histórico: ${err.message}</p>`;
    }
  }

  async function openSavedPackage(pkgId) {
    try {
      showToast('Carregando pacote salvo...', 'info');
      const res = await fetch(`/api/packages/${pkgId}`);
      if (!res.ok) throw new Error('Falha ao abrir pacote.');
      const data = await res.json();

      displayResults({
        packageId: data.packageId,
        article: data.payload?.article,
        client: data.payload?.client,
        copies: data.payload?.copies,
        images: data.payload?.images,
        reportMd: data.reportMd
      });
      showToast('Pacote carregado no estúdio!', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  // ===========================================================================
  // 6. UTILITÁRIOS: CLIPBOARD, TOASTS & MARKDOWN SIMPLES
  // ===========================================================================
  async function copyToClipboard(text, successMessage = 'Copiado!') {
    try {
      await navigator.clipboard.writeText(text);
      showToast(successMessage, 'success');
    } catch {
      showToast('Falha ao copiar texto.', 'error');
    }
  }

  function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;

    elements.toastContainer.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      setTimeout(() => toast.remove(), 300);
    }, 3200);
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function generateSummaryMarkdown(data) {
    return `# 📦 Pacote de Distribuição · ${data.article?.title}
**Cliente:** ${data.client?.brandName || 'Cliente'}  
**Data:** ${new Date().toLocaleString('pt-BR')}  

O pacote foi gerado com sucesso nos formatos oficiais de redes sociais. Acesse a aba **Copies por Rede** para visualizar e copiar os textos individuais.`;
  }

  function simpleMarkdownToHtml(md) {
    if (!md) return '';
    return md
      .replace(/^### (.*$)/gim, '<h3>$1</h3>')
      .replace(/^## (.*$)/gim, '<h2>$1</h2>')
      .replace(/^# (.*$)/gim, '<h1>$1</h1>')
      .replace(/^\> (.*$)/gim, '<blockquote>$1</blockquote>')
      .replace(/\*\*(.*)\*\*/gim, '<strong>$1</strong>')
      .replace(/```([\s\S]*?)```/gim, '<pre><code>$1</code></pre>')
      .replace(/\n\n/gim, '<br><br>');
  }

  // Inicializa o Studio
  init();
});
