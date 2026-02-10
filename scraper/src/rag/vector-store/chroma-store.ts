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
    // Use environment variable if available (Docker), otherwise default to localhost
    const chromaUrl = process.env.CHROMA_DB_URL;
    
    if (chromaUrl) {
      // URL format: http://hostname:port
      this.client = new ChromaClient({
        path: chromaUrl,
      });
    } else {
      // Default to localhost for local development
      this.client = new ChromaClient({
        host: 'localhost',
        port: 8000,
      });
    }
    
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
   * Extract service names from query
   */
  private extractServiceNames(query: string): string[] {
    const services = ['EVS', 'OBS', 'ECS', 'VPC', 'RDS', 'CCE', 'ELB', 'IAM', 'APM', 'CSS', 'DWS', 
                      'DLI', 'DDS', 'Kafka', 'SMN', 'SMS', 'CSE', 'DCS', 'DDM', 'DRS', 'GES',
                      'GaussDB', 'MRS', 'SFS', 'SWR', 'FunctionGraph', 'ModelArts', 'DLV', 'DIS',
                      'CDN', 'DNS', 'VOD', 'Live', 'RTC', 'LTS', 'AOM', 'APM', 'CES', 'AS', 'CAE',
                      'CCI', 'CSBS', 'VBS', 'SDRS', 'CBR', 'DES', 'CloudTable', 'LakeFormation',
                      'APIG', 'ROMA', 'WAF', 'CFW', 'HSS', 'DBSS', 'IAM', 'RAM', 'TMS', 'SCM'];
    
    const found: string[] = [];
    const queryUpper = query.toUpperCase();

    for (const service of services) {
      if (queryUpper.includes(service.toUpperCase())) {
        found.push(service.toUpperCase());
      }
    }

    return found;
  }

  /**
   * Calculate relevance score with service boosting
   */
  private calculateRelevanceScore(
    semanticScore: number,
    chunk: DocumentChunk,
    extractedServices: string[],
    query: string
  ): number {
    let score = semanticScore;

    // Boost if service name matches
    if (extractedServices.length > 0) {
      const chunkService = chunk.service.toUpperCase();
      for (const service of extractedServices) {
        if (chunkService === service) {
          score *= 1.5; // 50% boost for exact service match
          break;
        }
      }
    }

    // Boost if service name appears in headers
    if (extractedServices.length > 0) {
      const headersUpper = chunk.headers.join(' ').toUpperCase();
      for (const service of extractedServices) {
        if (headersUpper.includes(service)) {
          score *= 1.2; // 20% boost for service in headers
          break;
        }
      }
    }

    // Slight boost if query keywords appear in document content
    const queryWords = query.toLowerCase().split(/\s+/).filter(w => w.length > 3);
    const contentLower = chunk.content.toLowerCase();
    
    let keywordMatches = 0;
    for (const word of queryWords) {
      if (contentLower.includes(word)) {
        keywordMatches++;
      }
    }

    if (queryWords.length > 0 && keywordMatches > 0) {
      const keywordMatchRatio = keywordMatches / queryWords.length;
      score *= (1 + keywordMatchRatio * 0.2); // Up to 20% boost for keyword matches
    }

    return Math.min(score, 1.0); // Cap at 1.0
  }

  /**
   * Search for similar documents with hybrid ranking
   */
  async search(query: string, options: QueryOptions = {}): Promise<SearchResult[]> {
    if (!this.collection) {
      throw new Error('Collection not initialized. Call initialize() first.');
    }

    const topK = options.topK || RAG_CONFIG.DEFAULT_TOP_K;
    const filter = options.filter || {};

    // Extract service names from query
    const extractedServices = this.extractServiceNames(query);

    // Generate query embedding
    const queryEmbedding = await this.embedder.embed(query);

    // Build where clause for filtering
    const whereClause: any = {};
    if (filter.service) {
      whereClause.service = filter.service;
    }

    // If service names are extracted and no explicit filter, try to get more results for reranking
    const searchTopK = (extractedServices.length > 0 && !filter.service) 
      ? Math.min(topK * 3, RAG_CONFIG.MAX_TOP_K) 
      : topK;

    // Perform search
    const results = await this.collection.query({
      queryEmbeddings: [queryEmbedding],
      nResults: searchTopK,
      where: Object.keys(whereClause).length > 0 ? whereClause : undefined,
      include: ['documents', 'metadatas', 'distances'],
    });

    // Transform and rerank results
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

        const semanticScore = 1 - (distances[i] || 0);
        const boostedScore = this.calculateRelevanceScore(
          semanticScore,
          chunk,
          extractedServices,
          query
        );

        searchResults.push({
          chunk,
          score: boostedScore,
          distance: distances[i] || 0,
        });
      }
    }

    // If we have service matches, ensure we have at least some results from those services
    if (extractedServices.length > 0 && !filter.service) {
      const serviceMatchResults = searchResults.filter((r) =>
        extractedServices.includes(r.chunk.service.toUpperCase())
      );
      
      if (serviceMatchResults.length > 0) {
        // Sort by boosted score
        searchResults.sort((a, b) => b.score - a.score);
        
        // Ensure at least 2 service matches are in the results
        const nonServiceMatches = searchResults.filter(
          (s) => !extractedServices.includes(s.chunk.service.toUpperCase())
        );
        const serviceMatches = searchResults.filter((s) =>
          extractedServices.includes(s.chunk.service.toUpperCase())
        );
        
        const serviceMatchesToInclude = Math.max(
          2, 
          Math.min(serviceMatches.length, Math.ceil(topK * 0.6))
        );
        
        // Combine: prioritize service matches, then fill with best other results
        const combined = [
          ...serviceMatches.slice(0, serviceMatchesToInclude),
          ...nonServiceMatches.slice(0, topK - serviceMatchesToInclude)
        ].slice(0, topK);
        
        return combined;
      }
    }

    // Sort by score and return topK
    searchResults.sort((a, b) => b.score - a.score);
    return searchResults.slice(0, topK);
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
