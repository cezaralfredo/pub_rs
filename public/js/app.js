/**
 * pub_rs Studio — Lógica de Interface, Conexão SSE, Configuração de Canais, Testes de IA e Fila de Background
 */

// ===========================================================================
// SAAS AUTH GUARD & HELPER DE FETCH AUTENTICADO
// ===========================================================================
const saasToken = localStorage.getItem('pub_rs_token');
if (!saasToken) {
  window.location.href = '/login.html';
}

const nativeFetch = window.fetch.bind(window);

async function authFetch(url, options = {}) {
  const token = localStorage.getItem('pub_rs_token');
  const headers = {
    ...(options.headers || {})
  };

  if (token) {
    headers['Authorization'] = 'Bearer ' + token;
  }

  const res = await nativeFetch(url, { ...options, headers });

  if (res.status === 401) {
    localStorage.removeItem('pub_rs_token');
    localStorage.removeItem('pub_rs_user');
    window.location.href = '/login.html';
    throw new Error('Sessão expirada. Faça login novamente.');
  }

  return res;
}

// Aplicar tema salvo imediatamente para evitar flash visual
const savedEarlyTheme = localStorage.getItem('pub_rs_theme') || 'dark';
if (savedEarlyTheme === 'light') {
  document.documentElement.classList.add('light-theme');
  if (document.body) {
    document.body.classList.remove('dark-theme');
    document.body.classList.add('light-theme');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  // Estado da Aplicação
  const state = {
    currentPackage: null,
    currentNetwork: 'linkedin',
    currentMode: 'url', // 'url' ou 'topic'
    clients: [],
    status: null,
    selectedModalClientId: null,
    historyPackages: [],
    historySearchTerm: '',
    historyFilterClient: ''
  };

  // Elementos do DOM
  const elements = {
    // Topbar
    providerPill: document.getElementById('provider-status-text'),
    topClientSelect: document.getElementById('top-client-select'),
    btnHistory: document.getElementById('btn-history'),
    btnManageClients: document.getElementById('btn-manage-clients'),
    btnInfo: document.getElementById('btn-info'),
    topUserAvatar: document.getElementById('top-user-avatar'),
    topUserName: document.getElementById('top-user-name'),
    topUserPlan: document.getElementById('top-user-plan'),
    topUserQuota: document.getElementById('top-user-quota'),
    btnLogout: document.getElementById('btn-logout'),

    // Generator Form & Tabs de Modo
    tabModeUrl: document.getElementById('tab-mode-url'),
    tabModeTopic: document.getElementById('tab-mode-topic'),
    containerUrlMode: document.getElementById('container-url-mode'),
    containerTopicMode: document.getElementById('container-topic-mode'),

    // Modo URL
    generateForm: document.getElementById('generate-form'),
    inputUrl: document.getElementById('input-url'),
    btnPasteUrl: document.getElementById('btn-paste-url'),

    // Modo Tópicos & Interesses
    clientPillarsWrap: document.getElementById('client-pillars-wrap'),
    btnSuggestTopics: document.getElementById('btn-suggest-topics'),
    btnSuggestText: document.getElementById('btn-suggest-text'),
    aiSuggestionsBox: document.getElementById('ai-suggestions-box'),
    suggestionsGrid: document.getElementById('suggestions-grid'),
    btnCloseSuggestions: document.getElementById('btn-close-suggestions'),
    inputTopic: document.getElementById('input-topic'),
    formArchetypeSelect: document.getElementById('form-archetype-select'),
    formVisualStyleSelect: document.getElementById('form-visual-style-select'),

    // Controles Compartilhados
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

    // Views e Navegação de Páginas
    viewStudio: document.getElementById('view-studio'),
    viewManagement: document.getElementById('view-management'),
    viewHistory: document.getElementById('view-history'),
    btnBackToStudio: document.getElementById('btn-back-to-studio'),
    btnHistoryBackStudio: document.getElementById('btn-history-back-studio'),
    btnRefreshHistory: document.getElementById('btn-refresh-history'),
    historySearchInput: document.getElementById('history-search-input'),
    historyClientFilter: document.getElementById('history-client-filter'),
    histStatTotal: document.getElementById('hist-stat-total'),
    histStatClients: document.getElementById('hist-stat-clients'),
    histStatLatest: document.getElementById('hist-stat-latest'),
    workspaceBadge: document.querySelector('.workspace-badge'),

    // Gestão de Clientes, Canais & Fila de Background
    modalClients: document.getElementById('view-management'),
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

    // Histórico de Pacotes
    drawerHistory: document.getElementById('view-history'),
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
    await loadUserProfile();
    await loadStatus();
    await loadClients();
  }

  async function loadUserProfile() {
    try {
      const res = await authFetch('/api/auth/me');
      if (!res.ok) return;
      const data = await res.json();
      const user = data.user;
      if (user) {
        localStorage.setItem('pub_rs_user', JSON.stringify(user));
        if (elements.topUserAvatar) {
          elements.topUserAvatar.textContent = (user.name || user.email || 'U')[0].toUpperCase();
        }
        if (elements.topUserName) {
          elements.topUserName.textContent = user.name || user.email.split('@')[0];
          elements.topUserName.title = user.name + ' (' + user.email + ')';
        }
        if (elements.topUserPlan) {
          elements.topUserPlan.textContent = user.role === 'admin' ? 'ADMIN' : (user.plan || 'PRO').toUpperCase();
        }
        if (elements.topUserQuota) {
          const count = user.usage?.generationsCount || 0;
          const limit = user.usage?.monthlyLimit || 200;
          elements.topUserQuota.textContent = count + '/' + limit;
          elements.topUserQuota.title = count + ' de ' + limit + ' gerações utilizadas este mês';
          if (count >= limit && user.role !== 'admin') {
            elements.topUserQuota.style.color = '#ef4444';
            elements.topUserQuota.style.fontWeight = 'bold';
          }
        }
      }
    } catch (err) {
      console.error('Erro ao carregar perfil do usuário:', err);
    }
  }

  async function loadStatus() {
    try {
      const res = await authFetch('/api/status');
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
      const res = await authFetch('/api/clients');
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
        renderClientPillars(e.target.value);
      });
      elements.formClientSelect.addEventListener('change', (e) => {
        elements.topClientSelect.value = e.target.value;
        renderClientPillars(e.target.value);
      });

      // Inicializa pilares do cliente selecionado
      renderClientPillars(elements.formClientSelect.value);
    } catch (err) {
      console.error('Falha ao carregar clientes:', err);
    }
  }

  // ===========================================================================
  // NAVEGAÇÃO DE PÁGINAS: ESTÚDIO vs GESTÃO DE CLIENTES / FILA & BACKGROUND
  // ===========================================================================
  function switchView(viewName, subTabId = null) {
    const viewStudio = elements.viewStudio || document.getElementById('view-studio');
    const viewManagement = elements.viewManagement || document.getElementById('view-management');
    const viewHistory = elements.viewHistory || document.getElementById('view-history');
    const badge = elements.workspaceBadge || document.querySelector('.workspace-badge');
    const btnNavStudio = document.getElementById('btn-nav-studio');
    const btnNavQueue = document.getElementById('btn-nav-queue');
    const btnManageClients = document.getElementById('btn-manage-clients');
    const btnHistory = elements.btnHistory || document.getElementById('btn-history');

    document.querySelectorAll('.sidebar-nav-item').forEach(b => b.classList.remove('active'));

    if (viewName === 'studio') {
      if (viewStudio) viewStudio.classList.remove('hidden');
      if (viewManagement) viewManagement.classList.add('hidden');
      if (viewHistory) viewHistory.classList.add('hidden');
      if (btnNavStudio) btnNavStudio.classList.add('active');
      if (badge) badge.textContent = 'ESTÚDIO DE CRIAÇÃO';
    } else if (viewName === 'history') {
      if (viewStudio) viewStudio.classList.add('hidden');
      if (viewManagement) viewManagement.classList.add('hidden');
      if (viewHistory) viewHistory.classList.remove('hidden');
      if (btnHistory) btnHistory.classList.add('active');
      if (badge) badge.textContent = 'HISTÓRICO DE PUBLICAÇÕES';
      loadHistory();
    } else if (viewName === 'management' || viewName === 'queue' || viewName === 'clients') {
      if (viewStudio) viewStudio.classList.add('hidden');
      if (viewHistory) viewHistory.classList.add('hidden');
      if (viewManagement) viewManagement.classList.remove('hidden');

      if (viewName === 'queue' || subTabId === 'cl-tab-queue') {
        if (btnNavQueue) btnNavQueue.classList.add('active');
        if (badge) badge.textContent = 'FILA & BACKGROUND DE CANAIS';
      } else {
        if (btnManageClients) btnManageClients.classList.add('active');
        if (badge) badge.textContent = 'GESTÃO DE CLIENTES & REDES';
      }

      if (subTabId) {
        const targetTab = document.querySelector(`.cl-tab[data-cl-tab="${subTabId}"]`);
        if (targetTab) {
          targetTab.click();
        }
      }
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });
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

    // Alternância de Modos (URL vs Interesses/Tópicos)
    if (elements.tabModeUrl && elements.tabModeTopic) {
      elements.tabModeUrl.addEventListener('click', () => switchMode('url'));
      elements.tabModeTopic.addEventListener('click', () => switchMode('topic'));
    }

    // Botão de Brainstorming / Sugestão de Pautas IA
    if (elements.btnSuggestTopics) {
      elements.btnSuggestTopics.addEventListener('click', async () => {
        await fetchAndDisplayAiSuggestions();
      });
    }

    if (elements.btnCloseSuggestions) {
      elements.btnCloseSuggestions.addEventListener('click', () => {
        elements.aiSuggestionsBox.classList.add('hidden');
      });
    }

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

    // Abas da Gestão de Clientes / Sub-páginas da Fila & Background
    document.querySelectorAll('.cl-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.cl-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.cl-tab-panel').forEach(p => p.classList.remove('active'));

        tab.classList.add('active');
        const targetId = tab.getAttribute('data-cl-tab');
        const targetPanel = document.getElementById(targetId);
        if (targetPanel) targetPanel.classList.add('active');

        // Atualiza badge de contexto do workspace
        const badge = elements.workspaceBadge || document.querySelector('.workspace-badge');
        if (badge) {
          if (targetId === 'cl-tab-queue') badge.textContent = 'FILA & BACKGROUND DE CANAIS';
          else if (targetId === 'cl-tab-channels') badge.textContent = 'CANAIS & REDES SOCIAIS';
          else if (targetId === 'cl-tab-identity') badge.textContent = 'IDENTIDADE & TOM DA MARCA';
          else if (targetId === 'cl-tab-llm') badge.textContent = 'IA DEDICADA & CHAVES';
        }

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

    // Navegar para Gestão de Clientes & Redes
    elements.btnManageClients.addEventListener('click', async () => {
      const selectedId = elements.topClientSelect.value || 'anaue-design';
      await populateClientModal(selectedId);
      switchView('clients', 'cl-tab-channels');
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
          const res = await authFetch(`/api/clients/${clientId}`, { method: 'DELETE' });
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

    if (elements.btnCloseModalClients) {
      elements.btnCloseModalClients.addEventListener('click', () => {
        switchView('studio');
      });
    }
    if (elements.btnCancelClient) {
      elements.btnCancelClient.addEventListener('click', () => {
        switchView('studio');
      });
    }
    if (elements.btnBackToStudio) {
      elements.btnBackToStudio.addEventListener('click', () => {
        switchView('studio');
      });
    }

    // Botões da Fila de Background
    if (elements.btnRefreshQueue) {
      elements.btnRefreshQueue.addEventListener('click', () => loadQueueJobs());
    }
    if (elements.btnClearQueue) {
      elements.btnClearQueue.addEventListener('click', async () => {
        try {
          const res = await authFetch('/api/queue/clear-completed', { method: 'POST' });
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
        niche: document.getElementById('cl-niche')?.value.trim() || '',
        contentPillars: (document.getElementById('cl-pillars')?.value || '')
          .split('\n')
          .map(s => s.trim())
          .filter(Boolean),
        visualIdentity: {
          style: document.getElementById('cl-visual-style')?.value || 'dark-cinematic',
          preferredColors: (document.getElementById('cl-colors')?.value || '')
            .split(',')
            .map(s => s.trim())
            .filter(Boolean)
        },
        negativeKeywords: (document.getElementById('cl-negatives')?.value || '')
          .split(',')
          .map(s => s.trim())
          .filter(Boolean),
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
        const res = await authFetch('/api/clients', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(clientPayload)
        });

        if (res.ok) {
          const result = await res.json();
          showToast(`Configurações de "${result.client.brandName}" salvas com sucesso!`, 'success');
          await loadClients();
          elements.formClientSelect.value = result.client.id;
          elements.topClientSelect.value = result.client.id;
          if (elements.modalClientSelect) {
            elements.modalClientSelect.value = result.client.id;
          }
        } else {
          const errData = await res.json();
          showToast(`Erro: ${errData.error}`, 'error');
        }
      } catch (err) {
        showToast(`Erro ao salvar cliente: ${err.message}`, 'error');
      }
    });

    // Navegação Histórico
    elements.btnHistory.addEventListener('click', () => {
      switchView('history');
    });

    if (elements.btnHistoryBackStudio) {
      elements.btnHistoryBackStudio.addEventListener('click', () => {
        switchView('studio');
      });
    }

    if (elements.btnRefreshHistory) {
      elements.btnRefreshHistory.addEventListener('click', () => {
        loadHistory();
      });
    }

    if (elements.historySearchInput) {
      elements.historySearchInput.addEventListener('input', (e) => {
        state.historySearchTerm = e.target.value.toLowerCase().trim();
        renderFilteredHistory();
      });
    }

    if (elements.historyClientFilter) {
      elements.historyClientFilter.addEventListener('change', (e) => {
        state.historyFilterClient = e.target.value.trim();
        renderFilteredHistory();
      });
    }

    if (elements.btnCloseDrawer) {
      elements.btnCloseDrawer.addEventListener('click', () => {
        switchView('studio');
      });
    }

    // Modal Info
    elements.btnInfo.addEventListener('click', () => {
      showToast('pub_rs Studio 2.5 — Plataforma profissional de automação e distribuição multicanal.', 'info');
    });

    if (elements.btnLogout) {
      elements.btnLogout.addEventListener('click', async () => {
        if (confirm('Deseja realmente sair da sua conta pub_rs?')) {
          try {
            await authFetch('/api/auth/logout', { method: 'POST' });
          } catch {}
          localStorage.removeItem('pub_rs_token');
          localStorage.removeItem('pub_rs_user');
          window.location.href = '/login.html';
        }
      });
    }

    // =========================================================================
    // CONTROLES DA SIDEBAR ESQUERDA & WORKSPACE
    // =========================================================================
    const appSidebar = document.getElementById('app-sidebar');
    const btnToggleSidebar = document.getElementById('btn-toggle-sidebar');
    const mobileMenuBtn = document.getElementById('mobile-menu-btn');
    const sidebarOverlay = document.getElementById('sidebar-overlay');
    const btnNavStudio = document.getElementById('btn-nav-studio');
    const btnNavQueue = document.getElementById('btn-nav-queue');
    const topbarQuickHistory = document.getElementById('topbar-quick-history');

    // Restaurar estado recolhido da sidebar no desktop
    if (localStorage.getItem('pub_rs_sidebar_collapsed') === 'true' && appSidebar) {
      appSidebar.classList.add('collapsed');
    }

    if (btnToggleSidebar && appSidebar) {
      btnToggleSidebar.addEventListener('click', () => {
        appSidebar.classList.toggle('collapsed');
        const isCollapsed = appSidebar.classList.contains('collapsed');
        localStorage.setItem('pub_rs_sidebar_collapsed', isCollapsed ? 'true' : 'false');
      });
    }

    // Menu Mobile
    if (mobileMenuBtn && appSidebar && sidebarOverlay) {
      mobileMenuBtn.addEventListener('click', () => {
        appSidebar.classList.add('open');
        sidebarOverlay.classList.add('active');
      });

      sidebarOverlay.addEventListener('click', () => {
        appSidebar.classList.remove('open');
        sidebarOverlay.classList.remove('active');
      });
    }

    // Fechar sidebar no mobile ao clicar em qualquer item
    document.querySelectorAll('.sidebar-nav-item').forEach(item => {
      item.addEventListener('click', () => {
        if (window.innerWidth <= 992 && appSidebar && sidebarOverlay) {
          appSidebar.classList.remove('open');
          sidebarOverlay.classList.remove('active');
        }
      });
    });

    // Item de navegação: Criar / Studio
    if (btnNavStudio) {
      btnNavStudio.addEventListener('click', () => {
        switchView('studio');
      });
    }

    // Item de navegação: Fila & Background
    if (btnNavQueue) {
      btnNavQueue.addEventListener('click', async () => {
        const selectedId = elements.topClientSelect.value || 'anaue-design';
        await populateClientModal(selectedId);
        switchView('queue', 'cl-tab-queue');
        loadQueueJobs();
      });
    }

    // Atalho rápido de histórico na topbar
    if (topbarQuickHistory) {
      topbarQuickHistory.addEventListener('click', () => {
        switchView('history');
      });
    }

    // =========================================================================
    // CONTROLE DE TEMA: CLARO (FUNDO BRANCO) / ESCURO
    // =========================================================================
    const btnThemeToggle = document.getElementById('btn-theme-toggle');
    const themeToggleIcon = document.getElementById('theme-toggle-icon');
    const themeToggleLabel = document.getElementById('theme-toggle-label');

    function updateThemeUI(theme) {
      if (theme === 'light') {
        document.body.classList.remove('dark-theme');
        document.body.classList.add('light-theme');
        if (themeToggleIcon) themeToggleIcon.textContent = '🌙';
        if (themeToggleLabel) themeToggleLabel.textContent = 'Fundo Escuro';
      } else {
        document.body.classList.remove('light-theme');
        document.body.classList.add('dark-theme');
        if (themeToggleIcon) themeToggleIcon.textContent = '☀️';
        if (themeToggleLabel) themeToggleLabel.textContent = 'Fundo Branco';
      }
      localStorage.setItem('pub_rs_theme', theme);
    }

    // Inicializa estado dos botões de tema
    const initialTheme = localStorage.getItem('pub_rs_theme') || 'dark';
    updateThemeUI(initialTheme);

    if (btnThemeToggle) {
      btnThemeToggle.addEventListener('click', () => {
        const currentIsLight = document.body.classList.contains('light-theme');
        const nextTheme = currentIsLight ? 'dark' : 'light';
        updateThemeUI(nextTheme);
        showToast(nextTheme === 'light' ? 'Modo Fundo Branco ativado!' : 'Modo Fundo Escuro ativado!', 'info');
      });
    }
  }

  // ===========================================================================
  // 3. FUNÇÕES DE SUPORTE A TÓPICOS & EXECUÇÃO DO PIPELINE EM TEMPO REAL (SSE)
  // ===========================================================================
  function renderClientPillars(clientId) {
    if (!elements.clientPillarsWrap) return;
    const client = state.clients.find(c => c.id === clientId);
    if (!client) return;

    if (client.visualIdentity?.style && elements.formVisualStyleSelect) {
      elements.formVisualStyleSelect.value = client.visualIdentity.style;
    }

    const pillars = client.contentPillars || [];
    if (pillars.length === 0) {
      elements.clientPillarsWrap.innerHTML = `
        <span class="pillar-empty" style="font-size: 0.8rem; color: var(--text-muted);">Nenhum pilar cadastrado. Abra "Clientes & Redes" para adicionar.</span>
      `;
      return;
    }

    elements.clientPillarsWrap.innerHTML = pillars.map(pillar => `
      <button type="button" class="pillar-chip" data-pillar="${escapeHtml(pillar)}">
        <span>${escapeHtml(pillar)}</span>
      </button>
    `).join('');

    elements.clientPillarsWrap.querySelectorAll('.pillar-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const pillarText = chip.getAttribute('data-pillar');
        elements.clientPillarsWrap.querySelectorAll('.pillar-chip').forEach(c => c.classList.remove('selected'));
        chip.classList.add('selected');
        elements.inputTopic.value = pillarText;
        elements.inputTopic.focus();
        showToast(`Pilar selecionado: "${pillarText}"`, 'info');
      });
    });
  }

  function switchMode(mode) {
    state.currentMode = mode;
    if (mode === 'topic') {
      elements.tabModeTopic.classList.add('active');
      elements.tabModeUrl.classList.remove('active');
      elements.containerTopicMode.classList.remove('hidden');
      elements.containerUrlMode.classList.add('hidden');
      elements.inputUrl.required = false;
      elements.inputTopic.required = true;
      elements.btnGenerateText.textContent = 'Gerar Publicações por Interesses';
      renderClientPillars(elements.formClientSelect.value);
    } else {
      elements.tabModeUrl.classList.add('active');
      elements.tabModeTopic.classList.remove('active');
      elements.containerUrlMode.classList.remove('hidden');
      elements.containerTopicMode.classList.add('hidden');
      elements.inputUrl.required = true;
      elements.inputTopic.required = false;
      elements.btnGenerateText.textContent = 'Gerar Pacote Omnichannel';
    }
  }

  async function fetchAndDisplayAiSuggestions() {
    const clientId = elements.formClientSelect.value;
    const provider = elements.formProviderSelect.value;
    const model = elements.formModelInput.value.trim();

    elements.btnSuggestTopics.disabled = true;
    elements.btnSuggestText.textContent = 'Pensando em pautas...';

    try {
      const res = await authFetch('/api/topics/suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, count: 4, provider, model })
      });

      if (!res.ok) {
        throw new Error('Falha ao obter sugestões de pautas.');
      }

      const data = await res.json();
      const ideas = data.ideas || [];

      if (ideas.length === 0) {
        showToast('Nenhuma sugestão retornada.', 'warning');
        return;
      }

      const archetypeLabels = {
        dica: 'Dica Prática',
        opiniao: 'Opinião de Especialista',
        mito: 'Quebra de Mito',
        case: 'Estudo de Caso'
      };

      elements.suggestionsGrid.innerHTML = ideas.map(idea => `
        <div class="suggestion-card" data-topic="${escapeHtml(idea.topic || idea.title)}" data-archetype="${idea.archetype || 'dica'}">
          <div class="suggestion-card-header">
            <span class="suggestion-badge">${archetypeLabels[idea.archetype] || idea.archetype?.toUpperCase() || 'PAUTA'}</span>
            <small style="color: var(--text-muted); font-size: 0.72rem;">${escapeHtml(idea.pillar || '')}</small>
          </div>
          <div class="suggestion-title">${escapeHtml(idea.title)}</div>
          <div class="suggestion-hook">"${escapeHtml(idea.hook || '')}"</div>
        </div>
      `).join('');

      elements.suggestionsGrid.querySelectorAll('.suggestion-card').forEach(card => {
        card.addEventListener('click', () => {
          const topic = card.getAttribute('data-topic');
          const arch = card.getAttribute('data-archetype');
          elements.inputTopic.value = topic;
          if (elements.formArchetypeSelect && arch) {
            elements.formArchetypeSelect.value = arch;
          }
          elements.inputTopic.focus();
          showToast(`Ideia carregada! Clique em "Gerar" para criar o pacote.`, 'success');
        });
      });

      elements.aiSuggestionsBox.classList.remove('hidden');
      showToast('Pautas sugeridas com sucesso!', 'success');
    } catch (err) {
      showToast(`Erro na ideação: ${err.message}`, 'error');
    } finally {
      elements.btnSuggestTopics.disabled = false;
      elements.btnSuggestText.textContent = 'Sugerir Ideias de Pautas (IA)';
    }
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>"']/g, (m) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    })[m]);
  }

  function startGenerationStream() {
    const isTopic = state.currentMode === 'topic';
    const url = elements.inputUrl?.value?.trim() || '';
    const topic = elements.inputTopic?.value?.trim() || '';
    const archetype = elements.formArchetypeSelect?.value || 'dica';
    const visualStyle = elements.formVisualStyleSelect?.value || 'dark-cinematic';
    const clientId = elements.formClientSelect.value;
    const provider = elements.formProviderSelect.value;
    const model = elements.formModelInput.value.trim();
    const aiImage = isTopic ? true : elements.toggleAiImage.checked;

    if (!isTopic && !url) {
      showToast('Por favor, informe a URL do artigo.', 'warning');
      return;
    }
    if (isTopic && !topic) {
      showToast('Por favor, descreva ou selecione o tema/pauta do cliente.', 'warning');
      return;
    }

    elements.pipelineMonitor.classList.remove('hidden');
    elements.resultsStudio.classList.add('hidden');
    elements.btnGenerate.disabled = true;
    elements.btnGenerateText.textContent = 'Processando...';

    resetSteps();
    elements.pipelineMonitor.scrollIntoView({ behavior: 'smooth', block: 'start' });

    const token = localStorage.getItem('pub_rs_token');
    const queryParams = new URLSearchParams({
      mode: isTopic ? 'topic' : 'url',
      url,
      topic,
      archetype,
      visualStyle,
      clientId,
      provider,
      model,
      aiImage
    });
    if (token) {
      queryParams.append('token', token);
    }

    const eventSource = new EventSource(`/api/generate/stream?${queryParams.toString()}`);

    eventSource.addEventListener('progress', (e) => {
      const data = JSON.parse(e.data);
      updatePipelineStep(data);
    });

    eventSource.addEventListener('done', (e) => {
      const data = JSON.parse(e.data);
      eventSource.close();
      elements.btnGenerate.disabled = false;
      elements.btnGenerateText.textContent = isTopic ? 'Gerar Publicações por Interesses' : 'Gerar Pacote Omnichannel';
      elements.pipelineMainStatus.textContent = 'Concluído com Sucesso!';
      elements.pipelineMainStatus.classList.remove('pulse');

      state.currentPackage = data;
      displayResults(data);
      loadUserProfile();
      showToast('Pacote omnichannel gerado com sucesso!', 'success');
    });

    eventSource.addEventListener('error', (e) => {
      eventSource.close();
      elements.btnGenerate.disabled = false;
      elements.btnGenerateText.textContent = isTopic ? 'Gerar Publicações por Interesses' : 'Gerar Pacote Omnichannel';
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
        const res = await authFetch('/api/queue', {
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
      const res = await authFetch(`/api/packages/${state.currentPackage.packageId}/publish`, {
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
    document.getElementById('cl-niche').value = 'Estratégia, Inovação e Crescimento Digital';
    document.getElementById('cl-pillars').value = 'Tendências de Mercado\nBoas Práticas e Inovação\nEstratégia e ROI';
    document.getElementById('cl-visual-style').value = 'dark-cinematic';
    document.getElementById('cl-colors').value = '#0052FF, #0A0E17, #00D2FF';
    document.getElementById('cl-negatives').value = 'grátis, fórmula mágica, fácil';
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
      const res = await authFetch(`/api/clients/${clientId}`);
      if (!res.ok) return;
      const client = await res.json();

      document.getElementById('cl-id').value = client.id || '';
      document.getElementById('cl-id').readOnly = (client.id === 'default' || client.id === 'anaue-design');
      document.getElementById('cl-brandName').value = client.brandName || '';
      document.getElementById('cl-handle').value = client.brandHandle || '';
      document.getElementById('cl-niche').value = client.niche || '';
      document.getElementById('cl-pillars').value = (client.contentPillars || []).join('\n');
      document.getElementById('cl-visual-style').value = client.visualIdentity?.style || 'dark-cinematic';
      document.getElementById('cl-colors').value = (client.visualIdentity?.preferredColors || []).join(', ');
      document.getElementById('cl-negatives').value = (client.negativeKeywords || []).join(', ');
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
      const res = await authFetch('/api/clients/test-llm-direct', {
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
      const res = await authFetch('/api/clients/test-channel-direct', {
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
      const res = await authFetch(`/api/clients/${clientId}/test-connection`, {
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
      const res = await authFetch('/api/queue');
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
      const res = await authFetch(`/api/queue/${id}/retry`, { method: 'POST' });
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
      const res = await authFetch(`/api/queue/${id}`, { method: 'DELETE' });
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
  // 9. CARREGAR HISTÓRICO EXPANSIVO & FILTROS
  // ===========================================================================
  async function loadHistory() {
    if (!elements.historyContainer) return;
    elements.historyContainer.innerHTML = '<div class="history-empty-state"><p>Consultando histórico de pacotes gerados...</p></div>';

    try {
      const res = await authFetch('/api/packages');
      const packages = await res.json();
      state.historyPackages = packages || [];

      // Atualiza métricas
      if (elements.histStatTotal) {
        elements.histStatTotal.textContent = state.historyPackages.length;
      }
      if (elements.histStatClients) {
        const uniqueClients = new Set(state.historyPackages.map(p => p.client).filter(Boolean));
        elements.histStatClients.textContent = uniqueClients.size;
      }
      if (elements.histStatLatest) {
        if (state.historyPackages.length > 0) {
          const first = state.historyPackages[0];
          elements.histStatLatest.textContent = first.generatedAt
            ? new Date(first.generatedAt).toLocaleDateString('pt-BR')
            : (first.id ? first.id.slice(0, 10) : 'Disponível');
        } else {
          elements.histStatLatest.textContent = '--';
        }
      }

      // Preenche filtro de marcas se vazio ou alterado
      if (elements.historyClientFilter) {
        const uniqueClients = Array.from(new Set(state.historyPackages.map(p => p.client).filter(Boolean)));
        elements.historyClientFilter.innerHTML = '<option value="">Todas as Marcas</option>' +
          uniqueClients.map(c => `<option value="${escapeHtml(c)}" ${state.historyFilterClient === c ? 'selected' : ''}>${escapeHtml(c)}</option>`).join('');
      }

      renderFilteredHistory();
    } catch (err) {
      elements.historyContainer.innerHTML = `<div class="history-empty-state" style="color:var(--accent-rose)"><p>Erro ao carregar histórico: ${err.message}</p></div>`;
    }
  }

  function renderFilteredHistory() {
    if (!elements.historyContainer) return;

    let filtered = state.historyPackages || [];

    if (state.historyFilterClient) {
      filtered = filtered.filter(p => (p.client || '').toLowerCase() === state.historyFilterClient.toLowerCase());
    }

    if (state.historySearchTerm) {
      const q = state.historySearchTerm;
      filtered = filtered.filter(p => 
        (p.title || '').toLowerCase().includes(q) || 
        (p.id || '').toLowerCase().includes(q) ||
        (p.client || '').toLowerCase().includes(q)
      );
    }

    if (filtered.length === 0) {
      elements.historyContainer.innerHTML = `
        <div class="history-empty-state">
          <span class="history-empty-icon">📦</span>
          <h4 class="history-empty-title">Nenhum pacote encontrado</h4>
          <p class="history-empty-desc">${state.historySearchTerm || state.historyFilterClient ? 'Tente ajustar os filtros ou os termos de busca digitados.' : 'Gere sua primeira publicação omnichannel através do Estúdio de Criação.'}</p>
          <button type="button" class="btn-primary-action btn-history-create" style="margin-top:8px;">⚡ Criar no Estúdio</button>
        </div>
      `;
      const btnCreate = elements.historyContainer.querySelector('.btn-history-create');
      if (btnCreate) {
        btnCreate.addEventListener('click', () => switchView('studio'));
      }
      return;
    }

    elements.historyContainer.innerHTML = filtered.map(pkg => {
      const dateDisplay = pkg.generatedAt
        ? new Date(pkg.generatedAt).toLocaleString('pt-BR')
        : (pkg.id.match(/^\d{4}-\d{2}-\d{2}/) ? pkg.id.slice(0, 10).split('-').reverse().join('/') : 'Data salva');

      const urlLink = pkg.url
        ? `<a href="${escapeHtml(pkg.url)}" target="_blank" rel="noopener" class="history-card-meta-item" style="color:var(--accent-cyan); text-decoration:none;">🔗 Link ↗</a>`
        : '';

      return `
        <div class="history-card" data-id="${escapeHtml(pkg.id)}">
          <div class="history-card-header">
            <h4 class="history-card-title">${escapeHtml(pkg.title)}</h4>
            <span class="history-card-client-tag">🏢 ${escapeHtml(pkg.client || 'Padrão')}</span>
          </div>

          <div class="history-card-meta">
            <span class="history-card-meta-item">📅 ${dateDisplay}</span>
            <span class="history-card-meta-item">⚙️ ${escapeHtml(pkg.generator || 'pub_rs Engine')}</span>
            ${urlLink}
          </div>

          <div class="history-card-actions">
            <button type="button" class="btn-primary-action btn-open-pkg" data-id="${escapeHtml(pkg.id)}">
              <span>Abrir no Studio</span> ↗
            </button>
            <div class="history-card-actions-right">
              <button type="button" class="btn-ghost-sm btn-copy-pkg-id" data-id="${escapeHtml(pkg.id)}" title="Copiar ID do Pacote">📋 ID</button>
              <button type="button" class="btn-ghost-sm btn-delete-pkg" data-id="${escapeHtml(pkg.id)}" title="Excluir este pacote">🗑️</button>
            </div>
          </div>
        </div>
      `;
    }).join('');

    // Wire buttons
    elements.historyContainer.querySelectorAll('.btn-open-pkg').forEach(btn => {
      btn.addEventListener('click', async () => {
        const pkgId = btn.getAttribute('data-id');
        await openSavedPackage(pkgId);
      });
    });

    elements.historyContainer.querySelectorAll('.btn-copy-pkg-id').forEach(btn => {
      btn.addEventListener('click', () => {
        const pkgId = btn.getAttribute('data-id');
        copyToClipboard(pkgId, `ID "${pkgId}" copiado!`);
      });
    });

    elements.historyContainer.querySelectorAll('.btn-delete-pkg').forEach(btn => {
      btn.addEventListener('click', async () => {
        const pkgId = btn.getAttribute('data-id');
        if (!confirm(`Deseja realmente excluir permanentemente o pacote "${pkgId}" do histórico?`)) return;

        try {
          const res = await authFetch(`/api/packages/${pkgId}`, { method: 'DELETE' });
          const data = await res.json();
          if (res.ok) {
            showToast('Pacote excluído com sucesso!', 'success');
            await loadHistory();
          } else {
            showToast(`Erro ao excluir: ${data.error}`, 'error');
          }
        } catch (err) {
          showToast(err.message, 'error');
        }
      });
    });
  }

  async function openSavedPackage(pkgId) {
    try {
      showToast('Carregando pacote salvo...', 'info');
      const res = await authFetch(`/api/packages/${pkgId}`);
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

      switchView('studio');
      showToast('Pacote carregado no estúdio!', 'success');
      window.scrollTo({ top: elements.resultsStudio?.offsetTop || 0, behavior: 'smooth' });
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
