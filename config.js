// Configuration for the Telegram PDF RAG Bot
// Uses environment variables for production (Railway), with fallbacks for local development

export const config = {
  // Gemini AI
  GEMINI_API_KEY: process.env.GEMINI_API_KEY || 'AIzaSyCMy6K3eCOT0IL8S9dd2rrd7rLzr2Q_Wnw',
  GEMINI_API_URL: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent',

  // Telegram Bot
  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN || '7254507353:AAGucSwXwZdbHRLoKuT73xN_niv_0502bv0',
  TELEGRAM_CHAT_ID: process.env.TELEGRAM_CHAT_ID || '5923775544',
  TELEGRAM_API_URL: 'https://api.telegram.org/bot',
  TELEGRAM_BOT_USERNAME: process.env.TELEGRAM_BOT_USERNAME || '@Siddh_bot',

  // Document settings
  MAX_PDF_SIZE_MB: parseInt(process.env.MAX_PDF_SIZE_MB) || 20,
  CHUNK_SIZE: 4000,
  CHUNK_OVERLAP: 500
};
