// Camichat - Frontend Application Logic (Manychat Clone with Real Instagram Media)
document.addEventListener('DOMContentLoaded', () => {
  // Estado local da aplicação
  const state = {
    account: null,
    metrics: null,
    flows: [],
    recentContacts: [],
    mediaList: [],
    selectedPost: null,
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

    // Listas & Feeds
    flowsContainer: document.getElementById('flows-container'),
    homePostsContainer: document.getElementById('home-posts-container'),
    homePostsCount: document.getElementById('home-posts-count'),
    wizardPostsGrid: document.getElementById('wizard-posts-grid'),
    selectedPostBanner: document.getElementById('selected-post-banner'),
    selectedPostPreviewImg: document.getElementById('selected-post-preview-img'),
    selectedPostCaptionText: document.getElementById('selected-post-caption-text'),
    selectedPostLink: document.getElementById('selected-post-link'),

    // Inbox & Contatos
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

  // Busca as postagens reais do Instagram da conta ativa (@leonardo.bezerra.dev)
  async function loadInstagramMedia() {
    try {
      const response = await fetch('/api/instagram/media');
      if (!response.ok) {
        throw new Error('Falha ao buscar posts do Instagram');
      }
      const data = await response.json();
      state.mediaList = data.media || [];
      
      renderHomePostsFeed();
      renderWizardPostsGrid();
    } catch (err) {
      console.error('Erro ao carregar mídia do Instagram:', err);
      if (elements.homePostsContainer) {
        elements.homePostsContainer.innerHTML = `
          <div style="padding: 16px; color: var(--text-muted); font-size: 13px;">
            Não foi possível carregar as postagens no momento. Verifique a permissão do app.
          </div>
        `;
      }
      if (elements.wizardPostsGrid) {
        elements.wizardPostsGrid.innerHTML = `
          <div style="grid-column: 1 / -1; padding: 16px; color: var(--text-muted); font-size: 13px;">
            Nenhuma publicação carregada.
          </div>
        `;
      }
    }
  }

  function renderHeaderAndMetrics() {
    if (state.account) {
      elements.accountName.textContent = state.account.name || 'Leonardo Bezerra';
      elements.accountUsername.textContent = `@${state.account.username || 'leonardo.bezerra.dev'}`;
      elements.previewUsername.textContent = state.account.username || 'leonardo.bezerra.dev';

      // Atualiza com a imagem de perfil real do Instagram
      if (state.account.profilePictureUrl) {
        if (elements.accountAvatar) elements.accountAvatar.src = state.account.profilePictureUrl;
        if (elements.previewAvatar) elements.previewAvatar.src = state.account.profilePictureUrl;
        if (elements.previewAvatarBubble) elements.previewAvatarBubble.src = state.account.profilePictureUrl;
      }
    }

    if (state.metrics) {
      elements.metricSends.textContent = state.metrics.totalSends || '1';
      elements.metricClicks.textContent = state.metrics.totalClicks || '1';
      elements.metricContacts.textContent = state.metrics.totalContacts || '1';
    }
  }

  // ==========================================
  // 2. RENDERIZAÇÃO DOS POSTS DO INSTAGRAM
  // ==========================================
  function renderHomePostsFeed() {
    if (!elements.homePostsContainer) return;
    elements.homePostsContainer.innerHTML = '';
    elements.homePostsCount.textContent = `${state.mediaList.length} posts`;

    if (state.mediaList.length === 0) {
      elements.homePostsContainer.innerHTML = `
        <div style="padding: 18px; color: var(--text-muted); font-size: 13px;">
          Nenhuma publicação encontrada no perfil @${state.account?.username || 'instagram'}.
        </div>
      `;
      return;
    }

    state.mediaList.forEach((post) => {
      const card = document.createElement('div');
      card.className = 'feed-post-card';

      const imgUrl = post.thumbnail_url || post.media_url || 'https://images.unsplash.com/photo-1632345031435-8727f6897d53?auto=format&fit=crop&w=300&q=80';
      const captionText = post.caption ? post.caption : 'Sem legenda';
      const typeLabel = post.media_type === 'VIDEO' ? '🎬 REEL' : (post.media_type === 'CAROUSEL_ALBUM' ? '📑 CARROSSEL' : '📸 FOTO');

      card.innerHTML = `
        <div class="feed-post-media-wrap">
          <img src="${imgUrl}" alt="Post thumbnail" loading="lazy">
          <span class="media-type-pill">${typeLabel}</span>
        </div>
        <div class="feed-post-content">
          <p class="feed-post-caption ${!post.caption ? 'empty' : ''}" title="${captionText}">${captionText}</p>
          <div class="feed-post-footer">
            <button class="btn-create-for-post" data-id="${post.id}">
              Criar Automação ⚡
            </button>
          </div>
        </div>
      `;

      card.querySelector('.btn-create-for-post').addEventListener('click', (e) => {
        e.stopPropagation();
        selectPostAndOpenWizard(post);
      });

      elements.homePostsContainer.appendChild(card);
    });
  }

  function renderWizardPostsGrid() {
    if (!elements.wizardPostsGrid) return;
    elements.wizardPostsGrid.innerHTML = '';

    if (state.mediaList.length === 0) {
      elements.wizardPostsGrid.innerHTML = `
        <div style="grid-column: 1 / -1; padding: 18px; color: var(--text-muted); font-size: 13px;">
          Nenhuma publicação encontrada para seleção.
        </div>
      `;
      return;
    }

    state.mediaList.forEach((post, index) => {
      const thumb = document.createElement('div');
      thumb.className = 'wizard-post-thumb';
      thumb.dataset.id = post.id;

      const imgUrl = post.thumbnail_url || post.media_url;
      const typeLabel = post.media_type === 'VIDEO' ? 'REEL' : (post.media_type === 'CAROUSEL_ALBUM' ? 'ALBUM' : 'FOTO');

      thumb.innerHTML = `
        <img src="${imgUrl}" alt="Post" loading="lazy">
        <span class="post-type-tag">${typeLabel}</span>
        <span class="check-circle">✓</span>
      `;

      // Seleciona o primeiro post por padrão se nenhum estiver selecionado
      if ((!state.selectedPost && index === 0) || (state.selectedPost && state.selectedPost.id === post.id)) {
        thumb.classList.add('active');
        setSelectedPost(post);
      }

      thumb.addEventListener('click', () => {
        document.querySelectorAll('.wizard-post-thumb').forEach((t) => t.classList.remove('active'));
        thumb.classList.add('active');
        setSelectedPost(post);
      });

      elements.wizardPostsGrid.appendChild(thumb);
    });
  }

  function setSelectedPost(post) {
    state.selectedPost = post;

    if (elements.selectedPostBanner) {
      elements.selectedPostBanner.style.display = 'flex';
      const imgUrl = post.thumbnail_url || post.media_url;
      elements.selectedPostPreviewImg.src = imgUrl;
      elements.selectedPostCaptionText.textContent = post.caption || 'Publicação sem legenda';
      elements.selectedPostLink.href = post.permalink || '#';
    }

    // Se o usuário ainda não personalizou o nome do fluxo, sugere um baseado no post
    if (elements.inputFlowName && elements.inputFlowName.value.startsWith('Autoenviar links') || elements.inputFlowName.value.startsWith('Automação:')) {
      const shortCaption = post.caption ? post.caption.slice(0, 32).trim() : 'Publicação';
      elements.inputFlowName.value = `Automação: ${shortCaption}`;
    }
  }

  function selectPostAndOpenWizard(post) {
    setSelectedPost(post);
    // Atualiza marcação visual na grade
    document.querySelectorAll('.wizard-post-thumb').forEach((thumb) => {
      if (thumb.dataset.id === post.id) {
        thumb.classList.add('active');
      } else {
        thumb.classList.remove('active');
      }
    });

    switchTab('tab-builder');
    showToast(`Post selecionado! Configure as palavras-chave e a mensagem.`);
  }

  // ==========================================
  // 3. FLUXOS E DASHBOARD
  // ==========================================
  function renderFlows() {
    elements.flowsContainer.innerHTML = '';

    if (state.flows.length === 0) {
      elements.flowsContainer.innerHTML = `
        <div class="empty-state" style="padding: 24px; color: var(--text-muted); font-size: 14px;">
          Nenhuma automação criada ainda. Escolha um post acima para começar!
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

      // Pega imagem do post associado ou fallback
      const config = flow.triggerConfig || {};
      const thumbImg = config.mediaUrl || 'https://images.unsplash.com/photo-1632345031435-8727f6897d53?auto=format&fit=crop&w=300&q=80';

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

      card.querySelector('.btn-toggle-flow').addEventListener('click', (e) => {
        e.stopPropagation();
        toggleFlowStatus(flow.id);
      });

      card.querySelector('.btn-delete-flow').addEventListener('click', (e) => {
        e.stopPropagation();
        deleteFlow(flow.id);
      });

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
  // 4. LIVE MOCKUP 2-WAY REACTIVE BINDING
  // ==========================================
  function updateLivePreview() {
    const text = elements.inputDmText.value || 'Oie! O link do conteúdo está aqui!';
    elements.previewOutgoingText.innerHTML = text.replace(/\n/g, '<br>');
    elements.charCounter.textContent = text.length;

    const btnTitle = elements.inputBtnTitle.value.trim();
    const btnUrl = elements.inputBtnUrl.value.trim();

    if (btnTitle) {
      elements.previewActionBtn.style.display = 'block';
      elements.previewBtnLabel.textContent = btnTitle;
      elements.previewActionBtn.href = btnUrl || '#';
      elements.previewActionBtn.target = '_blank';
      elements.previewActionBtn.title = btnUrl || '';
    } else {
      elements.previewActionBtn.style.display = 'none';
    }

    const rawKeywords = elements.inputKeywords.value.split(',');
    const firstKeyword = rawKeywords[0] ? rawKeywords[0].trim() : 'Quero o link!';
    elements.previewLeadText.textContent = firstKeyword || 'Quero o link! 😍';
  }

  elements.inputDmText.addEventListener('input', updateLivePreview);
  elements.inputBtnTitle.addEventListener('input', updateLivePreview);
  elements.inputBtnUrl.addEventListener('input', updateLivePreview);
  elements.inputKeywords.addEventListener('input', updateLivePreview);

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

  // ==========================================
  // 5. NAVEGAÇÃO ENTRE ABAS
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
        elements.inputFlowName.value = 'Autoenviar links de comentários';
        elements.inputKeywords.value = 'Quero, eu quero, quero link, querop, link, preço';
      }
      updateLivePreview();
      switchTab('tab-builder');
    });
  });

  if (elements.btnRefresh) {
    elements.btnRefresh.addEventListener('click', () => {
      loadDashboardData();
      loadInstagramMedia();
      showToast('Dados e postagens atualizados com sucesso!');
    });
  }

  // ==========================================
  // 6. CRIAÇÃO DE FLUXO (POST /api/flows)
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
      const payload = {
        name,
        triggerType: 'COMMENT_REPLY',
        keywords,
        dmText,
        buttonTitle: buttonTitle || undefined,
        buttonUrl: buttonUrl || undefined,
        postId: state.selectedPost?.id || undefined,
        mediaUrl: state.selectedPost?.thumbnail_url || state.selectedPost?.media_url || undefined,
        permalink: state.selectedPost?.permalink || undefined,
        caption: state.selectedPost?.caption || undefined,
      };

      const response = await fetch('/api/flows', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Erro ao criar fluxo');
      }

      showToast('✨ Automação ativada com sucesso para o post selecionado!');
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
  // 7. ATIVAÇÃO / DESATIVAÇÃO E EXCLUSÃO
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

    if (config.postId && state.mediaList) {
      const post = state.mediaList.find((p) => p.id === config.postId);
      if (post) setSelectedPost(post);
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
  // 8. HELPER TOAST
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
  loadInstagramMedia();
});
