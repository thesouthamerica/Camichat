// Camichat - Frontend Application Logic (Manychat Clone)
document.addEventListener('DOMContentLoaded', () => {
  // Estado local da aplicação
  const state = {
    account: null,
    metrics: null,
    flows: [],
    recentContacts: [],
    selectedPostImg: 'https://images.unsplash.com/photo-1632345031435-8727f6897d53?auto=format&fit=crop&w=300&q=80',
  };

  // Elementos do DOM
  const elements = {
    // Header
    accountName: document.getElementById('account-name'),
    accountUsername: document.getElementById('account-username'),
    accountAvatar: document.getElementById('account-avatar'),
    btnRefresh: document.getElementById('btn-refresh'),

    // Métricas
    metricSends: document.getElementById('metric-sends'),
    metricClicks: document.getElementById('metric-clicks'),
    metricContacts: document.getElementById('metric-contacts'),

    // Listas
    flowsContainer: document.getElementById('flows-container'),
    inboxList: document.getElementById('inbox-list'),
    inboxCount: document.getElementById('inbox-count'),
    contactsTableBody: document.getElementById('contacts-table-body'),
    contactsCount: document.getElementById('contacts-count'),

    // Navegação
    navItems: document.querySelectorAll('.nav-item'),
    tabPanes: document.querySelectorAll('.tab-pane'),
    linkCreateWizard: document.getElementById('link-create-wizard'),
    linkViewAllFlows: document.getElementById('link-view-all-flows'),
    btnBackToHome: document.getElementById('btn-back-to-home'),
    templateCards: document.querySelectorAll('.trigger-create-flow'),

    // Wizard Form
    inputFlowName: document.getElementById('input-flow-name'),
    inputKeywords: document.getElementById('input-keywords'),
    inputDmText: document.getElementById('input-dm-text'),
    inputBtnTitle: document.getElementById('input-btn-title'),
    inputBtnUrl: document.getElementById('input-btn-url'),
    charCounter: document.getElementById('char-counter'),
    btnSaveFlow: document.getElementById('btn-save-flow'),
    postThumbs: document.querySelectorAll('.post-thumb'),
    chipBtns: document.querySelectorAll('.chip-btn'),

    // Live Mockup Preview
    previewAvatar: document.getElementById('preview-avatar'),
    previewAvatarBubble: document.getElementById('preview-avatar-bubble'),
    previewUsername: document.getElementById('preview-username'),
    previewLeadText: document.getElementById('preview-lead-text'),
    previewOutgoingText: document.getElementById('preview-outgoing-text'),
    previewBtnLabel: document.getElementById('preview-btn-label'),
    previewActionBtn: document.getElementById('preview-action-btn'),

    // Toast
    toast: document.getElementById('toast'),
  };

  // ==========================================
  // 1. CARREGAMENTO DE DADOS (API)
  // ==========================================
  async function loadDashboardData() {
    try {
      const response = await fetch('/api/dashboard');
      if (!response.ok) throw new Error('Falha ao carregar dados do dashboard');
      const data = await response.json();

      state.account = data.account;
      state.metrics = data.metrics;
      state.flows = data.flows || [];
      state.recentContacts = data.recentContacts || [];

      renderHeaderAndMetrics();
      renderFlows();
      renderInboxAndContacts();
    } catch (err) {
      console.error(err);
      showToast('Erro ao carregar dados da automação');
    }
  }

  function renderHeaderAndMetrics() {
    if (state.account) {
      elements.accountName.textContent = state.account.name || 'Camila Tavares | Unhas';
      elements.accountUsername.textContent = `@${state.account.username || 'unhasbycamis'}`;
      elements.previewUsername.textContent = state.account.username || 'unhasbycamis';
    }

    if (state.metrics) {
      elements.metricSends.textContent = state.metrics.totalSends || '1';
      elements.metricClicks.textContent = state.metrics.totalClicks || '1';
      elements.metricContacts.textContent = state.metrics.totalContacts || '1';
    }
  }

  function renderFlows() {
    elements.flowsContainer.innerHTML = '';

    if (state.flows.length === 0) {
      elements.flowsContainer.innerHTML = `
        <div class="empty-state" style="padding: 24px; color: var(--text-muted); font-size: 14px;">
          Nenhuma automação criada ainda. Clique em "Crie do zero" para começar!
        </div>
      `;
      return;
    }

    state.flows.forEach((flow) => {
      const card = document.createElement('div');
      card.className = 'flow-card-item';

      const isActive = flow.isActive;
      const badgeClass = isActive ? 'active' : 'inactive';
      const badgeText = isActive ? 'ATIVO(A)' : 'INATIVO(A)';

      // Extrai texto e botão da mensagem
      const firstStep = flow.steps && flow.steps[0];
      const payload = firstStep ? firstStep.payload : {};
      const buttonTitle = payload.buttons && payload.buttons[0] ? payload.buttons[0].title : null;

      // Pega imagem thumbnail padrão
      const thumbImg = 'https://images.unsplash.com/photo-1632345031435-8727f6897d53?auto=format&fit=crop&w=300&q=80';

      card.innerHTML = `
        <div class="flow-card-top">
          <span class="flow-badge ${badgeClass}">${badgeText}</span>
          <img src="${thumbImg}" alt="Post" class="flow-thumb-img">
        </div>
        <h4 class="flow-title" title="${flow.name}">${flow.name}</h4>
        <div class="flow-meta">
          <span>📷 Instagram</span>
          <span>•</span>
          <span>${flow.triggerType === 'COMMENT' ? 'Comentários' : 'Direct'}</span>
        </div>
        <div class="flow-metrics-row">
          <div class="flow-stat">
            <strong>1</strong>
            <span>Envios</span>
          </div>
          <div class="flow-stat">
            <strong>1</strong>
            <span>Cliques</span>
          </div>
          <button class="flow-action-btn btn-toggle-flow" data-id="${flow.id}" title="${isActive ? 'Pausar Automação' : 'Ativar Automação'}">
            ${isActive ? '⏸️' : '▶️'}
          </button>
          <button class="flow-action-btn btn-delete-flow" data-id="${flow.id}" title="Excluir">
            🗑️
          </button>
        </div>
      `;

      // Eventos dos botões do card
      card.querySelector('.btn-toggle-flow').addEventListener('click', (e) => {
        e.stopPropagation();
        toggleFlowStatus(flow.id);
      });

      card.querySelector('.btn-delete-flow').addEventListener('click', (e) => {
        e.stopPropagation();
        deleteFlow(flow.id);
      });

      // Ao clicar no card, carrega no formulário para inspeção
      card.addEventListener('click', () => {
        populateFormFromFlow(flow);
        switchTab('tab-builder');
      });

      elements.flowsContainer.appendChild(card);
    });
  }

  function renderInboxAndContacts() {
    // Inbox
    elements.inboxCount.textContent = `${state.recentContacts.length} conversas`;
    elements.inboxList.innerHTML = '';

    if (state.recentContacts.length === 0) {
      elements.inboxList.innerHTML = `<p style="color: var(--text-muted); padding: 14px;">Nenhuma mensagem registrada ainda.</p>`;
    } else {
      state.recentContacts.forEach((c) => {
        const item = document.createElement('div');
        item.style.cssText = 'background: var(--bg-card); border: 1px solid var(--border-subtle); padding: 14px; border-radius: 12px; margin-bottom: 10px; display: flex; align-items: center; justify-content: space-between;';
        item.innerHTML = `
          <div>
            <strong style="color: #ffffff; display: block; margin-bottom: 4px;">@${c.username}</strong>
            <span style="font-size: 13px; color: var(--text-muted);">${c.lastMessage}</span>
          </div>
          <span style="font-size: 11px; color: var(--text-faint);">${new Date(c.lastInteractionAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
        `;
        elements.inboxList.appendChild(item);
      });
    }

    // Contatos / LGPD
    elements.contactsCount.textContent = `${state.recentContacts.length} contatos`;
    elements.contactsTableBody.innerHTML = '';

    state.recentContacts.forEach((c) => {
      const row = document.createElement('tr');
      row.innerHTML = `
        <td><strong>@${c.username}</strong></td>
        <td style="color: var(--text-muted); font-family: monospace;">${c.igScopedId}</td>
        <td>${new Date(c.lastInteractionAt).toLocaleString()}</td>
        <td><span class="status-pill live-pill" style="color: #34d399; font-size: 11px;">Consentido (Opt-In)</span></td>
      `;
      elements.contactsTableBody.appendChild(row);
    });
  }

  // ==========================================
  // 2. LIVE MOCKUP 2-WAY REACTIVE BINDING
  // ==========================================
  function updateLivePreview() {
    // Texto da DM
    const text = elements.inputDmText.value || 'Oie! Link dos esmaltes lindos pra você usar!';
    elements.previewOutgoingText.innerHTML = text.replace(/\n/g, '<br>');
    elements.charCounter.textContent = text.length;

    // Botão
    const btnTitle = elements.inputBtnTitle.value.trim();
    if (btnTitle) {
      elements.previewActionBtn.style.display = 'block';
      elements.previewBtnLabel.textContent = btnTitle;
    } else {
      elements.previewActionBtn.style.display = 'none';
    }

    // Palavras-chave no Lead (simula a primeira palavra digitada)
    const rawKeywords = elements.inputKeywords.value.split(',');
    const firstKeyword = rawKeywords[0] ? rawKeywords[0].trim() : 'Quero o link!';
    elements.previewLeadText.textContent = firstKeyword || 'Quero o link! 😍';
  }

  // Listeners de digitação em tempo real
  elements.inputDmText.addEventListener('input', updateLivePreview);
  elements.inputBtnTitle.addEventListener('input', updateLivePreview);
  elements.inputKeywords.addEventListener('input', updateLivePreview);

  // Chips de palavras-chave rápidas (Preço, Link, Comprar, Esmaltes)
  elements.chipBtns.forEach((chip) => {
    chip.addEventListener('click', () => {
      const word = chip.dataset.word;
      const current = elements.inputKeywords.value.trim();
      if (!current.toLowerCase().includes(word.toLowerCase())) {
        elements.inputKeywords.value = current ? `${current}, ${word}` : word;
        updateLivePreview();
      }
    });
  });

  // Seleção de fotos dos posts (esmaltes)
  elements.postThumbs.forEach((thumb) => {
    thumb.addEventListener('click', () => {
      elements.postThumbs.forEach((t) => t.classList.remove('active'));
      thumb.classList.add('active');
      state.selectedPostImg = thumb.dataset.img;
    });
  });

  // ==========================================
  // 3. NAVEGAÇÃO ENTRE ABAS
  // ==========================================
  function switchTab(tabId) {
    elements.tabPanes.forEach((pane) => pane.classList.remove('active'));
    elements.navItems.forEach((btn) => btn.classList.remove('active'));

    const targetPane = document.getElementById(tabId);
    if (targetPane) targetPane.classList.add('active');

    const targetNav = document.querySelector(`.nav-item[data-tab="${tabId}"]`);
    if (targetNav) targetNav.classList.add('active');

    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  elements.navItems.forEach((item) => {
    item.addEventListener('click', () => {
      const tabId = item.dataset.tab;
      switchTab(tabId);
    });
  });

  if (elements.linkCreateWizard) {
    elements.linkCreateWizard.addEventListener('click', (e) => {
      e.preventDefault();
      switchTab('tab-builder');
    });
  }

  if (elements.linkViewAllFlows) {
    elements.linkViewAllFlows.addEventListener('click', (e) => {
      e.preventDefault();
      switchTab('tab-builder');
    });
  }

  if (elements.btnBackToHome) {
    elements.btnBackToHome.addEventListener('click', () => {
      switchTab('tab-home');
    });
  }

  elements.templateCards.forEach((card) => {
    card.addEventListener('click', () => {
      const type = card.dataset.type;
      if (type === 'KEYWORD') {
        elements.inputFlowName.value = 'Resposta Automática no Direct';
        elements.inputKeywords.value = 'Preço, Quanto custa, Valor';
      } else {
        elements.inputFlowName.value = 'Autoenviar links dos esmaltes';
        elements.inputKeywords.value = 'Quero, eu quero, quero link, querop, link, preço';
      }
      updateLivePreview();
      switchTab('tab-builder');
    });
  });

  if (elements.btnRefresh) {
    elements.btnRefresh.addEventListener('click', () => {
      loadDashboardData();
      showToast('Dados atualizados com sucesso!');
    });
  }

  // ==========================================
  // 4. CRIAÇÃO DE FLUXO (POST /api/flows)
  // ==========================================
  elements.btnSaveFlow.addEventListener('click', async () => {
    const name = elements.inputFlowName.value.trim();
    const dmText = elements.inputDmText.value.trim();
    const buttonTitle = elements.inputBtnTitle.value.trim();
    const buttonUrl = elements.inputBtnUrl.value.trim();
    const rawKeywords = elements.inputKeywords.value.split(',');
    const keywords = rawKeywords.map((k) => k.trim()).filter((k) => k.length > 0);

    if (!name) {
      showToast('Por favor, informe o nome da automação.');
      elements.inputFlowName.focus();
      return;
    }

    if (keywords.length === 0) {
      showToast('Adicione ao menos uma palavra-chave para o gatilho.');
      elements.inputKeywords.focus();
      return;
    }

    if (!dmText) {
      showToast('Por favor, digite o texto da DM.');
      elements.inputDmText.focus();
      return;
    }

    elements.btnSaveFlow.disabled = true;
    elements.btnSaveFlow.innerHTML = `<span>Ativando...</span>`;

    try {
      const response = await fetch('/api/flows', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          triggerType: 'COMMENT',
          keywords,
          dmText,
          buttonTitle: buttonTitle || undefined,
          buttonUrl: buttonUrl || undefined,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Erro ao criar fluxo');
      }

      showToast('✨ Automação ativada com sucesso!');
      await loadDashboardData();
      switchTab('tab-home');
    } catch (err) {
      console.error(err);
      showToast(err.message || 'Erro ao ativar automação');
    } finally {
      elements.btnSaveFlow.disabled = false;
      elements.btnSaveFlow.innerHTML = `
        <span>Ativar Automação</span>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg>
      `;
    }
  });

  // ==========================================
  // 5. ATIVAÇÃO / DESATIVAÇÃO E EXCLUSÃO
  // ==========================================
  async function toggleFlowStatus(flowId) {
    try {
      const response = await fetch(`/api/flows/${flowId}/toggle`, { method: 'PATCH' });
      if (!response.ok) throw new Error('Falha ao alterar status');
      const updated = await response.json();
      showToast(`Automação ${updated.isActive ? 'ativada' : 'pausada'} com sucesso!`);
      loadDashboardData();
    } catch (err) {
      console.error(err);
      showToast('Erro ao atualizar status');
    }
  }

  async function deleteFlow(flowId) {
    if (!confirm('Deseja realmente excluir esta automação?')) return;
    try {
      const response = await fetch(`/api/flows/${flowId}`, { method: 'DELETE' });
      if (!response.ok) throw new Error('Falha ao excluir fluxo');
      showToast('Automação excluída com sucesso.');
      loadDashboardData();
    } catch (err) {
      console.error(err);
      showToast('Erro ao excluir fluxo');
    }
  }

  function populateFormFromFlow(flow) {
    elements.inputFlowName.value = flow.name;
    const config = flow.triggerConfig || {};
    if (config.keywords && Array.isArray(config.keywords)) {
      elements.inputKeywords.value = config.keywords.join(', ');
    }

    const firstStep = flow.steps && flow.steps[0];
    if (firstStep && firstStep.payload) {
      elements.inputDmText.value = firstStep.payload.text || '';
      if (firstStep.payload.buttons && firstStep.payload.buttons[0]) {
        elements.inputBtnTitle.value = firstStep.payload.buttons[0].title || '';
        elements.inputBtnUrl.value = firstStep.payload.buttons[0].payload || '';
      }
    }
    updateLivePreview();
  }

  // ==========================================
  // 6. HELPER TOAST
  // ==========================================
  let toastTimer = null;
  function showToast(msg) {
    if (toastTimer) clearTimeout(toastTimer);
    elements.toast.textContent = msg;
    elements.toast.classList.add('show');
    toastTimer = setTimeout(() => {
      elements.toast.classList.remove('show');
    }, 3200);
  }

  // Inicialização
  updateLivePreview();
  loadDashboardData();
});
