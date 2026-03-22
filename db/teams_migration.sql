-- ========================================
-- asobi - チーム参加機能 マイグレーション
-- ========================================

-- plansテーブルにチームモード列を追加
ALTER TABLE plans ADD COLUMN IF NOT EXISTS team_mode BOOLEAN DEFAULT false;
ALTER TABLE plans ADD COLUMN IF NOT EXISTS team_size INTEGER DEFAULT 3;

-- チームテーブル
CREATE TABLE IF NOT EXISTS teams (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id     UUID NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  max_members INTEGER NOT NULL DEFAULT 3,
  created_by  UUID NOT NULL REFERENCES users(id),
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- チームメンバーテーブル
CREATE TABLE IF NOT EXISTS team_members (
  team_id   UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (team_id, user_id)
);

-- インデックス
CREATE INDEX IF NOT EXISTS idx_teams_plan       ON teams(plan_id);
CREATE INDEX IF NOT EXISTS idx_team_members_team ON team_members(team_id);
CREATE INDEX IF NOT EXISTS idx_team_members_user ON team_members(user_id);

-- RLS（anon keyで読み書きできるよう全許可）
ALTER TABLE teams        ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "teams_all"        ON teams;
DROP POLICY IF EXISTS "team_members_all" ON team_members;

CREATE POLICY "teams_all"        ON teams        FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "team_members_all" ON team_members FOR ALL USING (true) WITH CHECK (true);
