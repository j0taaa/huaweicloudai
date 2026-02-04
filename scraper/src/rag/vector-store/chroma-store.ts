import { ChromaClient, Collection } from 'chromadb';
import { RAG_CONFIG } from '../config.js';
import { DocumentChunk, SearchResult, QueryOptions } from '../types.js';
import { Embedder } from '../embeddings/embedder.js';

export class ChromaStore {
  private client: ChromaClient;
  private collection: Collection | null = null;
  private embedder: Embedder;
  private collectionName: string;

  constructor(embedder: Embedder) {
    this.client = new ChromaClient({
      host: 'localhost',
      port: 8000,
    });
    this.embedder = embedder;
    this.collectionName = RAG_CONFIG.COLLECTION_NAME;
  }

  /**
   * Initialize the collection
   */
  async initialize(): Promise<void> {
    console.log(`Initializing ChromaDB collection: ${this.collectionName}...`);
    
    try {
      // Try to get existing collection
      this.collection = await this.client.getCollection({
        name: this.collectionName,
      });
      console.log(`Using existing collection: ${this.collectionName}`);
    } catch (error) {
      // Collection doesn't exist, create it
      console.log(`Creating new collection: ${this.collectionName}`);
      this.collection = await this.client.createCollection({
        name: this.collectionName,
        metadata: {
          'hnsw:space': RAG_CONFIG.DISTANCE_METRIC,
          'hnsw:construction_ef': 128,
          'hnsw:search_ef': 64,
          'hnsw:M': 16,
        },
      });
    }
  }

  /**
   * Add chunks to the collection
   */
  async addChunks(chunks: DocumentChunk[], embeddings: Map<string, number[]>): Promise<void> {
    if (!this.collection) {
      throw new Error('Collection not initialized. Call initialize() first.');
    }

    if (chunks.length === 0) return;

    const ids: string[] = [];
    const documents: string[] = [];
    const metadatas: Record<string, any>[] = [];
    const embeddingList: number[][] = [];

    for (const chunk of chunks) {
      const embedding = embeddings.get(chunk.id);
      if (!embedding) {
        console.warn(`No embedding found for chunk ${chunk.id}`);
        continue;
      }

      ids.push(chunk.id);
      documents.push(chunk.content);
      metadatas.push({
        service: chunk.service,
        page_id: chunk.pageId,
        headers: JSON.stringify(chunk.headers),
        url: chunk.url,
        position: chunk.position,
        token_count: chunk.tokenCount,
      });
      embeddingList.push(embedding);
    }

    // Add in batches to avoid memory issues
    const batchSize = 100;
    for (let i = 0; i < ids.length; i += batchSize) {
      const batchIds = ids.slice(i, i + batchSize);
      const batchDocs = documents.slice(i, i + batchSize);
      const batchMetas = metadatas.slice(i, i + batchSize);
      const batchEmbeddings = embeddingList.slice(i, i + batchSize);

      await this.collection.add({
        ids: batchIds,
        documents: batchDocs,
        metadatas: batchMetas,
        embeddings: batchEmbeddings,
      });

      console.log(`  Added batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(ids.length / batchSize)} (${batchIds.length} chunks)`);
    }

    console.log(`Successfully added ${ids.length} chunks to collection`);
  }

  /**
   * Search for similar documents
   */
  async search(query: string, options: QueryOptions = {}): Promise<SearchResult[]> {
    if (!this.collection) {
      throw new Error('Collection not initialized. Call initialize() first.');
    }

    const topK = options.topK || RAG_CONFIG.DEFAULT_TOP_K;
    const filter = options.filter || {};

    // Generate query embedding
    const queryEmbedding = await this.embedder.embed(query);

    // Build where clause for filtering
    const whereClause: any = {};
    if (filter.service) {
      whereClause.service = filter.service;
    }

    // Perform search
    const results = await this.collection.query({
      queryEmbeddings: [queryEmbedding],
      nResults: topK,
      where: Object.keys(whereClause).length > 0 ? whereClause : undefined,
      include: ['documents', 'metadatas', 'distances'],
    });

    // Transform results
    const searchResults: SearchResult[] = [];
    
    if (results.ids && results.ids.length > 0) {
      const ids = results.ids[0];
      const documents = results.documents?.[0] || [];
      const metadatas = results.metadatas?.[0] || [];
      const distances = results.distances?.[0] || [];

      for (let i = 0; i < ids.length; i++) {
        const metadata = metadatas[i] as any;
        const chunk: DocumentChunk = {
          id: ids[i],
          content: documents[i] || '',
          service: metadata?.service || '',
          pageId: metadata?.page_id || '',
          headers: JSON.parse(metadata?.headers || '[]'),
          url: metadata?.url || '',
          position: metadata?.position || 0,
          tokenCount: metadata?.token_count || 0,
        };

        searchResults.push({
          chunk,
          score: 1 - (distances[i] || 0), // Convert distance to similarity score
          distance: distances[i] || 0,
        });
      }
    }

    return searchResults;
  }

  /**
   * Get collection statistics
   */
  async getStats(): Promise<{ count: number; name: string }> {
    if (!this.collection) {
      throw new Error('Collection not initialized. Call initialize() first.');
    }

    const count = await this.collection.count();
    return {
      count,
      name: this.collectionName,
    };
  }

  /**
   * Delete all documents from collection
   */
  async clear(): Promise<void> {
    if (!this.collection) {
      throw new Error('Collection not initialized. Call initialize() first.');
    }

    await this.client.deleteCollection({
      name: this.collectionName,
    });
    
    // Recreate collection
    this.collection = await this.client.createCollection({
      name: this.collectionName,
      metadata: {
        'hnsw:space': RAG_CONFIG.DISTANCE_METRIC,
      },
    });
  }

  /**
   * Close the connection
   */
  async close(): Promise<void> {
    // ChromaDB client doesn't need explicit close for file-based storage
    this.collection = null;
  }
}

// Singleton instance
let storeInstance: ChromaStore | null = null;

export async function getChromaStore(embedder: Embedder): Promise<ChromaStore> {
  if (!storeInstance) {
    storeInstance = new ChromaStore(embedder);
    await storeInstance.initialize();
  }
  return storeInstance;
}
