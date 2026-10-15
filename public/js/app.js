/**
 * pub_rs Studio — Lógica de Interface, Conexão SSE, Configuração de Canais, Testes de IA e Fila de Background
 */

document.addEventListener('DOMContentLoaded', () => {
  // Estado da Aplicação
  const state = {
    currentPackage: null,
    currentNetwork: 'linkedin',
    clients: [],
    status: null,
    selectedModalClientId: null
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
    modalClientSelect: document.getElementById('modal-client-select'),
    btnNewClient: document.getElementById('btn-new-client'),
    btnDeleteClient: document.getElementById('btn-delete-client'),
    btnCloseModalClients: document.getElementById('btn-close-modal-clients'),
    btnCancelClient: document.getElementById('btn-cancel-client'),
    btnTestClientConn: document.getElementById('btn-test-client-conn'),
    btnToggleKeyEye: document.getElementById('btn-toggle-key-eye'),
    btnTestLlmDirect: document.getElementById('btn-test-llm-direct'),
    llmTestFeedback: document.getElementById('llm-test-feedback'),
    btnTestAllChannels: document.getElementById('btn-test-all-channels'),
    channelsTestFeedback: document.getElementById('channels-test-feedback'),
    btnRefreshQueue: document.getElementById('btn-refresh-queue'),
    btnClearQueue: document.getElementById('btn-clear-queue'),
    queueJobsContainer: document.getElementById('queue-jobs-container'),
    formEditClient: document.getElementById('form-edit-client'),

    // Modal Publish Options Dialog
    modalPublishDialog: document.getElementById('modal-publish-dialog'),
    btnClosePublishDialog: document.getElementById('btn-close-publish-dialog'),
    btnCancelPublishDialog: document.getElementById('btn-cancel-publish-dialog'),
    btnConfirmPublish: document.getElementById('btn-confirm-publish'),
    publishDialogPkgId: document.getElementById('publish-dialog-pkg-id'),
    labelModeNow: document.getElementById('label-mode-now'),
    labelModeSchedule: document.getElementById('label-mode-schedule'),
    scheduleDatetimeWrap: document.getElementById('schedule-datetime-wrap'),
    publishScheduleTime: document.getElementById('publish-schedule-time'),

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
      if (elements.modalClientSelect) {
        elements.modalClientSelect.innerHTML = optionsHtml;
      }

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

        // Se abriu a aba de fila em background, carrega os jobs
        if (targetId === 'cl-tab-queue') {
          loadQueueJobs();
        }
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

    // Botão de Publicação Direta nos Canais (Abre modal de opções)
    elements.btnPublishChannels.addEventListener('click', () => {
      if (!state.currentPackage?.packageId) {
        showToast('Nenhum pacote carregado no estúdio.', 'warning');
        return;
      }
      openPublishDialog(state.currentPackage.packageId);
    });

    // Diálogo de Publicação (Modo Agora vs Agendado)
    document.querySelectorAll('input[name="publish-mode"]').forEach(radio => {
      radio.addEventListener('change', (e) => {
        const val = e.target.value;
        if (val === 'now') {
          elements.labelModeNow.classList.add('active');
          elements.labelModeSchedule.classList.remove('active');
          elements.scheduleDatetimeWrap.classList.add('hidden');
        } else {
          elements.labelModeSchedule.classList.add('active');
          elements.labelModeNow.classList.remove('active');
          elements.scheduleDatetimeWrap.classList.remove('hidden');
        }
      });
    });

    elements.btnCancelPublishDialog.addEventListener('click', () => {
      elements.modalPublishDialog.classList.add('hidden');
    });
    elements.btnClosePublishDialog.addEventListener('click', () => {
      elements.modalPublishDialog.classList.add('hidden');
    });

    // Confirmar Envio do Pacote
    elements.btnConfirmPublish.addEventListener('click', () => {
      handlePublishConfirm();
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

    if (elements.modalClientSelect) {
      elements.modalClientSelect.addEventListener('change', async (e) => {
        await populateClientModal(e.target.value);
      });
    }

    // Botão Novo Cliente
    if (elements.btnNewClient) {
      elements.btnNewClient.addEventListener('click', () => {
        prepareNewClientForm();
      });
    }

    // Botão Excluir Cliente
    if (elements.btnDeleteClient) {
      elements.btnDeleteClient.addEventListener('click', async () => {
        const clientId = document.getElementById('cl-id').value.trim();
        if (clientId === 'default' || clientId === 'anaue-design') {
          showToast('Clientes padrão do sistema não podem ser excluídos.', 'warning');
          return;
        }
        if (!confirm(`Deseja realmente excluir as configurações do cliente "${clientId}"?`)) return;

        try {
          const res = await fetch(`/api/clients/${clientId}`, { method: 'DELETE' });
          const data = await res.json();
          if (res.ok) {
            showToast('Cliente excluído com sucesso!', 'success');
            await loadClients();
            const first = state.clients[0]?.id || 'default';
            await populateClientModal(first);
          } else {
            showToast(`Erro: ${data.error}`, 'error');
          }
        } catch (err) {
          showToast(err.message, 'error');
        }
      });
    }

    // Olhinho para ver/ocultar senha da API Key
    if (elements.btnToggleKeyEye) {
      elements.btnToggleKeyEye.addEventListener('click', () => {
        const keyInput = document.getElementById('cl-llm-key');
        if (keyInput.type === 'password') {
          keyInput.type = 'text';
          elements.btnToggleKeyEye.textContent = '🙈';
        } else {
          keyInput.type = 'password';
          elements.btnToggleKeyEye.textContent = '👁️';
        }
      });
    }

    // Testar IA Dedicada diretamente
    if (elements.btnTestLlmDirect) {
      elements.btnTestLlmDirect.addEventListener('click', async () => {
        await testLlmDirect();
      });
    }

    // Testar canais individuais
    document.querySelectorAll('.btn-test-channel').forEach(btn => {
      btn.addEventListener('click', async () => {
        const channel = btn.getAttribute('data-channel');
        await testSingleChannelDirect(channel, btn);
      });
    });

    // Testar todos os canais ativos
    if (elements.btnTestAllChannels) {
      elements.btnTestAllChannels.addEventListener('click', async () => {
        await testAllChannelsDirect();
      });
    }

    elements.btnCloseModalClients.addEventListener('click', () => {
      elements.modalClients.classList.add('hidden');
    });
    elements.btnCancelClient.addEventListener('click', () => {
      elements.modalClients.classList.add('hidden');
    });

    // Botões da Fila de Background
    if (elements.btnRefreshQueue) {
      elements.btnRefreshQueue.addEventListener('click', () => loadQueueJobs());
    }
    if (elements.btnClearQueue) {
      elements.btnClearQueue.addEventListener('click', async () => {
        try {
          const res = await fetch('/api/queue/clear-completed', { method: 'POST' });
          const data = await res.json();
          showToast(`Fila limpa (${data.removed || 0} trabalhos removidos).`, 'info');
          await loadQueueJobs();
        } catch (err) {
          showToast(err.message, 'error');
        }
      });
    }

    // Salvar Cliente com Dados de Redes, LLM e Background
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
          apiKey: document.getElementById('cl-llm-key').value.trim(),
          baseUrl: document.getElementById('cl-llm-baseurl').value.trim()
        },
        channels: {
          webhook: {
            enabled: document.getElementById('ch-webhook-enabled').checked,
            url: document.getElementById('ch-webhook-url').value.trim()
          },
          telegram: {
            enabled: document.getElementById('ch-telegram-enabled').checked,
            botToken: document.getElementById('ch-telegram-token').value.trim(),
            chatId: document.getElementById('ch-telegram-chatid').value.trim()
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
          },
          meta: {
            enabled: document.getElementById('ch-meta-enabled').checked,
            pageAccessToken: document.getElementById('ch-meta-token').value.trim(),
            pageId: document.getElementById('ch-meta-pageid').value.trim(),
            instagramAccountId: document.getElementById('ch-meta-igid').value.trim()
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
    elements.btnHistory.addEventListener('click', () => {
      elements.drawerHistory.classList.remove('hidden');
      loadHistory();
    });

    elements.btnCloseDrawer.addEventListener('click', () => {
      elements.drawerHistory.classList.add('hidden');
    });

    // Modal Info
    elements.btnInfo.addEventListener('click', () => {
      showToast('pub_rs Studio 2.5 — Plataforma profissional de automação e distribuição multicanal.', 'info');
    });
  }

  // ===========================================================================
  // 3. EXECUÇÃO DO PIPELINE EM TEMPO REAL (SSE)
  // ===========================================================================
  function startGenerationStream() {
    const url = elements.inputUrl.value.trim();
    const clientId = elements.formClientSelect.value;
    const provider = elements.formProviderSelect.value;
    const model = elements.formModelInput.value.trim();
    const aiImage = elements.toggleAiImage.checked;

    if (!url) {
      showToast('Por favor, informe a URL do artigo.', 'warning');
      return;
    }

    elements.pipelineMonitor.classList.remove('hidden');
    elements.resultsStudio.classList.add('hidden');
    elements.btnGenerate.disabled = true;
    elements.btnGenerateText.textContent = 'Processando...';

    resetSteps();
    elements.pipelineMonitor.scrollIntoView({ behavior: 'smooth', block: 'start' });

    const queryParams = new URLSearchParams({
      url,
      clientId,
      provider,
      model,
      aiImage
    });

    const eventSource = new EventSource(`/api/generate/stream?${queryParams.toString()}`);

    eventSource.addEventListener('progress', (e) => {
      const data = JSON.parse(e.data);
      updatePipelineStep(data);
    });

    eventSource.addEventListener('done', (e) => {
      const data = JSON.parse(e.data);
      eventSource.close();
      elements.btnGenerate.disabled = false;
      elements.btnGenerateText.textContent = 'Gerar Pacote Omnichannel';
      elements.pipelineMainStatus.textContent = 'Concluído com Sucesso!';
      elements.pipelineMainStatus.classList.remove('pulse');

      state.currentPackage = data;
      displayResults(data);
      showToast('Pacote omnichannel gerado com sucesso!', 'success');
    });

    eventSource.addEventListener('error', (e) => {
      eventSource.close();
      elements.btnGenerate.disabled = false;
      elements.btnGenerateText.textContent = 'Gerar Pacote Omnichannel';
      elements.pipelineMainStatus.textContent = 'Falha na Execução';
      elements.pipelineMainStatus.classList.remove('pulse');

      let errMsg = 'Ocorreu um erro no pipeline.';
      try {
        const data = JSON.parse(e.data);
        if (data.error) errMsg = data.error;
      } catch {}

      showToast(errMsg, 'error');
    });
  }

  function resetSteps() {
    for (let i = 1; i <= 4; i++) {
      const step = elements.steps[i];
      if (step?.card) {
        step.card.classList.remove('active', 'completed', 'error');
        if (step.detail) step.detail.textContent = 'Aguardando...';
      }
    }
  }

  function updatePipelineStep(progress) {
    const stepNum = progress.step;
    if (!stepNum || !elements.steps[stepNum]) return;

    const stepObj = elements.steps[stepNum];

    if (progress.status === 'started' || progress.status === 'active') {
      stepObj.card.classList.add('active');
      stepObj.card.classList.remove('completed');
      if (stepObj.detail) stepObj.detail.textContent = progress.message;
    } else if (progress.status === 'completed' || progress.status === 'done') {
      stepObj.card.classList.remove('active');
      stepObj.card.classList.add('completed');
      if (stepObj.detail) stepObj.detail.textContent = progress.message || 'Concluído';
    } else if (progress.status === 'error') {
      stepObj.card.classList.add('error');
      if (stepObj.detail) stepObj.detail.textContent = progress.message || 'Erro nesta etapa';
    }
  }

  // ===========================================================================
  // 4. EXIBIÇÃO DE RESULTADOS NO STUDIO
  // ===========================================================================
  function displayResults(data) {
    if (!data) return;

    // Badges do Header
    elements.resClientTag.textContent = data.client?.brandName || data.client?.name || data.client || 'Cliente';
    elements.resArticleTitle.textContent = data.article?.title || 'Artigo';
    elements.resEngineTag.textContent = data.copies?.meta?.generator || 'pub_rs Engine';
    elements.resDateTag.textContent = new Date().toLocaleTimeString('pt-BR');
    elements.resArticleLink.href = data.article?.url || '#';

    // 1. Copies
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

  // ===========================================================================
  // 5. MODAL DE PUBLICAÇÃO (IMEDIATO OU AGENDADO EM BACKGROUND)
  // ===========================================================================
  function openPublishDialog(packageId) {
    elements.publishDialogPkgId.textContent = packageId;

    // Define data/hora padrão: 1 hora no futuro
    const defaultDate = new Date(Date.now() + 60 * 60 * 1000);
    const tzOffset = defaultDate.getTimezoneOffset() * 60000;
    const localISOTime = (new Date(defaultDate.getTime() - tzOffset)).toISOString().slice(0, 16);
    elements.publishScheduleTime.value = localISOTime;

    // Reseta modo para 'now'
    const radioNow = document.querySelector('input[name="publish-mode"][value="now"]');
    if (radioNow) radioNow.checked = true;
    elements.labelModeNow.classList.add('active');
    elements.labelModeSchedule.classList.remove('active');
    elements.scheduleDatetimeWrap.classList.add('hidden');

    elements.modalPublishDialog.classList.remove('hidden');
  }

  async function handlePublishConfirm() {
    const packageId = state.currentPackage?.packageId;
    if (!packageId) return;

    const mode = document.querySelector('input[name="publish-mode"]:checked')?.value || 'now';
    const scheduledFor = mode === 'schedule' ? elements.publishScheduleTime.value : null;

    // Coleta canais selecionados
    const targetChannels = [];
    if (document.getElementById('pub-check-webhook')?.checked) targetChannels.push('webhook');
    if (document.getElementById('pub-check-telegram')?.checked) targetChannels.push('telegram');
    if (document.getElementById('pub-check-linkedin')?.checked) targetChannels.push('linkedin');
    if (document.getElementById('pub-check-twitter')?.checked) targetChannels.push('twitter');
    if (document.getElementById('pub-check-buffer')?.checked) targetChannels.push('buffer');
    if (document.getElementById('pub-check-meta')?.checked) targetChannels.push('meta');

    if (targetChannels.length === 0) {
      showToast('Selecione pelo menos um canal de destino.', 'warning');
      return;
    }

    elements.modalPublishDialog.classList.add('hidden');

    if (mode === 'now') {
      // Disparo imediato direto
      await publishCurrentPackageToChannels(targetChannels);
    } else {
      // Enfileiramento na fila de background
      try {
        showToast('Agendando publicação em background...', 'info');
        const res = await fetch('/api/queue', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            packageId,
            clientId: elements.topClientSelect.value || 'anaue-design',
            scheduledFor,
            targetChannels
          })
        });

        const data = await res.json();
        if (res.ok) {
          showToast(`Publicação agendada para ${new Date(scheduledFor).toLocaleString('pt-BR')}!`, 'success');
        } else {
          showToast(`Erro no agendamento: ${data.error}`, 'error');
        }
      } catch (err) {
        showToast(`Falha no agendamento: ${err.message}`, 'error');
      }
    }
  }

  async function publishCurrentPackageToChannels(targetChannels = null) {
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
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetChannels })
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
          <p>Nenhum canal ativo foi disparado.</p>
        </div>
      `;
      return;
    }

    const channelLabels = {
      webhook: 'Webhook (n8n / Make / Metricool)',
      telegram: 'Telegram (Bot API)',
      buffer: 'Buffer API',
      linkedin: 'LinkedIn Direct Share',
      twitter: 'X (Twitter API v2)',
      meta: 'Meta (Facebook & Instagram)'
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
      } else if (ch.messageId) {
        detailHtml = `<span class="dispatch-detail-msg">Mensagem enviada com ID #${ch.messageId}</span>`;
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

  // ===========================================================================
  // 6. GESTÃO DE CLIENTES & FORMULÁRIO COMPLETO
  // ===========================================================================
  function prepareNewClientForm() {
    state.selectedModalClientId = null;
    document.getElementById('cl-id').value = 'novo-cliente';
    document.getElementById('cl-id').readOnly = false;
    document.getElementById('cl-brandName').value = 'Nova Marca';
    document.getElementById('cl-handle').value = '@novamarca';
    document.getElementById('cl-tone').value = 'Profissional, direto ao ponto e focado em valor';
    document.getElementById('cl-audience').value = 'Profissionais e tomadores de decisão';
    document.getElementById('cl-hashtags').value = '#Negocios, #Inovacao, #Tendencias';
    document.getElementById('cl-cta').value = 'Confira a análise completa e comente:';
    document.getElementById('cl-comment-tpl').value = '👉 Leia a matéria na íntegra: {URL}';
    document.getElementById('cl-gen-ai-image').checked = true;

    document.getElementById('cl-llm-provider').value = 'auto';
    document.getElementById('cl-llm-model').value = '';
    document.getElementById('cl-llm-baseurl').value = '';
    document.getElementById('cl-llm-key').value = '';

    document.getElementById('ch-webhook-enabled').checked = true;
    document.getElementById('ch-webhook-url').value = '';
    document.getElementById('ch-telegram-enabled').checked = false;
    document.getElementById('ch-telegram-token').value = '';
    document.getElementById('ch-telegram-chatid').value = '';
    document.getElementById('ch-buffer-enabled').checked = false;
    document.getElementById('ch-buffer-token').value = '';
    document.getElementById('ch-buffer-profiles').value = '';
    document.getElementById('ch-linkedin-enabled').checked = false;
    document.getElementById('ch-linkedin-token').value = '';
    document.getElementById('ch-linkedin-urn').value = '';
    document.getElementById('ch-twitter-enabled').checked = false;
    document.getElementById('ch-twitter-token').value = '';
    document.getElementById('ch-meta-enabled').checked = false;
    document.getElementById('ch-meta-token').value = '';
    document.getElementById('ch-meta-pageid').value = '';
    document.getElementById('ch-meta-igid').value = '';

    elements.llmTestFeedback.classList.add('hidden');
    elements.channelsTestFeedback.classList.add('hidden');

    showToast('Formulário limpo para cadastrar novo cliente.', 'info');
  }

  async function populateClientModal(clientId) {
    try {
      state.selectedModalClientId = clientId;
      const res = await fetch(`/api/clients/${clientId}`);
      if (!res.ok) return;
      const client = await res.json();

      document.getElementById('cl-id').value = client.id || '';
      document.getElementById('cl-id').readOnly = (client.id === 'default' || client.id === 'anaue-design');
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
      document.getElementById('cl-llm-baseurl').value = client.llm?.baseUrl || '';
      document.getElementById('cl-llm-key').value = client.llm?.apiKey || '';

      // Canais
      const ch = client.channels || {};
      document.getElementById('ch-webhook-enabled').checked = Boolean(ch.webhook?.enabled !== false);
      document.getElementById('ch-webhook-url').value = ch.webhook?.url || client.webhookUrl || '';

      document.getElementById('ch-telegram-enabled').checked = Boolean(ch.telegram?.enabled);
      document.getElementById('ch-telegram-token').value = ch.telegram?.botToken || '';
      document.getElementById('ch-telegram-chatid').value = ch.telegram?.chatId || '';

      document.getElementById('ch-buffer-enabled').checked = Boolean(ch.buffer?.enabled);
      document.getElementById('ch-buffer-token').value = ch.buffer?.accessToken || '';
      document.getElementById('ch-buffer-profiles').value = (ch.buffer?.profileIds || []).join(', ');

      document.getElementById('ch-linkedin-enabled').checked = Boolean(ch.linkedin?.enabled);
      document.getElementById('ch-linkedin-token').value = ch.linkedin?.accessToken || '';
      document.getElementById('ch-linkedin-urn').value = ch.linkedin?.authorUrn || '';

      document.getElementById('ch-twitter-enabled').checked = Boolean(ch.twitter?.enabled);
      document.getElementById('ch-twitter-token').value = ch.twitter?.bearerToken || ch.twitter?.accessToken || '';

      document.getElementById('ch-meta-enabled').checked = Boolean(ch.meta?.enabled);
      document.getElementById('ch-meta-token').value = ch.meta?.pageAccessToken || '';
      document.getElementById('ch-meta-pageid').value = ch.meta?.pageId || '';
      document.getElementById('ch-meta-igid').value = ch.meta?.instagramAccountId || '';

      if (elements.modalClientSelect) {
        elements.modalClientSelect.value = clientId;
      }

      elements.llmTestFeedback.classList.add('hidden');
      elements.channelsTestFeedback.classList.add('hidden');
    } catch (err) {
      console.warn('Erro ao carregar dados do cliente:', err);
    }
  }

  // ===========================================================================
  // 7. TESTES DE CONEXÃO AO VIVO (IA E CANAIS)
  // ===========================================================================
  async function testLlmDirect() {
    const provider = document.getElementById('cl-llm-provider').value;
    const model = document.getElementById('cl-llm-model').value.trim();
    const apiKey = document.getElementById('cl-llm-key').value.trim();
    const baseUrl = document.getElementById('cl-llm-baseurl').value.trim();
    const clientId = document.getElementById('cl-id').value.trim();

    elements.llmTestFeedback.classList.remove('hidden', 'test-feedback-success', 'test-feedback-error');
    elements.llmTestFeedback.classList.add('test-feedback-loading');
    elements.llmTestFeedback.textContent = 'Enviando teste de ping para a IA...';

    try {
      const res = await fetch('/api/clients/test-llm-direct', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, model, apiKey, baseUrl, clientId })
      });

      const data = await res.json();
      elements.llmTestFeedback.classList.remove('test-feedback-loading');

      if (data.ok) {
        elements.llmTestFeedback.classList.add('test-feedback-success');
        elements.llmTestFeedback.innerHTML = `✓ ${escapeHtml(data.message)}`;
      } else {
        elements.llmTestFeedback.classList.add('test-feedback-error');
        elements.llmTestFeedback.innerHTML = `✕ Falha no teste: ${escapeHtml(data.error || 'Erro desconhecido')}`;
      }
    } catch (err) {
      elements.llmTestFeedback.classList.remove('test-feedback-loading');
      elements.llmTestFeedback.classList.add('test-feedback-error');
      elements.llmTestFeedback.innerHTML = `✕ Erro de conexão: ${escapeHtml(err.message)}`;
    }
  }

  async function testSingleChannelDirect(channel, triggerBtn) {
    const originalText = triggerBtn.textContent;
    triggerBtn.textContent = 'Testando...';
    triggerBtn.disabled = true;

    const clientId = document.getElementById('cl-id').value.trim();
    const config = {};

    if (channel === 'webhook') config.url = document.getElementById('ch-webhook-url').value.trim();
    if (channel === 'telegram') {
      config.botToken = document.getElementById('ch-telegram-token').value.trim();
      config.chatId = document.getElementById('ch-telegram-chatid').value.trim();
    }
    if (channel === 'buffer') {
      config.accessToken = document.getElementById('ch-buffer-token').value.trim();
    }
    if (channel === 'linkedin') {
      config.accessToken = document.getElementById('ch-linkedin-token').value.trim();
      config.authorUrn = document.getElementById('ch-linkedin-urn').value.trim();
    }
    if (channel === 'twitter') {
      config.bearerToken = document.getElementById('ch-twitter-token').value.trim();
    }
    if (channel === 'meta') {
      config.pageAccessToken = document.getElementById('ch-meta-token').value.trim();
    }

    try {
      const res = await fetch('/api/clients/test-channel-direct', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel, config, clientId })
      });

      const data = await res.json();
      if (data.ok) {
        showToast(`✓ [${channel.toUpperCase()}]: ${data.message}`, 'success');
      } else {
        showToast(`✕ [${channel.toUpperCase()}]: ${data.error}`, 'error');
      }
    } catch (err) {
      showToast(`Erro ao testar ${channel}: ${err.message}`, 'error');
    } finally {
      triggerBtn.textContent = originalText;
      triggerBtn.disabled = false;
    }
  }

  async function testAllChannelsDirect() {
    elements.channelsTestFeedback.classList.remove('hidden', 'test-feedback-success', 'test-feedback-error');
    elements.channelsTestFeedback.classList.add('test-feedback-loading');
    elements.channelsTestFeedback.textContent = 'Testando todos os canais habilitados...';

    const clientId = document.getElementById('cl-id').value.trim();

    try {
      const res = await fetch(`/api/clients/${clientId}/test-connection`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target: 'all' })
      });

      const data = await res.json();
      elements.channelsTestFeedback.classList.remove('test-feedback-loading');

      const results = data.testResults || {};
      const lines = [];

      for (const key of Object.keys(results)) {
        const item = results[key];
        const ok = item.ok || item.configured;
        const msg = item.message || item.error || 'OK';
        lines.push(`<strong>${key.toUpperCase()}:</strong> ${ok ? '✓ ' + msg : '✕ ' + msg}`);
      }

      elements.channelsTestFeedback.classList.add('test-feedback-success');
      elements.channelsTestFeedback.innerHTML = lines.join('<br>') || 'Nenhum canal ativo para testar.';
    } catch (err) {
      elements.channelsTestFeedback.classList.remove('test-feedback-loading');
      elements.channelsTestFeedback.classList.add('test-feedback-error');
      elements.channelsTestFeedback.textContent = `Erro geral nos testes: ${err.message}`;
    }
  }

  // ===========================================================================
  // 8. FILA & BACKGROUND SCHEDULER (JOBS)
  // ===========================================================================
  async function loadQueueJobs() {
    if (!elements.queueJobsContainer) return;
    elements.queueJobsContainer.innerHTML = '<div class="queue-empty">Consultando fila de background...</div>';

    try {
      const res = await fetch('/api/queue');
      const jobs = await res.json();

      if (!jobs || jobs.length === 0) {
        elements.queueJobsContainer.innerHTML = '<div class="queue-empty">Nenhum post agendado ou pendente na fila.</div>';
        return;
      }

      elements.queueJobsContainer.innerHTML = jobs.map(j => {
        const dateStr = j.scheduledFor ? new Date(j.scheduledFor).toLocaleString('pt-BR') : 'Imediato';
        const channelsStr = (j.targetChannels && j.targetChannels.length > 0) ? j.targetChannels.join(', ') : 'Todos os ativos';

        let actionBtn = '';
        if (j.status === 'scheduled') {
          actionBtn = `<button type="button" class="btn-ghost-sm btn-cancel-job" data-id="${j.id}">Cancelar</button>`;
        } else if (j.status === 'failed') {
          actionBtn = `<button type="button" class="btn-ghost-sm btn-retry-job" data-id="${j.id}">Repetir</button>`;
        }

        return `
          <div class="queue-card">
            <div class="queue-card-left">
              <div class="queue-pkg-title">📦 ${escapeHtml(j.packageId)}</div>
              <div class="queue-pkg-meta">
                <span>Cliente: <strong>${escapeHtml(j.clientId)}</strong></span>
                <span>Disparo: <strong>${dateStr}</strong></span>
                <span>Canais: ${escapeHtml(channelsStr)}</span>
                ${j.error ? `<span style="color:var(--accent-rose)">Erro: ${escapeHtml(j.error)}</span>` : ''}
              </div>
            </div>
            <div class="queue-card-right">
              <span class="queue-badge ${j.status}">${j.status}</span>
              ${actionBtn}
            </div>
          </div>
        `;
      }).join('');

      // Wire buttons
      elements.queueJobsContainer.querySelectorAll('.btn-retry-job').forEach(btn => {
        btn.addEventListener('click', async () => {
          const id = btn.getAttribute('data-id');
          await retryQueueJob(id);
        });
      });

      elements.queueJobsContainer.querySelectorAll('.btn-cancel-job').forEach(btn => {
        btn.addEventListener('click', async () => {
          const id = btn.getAttribute('data-id');
          await cancelQueueJob(id);
        });
      });
    } catch (err) {
      elements.queueJobsContainer.innerHTML = `<div class="queue-empty" style="color:var(--accent-rose)">Falha ao carregar fila: ${err.message}</div>`;
    }
  }

  async function retryQueueJob(id) {
    try {
      showToast('Reiniciando disparo do trabalho...', 'info');
      const res = await fetch(`/api/queue/${id}/retry`, { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        showToast('Trabalho reenfileirado para envio imediato!', 'success');
        await loadQueueJobs();
      } else {
        showToast(data.error, 'error');
      }
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  async function cancelQueueJob(id) {
    try {
      const res = await fetch(`/api/queue/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (res.ok) {
        showToast('Agendamento cancelado!', 'info');
        await loadQueueJobs();
      } else {
        showToast(data.error, 'error');
      }
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  // ===========================================================================
  // 9. CARREGAR HISTÓRICO
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
  // 10. UTILITÁRIOS: CLIPBOARD, TOASTS & MARKDOWN SIMPLES
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
