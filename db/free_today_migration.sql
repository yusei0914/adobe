-- ========================================
-- asobi - free_today / close_friends / 参加通知 マイグレーション
-- ========================================

-- 1. notificationsテーブルにtype・actor_id列を追加
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS type VARCHAR(20) DEFAULT 'new_plan';
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS actor_id UUID REFERENCES users(id) ON DELETE SET NULL;

-- plan_idをNULL許可に変更（free_today通知はplan_idなし）
ALTER TABLE notifications ALTER COLUMN plan_id DROP NOT NULL;

-- 2. free_todayテーブル（今日暇な人の投稿）
CREATE TABLE IF NOT EXISTS free_today (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  comment    TEXT,
  visibility VARCHAR(20) DEFAULT 'all_friends',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ
);

-- 3. free_today_joinsテーブル（「自分も！」参加）
CREATE TABLE IF NOT EXISTS free_today_joins (
  free_today_id UUID NOT NULL REFERENCES free_today(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  joined_at     TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (free_today_id, user_id)
);

-- 4. close_friendsテーブル（親しい友達）
CREATE TABLE IF NOT EXISTS close_friends (
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  friend_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, friend_id)
);

-- 5. notificationsにfree_today_id列を追加
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS free_today_id UUID REFERENCES free_today(id) ON DELETE CASCADE;

-- 6. plansのvisibility列（すでに存在する場合はスキップ）
-- plans.visibilityはすでにTEXT型で存在するので変更不要
-- 'close_friends'値はTEXT型なので追記可能

-- インデックス
CREATE INDEX IF NOT EXISTS idx_free_today_user    ON free_today(user_id);
CREATE INDEX IF NOT EXISTS idx_free_today_expires ON free_today(expires_at);
CREATE INDEX IF NOT EXISTS idx_free_today_joins_ft ON free_today_joins(free_today_id);
CREATE INDEX IF NOT EXISTS idx_free_today_joins_user ON free_today_joins(user_id);
CREATE INDEX IF NOT EXISTS idx_close_friends_user   ON close_friends(user_id);
CREATE INDEX IF NOT EXISTS idx_close_friends_friend ON close_friends(friend_id);
CREATE INDEX IF NOT EXISTS idx_notifications_actor  ON notifications(actor_id);

-- RLS（anon keyで読み書きできるよう全許可）
ALTER TABLE free_today       ENABLE ROW LEVEL SECURITY;
ALTER TABLE free_today_joins ENABLE ROW LEVEL SECURITY;
ALTER TABLE close_friends    ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "free_today_all"       ON free_today;
DROP POLICY IF EXISTS "free_today_joins_all" ON free_today_joins;
DROP POLICY IF EXISTS "close_friends_all"    ON close_friends;

CREATE POLICY "free_today_all"       ON free_today       FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "free_today_joins_all" ON free_today_joins FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "close_friends_all"    ON close_friends    FOR ALL USING (true) WITH CHECK (true);
