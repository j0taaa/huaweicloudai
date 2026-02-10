#!/usr/bin/env python3
"""Build document index in batches to avoid memory issues"""
import json
import gzip
from pathlib import Path

def process_part_file(part_file, part_num):
    """Process a single part file and return metadata only"""
    documents = []
    
    print(f'Loading part {part_num}...')
    # Load compressed JSON
    with gzip.open(part_file, 'rt', encoding='utf-8') as f:
        # Read in chunks to avoid loading entire file at once
        data = f.read()
    
    print(f'Parsing part {part_num}...')
    docs = json.loads(data)
    
    print(f'Extracting metadata from {len(docs)} documents...')
    for idx, doc in enumerate(docs):
        documents.append({
            'id': doc['id'],
            'part': part_num,
            'idx': idx,
            'product': doc.get('product', ''),
            'title': doc.get('title', ''),
            'category': doc.get('category', ''),
            'source': doc.get('source', '')
        })
        if idx % 10000 == 0:
            print(f'  Processed {idx}...')
    
    return documents

def main():
    rag_cache = Path('/home/huaweicloudai/rag_cache')
    split_dir = rag_cache / 'split_docs'
    
    print('Building document index in batches...')
    
    all_metadata = []
    
    # Process each part file separately
    for part_num in range(1, 5):  # 4 parts
        part_file = split_dir / f'documents_part_{part_num}.json.gz'
        
        metadata = process_part_file(part_file, part_num)
        all_metadata.extend(metadata)
        
        print(f'Part {part_num} complete. Total so far: {len(all_metadata)}')
    
    # Build index structure
    index = {
        'totalDocuments': len(all_metadata),
        'documents': {m['id']: {k: v for k, v in m.items() if k != 'id'} for m in all_metadata}
    }
    
    # Save compressed index
    index_file = rag_cache / 'document-index.json.gz'
    print(f'Saving index with {len(index["documents"])} entries...')
    
    with gzip.open(index_file, 'wt', encoding='utf-8') as f:
        json.dump(index, f)
    
    size_mb = index_file.stat().st_size / 1024 / 1024
    print(f'Index saved: {size_mb:.2f} MB')

if __name__ == '__main__':
    main()
