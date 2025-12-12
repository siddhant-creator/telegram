// Telegram PDF RAG Bot - Main Entry Point

import TelegramBot from 'node-telegram-bot-api';
import { config } from './config.js';
import { documentStore } from './document-store.js';
import { processPDF } from './pdf-processor.js';
import { generateAnswer, testGeminiConnection } from './gemini-service.js';

// Initialize Telegram Bot
const bot = new TelegramBot(config.TELEGRAM_BOT_TOKEN, { polling: true });

console.log('🤖 Telegram PDF RAG Bot Starting...');

/**
 * Escape special Markdown characters in text
 */
function escapeMarkdown(text) {
    if (!text) return '';
    return text.replace(/([_*\[\]()~`>#+=|{}.!-])/g, '\\$1');
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

    // Check if it's a PDF
    if (!document.file_name.toLowerCase().endsWith('.pdf')) {
        await bot.sendMessage(chatId, '⚠️ Please upload PDF files only. Other formats are not supported yet.');
        return;
    }

    // Check file size (Telegram limit is 20MB)
    const fileSizeMB = document.file_size / (1024 * 1024);
    if (fileSizeMB > 20) {
        await bot.sendMessage(chatId, `⚠️ File too large (${fileSizeMB.toFixed(1)}MB). Maximum size is 20MB.`);
        return;
    }

    // Send processing message (plain text to avoid special char issues)
    const processingMsg = await bot.sendMessage(chatId, `📥 Processing ${document.file_name}...\n⏳ This may take a moment for large files.`);

    try {
        // Process the PDF
        const result = await processPDF(document.file_id, document.file_name);

        // Store the document
        const storeResult = documentStore.addDocument(chatId, result.fileName, result.content);

        // Build success message (plain text)
        let successMsg = `✅ PDF Uploaded Successfully!\n\n`;
        successMsg += `📄 File: ${result.fileName}\n`;
        if (result.pages) {
            successMsg += `📊 Pages: ${result.pages}\n`;
        }
        successMsg += `🔧 Method: ${result.method}\n`;
        successMsg += `📚 Total Documents: ${storeResult.totalDocuments}\n\n`;
        successMsg += `💬 Now ask me anything about your document!`;

        // Update message with success (plain text)
        await bot.editMessageText(successMsg, {
            chat_id: chatId,
            message_id: processingMsg.message_id
        });

    } catch (error) {
        console.error('Error processing PDF:', error);

        // Plain text error message to avoid markdown issues with filenames
        await bot.editMessageText(
            `❌ Failed to process ${document.file_name}\n\nError: ${error.message}\n\nPlease try uploading again or try a different PDF.`,
            {
                chat_id: chatId,
                message_id: processingMsg.message_id
            }
        );
    }
});

// ═══════════════════════════════════════════════════════════════
// QUESTION HANDLER
// ═══════════════════════════════════════════════════════════════

/**
 * Handle text messages (questions)
 */
bot.on('text', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;

    // Ignore commands
    if (text.startsWith('/')) return;

    // Check if user has documents
    const docCount = documentStore.getDocumentCount(chatId);
    if (docCount === 0) {
        await bot.sendMessage(
            chatId,
            '📭 No documents uploaded yet.\n\nPlease send me PDF files first, then ask your questions!',
            {
                reply_markup: {
                    inline_keyboard: [[
                        { text: '📖 How to use', callback_data: 'help' }
                    ]]
                }
            }
        );
        return;
    }

    // Send typing indicator
    await bot.sendChatAction(chatId, 'typing');

    // Send processing message
    const processingMsg = await bot.sendMessage(
        chatId,
        `🔍 Searching across ${docCount} document(s)...`
    );

    try {
        // Generate answer
        const result = await generateAnswer(chatId, text);

        // Format response (use plain text to avoid markdown errors)
        let response = result.answer;

        if (result.sources && result.sources.length > 0) {
            response += `\n\n📄 Sources: ${result.sources.join(', ')}`;
        }

        // Update with answer (plain text to avoid parsing errors)
        await bot.editMessageText(response, {
            chat_id: chatId,
            message_id: processingMsg.message_id
        });

    } catch (error) {
        console.error('Error generating answer:', error);

        await bot.editMessageText(
            `❌ Sorry, I encountered an error while processing your question.\n\nPlease try again or rephrase your question.`,
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
        // Emit help command
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
        console.log('⚠️ Gemini API connection failed - bot will still run but some features may not work');
    }

    console.log('═══════════════════════════════════════════');
    console.log('🚀 Bot is now running!');
    console.log(`📱 Bot: ${config.TELEGRAM_BOT_USERNAME}`);
    console.log('═══════════════════════════════════════════');
    console.log('📌 Instructions:');
    console.log('   1. Open Telegram and search for the bot');
    console.log('   2. Send /start to begin');
    console.log('   3. Upload PDF files');
    console.log('   4. Ask questions about your documents!');
    console.log('═══════════════════════════════════════════');

    // Send startup notification to your chat
    try {
        await bot.sendMessage(config.TELEGRAM_CHAT_ID, '🚀 PDF RAG Bot is now online!\n\nSend /start to begin.');
    } catch (e) {
        // Silent fail for startup notification
    }
}

startup();

// Handle graceful shutdown
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
