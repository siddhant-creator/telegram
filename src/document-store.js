// In-memory document store for uploaded PDFs

class DocumentStore {
    constructor() {
        // Store documents by user ID
        // Structure: { chatId: [{ fileName, content, chunks, uploadedAt }] }
        this.documents = new Map();
    }

    /**
     * Add a document for a user
     */
    addDocument(chatId, fileName, content) {
        if (!this.documents.has(chatId)) {
            this.documents.set(chatId, []);
        }

        const chunks = this.chunkText(content);

        const doc = {
            fileName,
            content,
            chunks,
            uploadedAt: new Date().toISOString()
        };

        // Check if document with same name exists, replace it
        const userDocs = this.documents.get(chatId);
        const existingIndex = userDocs.findIndex(d => d.fileName === fileName);

        if (existingIndex >= 0) {
            userDocs[existingIndex] = doc;
        } else {
            userDocs.push(doc);
        }

        return {
            success: true,
            fileName,
            chunksCount: chunks.length,
            totalDocuments: userDocs.length
        };
    }

    /**
     * Get all documents for a user
     */
    getDocuments(chatId) {
        return this.documents.get(chatId) || [];
    }

    /**
     * Get document count for a user
     */
    getDocumentCount(chatId) {
        const docs = this.documents.get(chatId);
        return docs ? docs.length : 0;
    }

    /**
     * Get document names for a user
     */
    getDocumentNames(chatId) {
        const docs = this.documents.get(chatId) || [];
        return docs.map(d => d.fileName);
    }

    /**
     * Delete a document by name
     */
    deleteDocument(chatId, fileName) {
        const userDocs = this.documents.get(chatId);
        if (!userDocs) return false;

        const index = userDocs.findIndex(d => d.fileName === fileName);
        if (index >= 0) {
            userDocs.splice(index, 1);
            return true;
        }
        return false;
    }

    /**
     * Delete all documents for a user
     */
    clearDocuments(chatId) {
        this.documents.delete(chatId);
        return true;
    }

    /**
     * Search across all documents for relevant chunks
     */
    searchDocuments(chatId, query) {
        const docs = this.documents.get(chatId) || [];
        if (docs.length === 0) return [];

        const queryWords = query.toLowerCase().split(/\s+/).filter(w => w.length > 2);
        const results = [];

        for (const doc of docs) {
            for (const chunk of doc.chunks) {
                const chunkLower = chunk.toLowerCase();
                const relevanceScore = this.calculateRelevance(chunkLower, queryWords);

                if (relevanceScore > 0) {
                    results.push({
                        fileName: doc.fileName,
                        chunk,
                        score: relevanceScore
                    });
                }
            }
        }

        // Sort by relevance score and return top results
        results.sort((a, b) => b.score - a.score);
        return results.slice(0, 10); // Top 10 most relevant chunks
    }

    /**
     * Calculate relevance score based on word matches
     */
    calculateRelevance(text, queryWords) {
        let score = 0;

        for (const word of queryWords) {
            // Count occurrences
            const regex = new RegExp(word, 'gi');
            const matches = text.match(regex);
            if (matches) {
                score += matches.length;
            }
        }

        // Bonus for phrase matches
        const phrase = queryWords.join(' ');
        if (text.includes(phrase)) {
            score += queryWords.length * 2;
        }

        return score;
    }

    /**
     * Chunk text into smaller pieces for better search
     */
    chunkText(text, chunkSize = 3000, overlap = 500) {
        const chunks = [];
        const sentences = text.split(/(?<=[.!?])\s+/);

        let currentChunk = '';

        for (const sentence of sentences) {
            if ((currentChunk + sentence).length > chunkSize && currentChunk.length > 0) {
                chunks.push(currentChunk.trim());
                // Keep overlap from end of previous chunk
                const words = currentChunk.split(' ');
                const overlapWords = words.slice(-Math.floor(overlap / 10));
                currentChunk = overlapWords.join(' ') + ' ' + sentence;
            } else {
                currentChunk += (currentChunk ? ' ' : '') + sentence;
            }
        }

        if (currentChunk.trim()) {
            chunks.push(currentChunk.trim());
        }

        return chunks.length > 0 ? chunks : [text];
    }

    /**
     * Get full context from all documents (for comprehensive answers)
     */
    getAllContent(chatId) {
        const docs = this.documents.get(chatId) || [];
        return docs.map(d => ({
            fileName: d.fileName,
            content: d.content
        }));
    }
}

// Singleton instance
export const documentStore = new DocumentStore();
