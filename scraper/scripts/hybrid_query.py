#!/usr/bin/env python3
"""
Hybrid RAG Query Tool with BM25 + Vector Search (Optimized)
Uses caching and efficient keyword matching for improved relevance
"""

import sys
import os
import time
import argparse
import chromadb
from typing import List, Dict, Any, Tuple
import re
import pickle
import hashlib

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from scripts import thesaurus as thesaurus


# Configuration
CHROMA_DB_PATH = "/home/rag_cache/chroma_db"
COLLECTION_NAME = "huawei_docs"
TOP_K_DEFAULT = 5
VECTOR_WEIGHT = 0.7
BM25_WEIGHT = 0.3

# Cache for BM25 index
BM25_CACHE_DIR = "/home/rag_cache/bm25_cache"
os.makedirs(BM25_CACHE_DIR, exist_ok=True)


def tokenize(text: str) -> List[str]:
    """Tokenize text for BM25 indexing"""
    text = text.lower()
    tokens = re.findall(r'\b\w+\b', text)
    return tokens


def build_bm25_index(documents: List[str]):
    """Build BM25 index (lazy import to save startup time)"""
    from rank_bm25 import BM25Okapi
    
    tokenized_docs = [tokenize(doc) for doc in documents]
    bm25 = BM25Okapi(tokenized_docs)
    return bm25


def load_or_build_bm25_index(collection) -> Tuple[Any, List[str], List[Dict]]:
    """
    Load cached BM25 index or build new one
    Returns: (bm25_index, original_texts, metadata_list)
    """
    # Generate cache key from collection stats
    count = collection.count()
    cache_key = f"bm25_{count}_{COLLECTION_NAME}"
    cache_file = os.path.join(BM25_CACHE_DIR, f"{cache_key}.pkl")
    
    # Try loading from cache
    if os.path.exists(cache_file):
        try:
            with open(cache_file, 'rb') as f:
                data = pickle.load(f)
                if data["count"] == count:
                    print(f"Loaded BM25 index from cache ({cache_file})")
                    return data["bm25"], data["texts"], data["metadatas"]
        except Exception as e:
            print(f"Cache load failed: {e}, rebuilding...")
    
    # Build new index
    print("Building BM25 index...")
    results = collection.get(include=["documents", "metadatas"])
    documents = results["documents"]
    metadatas = results["metadatas"]
    
    bm25 = build_bm25_index(documents)
    
    # Cache the index
    cache_data = {
        "bm25": bm25,
        "texts": documents,
        "metadatas": metadatas,
        "count": count
    }
    with open(cache_file, 'wb') as f:
        pickle.dump(cache_data, f)
    
    print(f"Built and cached BM25 index ({len(documents)} documents)")
    return bm25, documents, metadatas


def compute_bm25_scores_direct(query: str, documents: List[str]) -> List[float]:
    """
    Compute BM25 scores directly without full indexing (faster for single query)
    Uses simplified TF-IDF approach
    """
    from collections import Counter
    
    query_tokens = set(tokenize(query))
    if not query_tokens:
        return [0.0] * len(documents)
    
    scores = []
    doc_freqs = Counter()
    
    # Count document frequencies
    for doc in documents:
        doc_tokens = set(tokenize(doc))
        for token in query_tokens:
            if token in doc_tokens:
                doc_freqs[token] += 1
    
    total_docs = len(documents)
    
    # Compute scores for each document
    for doc in documents:
        doc_tokens = tokenize(doc)
        doc_len = len(doc_tokens)
        if doc_len == 0:
            scores.append(0.0)
            continue
        
        score = 0.0
        for token in query_tokens:
            if token in doc_tokens:
                # TF component
                tf = doc_tokens.count(token) / doc_len
                
                # IDF component (with smoothing)
                df = doc_freqs.get(token, 1)
                idf = (total_docs - df + 0.5) / (df + 0.5)
                idf = max(0.1, idf)  # Avoid negative/zero
                
                score += tf * idf
        
        scores.append(score)
    
    # Normalize to 0-1
    max_score = max(scores) if scores else 1.0
    if max_score == 0:
        return [0.0] * len(documents)
    
    return [s / max_score for s in scores]


def hybrid_search(
    collection,
    query: str,
    top_k: int = 5,
    vector_weight: float = VECTOR_WEIGHT,
    bm25_weight: float = BM25_WEIGHT,
    use_bm25: bool = True
) -> List[Dict[str, Any]]:
    """
    Perform hybrid search combining vector and BM25 scores
    """
    # Expand query for semantic search
    expanded_query = thesaurus.expand_query(query)
    
    # Vector search - get more results for reranking
    vector_results = collection.query(
        query_texts=[expanded_query],
        n_results=min(top_k * 5, 100)  # Increased to top_k * 5 for better service boosting
    )
    
    if not vector_results or not vector_results["documents"] or not vector_results["documents"][0]:
        return []
    
    vector_ids = vector_results["ids"][0]
    vector_docs = vector_results["documents"][0]
    vector_metas = vector_results["metadatas"][0] if vector_results["metadatas"] else []
    vector_dists = vector_results["distances"][0] if vector_results["distances"] else []
    
    # Compute BM25 scores for the retrieved documents
    bm25_scores = [0.0] * len(vector_docs)
    if use_bm25:
        bm25_scores = compute_bm25_scores_direct(query, vector_docs)
    
    # Combine results
    combined_scores = []
    
    for i, (doc_id, text, metadata, distance) in enumerate(zip(vector_ids, vector_docs, vector_metas, vector_dists)):
        vector_score = 1 - distance  # Convert distance to similarity
        bm25_score = bm25_scores[i]
        
        # Get boosts
        service = metadata.get("service", "") if metadata else ""
        doc_type = metadata.get("type", "") if metadata else ""
        service_boost = thesaurus.get_service_boost(query, service)
        doc_type_boost = thesaurus.get_document_type_boost(query, doc_type)
        
        # Calculate combined score
        combined_score = (
            vector_score * vector_weight +
            bm25_score * bm25_weight
        ) * service_boost * doc_type_boost
        
        combined_scores.append({
            "id": doc_id,
            "text": text,
            "metadata": metadata if metadata else {},
            "vector_score": vector_score,
            "bm25_score": bm25_score,
            "service_boost": service_boost,
            "doc_type_boost": doc_type_boost,
            "combined_score": combined_score
        })
    
    # Sort by combined score
    combined_scores.sort(key=lambda x: x["combined_score"], reverse=True)
    
    # Return top-k
    return combined_scores[:top_k]


def format_results(results: List[Dict], show_details: bool = False) -> str:
    """Format search results for display"""
    if not results:
        return "No results found."
    
    output = []
    for i, result in enumerate(results, 1):
        metadata = result["metadata"]
        service = metadata.get("service", "unknown")
        header = metadata.get("header", "No section")
        combined_score = result["combined_score"]
        
        output.append(f"\n{'='*80}")
        output.append(f"Result {i} (Score: {combined_score:.3f})")
        output.append(f"Service: {service}")
        output.append(f"Section: {header}")
        
        if show_details:
            output.append(f"  Vector Score: {result['vector_score']:.3f}")
            output.append(f"  BM25 Score: {result['bm25_score']:.3f}")
            output.append(f"  Service Boost: {result['service_boost']:.2f}")
            output.append(f"  Doc Type Boost: {result['doc_type_boost']:.2f}")
        
        # Show first 500 chars of content
        text = result["text"]
        if len(text) > 500:
            text = text[:500] + "..."
        output.append(f"\nContent:\n{text}")
    
    return "\n".join(output)


def main():
    parser = argparse.ArgumentParser(description="Hybrid RAG Query Tool (BM25 + Vector)")
    parser.add_argument("query", help="Search query")
    parser.add_argument("--top-k", type=int, default=TOP_K_DEFAULT, help="Number of results to return")
    parser.add_argument("--vector-weight", type=float, default=VECTOR_WEIGHT, help="Vector search weight (0-1)")
    parser.add_argument("--bm25-weight", type=float, default=BM25_WEIGHT, help="BM25 search weight (0-1)")
    parser.add_argument("--no-bm25", action="store_true", help="Disable BM25 (vector search only)")
    parser.add_argument("--details", action="store_true", help="Show detailed scoring breakdown")
    parser.add_argument("--quiet", action="store_true", help="Only show results, no progress info")
    
    args = parser.parse_args()
    
    if args.quiet:
        import logging
        logging.disable(logging.CRITICAL)
    else:
        print(f"🔍 Hybrid Search: {args.query}")
        print(f"   Top-K: {args.top_k}")
        print(f"   Weights: Vector={args.vector_weight}, BM25={args.bm25_weight}")
        print()
    
    # Load ChromaDB
    if not args.quiet:
        print("Loading ChromaDB...")
    start_time = time.time()
    client = chromadb.PersistentClient(path=CHROMA_DB_PATH)
    collection = client.get_collection(name=COLLECTION_NAME)
    load_time = time.time() - start_time
    
    if not args.quiet:
        print(f"✓ DB loaded ({load_time:.2f}s)")
        print()
    
    # Perform search
    if not args.quiet:
        print("Searching...")
    start_time = time.time()
    
    results = hybrid_search(
        collection,
        args.query,
        top_k=args.top_k,
        vector_weight=args.vector_weight,
        bm25_weight=args.bm25_weight,
        use_bm25=not args.no_bm25
    )
    
    search_time = time.time() - start_time
    
    if not args.quiet:
        print(f"✓ Search complete ({search_time:.3f}s)")
        print()
    
    # Display results
    print(format_results(results, show_details=args.details))
    
    # Summary
    if not args.quiet:
        print(f"\n{'='*80}")
        print(f"Total results: {len(results)}")
        print(f"Query: {args.query}")
        print(f"Time: {search_time:.3f}s")
        print(f"Vector weight: {args.vector_weight}, BM25 weight: {args.bm25_weight}")


if __name__ == "__main__":
    main()