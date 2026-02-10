#!/usr/bin/env python3
"""Create a minimal binary index of document IDs to their location"""
import json
import gzip
import struct
from pathlib import Path

def create_binary_index():
    rag_cache = Path('/home/huaweicloudai/rag_cache')
    split_dir = rag_cache / 'split_docs'
    index_file = rag_cache / 'doc-index.bin'
    
    print('Creating binary document index...')
    
    # Count total documents first
    with gzip.open(split_dir / 'manifest.json.gz', 'rt') as f:
        manifest = json.load(f)
    
    total_docs = manifest['total_documents']
    print(f'Total documents to index: {total_docs}')
    
    # Write binary index: [count: uint32][id_length: uint8][id: bytes][part: uint8][idx: uint32]...
    with open(index_file, 'wb') as out:
        # Write count
        out.write(struct.pack('I', total_docs))
        
        indexed = 0
        for part_num in range(1, manifest['parts'] + 1):
            part_file = split_dir / f'documents_part_{part_num}.json.gz'
            print(f'Processing part {part_num}...')
            
            # Read and decompress
            with gzip.open(part_file, 'rt') as f:
                content = f.read()
            
            # Parse JSON
            docs = json.loads(content)
            
            for idx, doc in enumerate(docs):
                doc_id = doc['id'].encode('utf-8')
                # Write: id_length (1 byte), id, part (1 byte), idx (4 bytes)
                out.write(struct.pack('B', len(doc_id)))  # id length
                out.write(doc_id)  # id bytes
                out.write(struct.pack('B', part_num))  # part number
                out.write(struct.pack('I', idx))  # index in part
                
                indexed += 1
                if indexed % 10000 == 0:
                    print(f'  Indexed {indexed}/{total_docs}...')
            
            # Clear memory
            del docs
            del content
    
    size_mb = index_file.stat().st_size / 1024 / 1024
    print(f'Binary index created: {indexed} documents')
    print(f'Index file size: {size_mb:.2f} MB')

if __name__ == '__main__':
    create_binary_index()
