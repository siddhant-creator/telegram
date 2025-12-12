// Gemini AI Service for answering questions with multi-document search

import axios from 'axios';
import { config } from './config.js';
import { documentStore } from './document-store.js';

/**
 * Sleep utility for retry delays
 */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Generate answer from Gemini AI by searching ALL documents
 */
export async function generateAnswer(chatId, question) {
    // Get ALL documents for this user
    const allDocs = documentStore.getAllContent(chatId);

    if (allDocs.length === 0) {
        return {
            answer: "❌ No documents uploaded yet. Please upload PDF files first by sending PDF files to me.",
            sources: []
        };
    }

    console.log(`Searching across ${allDocs.length} document(s) for: "${question}"`);

    // Build context from ALL documents
    // For multiple documents, we need to be smart about context limits
    const maxTotalContext = 100000; // ~100k chars should be safe for Gemini
    const maxPerDoc = Math.floor(maxTotalContext / allDocs.length);

    let context = '';
    const sources = [];

    for (const doc of allDocs) {
        // Include as much content as possible from each document
        const docContent = doc.content.length > maxPerDoc
            ? doc.content.substring(0, maxPerDoc) + '\n\n[... document truncated for length ...]'
            : doc.content;

        context += `\n\n${'='.repeat(60)}\n📄 DOCUMENT: ${doc.fileName}\n${'='.repeat(60)}\n${docContent}`;
        sources.push(doc.fileName);
    }

    // Generate answer using Gemini with full context from all docs
    const answer = await callGemini(context, question, sources);

    return {
        answer,
        sources
    };
}

/**
 * Call Gemini API to generate answer with retry logic for rate limits
 */
async function callGemini(context, question, sourceFiles, retryCount = 0) {
    const MAX_RETRIES = 3;
    const BASE_DELAY = 3000; // 3 seconds

    const systemPrompt = `You are a helpful AI assistant that answers questions by searching through MULTIPLE uploaded PDF documents.

CRITICAL INSTRUCTIONS:
1. Search through ALL the documents provided below to find the answer
2. The answer may be in ANY of the ${sourceFiles.length} documents - search them ALL carefully
3. If you find the answer, clearly state WHICH document it came from
4. If you cannot find the answer in ANY document, say "I couldn't find this information in any of the uploaded documents"
5. Be comprehensive - if multiple documents contain relevant information, combine them
6. Format your response clearly
7. Support both English and Hinglish queries

DOCUMENTS TO SEARCH (${sourceFiles.length} total):
${sourceFiles.map((f, i) => `${i + 1}. ${f}`).join('\n')}

FULL DOCUMENT CONTENTS:
${context}`;

    const requestBody = {
        contents: [{
            parts: [
                { text: systemPrompt },
                { text: `\n\n${'='.repeat(60)}\nUSER QUESTION: ${question}\n${'='.repeat(60)}\n\nSearch ALL documents above and provide a complete answer. If found, mention which document contains the answer.` }
            ]
        }],
        generationConfig: {
            temperature: 0.2, // Lower temperature for more accurate search
            maxOutputTokens: 4096
        }
    };

    try {
        const response = await axios.post(
            `${config.GEMINI_API_URL}?key=${config.GEMINI_API_KEY}`,
            requestBody,
            {
                headers: { 'Content-Type': 'application/json' },
                timeout: 120000 // 2 minute timeout for large context
            }
        );

        if (response.data.candidates && response.data.candidates[0]?.content?.parts[0]?.text) {
            return response.data.candidates[0].content.parts[0].text;
        }

        return "Sorry, I couldn't generate a response. Please try again.";
    } catch (error) {
        console.error('Gemini API Error:', error.message);

        // Handle rate limit (429) and service unavailable (503) errors with retry
        const status = error.response?.status;

        if ((status === 429 || status === 503) && retryCount < MAX_RETRIES) {
            const delay = BASE_DELAY * Math.pow(2, retryCount); // Exponential backoff: 3s, 6s, 12s
            console.log(`Rate limited (${status}). Retrying in ${delay / 1000}s... (attempt ${retryCount + 1}/${MAX_RETRIES})`);
            await sleep(delay);
            return callGemini(context, question, sourceFiles, retryCount + 1);
        }

        if (status === 429) {
            return "⚠️ API rate limit reached. The free tier allows limited requests per minute. Please wait 1-2 minutes and try again.";
        }

        if (status === 503) {
            return "⚠️ The AI service is temporarily overloaded. Please try again in a few seconds.";
        }

        if (error.response?.data?.error?.message) {
            return `❌ API Error: ${error.response.data.error.message}`;
        }

        throw error;
    }
}

/**
 * Test Gemini API connection
 */
export async function testGeminiConnection() {
    try {
        const requestBody = {
            contents: [{
                parts: [{ text: "Say 'Hello, I am working!' in exactly those words." }]
            }]
        };

        const response = await axios.post(
            `${config.GEMINI_API_URL}?key=${config.GEMINI_API_KEY}`,
            requestBody,
            {
                headers: { 'Content-Type': 'application/json' },
                timeout: 15000
            }
        );

        return response.data.candidates && response.data.candidates.length > 0;
    } catch (error) {
        console.error('Gemini connection test failed:', error.message);
        return false;
    }
}
