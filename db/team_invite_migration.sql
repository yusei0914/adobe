-- ========================================
-- asobi - チーム招待コード マイグレーション
-- ========================================

-- teamsテーブルにinvite_code列を追加
ALTER TABLE teams ADD COLUMN IF NOT EXISTS invite_code VARCHAR(8) UNIQUE;

-- 招待コード生成関数（すでにfriend_code用が存在する場合は共用）
CREATE OR REPLACE FUNCTION generate_team_invite_code()
RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE
  chars TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  result TEXT := '';
  i INT;
BEGIN
  FOR i IN 1..6 LOOP
    result := result || substr(chars, floor(random() * length(chars) + 1)::int, 1);
  END LOOP;
  RETURN result;
END;
$$;

-- INSERT時にinvite_codeを自動セット
CREATE OR REPLACE FUNCTION auto_set_team_invite_code()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.invite_code IS NULL THEN
    LOOP
      NEW.invite_code := generate_team_invite_code();
      EXIT WHEN NOT EXISTS (SELECT 1 FROM teams WHERE invite_code = NEW.invite_code AND id != NEW.id);
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_team_invite_code ON teams;
CREATE TRIGGER trg_set_team_invite_code
  BEFORE INSERT ON teams
  FOR EACH ROW EXECUTE FUNCTION auto_set_team_invite_code();

-- 既存チームへのバックフィル
DO $$
DECLARE
  rec RECORD;
  code TEXT;
BEGIN
  FOR rec IN SELECT id FROM teams WHERE invite_code IS NULL LOOP
    LOOP
      code := generate_team_invite_code();
      EXIT WHEN NOT EXISTS (SELECT 1 FROM teams WHERE invite_code = code);
    END LOOP;
    UPDATE teams SET invite_code = code WHERE id = rec.id;
  END LOOP;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_teams_invite_code ON teams(invite_code);
