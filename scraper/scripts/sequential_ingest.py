#!/usr/bin/env python3
"""
Sequential RAG Document Processor
Processes all documents sequentially to avoid ChromaDB locking issues
"""

import os
import sys
import json
import glob
import time
import re
import hashlib
from pathlib import Path
from tqdm import tqdm
import chromadb
from sentence_transformers import SentenceTransformer

# Configuration
CHROMA_DB_PATH = "/home/rag_cache/chroma_db"
DOCS_PATH = "/home/rag_cache/clean_docs"
COLLECTION_NAME = "huawei_docs"
MODEL_NAME = "all-MiniLM-L6-v2"
BATCH_SIZE = 256
MAX_CHUNK_SIZE = 1500
MIN_CHUNK_SIZE = 200

def simple_tokenize(text):
    return text.replace(r'[^\w\s]', ' ').split()

def extract_headers(content):
    headers = []
    pos = 0
    for line in content.split('\n'):
        match = re.match(r'^(#{1,6})\s+(.+)$', line)
        if match:
            headers.append((len(match.group(1)), match.group(2).strip(), pos))
        pos += len(line) + 1
    return headers

def split_by_headers(content, headers):
    if not headers:
        return [([], content.strip())]
    
    sections = []
    header_stack = []
    
    for i, (level, text, position) in enumerate(headers):
        while header_stack and header_stack[-1][0] >= level:
            header_stack.pop()
        header_stack.append((level, text))
        
        start = content.find(text, position) + len(text)
        end = headers[i + 1][2] if i + 1 < len(headers) else len(content)
        section_content = content[start:end].strip()
        
        if section_content:
            header_text = '\n'.join(['#' * h[0] + ' ' + h[1] for h in header_stack])
            sections.append((header_stack.copy(), header_text + '\n\n' + section_content))
    
    return sections if sections else [([], content.strip())]

def chunk_document(file_path, service, page_id, url):
    """Process a single document into chunks"""
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
        
        headers = extract_headers(content)
        sections = split_by_headers(content, headers)
        
        chunks = []
        chunk_index = 0
        
        for header_stack, section_content in sections:
            tokens = len(simple_tokenize(section_content))
            
            if tokens < MIN_CHUNK_SIZE:
                continue
            
            # Just store the full section (no splitting for now to keep it simple)
            header_text = '\n'.join(['#' * h[0] + ' ' + h[1] for h in header_stack])
            clean_content = re.sub(r'\n{3,}', '\n\n', re.sub(r'\s+', ' ', header_text + '\n\n' + section_content)).strip()
            
            content_hash = hashlib.md5(clean_content[:100].encode()).hexdigest()[:8]
            path_hash = hashlib.md5(file_path.encode()).hexdigest()[:8]
            
            chunks.append({
                'id': f"chunk_{path_hash}_{content_hash}_{chunk_index}",
                'content': clean_content,
                'service': service,
                'page_id': page_id,
                'headers': json.dumps([h[1] for h in header_stack]),
                'url': url,
                'position': chunk_index,
                'token_count': tokens
            })
            chunk_index += 1
        
        return chunks
    except Exception as e:
        print(f"Error: {file_path}: {e}")
        return []

def main():
    print("=" * 80)
    print("RAG Sequential Document Processor")
    print("=" * 80)
    print(f"Model: {MODEL_NAME}")
    print(f"Batch size: {BATCH_SIZE}")
    print()
    
    # Find all documents
    print("Scanning for documents...")
    doc_pattern = os.path.join(DOCS_PATH, "**", "*.md")
    all_files = glob.glob(doc_pattern, recursive=True)
    print(f"Found {len(all_files):,} documents")
    print()
    
    # Group by service
    service_files = {}
    for f in all_files:
        relative_path = os.path.relpath(f, DOCS_PATH)
        service = relative_path.split(os.sep)[0]
        if service not in service_files:
            service_files[service] = []
        service_files[service].append(f)
    
    print(f"Found {len(service_files)} services")
    print()
    
    # Initialize ChromaDB
    print("Initializing ChromaDB...")
    client = chromadb.PersistentClient(path=CHROMA_DB_PATH)
    
    try:
        client.delete_collection(COLLECTION_NAME)
        print("Deleted existing collection")
    except:
        pass
    
    collection = client.create_collection(
        name=COLLECTION_NAME,
        metadata={"hnsw:space": "cosine"}
    )
    print(f"Collection '{COLLECTION_NAME}' created")
    print()
    
    # Load model
    print(f"Loading embedding model: {MODEL_NAME}...")
    model = SentenceTransformer(MODEL_NAME)
    print("Model loaded!")
    print()
    
    # Process all services
    start_time = time.time()
    total_chunks = 0
    total_processed = 0
    total_failed = 0
    
    print("Processing documents...")
    print()
    
    service_list = sorted(service_files.items())
    
    for service_idx, (service, files) in enumerate(service_list, 1):
        print(f"[{service_idx}/{len(service_list)}] Service: {service} ({len(files)} docs)")
        
        service_chunks = []
        
        # Process all files in service
        for file_path in tqdm(files, desc="  Chunking", leave=False):
            try:
                relative_path = os.path.relpath(file_path, DOCS_PATH)
                page_id = Path(file_path).stem
                
                # Load metadata
                meta_path = file_path.replace('.md', '.json')
                metadata = {}
                url = ''
                if os.path.exists(meta_path):
                    with open(meta_path, 'r', encoding='utf-8') as f:
                        metadata = json.load(f)
                        url = metadata.get('url', '')
                
                # Chunk document
                chunks = chunk_document(file_path, service, page_id, url)
                service_chunks.extend(chunks)
                total_processed += 1
            except Exception as e:
                total_failed += 1
                print(f"  Error: {file_path}: {e}")
        
        # Generate embeddings and add to ChromaDB
        if service_chunks:
            print(f"  Embedding {len(service_chunks)} chunks...")
            
            texts = [c['content'] for c in service_chunks]
            
            # Process in batches
            for i in tqdm(range(0, len(texts), BATCH_SIZE), desc="  Embedding", leave=False):
                batch_texts = texts[i:i+BATCH_SIZE]
                batch_chunks = service_chunks[i:i+BATCH_SIZE]
                
                # Generate embeddings
                embeddings = model.encode(batch_texts, show_progress_bar=False)
                
                # Add to ChromaDB
                collection.add(
                    ids=[c['id'] for c in batch_chunks],
                    documents=[c['content'] for c in batch_chunks],
                    embeddings=embeddings.tolist(),
                    metadatas=[{
                        "service": c['service'],
                        "page_id": c['page_id'],
                        "headers": c['headers'],
                        "url": c['url'],
                        "position": c['position'],
                        "token_count": c['token_count']
                    } for c in batch_chunks]
                )
            
            total_chunks += len(service_chunks)
            print(f"  ✓ Complete: {len(service_chunks)} chunks (total: {total_chunks})")
        
        print()
    
    elapsed = time.time() - start_time
    
    # Summary
    print("=" * 80)
    print("PROCESSING COMPLETE")
    print("=" * 80)
    print(f"Documents processed: {total_processed:,}")
    print(f"Documents failed: {total_failed:,}")
    print(f"Total chunks: {total_chunks:,}")
    print(f"Time elapsed: {elapsed:.1f}s ({elapsed/60:.1f} minutes)")
    
    # Get collection stats
    count = collection.count()
    print(f"Collection size: {count:,} vectors")
    
    # Save stats
    stats = {
        "total_documents": total_processed,
        "total_chunks": total_chunks,
        "failed_documents": total_failed,
        "elapsed_seconds": elapsed,
        "docs_per_second": total_processed / elapsed if elapsed > 0 else 0,
        "collection_size": count
    }
    
    with open(os.path.join(CHROMA_DB_PATH, "..", "ingestion_stats.json"), "w") as f:
        json.dump(stats, f, indent=2)
    
    print()
    print("✅ RAG ingestion complete!")

if __name__ == "__main__":
    main()
