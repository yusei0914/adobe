// Vercel Serverless Function: LINE Messaging API push通知
// POST /api/line-notify
// Body: { userIds: [uuid,...], message: "通知文" }
// 環境変数: LINE_CHANNEL_ACCESS_TOKEN, SUPABASE_URL, SUPABASE_SERVICE_KEY

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const LINE_CHANNEL_ACCESS_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN;

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { lineUserIds: directLineUserIds, userIds, message } = req.body;

    if ((!directLineUserIds?.length && !userIds?.length) || !message) {
      return res.status(400).json({ error: 'Missing lineUserIds/userIds or message' });
    }

    if (!LINE_CHANNEL_ACCESS_TOKEN) {
      console.warn('LINE_CHANNEL_ACCESS_TOKEN not set — skipping LINE push');
      return res.status(200).json({ ok: true, sent: 0, reason: 'token_not_configured' });
    }

    let lineUserIds;

    if (directLineUserIds && directLineUserIds.length > 0) {
      // フロントエンドから直接 LINE user ID が渡された場合（推奨）
      lineUserIds = directLineUserIds.filter(Boolean);
    } else {
      // 後方互換: 内部UUID → LINE user ID をサーバー側で解決
      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
      const { data: users, error } = await supabase
        .from('users')
        .select('line_user_id')
        .in('id', userIds);

      if (error) {
        console.error('Supabase lookup error:', error);
        return res.status(500).json({ error: error.message });
      }

      lineUserIds = (users || []).map(u => u.line_user_id).filter(Boolean);
    }

    if (lineUserIds.length === 0) {
      return res.status(200).json({ ok: true, sent: 0 });
    }

    // LINE Messaging API multicast（最大500件/リクエスト）
    const lineRes = await fetch('https://api.line.me/v2/bot/message/multicast', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`,
      },
      body: JSON.stringify({
        to: lineUserIds.slice(0, 500),
        messages: [{ type: 'text', text: message }],
      }),
    });

    const lineData = await lineRes.json().catch(() => ({}));

    if (!lineRes.ok) {
      console.error('LINE multicast error:', lineData);
      // LINE側エラーでもアプリは継続（通知失敗は致命的でない）
      return res.status(200).json({ ok: false, lineError: lineData, sent: 0 });
    }

    return res.status(200).json({ ok: true, sent: lineUserIds.length });

  } catch (err) {
    console.error('line-notify error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
