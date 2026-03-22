-- ========================================
-- 都市OS MVP - Supabase DB Schema
-- スコープ: 誘う→乗る→行く のコアループ
-- ========================================

-- ユーザー（LINEログインで作られる）
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  line_user_id TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  avatar_url TEXT,
  university TEXT,
  grade TEXT, -- 学年
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 友達関係（双方向）
CREATE TABLE friendships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_a UUID REFERENCES users(id) NOT NULL,
  user_b UUID REFERENCES users(id) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_a, user_b)
);

-- 予定（「イベント」ではなく「あそび」）
CREATE TABLE plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id UUID REFERENCES users(id) NOT NULL,
  title TEXT NOT NULL,               -- 「フットサルやるけど来ない？」
  description TEXT,                   -- 「四谷グラウンドでやる。初心者もいるよ」
  location_name TEXT,                 -- 「四谷グラウンド」
  location_detail TEXT,               -- 「正門から徒歩3分」
  starts_at TIMESTAMPTZ NOT NULL,
  duration_minutes INT DEFAULT 90,
  max_people INT DEFAULT 10,
  visibility TEXT DEFAULT 'friends',  -- 'friends' | 'friends_of_friends' | 'anyone'
  note TEXT,                          -- 「運動靴だけあればOK」
  status TEXT DEFAULT 'open',         -- 'open' | 'closed' | 'cancelled'
  created_at TIMESTAMPTZ DEFAULT now()
);

-- タグ（予定につける）
CREATE TABLE plan_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID REFERENCES plans(id) ON DELETE CASCADE NOT NULL,
  tag TEXT NOT NULL -- '初心者OK', 'ひとりで来てOK', '途中参加OK', '手ぶらOK'
);

-- 参加（「行く」「気になる」）
CREATE TABLE participations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID REFERENCES plans(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES users(id) NOT NULL,
  status TEXT DEFAULT 'going',  -- 'going' | 'interested' | 'cancelled'
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(plan_id, user_id)
);

-- ========================================
-- INDEXES
-- ========================================
CREATE INDEX idx_plans_creator ON plans(creator_id);
CREATE INDEX idx_plans_starts ON plans(starts_at);
CREATE INDEX idx_plans_status ON plans(status);
CREATE INDEX idx_participations_plan ON participations(plan_id);
CREATE INDEX idx_participations_user ON participations(user_id);
CREATE INDEX idx_friendships_a ON friendships(user_a);
CREATE INDEX idx_friendships_b ON friendships(user_b);

-- ========================================
-- VIEWS (便利クエリ)
-- ========================================

-- 友達一覧（双方向）
CREATE VIEW user_friends AS
  SELECT user_a AS user_id, user_b AS friend_id, created_at FROM friendships
  UNION ALL
  SELECT user_b AS user_id, user_a AS friend_id, created_at FROM friendships;

-- 予定 + 参加者数
CREATE VIEW plans_with_counts AS
  SELECT
    p.*,
    u.display_name AS creator_name,
    u.avatar_url AS creator_avatar,
    COUNT(CASE WHEN pa.status = 'going' THEN 1 END) AS going_count,
    COUNT(CASE WHEN pa.status = 'interested' THEN 1 END) AS interested_count
  FROM plans p
  JOIN users u ON u.id = p.creator_id
  LEFT JOIN participations pa ON pa.plan_id = p.id
  GROUP BY p.id, u.display_name, u.avatar_url;
