export const RAG_CONFIG = {
  // Paths
  CHROMA_DB_PATH: '/home/rag_cache/chroma_db',
  DOCS_PATH: '/home/rag_cache/clean_docs',
  LOGS_PATH: '/home/rag_cache/rag_logs',
  
  // Collection settings
  COLLECTION_NAME: 'huawei_docs',
  
  // Embedding model
  EMBEDDING_MODEL: 'Xenova/all-MiniLM-L6-v2',
  EMBEDDING_DIMENSIONS: 384,
  
  // Chunking settings
  MIN_CHUNK_SIZE: 100,      // Minimum tokens per chunk
  MAX_CHUNK_SIZE: 1000,     // Maximum tokens per chunk
  TARGET_CHUNK_SIZE: 500,   // Ideal chunk size
  
  // Processing
  BATCH_SIZE: 128,           // Documents per batch
  EMBEDDING_BATCH_SIZE: 64, // Chunks per embedding batch
  CONCURRENT_DOCUMENTS: 50,  // Parallel document processing
  
  // Search settings
  DEFAULT_TOP_K: 5,
  MAX_TOP_K: 20,
  
  // Distance metric for ChromaDB
  DISTANCE_METRIC: 'cosine',
} as const;

export type RAGConfig = typeof RAG_CONFIG;
