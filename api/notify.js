// Vercel Serverless Function: LINE push notification
// POST /api/notify
// Body: { plan, lineUserIds }

const LINE_CHANNEL_ACCESS_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN;

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { plan, lineUserIds } = req.body;

    if (!plan || !lineUserIds || lineUserIds.length === 0) {
      return res.status(400).json({ error: 'Missing data' });
    }

    if (!LINE_CHANNEL_ACCESS_TOKEN) {
      console.warn('LINE_CHANNEL_ACCESS_TOKEN is not set');
      return res.status(200).json({ ok: true, skipped: true });
    }

    const date = new Date(plan.starts_at);
    const dateStr = `${date.getMonth() + 1}月${date.getDate()}日 ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;

    const message = {
      type: 'text',
      text: `🎈 ${plan.creator_name || '友達'} が誘ってるよ！\n\n「${plan.title}」\n📅 ${dateStr}${plan.location_name ? `\n📍 ${plan.location_name}` : ''}\n\nasobi で確認してみて 👇\nhttps://adobe-rho-three.vercel.app/`,
    };

    await Promise.all(
      lineUserIds.map(lineUserId =>
        fetch('https://api.line.me/v2/bot/message/push', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`,
          },
          body: JSON.stringify({ to: lineUserId, messages: [message] }),
        })
      )
    );

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('notify error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
