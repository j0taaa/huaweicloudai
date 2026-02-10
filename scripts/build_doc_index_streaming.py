#!/usr/bin/env python3
"""Build document index for memory-efficient RAG loading - streaming version"""
import json
import gzip
import os
from pathlib import Path
import ijson  # Incremental JSON parser

def build_index_streaming():
    rag_cache = Path('/home/huaweicloudai/rag_cache')
    split_dir = rag_cache / 'split_docs'
    index_file = rag_cache / 'document-index.json.gz'
    
    print('Building document index (streaming mode)...')
    
    # Load manifest
    with gzip.open(split_dir / 'manifest.json.gz', 'rt') as f:
        manifest = json.load(f)
    
    index = {
        'totalDocuments': manifest['total_documents'],
        'documents': {}
    }
    
    for part_num in range(1, manifest['parts'] + 1):
        part_file = split_dir / f'documents_part_{part_num}.json.gz'
        print(f'Processing part {part_num}...')
        
        count = 0
        # Use ijson to stream parse the JSON array
        with gzip.open(part_file, 'rb') as f:
            for doc in ijson.items(f, 'item'):
                index['documents'][doc['id']] = {
                    'part': part_num,
                    'idx': count,
                    'product': doc.get('product', ''),
                    'title': doc.get('title', ''),
                    'category': doc.get('category', ''),
                    'source': doc.get('source', '')
                }
                count += 1
                if count % 10000 == 0:
                    print(f'  Processed {count} documents...')
        
        print(f'Indexed {count} documents from part {part_num}')
    
    # Save compressed index
    print('Saving index...')
    index_json = json.dumps(index)
    with gzip.open(index_file, 'wb') as f:
        f.write(index_json.encode('utf-8'))
    
    compressed_size = index_file.stat().st_size
    print(f'Index built: {len(index["documents"])} documents')
    print(f'Index size: {compressed_size / 1024 / 1024:.2f} MB')

if __name__ == '__main__':
    build_index_streaming()
