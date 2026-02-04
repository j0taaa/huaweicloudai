import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

// Cache directory
const CACHE_DIR = path.join(process.cwd(), "rag_cache");

// Persisted embeddings and documents
const EMBEDDINGS_FILE = path.join(CACHE_DIR, "embeddings.bin");
const DOCUMENTS_FILE = path.join(CACHE_DIR, "documents.json");
const PROGRESS_FILE = path.join(CACHE_DIR, "progress.json");

// RAG State (singleton pattern)
type RAGState = {
  isReady: boolean;
  isInitializing: boolean;
  initPromise: Promise<void> | null;
  progress: {
    stage: string;
    current: number;
    total: number;
    percentage: number;
  };
  documents: Array<{
    id: string;
    content: string;
    source: string;
    title: string;
    product: string;
    category: string;
  }>;
  embeddings: Float32Array[];
  embeddingPipeline: any;
};

let ragState: RAGState = {
  isReady: false,
  isInitializing: false,
  initPromise: null,
  progress: { stage: "idle", current: 0, total: 0, percentage: 0 },
  documents: [],
  embeddings: [],
  embeddingPipeline: null,
};

// Update progress
function updateProgress(stage: string, current: number, total: number) {
  const percentage = total > 0 ? Math.round((current / total) * 100) : 0;
  ragState.progress = { stage, current, total, percentage };
  
  // Save progress to disk for persistence across restarts
  try {
    fs.writeFileSync(PROGRESS_FILE, JSON.stringify({
      stage,
      current,
      total,
      percentage,
      timestamp: Date.now(),
    }));
  } catch (e) {
    // Ignore progress save errors
  }
}

// Get or create embedding pipeline
async function getEmbeddingPipeline(): Promise<any> {
  if (ragState.embeddingPipeline) {
    return ragState.embeddingPipeline;
  }

  console.log("Loading embedding model (Xenova/all-MiniLM-L6-v2)...");
  updateProgress("loading_model", 0, 1);
  if (typeof process !== "undefined") {
    process.env.TRANSFORMERS_BACKEND ??= "wasm";
  }
  const { pipeline } = await import("@xenova/transformers");
  ragState.embeddingPipeline = await pipeline(
    "feature-extraction",
    "Xenova/all-MiniLM-L6-v2",
    { quantized: true }
  );
  console.log("Embedding model loaded");
  updateProgress("loading_model", 1, 1);

  return ragState.embeddingPipeline;
}

// Load embeddings and documents from disk
function loadEmbeddingsFromDisk(): {
  documents: RAGState["documents"];
  embeddings: Float32Array[];
} | null {
  console.log("Loading RAG data from disk...");

  if (!fs.existsSync(DOCUMENTS_FILE) || !fs.existsSync(EMBEDDINGS_FILE)) {
    console.log("RAG data not found on disk");
    return null;
  }

  try {
    updateProgress("loading_from_disk", 0, 2);

    const documentsJson = fs.readFileSync(DOCUMENTS_FILE, "utf8");
    const documents = JSON.parse(documentsJson);
    console.log(`Loaded ${documents.length} documents from ${DOCUMENTS_FILE}`);
    updateProgress("loading_from_disk", 1, 2);

    const buffer = fs.readFileSync(EMBEDDINGS_FILE);
    let offset = 0;

    const count = buffer.readUInt32LE(offset);
    offset += 4;

    const embeddings: Float32Array[] = [];

    for (let i = 0; i < count; i++) {
      const length = buffer.readUInt32LE(offset);
      offset += 4;

      const embedding = new Float32Array(length);
      for (let j = 0; j < length; j++) {
        embedding[j] = buffer.readFloatLE(offset);
        offset += 4;
      }

      embeddings.push(embedding);
    }

    console.log(`Loaded ${embeddings.length} embeddings from ${EMBEDDINGS_FILE}`);
    updateProgress("loading_from_disk", 2, 2);

    return { documents, embeddings };
  } catch (error) {
    console.error("Error loading RAG data from disk:", error);
    return null;
  }
}

// Calculate cosine similarity
function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

// Search documents
async function searchDocuments(
  query: string,
  options: { product?: string; top_k: number; threshold: number }
): Promise<
  Array<{
    score: number;
    document: RAGState["documents"][0];
  }>
> {
  const pipe = await getEmbeddingPipeline();

  // Use first 2000 chars of query for embedding (~512 tokens)
  const queryOutput = await pipe([query.slice(0, 2000)], {
    pooling: "mean",
    normalize: true,
  });
  const queryEmbedding = queryOutput[0].data;

  const scores = ragState.embeddings.map((emb, idx) => ({
    idx,
    score: cosineSimilarity(queryEmbedding, emb),
    document: ragState.documents[idx],
  }));

  let filtered = options.product
    ? scores.filter(
        (s) =>
          s.document.product.toLowerCase() === options.product!.toLowerCase()
      )
    : scores;

  const results = filtered
    .filter((s) => s.score >= options.threshold)
    .sort((a, b) => b.score - a.score)
    .slice(0, options.top_k);

  return results;
}

// Initialize RAG system
async function initializeRAG(): Promise<void> {
  if (ragState.isReady) {
    return;
  }

  if (ragState.isInitializing && ragState.initPromise) {
    return ragState.initPromise;
  }

  ragState.isInitializing = true;
  ragState.initPromise = doInitialization();

  try {
    await ragState.initPromise;
    ragState.isReady = true;
    console.log("RAG system initialized successfully");
  } catch (error) {
    console.error("RAG initialization failed:", error);
    ragState.isInitializing = false;
    ragState.initPromise = null;
    throw error;
  } finally {
    ragState.isInitializing = false;
  }
}

// Actual initialization work
async function doInitialization(): Promise<void> {
  console.log("Starting RAG initialization...");
  const startTime = Date.now();

  try {
    // Check if persisted embeddings exist
    const persistedData = loadEmbeddingsFromDisk();

    if (persistedData) {
      ragState.documents = persistedData.documents;
      ragState.embeddings = persistedData.embeddings;

      const initTime = Date.now() - startTime;
      console.log(
        `RAG initialization complete from disk in ${initTime}ms (${ragState.documents.length} docs, ${ragState.embeddings.length} embeddings)`
      );
      updateProgress("ready", ragState.documents.length, ragState.documents.length);
      return;
    }

    throw new Error(
      "No RAG data found. Please run: cd scraper && npx tsx scripts/scrape-all.ts && cd .. && npx tsx scripts/build-rag.ts"
    );

  } catch (error) {
    console.error("RAG initialization error:", error);
    updateProgress("error", 0, 0);
    throw error;
  }
}

// POST handler
export async function POST(request: Request) {
  const startTime = Date.now();

  try {
    const body = await request.json();
    const { query, product, top_k = 3 } = body;

    if (!query || typeof query !== "string") {
      return NextResponse.json(
        { error: "Query is required and must be a string" },
        { status: 400 }
      );
    }

    // Initialize RAG (lazy loading)
    await initializeRAG();

    if (!ragState.isReady) {
      return NextResponse.json(
        { error: "RAG system failed to initialize" },
        { status: 503 }
      );
    }

    // Perform search
    const results = await searchDocuments(query, {
      product,
      top_k: Math.min(Math.max(top_k, 1), 10),
      threshold: 0.55,
    });

    const queryTime = Date.now() - startTime;

    return NextResponse.json({
      results: results.map((r) => ({
        similarity: r.score,
        snippet: r.document.content.slice(0, 2000),  // Return first 2000 chars of full content
        fullContent: r.document.content,  // Return full content for context
        source: r.document.source,
        title: r.document.title,
        product: r.document.product,
        category: r.document.category,
        id: r.document.id,
      })),
      totalDocs: ragState.documents.length,
      queryTime,
      threshold: 0.55,
    });
  } catch (error) {
    console.error("RAG search error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Unknown error occurred",
      },
      { status: 500 }
    );
  }
}

// GET handler for health check and progress
export async function GET() {
  return NextResponse.json({
    status: ragState.isReady ? "ready" : ragState.isInitializing ? "initializing" : "not_ready",
    documents: ragState.documents.length,
    progress: ragState.progress,
    persisted: fs.existsSync(EMBEDDINGS_FILE) && fs.existsSync(DOCUMENTS_FILE),
  });
}
