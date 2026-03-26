// ========================================
// asobi - API (Supabase queries)
// ========================================

const API = {
  get db() { return Auth.supabase; },

  // ===== Plans =====

  // 自分の友達 + 友達の友達の予定を取得
  async getPlans() {
    const userId = Auth.currentUser?.id;
    if (!userId) return [];

    // Get plans that are open and in the future
    const { data: plans, error } = await this.db
      .from('plans_with_counts')
      .select('*')
      .eq('status', 'open')
      .gte('starts_at', new Date().toISOString())
      .order('starts_at', { ascending: true });

    if (error) { console.error('getPlans error:', error); return []; }

    // For each plan, get participants
    const enriched = await Promise.all(plans.map(async (plan) => {
      const participants = await this.getParticipants(plan.id);
      const myStatus = participants.find(p => p.user_id === userId)?.status || null;
      const tags = await this.getPlanTags(plan.id);
      const creatorRelation = await this.getRelation(userId, plan.creator_id);

      return {
        ...plan,
        participants,
        my_status: myStatus,
        tags,
        creator_relation: creatorRelation
      };
    }));

    return enriched;
  },

  // 予定を作成
  async createPlan({ title, description, location_name, location_detail, starts_at, duration_minutes, max_people, visibility, note, tags, team_mode, team_size }) {
    const userId = Auth.currentUser?.id;
    if (!userId) return null;

    const { data: plan, error } = await this.db
      .from('plans')
      .insert({
        creator_id: userId,
        title,
        description,
        location_name,
        location_detail,
        starts_at,
        duration_minutes: duration_minutes || CONFIG.DEFAULT_DURATION,
        max_people: max_people || CONFIG.DEFAULT_MAX_PEOPLE,
        visibility: visibility || 'friends_of_friends',
        note,
        team_mode: team_mode || false,
        team_size: team_size || 3,
      })
      .select()
      .single();

    if (error) { console.error('createPlan error:', error); return null; }

    // Add tags
    if (tags && tags.length > 0) {
      await this.db.from('plan_tags').insert(
        tags.map(tag => ({ plan_id: plan.id, tag }))
      );
    }

    // Creator auto-joins
    await this.join(plan.id);

    return plan;
  },

  // 予定を更新
  async updatePlan(planId, { title, description, location_name, starts_at, duration_minutes, max_people, visibility, note, tags, team_mode, team_size }) {
    const userId = Auth.currentUser?.id;
    if (!userId) return null;

    const { data: plan, error } = await this.db
      .from('plans')
      .update({
        title,
        description,
        location_name,
        starts_at,
        duration_minutes,
        max_people,
        visibility,
        note,
        team_mode: team_mode !== undefined ? team_mode : undefined,
        team_size: team_size !== undefined ? team_size : undefined,
      })
      .eq('id', planId)
      .eq('creator_id', userId)
      .select()
      .single();

    if (error) { console.error('updatePlan error:', error); return null; }

    // Replace tags
    await this.db.from('plan_tags').delete().eq('plan_id', planId);
    if (tags && tags.length > 0) {
      await this.db.from('plan_tags').insert(
        tags.map(tag => ({ plan_id: planId, tag }))
      );
    }

    return plan;
  },

  // 予定を削除
  async deletePlan(planId) {
    const userId = Auth.currentUser?.id;
    if (!userId) return false;

    const { error } = await this.db
      .from('plans')
      .delete()
      .eq('id', planId)
      .eq('creator_id', userId);

    if (error) { console.error('deletePlan error:', error); return false; }
    return true;
  },

  // 友達にアプリ内通知 ＋ LINE push（新規プラン投稿時）
  async notifyFriends(plan) {
    const userId = Auth.currentUser?.id;
    const userName = Auth.currentUser?.display_name || '友達';
    if (!userId) return;

    const { data: fships } = await this.db
      .from('friendships')
      .select('user_a, user_b')
      .or(`user_a.eq.${userId},user_b.eq.${userId}`);

    const friendIds = (fships || []).map(f => f.user_a === userId ? f.user_b : f.user_a);
    if (friendIds.length === 0) return;

    // アプリ内通知
    await this.db.from('notifications').insert(
      friendIds.map(friendId => ({ user_id: friendId, plan_id: plan.id, type: 'new_plan', actor_id: userId }))
    );

    // LINE push（fire-and-forget）
    this.lineNotify(friendIds, `📅 ${userName} が「${plan.title}」を投稿したよ！\nasobiで確認してね`);
  },

  // 参加者更新通知（誰かが参加した時、主催者＋既存参加者へ通知）
  async notifyParticipants(plan) {
    const userId = Auth.currentUser?.id;
    const userName = Auth.currentUser?.display_name || '誰か';
    if (!userId) return;

    const { data: participants } = await this.db
      .from('participations')
      .select('user_id')
      .eq('plan_id', plan.id)
      .eq('status', 'going');

    const toNotify = new Set([plan.creator_id, ...(participants || []).map(p => p.user_id)]);
    toNotify.delete(userId);

    if (toNotify.size === 0) return;

    const notifyIds = [...toNotify];

    // アプリ内通知
    await this.db.from('notifications').insert(
      notifyIds.map(notifyUserId => ({
        user_id: notifyUserId,
        plan_id: plan.id,
        type: 'new_participant',
        actor_id: userId,
      }))
    );

    // LINE push（fire-and-forget）
    this.lineNotify(notifyIds, `🙋 ${userName} が「${plan.title}」に参加しました！\nasobiで確認してね`);
  },

  // LINE push通知（内部UUID配列 → /api/line-notify）
  async lineNotify(userIds, message) {
    if (!userIds || userIds.length === 0) return;
    try {
      await fetch('/api/line-notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userIds, message }),
      });
    } catch (e) {
      console.error('lineNotify error:', e);
    }
  },

  // ===== Notifications =====

  // 自分への通知一覧（最新20件、プラン情報付き）
  async getNotifications() {
    const userId = Auth.currentUser?.id;
    if (!userId) return [];

    const { data, error } = await this.db
      .from('notifications')
      .select(`
        id, read, created_at, type, actor_id,
        plans(id, title, starts_at, location_name, creator_id,
          users!plans_creator_id_fkey(display_name)
        ),
        actor:users!notifications_actor_id_fkey(display_name),
        free_today(id, comment, user_id, users!free_today_user_id_fkey(display_name))
      `)
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(20);

    if (error) { console.error('getNotifications error:', error); return []; }
    return (data || []).filter(n => n.plans || n.free_today);
  },

  async markNotificationRead(notifId) {
    await this.db.from('notifications').update({ read: true }).eq('id', notifId);
  },

  async markAllNotificationsRead() {
    const userId = Auth.currentUser?.id;
    if (!userId) return;
    await this.db.from('notifications')
      .update({ read: true })
      .eq('user_id', userId)
      .eq('read', false);
  },

  // 自分が作った予定
  async getMyPlans() {
    const userId = Auth.currentUser?.id;
    if (!userId) return [];

    const { data, error } = await this.db
      .from('plans')
      .select('*, plan_tags(tag)')
      .eq('creator_id', userId)
      .order('starts_at', { ascending: false });

    if (error) return [];
    return (data || []).map(p => ({ ...p, tags: (p.plan_tags || []).map(t => t.tag) }));
  },

  // 自分が参加している予定（作成者以外）
  async getMyParticipations() {
    const userId = Auth.currentUser?.id;
    if (!userId) return [];

    const { data, error } = await this.db
      .from('participations')
      .select('plan_id, status, plans(id, title, starts_at, location_name, creator_id)')
      .eq('user_id', userId)
      .eq('status', 'going');

    if (error) return [];
    return (data || [])
      .map(p => p.plans)
      .filter(p => p && p.creator_id !== userId);
  },

  // ===== Teams =====

  // プランのチーム一覧（メンバー込み）を取得
  async getTeams(planId) {
    const { data, error } = await this.db
      .from('teams')
      .select('*, team_members(user_id, joined_at, users(id, display_name))')
      .eq('plan_id', planId)
      .order('created_at', { ascending: true });

    if (error) { console.error('getTeams error:', error); return []; }
    return data || [];
  },

  // チームを作成（作成者は自動参加）
  async createTeam(planId, name, maxMembers) {
    const userId = Auth.currentUser?.id;
    if (!userId) return null;

    const { data: team, error } = await this.db
      .from('teams')
      .insert({ plan_id: planId, name, max_members: maxMembers, created_by: userId })
      .select()
      .single();

    if (error) { console.error('createTeam error:', error); return null; }

    await this.joinTeam(team.id);
    return team;
  },

  // チームに参加
  async joinTeam(teamId) {
    const userId = Auth.currentUser?.id;
    if (!userId) return null;

    const { data, error } = await this.db
      .from('team_members')
      .upsert({ team_id: teamId, user_id: userId }, { onConflict: 'team_id,user_id' })
      .select()
      .single();

    if (error) { console.error('joinTeam error:', error); return null; }
    return data;
  },

  // チームから抜ける
  async leaveTeam(teamId) {
    const userId = Auth.currentUser?.id;
    if (!userId) return;

    const { error } = await this.db
      .from('team_members')
      .delete()
      .eq('team_id', teamId)
      .eq('user_id', userId);

    if (error) console.error('leaveTeam error:', error);
  },

  // 招待コードでチームに参加
  async joinTeamByCode(code) {
    const userId = Auth.currentUser?.id;
    if (!userId) return { error: 'ログインが必要です' };

    const { data: team, error } = await this.db
      .from('teams')
      .select('id, plan_id, name, max_members, team_members(user_id)')
      .eq('invite_code', code.toUpperCase().trim())
      .maybeSingle();

    if (error || !team) return { error: 'チームが見つかりませんでした' };

    const memberCount = (team.team_members || []).length;
    if (memberCount >= team.max_members) return { error: 'チームが満員です' };

    const alreadyIn = (team.team_members || []).some(m => m.user_id === userId);
    if (alreadyIn) return { error: 'すでにこのチームに参加しています' };

    await this.joinTeam(team.id);
    await this.join(team.plan_id);

    return { team };
  },

  // ===== Participations =====

  async join(planId) {
    const userId = Auth.currentUser?.id;
    if (!userId) return null;

    const { data, error } = await this.db
      .from('participations')
      .upsert({
        plan_id: planId,
        user_id: userId,
        status: 'going'
      }, { onConflict: 'plan_id,user_id' })
      .select()
      .single();

    if (error) console.error('join error:', error);
    return data;
  },

  async markInterested(planId) {
    const userId = Auth.currentUser?.id;
    if (!userId) return null;

    const { data, error } = await this.db
      .from('participations')
      .upsert({
        plan_id: planId,
        user_id: userId,
        status: 'interested'
      }, { onConflict: 'plan_id,user_id' })
      .select()
      .single();

    if (error) console.error('markInterested error:', error);
    return data;
  },

  async cancelParticipation(planId) {
    const userId = Auth.currentUser?.id;
    if (!userId) return null;

    const { error } = await this.db
      .from('participations')
      .update({ status: 'cancelled' })
      .eq('plan_id', planId)
      .eq('user_id', userId);

    if (error) console.error('cancel error:', error);
  },

  async getParticipants(planId) {
    const { data, error } = await this.db
      .from('participations')
      .select('*, users(id, display_name, avatar_url)')
      .eq('plan_id', planId)
      .in('status', ['going', 'interested']);

    if (error) { console.error('getParticipants error:', error); return []; }
    return data || [];
  },

  // ===== Tags =====

  async getPlanTags(planId) {
    const { data, error } = await this.db
      .from('plan_tags')
      .select('tag')
      .eq('plan_id', planId);

    if (error) return [];
    return (data || []).map(t => t.tag);
  },

  // ===== Friends =====

  async getFriends() {
    const userId = Auth.currentUser?.id;
    if (!userId) return [];

    // friendshipsテーブルを直接クエリ（user_friendsビューはFK制約がなくjoinできないため）
    const { data: friendships, error } = await this.db
      .from('friendships')
      .select('user_a, user_b')
      .or(`user_a.eq.${userId},user_b.eq.${userId}`);

    if (error) { console.error('getFriends error:', error); return []; }
    if (!friendships?.length) return [];

    const friendIds = friendships.map(f => f.user_a === userId ? f.user_b : f.user_a);

    const { data: users, error: usersError } = await this.db
      .from('users')
      .select('id, display_name, avatar_url')
      .in('id', friendIds);

    if (usersError) { console.error('getFriends users error:', usersError); return []; }
    return (users || []).map(u => ({ friend_id: u.id, users: u }));
  },

  async addFriend(friendId) {
    const userId = Auth.currentUser?.id;
    if (!userId) return null;

    // Always store with smaller UUID first to avoid duplicates
    const [a, b] = [userId, friendId].sort();

    const { data, error } = await this.db
      .from('friendships')
      .upsert({ user_a: a, user_b: b }, { onConflict: 'user_a,user_b' })
      .select()
      .single();

    if (error) console.error('addFriend error:', error);
    return data;
  },

  async getUserByFriendCode(code) {
    const { data, error } = await this.db
      .from('users')
      .select('id, display_name, avatar_url, friend_code')
      .eq('friend_code', code.toUpperCase().trim())
      .maybeSingle();
    if (error) { console.error('getUserByFriendCode error:', error); return null; }
    return data;
  },

  async getCurrentUserFull() {
    const userId = Auth.currentUser?.id;
    if (!userId) return null;
    const { data } = await this.db
      .from('users')
      .select('id, display_name, avatar_url, friend_code')
      .eq('id', userId)
      .single();
    return data;
  },

  // ===== Free Today =====

  async getFreeToday() {
    const userId = Auth.currentUser?.id;
    if (!userId) return [];

    const { data: fships } = await this.db.from('friendships').select('user_a, user_b').or(`user_a.eq.${userId},user_b.eq.${userId}`);
    const friendIds = (fships || []).map(f => f.user_a === userId ? f.user_b : f.user_a);
    const allIds = [...friendIds, userId];

    const now = new Date().toISOString();

    const [{ data: posts, error }, { data: closeFriendOf }] = await Promise.all([
      this.db.from('free_today')
        .select('*, users(id, display_name), free_today_joins(user_id, joined_at)')
        .in('user_id', allIds)
        .gt('expires_at', now)
        .order('created_at', { ascending: false }),
      this.db.from('close_friends').select('user_id').eq('friend_id', userId)
    ]);

    if (error) { console.error('getFreeToday error:', error); return []; }

    const closeFriendOfIds = new Set((closeFriendOf || []).map(r => r.user_id));

    return (posts || []).filter(post => {
      if (post.user_id === userId) return true;
      if (post.visibility === 'close_friends') return closeFriendOfIds.has(post.user_id);
      return true;
    });
  },

  async postFreeToday(comment, visibility) {
    const userId = Auth.currentUser?.id;
    if (!userId) return null;

    // 既存の自分の投稿を削除（1日1投稿）
    await this.db.from('free_today').delete().eq('user_id', userId);

    const expires_at = new Date();
    expires_at.setHours(23, 59, 59, 999);

    const { data, error } = await this.db.from('free_today').insert({
      user_id: userId,
      comment: comment || null,
      visibility: visibility || 'all_friends',
      expires_at: expires_at.toISOString(),
    }).select().single();

    if (error) { console.error('postFreeToday error:', error); return null; }
    return data;
  },

  async deleteFreeToday(id) {
    const userId = Auth.currentUser?.id;
    if (!userId) return;
    await this.db.from('free_today').delete().eq('id', id).eq('user_id', userId);
  },

  async joinFreeToday(freeTodayId) {
    const userId = Auth.currentUser?.id;
    if (!userId) return null;
    const { data, error } = await this.db.from('free_today_joins')
      .upsert({ free_today_id: freeTodayId, user_id: userId }, { onConflict: 'free_today_id,user_id' })
      .select().single();
    if (error) { console.error('joinFreeToday error:', error); return null; }
    return data;
  },

  async leaveFreeToday(freeTodayId) {
    const userId = Auth.currentUser?.id;
    if (!userId) return;
    await this.db.from('free_today_joins').delete()
      .eq('free_today_id', freeTodayId).eq('user_id', userId);
  },

  async notifyFriendsOfFreeToday(freeTodayId, visibility) {
    const userId = Auth.currentUser?.id;
    if (!userId) return;

    let friendIds;
    if (visibility === 'close_friends') {
      const { data: cf } = await this.db.from('close_friends').select('friend_id').eq('user_id', userId);
      friendIds = (cf || []).map(f => f.friend_id);
    } else {
      const { data: fr } = await this.db.from('friendships').select('user_a, user_b').or(`user_a.eq.${userId},user_b.eq.${userId}`);
      friendIds = (fr || []).map(f => f.user_a === userId ? f.user_b : f.user_a);
    }

    if (!friendIds || friendIds.length === 0) return;

    await this.db.from('notifications').insert(
      friendIds.map(friendId => ({
        user_id: friendId,
        free_today_id: freeTodayId,
        type: 'free_today',
        actor_id: userId,
      }))
    );
  },

  // ===== Close Friends =====

  async getCloseFriends() {
    const userId = Auth.currentUser?.id;
    if (!userId) return [];
    const { data, error } = await this.db.from('close_friends')
      .select('friend_id').eq('user_id', userId);
    if (error) { console.error('getCloseFriends error:', error); return []; }
    return (data || []).map(r => r.friend_id);
  },

  async addCloseFriend(friendId) {
    const userId = Auth.currentUser?.id;
    if (!userId) return;
    await this.db.from('close_friends')
      .upsert({ user_id: userId, friend_id: friendId }, { onConflict: 'user_id,friend_id' });
  },

  async removeCloseFriend(friendId) {
    const userId = Auth.currentUser?.id;
    if (!userId) return;
    await this.db.from('close_friends').delete()
      .eq('user_id', userId).eq('friend_id', friendId);
  },

  // ===== Relations =====

  async getRelation(userId, otherUserId) {
    if (userId === otherUserId) return 'self';

    // Check direct friendship (friendshipsはuser_a < user_bで格納)
    const [a, b] = [userId, otherUserId].sort();
    const { data: direct } = await this.db
      .from('friendships')
      .select('user_a')
      .eq('user_a', a)
      .eq('user_b', b)
      .maybeSingle();

    if (direct) return 'friend';

    // Check friend-of-friend: 自分の友達IDを取得
    const { data: myFships } = await this.db
      .from('friendships')
      .select('user_a, user_b')
      .or(`user_a.eq.${userId},user_b.eq.${userId}`);

    const friendIds = (myFships || []).map(f => f.user_a === userId ? f.user_b : f.user_a);
    if (friendIds.length === 0) return null;

    // otherUserIdの友達IDを取得して共通を探す
    const { data: theirFships } = await this.db
      .from('friendships')
      .select('user_a, user_b')
      .or(`user_a.eq.${otherUserId},user_b.eq.${otherUserId}`);

    const theirFriendIds = new Set((theirFships || []).map(f => f.user_a === otherUserId ? f.user_b : f.user_a));
    const mutualFriendId = friendIds.find(fid => theirFriendIds.has(fid));

    if (mutualFriendId) {
      const { data: mutualUser } = await this.db
        .from('users')
        .select('display_name')
        .eq('id', mutualFriendId)
        .single();
      return mutualUser ? `${mutualUser.display_name}の友達` : '友達の友達';
    }

    return null;
  }
};
