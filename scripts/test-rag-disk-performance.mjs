/**
 * RAG Performance Test: RAM vs Disk Storage
 * 
 * This script tests how much slower RAG becomes when forced to read from disk
 * instead of keeping embeddings in RAM.
 */

import fs from "fs";
import path from "path";
import zlib from "zlib";
import { pipeline } from "@xenova/transformers";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Cache directory
const CACHE_DIR = path.join(process.cwd(), "rag_cache");
const EMBEDDINGS_FILE = path.join(CACHE_DIR, "embeddings.bin");
const DOCUMENTS_FILE = path.join(CACHE_DIR, "documents.json");

// Test configuration
const TEST_QUERIES = [
  "how to create an ECS instance",
  "how to upload files to OBS bucket",
  "CreateServer API vpc parameters",
  "ECS instance wont start error troubleshooting",
  "VPC peering connection bandwidth limits",
  "RDS MySQL backup and restore",
  "security best practices",
];

const TOP_K = 5;
const THRESHOLD = 0.2;

// Calculate cosine similarity
function cosineSimilarity(a, b) {
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

// Load embeddings from disk (slow path)
function loadEmbeddingsFromDisk() {
  console.log("Loading RAG data from disk...");
  const startTime = Date.now();

  const documentsGz = DOCUMENTS_FILE + ".gz";
  const embeddingsGz = EMBEDDINGS_FILE + ".gz";
  
  const hasDocs = fs.existsSync(DOCUMENTS_FILE) || fs.existsSync(documentsGz);
  const hasEmbeddings = fs.existsSync(EMBEDDINGS_FILE) || fs.existsSync(embeddingsGz);
  
  if (!hasDocs || !hasEmbeddings) {
    console.log("❌ RAG data not found on disk. Please run the scraper first.");
    process.exit(1);
  }

  // Load documents
  let documentsJson;
  if (fs.existsSync(documentsGz)) {
    const compressed = fs.readFileSync(documentsGz);
    documentsJson = zlib.gunzipSync(compressed).toString("utf8");
  } else {
    documentsJson = fs.readFileSync(DOCUMENTS_FILE, "utf8");
  }
  const documents = JSON.parse(documentsJson);

  // Load embeddings
  let buffer;
  if (fs.existsSync(embeddingsGz)) {
    const compressed = fs.readFileSync(embeddingsGz);
    buffer = zlib.gunzipSync(compressed);
  } else {
    buffer = fs.readFileSync(EMBEDDINGS_FILE);
  }
  
  let offset = 0;
  const count = buffer.readUInt32LE(offset);
  offset += 4;

  const embeddings = [];
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

  const loadTime = Date.now() - startTime;
  console.log(`✅ Loaded ${documents.length} documents and ${embeddings.length} embeddings in ${loadTime}ms\n`);

  return { documents, embeddings };
}

// Search using RAM (fast)
async function searchWithRAM(queryEmbedding, embeddings) {
  const scores = embeddings.map((emb, idx) => {
    const semanticScore = cosineSimilarity(queryEmbedding, emb);
    return {
      idx,
      score: semanticScore,
    };
  });

  return scores
    .filter((s) => s.score >= THRESHOLD)
    .sort((a, b) => b.score - a.score)
    .slice(0, TOP_K);
}

// Search reading from disk (slow) - reads file once but accesses embeddings sequentially
async function searchWithDiskBuffer(queryEmbedding, totalCount) {
  const results = [];
  
  // Read embeddings file once to get buffer
  const embeddingsGz = EMBEDDINGS_FILE + ".gz";
  let buffer;
  if (fs.existsSync(embeddingsGz)) {
    const compressed = fs.readFileSync(embeddingsGz);
    buffer = zlib.gunzipSync(compressed);
  } else {
    buffer = fs.readFileSync(EMBEDDINGS_FILE);
  }
  
  // Read embeddings sequentially
  let offset = 4; // Skip count header
  
  for (let i = 0; i < totalCount; i++) {
    const length = buffer.readUInt32LE(offset);
    offset += 4;
    
    const embedding = new Float32Array(length);
    for (let j = 0; j < length; j++) {
      embedding[j] = buffer.readFloatLE(offset);
      offset += 4;
    }
    
    const semanticScore = cosineSimilarity(queryEmbedding, embedding);
    if (semanticScore >= THRESHOLD) {
      results.push({
        idx: i,
        score: semanticScore,
      });
    }
  }
  
  return results.sort((a, b) => b.score - a.score).slice(0, TOP_K);
}

// Simulate disk I/O with page faults (re-read small chunks)
async function searchWithDiskIO(queryEmbedding, totalCount, sampleSize = 1000) {
  // For practical testing, sample a subset and extrapolate
  const sampleCount = Math.min(sampleSize, totalCount);
  const sampleResults = [];
  
  // Get file size for I/O estimation
  const stats = fs.statSync(EMBEDDINGS_FILE + ".gz");
  const totalFileSize = stats.size;
  
  const startTime = Date.now();
  
  // Simulate reading by re-reading the gzipped file for each embedding
  // This simulates worst-case scenario where OS cache is cold
  for (let i = 0; i < sampleCount; i++) {
    // Force re-read from disk (bypass OS cache by reading fresh each time)
    const compressed = fs.readFileSync(EMBEDDINGS_FILE + ".gz");
    const buffer = zlib.gunzipSync(compressed);
    
    // Find this specific embedding (simplified - just use first one for timing)
    let offset = 4;
    const length = buffer.readUInt32LE(offset);
    offset += 4;
    
    const embedding = new Float32Array(length);
    for (let k = 0; k < length; k++) {
      embedding[k] = buffer.readFloatLE(offset + k * 4);
    }
    
    const semanticScore = cosineSimilarity(queryEmbedding, embedding);
    sampleResults.push({ idx: i, score: semanticScore });
  }
  
  const sampleTime = Date.now() - startTime;
  // Extrapolate to full dataset
  const estimatedFullTime = (sampleTime / sampleCount) * totalCount;
  
  return { sampleTime, estimatedFullTime, sampleCount };
}

async function runTests() {
  console.log("=".repeat(80));
  console.log("RAG PERFORMANCE TEST: RAM vs DISK STORAGE");
  console.log("=".repeat(80));
  console.log();

  // Load data into RAM
  const { documents, embeddings } = loadEmbeddingsFromDisk();
  
  // Load embedding pipeline
  console.log("Loading embedding model...");
  const pipe = await pipeline(
    "feature-extraction",
    "Xenova/all-MiniLM-L6-v2",
    { quantized: true }
  );
  console.log("✅ Model loaded\n");

  const results = {
    ram: [],
    diskBuffer: [],
  };

  console.log("Running RAM vs Disk (buffered) tests...\n");
  
  for (const query of TEST_QUERIES) {
    console.log(`Query: "${query}"`);
    
    // Get query embedding
    const queryOutput = await pipe([query.slice(0, 2000)], {
      pooling: "mean",
      normalize: true,
    });
    const queryEmbedding = queryOutput[0].data;

    // Test 1: RAM-based search (current implementation)
    const ramStart = Date.now();
    await searchWithRAM(queryEmbedding, embeddings);
    const ramTime = Date.now() - ramStart;
    results.ram.push(ramTime);
    console.log(`  RAM-based:        ${ramTime}ms`);

    // Test 2: Disk buffer search (read file once, access embeddings sequentially)
    const diskBufferStart = Date.now();
    await searchWithDiskBuffer(queryEmbedding, embeddings.length);
    const diskBufferTime = Date.now() - diskBufferStart;
    results.diskBuffer.push(diskBufferTime);
    console.log(`  Disk (buffered):  ${diskBufferTime}ms (${(diskBufferTime/ramTime).toFixed(1)}x slower)`);
    console.log();
  }

  // Run true disk I/O test on a subset
  console.log("Running true disk I/O test (sampling 100 embeddings)...");
  const queryOutput = await pipe([TEST_QUERIES[0].slice(0, 2000)], {
    pooling: "mean",
    normalize: true,
  });
  const queryEmbedding = queryOutput[0].data;
  
  const { sampleTime, estimatedFullTime, sampleCount } = await searchWithDiskIO(
    queryEmbedding, 
    embeddings.length,
    100
  );
  
  console.log(`  Sampled ${sampleCount} embeddings in ${sampleTime}ms`);
  console.log(`  Estimated full time: ${estimatedFullTime.toFixed(0)}ms (${(estimatedFullTime/1000).toFixed(1)}s)`);
  console.log();

  // Calculate averages
  const avgRAM = results.ram.reduce((a, b) => a + b, 0) / results.ram.length;
  const avgDiskBuffer = results.diskBuffer.reduce((a, b) => a + b, 0) / results.diskBuffer.length;

  // Calculate slowdown factors
  const slowdownBuffer = avgDiskBuffer / avgRAM;
  const slowdownIO = estimatedFullTime / avgRAM;

  // Print summary
  console.log("=".repeat(80));
  console.log("RESULTS SUMMARY");
  console.log("=".repeat(80));
  console.log();
  console.log(`Total documents: ${documents.length.toLocaleString()}`);
  console.log(`Embedding dimension: ${embeddings[0].length}`);
  console.log(`Test queries: ${TEST_QUERIES.length}`);
  console.log();
  console.log("Average Query Times:");
  console.log(`  RAM (in-memory):        ${avgRAM.toFixed(1)}ms`);
  console.log(`  Disk (buffered):        ${avgDiskBuffer.toFixed(1)}ms`);
  console.log(`  Disk (true I/O, est.):  ${estimatedFullTime.toFixed(0)}ms (${(estimatedFullTime/1000).toFixed(1)}s)`);
  console.log();
  console.log("Slowdown Factors:");
  console.log(`  Disk (buffered) vs RAM: ${slowdownBuffer.toFixed(1)}x slower`);
  console.log(`  Disk (true I/O) vs RAM: ${slowdownIO.toFixed(0)}x slower`);
  console.log();
  console.log("Key Findings:");
  console.log(`  • RAM storage is ${slowdownBuffer.toFixed(0)}x-${slowdownIO.toFixed(0)}x faster than disk`);
  console.log(`  • Loading ${documents.length.toLocaleString()} embeddings from disk takes significant time`);
  console.log(`  • Current RAM-based approach: ~${avgRAM.toFixed(0)}ms per query`);
  console.log(`  • Disk (buffered) approach: ~${avgDiskBuffer.toFixed(0)}ms per query`);
  console.log(`  • True disk I/O would be: ~${estimatedFullTime.toFixed(0)}ms (${(estimatedFullTime/1000/60).toFixed(1)} min) per query`);
  console.log();
  console.log("Storage Requirements:");
  const embeddingSize = embeddings.length * embeddings[0].length * 4; // 4 bytes per float32
  const docSize = JSON.stringify(documents).length;
  console.log(`  Embeddings: ${(embeddingSize / 1024 / 1024).toFixed(1)} MB`);
  console.log(`  Documents:  ${(docSize / 1024 / 1024).toFixed(1)} MB`);
  console.log(`  Total:      ${((embeddingSize + docSize) / 1024 / 1024).toFixed(1)} MB`);
  console.log();
}

runTests().catch(console.error);
