-- ========================================
-- asobi - アプリ内通知機能 マイグレーション
-- ========================================

CREATE TABLE IF NOT EXISTS notifications (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan_id    UUID NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  read       BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user     ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_plan     ON notifications(plan_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON notifications(user_id, read);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notifications_all" ON notifications;
CREATE POLICY "notifications_all" ON notifications FOR ALL USING (true) WITH CHECK (true);
