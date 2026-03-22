// Vercel Serverless Function: LINE Login token exchange
// POST /api/line-auth
// Body: { code, redirect_uri }
// Returns: { user, token }

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const LINE_CHANNEL_ID = process.env.LINE_CHANNEL_ID;
const LINE_CHANNEL_SECRET = process.env.LINE_CHANNEL_SECRET;

module.exports = async (req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { code, redirect_uri } = req.body;

    if (!code) {
      return res.status(400).json({ error: 'Missing code' });
    }

    // 1. Exchange code for access token
    const tokenRes = await fetch('https://api.line.me/oauth2/v2.1/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri,
        client_id: LINE_CHANNEL_ID,
        client_secret: LINE_CHANNEL_SECRET,
      }),
    });

    const tokenData = await tokenRes.json();

    if (tokenData.error) {
      console.error('LINE token error:', tokenData);
      return res.status(400).json({ error: 'LINE auth failed', detail: tokenData.error_description });
    }

    // 2. Get user profile
    const profileRes = await fetch('https://api.line.me/v2/profile', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });

    const profile = await profileRes.json();

    if (!profile.userId) {
      return res.status(400).json({ error: 'Failed to get LINE profile' });
    }

    // 3. Upsert user in Supabase
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // Check if user exists
    const { data: existing } = await supabase
      .from('users')
      .select('*')
      .eq('line_user_id', profile.userId)
      .maybeSingle();

    let user;

    if (existing) {
      // Update display name and avatar
      const { data: updated } = await supabase
        .from('users')
        .update({
          display_name: profile.displayName,
          avatar_url: profile.pictureUrl || null,
        })
        .eq('id', existing.id)
        .select()
        .single();

      user = updated;
    } else {
      // Create new user
      const { data: created } = await supabase
        .from('users')
        .insert({
          line_user_id: profile.userId,
          display_name: profile.displayName,
          avatar_url: profile.pictureUrl || null,
        })
        .select()
        .single();

      user = created;
    }

    // 4. Generate a simple session token (JWT from LINE is enough for MVP)
    const token = tokenData.access_token;

    return res.status(200).json({ user, token });

  } catch (err) {
    console.error('Auth error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
