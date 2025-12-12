// Telegram PDF RAG Bot - Main Entry Point

import TelegramBot from 'node-telegram-bot-api';
import { config } from './config.js';
import { documentStore } from './document-store.js';
import { processPDF } from './pdf-processor.js';
import { generateAnswer, testGeminiConnection } from './gemini-service.js';
import http from 'http';

// Initialize Telegram Bot
const bot = new TelegramBot(config.TELEGRAM_BOT_TOKEN, { polling: true });

// ------------------------------------------------------------------
// 🌍 FREE HOSTING TRICK (For Render Web Service)
// ------------------------------------------------------------------
const PORT = process.env.PORT || 3000;
const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Bot is running!');
});
server.listen(PORT, () => console.log(`🌍 Server listening on port ${PORT}`));
// ------------------------------------------------------------------

console.log('🤖 Telegram PDF RAG Bot Starting...');

/**
 * Escape special Markdown characters in text
 */
function escapeMarkdown(text) {
    if (!text) return '';
    return text.replace(/([_*\[\]()~`>#+=|{}.!-])/g, '\\$1');
}

/**
 * 📌 Send long messages safely (Telegram max = 4096 chars)
 */
async function sendLongMessage(bot, chatId, text) {
    const chunks = text.match(/[\s\S]{1,4000}/g); // split into safe chunks
    for (const chunk of chunks) {
        await bot.sendMessage(chatId, chunk);
    }
}

// ═══════════════════════════════════════════════════════════════
// COMMAND HANDLERS
// ═══════════════════════════════════════════════════════════════

/**
 * /start command - Welcome message
 */
bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;

    const welcomeMessage = `
🤖 *Welcome to PDF Knowledge Bot!*

I can answer your questions by searching through multiple PDF documents.

*How to use:*
1️⃣ *Upload PDFs* - Send me PDF files directly
2️⃣ *Ask Questions* - Type any question about your documents
3️⃣ *Get Answers* - I'll search all your PDFs and answer!

*Commands:*
📄 /docs - View uploaded documents
🗑️ /clear - Delete all documents
❓ /help - Show this help message

*Just send me your PDF files to get started!*
`;

    await bot.sendMessage(chatId, welcomeMessage, { parse_mode: 'Markdown' });
});

/**
 * /help command
 */
bot.onText(/\/help/, async (msg) => {
    const chatId = msg.chat.id;

    const helpMessage = `
📚 *PDF Knowledge Bot Help*

*Uploading Documents:*
• Simply send PDF files to me
• You can upload multiple PDFs
• Each new PDF is added to your collection

*Asking Questions:*
• Just type your question naturally
• I'll search across ALL your uploaded PDFs
• Supports English and Hinglish!

*Example Questions:*
• "What is the main topic of the documents?"
• "Find information about pricing"
• "Summarize the key points"
• "Kya documents mein warranty ke baare mein likha hai?"

*Commands:*
• /start - Welcome message
• /docs - List your uploaded documents
• /clear - Remove all documents
• /help - This help message

*Tips:*
• Upload all related PDFs before asking questions
• Be more specific in your questions for better answers
• I remember your documents until you use /clear
`;

    await bot.sendMessage(chatId, helpMessage, { parse_mode: 'Markdown' });
});

/**
 * /docs command - List uploaded documents
 */
bot.onText(/\/docs/, async (msg) => {
    const chatId = msg.chat.id;

    const docNames = documentStore.getDocumentNames(chatId);

    if (docNames.length === 0) {
        await bot.sendMessage(chatId, '📭 No documents uploaded yet.\n\nSend me PDF files to get started!');
        return;
    }

    let message = `📚 *Your Uploaded Documents (${docNames.length}):*\n\n`;
    docNames.forEach((name, index) => {
        message += `${index + 1}. 📄 ${name}\n`;
    });
    message += '\n_Ask any question and I\'ll search across all these documents!_';

    await bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
});

/**
 * /clear command - Delete all documents
 */
bot.onText(/\/clear/, async (msg) => {
    const chatId = msg.chat.id;

    const docCount = documentStore.getDocumentCount(chatId);

    if (docCount === 0) {
        await bot.sendMessage(chatId, '📭 No documents to delete.');
        return;
    }

    documentStore.clearDocuments(chatId);
    await bot.sendMessage(chatId, `🗑️ Deleted ${docCount} document(s). Send new PDFs to start fresh!`);
});

// ═══════════════════════════════════════════════════════════════
// DOCUMENT HANDLER
// ═══════════════════════════════════════════════════════════════

/**
 * Handle PDF document uploads
 */
bot.on('document', async (msg) => {
    const chatId = msg.chat.id;
    const document = msg.document;

    if (!document.file_name.toLowerCase().endsWith('.pdf')) {
        await bot.sendMessage(chatId, '⚠️ Please upload PDF files only.');
        return;
    }

    const fileSizeMB = document.file_size / (1024 * 1024);
    if (fileSizeMB > 20) {
        await bot.sendMessage(chatId, `⚠️ File too large (${fileSizeMB.toFixed(1)}MB). Max is 20MB.`);
        return;
    }

    const processingMsg = await bot.sendMessage(chatId, `📥 Processing ${document.file_name}...\n⏳ Please wait.`);

    try {
        const result = await processPDF(document.file_id, document.file_name);

        const storeResult = documentStore.addDocument(chatId, result.fileName, result.content);

        let successMsg = `✅ PDF Uploaded Successfully!\n\n`;
        successMsg += `📄 File: ${result.fileName}\n`;
        if (result.pages) successMsg += `📊 Pages: ${result.pages}\n`;
        successMsg += `🔧 Method: ${result.method}\n`;
        successMsg += `📚 Total Documents: ${storeResult.totalDocuments}\n\n`;
        successMsg += `💬 Now ask me anything about your document!`;

        await bot.editMessageText(successMsg, {
            chat_id: chatId,
            message_id: processingMsg.message_id
        });

    } catch (error) {
        console.error('Error processing PDF:', error);

        await bot.editMessageText(
            `❌ Failed to process ${document.file_name}\n\nError: ${error.message}`,
            {
                chat_id: chatId,
                message_id: processingMsg.message_id
            }
        );
    }
});

// ═══════════════════════════════════════════════════════════════
// QUESTION HANDLER (Where the long response error was happening)
// ═══════════════════════════════════════════════════════════════

bot.on('text', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;

    if (text.startsWith('/')) return;

    const docCount = documentStore.getDocumentCount(chatId);
    if (docCount === 0) {
        await bot.sendMessage(chatId, '📭 No documents uploaded yet.\n\nSend PDFs first.');
        return;
    }

    await bot.sendChatAction(chatId, 'typing');

    const processingMsg = await bot.sendMessage(chatId, `🔍 Searching across ${docCount} document(s)...`);

    try {
        const result = await generateAnswer(chatId, text);

        let response = result.answer;
        if (result.sources && result.sources.length > 0) {
            response += `\n\n📄 Sources: ${result.sources.join(', ')}`;
        }

        // 🔥 FIXED: If too long, send in chunks
        if (response.length > 4000) {
            await bot.deleteMessage(chatId, processingMsg.message_id);
            await sendLongMessage(bot, chatId, response);
        } else {
            await bot.editMessageText(response, {
                chat_id: chatId,
                message_id: processingMsg.message_id
            });
        }

    } catch (error) {
        console.error('Error generating answer:', error);

        await bot.editMessageText(
            `❌ Error while processing your question.\nPlease try again.`,
            {
                chat_id: chatId,
                message_id: processingMsg.message_id
            }
        );
    }
});

// ═══════════════════════════════════════════════════════════════
// CALLBACK HANDLER
// ═══════════════════════════════════════════════════════════════

bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;

    if (query.data === 'help') {
        await bot.answerCallbackQuery(query.id);
        const helpMsg = {
            chat: { id: chatId },
            text: '/help'
        };
        bot.emit('text', helpMsg);
    }
});

// ═══════════════════════════════════════════════════════════════
// STARTUP
// ═══════════════════════════════════════════════════════════════

async function startup() {
    console.log('🔌 Testing Gemini API connection...');

    const geminiOk = await testGeminiConnection();

    if (geminiOk) {
        console.log('✅ Gemini API connected successfully');
    } else {
        console.log('⚠️ Gemini API connection failed');
    }

    console.log('═══════════════════════════════════════════');
    console.log('🚀 Bot is now running!');
    console.log(`📱 Bot: ${config.TELEGRAM_BOT_USERNAME}`);
    console.log('═══════════════════════════════════════════');

    try {
        await bot.sendMessage(config.TELEGRAM_CHAT_ID, '🚀 PDF RAG Bot is now online!');
    } catch (e) {}
}

startup();

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\n👋 Bot shutting down...');
    bot.stopPolling();
    process.exit(0);
});

process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});
