export interface DocumentChunk {
  id: string;
  content: string;
  service: string;
  pageId: string;
  headers: string[];
  url: string;
  position: number;
  tokenCount: number;
}

export interface Document {
  service: string;
  pageId: string;
  content: string;
  metadata: {
    url: string;
    title?: string;
  };
}

export interface SearchResult {
  chunk: DocumentChunk;
  score: number;
  distance: number;
}

export interface QueryOptions {
  topK?: number;
  filter?: {
    service?: string;
  };
}

export interface IngestionStats {
  totalDocuments: number;
  totalChunks: number;
  processedDocuments: number;
  failedDocuments: number;
  startTime: Date;
  endTime?: Date;
  errors: string[];
}

export interface TestQuery {
  id: string;
  query: string;
  expectedServices: string[];
  description: string;
}

export interface TestResult {
  query: TestQuery;
  results: SearchResult[];
  relevantFound: boolean;
  topRelevantRank?: number;
  latency: number;
}
