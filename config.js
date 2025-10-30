module.exports = {
  supabaseUrl: process.env.SUPABASE_URL,
  supabaseAnonKey: process.env.SUPABASE_ANON_KEY,
  redisUrl: process.env.REDIS_URL || 'redis://127.0.0.1:6379'
};