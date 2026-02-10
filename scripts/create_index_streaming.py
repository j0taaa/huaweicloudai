#!/usr/bin/env python3
"""Create binary index using minimal memory - streaming JSON parser"""
import gzip
import struct
from pathlib import Path
import re

def parse_ids_from_json_stream(filename):
    """Extract only document IDs from a JSON array file using minimal memory"""
    # Pattern to match "id": "xxxx" in the JSON
    # This is a simple regex approach that works for this specific format
    pattern = re.compile(r'"id"\s*:\s*"([^"]+)"')
    
    ids = []
    buffer = ""
    
    with gzip.open(filename, 'rt', encoding='utf-8') as f:
        while True:
            chunk = f.read(8192)  # Read 8KB at a time
            if not chunk:
                break
            
            buffer += chunk
            
            # Find all complete IDs in buffer
            matches = list(pattern.finditer(buffer))
            for match in matches:
                ids.append(match.group(1))
            
            # Keep only the last 200 chars for context (in case ID spans chunks)
            buffer = buffer[-200:]
    
    return ids

def create_binary_index():
    rag_cache = Path('/home/huaweicloudai/rag_cache')
    split_dir = rag_cache / 'split_docs'
    index_file = rag_cache / 'doc-index.bin'
    
    print('Creating binary document index (streaming)...')
    
    total_indexed = 0
    
    with open(index_file, 'wb') as out:
        # Reserve space for count (we'll write it at the end)
        count_pos = out.tell()
        out.write(struct.pack('I', 0))  # Placeholder
        
        for part_num in range(1, 5):  # 4 parts
            part_file = split_dir / f'documents_part_{part_num}.json.gz'
            print(f'Processing part {part_num}...')
            
            ids = parse_ids_from_json_stream(part_file)
            print(f'  Found {len(ids)} IDs')
            
            for idx, doc_id in enumerate(ids):
                doc_id_bytes = doc_id.encode('utf-8')
                # Write: id_length (1 byte), id, part (1 byte), idx (4 bytes)
                out.write(struct.pack('B', len(doc_id_bytes)))
                out.write(doc_id_bytes)
                out.write(struct.pack('B', part_num))
                out.write(struct.pack('I', idx))
                
                total_indexed += 1
                if total_indexed % 10000 == 0:
                    print(f'  Total indexed: {total_indexed}')
    
    # Update count at beginning of file
    with open(index_file, 'r+b') as f:
        f.write(struct.pack('I', total_indexed))
    
    size_mb = index_file.stat().st_size / 1024 / 1024
    print(f'Binary index created: {total_indexed} documents')
    print(f'Index file size: {size_mb:.2f} MB')

if __name__ == '__main__':
    create_binary_index()
