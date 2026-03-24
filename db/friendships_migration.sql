-- ========================================
-- asobi - フレンドシップ テーブルマイグレーション
-- ========================================

-- friendshipsテーブル（双方向、user_a < user_b を保証して重複排除）
CREATE TABLE IF NOT EXISTS friendships (
  user_a     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_b     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_a, user_b),
  CHECK (user_a < user_b)
);

CREATE INDEX IF NOT EXISTS idx_friendships_user_a ON friendships(user_a);
CREATE INDEX IF NOT EXISTS idx_friendships_user_b ON friendships(user_b);

-- RLS（anon keyで読み書きできるよう全許可）
ALTER TABLE friendships ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "friendships_all" ON friendships;
CREATE POLICY "friendships_all" ON friendships FOR ALL USING (true) WITH CHECK (true);

-- ========================================
-- user_friendsビュー（双方向を展開）
-- ※ getFriends()はfriendshipsを直接クエリするためこのビューは補助的
-- ========================================
CREATE OR REPLACE VIEW user_friends AS
  SELECT user_a AS user_id, user_b AS friend_id FROM friendships
  UNION ALL
  SELECT user_b AS user_id, user_a AS friend_id FROM friendships;

-- ビューのRLSはunderlying tableに委譲されるため追加設定不要
