import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import zlib from "zlib";
import { pipeline } from "@xenova/transformers";

// Cache directory
const CACHE_DIR = path.join(process.cwd(), "rag_cache");

// Persisted embeddings and documents
const EMBEDDINGS_FILE = path.join(CACHE_DIR, "embeddings.bin");
const DOCUMENTS_FILE = path.join(CACHE_DIR, "documents.json");
const PROGRESS_FILE = path.join(CACHE_DIR, "progress.json");

// Service names for extraction (uppercase)
const SERVICE_NAMES = [
  "EVS", "OBS", "ECS", "VPC", "RDS", "CCE", "ELB", "IAM", "APM", "CSS", "DWS", "DLI", "DDS",
  "DMS", "Kafka", "SMN", "SMS", "CSE", "DCS", "DDM", "DRS", "GES", "GaussDB", "MRS", "SFS",
  "SWR", "FunctionGraph", "ModelArts", "DLI", "DLV", "DIS", "DWS", "CloudTable", "DGC",
  "CloudIDE", "DevCloud", "CodeArts", "CodeCheck", "CodeCI", "CodeHub", "Repo", "Deploy",
  "CloudDeploy", "CloudPipeline", "CloudBuild", "CloudTest", "CloudArtifact", "CloudRelease",
  "AOM", "APM", "CES", "LTS", "COC", "CMDB", "AOS", "SMS", "BMS", "AS", "CAE", "CCI",
  "CCE", "CSBS", "VBS", "SDRS", "CBR", "SDI", "DES", "DIS", "CloudTable", "LakeFormation",
  "MRS", "DWS", "DLI", "DLI", "DLV", "DIS", "CloudIDE", "ModelArts", "HiLens", "DataArts",
  "Studio", "MRS", "Hive", "Spark", "Presto", "Flink", "ClickHouse", "GaussDB", "MySQL",
  "PostgreSQL", "Oracle", "MongoDB", "Redis", "Cassandra", "Influx", "Elasticsearch", "CSS",
  "DWS", "DWS", "DLI", "DIS", "CDN", "DNS", "VOD", "Live", "RTC", "LTS", "AOM", "APM",
  "CES", "COC", "CMDB", "AOS", "SMS", "CloudEye", "OMS", "CloudBackup", "CloudDeploy",
  "ServiceStage", "ServiceComb", "CSE", "ServiceMesh", "APIG", "ROMA", "Connect", "AppStage",
  "AIC", "MAS", "CloudPond", "EdgeSec", "WAF", "Anti-DDoS", "CFW", "HSS", "DBSS", "MTD",
  "SA", "SecMaster", "VSS", "CodeArtsInspector", "HSS", "DBSS", "MTD", "SA", "SecMaster",
  "IAM", "IdentityCenter", "RAM", "Organization", "RGC", "STS", "EPS", "TMS", "SCM",
  "Organizations", "ProjectMan", "CodeArtsProject", "CloudTest", "CloudIDE", "Desktop",
  "Workspace", "CloudPhone", "CCI", "IEF", "EVS", "IMS", "IMS", "IMS", "IMS", "EIP", "NAT",
  "VPN", "ELB", "VPC", "VPC", "EIP", "NAT", "VPN", "ELB", "BMS", "ECS", "IMS", "DEH",
  "FPGA", "GPU", "AS", "CCE", "CCI", "AS", "CCE", "CCI", "AOM", "APM", "LTS", "CES",
  "SMS", "OMS", "SFS", "SFS", "Turbo", "OBS", "OBS", "EVS", "VBS", "SDS", "SAS", "SATA",
  "SSD", "NVMe", "SAS", "SATA", "SSD", "NVMe", "EVS", "SFS", "SFS", "Turbo", "OBS"
];

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
  ragState.embeddingPipeline = await pipeline(
    "feature-extraction",
    "Xenova/all-MiniLM-L6-v2",
    { quantized: true }
  );
  console.log("Embedding model loaded");
  updateProgress("loading_model", 1, 1);

  return ragState.embeddingPipeline;
}

// Load embeddings and documents from disk (supports .gz files)
function loadEmbeddingsFromDisk(): {
  documents: RAGState["documents"];
  embeddings: Float32Array[];
} | null {
  console.log("Loading RAG data from disk...");

  // Check for gzipped or regular files
  const documentsGz = DOCUMENTS_FILE + ".gz";
  const embeddingsGz = EMBEDDINGS_FILE + ".gz";
  
  const hasDocs = fs.existsSync(DOCUMENTS_FILE) || fs.existsSync(documentsGz);
  const hasEmbeddings = fs.existsSync(EMBEDDINGS_FILE) || fs.existsSync(embeddingsGz);
  
  if (!hasDocs || !hasEmbeddings) {
    console.log("RAG data not found on disk");
    return null;
  }

  try {
    updateProgress("loading_from_disk", 0, 2);

    // Load documents (support .gz)
    let documentsJson: string;
    if (fs.existsSync(documentsGz)) {
      const compressed = fs.readFileSync(documentsGz);
      documentsJson = zlib.gunzipSync(compressed).toString("utf8");
      console.log(`Loaded documents from ${documentsGz}`);
    } else {
      documentsJson = fs.readFileSync(DOCUMENTS_FILE, "utf8");
      console.log(`Loaded documents from ${DOCUMENTS_FILE}`);
    }
    
    const documents = JSON.parse(documentsJson);
    console.log(`Loaded ${documents.length} documents`);
    updateProgress("loading_from_disk", 1, 2);

    // Load embeddings (support .gz)
    let buffer: Buffer;
    if (fs.existsSync(embeddingsGz)) {
      const compressed = fs.readFileSync(embeddingsGz);
      buffer = zlib.gunzipSync(compressed);
      console.log(`Loaded embeddings from ${embeddingsGz}`);
    } else {
      buffer = fs.readFileSync(EMBEDDINGS_FILE);
      console.log(`Loaded embeddings from ${EMBEDDINGS_FILE}`);
    }
    
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

    console.log(`Loaded ${embeddings.length} embeddings`);
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

// Extract service names from query
function extractServiceNames(query: string): string[] {
  const found: string[] = [];
  const queryUpper = query.toUpperCase();

  for (const service of SERVICE_NAMES) {
    if (queryUpper.includes(service.toUpperCase())) {
      found.push(service.toUpperCase());
    }
  }

  return found;
}

// Calculate relevance score with service boosting
function calculateRelevanceScore(
  semanticScore: number,
  document: RAGState["documents"][0],
  extractedServices: string[],
  query: string
): number {
  let score = semanticScore;

  // Boost if service name matches
  if (extractedServices.length > 0) {
    const docProduct = document.product.toUpperCase();
    for (const service of extractedServices) {
      if (docProduct === service) {
        score *= 1.5; // 50% boost for exact service match
        break;
      }
    }
  }

  // Boost if service name appears in title
  if (extractedServices.length > 0) {
    const titleUpper = document.title.toUpperCase();
    for (const service of extractedServices) {
      if (titleUpper.includes(service)) {
        score *= 1.2; // 20% boost for service in title
        break;
      }
    }
  }

  // Slight boost if query keywords appear in document content
  const queryWords = query.toLowerCase().split(/\s+/).filter(w => w.length > 3);
  const contentLower = document.content.toLowerCase();
  
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

// Search documents
async function searchDocuments(
  query: string,
  options: { product?: string; top_k: number; threshold: number }
): Promise<
  Array<{
    score: number;
    originalScore: number;
    document: RAGState["documents"][0];
  }>
> {
  const pipe = await getEmbeddingPipeline();

  // Extract service names from query for boosting
  const extractedServices = extractServiceNames(query);
  
  // Use first 2000 chars of query for embedding (~512 tokens)
  const queryOutput = await pipe([query.slice(0, 2000)], {
    pooling: "mean",
    normalize: true,
  });
  const queryEmbedding = queryOutput[0].data;

  const scores = ragState.embeddings.map((emb, idx) => {
    const semanticScore = cosineSimilarity(queryEmbedding, emb);
    const boostedScore = calculateRelevanceScore(
      semanticScore,
      ragState.documents[idx],
      extractedServices,
      query
    );

    return {
      idx,
      score: boostedScore,
      originalScore: semanticScore,
      document: ragState.documents[idx],
    };
  });

  let filtered = options.product
    ? scores.filter(
        (s) =>
          s.document.product.toLowerCase() === options.product!.toLowerCase()
      )
    : scores;

  // If we found service names, ensure we have at least some results from those services
  if (extractedServices.length > 0 && options.product === undefined) {
    const serviceMatchResults = filtered.filter((s) =>
      extractedServices.includes(s.document.product.toUpperCase())
    );
    
    // If we have service matches, keep at least 2 of them even if they have lower scores
    if (serviceMatchResults.length > 0) {
      const topK = Math.max(options.top_k, 5); // Get more candidates initially
      const topResults = filtered
        .filter((s) => s.score >= options.threshold)
        .sort((a, b) => b.score - a.score)
        .slice(0, topK);
      
      // Ensure at least 2 service matches are in the results
      const nonServiceMatches = topResults.filter(
        (s) => !extractedServices.includes(s.document.product.toUpperCase())
      );
      const serviceMatches = topResults.filter((s) =>
        extractedServices.includes(s.document.product.toUpperCase())
      );
      
      const serviceMatchesToInclude = Math.max(2, Math.min(serviceMatches.length, Math.ceil(options.top_k * 0.6)));
      
      // Combine: prioritize service matches, then fill with best other results
      const combined = [
        ...serviceMatches.slice(0, serviceMatchesToInclude),
        ...nonServiceMatches.slice(0, options.top_k - serviceMatchesToInclude)
      ].slice(0, options.top_k);
      
      return combined;
    }
  }

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
      threshold: 0.2, // Lowered threshold for better recall
    });

    const queryTime = Date.now() - startTime;

    return NextResponse.json({
      results: results.map((r) => ({
        similarity: r.score,
        originalSimilarity: r.originalScore,
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
      threshold: 0.2,
      boosted: true,
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

// GET handler for health check, progress, and schema
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get("action");

  if (action === "schema") {
    return NextResponse.json({
      name: "rag_search",
      description: "Search Huawei Cloud documentation knowledge base for relevant information about services, APIs, features, and guides. This tool provides accurate, up-to-date information from official Huawei Cloud documentation.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "The search query for finding relevant documentation. Be specific about the service, feature, API, or topic you're interested in.",
          },
          top_k: {
            type: "number",
            description: "Number of results to return (1-10, default: 3). More results provide more context.",
            default: 3,
          },
          product: {
            type: "string",
            description: "Optional: Filter to a specific Huawei Cloud service (e.g., 'ecs', 'obs', 'vpc').",
          },
        },
        required: ["query"],
      },
      returns: {
        type: "object",
        description: "Search results with relevant documentation snippets and full content",
      },
    });
  }

  return NextResponse.json({
    status: ragState.isReady ? "ready" : ragState.isInitializing ? "initializing" : "not_ready",
    documents: ragState.documents.length,
    progress: ragState.progress,
    persisted: fs.existsSync(EMBEDDINGS_FILE) && fs.existsSync(DOCUMENTS_FILE),
  });
}
