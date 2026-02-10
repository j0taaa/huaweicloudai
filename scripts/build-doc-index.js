// Build document index for memory-efficient RAG loading
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const SPLIT_DIR = path.join(process.cwd(), 'rag_cache', 'split_docs');
const INDEX_FILE = path.join(process.cwd(), 'rag_cache', 'document-index.json.gz');

async function buildIndex() {
  console.log('Building document index...');
  
  const manifestData = JSON.parse(
    zlib.gunzipSync(fs.readFileSync(path.join(SPLIT_DIR, 'manifest.json.gz'))).toString()
  );
  
  const index = {
    totalDocuments: manifestData.total_documents,
    documents: {} // id -> { part, index, product, title, category, source }
  };
  
  for (let partNum = 1; partNum <= manifestData.parts; partNum++) {
    const partFile = path.join(SPLIT_DIR, `documents_part_${partNum}.json.gz`);
    console.log(`Processing part ${partNum}...`);
    
    const compressed = fs.readFileSync(partFile);
    const jsonStr = zlib.gunzipSync(compressed).toString('utf8');
    const documents = JSON.parse(jsonStr);
    
    documents.forEach((doc, idx) => {
      index.documents[doc.id] = {
        part: partNum,
        index: idx,
        product: doc.product || '',
        title: doc.title || '',
        category: doc.category || '',
        source: doc.source || ''
      };
    });
    
    console.log(`Indexed ${documents.length} documents from part ${partNum}`);
  }
  
  // Compress and save index
  const indexJson = JSON.stringify(index);
  const compressed = zlib.gzipSync(indexJson);
  fs.writeFileSync(INDEX_FILE, compressed);
  
  console.log(`Index built: ${Object.keys(index.documents).length} documents`);
  console.log(`Index size: ${(compressed.length / 1024 / 1024).toFixed(2)} MB`);
}

buildIndex().catch(console.error);
