// ========================================
// 都市OS - Configuration
// ========================================

const CONFIG = {
  // Supabase
  SUPABASE_URL: 'https://nhuyjlwqbcbrxucoewct.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5odXlqbHdxYmNicnh1Y29ld2N0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQxNTAxMDEsImV4cCI6MjA4OTcyNjEwMX0.G0lt6yTl7WRzGKsH-5NtxV05jGN9cWTbCNJ-tmoJ7HM',

  // LINE Login
  LINE_CHANNEL_ID: '2009558215',
  LINE_REDIRECT_URI: 'https://adobe-rho-three.vercel.app/callback.html'

  // App
  APP_NAME: '都市OS',
  DEFAULT_DURATION: 90, // minutes
  DEFAULT_MAX_PEOPLE: 8,

  // Colors for avatars
  AVATAR_COLORS: [
    '#f5576c', '#667eea', '#4facfe', '#43e97b',
    '#f093fb', '#5856d6', '#ff9500', '#ff2d55',
    '#34c759', '#5ac8fa', '#af52de', '#007aff'
  ]
};

// Get consistent color for a user
function getAvatarColor(userId) {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = userId.charCodeAt(i) + ((hash << 5) - hash);
  }
  return CONFIG.AVATAR_COLORS[Math.abs(hash) % CONFIG.AVATAR_COLORS.length];
}

// Get initial from display name
function getInitial(name) {
  return name ? name.charAt(0).toUpperCase() : '?';
}
