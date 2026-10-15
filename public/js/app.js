/**
 * pub_rs Studio — Lógica de Interface, Conexão SSE, Configuração de Canais e Publicação Direta
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
    btnPublishChannels: document.getElementById('btn-publish-channels'),
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

    // Modal Clients & Canais
    modalClients: document.getElementById('modal-clients'),
    btnCloseModalClients: document.getElementById('btn-close-modal-clients'),
    btnCancelClient: document.getElementById('btn-cancel-client'),
    btnTestClientConn: document.getElementById('btn-test-client-conn'),
    formEditClient: document.getElementById('form-edit-client'),

    // Modal Dispatch Result
    modalDispatchResult: document.getElementById('modal-dispatch-result'),
    btnCloseDispatchModal: document.getElementById('btn-close-dispatch-modal'),
    btnOkDispatch: document.getElementById('btn-ok-dispatch'),
    dispatchResultsList: document.getElementById('dispatch-results-list'),

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

      const optionsHtml = clients.map(c => 
        `<option value="${c.id}">${c.name || c.brandName} (${c.id})</option>`
      ).join('');

      elements.topClientSelect.innerHTML = optionsHtml;
      elements.formClientSelect.innerHTML = optionsHtml;

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

    // Abas do Modal de Clientes
    document.querySelectorAll('.cl-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.cl-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.cl-tab-panel').forEach(p => p.classList.remove('active'));

        tab.classList.add('active');
        const targetId = tab.getAttribute('data-cl-tab');
        const targetPanel = document.getElementById(targetId);
        if (targetPanel) targetPanel.classList.add('active');
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

    // Botão de Publicação Direta nos Canais
    elements.btnPublishChannels.addEventListener('click', () => {
      publishCurrentPackageToChannels();
    });

    // Fechar Modal de Disparo
    elements.btnCloseDispatchModal.addEventListener('click', () => {
      elements.modalDispatchResult.classList.add('hidden');
    });
    elements.btnOkDispatch.addEventListener('click', () => {
      elements.modalDispatchResult.classList.add('hidden');
    });

    // Abrir Modal de Clientes & Preencher com Cliente Selecionado
    elements.btnManageClients.addEventListener('click', async () => {
      const selectedId = elements.topClientSelect.value || 'anaue-design';
      await populateClientModal(selectedId);
      elements.modalClients.classList.remove('hidden');
    });

    elements.btnCloseModalClients.addEventListener('click', () => {
      elements.modalClients.classList.add('hidden');
    });
    elements.btnCancelClient.addEventListener('click', () => {
      elements.modalClients.classList.add('hidden');
    });

    // Testar Conexão do Cliente
    elements.btnTestClientConn.addEventListener('click', async () => {
      const clientId = document.getElementById('cl-id').value.trim();
      if (!clientId) {
        showToast('Salve o cliente primeiro para testar conexões.', 'warning');
        return;
      }
      try {
        showToast('Testando conexões...', 'info');
        const res = await fetch(`/api/clients/${clientId}/test-connection`, { method: 'POST' });
        const data = await res.json();
        if (data.success) {
          const webhookMsg = data.testResults?.webhook ? `Webhook: ${data.testResults.webhook.status.toUpperCase()}` : 'Webhook não configurado';
          showToast(`Conexão testada! ${webhookMsg}.`, 'success');
        } else {
          showToast('Falha ao testar conexão.', 'error');
        }
      } catch (err) {
        showToast(`Erro no teste: ${err.message}`, 'error');
      }
    });

    // Salvar Cliente com Dados de Redes e LLM
    elements.formEditClient.addEventListener('submit', async (e) => {
      e.preventDefault();

      const clientPayload = {
        id: document.getElementById('cl-id').value.trim(),
        brandName: document.getElementById('cl-brandName').value.trim(),
        brandHandle: document.getElementById('cl-handle').value.trim(),
        tone: document.getElementById('cl-tone').value.trim(),
        targetAudience: document.getElementById('cl-audience').value.trim(),
        defaultHashtags: document.getElementById('cl-hashtags').value.split(',').map(s => s.trim()).filter(Boolean),
        callToAction: document.getElementById('cl-cta').value.trim(),
        commentTemplate: document.getElementById('cl-comment-tpl').value.trim(),
        generateAiImage: document.getElementById('cl-gen-ai-image').checked,
        llm: {
          provider: document.getElementById('cl-llm-provider').value,
          model: document.getElementById('cl-llm-model').value.trim(),
          apiKey: document.getElementById('cl-llm-key').value.trim()
        },
        channels: {
          webhook: {
            enabled: document.getElementById('ch-webhook-enabled').checked,
            url: document.getElementById('ch-webhook-url').value.trim()
          },
          buffer: {
            enabled: document.getElementById('ch-buffer-enabled').checked,
            accessToken: document.getElementById('ch-buffer-token').value.trim(),
            profileIds: document.getElementById('ch-buffer-profiles').value.split(',').map(s => s.trim()).filter(Boolean)
          },
          linkedin: {
            enabled: document.getElementById('ch-linkedin-enabled').checked,
            accessToken: document.getElementById('ch-linkedin-token').value.trim(),
            authorUrn: document.getElementById('ch-linkedin-urn').value.trim()
          },
          twitter: {
            enabled: document.getElementById('ch-twitter-enabled').checked,
            bearerToken: document.getElementById('ch-twitter-token').value.trim()
          }
        }
      };

      try {
        const res = await fetch('/api/clients', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(clientPayload)
        });

        if (res.ok) {
          const result = await res.json();
          showToast(`Cliente "${result.client.brandName}" salvo com sucesso!`, 'success');
          elements.modalClients.classList.add('hidden');
          await loadClients();
          elements.formClientSelect.value = result.client.id;
          elements.topClientSelect.value = result.client.id;
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
      showToast('pub_rs Studio v2.5 · Automação Omnichannel, Publicação Direta e Multi-LLM.', 'info');
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

    setLoadingState(true);
    resetStepCards();
    elements.pipelineMonitor.classList.remove('hidden');
    elements.resultsStudio.classList.add('hidden');
    elements.pipelineMonitor.scrollIntoView({ behavior: 'smooth', block: 'start' });

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
    const { step, message } = data;

    if (elements.pipelineMainStatus) {
      elements.pipelineMainStatus.textContent = message || 'Processando...';
    }

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
  // 4. EXIBIÇÃO DOS RESULTADOS NO STUDIO & DISPARO
  // ===========================================================================
  function displayResults(data) {
    state.currentPackage = data;

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

    elements.resultsStudio.classList.remove('hidden');
    elements.resultsStudio.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function publishCurrentPackageToChannels() {
    if (!state.currentPackage?.packageId) {
      showToast('Nenhum pacote carregado para publicação.', 'warning');
      return;
    }

    elements.modalDispatchResult.classList.remove('hidden');
    elements.dispatchResultsList.innerHTML = `
      <div class="dispatch-item">
        <p>🚀 Disparando pacote <strong>${state.currentPackage.packageId}</strong> para os canais do cliente...</p>
      </div>
    `;

    try {
      const res = await fetch(`/api/packages/${state.currentPackage.packageId}/publish`, {
        method: 'POST'
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha no disparo');

      renderDispatchResults(data.dispatchResult);
      showToast('Disparo concluído!', 'success');
    } catch (err) {
      elements.dispatchResultsList.innerHTML = `
        <div class="dispatch-item">
          <div class="dispatch-badge error">Erro</div>
          <p class="dispatch-detail-msg">${err.message}</p>
        </div>
      `;
    }
  }

  function renderDispatchResults(dispatchResult) {
    const channels = dispatchResult?.channels || {};
    const channelKeys = Object.keys(channels);

    if (channelKeys.length === 0) {
      elements.dispatchResultsList.innerHTML = `
        <div class="dispatch-item">
          <p>Nenhum canal ativo foi encontrado no perfil do cliente.</p>
        </div>
      `;
      return;
    }

    const channelLabels = {
      webhook: 'Webhook (n8n / Make / Metricool)',
      buffer: 'Buffer API',
      linkedin: 'LinkedIn Direct Share',
      twitter: 'X (Twitter API v2)'
    };

    elements.dispatchResultsList.innerHTML = channelKeys.map(key => {
      const ch = channels[key];
      const isSuccess = ch.status === 'success' || ch.status === 'completed';
      const isSkipped = ch.status === 'skipped';
      const badgeClass = isSuccess ? 'success' : isSkipped ? 'skipped' : 'error';
      const badgeLabel = isSuccess ? 'Enviado ✓' : isSkipped ? 'Não configurado' : 'Falha';

      let detailHtml = '';
      if (ch.postUrl) {
        detailHtml = `<a href="${ch.postUrl}" target="_blank" class="dispatch-url">Ver publicação no LinkedIn ↗</a>`;
      } else if (ch.firstTweetUrl) {
        detailHtml = `<a href="${ch.firstTweetUrl}" target="_blank" class="dispatch-url">Ver fio no X/Twitter ↗</a>`;
      } else if (ch.message) {
        detailHtml = `<span class="dispatch-detail-msg">${ch.message}</span>`;
      } else if (ch.error) {
        detailHtml = `<span class="dispatch-detail-msg">${ch.error}</span>`;
      }

      return `
        <div class="dispatch-item">
          <div class="dispatch-item-header">
            <span class="dispatch-channel-title">${channelLabels[key] || key}</span>
            <span class="dispatch-badge ${badgeClass}">${badgeLabel}</span>
          </div>
          ${detailHtml}
        </div>
      `;
    }).join('');
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

    if (firstComment) {
      elements.firstCommentWrap.classList.remove('hidden');
      elements.currentCommentText.textContent = firstComment;
    } else {
      elements.firstCommentWrap.classList.add('hidden');
    }
  }

  function renderMediaGallery(packageId) {
    if (!packageId) return;

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

  // Preencher formulário de cliente
  async function populateClientModal(clientId) {
    try {
      const res = await fetch(`/api/clients/${clientId}`);
      if (!res.ok) return;
      const client = await res.json();

      document.getElementById('cl-id').value = client.id || '';
      document.getElementById('cl-brandName').value = client.brandName || '';
      document.getElementById('cl-handle').value = client.brandHandle || '';
      document.getElementById('cl-tone').value = client.tone || '';
      document.getElementById('cl-audience').value = client.targetAudience || '';
      document.getElementById('cl-hashtags').value = (client.defaultHashtags || []).join(', ');
      document.getElementById('cl-cta').value = client.callToAction || '';
      document.getElementById('cl-comment-tpl').value = client.commentTemplate || '';
      document.getElementById('cl-gen-ai-image').checked = Boolean(client.generateAiImage !== false);

      // LLM
      document.getElementById('cl-llm-provider').value = client.llm?.provider || 'auto';
      document.getElementById('cl-llm-model').value = client.llm?.model || '';
      document.getElementById('cl-llm-key').value = client.llm?.apiKey || '';

      // Canais
      const ch = client.channels || {};
      document.getElementById('ch-webhook-enabled').checked = Boolean(ch.webhook?.enabled !== false);
      document.getElementById('ch-webhook-url').value = ch.webhook?.url || client.webhookUrl || '';

      document.getElementById('ch-buffer-enabled').checked = Boolean(ch.buffer?.enabled);
      document.getElementById('ch-buffer-token').value = ch.buffer?.accessToken || '';
      document.getElementById('ch-buffer-profiles').value = (ch.buffer?.profileIds || []).join(', ');

      document.getElementById('ch-linkedin-enabled').checked = Boolean(ch.linkedin?.enabled);
      document.getElementById('ch-linkedin-token').value = ch.linkedin?.accessToken || '';
      document.getElementById('ch-linkedin-urn').value = ch.linkedin?.authorUrn || '';

      document.getElementById('ch-twitter-enabled').checked = Boolean(ch.twitter?.enabled);
      document.getElementById('ch-twitter-token').value = ch.twitter?.bearerToken || ch.twitter?.accessToken || '';
    } catch (err) {
      console.warn('Erro ao carregar dados do cliente:', err);
    }
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
