#!/usr/bin/env node
/**
 * Pre-compute RAG Embeddings Script
 * 
 * Run this script once to download and pre-compute all embeddings.
 * After running this, the Next.js server will load embeddings instantly.
 * 
 * Usage: node scripts/precompute-rag.mjs
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { pipeline } from "@xenova/transformers";
import { extract } from "tar";
import { glob } from "glob";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.join(__dirname, "..");

// RAG URLs
const RAG_DOCS_URL =
  "https://freebucket.obs.sa-brazil-1.myhuaweicloud.com/huaweicloud-rag/archives/rag_docs.tar.gz";
const COMPREHENSIVE_URL =
  "https://freebucket.obs.sa-brazil-1.myhuaweicloud.com/huaweicloud-rag/archives/comprehensive_docs.tar.gz";

// Cache directory
const CACHE_DIR = path.join(PROJECT_ROOT, "rag_cache");
const RAG_CACHE_DIR = path.join(CACHE_DIR, "rag_docs");
const COMPREHENSIVE_CACHE_DIR = path.join(CACHE_DIR, "comprehensive_docs");
const EMBEDDINGS_FILE = path.join(CACHE_DIR, "embeddings.bin");
const DOCUMENTS_FILE = path.join(CACHE_DIR, "documents.json");

console.log("🚀 RAG Pre-computation Script");
console.log("==============================\n");

// Check if already computed
if (fs.existsSync(EMBEDDINGS_FILE) && fs.existsSync(DOCUMENTS_FILE)) {
  console.log("✅ Embeddings already exist!");
  const stats = fs.statSync(EMBEDDINGS_FILE);
  const docStats = fs.statSync(DOCUMENTS_FILE);
  console.log(`   Embeddings file: ${(stats.size / 1024 / 1024).toFixed(1)} MB`);
  console.log(`   Documents file: ${(docStats.size / 1024 / 1024).toFixed(1)} MB`);
  console.log("\n✨ Your server will start instantly with persisted embeddings!");
  process.exit(0);
}

const startTime = Date.now();

// Download file from URL
async function downloadFile(url, destPath) {
  console.log(`📥 Downloading ${path.basename(url)}...`);
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(
      `Failed to download ${url}: ${response.status} ${response.statusText}`
    );
  }

  const buffer = await response.arrayBuffer();
  fs.writeFileSync(destPath, Buffer.from(buffer));
  console.log(`   ✓ Downloaded (${(buffer.byteLength / 1024 / 1024).toFixed(1)} MB)`);
}

// Extract tar.gz archive
async function extractArchive(archivePath, destDir) {
  console.log(`📦 Extracting ${path.basename(archivePath)}...`);
  fs.mkdirSync(destDir, { recursive: true });

  await extract({
    file: archivePath,
    cwd: destDir,
    strip: 1,
  });

  console.log(`   ✓ Extracted to ${path.basename(destDir)}`);
}

// Extract metadata from file path and content
function extractMetadata(filePath, content) {
  const pathParts = filePath.split(path.sep);
  const dirName = pathParts[pathParts.length - 2] || "";

  let product = "Unknown";
  const productMatch = dirName.match(/^(ecs|vpc|obs|rds|elb|evs|ims|eip|cce|hss|modelarts|devcloud|dws)[\-_]?/i);
  if (productMatch) {
    product = productMatch[1].toUpperCase();
  } else {
    const filename = path.basename(filePath, ".md");
    if (filename.includes("ecs")) product = "ECS";
    else if (filename.includes("vpc")) product = "VPC";
    else if (filename.includes("obs")) product = "OBS";
    else if (filename.includes("rds")) product = "RDS";
    else if (filename.includes("elb")) product = "ELB";
    else if (filename.includes("evs")) product = "EVS";
    else if (filename.includes("ims")) product = "IMS";
    else if (filename.includes("eip")) product = "EIP";
    else if (filename.includes("cce")) product = "CCE";
  }

  let title = path.basename(filePath, ".md");
  const lines = content.split("\n");
  for (const line of lines.slice(0, 10)) {
    const headerMatch = line.match(/^#+\s*(.+)$/);
    if (headerMatch) {
      title = headerMatch[1].trim();
      break;
    }
  }

  const filename = path.basename(filePath, ".md");
  let sourceUrl = `https://support.huaweicloud.com/intl/en-us/${product.toLowerCase()}-faq/${filename}.html`;
  if (filePath.includes("api-") || filename.includes("api")) {
    sourceUrl = `https://support.huaweicloud.com/intl/en-us/api-${product.toLowerCase()}/${filename}.html`;
  }

  return { sourceUrl, title, product };
}

// Load documents from cache directories
async function loadDocuments() {
  const documents = [];
  const dirs = [RAG_CACHE_DIR, COMPREHENSIVE_CACHE_DIR];

  for (const dir of dirs) {
    if (!fs.existsSync(dir)) {
      console.log(`⚠️  Directory ${dir} does not exist, skipping...`);
      continue;
    }

    console.log(`📂 Loading documents from ${path.basename(dir)}...`);

    const pattern = path.join(dir, "**/*.{md,txt}");
    const files = await glob(pattern);

    console.log(`   Found ${files.length} files`);

    for (const file of files) {
      try {
        const content = fs.readFileSync(file, "utf8");
        const metadata = extractMetadata(file, content);

        documents.push({
          content: content.slice(0, 8000),
          source: metadata.sourceUrl,
          title: metadata.title,
          product: metadata.product,
        });
      } catch (err) {
        console.error(`   Error reading ${file}:`, err.message);
      }
    }
  }

  console.log(`\n📊 Loaded ${documents.length} total documents\n`);
  return documents;
}

// Build embeddings for documents
async function buildEmbeddings(documents) {
  console.log("🧠 Loading embedding model (Xenova/all-MiniLM-L6-v2)...");
  const pipe = await pipeline(
    "feature-extraction",
    "Xenova/all-MiniLM-L6-v2",
    { quantized: true }
  );
  console.log("   ✓ Model loaded\n");

  const embeddings = [];
  const batchSize = 32;
  const totalBatches = Math.ceil(documents.length / batchSize);

  console.log(`🔨 Building embeddings (${totalBatches} batches)...`);

  for (let i = 0; i < documents.length; i += batchSize) {
    const batch = documents.slice(i, i + batchSize);
    const batchNum = Math.floor(i / batchSize) + 1;

    // Show progress every 50 batches or at start/end
    if (batchNum % 50 === 0 || batchNum === 1 || batchNum === totalBatches) {
      const percent = Math.round((batchNum / totalBatches) * 100);
      process.stdout.write(`   Batch ${batchNum}/${totalBatches} (${percent}%)\r`);
    }

    const texts = batch.map((d) => d.content.slice(0, 512));

    const outputs = await pipe(texts, {
      pooling: "mean",
      normalize: true,
    });

    for (const output of outputs) {
      embeddings.push(output.data);
    }
  }

  console.log(`\n   ✓ Built ${embeddings.length} embeddings\n`);
  return embeddings;
}

// Save embeddings and documents to disk
function saveEmbeddingsToDisk(documents, embeddings) {
  console.log("💾 Saving to disk...");

  // Save documents as JSON
  fs.writeFileSync(DOCUMENTS_FILE, JSON.stringify(documents));
  const docStats = fs.statSync(DOCUMENTS_FILE);
  console.log(`   ✓ Documents: ${(docStats.size / 1024 / 1024).toFixed(1)} MB`);

  // Save embeddings as binary
  const embeddingDim = embeddings[0]?.length || 384;
  const bytesPerEmbedding = 4 + embeddingDim * 4;
  const totalSize = 4 + embeddings.length * bytesPerEmbedding;

  const buffer = Buffer.alloc(totalSize);
  let offset = 0;

  buffer.writeUInt32LE(embeddings.length, offset);
  offset += 4;

  for (const embedding of embeddings) {
    buffer.writeUInt32LE(embedding.length, offset);
    offset += 4;

    for (let i = 0; i < embedding.length; i++) {
      buffer.writeFloatLE(embedding[i], offset);
      offset += 4;
    }
  }

  fs.writeFileSync(EMBEDDINGS_FILE, buffer);
  const embStats = fs.statSync(EMBEDDINGS_FILE);
  console.log(`   ✓ Embeddings: ${(embStats.size / 1024 / 1024).toFixed(1)} MB\n`);
}

// Main function
async function main() {
  try {
    fs.mkdirSync(CACHE_DIR, { recursive: true });

    // Check if cache exists
    const cacheExists =
      fs.existsSync(RAG_CACHE_DIR) && fs.existsSync(COMPREHENSIVE_CACHE_DIR);

    if (!cacheExists) {
      console.log("📦 Downloading documentation archives...\n");

      const ragArchivePath = path.join(CACHE_DIR, "rag_docs.tar.gz");
      const comprehensiveArchivePath = path.join(
        CACHE_DIR,
        "comprehensive_docs.tar.gz"
      );

      await downloadFile(RAG_DOCS_URL, ragArchivePath);
      await downloadFile(COMPREHENSIVE_URL, comprehensiveArchivePath);

      console.log("\n📦 Extracting archives...\n");

      await extractArchive(ragArchivePath, RAG_CACHE_DIR);
      await extractArchive(comprehensiveArchivePath, COMPREHENSIVE_CACHE_DIR);

      // Clean up archive files
      try {
        fs.unlinkSync(ragArchivePath);
        fs.unlinkSync(comprehensiveArchivePath);
        console.log("🧹 Cleaned up archive files\n");
      } catch (e) {
        // Ignore cleanup errors
      }
    } else {
      console.log("📂 Using existing cached documents\n");
    }

    // Load documents
    const documents = await loadDocuments();

    if (documents.length === 0) {
      throw new Error("No documents loaded!");
    }

    // Build embeddings
    const embeddings = await buildEmbeddings(documents);

    // Save to disk
    saveEmbeddingsToDisk(documents, embeddings);

    const totalTime = Date.now() - startTime;
    const minutes = Math.floor(totalTime / 60000);
    const seconds = Math.floor((totalTime % 60000) / 1000);

    console.log("✅ Pre-computation complete!");
    console.log(`   Documents: ${documents.length}`);
    console.log(`   Embeddings: ${embeddings.length}`);
    console.log(`   Time: ${minutes}m ${seconds}s`);
    console.log("\n✨ Your Next.js server will now start instantly!");
    console.log("   Run: npm run dev");

  } catch (error) {
    console.error("\n❌ Error:", error.message);
    process.exit(1);
  }
}

main();
