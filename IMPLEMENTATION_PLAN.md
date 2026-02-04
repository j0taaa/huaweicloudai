# Huawei Cloud RAG Scraper - Implementation Plan

## Project Overview
Comprehensive documentation scraper for all 100+ Huawei Cloud services with full content extraction and RAG embedding generation.

## User Requirements
1. ✅ Full page content (no truncation)
2. ✅ English only (en-us) - no Portuguese
3. ✅ Raw HTML storage in separate folder
4. ✅ Faster scraping: 10 concurrent, 100ms delay
5. ✅ Auto rate-limit detection
6. ✅ Skip after 3 retries, but track failed pages

## API Endpoints

### Service Catalog
```
https://portal.huaweicloud.com/rest/cbc/portaldocdataservice/v1/books/items?appId=INTL
```
Returns: All 100+ services organized by category

### Service Navigation
```
https://support.huaweicloud.com/intl/en-us/{service}/v3_support_leftmenu_fragment.html
```
Returns: HTML navigation structure with all documentation page URLs

### Documentation Pages
```
https://support.huaweicloud.com/intl/en-us/{handbook-code}/{page-id}.html
```
Returns: Individual documentation pages

## Folder Structure

```
/home/huaweicloudai/
├── scraper/                          # Scraper module
│   ├── src/
│   │   ├── api/                      # API layer
│   │   │   ├── service-catalog.ts    # Fetch service list
│   │   │   ├── page-navigator.ts     # Extract page URLs
│   │   │   └── document-fetcher.ts   # Fetch individual pages
│   │   ├── parser/                   # Content processing
│   │   │   ├── html-cleaner.ts       # Remove boilerplate
│   │   │   └── markdown-converter.ts # HTML to markdown
│   │   ├── storage/                  # Storage layer
│   │   │   ├── raw-html-store.ts     # Store raw HTML
│   │   │   ├── clean-docs-store.ts   # Store clean markdown
│   │   │   └── failed-pages-store.ts # Track failures
│   │   ├── types/                    # Type definitions
│   │   │   └── index.ts
│   │   ├── utils/                    # Utilities
│   │   │   ├── rate-limiter.ts       # Rate limiting with auto-detection
│   │   │   ├── retry-handler.ts      # Retry logic
│   │   │   └── logger.ts             # Logging
│   │   └── index.ts                  # Main orchestrator
│   ├── scripts/
│   │   └── scrape-all.ts             # CLI entry point
│   ├── package.json
│   └── tsconfig.json
│
├── rag_cache/
│   ├── raw_html/                     # Raw HTML storage
│   │   ├── metadata.json
│   │   └── {service}/
│   │       ├── {page-id}.html
│   │       └── {page-id}.json
│   ├── clean_docs/                   # Clean markdown
│   │   ├── metadata.json
│   │   └── {service}/
│   │       ├── {page-id}.md
│   │       └── {page-id}.json
│   ├── failed_pages.json             # Failed pages log
│   ├── service-catalog.json          # All services
│   ├── documents.json                # Final RAG docs
│   └── embeddings.bin                # Embeddings
│
├── scripts/
│   ├── build-rag.ts                  # Build embeddings
│   └── verify-rag.ts                 # Verify build
│
└── app/api/search-rag/route.ts       # Updated API
```

## Technical Specifications

### Rate Limiting
- Max concurrent: 10
- Base delay: 100ms
- Adaptive: Auto-detect 429/403 and slow down
- On rate limit: Reduce to 5 concurrent, 500ms delay

### Retry Logic
- Max retries: 3
- Backoff: 1s, 2s, 4s
- After 3 failures: Skip and log to failed_pages.json

### Content Processing
- Remove: headers, footers, nav, ads, scripts, styles
- Extract: main content area
- Convert: HTML to markdown
- Store: Full content (no truncation)
- Embeddings: Use first 2000 chars (~512 tokens)

### Storage Format

**Raw HTML:**
```typescript
{
  url: string,
  html: string,
  headers: Record<string, string>,
  status: number,
  fetchedAt: string
}
```

**Clean Docs:**
```typescript
{
  metadata: {
    id: string,
    url: string,
    title: string,
    service: string,
    category: string,
    contentLength: number,
    processedAt: string
  },
  content: string  // Full markdown
}
```

**Failed Pages:**
```typescript
{
  timestamp: string,
  totalFailed: number,
  pages: Array<{
    service: string,
    url: string,
    error: string,
    attempts: number,
    lastAttempt: string
  }>
}
```

## Expected Results

### Scraping
- Services: 100+
- Documentation pages: 50,000-100,000
- Raw HTML: ~2-3GB
- Clean markdown: ~1-2GB
- Failed pages: <5%

### RAG Build
- documents.json: ~100-200MB
- embeddings.bin: ~75-150MB
- Startup time: <2 seconds
- Search: Returns full content

### Performance
- Scraping time: 2-3 hours
- RAG build time: 30-60 minutes
- Total setup: ~4 hours

## Implementation Phases

### Phase 1: Core Infrastructure (Day 1 - Morning)
- [x] Create folder structure
- [x] Write implementation plan
- [ ] Create package.json
- [ ] Create tsconfig.json
- [ ] Define TypeScript types

### Phase 2: API Layer (Day 1 - Afternoon)
- [ ] Service catalog fetcher
- [ ] Page navigator
- [ ] Document fetcher

### Phase 3: Content Processing (Day 2)
- [ ] HTML cleaner
- [ ] Markdown converter

### Phase 4: Storage System (Day 2)
- [ ] Raw HTML store
- [ ] Clean docs store
- [ ] Failed pages store

### Phase 5: Utilities (Day 3 - Morning)
- [ ] Rate limiter with auto-detection
- [ ] Retry handler
- [ ] Logger

### Phase 6: Main Orchestrator (Day 3 - Afternoon)
- [ ] Main scraper class
- [ ] CLI script
- [ ] Test with sample services

### Phase 7: RAG Builder (Day 4)
- [ ] Build embeddings script
- [ ] Verify build
- [ ] Update search API

### Phase 8: Testing (Day 4)
- [ ] Test complete scrape
- [ ] Test search functionality
- [ ] Verify all components

## Dependencies

```json
{
  "dependencies": {
    "cheerio": "^1.0.0-rc.12",
    "turndown": "^7.1.2",
    "commander": "^11.1.0",
    "chalk": "^5.3.0",
    "ora": "^8.0.1",
    "@xenova/transformers": "^2.17.2"
  }
}
```

## Commands

```bash
# Install dependencies
cd scraper && npm install

# Scrape all services
npx tsx scripts/scrape-all.ts

# Scrape specific services
npx tsx scripts/scrape-all.ts ecs obs vpc

# Force re-scrape
npx tsx scripts/scrape-all.ts --force

# Build RAG embeddings
cd .. && npx tsx scripts/build-rag.ts

# Verify build
npx tsx scripts/verify-rag.ts
```

## Success Criteria

- [ ] All 100+ services scraped successfully
- [ ] 50,000+ documentation pages indexed
- [ ] Raw HTML stored for all pages
- [ ] Clean markdown generated
- [ ] Failed pages tracked (<5% failure rate)
- [ ] RAG embeddings generated
- [ ] Search API returns full content
- [ ] <2 second startup time
- [ ] No rate limiting errors (auto-handled)

## Notes

- Uses English (en-us) documentation only
- Full content stored for better context
- Failed pages tracked for future retry
- Auto rate-limit detection prevents blocking
- Incremental updates supported via metadata

Created: 2026-02-03
Last Updated: 2026-02-03
