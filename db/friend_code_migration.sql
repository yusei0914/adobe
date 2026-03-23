-- ========================================
-- Friend Code Migration
-- usersテーブルにfriend_codeカラムを追加
-- ========================================

-- 1. friend_codeカラムを追加
ALTER TABLE users ADD COLUMN IF NOT EXISTS friend_code VARCHAR(6);

-- 2. ランダムな6桁英数字コード生成関数（紛らわしい文字 I/O/0/1 を除外）
CREATE OR REPLACE FUNCTION generate_friend_code()
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

-- 3. INSERT時にfriend_codeを自動セットするトリガー関数
CREATE OR REPLACE FUNCTION auto_set_friend_code()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.friend_code IS NULL THEN
    LOOP
      NEW.friend_code := generate_friend_code();
      EXIT WHEN NOT EXISTS (
        SELECT 1 FROM users WHERE friend_code = NEW.friend_code AND id != NEW.id
      );
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;

-- 4. トリガーを登録
DROP TRIGGER IF EXISTS trg_set_friend_code ON users;
CREATE TRIGGER trg_set_friend_code
  BEFORE INSERT ON users
  FOR EACH ROW EXECUTE FUNCTION auto_set_friend_code();

-- 5. 既存ユーザーへのバックフィル
DO $$
DECLARE
  rec RECORD;
  code TEXT;
BEGIN
  FOR rec IN SELECT id FROM users WHERE friend_code IS NULL LOOP
    LOOP
      code := generate_friend_code();
      EXIT WHEN NOT EXISTS (SELECT 1 FROM users WHERE friend_code = code);
    END LOOP;
    UPDATE users SET friend_code = code WHERE id = rec.id;
  END LOOP;
END;
$$;

-- 6. ユニーク制約とインデックス
ALTER TABLE users ADD CONSTRAINT IF NOT EXISTS users_friend_code_unique UNIQUE (friend_code);
CREATE INDEX IF NOT EXISTS idx_users_friend_code ON users(friend_code);

-- 7. RLSポリシー（friend_codeによる検索を許可）
-- usersテーブルにRLSが有効な場合、anon/authenticatedがfriend_codeで検索できるように設定
-- 既存のSELECTポリシーがない場合のみ追加
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'users' AND policyname = 'Allow reading users for friend search'
  ) THEN
    EXECUTE 'CREATE POLICY "Allow reading users for friend search"
      ON users FOR SELECT
      USING (true)';
  END IF;
END;
$$;
