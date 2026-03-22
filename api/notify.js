// Vercel Serverless Function: アプリ内通知作成
// POST /api/notify
// Body: { plan, friendIds }
// LINE push通知は廃止。Supabaseのnotificationsテーブルに挿入する。

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { plan, friendIds } = req.body;

    if (!plan || !friendIds || friendIds.length === 0) {
      return res.status(400).json({ error: 'Missing data' });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    const { error } = await supabase.from('notifications').insert(
      friendIds.map(userId => ({ user_id: userId, plan_id: plan.id }))
    );

    if (error) {
      console.error('notifications insert error:', error);
      return res.status(500).json({ error: error.message });
    }

    return res.status(200).json({ ok: true, count: friendIds.length });
  } catch (err) {
    console.error('notify error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
