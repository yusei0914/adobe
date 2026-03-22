// ========================================
// asobi - Main App Controller
// ========================================

const App = {
  plans: [],
  currentPlan: null,
  editingPlanId: null,

  async init() {
    // Init Supabase
    Auth.init();

    // Check session
    const user = await Auth.getSession();

    if (user) {
      this.onLoggedIn(user);
    } else {
      UI.showScreen('login-screen');
    }

    // Event listeners
    this.bindEvents();
  },

  bindEvents() {
    // LINE login button
    document.getElementById('btn-line-login')?.addEventListener('click', () => {
      Auth.loginWithLINE();
    });

    // Tab navigation
    document.querySelectorAll('.tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        const target = tab.dataset.tab;
        if (target === 'home') UI.showScreen('home-screen');
        if (target === 'profile') { UI.showScreen('profile-screen'); this.loadProfile(); }
      });
    });

    // Back button
    document.getElementById('btn-back-home')?.addEventListener('click', () => {
      UI.showScreen('home-screen');
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelector('[data-tab="home"]')?.classList.add('active');
    });

    // Post modal
    document.getElementById('btn-open-post')?.addEventListener('click', () => {
      this.openPostModal();
    });

    document.getElementById('modal-post')?.addEventListener('click', (e) => {
      if (e.target.id === 'modal-post') UI.hideModal('modal-post');
    });

    document.getElementById('modal-confirm')?.addEventListener('click', (e) => {
      if (e.target.id === 'modal-confirm') UI.hideModal('modal-confirm');
    });

    // Post submit
    document.getElementById('btn-post-submit')?.addEventListener('click', () => {
      this.submitPost();
    });

    // Tag selection
    document.querySelectorAll('.tag-selectable').forEach(tag => {
      tag.addEventListener('click', () => {
        tag.classList.toggle('selected');
      });
    });
  },

  async onLoggedIn(user) {
    // Update UI with user info
    const initial = getInitial(user.display_name);
    document.querySelectorAll('.avatar-sm').forEach(el => {
      el.textContent = initial;
    });

    // Show tab bar
    document.getElementById('tab-bar').style.display = 'flex';

    // Load plans
    await this.refreshPlans();

    // Show home
    UI.showScreen('home-screen');
  },

  async refreshPlans() {
    this.plans = await API.getPlans();
    this.renderPlans();
  },

  renderPlans() {
    const list = document.getElementById('plans-list');
    const empty = document.getElementById('plans-empty');

    list.innerHTML = '';

    if (this.plans.length === 0) {
      empty.style.display = 'block';
      return;
    }

    empty.style.display = 'none';
    this.plans.forEach((plan, i) => {
      const card = UI.renderPlanCard(plan);
      card.classList.add('animate', `delay-${Math.min(i + 1, 5)}`);
      list.appendChild(card);
    });
  },

  // ===== Actions =====

  confirmJoin(planId) {
    const plan = this.plans.find(p => p.id === planId);
    if (!plan) return;

    this.currentPlan = plan;
    UI.renderConfirmModal(plan);
    UI.showModal('modal-confirm');
  },

  async doJoin(planId) {
    const plan = this.plans.find(p => p.id === planId);
    if (!plan) return;

    await API.join(planId);
    UI.renderSuccessModal(plan);
    UI.showToast('カレンダーに追加した');
  },

  async interested(planId) {
    await API.markInterested(planId);
    UI.showToast('気になるに入れた');
    await this.refreshPlans();
  },

  async cancelJoin(planId) {
    await API.cancelParticipation(planId);
    UI.showToast('キャンセルした');
    UI.showScreen('home-screen');
    await this.refreshPlans();
  },

  async openDetail(planId) {
    const plan = this.plans.find(p => p.id === planId);
    if (!plan) return;

    this.currentPlan = plan;
    UI.renderDetail(plan);
    UI.showScreen('detail-screen');

    // Load teams if team mode
    if (plan.team_mode) {
      const teams = await API.getTeams(planId);
      UI.renderTeams(plan, teams);
    }
  },

  async deletePlan(planId) {
    if (!window.confirm('この予定を削除しますか？\n参加者全員の予定からも消えます。')) return;

    const ok = await API.deletePlan(planId);
    if (ok) {
      UI.showToast('予定を削除したよ');
      UI.showScreen('home-screen');
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelector('[data-tab="home"]')?.classList.add('active');
      await this.refreshPlans();
    } else {
      UI.showToast('エラーが発生しました');
    }
  },

  // ===== Teams =====

  openTeamCreate(planId) {
    this._teamCreatePlanId = planId;
    document.getElementById('team-name-input').value = '';
    UI.showModal('modal-team-create');
  },

  async submitTeamCreate() {
    const name = document.getElementById('team-name-input').value.trim();
    if (!name) { UI.showToast('チーム名を入れて！'); return; }

    const plan = this.currentPlan;
    if (!plan) return;

    const team = await API.createTeam(plan.id, name, plan.team_size || 3);
    if (team) {
      UI.hideModal('modal-team-create');
      UI.showToast(`「${name}」チームを作ったよ！`);
      // Also ensure user is going
      await API.join(plan.id);
      const teams = await API.getTeams(plan.id);
      UI.renderTeams(plan, teams);
    } else {
      UI.showToast('エラーが発生しました');
    }
  },

  async doJoinTeam(teamId, planId) {
    await API.joinTeam(teamId);
    // Also ensure user is going
    await API.join(planId);
    UI.showToast('チームに参加したよ！');
    const plan = this.currentPlan;
    const teams = await API.getTeams(planId);
    UI.renderTeams(plan, teams);
  },

  async leaveTeam(teamId, planId) {
    await API.leaveTeam(teamId);
    UI.showToast('チームを抜けたよ');
    const plan = this.currentPlan;
    const teams = await API.getTeams(planId);
    UI.renderTeams(plan, teams);
  },

  toggleTeamMode(enabled) {
    const wrap = document.getElementById('team-size-wrap');
    if (wrap) wrap.style.display = enabled ? 'inline-flex' : 'none';
  },

  shareInvite() {
    const userId = Auth.currentUser?.id;
    if (!userId) return;
    const inviteUrl = `${window.location.origin}/invite.html?uid=${userId}`;
    const text = encodeURIComponent(`asobiで一緒に遊ぼう！\n友達追加はこちら👇\n${inviteUrl}`);
    window.open(`https://line.me/R/msg/text/?${text}`, '_blank');
  },

  async loadProfile() {
    const user = Auth.currentUser;
    if (!user) return;

    const [myPlans, myParticipations] = await Promise.all([
      API.getMyPlans(),
      API.getMyParticipations(),
    ]);

    UI.renderProfile(user, myPlans, myParticipations);
  },

  openEdit(planId) {
    const plan = this.plans.find(p => p.id === planId);
    if (!plan) return;

    this.editingPlanId = planId;

    // Pre-fill form with existing plan data
    document.getElementById('post-title-input').value = plan.title || '';
    document.getElementById('post-desc-input').value = plan.description || '';
    document.getElementById('post-location').value = plan.location_name || '';

    const dtInput = document.getElementById('post-datetime');
    if (dtInput && plan.starts_at) {
      dtInput.value = new Date(plan.starts_at).toISOString().slice(0, 16);
    }

    const maxPeopleSelect = document.getElementById('post-max-people');
    if (maxPeopleSelect && plan.max_people) {
      maxPeopleSelect.value = plan.max_people;
    }

    const visibilitySelect = document.getElementById('post-visibility');
    if (visibilitySelect && plan.visibility) {
      visibilitySelect.value = plan.visibility;
    }

    // Pre-select tags
    document.querySelectorAll('.tag-selectable').forEach(t => {
      t.classList.toggle('selected', (plan.tags || []).includes(t.dataset.tag));
    });

    // Team mode
    const teamModeChk = document.getElementById('post-team-mode');
    if (teamModeChk) { teamModeChk.checked = !!plan.team_mode; this.toggleTeamMode(!!plan.team_mode); }
    const teamSizeSelect = document.getElementById('post-team-size');
    if (teamSizeSelect) teamSizeSelect.value = String(plan.team_size || 3);

    document.getElementById('btn-post-submit').textContent = '更新する';
    UI.showModal('modal-post');
  },

  // ===== Post =====

  openPostModal() {
    this.editingPlanId = null;

    // Set default datetime to 2 hours from now
    const defaultTime = new Date();
    defaultTime.setHours(defaultTime.getHours() + 2);
    defaultTime.setMinutes(0);
    const dtInput = document.getElementById('post-datetime');
    if (dtInput) {
      dtInput.value = defaultTime.toISOString().slice(0, 16);
    }

    // Clear form
    document.getElementById('post-title-input').value = '';
    document.getElementById('post-desc-input').value = '';
    document.getElementById('post-location').value = '';
    document.querySelectorAll('.tag-selectable').forEach(t => t.classList.remove('selected'));
    document.getElementById('btn-post-submit').textContent = '誘う';
    const teamModeChk = document.getElementById('post-team-mode');
    if (teamModeChk) { teamModeChk.checked = false; this.toggleTeamMode(false); }
    const teamSizeSelect = document.getElementById('post-team-size');
    if (teamSizeSelect) teamSizeSelect.value = '3';

    UI.showModal('modal-post');
  },

  async submitPost() {
    const title = document.getElementById('post-title-input').value.trim();
    if (!title) {
      UI.showToast('何やるか入れて！');
      return;
    }

    const description = document.getElementById('post-desc-input').value.trim();
    const starts_at = document.getElementById('post-datetime').value;
    const location_name = document.getElementById('post-location').value.trim();
    const max_people = parseInt(document.getElementById('post-max-people').value);
    const visibility = document.getElementById('post-visibility').value;

    const selectedTags = [];
    document.querySelectorAll('.tag-selectable.selected').forEach(t => {
      selectedTags.push(t.dataset.tag);
    });

    const team_mode = document.getElementById('post-team-mode')?.checked || false;
    const team_size = parseInt(document.getElementById('post-team-size')?.value || '3');

    if (!starts_at) {
      UI.showToast('日時を入れて！');
      return;
    }

    if (this.editingPlanId) {
      // Edit mode
      const plan = await API.updatePlan(this.editingPlanId, {
        title,
        description,
        location_name,
        starts_at: new Date(starts_at).toISOString(),
        max_people,
        visibility,
        tags: selectedTags,
        team_mode,
        team_size,
      });

      if (plan) {
        UI.hideModal('modal-post');
        UI.showToast('予定を更新したよ！');
        this.editingPlanId = null;
        await this.refreshPlans();
        // Re-render detail if open
        if (this.currentPlan?.id === plan.id) {
          const updated = this.plans.find(p => p.id === plan.id);
          if (updated) {
            this.currentPlan = updated;
            UI.renderDetail(updated);
          }
        }
      } else {
        UI.showToast('エラーが発生しました');
      }
    } else {
      // Create mode
      const plan = await API.createPlan({
        title,
        description,
        location_name,
        starts_at: new Date(starts_at).toISOString(),
        max_people,
        visibility,
        tags: selectedTags,
        team_mode,
        team_size,
      });

      if (plan) {
        UI.hideModal('modal-post');
        UI.showToast('投稿した！友達に通知が届くよ');
        API.notifyFriends(plan); // fire-and-forget
        await this.refreshPlans();
      } else {
        UI.showToast('エラーが発生しました');
      }
    }
  }
};

// ===== Start =====
document.addEventListener('DOMContentLoaded', () => {
  App.init();
});
