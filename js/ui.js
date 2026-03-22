// ========================================
// asobi - UI Components
// ========================================

const UI = {

  // Show/hide screens
  showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const screen = document.getElementById(screenId);
    if (screen) {
      screen.classList.add('active');
      screen.querySelectorAll('.animate').forEach(el => {
        el.style.animation = 'none';
        el.offsetHeight;
        el.style.animation = '';
      });
    }
  },

  // Toast notification
  showToast(msg) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 2000);
  },

  // Modal
  showModal(id) {
    document.getElementById(id).classList.add('show');
  },
  hideModal(id) {
    document.getElementById(id).classList.remove('show');
  },

  // ===== Render Notifications =====
  renderNotifications(notifications) {
    const section = document.getElementById('notifications-section');
    if (!section) return;

    const unread = notifications.filter(n => !n.read);

    if (notifications.length === 0) {
      section.innerHTML = '';
      return;
    }

    const items = notifications.slice(0, 6).map(n => {
      const plan = n.plans;
      if (!plan) return '';
      const creator = plan.users?.display_name || '友達';
      const timeLabel = this.formatTimeLabel(plan.starts_at);
      return `
        <div class="notif-item${n.read ? ' notif-read' : ''}" onclick="App.openNotification('${n.id}','${plan.id}')">
          <span class="notif-dot${n.read ? ' notif-dot-read' : ''}"></span>
          <div class="notif-body">
            <div class="notif-text"><strong>${creator}</strong> が「${plan.title}」を投稿</div>
            <div class="notif-meta">${timeLabel}${plan.location_name ? ' · ' + plan.location_name : ''}</div>
          </div>
          <span class="notif-arrow">›</span>
        </div>
      `;
    }).join('');

    section.innerHTML = `
      <div class="notif-card${unread.length > 0 ? ' notif-card-active' : ''}">
        <div class="notif-header">
          <div style="display:flex;align-items:center;gap:8px;">
            <span>🔔</span>
            <span class="notif-title">友達の新着予定</span>
            ${unread.length > 0 ? `<span class="notif-badge">${unread.length}</span>` : ''}
          </div>
          ${unread.length > 0
            ? `<button class="notif-all-read" onclick="App.markAllNotificationsRead()">すべて既読</button>`
            : `<span style="font-size:11px;color:#aeaeb2;">既読済み</span>`}
        </div>
        ${items}
      </div>
    `;
  },

  // ===== Render Plan Card =====
  renderPlanCard(plan) {
    const creator = plan.creator_name || '誰か';
    const initial = getInitial(creator);
    const color = getAvatarColor(plan.creator_id);
    const relation = plan.creator_relation || '';
    const timeLabel = this.formatTimeLabel(plan.starts_at);
    const goingParticipants = (plan.participants || []).filter(p => p.status === 'going');
    const friendNames = goingParticipants
      .filter(p => p.user_id !== plan.creator_id && p.user_id !== Auth.currentUser?.id)
      .slice(0, 3)
      .map(p => p.users?.display_name || '?');

    const isJoined = plan.my_status === 'going';
    const spotsLeft = plan.max_people - (plan.going_count || 0);

    const card = document.createElement('div');
    card.className = `plan-card${isJoined ? ' joined' : ''}`;
    card.id = `card-${plan.id}`;

    card.innerHTML = `
      <div class="plan-top">
        <div class="plan-avatar" style="background:${color};">${initial}</div>
        <div class="plan-who">
          <div class="plan-name">${creator}</div>
          <div class="plan-rel">${relation ? relation : ''}</div>
        </div>
        <div class="plan-time-badge">${timeLabel}</div>
      </div>
      <div class="plan-body">
        <div class="plan-title">${plan.title}</div>
        ${plan.description ? `<div class="plan-desc">${plan.description}</div>` : ''}
        ${friendNames.length > 0 ? `
          <div class="plan-friends">
            <div class="plan-friends-avatars">
              ${goingParticipants.slice(0, 3).map(p => {
                const pName = p.users?.display_name || '?';
                const pColor = getAvatarColor(p.user_id);
                return `<div class="mini-avatar" style="background:${pColor};">${getInitial(pName)}</div>`;
              }).join('')}
            </div>
            <span class="plan-friends-text">${friendNames.join('、')}${goingParticipants.length > 3 ? ` 他${goingParticipants.length - 3}人` : ''} が参加</span>
          </div>
        ` : ''}
        <div class="plan-meta">
          ${plan.location_name ? `<span>📍 ${plan.location_name}</span>` : ''}
          <span>⏱ ${plan.duration_minutes || 90}分</span>
          <span>👥 ${plan.going_count || 0}/${plan.max_people}人</span>
        </div>
        ${plan.tags && plan.tags.length > 0 ? `
          <div class="plan-tags">
            ${plan.tags.map(t => `<span class="tag">${t}</span>`).join('')}
          </div>
        ` : ''}
        <div class="plan-actions" id="actions-${plan.id}">
          ${isJoined ? `
            <button class="btn btn-success" style="flex:2;" onclick="App.openDetail('${plan.id}')">行く予定 ✓ 詳細</button>
          ` : `
            <button class="btn btn-secondary" onclick="App.interested('${plan.id}')">気になる</button>
            <button class="btn btn-primary" onclick="App.confirmJoin('${plan.id}')">行く</button>
          `}
        </div>
      </div>
    `;

    return card;
  },

  // ===== Render Detail Screen =====
  renderDetail(plan) {
    const goingParticipants = (plan.participants || []).filter(p => p.status === 'going');

    document.getElementById('detail-title').textContent = plan.title;
    document.getElementById('detail-who').textContent = `${plan.creator_name} の予定`;
    document.getElementById('detail-time').textContent = this.formatDateTime(plan.starts_at);
    document.getElementById('detail-duration').textContent = `${plan.duration_minutes || 90}分`;
    document.getElementById('detail-place').textContent = plan.location_name || '未定';
    document.getElementById('detail-place-sub').textContent = plan.location_detail || '';
    document.getElementById('detail-people-count').textContent = `${goingParticipants.length}人参加`;
    document.getElementById('detail-people-sub').textContent = 'あなた含む';
    document.getElementById('detail-note').textContent = plan.note || plan.description || '';

    // Countdown
    this.startCountdown(plan.starts_at);

    // Members
    document.getElementById('detail-members').innerHTML = goingParticipants.map(p => {
      const name = p.users?.display_name || '?';
      const color = getAvatarColor(p.user_id);
      const isCreator = p.user_id === plan.creator_id;
      const isSelf = p.user_id === Auth.currentUser?.id;
      const label = isCreator ? '主催' : (isSelf ? 'あなた' : '');
      return `
        <div class="member-row">
          <div class="member-avatar" style="background:${color};">${getInitial(name)}</div>
          <div style="flex:1;">
            <div class="member-name">${isSelf ? 'あなた' : name}</div>
            ${label ? `<div class="member-rel">${label}</div>` : ''}
          </div>
        </div>
      `;
    }).join('');

    // Tags
    document.getElementById('detail-tags').innerHTML = (plan.tags || [])
      .map(t => `<span class="card-badge badge-green">${t}</span>`).join('');
    document.getElementById('detail-vibe-text').textContent = '';

    // Teams card visibility
    const teamsCard = document.getElementById('detail-teams-card');
    if (teamsCard) teamsCard.style.display = plan.team_mode ? 'block' : 'none';

    // Actions
    const isCreator = plan.creator_id === Auth.currentUser?.id;
    document.getElementById('detail-actions').innerHTML = `
      ${isCreator ? `
        <button class="btn-large btn-secondary" onclick="App.openEdit('${plan.id}')" style="margin-bottom:8px;">編集する</button>
        <button class="btn-large btn-danger" onclick="App.deletePlan('${plan.id}')" style="margin-bottom:8px;">削除する</button>
      ` : `
        <button class="btn-large btn-danger" onclick="App.cancelJoin('${plan.id}')">やっぱやめる</button>
        <p style="text-align:center;font-size:11px;color:#aeaeb2;margin-top:6px;">開始1時間前までキャンセルOK</p>
      `}
      <button class="btn-large btn-secondary" onclick="App.shareInvite()" style="margin-top:8px;">友達を招待</button>
    `;
  },

  // ===== Confirm Modal =====
  renderConfirmModal(plan) {
    const goingCount = plan.going_count || 0;
    document.getElementById('modal-confirm-content').innerHTML = `
      <div class="confirm-icon"><span class="emoji">${this.getPlanEmoji(plan.title)}</span></div>
      <div class="confirm-title">${plan.title}</div>
      <div class="confirm-sub">${plan.creator_name} の予定に参加</div>
      <div class="confirm-details">
        <div class="confirm-row"><span class="label">いつ</span><span class="value">${this.formatDateTime(plan.starts_at)}</span></div>
        <div class="confirm-row"><span class="label">どこ</span><span class="value">${plan.location_name || '未定'}</span></div>
        <div class="confirm-row"><span class="label">今の参加者</span><span class="value">${goingCount}人 → あなたで${goingCount + 1}人目</span></div>
        ${plan.note ? `<div class="confirm-row"><span class="label">メモ</span><span class="value">${plan.note}</span></div>` : ''}
      </div>
      <div class="confirm-actions">
        <button class="btn-large btn-join pulse" onclick="App.doJoin('${plan.id}')">行く</button>
        <button class="btn-large btn-cancel" onclick="UI.hideModal('modal-confirm')">やめとく</button>
      </div>
    `;
  },

  renderSuccessModal(plan) {
    document.getElementById('modal-confirm-content').innerHTML = `
      <div class="success-view">
        <div class="success-check">
          <svg viewBox="0 0 36 36" fill="none"><path class="checkmark" d="M8 18 L15 25 L28 11" stroke="white" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </div>
        <div class="success-title">行くことにした！</div>
        <div class="success-sub">${plan.title}</div>
        <div class="reminder-badge">🔔 30分前にお知らせ</div>
        <div class="success-card">
          <h4>あとは行くだけ</h4>
          <p>時間になったら場所への行き方が届く。<br>持ち物も前日にリマインドするよ。</p>
        </div>
        <button class="btn-large btn-join" onclick="UI.hideModal('modal-confirm'); App.refreshPlans();">OK</button>
      </div>
    `;
  },

  // ===== Render Teams =====
  renderTeams(plan, teams) {
    const userId = Auth.currentUser?.id;
    const list = document.getElementById('detail-teams-list');
    const actions = document.getElementById('detail-teams-actions');
    const badge = document.getElementById('detail-teams-badge');
    if (!list || !actions) return;

    // Is the current user already in a team for this plan?
    const myTeam = teams.find(t =>
      (t.team_members || []).some(m => m.user_id === userId)
    );

    badge.textContent = `${teams.length}チーム`;

    list.innerHTML = teams.map(team => {
      const members = team.team_members || [];
      const isFull = members.length >= team.max_members;
      const isMyTeam = myTeam?.id === team.id;

      const avatars = members.map(m => {
        const name = m.users?.display_name || '?';
        const color = getAvatarColor(m.user_id);
        return `<div class="mini-avatar" style="background:${color};">${getInitial(name)}</div>`;
      }).join('');

      const emptySlots = team.max_members - members.length;
      const emptyAvatars = Array(emptySlots).fill(
        `<div class="mini-avatar team-slot-empty"></div>`
      ).join('');

      let actionBtn = '';
      if (isMyTeam) {
        actionBtn = `<span class="team-status-mine">あなたのチーム</span>`;
      } else if (isFull) {
        actionBtn = `<span class="team-status-full">確定 ✓</span>`;
      } else if (!myTeam) {
        actionBtn = `<button class="btn btn-primary" style="padding:6px 14px;font-size:13px;" onclick="App.doJoinTeam('${team.id}','${plan.id}')">入る</button>`;
      }

      return `
        <div class="team-row${isMyTeam ? ' team-row-mine' : ''}">
          <div class="team-row-top">
            <div class="team-name">${team.name}</div>
            <div class="team-count">${members.length}/${team.max_members}人${isFull ? ' ✓' : ''}</div>
          </div>
          <div class="team-row-bottom">
            <div class="plan-friends-avatars">${avatars}${emptyAvatars}</div>
            <div style="flex:1;"></div>
            ${actionBtn}
          </div>
        </div>
      `;
    }).join('');

    if (teams.length === 0) {
      list.innerHTML = '<p style="font-size:13px;color:#8e8e93;padding:8px 0;">まだチームがないよ。最初に作ろう！</p>';
    }

    // "チームを作る" button — show only if not in a team yet
    if (!myTeam) {
      actions.innerHTML = `
        <button class="btn-large btn-secondary" onclick="App.openTeamCreate('${plan.id}')">🏆 チームを作る</button>
      `;
    } else {
      actions.innerHTML = `
        <button class="btn btn-secondary" style="font-size:13px;padding:8px 16px;" onclick="App.leaveTeam('${myTeam.id}','${plan.id}')">チームを抜ける</button>
      `;
    }
  },

  // ===== Render Profile =====
  renderProfile(user, myPlans, myParticipations) {
    const el = document.getElementById('profile-content');
    if (!el) return;

    const initial = getInitial(user.display_name);
    const color = getAvatarColor(user.id);

    const planRow = (plan, isCreator) => {
      const date = new Date(plan.starts_at);
      const dateStr = `${date.getMonth() + 1}月${date.getDate()}日 ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
      const badge = isCreator
        ? `<span class="card-badge badge-blue">主催</span>`
        : `<span class="card-badge badge-green">参加</span>`;
      return `
        <div class="profile-plan-row">
          <div style="flex:1;">
            <div class="profile-plan-title">${plan.title}</div>
            <div class="profile-plan-meta">${dateStr}${plan.location_name ? ' · ' + plan.location_name : ''}</div>
          </div>
          ${badge}
        </div>
      `;
    };

    const allPlans = [
      ...myPlans.map(p => ({ ...p, _isCreator: true })),
      ...myParticipations.map(p => ({ ...p, _isCreator: false })),
    ].sort((a, b) => new Date(b.starts_at) - new Date(a.starts_at));

    el.innerHTML = `
      <div class="profile-hero">
        <div class="profile-avatar" style="background:${color};">${initial}</div>
        <div class="profile-name">${user.display_name}</div>
        <div class="profile-sub">💬 LINE でログイン中</div>
        <button class="btn btn-secondary" style="margin-top:14px;padding:10px 24px;width:auto;" onclick="App.shareInvite()">友達を招待</button>
      </div>
      <div class="card">
        <div class="card-header">
          <span class="card-title">あなたの予定</span>
          <span class="card-badge badge-blue">${allPlans.length}件</span>
        </div>
        ${allPlans.length > 0
          ? allPlans.map(p => planRow(p, p._isCreator)).join('')
          : '<p style="font-size:13px;color:#8e8e93;text-align:center;padding:16px 0;">まだ予定がないよ</p>'}
      </div>
    `;
  },

  // ===== Helpers =====

  formatTimeLabel(dateStr) {
    const date = new Date(dateStr);
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const hours = String(date.getHours()).padStart(2, '0');
    const mins = String(date.getMinutes()).padStart(2, '0');

    if (date.toDateString() === now.toDateString()) {
      return `今日 ${hours}:${mins}`;
    } else if (date.toDateString() === tomorrow.toDateString()) {
      return `明日 ${hours}:${mins}`;
    } else {
      return `${date.getMonth() + 1}/${date.getDate()} ${hours}:${mins}`;
    }
  },

  formatDateTime(dateStr) {
    const date = new Date(dateStr);
    const hours = String(date.getHours()).padStart(2, '0');
    const mins = String(date.getMinutes()).padStart(2, '0');
    return `${date.getMonth() + 1}月${date.getDate()}日 ${hours}:${mins}`;
  },

  countdownInterval: null,
  startCountdown(dateStr) {
    if (this.countdownInterval) clearInterval(this.countdownInterval);

    const update = () => {
      const diff = Math.max(0, new Date(dateStr) - new Date());
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      const el = document.getElementById('detail-countdown');
      if (el) el.textContent = `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
    };

    update();
    this.countdownInterval = setInterval(update, 1000);
  },

  getPlanEmoji(title) {
    const lower = title.toLowerCase();
    if (lower.includes('フットサル') || lower.includes('サッカー') || lower.includes('スポーツ')) return '⚽';
    if (lower.includes('ボドゲ') || lower.includes('ゲーム')) return '🎲';
    if (lower.includes('勉強') || lower.includes('toeic') || lower.includes('TOEIC')) return '📚';
    if (lower.includes('カラオケ')) return '🎤';
    if (lower.includes('飲み')) return '🍻';
    if (lower.includes('映画')) return '🎬';
    if (lower.includes('ラーメン') || lower.includes('ご飯') || lower.includes('ランチ')) return '🍜';
    return '🎈';
  }
};
