#!/usr/bin/env python3
"""
Improved RAG Query System with Query Expansion and Hybrid Search
"""

import chromadb
from sentence_transformers import SentenceTransformer
import sys

# Configuration
CHROMA_DB_PATH = "/home/rag_cache/chroma_db"
COLLECTION_NAME = "huawei_docs"
MODEL_NAME = "all-MiniLM-L6-v2"

# Query expansion mappings
ACRONYM_EXPANSION = {
    'ecs': ['elastic cloud server', 'compute', 'virtual machine', 'vm'],
    'vpc': ['virtual private cloud', 'network', 'networking'],
    'obs': ['object storage', 'storage', 'bucket', 's3'],
    'rds': ['database', 'db', 'relational database', 'mysql'],
    'elb': ['load balancer', 'elastic load balancer', 'lb'],
    'iam': ['identity', 'authentication', 'authorization', 'access management'],
    'api': ['application programming interface', 'rest', 'sdk'],
    'cdn': ['content delivery network', 'edge', 'acceleration'],
    'vpn': ['virtual private network', 'tunnel', 'remote access'],
}

class ImprovedRAG:
    def __init__(self):
        self.client = chromadb.PersistentClient(path=CHROMA_DB_PATH)
        self.collection = self.client.get_collection(COLLECTION_NAME)
        self.model = SentenceTransformer(MODEL_NAME)
    
    def expand_query(self, query):
        """Expand query with acronyms and synonyms"""
        expanded_terms = [query]
        query_lower = query.lower()
        
        # Add acronym expansions
        for acronym, expansions in ACRONYM_EXPANSION.items():
            if acronym in query_lower:
                expanded_terms.extend(expansions)
            for exp in expansions:
                if exp in query_lower:
                    expanded_terms.append(acronym)
        
        # Remove duplicates while preserving order
        seen = set()
        result = []
        for term in expanded_terms:
            if term not in seen:
                seen.add(term)
                result.append(term)
        
        return result
    
    def search(self, query, top_k=5, filter_service=None):
        """Perform search with query expansion"""
        # Expand query
        expanded_queries = self.expand_query(query)
        
        # Generate embeddings for all query variations
        embeddings = self.model.encode(expanded_queries, show_progress_bar=False)
        
        # Search with all embeddings
        all_results = []
        for i, (expanded_query, embedding) in enumerate(zip(expanded_queries, embeddings)):
            where_filter = {"service": filter_service} if filter_service else None
            
            try:
                results = self.collection.query(
                    query_embeddings=[embedding.tolist()],
                    n_results=top_k,
                    where=where_filter
                )
                
                # Add query info
                for j in range(len(results['ids'][0])):
                    all_results.append({
                        'query': expanded_query,
                        'id': results['ids'][0][j],
                        'document': results['documents'][0][j],
                        'metadata': results['metadatas'][0][j],
                        'distance': results['distances'][0][j],
                        'score': 1 - results['distances'][0][j]
                    })
            except Exception as e:
                print(f"Error searching with '{expanded_query}': {e}")
        
        # Sort by score and deduplicate by ID
        seen_ids = set()
        unique_results = []
        for result in sorted(all_results, key=lambda x: x['score'], reverse=True):
            if result['id'] not in seen_ids:
                seen_ids.add(result['id'])
                unique_results.append(result)
                if len(unique_results) >= top_k:
                    break
        
        return unique_results
    
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
            
            headers = metadata.get('headers', '[]')
            try:
                import json
                header_list = json.loads(headers) if isinstance(headers, str) else headers
                if header_list:
                    print(f"   Headers: {' > '.join(header_list)}")
            except:
                pass
            
            # Preview
            preview = result['document'].replace('\n', ' ')[:300]
            print(f"   Preview: {preview}...")
            print()

def main():
    if len(sys.argv) < 2:
        print("Usage: python improved_query.py <query> [--top-k N] [--service SERVICE]")
        print("Example: python improved_query.py 'How to create ECS instance?' --top-k 5")
        sys.exit(1)
    
    query = sys.argv[1]
    top_k = 5
    filter_service = None
    
    # Parse options
    for i in range(2, len(sys.argv)):
        arg = sys.argv[i]
        if arg == '--top-k' and i + 1 < len(sys.argv):
            top_k = int(sys.argv[i + 1])
        elif arg == '--service' and i + 1 < len(sys.argv):
            filter_service = sys.argv[i + 1]
    
    print("Loading models and database...")
    rag = ImprovedRAG()
    print(f"Database loaded: {rag.collection.count()} vectors")
    print()
    
    print(f"Searching for: {query}")
    print(f"Top-K: {top_k}")
    print(f"Service filter: {filter_service if filter_service else 'None'}")
    print()
    
    import time
    start = time.time()
    results = rag.search(query, top_k=top_k, filter_service=filter_service)
    elapsed = time.time() - start
    
    print(f"Found {len(results)} results in {elapsed*1000:.0f}ms")
    print()
    
    rag.print_results(query, results)

if __name__ == "__main__":
    main()
