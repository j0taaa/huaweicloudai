#!/usr/bin/env python3
"""
RAG Query System with Service Boosting and Relevance Optimization
"""

import chromadb
from sentence_transformers import SentenceTransformer
import sys
import math

# Configuration
CHROMA_DB_PATH = "/home/rag_cache/chroma_db"
COLLECTION_NAME = "huawei_docs"
MODEL_NAME = "all-MiniLM-L6-v2"

# Service relevance weights (boost for exact matches)
SERVICE_WEIGHTS = {
    'ecs': 2.0,
    'vpc': 2.0,
    'obs': 2.0,
    'evs': 2.0,
    'rds': 2.0,
    'elb': 2.0,
    'iam': 2.0,
    'cdn': 2.0,
    'vpn': 2.0,
    'cce': 2.0,
    'as': 2.0,
    'sms': 0.3,
    'ims': 0.3,
    'apig': 0.3,
    'aos': 0.3,
    'roma': 0.3,
    'taurusdb': 0.1,
    'dbss': 0.1,
    'caf': 0.1,
    'lts': 0.1,
    'professionalservices': 0.1,
    'vias': 0.1,
    'apig': 0.1,
    'waf': 0.2,
}

class OptimizedRAG:
    def __init__(self):
        self.client = chromadb.PersistentClient(path=CHROMA_DB_PATH)
        self.collection = self.client.get_collection(COLLECTION_NAME)
        self.model = SentenceTransformer(MODEL_NAME)
        self.cache = {}  # Cache query embeddings
    
    def calculate_relevance_score(self, result, query_terms):
        """Calculate relevance score with multiple factors"""
        score = result['score']
        metadata = result['metadata']
        service = metadata.get('service', '')
        
        # Service boost (exact service name matches get huge boost)
        service_boost = SERVICE_WEIGHTS.get(service.lower(), 1.0)
        score *= service_boost
        
        # Header relevance boost (if query terms appear in headers)
        headers = metadata.get('headers', '')
        try:
            import json
            header_list = json.loads(headers) if isinstance(headers, str) else headers
        except:
            header_list = []
        
        header_boost = 1.0
        if header_list:
            header_text = ' '.join(header_list).lower()
            for term in query_terms:
                if term.lower() in header_text:
                    header_boost *= 1.2
        score *= header_boost
        
        return score
    
    def search(self, query, top_k=5):
        """Perform search with relevance scoring"""
        query_terms = query.split()
        
        # Check cache
        cache_key = query.lower()
        if cache_key not in self.cache:
            embedding = self.model.encode(query, show_progress_bar=False)
            self.cache[cache_key] = embedding
        else:
            embedding = self.cache[cache_key]
        
        # Search
        results = self.collection.query(
            query_embeddings=[embedding.tolist()],
            n_results=top_k * 3,  # Get more results, then rerank
            include=['documents', 'metadatas', 'distances']
        )
        
        # Re-rank with relevance scoring
        reranked = []
        for i in range(len(results['ids'][0])):
            result = {
                'id': results['ids'][0][i],
                'document': results['documents'][0][i],
                'metadata': results['metadatas'][0][i],
                'distance': results['distances'][0][i],
                'score': 1 - results['distances'][0][i]
            }
            result['score'] = self.calculate_relevance_score(result, query_terms)
            reranked.append(result)
        
        # Sort by calculated score
        reranked.sort(key=lambda x: x['score'], reverse=True)
        
        # Deduplicate by ID
        seen = set()
        final_results = []
        for result in reranked:
            if result['id'] not in seen:
                seen.add(result['id'])
                final_results.append(result)
                if len(final_results) >= top_k:
                    break
        
        return final_results
    
    def print_results(self, query, results):
        """Pretty print search results"""
        print(f"\n{'='*70}")
        print(f"Query: {query}")
        print(f"{'='*70}\n")
        
        if not results:
            print("No results found")
            return
        
        for i, result in enumerate(results, 1):
            metadata = result['metadata']
            score_pct = result['score'] * 100
            
            print(f"{i}. [{metadata.get('service', 'Unknown'):20s}] Score: {score_pct:6.1f}%")
            print(f"   URL: {metadata.get('url', 'N/A')}")
            
            # Show preview
            preview = result['document'].replace('\n', ' ')[:250]
            print(f"   Preview: {preview}...")
            print()

def main():
    if len(sys.argv) < 2:
        print("Usage: python optimized_query.py <query> [--top-k N]")
        sys.exit(1)
    
    query = sys.argv[1]
    top_k = 5
    
    for i in range(2, len(sys.argv)):
        if sys.argv[i] == '--top-k' and i + 1 < len(sys.argv):
            top_k = int(sys.argv[i + 1])
    
    print("Loading models and database...")
    rag = OptimizedRAG()
    print(f"Database loaded: {rag.collection.count()} vectors")
    print()
    
    import time
    start = time.time()
    results = rag.search(query, top_k=top_k)
    elapsed = time.time() - start
    
    print(f"Found {len(results)} results in {elapsed*1000:.0f}ms")
    print()
    
    rag.print_results(query, results)

if __name__ == "__main__":
    main()
