/**
 * Type definitions for Huawei Cloud Documentation Scraper
 */

// ============================================================================
// Service Catalog Types
// ============================================================================

export interface Service {
  code: string;              // e.g., "ecs", "obs", "vpc"
  title: string;             // e.g., "Elastic Cloud Server"
  category: string;          // e.g., "compute", "storage"
  description: string;
  uri: string;               // Product description URL
}

export interface ServiceCategory {
  code: string;              // e.g., "compute"
  name: string;              // Display name (e.g., "Computação")
  enName: string;            // English name (e.g., "Compute")
  products: Service[];
}

export interface ServiceCatalog {
  categories: ServiceCategory[];
  totalServices: number;
  lastUpdated: string;       // ISO timestamp
}

// ============================================================================
// Document Page Types
// ============================================================================

export type DocumentCategory = 
  | 'api-reference'
  | 'product-description'
  | 'quick-start'
  | 'user-guide'
  | 'best-practices'
  | 'troubleshooting'
  | 'faq'
  | 'other';

export type PageStatus = 'pending' | 'scraped' | 'failed' | 'processing';

export interface DocumentPage {
  id: string;                // Unique page ID (derived from URL)
  url: string;               // Full URL to documentation page
  title: string;             // Page title
  service: string;           // Service code (e.g., "ecs")
  category: DocumentCategory;
  handbookCode: string;      // e.g., "productdesc-ecs", "api-ecs"
  level: number;             // Navigation depth (1-5)
  parentId?: string;         // Parent page ID for hierarchy
  status: PageStatus;
  contentLength?: number;    // Character count of content
  error?: string;            // Error message if failed
  scrapedAt?: string;        // ISO timestamp
}

// ============================================================================
// Scraped Content Types
// ============================================================================

export interface RawHtmlDocument {
  metadata: {
    id: string;
    url: string;
    service: string;
    status: number;          // HTTP status code
    headers: Record<string, string>;
    fetchedAt: string;       // ISO timestamp
    contentType?: string;
    contentLength: number;
  };
  html: string;              // Raw HTML content
}

export interface CleanDocument {
  metadata: {
    id: string;
    url: string;
    title: string;
    service: string;
    category: DocumentCategory;
    handbookCode: string;
    contentLength: number;
    processedAt: string;     // ISO timestamp
  };
  content: string;           // Full markdown content (unlimited)
}

export interface FailedPage {
  service: string;
  url: string;
  title?: string;
  error: string;
  attempts: number;
  lastAttempt: string;       // ISO timestamp
  willRetry?: boolean;
}

export interface FailedPagesLog {
  timestamp: string;
  totalFailed: number;
  pages: FailedPage[];
}

// ============================================================================
// Scraping Result Types
// ============================================================================

export interface ServiceScrapeResult {
  service: string;
  pagesFound: number;
  pagesScraped: number;
  pagesFailed: number;
  pagesSkipped: number;
  status: 'success' | 'error' | 'partial';
  error?: string;
  durationMs: number;
}

export interface ScrapeResult {
  totalServices: number;
  totalPages: number;
  services: ServiceScrapeResult[];
  failedPages: FailedPagesLog;
  timestamp: string;
  durationMs: number;
}

// ============================================================================
// Configuration Types
// ============================================================================

export interface ScraperConfig {
  // Rate limiting
  maxConcurrent: number;
  baseDelayMs: number;
  adaptiveRateLimit: boolean;
  
  // Retry logic
  maxRetries: number;
  retryBaseDelayMs: number;
  
  // Content
  maxContentLength: number | null;  // null = unlimited
  embeddingTruncateLength: number;  // 2000 chars for embeddings
  
  // Storage
  rawHtmlDir: string;
  cleanDocsDir: string;
  failedPagesFile: string;
  serviceCatalogFile: string;
  
  // API
  serviceApiUrl: string;
  docBaseUrl: string;
  navigationUrlTemplate: string;
}

export const DEFAULT_CONFIG: ScraperConfig = {
  maxConcurrent: 10,
  baseDelayMs: 100,
  adaptiveRateLimit: true,
  maxRetries: 3,
  retryBaseDelayMs: 1000,
  maxContentLength: null,  // Unlimited
  embeddingTruncateLength: 2000,
  rawHtmlDir: '../rag_cache/raw_html',
  cleanDocsDir: '../rag_cache/clean_docs',
  failedPagesFile: '../rag_cache/failed_pages.json',
  serviceCatalogFile: '../rag_cache/service-catalog.json',
  serviceApiUrl: 'https://portal.huaweicloud.com/rest/cbc/portaldocdataservice/v1/books/items?appId=INTL-EN_US',
  docBaseUrl: 'https://support.huaweicloud.com/intl/en-us',
  navigationUrlTemplate: 'https://support.huaweicloud.com/intl/en-us/{service}/v3_support_leftmenu_fragment.html'
};

// ============================================================================
// Cache and Storage Types
// ============================================================================

export interface CacheMetadata {
  lastFullScrape: string | null;
  services: Record<string, ServiceCacheInfo>;
}

export interface ServiceCacheInfo {
  lastScraped: string;
  pageCount: number;
  pages: Record<string, PageCacheInfo>;
}

export interface PageCacheInfo {
  id: string;
  url: string;
  title: string;
  scrapedAt: string;
  contentLength: number;
  status: 'valid' | 'stale' | 'failed';
}

// ============================================================================
// RAG Types
// ============================================================================

export interface RagDocument {
  content: string;           // Full content
  source: string;            // URL
  title: string;
  product: string;           // Service code (uppercase)
  category: DocumentCategory;
  id: string;
}

export interface RagSearchResult {
  score: number;
  document: RagDocument;
  snippet: string;           // Relevant excerpt
}
