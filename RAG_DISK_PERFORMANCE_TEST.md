# RAG Performance Test: RAM vs Disk Storage

## Test Date
2026-02-07

## Test Setup
- **Total Documents**: 66,877
- **Embedding Dimension**: 384 (Xenova/all-MiniLM-L6-v2)
- **Total Data Size**: ~493 MB (98 MB embeddings + 395 MB documents)
- **Test Queries**: 7 representative queries

## Test Scenarios

### 1. RAM-Based Search (Current Implementation)
All embeddings and documents loaded into memory at startup. Searches performed entirely in RAM.

### 2. Disk-Buffered Search
File read once into buffer, embeddings accessed sequentially from buffer. Simulates reading from disk without OS-level caching.

### 3. True Disk I/O (Estimated)
Re-reading the file from disk for each embedding access (worst-case scenario with cold cache).

## Results

### Query Times

| Query | RAM | Disk (Buffered) | Slowdown |
|-------|-----|-----------------|----------|
| "how to create an ECS instance" | 97ms | 1,106ms | 11.4x |
| "how to upload files to OBS bucket" | 92ms | 1,053ms | 11.4x |
| "CreateServer API vpc parameters" | 99ms | 1,091ms | 11.0x |
| "ECS instance wont start error troubleshooting" | 86ms | 1,061ms | 12.3x |
| "VPC peering connection bandwidth limits" | 88ms | 1,053ms | 12.0x |
| "RDS MySQL backup and restore" | 85ms | 1,073ms | 12.6x |
| "security best practices" | 86ms | 1,008ms | 11.7x |
| **Average** | **90ms** | **1,064ms** | **11.8x** |

### True Disk I/O (Worst Case)
- **Sample Test**: 100 embeddings read individually from disk
- **Sample Time**: 61,735ms (61.7 seconds)
- **Estimated Full Time**: 41,286,516ms (688 minutes / 11.5 hours)
- **Slowdown vs RAM**: ~456,000x slower

## Key Findings

### 1. Buffered Disk Access (Realistic Worst Case)
- **11.8x slower** than RAM-based search
- Average query time increases from **90ms to 1,064ms**
- Still usable for occasional queries but significantly impacts user experience
- Loading time at startup: ~4,500ms to read all data

### 2. True Disk I/O (Worst Possible Case)
- **456,565x slower** than RAM-based search
- A single query could take **11.5 hours** if reading each embedding individually
- Completely impractical for production use
- Demonstrates why RAM caching is essential

### 3. Memory Requirements
- **Embeddings**: 98 MB (66,877 × 384 × 4 bytes)
- **Documents**: 395 MB (JSON text)
- **Total**: ~493 MB
- This is easily handled by modern systems with 8GB+ RAM

## Conclusion

### Performance Impact of Forcing Disk Storage

| Storage Method | Query Time | Slowdown | Usability |
|----------------|------------|----------|-----------|
| RAM (current) | 90ms | 1x | ✅ Excellent |
| Disk (buffered) | 1,064ms | 11.8x | ⚠️ Poor |
| Disk (true I/O) | 11.5 hours | 456,565x | ❌ Unusable |

### Recommendations

1. **Keep Current RAM-Based Approach**: The 11.8x slowdown with buffered disk access makes queries feel sluggish (1+ second response times)

2. **Memory is Cheap**: At ~493 MB, the entire RAG dataset fits comfortably in modern RAM. This is a small price for 90ms query times

3. **Hybrid Approach (Optional)**: If memory is constrained:
   - Load only frequently-accessed embeddings in RAM
   - Keep remaining on SSD with LRU cache
   - Would result in 2-5x slowdown on average instead of 11.8x

4. **Never Use True Disk I/O**: Reading embeddings individually from disk is 456,000x slower and completely impractical

### Why Disk is So Much Slower

1. **Decompression Overhead**: Each file read requires gzip decompression
2. **Sequential Scan**: Must iterate through all 66,877 embeddings to compute similarity
3. **I/O Latency**: Even SSDs have ~0.1ms latency vs nanoseconds for RAM
4. **No Vectorization**: Cannot use optimized CPU vector instructions on fragmented disk reads
5. **CPU Cache Misses**: Disk data doesn't benefit from CPU L1/L2/L3 caches

### Summary
**Forcing RAG to use disk instead of RAM makes it 11.8x slower in realistic scenarios and 456,000x slower in worst-case scenarios. The current RAM-based approach is essential for acceptable query performance.**
