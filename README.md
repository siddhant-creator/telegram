# Telegram PDF RAG Bot 🤖📄

A Telegram bot that answers questions from uploaded PDF documents using Google Gemini AI.

## Features
- 📤 Upload multiple PDF documents
- 💬 Ask questions about your documents
- 🔄 Switch between different uploaded documents
- 🧠 Powered by Gemini 2.5 Flash AI

## Deployment to Railway (24/7 Hosting)

### Step 1: Push to GitHub
1. Create a new repository on [GitHub](https://github.com/new)
2. Run these commands in your project folder:
```bash
git init
git add .
git commit -m "Initial commit - Telegram PDF RAG Bot"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git
git push -u origin main
```

### Step 2: Deploy to Railway
1. Go to [Railway](https://railway.app) and sign up/login with GitHub
2. Click **"New Project"** → **"Deploy from GitHub repo"**
3. Select your repository
4. Railway will automatically detect and deploy your bot

### Step 3: Add Environment Variables
In Railway dashboard, go to your project → **Variables** tab and add:

| Variable | Value |
|----------|-------|
| `GEMINI_API_KEY` | Your Gemini API key |
| `TELEGRAM_BOT_TOKEN` | Your Telegram bot token |
| `TELEGRAM_CHAT_ID` | Your Telegram chat ID |
| `TELEGRAM_BOT_USERNAME` | Your bot username (e.g., @Siddh_bot) |

### Step 4: Verify Deployment
- Check the **Deployments** tab for logs
- Your bot should now be running 24/7! 🎉

## Local Development
```bash
npm install
npm start
```

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `GEMINI_API_KEY` | Google Gemini API key | Yes |
| `TELEGRAM_BOT_TOKEN` | Telegram Bot Token from @BotFather | Yes |
| `TELEGRAM_CHAT_ID` | Your Telegram Chat ID | Yes |
| `TELEGRAM_BOT_USERNAME` | Bot username | No |
| `MAX_PDF_SIZE_MB` | Maximum PDF size (default: 20) | No |

## License
MIT
# telegram
