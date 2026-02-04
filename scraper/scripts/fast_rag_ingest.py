#!/usr/bin/env python3
"""
Fast RAG Ingestion Script
Processes markdown files and stores embeddings in ChromaDB
Optimized for speed with multiprocessing and batching
"""

import os
import re
import json
import time
import uuid
from pathlib import Path
from datetime import datetime
from typing import List, Dict, Tuple, Any
from dataclasses import dataclass, field
from multiprocessing import Pool, cpu_count
from functools import partial

from tqdm import tqdm
from sentence_transformers import SentenceTransformer
import chromadb
from chromadb.config import Settings


@dataclass
class Chunk:
    """Represents a document chunk"""
    id: str
    text: str
    metadata: Dict[str, Any]
    source_file: str
    header: str


@dataclass
class ProcessingStats:
    """Tracks processing statistics"""
    start_time: float = field(default_factory=time.time)
    end_time: float = None
    total_files: int = 0
    processed_files: int = 0
    failed_files: int = 0
    total_chunks: int = 0
    total_tokens: int = 0
    errors: List[str] = field(default_factory=list)
    
    def to_dict(self) -> Dict:
        return {
            "start_time": datetime.fromtimestamp(self.start_time).isoformat(),
            "end_time": datetime.fromtimestamp(self.end_time).isoformat() if self.end_time else None,
            "duration_seconds": self.duration(),
            "total_files": self.total_files,
            "processed_files": self.processed_files,
            "failed_files": self.failed_files,
            "total_chunks": self.total_chunks,
            "total_tokens": self.total_tokens,
            "error_count": len(self.errors),
            "errors": self.errors[:10]  # Limit errors in output
        }
    
    def duration(self) -> float:
        end = self.end_time or time.time()
        return round(end - self.start_time, 2)
    
    def save(self, path: str):
        with open(path, 'w') as f:
            json.dump(self.to_dict(), f, indent=2)


def get_markdown_files(source_dir: str) -> List[Path]:
    """Get all markdown files from source directory"""
    source_path = Path(source_dir)
    files = list(source_path.rglob("*.md"))
    return sorted(files)


def clean_text(text: str) -> str:
    """Clean and normalize text"""
    # Remove excessive whitespace
    text = re.sub(r'\n{3,}', '\n\n', text)
    # Remove leading/trailing whitespace from lines
    lines = [line.strip() for line in text.split('\n')]
    return '\n'.join(lines)


def chunk_by_headers(content: str, file_path: str, min_chunk_size: int = 100) -> List[Chunk]:
    """
    Split markdown content by headers into chunks
    Returns list of Chunk objects
    """
    chunks = []
    
    # Pattern to match markdown headers (# ## ###)
    header_pattern = re.compile(r'^(#{1,6}\s+.+)$', re.MULTILINE)
    
    # Find all headers and their positions
    headers = list(header_pattern.finditer(content))
    
    if not headers:
        # No headers found, treat entire document as one chunk
        cleaned = clean_text(content)
        if len(cleaned) >= min_chunk_size:
            chunk = Chunk(
                id=str(uuid.uuid4()),
                text=cleaned,
                metadata={
                    "source": file_path,
                    "header": "",
                    "section": "full_document"
                },
                source_file=file_path,
                header=""
            )
            chunks.append(chunk)
        return chunks
    
    # Process each section
    for i, header_match in enumerate(headers):
        header = header_match.group(1)
        header_text = header.lstrip('#').strip()
        start_pos = header_match.start()
        end_pos = headers[i + 1].start() if i + 1 < len(headers) else len(content)
        
        section_content = content[start_pos:end_pos]
        cleaned = clean_text(section_content)
        
        if len(cleaned) >= min_chunk_size:
            chunk = Chunk(
                id=str(uuid.uuid4()),
                text=cleaned,
                metadata={
                    "source": file_path,
                    "header": header_text,
                    "section": f"section_{i}",
                    "level": header.count('#')
                },
                source_file=file_path,
                header=header_text
            )
            chunks.append(chunk)
    
    return chunks


def process_single_file(file_path: Path, source_dir: str) -> Tuple[List[Chunk], str]:
    """
    Process a single markdown file
    Returns (chunks, error_message)
    """
    try:
        # Read file
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
        
        # Get relative path for metadata
        rel_path = str(file_path.relative_to(source_dir))
        
        # Skip very short or empty files
        if len(content.strip()) < 50:
            return [], None
        
        # Chunk by headers
        chunks = chunk_by_headers(content, rel_path)
        
        return chunks, None
        
    except Exception as e:
        return [], f"Error processing {file_path}: {str(e)}"


def process_files_batch(file_batch: List[Path], source_dir: str) -> Tuple[List[Chunk], List[str]]:
    """Process a batch of files and return all chunks and errors"""
    all_chunks = []
    errors = []
    
    for file_path in file_batch:
        chunks, error = process_single_file(file_path, source_dir)
        all_chunks.extend(chunks)
        if error:
            errors.append(error)
    
    return all_chunks, errors


def batch_generator(items: List[Any], batch_size: int):
    """Generate batches from a list"""
    for i in range(0, len(items), batch_size):
        yield items[i:i + batch_size]


def main():
    # Configuration
    SOURCE_DIR = "/home/rag_cache/clean_docs"
    CHROMA_DIR = "/home/rag_cache/chroma_db"
    STATS_FILE = "/home/rag_cache/ingestion_stats.json"
    
    BATCH_SIZE_FILES = 100  # Process files in batches
    BATCH_SIZE_CHUNKS = 512  # Embed and insert in batches
    CHUNKING_WORKERS = max(1, cpu_count() - 1)  # Leave one core free
    
    print(f"🚀 Fast RAG Ingestion Script")
    print(f"   Source: {SOURCE_DIR}")
    print(f"   Target: {CHROMA_DIR}")
    print(f"   Workers: {CHUNKING_WORKERS}")
    print(f"   Batch sizes: {BATCH_SIZE_FILES} files, {BATCH_SIZE_CHUNKS} chunks")
    print()
    
    # Initialize stats
    stats = ProcessingStats()
    
    # Step 1: Get all markdown files
    print("📁 Scanning for markdown files...")
    md_files = get_markdown_files(SOURCE_DIR)
    stats.total_files = len(md_files)
    print(f"   Found {stats.total_files:,} markdown files")
    
    if not md_files:
        print("❌ No markdown files found!")
        return
    
    # Step 2: Initialize ChromaDB
    print("\n💾 Initializing ChromaDB...")
    client = chromadb.PersistentClient(
        path=CHROMA_DIR,
        settings=Settings(
            anonymized_telemetry=False,
            allow_reset=True
        )
    )
    
    # Get or create collection
    collection = client.get_or_create_collection(
        name="documents",
        metadata={"hnsw:space": "cosine"}
    )
    
    # Clear existing data if needed
    existing_count = collection.count()
    if existing_count > 0:
        print(f"   Found {existing_count:,} existing documents")
        print("   Clearing existing collection...")
        client.delete_collection("documents")
        collection = client.create_collection(
            name="documents",
            metadata={"hnsw:space": "cosine"}
        )
    
    # Step 3: Initialize embedding model
    print("\n🤖 Loading sentence-transformers model...")
    model = SentenceTransformer('all-MiniLM-L6-v2')
    print(f"   Model loaded: all-MiniLM-L6-v2")
    print(f"   Embedding dimension: {model.get_sentence_embedding_dimension()}")
    
    # Step 4: Process files with multiprocessing
    print(f"\n📄 Processing files with {CHUNKING_WORKERS} workers...")
    all_chunks = []
    
    # Split files into batches for parallel processing
    file_batches = list(batch_generator(md_files, BATCH_SIZE_FILES))
    
    # Use multiprocessing for chunking
    process_func = partial(process_files_batch, source_dir=SOURCE_DIR)
    
    with Pool(processes=CHUNKING_WORKERS) as pool:
        results = list(tqdm(
            pool.imap(process_func, file_batches),
            total=len(file_batches),
            desc="   Chunking",
            unit="batch"
        ))
    
    # Collect results
    for chunks, errors in results:
        all_chunks.extend(chunks)
        stats.errors.extend(errors)
        if not errors:
            stats.processed_files += len(chunks)  # Approximate
    
    stats.total_chunks = len(all_chunks)
    stats.total_tokens = sum(len(chunk.text.split()) for chunk in all_chunks)
    
    print(f"   ✓ Created {stats.total_chunks:,} chunks from {stats.total_files:,} files")
    if stats.errors:
        print(f"   ⚠️  Encountered {len(stats.errors)} errors")
    
    # Step 5: Generate embeddings in batches
    print(f"\n🔢 Generating embeddings in batches of {BATCH_SIZE_CHUNKS}...")
    
    chunk_batches = list(batch_generator(all_chunks, BATCH_SIZE_CHUNKS))
    all_embeddings = []
    
    for batch in tqdm(chunk_batches, desc="   Embedding", unit="batch"):
        texts = [chunk.text for chunk in batch]
        embeddings = model.encode(
            texts,
            batch_size=256,
            show_progress_bar=False,
            convert_to_numpy=True
        )
        all_embeddings.extend(embeddings)
    
    print(f"   ✓ Generated {len(all_embeddings):,} embeddings")
    
    # Step 6: Insert into ChromaDB in batches
    print(f"\n💿 Inserting into ChromaDB in batches of {BATCH_SIZE_CHUNKS}...")
    
    for i, batch in enumerate(tqdm(
        batch_generator(list(zip(all_chunks, all_embeddings)), BATCH_SIZE_CHUNKS),
        total=len(chunk_batches),
        desc="   Inserting",
        unit="batch"
    )):
        ids = [chunk.id for chunk, _ in batch]
        texts = [chunk.text for chunk, _ in batch]
        embeddings = [emb.tolist() for _, emb in batch]
        metadatas = [chunk.metadata for chunk, _ in batch]
        
        collection.add(
            ids=ids,
            documents=texts,
            embeddings=embeddings,
            metadatas=metadatas
        )
    
    # Step 7: Final stats
    stats.end_time = time.time()
    final_count = collection.count()
    
    print(f"\n✅ Ingestion complete!")
    print(f"   Total documents in DB: {final_count:,}")
    print(f"   Duration: {stats.duration():.1f} seconds")
    print(f"   Throughput: {final_count / stats.duration():.1f} chunks/sec")
    
    # Save stats
    stats.save(STATS_FILE)
    print(f"\n📝 Stats saved to: {STATS_FILE}")
    
    # Print summary
    print("\n📊 Summary:")
    for key, value in stats.to_dict().items():
        if key != "errors":
            print(f"   {key}: {value}")


if __name__ == "__main__":
    main()
