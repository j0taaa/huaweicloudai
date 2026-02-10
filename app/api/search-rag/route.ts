import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import zlib from "zlib";
import { pipeline } from "@xenova/transformers";

const CACHE_DIR = path.join(process.cwd(), "rag_cache");
const SPLIT_DIR = path.join(CACHE_DIR, "split_docs");
const EMBEDDINGS_FILE = path.join(CACHE_DIR, "embeddings.bin");
const INDEX_FILE = path.join(CACHE_DIR, "doc-index.bin");
const PROGRESS_FILE = path.join(CACHE_DIR, "progress.json");

const SERVICE_NAMES = [
  "EVS", "OBS", "ECS", "VPC", "RDS", "CCE", "ELB", "IAM", "APM", "CSS", "DWS", "DLI", "DDS",
  "DMS", "Kafka", "SMN", "SMS", "CSE", "DCS", "DDM", "DRS", "GES", "GaussDB", "MRS", "SFS",
  "SWR", "FunctionGraph", "ModelArts", "CloudTable", "DGC", "CloudIDE", "DevCloud", "CodeArts",
  "AOM", "CES", "LTS", "COC", "CMDB", "AOS", "BMS", "AS", "CAE", "CCI", "CSBS", "VBS",
  "SDRS", "CBR", "DES", "CDN", "DNS", "VOD", "Live", "RTC", "WAF", "Anti-DDoS", "CFW",
  "HSS", "DBSS", "IAM", "Organization", "Workspace", "CloudPhone", "EIP", "NAT", "VPN",
  "BMS", "DEH", "FPGA", "GPU", "SFS", "Turbo", "CSS", "DWS", "DLV", "DIS"
];

// Minimal document info from binary index
type DocInfo = {
  id: string;
  part: number;
  idx: number;
};

type RAGState = {
  isReady: boolean;
  isInitializing: boolean;
  initPromise: Promise<void> | null;
  progress: { stage: string; current: number; total: number; percentage: number };
  docIndex: Map<string, DocInfo>;  // id -> location info
  docCount: number;
  embeddingsBuffer: Float32Array | null;
  embeddingDim: number;
  embeddingPipeline: any;
};

let ragState: RAGState = {
  isReady: false,
  isInitializing: false,
  initPromise: null,
  progress: { stage: "idle", current: 0, total: 0, percentage: 0 },
  docIndex: new Map(),
  docCount: 0,
  embeddingsBuffer: null,
  embeddingDim: 384,
  embeddingPipeline: null,
};

function updateProgress(stage: string, current: number, total: number) {
  const percentage = total > 0 ? Math.round((current / total) * 100) : 0;
  ragState.progress = { stage, current, total, percentage };
  try {
    fs.writeFileSync(PROGRESS_FILE, JSON.stringify({ stage, current, total, percentage, timestamp: Date.now() }));
  } catch (e) {}
}

async function getEmbeddingPipeline(): Promise<any> {
  if (ragState.embeddingPipeline) return ragState.embeddingPipeline;
  console.log("Loading embedding model...");
  updateProgress("loading_model", 0, 1);
  ragState.embeddingPipeline = await pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2", { quantized: true });
  console.log("Embedding model loaded");
  updateProgress("loading_model", 1, 1);
  return ragState.embeddingPipeline;
}

// Load binary index (very small - ~1.4MB)
function loadBinaryIndex(): Map<string, DocInfo> {
  console.log("Loading binary document index...");
  const index = new Map<string, DocInfo>();
  
  if (!fs.existsSync(INDEX_FILE)) {
    throw new Error("Document index not found. Run: python3 scripts/create_index_streaming.py");
  }
  
  const buffer = fs.readFileSync(INDEX_FILE);
  let offset = 0;
  
  const count = buffer.readUInt32LE(offset);
  offset += 4;
  
  for (let i = 0; i < count; i++) {
    const idLen = buffer.readUInt8(offset);
    offset += 1;
    
    const id = buffer.toString('utf8', offset, offset + idLen);
    offset += idLen;
    
    const part = buffer.readUInt8(offset);
    offset += 1;
    
    const idx = buffer.readUInt32LE(offset);
    offset += 4;
    
    index.set(id, { id, part, idx });
  }
  
  console.log(`Loaded index with ${index.size} documents`);
  return index;
}

// Load embeddings (103MB)
function loadEmbeddings(): { buffer: Float32Array; dim: number; count: number } | null {
  console.log("Loading embeddings...");
  
  const embeddingsGz = EMBEDDINGS_FILE + ".gz";
  if (!fs.existsSync(embeddingsGz)) {
    console.log("Embeddings file not found");
    return null;
  }
  
  try {
    const compressed = fs.readFileSync(embeddingsGz);
    const buffer = zlib.gunzipSync(compressed);
    
    let offset = 0;
    const count = buffer.readUInt32LE(offset);
    offset += 4;
    
    const firstLength = buffer.readUInt32LE(offset);
    const embeddingDim = firstLength;
    
    const embeddingsBuffer = new Float32Array(count * embeddingDim);
    
    offset = 4;
    for (let i = 0; i < count; i++) {
      const length = buffer.readUInt32LE(offset);
      offset += 4;
      
      for (let j = 0; j < length; j++) {
        embeddingsBuffer[i * embeddingDim + j] = buffer.readFloatLE(offset);
        offset += 4;
      }
    }
    
    console.log(`Loaded ${count} embeddings (${embeddingDim} dims, ${(embeddingsBuffer.length * 4 / 1024 / 1024).toFixed(2)} MB)`);
    return { buffer: embeddingsBuffer, dim: embeddingDim, count };
  } catch (error) {
    console.error("Error loading embeddings:", error);
    return null;
  }
}

// Load full document content on-demand from split files
function loadDocumentContent(docInfo: DocInfo): { id: string; content: string; source: string; title: string; product: string; category: string } | null {
  try {
    const partFile = path.join(SPLIT_DIR, `documents_part_${docInfo.part}.json.gz`);
    const compressed = fs.readFileSync(partFile);
    const jsonStr = zlib.gunzipSync(compressed).toString("utf8");
    const docs = JSON.parse(jsonStr);
    
    const doc = docs[docInfo.idx];
    return {
      id: doc.id,
      content: doc.content || "",
      source: doc.source || "",
      title: doc.title || "",
      product: doc.product || "",
      category: doc.category || ""
    };
  } catch (error) {
    console.error(`Error loading document ${docInfo.id}:`, error);
    return null;
  }
}

// Get embedding at index
function getEmbeddingAt(index: number): Float32Array {
  const start = index * ragState.embeddingDim;
  const end = start + ragState.embeddingDim;
  return ragState.embeddingsBuffer!.subarray(start, end);
}

function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  let dotProduct = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

function extractServiceNames(query: string): string[] {
  const found: string[] = [];
  const queryUpper = query.toUpperCase();
  for (const service of SERVICE_NAMES) {
    if (queryUpper.includes(service.toUpperCase())) found.push(service.toUpperCase());
  }
  return found;
}

// Store ID array for index lookups (embeddings are ordered by this array)
let idArray: string[] = [];

async function searchDocuments(query: string, options: { product?: string; top_k: number; threshold: number }) {
  const pipe = await getEmbeddingPipeline();
  const extractedServices = extractServiceNames(query);
  
  const queryOutput = await pipe([query.slice(0, 2000)], { pooling: "mean", normalize: true });
  const queryEmbedding = queryOutput[0].data;
  
  const scores: { idx: number; score: number; originalScore: number }[] = [];
  
  for (let idx = 0; idx < ragState.docCount; idx++) {
    const emb = getEmbeddingAt(idx);
    const semanticScore = cosineSimilarity(queryEmbedding, emb);
    scores.push({ idx, score: semanticScore, originalScore: semanticScore });
  }
  
  // Sort and get top results
  const results = scores
    .filter(s => s.score >= options.threshold)
    .sort((a, b) => b.score - a.score)
    .slice(0, options.top_k);
  
  // Load document content for results
  return results.map(r => {
    const docId = idArray[r.idx];
    const docInfo = ragState.docIndex.get(docId);
    if (!docInfo) return null;
    
    const fullDoc = loadDocumentContent(docInfo);
    return {
      score: r.score,
      originalScore: r.originalScore,
      document: fullDoc || { id: docId, content: "", source: "", title: "", product: "", category: "" }
    };
  }).filter(Boolean);
}

async function initializeRAG(): Promise<void> {
  if (ragState.isReady) return;
  if (ragState.isInitializing && ragState.initPromise) return ragState.initPromise;
  
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

async function doInitialization(): Promise<void> {
  console.log("Starting RAG initialization...");
  const startTime = Date.now();
  
  try {
    // Load binary index (very small)
    updateProgress("loading_index", 0, 1);
    ragState.docIndex = loadBinaryIndex();
    ragState.docCount = ragState.docIndex.size;
    
    // Create ID array for index lookups (embeddings are in order)
    idArray = Array.from(ragState.docIndex.keys());
    updateProgress("loading_index", 1, 1);
    
    // Load embeddings
    updateProgress("loading_embeddings", 0, 1);
    const embeddingsData = loadEmbeddings();
    if (!embeddingsData) {
      throw new Error("Failed to load embeddings");
    }
    ragState.embeddingsBuffer = embeddingsData.buffer;
    ragState.embeddingDim = embeddingsData.dim;
    updateProgress("loading_embeddings", 1, 1);
    
    if (ragState.docCount !== embeddingsData.count) {
      console.warn(`Warning: Document count (${ragState.docCount}) != embedding count (${embeddingsData.count})`);
    }
    
    const initTime = Date.now() - startTime;
    console.log(`RAG initialized in ${initTime}ms`);
    updateProgress("ready", ragState.docCount, ragState.docCount);
    
  } catch (error) {
    console.error("RAG initialization error:", error);
    updateProgress("error", 0, 0);
    throw error;
  }
}

export async function POST(request: Request) {
  const startTime = Date.now();
  
  try {
    const body = await request.json();
    const { query, product, top_k = 3 } = body;
    
    if (!query || typeof query !== "string") {
      return NextResponse.json({ error: "Query is required" }, { status: 400 });
    }
    
    await initializeRAG();
    
    if (!ragState.isReady) {
      return NextResponse.json({ error: "RAG system not ready" }, { status: 503 });
    }
    
    const results = await searchDocuments(query, {
      product,
      top_k: Math.min(Math.max(top_k, 1), 10),
      threshold: 0.2,
    });
    
    const queryTime = Date.now() - startTime;
    
    return NextResponse.json({
      results: results!.map(r => ({
        similarity: r!.score,
        originalSimilarity: r!.originalScore,
        snippet: r!.document.content.slice(0, 2000),
        fullContent: r!.document.content,
        source: r!.document.source,
        title: r!.document.title,
        product: r!.document.product,
        category: r!.document.category,
        id: r!.document.id,
      })),
      totalDocs: ragState.docCount,
      queryTime,
      threshold: 0.2,
      boosted: true,
    });
  } catch (error) {
    console.error("RAG search error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get("action");
  
  if (action === "schema") {
    return NextResponse.json({
      name: "rag_search",
      description: "Search Huawei Cloud documentation",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search query" },
          top_k: { type: "number", description: "Number of results", default: 3 },
          product: { type: "string", description: "Filter by product" },
        },
        required: ["query"],
      },
      returns: { type: "object" },
    });
  }
  
  return NextResponse.json({
    status: ragState.isReady ? "ready" : ragState.isInitializing ? "initializing" : "not_ready",
    documents: ragState.docCount,
    progress: ragState.progress,
    persisted: fs.existsSync(INDEX_FILE) && fs.existsSync(EMBEDDINGS_FILE + ".gz"),
  });
}
