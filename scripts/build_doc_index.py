#!/usr/bin/env python3
"""Build document index for memory-efficient RAG loading"""
import json
import gzip
import os
from pathlib import Path

def build_index():
    rag_cache = Path('/home/huaweicloudai/rag_cache')
    split_dir = rag_cache / 'split_docs'
    index_file = rag_cache / 'document-index.json.gz'
    
    print('Building document index...')
    
    # Load manifest
    with gzip.open(split_dir / 'manifest.json.gz', 'rt') as f:
        manifest = json.load(f)
    
    index = {
        'totalDocuments': manifest['total_documents'],
        'documents': {}  # id -> { part, idx, product, title, category, source }
    }
    
    for part_num in range(1, manifest['parts'] + 1):
        part_file = split_dir / f'documents_part_{part_num}.json.gz'
        print(f'Processing part {part_num}...')
        
        with gzip.open(part_file, 'rt') as f:
            documents = json.load(f)
        
        for idx, doc in enumerate(documents):
            index['documents'][doc['id']] = {
                'part': part_num,
                'idx': idx,
                'product': doc.get('product', ''),
                'title': doc.get('title', ''),
                'category': doc.get('category', ''),
                'source': doc.get('source', '')
            }
        
        print(f'Indexed {len(documents)} documents from part {part_num}')
        # Clear documents from memory
        del documents
    
    # Save compressed index
    index_json = json.dumps(index)
    with gzip.open(index_file, 'wb') as f:
        f.write(index_json.encode('utf-8'))
    
    compressed_size = index_file.stat().st_size
    print(f'Index built: {len(index["documents"])} documents')
    print(f'Index size: {compressed_size / 1024 / 1024:.2f} MB')

if __name__ == '__main__':
    build_index()
