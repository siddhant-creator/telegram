// PDF Processing with improved timeout and retry handling

import axios from 'axios';
import { config } from './config.js';

/**
 * Sleep utility for retry delays
 */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Download file from Telegram with retry logic
 */
export async function downloadTelegramFile(fileId, retryCount = 0) {
    const MAX_RETRIES = 3;

    try {
        // Get file path from Telegram
        const fileInfoUrl = `${config.TELEGRAM_API_URL}${config.TELEGRAM_BOT_TOKEN}/getFile?file_id=${fileId}`;
        const fileInfoResponse = await axios.get(fileInfoUrl, { timeout: 30000 });

        if (!fileInfoResponse.data.ok) {
            throw new Error('Could not get file info from Telegram');
        }

        const filePath = fileInfoResponse.data.result.file_path;
        const downloadUrl = `https://api.telegram.org/file/bot${config.TELEGRAM_BOT_TOKEN}/${filePath}`;

        // Download the file with longer timeout for large files
        const fileResponse = await axios.get(downloadUrl, {
            responseType: 'arraybuffer',
            timeout: 180000, // 3 minute timeout for large files
            maxContentLength: 50 * 1024 * 1024, // 50MB max
            maxBodyLength: 50 * 1024 * 1024
        });

        return {
            buffer: Buffer.from(fileResponse.data),
            fileName: filePath.split('/').pop()
        };
    } catch (error) {
        console.error(`Download attempt ${retryCount + 1} failed:`, error.message);

        // Retry on network errors
        if (retryCount < MAX_RETRIES && (error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT' || error.message.includes('aborted'))) {
            console.log(`Retrying download in ${(retryCount + 1) * 2} seconds...`);
            await sleep((retryCount + 1) * 2000);
            return downloadTelegramFile(fileId, retryCount + 1);
        }

        throw error;
    }
}

/**
 * Extract text from PDF using pdf-parse first, then Gemini as fallback
 */
export async function extractTextFromPDF(pdfBuffer, fileName) {
    try {
        // First try with pdf-parse for text-based PDFs
        const pdfParse = (await import('pdf-parse')).default;
        const pdfData = await pdfParse(pdfBuffer);

        if (pdfData.text && pdfData.text.trim().length > 100) {
            console.log(`Successfully extracted text using pdf-parse: ${pdfData.numpages} pages`);
            return {
                text: pdfData.text,
                method: 'pdf-parse',
                pages: pdfData.numpages
            };
        }

        // If pdf-parse returned minimal text, try Gemini
        console.log('PDF-parse returned minimal text, trying Gemini...');
        return await extractWithGemini(pdfBuffer, fileName);

    } catch (error) {
        console.error('PDF-parse error:', error.message);
        // Fallback to Gemini for problematic PDFs
        console.log('Falling back to Gemini for PDF processing...');
        return await extractWithGemini(pdfBuffer, fileName);
    }
}

/**
 * Extract text using Gemini AI (for scanned PDFs or problematic files)
 */
async function extractWithGemini(pdfBuffer, fileName, retryCount = 0) {
    const MAX_RETRIES = 2;

    try {
        // Convert buffer to base64
        const base64Data = pdfBuffer.toString('base64');

        // Use Gemini to extract text from PDF
        const requestBody = {
            contents: [{
                parts: [
                    {
                        inline_data: {
                            mime_type: 'application/pdf',
                            data: base64Data
                        }
                    },
                    {
                        text: `Extract and return ALL the text content from this PDF document "${fileName}". 
            
            Instructions:
            - Extract every single piece of text, including headers, paragraphs, lists, tables, and footnotes
            - Preserve the structure as much as possible
            - Keep all numbers, dates, and special information
            - If there are tables, format them clearly
            - Do not summarize, extract the complete text
            - If any text is in images within the PDF, use OCR to extract it
            
            Return ONLY the extracted text, no additional commentary.`
                    }
                ]
            }]
        };

        const response = await axios.post(
            `${config.GEMINI_API_URL}?key=${config.GEMINI_API_KEY}`,
            requestBody,
            {
                headers: { 'Content-Type': 'application/json' },
                timeout: 180000 // 3 minute timeout for large PDFs
            }
        );

        if (response.data.candidates && response.data.candidates[0]?.content?.parts[0]?.text) {
            return {
                text: response.data.candidates[0].content.parts[0].text,
                method: 'gemini',
                pages: null
            };
        }

        throw new Error('No text extracted from PDF');
    } catch (error) {
        console.error('Gemini extraction error:', error.message);

        // Retry on rate limit or server errors
        const status = error.response?.status;
        if ((status === 429 || status === 503) && retryCount < MAX_RETRIES) {
            const delay = (retryCount + 1) * 5000; // 5s, 10s
            console.log(`Gemini rate limited. Retrying in ${delay / 1000}s...`);
            await sleep(delay);
            return extractWithGemini(pdfBuffer, fileName, retryCount + 1);
        }

        throw error;
    }
}

/**
 * Process a PDF file: download and extract text
 */
export async function processPDF(fileId, originalFileName) {
    console.log(`Processing PDF: ${originalFileName}`);

    // Download from Telegram with retry
    const { buffer, fileName } = await downloadTelegramFile(fileId);
    const finalFileName = originalFileName || fileName;

    console.log(`Downloaded ${finalFileName}, size: ${(buffer.length / 1024).toFixed(2)} KB`);

    // Extract text
    const result = await extractTextFromPDF(buffer, finalFileName);

    console.log(`Extracted ${result.text.length} characters from ${finalFileName} using ${result.method}`);

    return {
        fileName: finalFileName,
        content: result.text,
        size: buffer.length,
        method: result.method,
        pages: result.pages
    };
}
