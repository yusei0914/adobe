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

  // 友達にアプリ内通知を送る（notificationsテーブルに直接挿入）
  async notifyFriends(plan) {
    const userId = Auth.currentUser?.id;
    if (!userId) return;

    const { data: friends } = await this.db
      .from('user_friends')
      .select('friend_id')
      .eq('user_id', userId);

    const friendIds = (friends || []).map(f => f.friend_id);
    if (friendIds.length === 0) return;

    await this.db.from('notifications').insert(
      friendIds.map(friendId => ({ user_id: friendId, plan_id: plan.id }))
    );
  },

  // ===== Notifications =====

  // 自分への通知一覧（最新20件、プラン情報付き）
  async getNotifications() {
    const userId = Auth.currentUser?.id;
    if (!userId) return [];

    const { data, error } = await this.db
      .from('notifications')
      .select(`
        id, read, created_at,
        plans(id, title, starts_at, location_name, creator_id,
          users!plans_creator_id_fkey(display_name)
        )
      `)
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(20);

    if (error) { console.error('getNotifications error:', error); return []; }
    return (data || []).filter(n => n.plans); // 削除済みプランは除外
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

    const { data, error } = await this.db
      .from('user_friends')
      .select('friend_id, users!user_friends_friend_id_fkey(id, display_name, avatar_url)')
      .eq('user_id', userId);

    if (error) { console.error('getFriends error:', error); return []; }
    return data || [];
  },

  async addFriend(friendId) {
    const userId = Auth.currentUser?.id;
    if (!userId) return null;

    // Always store with smaller UUID first to avoid duplicates
    const [a, b] = [userId, friendId].sort();

    const { data, error } = await this.db
      .from('friendships')
      .insert({ user_a: a, user_b: b })
      .select()
      .single();

    if (error) console.error('addFriend error:', error);
    return data;
  },

  // ===== Relations =====

  async getRelation(userId, otherUserId) {
    if (userId === otherUserId) return 'self';

    // Check direct friendship
    const { data: direct } = await this.db
      .from('user_friends')
      .select('friend_id')
      .eq('user_id', userId)
      .eq('friend_id', otherUserId)
      .maybeSingle();

    if (direct) return 'friend';

    // Check friend-of-friend
    const { data: myFriends } = await this.db
      .from('user_friends')
      .select('friend_id')
      .eq('user_id', userId);

    if (myFriends) {
      const friendIds = myFriends.map(f => f.friend_id);
      const { data: mutual } = await this.db
        .from('user_friends')
        .select('user_id')
        .eq('friend_id', otherUserId)
        .in('user_id', friendIds)
        .limit(1);

      if (mutual && mutual.length > 0) {
        // Find the mutual friend's name
        const mutualFriendId = mutual[0].user_id;
        const { data: mutualUser } = await this.db
          .from('users')
          .select('display_name')
          .eq('id', mutualFriendId)
          .single();

        return mutualUser ? `${mutualUser.display_name}の友達` : '友達の友達';
      }
    }

    return null;
  }
};
