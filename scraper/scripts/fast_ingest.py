#!/usr/bin/env python3
"""
Fast RAG Document Processor
Uses sentence-transformers with multiprocessing for efficient batch embedding
"""

import os
import sys
import json
import glob
import time
import re
import hashlib
from pathlib import Path
from dataclasses import dataclass, asdict
from typing import List, Dict, Tuple, Optional
from concurrent.futures import ProcessPoolExecutor, as_completed
import multiprocessing
from tqdm import tqdm
import chromadb
from sentence_transformers import SentenceTransformer
import numpy as np

# Configuration
CHROMA_DB_PATH = "/home/rag_cache/chroma_db"
DOCS_PATH = "/home/rag_cache/clean_docs"
COLLECTION_NAME = "huawei_docs"
MODEL_NAME = "all-MiniLM-L6-v2"
BATCH_SIZE = 256  # Process 256 chunks at once
MAX_CHUNK_SIZE = 1000
MIN_CHUNK_SIZE = 100
TARGET_CHUNK_SIZE = 500
NUM_WORKERS = max(1, multiprocessing.cpu_count() - 1)

@dataclass
class DocumentChunk:
    id: str
    content: str
    service: str
    page_id: str
    headers: List[str]
    url: str
    position: int
    token_count: int

def simple_tokenize(text: str) -> List[str]:
    """Simple tokenization for length estimation"""
    return text.replace(r'[^\w\s]', ' ').split()

def extract_headers(content: str) -> List[Tuple[int, str, int]]:
    """Extract markdown headers with their positions"""
    headers = []
    pos = 0
    for line in content.split('\n'):
        match = re.match(r'^(#{1,6})\s+(.+)$', line)
        if match:
            headers.append((len(match.group(1)), match.group(2).strip(), pos))
        pos += len(line) + 1
    return headers

def split_by_headers(content: str, headers: List[Tuple[int, str, int]]) -> List[Tuple[List[Tuple[int, str]], str]]:
    """Split content by headers into sections"""
    if not headers:
        return [([], content.strip())]
    
    sections = []
    header_stack = []
    
    for i, (level, text, position) in enumerate(headers):
        # Update header stack
        while header_stack and header_stack[-1][0] >= level:
            header_stack.pop()
        header_stack.append((level, text))
        
        # Find content for this section
        start = content.find(text, position) + len(text)
        end = headers[i + 1][2] if i + 1 < len(headers) else len(content)
        section_content = content[start:end].strip()
        
        if section_content:
            header_text = '\n'.join(['#' * h[0] + ' ' + h[1] for h in header_stack])
            sections.append((header_stack.copy(), header_text + '\n\n' + section_content))
    
    return sections if sections else [([], content.strip())]

def split_large_section(headers: List[Tuple[int, str]], content: str, start_pos: int, 
                       service: str, page_id: str, url: str) -> List[DocumentChunk]:
    """Split large sections into smaller chunks"""
    chunks = []
    paragraphs = re.split(r'\n\n+', content)
    
    current_content = ""
    current_tokens = 0
    position = start_pos
    
    for para in paragraphs:
        para_tokens = len(simple_tokenize(para))
        
        if current_tokens + para_tokens > MAX_CHUNK_SIZE and current_tokens > 0:
            # Save current chunk - ID will be set by caller
            chunks.append(DocumentChunk(
                id="",  # Will be set by caller
                content=re.sub(r'\n{3,}', '\n\n', re.sub(r'\s+', ' ', current_content)).strip(),
                service=service,
                page_id=page_id,
                headers=[h[1] for h in headers],
                url=url,
                position=position,
                token_count=current_tokens
            ))
            current_content = para
            current_tokens = para_tokens
            position += 1
        else:
            current_content += ('\n\n' if current_content else '') + para
            current_tokens += para_tokens
    
    # Don't forget last chunk
    if current_tokens >= MIN_CHUNK_SIZE:
        chunks.append(DocumentChunk(
            id="",  # Will be set by caller
            content=re.sub(r'\n{3,}', '\n\n', re.sub(r'\s+', ' ', current_content)).strip(),
            service=service,
            page_id=page_id,
            headers=[h[1] for h in headers],
            url=url,
            position=position,
            token_count=current_tokens
        ))
    
    return chunks

def generate_chunk_id(file_path: str, content: str, index: int) -> str:
    """Generate a globally unique chunk ID"""
    # Create a hash from file path + content hash + index
    path_hash = hashlib.md5(file_path.encode()).hexdigest()[:8]
    content_sample = content[:100] if content else ""
    content_hash = hashlib.md5(content_sample.encode()).hexdigest()[:8]
    return f"chunk_{path_hash}_{content_hash}_{index}"

def chunk_document(file_path: str) -> List[DocumentChunk]:
    """Process a single document into chunks"""
    try:
        # Read file
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
        
        # Parse metadata
        relative_path = os.path.relpath(file_path, DOCS_PATH)
        service = relative_path.split(os.sep)[0]
        page_id = Path(file_path).stem
        
        meta_path = file_path.replace('.md', '.json')
        metadata = {}
        if os.path.exists(meta_path):
            with open(meta_path, 'r', encoding='utf-8') as f:
                metadata = json.load(f)
        
        url = metadata.get('url', '')
        
        # Extract headers and split
        headers = extract_headers(content)
        sections = split_by_headers(content, headers)
        
        chunks = []
        chunk_index = 0
        
        for header_stack, section_content in sections:
            tokens = len(simple_tokenize(section_content))
            
            if tokens < MIN_CHUNK_SIZE:
                continue
            
            if tokens > MAX_CHUNK_SIZE:
                # Split large section
                sub_chunks = split_large_section(header_stack, section_content, chunk_index, service, page_id, url)
                for chunk in sub_chunks:
                    chunk.id = generate_chunk_id(file_path, chunk.content, chunk_index)
                    chunk_index += 1
                chunks.extend(sub_chunks)
            else:
                # Create single chunk
                header_text = '\n'.join(['#' * h[0] + ' ' + h[1] for h in header_stack])
                clean_content = re.sub(r'\n{3,}', '\n\n', re.sub(r'\s+', ' ', header_text + '\n\n' + section_content)).strip()
                
                chunks.append(DocumentChunk(
                    id=generate_chunk_id(file_path, clean_content, chunk_index),
                    content=clean_content,
                    service=service,
                    page_id=page_id,
                    headers=[h[1] for h in header_stack],
                    url=url,
                    position=chunk_index,
                    token_count=tokens
                ))
                chunk_index += 1
        
        return chunks
        
    except Exception as e:
        print(f"Error processing {file_path}: {e}")
        return []

def process_batch(args: Tuple[List[str], int]) -> Tuple[List[DocumentChunk], int, int]:
    """Process a batch of files and return chunks"""
    file_batch, worker_id = args
    chunks = []
    processed = 0
    failed = 0
    
    for file_path in file_batch:
        try:
            file_chunks = chunk_document(file_path)
            chunks.extend(file_chunks)
            processed += 1
        except Exception as e:
            failed += 1
    
    return chunks, processed, failed

def main():
    print("=" * 80)
    print("RAG Fast Document Processor")
    print("=" * 80)
    print(f"Model: {MODEL_NAME}")
    print(f"Workers: {NUM_WORKERS}")
    print(f"Batch size: {BATCH_SIZE}")
    print(f"ChromaDB: {CHROMA_DB_PATH}")
    print()
    
    # Find all documents
    print("Scanning for documents...")
    doc_pattern = os.path.join(DOCS_PATH, "**", "*.md")
    all_files = glob.glob(doc_pattern, recursive=True)
    print(f"Found {len(all_files):,} documents")
    print()
    
    # Group by service for better progress tracking
    service_files = {}
    for f in all_files:
        service = os.path.relpath(f, DOCS_PATH).split(os.sep)[0]
        if service not in service_files:
            service_files[service] = []
        service_files[service].append(f)
    
    print(f"Found {len(service_files)} services")
    print()
    
    # Initialize ChromaDB
    print("Initializing ChromaDB...")
    client = chromadb.PersistentClient(path=CHROMA_DB_PATH)
    
    # Create or get collection
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
    
    # Load embedding model
    print(f"Loading embedding model: {MODEL_NAME}...")
    model = SentenceTransformer(MODEL_NAME)
    print("Model loaded!")
    print()
    
    # Process all documents
    start_time = time.time()
    total_chunks = 0
    total_processed = 0
    total_failed = 0
    all_chunks = []
    
    print("Processing documents...")
    print()
    
    # Process each service
    for service_idx, (service, files) in enumerate(sorted(service_files.items()), 1):
        print(f"[{service_idx}/{len(service_files)}] Service: {service} ({len(files)} docs)")
        
        # Create batches for parallel processing
        batches = [files[i:i+100] for i in range(0, len(files), 100)]
        service_chunks = []
        
        # Process batches
        with ProcessPoolExecutor(max_workers=NUM_WORKERS) as executor:
            futures = {executor.submit(process_batch, (batch, i)): i for i, batch in enumerate(batches)}
            
            for future in tqdm(as_completed(futures), total=len(batches), desc="  Chunking"):
                chunks, processed, failed = future.result()
                service_chunks.extend(chunks)
                total_processed += processed
                total_failed += failed
        
        # Generate embeddings in batches
        if service_chunks:
            print(f"  Generating embeddings for {len(service_chunks)} chunks...")
            
            texts = [chunk.content for chunk in service_chunks]
            
            # Process in batches
            for i in tqdm(range(0, len(texts), BATCH_SIZE), desc="  Embedding"):
                batch_texts = texts[i:i+BATCH_SIZE]
                batch_chunks = service_chunks[i:i+BATCH_SIZE]
                
                # Generate embeddings
                embeddings = model.encode(batch_texts, show_progress_bar=False, convert_to_numpy=True)
                
                # Add to ChromaDB
                collection.add(
                    ids=[c.id for c in batch_chunks],
                    documents=[c.content for c in batch_chunks],
                    embeddings=embeddings.tolist(),
                    metadatas=[{
                        "service": c.service,
                        "page_id": c.page_id,
                        "headers": json.dumps(c.headers),
                        "url": c.url,
                        "position": c.position,
                        "token_count": c.token_count
                    } for c in batch_chunks]
                )
            
            total_chunks += len(service_chunks)
        
        print(f"  ✓ Service complete: {len(service_chunks)} chunks")
        print()
    
    elapsed = time.time() - start_time
    
    # Print summary
    print("=" * 80)
    print("PROCESSING COMPLETE")
    print("=" * 80)
    print(f"Documents processed: {total_processed:,}")
    print(f"Documents failed: {total_failed:,}")
    print(f"Total chunks created: {total_chunks:,}")
    print(f"Time elapsed: {elapsed:.1f}s ({elapsed/60:.1f} minutes)")
    print(f"Docs/sec: {total_processed/elapsed:.1f}")
    print(f"Chunks/doc: {total_chunks/total_processed:.1f}" if total_processed > 0 else "N/A")
    print()
    
    # Get collection stats
    count = collection.count()
    print(f"Collection size: {count:,} vectors")
    print()
    
    # Save stats
    stats = {
        "total_documents": total_processed,
        "total_chunks": total_chunks,
        "failed_documents": total_failed,
        "elapsed_seconds": elapsed,
        "docs_per_second": total_processed / elapsed if elapsed > 0 else 0,
        "collection_size": count
    }
    
    os.makedirs(os.path.dirname(CHROMA_DB_PATH), exist_ok=True)
    with open(os.path.join(os.path.dirname(CHROMA_DB_PATH), "rag_stats.json"), "w") as f:
        json.dump(stats, f, indent=2)
    
    print("Stats saved to rag_stats.json")
    print()
    print("✅ RAG ingestion complete!")

if __name__ == "__main__":
    main()
