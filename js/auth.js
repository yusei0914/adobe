// ========================================
// 都市OS - Authentication (LINE Login)
// ========================================

const Auth = {
  supabase: null,
  currentUser: null,

  init() {
    this.supabase = supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);
  },

  // LINE OAuth flow
  loginWithLINE() {
    const state = Math.random().toString(36).substring(7);
    sessionStorage.setItem('line_state', state);

    const redirectUri = CONFIG.LINE_REDIRECT_URI || window.location.origin + '/callback.html';

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: CONFIG.LINE_CHANNEL_ID,
      redirect_uri: redirectUri,
      state: state,
      scope: 'profile openid',
    });

    window.location.href = `https://access.line.me/oauth2/v2.1/authorize?${params}`;
  },

  // Handle LINE callback - calls our serverless function
  async handleCallback(code) {
    const redirectUri = CONFIG.LINE_REDIRECT_URI || window.location.origin + '/callback.html';

    const res = await fetch('/api/line-auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, redirect_uri: redirectUri }),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Auth failed');
    }

    const data = await res.json();

    // Store session
    this.currentUser = data.user;
    localStorage.setItem('urban_os_user', JSON.stringify(data.user));
    localStorage.setItem('urban_os_token', data.token);

    return data.user;
  },

  // Check existing session
  async getSession() {
    const stored = localStorage.getItem('urban_os_user');
    if (!stored) return null;

    this.currentUser = JSON.parse(stored);

    const token = localStorage.getItem('urban_os_token');
    if (!token) {
      this.logout();
      return null;
    }

    return this.currentUser;
  },

  logout() {
    this.currentUser = null;
    localStorage.removeItem('urban_os_user');
    localStorage.removeItem('urban_os_token');
  },

  isLoggedIn() {
    return !!this.currentUser;
  }
};
