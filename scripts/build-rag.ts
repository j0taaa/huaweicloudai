#!/usr/bin/env node
/**
 * Build RAG Embeddings from scraped documents
 */
import { pipeline } from '@xenova/transformers';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.join(__dirname, '..');

// Paths
const CLEAN_DOCS_DIR = path.join(PROJECT_ROOT, 'rag_cache', 'clean_docs');
const CACHE_DIR = path.join(PROJECT_ROOT, 'rag_cache');
const EMBEDDINGS_FILE = path.join(CACHE_DIR, 'embeddings.bin');
const DOCUMENTS_FILE = path.join(CACHE_DIR, 'documents.json');

interface CleanDoc {
  metadata: {
    id: string;
    url: string;
    title: string;
    service: string;
    category: string;
    handbookCode: string;
    contentLength: number;
    processedAt: string;
  };
  content: string;
}

interface RagDocument {
  id: string;
  content: string;
  source: string;
  title: string;
  product: string;
  category: string;
}

console.log('🔨 Huawei Cloud RAG Builder\n');

async function loadDocuments(): Promise<CleanDoc[]> {
  console.log('📂 Loading documents from clean_docs...');
  
  const docs: CleanDoc[] = [];
  
  if (!fs.existsSync(CLEAN_DOCS_DIR)) {
    console.error('❌ Clean docs directory not found. Run scraper first!');
    process.exit(1);
  }

  const services = fs.readdirSync(CLEAN_DOCS_DIR)
    .filter(name => {
      const fullPath = path.join(CLEAN_DOCS_DIR, name);
      return fs.statSync(fullPath).isDirectory();
    });

  console.log(`   Found ${services.length} services`);

  for (const service of services) {
    const serviceDir = path.join(CLEAN_DOCS_DIR, service);
    const files = fs.readdirSync(serviceDir)
      .filter(name => name.endsWith('.md'));

    for (const file of files) {
      const pageId = file.replace('.md', '');
      const mdPath = path.join(serviceDir, file);
      const metaPath = path.join(serviceDir, `${pageId}.json`);

      try {
        const content = fs.readFileSync(mdPath, 'utf8');
        const metadata = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
        
        docs.push({ content, metadata });
      } catch (error) {
        console.warn(`   Warning: Could not load ${service}/${pageId}`);
      }
    }
  }

  console.log(`   ✓ Loaded ${docs.length} documents\n`);
  return docs;
}

async function buildEmbeddings(docs: CleanDoc[]): Promise<Float32Array[]> {
  console.log('🧠 Loading embedding model (Xenova/all-MiniLM-L6-v2)...');
  
  const pipe = await pipeline(
    'feature-extraction',
    'Xenova/all-MiniLM-L6-v2',
    { quantized: true }
  );
  
  console.log('   ✓ Model loaded\n');

  const embeddings: Float32Array[] = [];
  const batchSize = 32;
  const totalBatches = Math.ceil(docs.length / batchSize);

  console.log(`🔨 Building embeddings (${totalBatches} batches)...`);

  for (let i = 0; i < docs.length; i += batchSize) {
    const batch = docs.slice(i, i + batchSize);
    const batchNum = Math.floor(i / batchSize) + 1;

    if (batchNum % 50 === 0 || batchNum === 1 || batchNum === totalBatches) {
      const percent = Math.round((batchNum / totalBatches) * 100);
      process.stdout.write(`   Batch ${batchNum}/${totalBatches} (${percent}%)\r`);
    }

    // Use first 2000 chars for embeddings (~512 tokens)
    const texts = batch.map(d => d.content.slice(0, 2000));

    const outputs = await pipe(texts, {
      pooling: 'mean',
      normalize: true
    });

    for (const output of outputs) {
      embeddings.push(output.data as Float32Array);
    }
  }

  console.log(`\n   ✓ Built ${embeddings.length} embeddings\n`);
  return embeddings;
}

function saveRagData(docs: CleanDoc[], embeddings: Float32Array[]): void {
  console.log('💾 Saving RAG data...');

  // Convert to RAG document format (store full content)
  const ragDocs: RagDocument[] = docs.map(d => ({
    id: d.metadata.id,
    content: d.content,  // FULL content, not truncated
    source: d.metadata.url,
    title: d.metadata.title,
    product: d.metadata.service.toUpperCase(),
    category: d.metadata.category
  }));

  // Save documents
  fs.writeFileSync(DOCUMENTS_FILE, JSON.stringify(ragDocs));
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

async function main() {
  const startTime = Date.now();

  try {
    // 1. Load documents
    const docs = await loadDocuments();

    if (docs.length === 0) {
      console.error('❌ No documents found!');
      process.exit(1);
    }

    // 2. Build embeddings
    const embeddings = await buildEmbeddings(docs);

    // 3. Save
    saveRagData(docs, embeddings);

    // 4. Summary
    const duration = Date.now() - startTime;
    const minutes = Math.floor(duration / 60000);
    const seconds = Math.floor((duration % 60000) / 1000);

    console.log('✅ RAG Build Complete!');
    console.log('='.repeat(50));
    console.log(`Documents: ${docs.length}`);
    console.log(`Embeddings: ${embeddings.length}`);
    console.log(`Time: ${minutes}m ${seconds}s`);
    console.log('='.repeat(50));

  } catch (error) {
    console.error('\n❌ Error:', error);
    process.exit(1);
  }
}

main();
