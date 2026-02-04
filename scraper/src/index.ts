/**
 * Main Scraper Orchestrator
 * Coordinates the entire scraping process
 */
import type { 
  ServiceCatalog, 
  Service, 
  DocumentPage, 
  RawHtmlDocument, 
  CleanDocument,
  ServiceScrapeResult,
  ScrapeResult,
  FailedPage
} from './types/index.js';
import { ServiceCatalogFetcher } from './api/service-catalog.js';
import { PageNavigator } from './api/page-navigator.js';
import { DocumentFetcher } from './api/document-fetcher.js';
import { HtmlCleaner } from './parser/html-cleaner.js';
import { MarkdownConverter } from './parser/markdown-converter.js';
import { RawHtmlStore } from './storage/raw-html-store.js';
import { CleanDocsStore } from './storage/clean-docs-store.js';
import { FailedPagesStore } from './storage/failed-pages-store.js';
import { createAdaptiveRateLimiter, AdaptiveRateLimiter } from './utils/adaptive-rate-limiter.js';
import { logger } from './utils/logger.js';
import { SERVICE_CATALOG_FILE } from './config/paths.js';
import fs from 'fs';
import path from 'path';

export interface ScraperOptions {
  services?: string[];           // Specific services to scrape (undefined = all)
  force?: boolean;               // Force re-scrape even if cached
  maxPages?: number;             // Limit total pages (for testing)
  skipFailed?: boolean;          // Skip previously failed pages
  verbose?: boolean;             // Verbose logging
}

export class HuaweiCloudScraper {
  private catalogFetcher: ServiceCatalogFetcher;
  private pageNavigator: PageNavigator;
  private documentFetcher: DocumentFetcher;
  private htmlCleaner: HtmlCleaner;
  private markdownConverter: MarkdownConverter;
  private rawStore: RawHtmlStore;
  private cleanStore: CleanDocsStore;
  private failedStore: FailedPagesStore;
  private rateLimiter: AdaptiveRateLimiter;
  
  // Global progress tracking
  private globalStats: {
    totalPagesToScrape: number;
    totalPagesCompleted: number;
    totalPagesFailed: number;
    startTime: number;
    servicePageCounts: Map<string, number>;
  } = {
    totalPagesToScrape: 0,
    totalPagesCompleted: 0,
    totalPagesFailed: 0,
    startTime: 0,
    servicePageCounts: new Map()
  };

  constructor() {
    this.catalogFetcher = new ServiceCatalogFetcher();
    this.pageNavigator = new PageNavigator();
    this.documentFetcher = new DocumentFetcher();
    this.htmlCleaner = new HtmlCleaner();
    this.markdownConverter = new MarkdownConverter();
    this.rawStore = new RawHtmlStore();
    this.cleanStore = new CleanDocsStore();
    this.failedStore = new FailedPagesStore();
    this.rateLimiter = createAdaptiveRateLimiter(15, 300);
  }

  /**
   * Discover all pages for all services (pre-scrape phase)
   */
  private async discoverAllPages(services: Service[]): Promise<void> {
    logger.info('🔍 Discovering all documentation pages...\n');
    
    let totalDiscovered = 0;
    
    for (let i = 0; i < services.length; i++) {
      const service = services[i];
      const progress = `[${i + 1}/${services.length}]`;
      
      logger.info(`${progress} Discovering pages for ${service.code.toUpperCase()}...`);
      
      try {
        const pages = await this.pageNavigator.fetchServicePages(service.code);
        this.globalStats.servicePageCounts.set(service.code, pages.length);
        totalDiscovered += pages.length;
        
        logger.success(`   ✓ Found ${pages.length} pages`);
      } catch (error) {
        logger.error(`   ✗ Failed to discover: ${(error as Error).message}`);
        this.globalStats.servicePageCounts.set(service.code, 0);
      }
    }
    
    this.globalStats.totalPagesToScrape = totalDiscovered;
    logger.info(`\n📊 Total pages to scrape: ${totalDiscovered}\n`);
  }

  /**
   * Format time duration for display
   */
  private formatDuration(ms: number): string {
    const hours = Math.floor(ms / 3600000);
    const minutes = Math.floor((ms % 3600000) / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    
    if (hours > 0) {
      return `${hours}h ${minutes}m ${seconds}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds}s`;
    } else {
      return `${seconds}s`;
    }
  }

  /**
   * Update and display global progress with time tracking
   */
  private updateGlobalProgress(): void {
    const now = Date.now();
    const elapsed = now - this.globalStats.startTime;
    const completed = this.globalStats.totalPagesCompleted;
    const total = this.globalStats.totalPagesToScrape;
    const remaining = total - completed;
    
    const globalPercent = Math.round((completed / total) * 100);
    
    // Calculate ETA based on current rate
    let etaStr = 'calculating...';
    if (completed > 0 && elapsed > 0) {
      const ratePerMs = completed / elapsed;
      const remainingMs = remaining / ratePerMs;
      etaStr = this.formatDuration(remainingMs);
    }
    
    // Create progress bar
    const bar = '█'.repeat(Math.round(globalPercent / 5)) + '░'.repeat(20 - Math.round(globalPercent / 5));
    
    logger.showGlobalProgress(globalPercent, bar, completed, total, this.formatDuration(elapsed), etaStr);
  }

  /**
   * Main scrape method
   */
  async scrape(options: ScraperOptions = {}): Promise<ScrapeResult> {
    const startTime = Date.now();
    this.globalStats.startTime = startTime;
    const { services, force = false, maxPages, verbose = false } = options;

    logger.setVerbose(verbose);
    logger.info('🚀 Starting Huawei Cloud Documentation Scraper\n');

    // 1. Fetch service catalog
    const catalog = await this.fetchServiceCatalog();
    if (!catalog) {
      throw new Error('Failed to fetch service catalog');
    }

    // 2. Filter services if specified
    const targetServices = this.filterServices(catalog, services);
    logger.info(`Target: ${targetServices.length} services\n`);

    // 3. Discover all pages first (pre-scrape phase)
    await this.discoverAllPages(targetServices);
    
    if (maxPages && maxPages < this.globalStats.totalPagesToScrape) {
      logger.info(`⚠️  Limiting to ${maxPages} pages (out of ${this.globalStats.totalPagesToScrape} total)\n`);
      this.globalStats.totalPagesToScrape = maxPages;
    }

    // 4. Scrape services in PARALLEL
    const results: ServiceScrapeResult[] = [];
    let totalPages = 0;
    let totalFailed: FailedPage[] = [];
    
    const SERVICE_CONCURRENCY = 10; // Process 10 services simultaneously (conservative)
    
    logger.info('\n📥 Starting page scraping...\n');
    logger.info(`🚀 Processing ${targetServices.length} services with ${SERVICE_CONCURRENCY} concurrent workers...\n`);

    // Process services in parallel batches
    for (let batchStart = 0; batchStart < targetServices.length; batchStart += SERVICE_CONCURRENCY) {
      const batchEnd = Math.min(batchStart + SERVICE_CONCURRENCY, targetServices.length);
      const serviceBatch = targetServices.slice(batchStart, batchEnd);
      
      logger.info(`\n[Batch ${Math.floor(batchStart / SERVICE_CONCURRENCY) + 1}/${Math.ceil(targetServices.length / SERVICE_CONCURRENCY)}] Processing ${serviceBatch.length} services...\n`);
      
      // Process this batch in parallel
      const batchPromises = serviceBatch.map(async (service, index) => {
        const globalIndex = batchStart + index + 1;
        logger.info(`[${globalIndex}/${targetServices.length}] Starting ${service.code.toUpperCase()} (${service.title})...`);
        
        const expectedPages = this.globalStats.servicePageCounts.get(service.code) || 0;
        
        const result = await this.scrapeService(service, {
          force,
          maxPages: maxPages ? maxPages - totalPages : undefined,
          expectedPages
        });

        // Update shared stats safely (we'll use atomic updates)
        totalPages += result.pagesScraped;

        // Collect failed pages
        if (result.failedPages) {
          totalFailed.push(...result.failedPages);
        }
        
        logger.success(`[${globalIndex}/${targetServices.length}] ✓ Completed ${service.code.toUpperCase()}: ${result.pagesScraped} pages`);
        
        return result;
      });
      
      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
      
      // Check if we've hit the maxPages limit
      if (maxPages && totalPages >= maxPages) {
        logger.info(`\n✓ Reached max pages limit (${maxPages})`);
        break;
      }
    }

    // 5. Retry failed pages
    const retryResults = await this.retryFailedPages(totalFailed);
    
    // Update totals with retry successes
    const retrySuccessCount = retryResults.succeeded.length;
    const retryStillFailed = retryResults.failed.length;
    
    if (retrySuccessCount > 0 || retryStillFailed > 0) {
      logger.info(`\n🔄 Retry Summary: ${retrySuccessCount} succeeded, ${retryStillFailed} still failed`);
      totalPages += retrySuccessCount;
    }

    // 6. Save final metadata
    this.saveFinalMetadata(results, catalog);

    // 7. Build result
    const duration = Date.now() - startTime;
    const scrapeResult: ScrapeResult = {
      totalServices: targetServices.length,
      totalPages,
      services: results,
      failedPages: {
        timestamp: new Date().toISOString(),
        totalFailed: retryStillFailed,
        pages: retryResults.failed
      },
      timestamp: new Date().toISOString(),
      durationMs: duration
    };

    // 8. Print summary
    this.printSummary(scrapeResult);
    
    // 9. Print retry details if there were any
    if (retrySuccessCount > 0 || retryStillFailed > 0) {
      logger.info('\n' + '='.repeat(50));
      logger.info('🔄 RETRY DETAILS');
      logger.info('='.repeat(50));
      logger.info(`Pages retried: ${totalFailed.length}`);
      logger.info(`Successfully recovered: ${retrySuccessCount}`);
      logger.info(`Still failed: ${retryStillFailed}`);
      logger.info('='.repeat(50));
    }

    return scrapeResult;
  }

  /**
   * Fetch and cache service catalog
   */
  private async fetchServiceCatalog(): Promise<ServiceCatalog | null> {
    try {
      const catalog = await this.catalogFetcher.fetchAllServices();
      
      // Save to disk
      const catalogPath = SERVICE_CATALOG_FILE;
      fs.writeFileSync(catalogPath, JSON.stringify(catalog, null, 2));
      
      return catalog;
    } catch (error) {
      logger.error('Failed to fetch service catalog:', error as Error);
      return null;
    }
  }

  /**
   * Filter services based on options
   */
  private filterServices(catalog: ServiceCatalog, serviceCodes?: string[]): Service[] {
    const allServices = catalog.categories.flatMap(cat => cat.products);

    if (!serviceCodes || serviceCodes.length === 0) {
      return allServices;
    }

    const normalizedCodes = serviceCodes.map(c => c.toLowerCase());
    return allServices.filter(s => normalizedCodes.includes(s.code.toLowerCase()));
  }

  /**
   * Scrape a single service
   */
  private async scrapeService(
    service: Service,
    options: { force?: boolean; maxPages?: number; expectedPages?: number }
  ): Promise<ServiceScrapeResult & { failedPages?: FailedPage[] }> {
    const serviceStartTime = Date.now();
    const { force, maxPages, expectedPages } = options;
    const failedPages: FailedPage[] = [];

    try {
      // 1. Fetch page URLs (or use expected count if already discovered)
      let pages: DocumentPage[];
      if (expectedPages !== undefined) {
        // Re-fetch to get actual URLs for scraping
        pages = await this.pageNavigator.fetchServicePages(service.code);
      } else {
        pages = await this.pageNavigator.fetchServicePages(service.code);
      }
      
      if (pages.length === 0) {
        return {
          service: service.code,
          pagesFound: 0,
          pagesScraped: 0,
          pagesFailed: 0,
          pagesSkipped: 0,
          status: 'success',
          durationMs: Date.now() - serviceStartTime
        };
      }

      logger.info(`   Found ${pages.length} pages`);

      // 2. Filter out already-scraped pages unless force is true
      const pagesToScrape = force 
        ? pages 
        : pages.filter(p => !this.cleanStore.exists(service.code, p.id));
      
      const skipped = pages.length - pagesToScrape.length;
      if (skipped > 0) {
        logger.info(`   Skipped ${skipped} (already cached)`);
      }

      // 3. Apply maxPages limit
      const targetPages = maxPages 
        ? pagesToScrape.slice(0, maxPages)
        : pagesToScrape;

      // 4. Scrape pages in PARALLEL batches
      let scraped = 0;
      let failed = 0;
      const CONCURRENCY = 15; // Process 15 pages at a time (matches rate limiter concurrency)
      
      logger.info(`   🚀 Processing ${targetPages.length} pages with ${CONCURRENCY} concurrent workers...`);
      
      // Process in batches
      for (let batchStart = 0; batchStart < targetPages.length; batchStart += CONCURRENCY) {
        const batchEnd = Math.min(batchStart + CONCURRENCY, targetPages.length);
        const batch = targetPages.slice(batchStart, batchEnd);
        
        // Process batch in parallel
        const batchResults = await Promise.all(
          batch.map(page => this.scrapePage(page))
        );
        
        // Collect results
        for (let i = 0; i < batch.length; i++) {
          const page = batch[i];
          const result = batchResults[i];
          
          if (result.success) {
            scraped++;
            this.globalStats.totalPagesCompleted++;
            this.failedStore.removeFailedPage(page.url);
          } else {
            failed++;
            this.globalStats.totalPagesFailed++;
            const failedPage: FailedPage = {
              service: service.code,
              url: page.url,
              title: page.title,
              error: result.error,
              attempts: 3,
              lastAttempt: new Date().toISOString()
            };
            this.failedStore.addFailedPage(failedPage);
            failedPages.push(failedPage);
          }
        }
        
        // Update progress
        this.updateGlobalProgress();
        
        // Show batch progress
        const batchPercent = Math.round((batchEnd / targetPages.length) * 100);
        logger.info(`   📊 Batch ${Math.floor(batchStart / CONCURRENCY) + 1}: ${batchEnd}/${targetPages.length} (${batchPercent}%)`);
      }

      logger.clearGlobalProgress();
      logger.success(`   ✓ ${scraped} scraped, ${failed} failed, ${skipped} skipped`);

      return {
        service: service.code,
        pagesFound: pages.length,
        pagesScraped: scraped,
        pagesFailed: failed,
        pagesSkipped: skipped,
        status: failed > 0 && scraped === 0 ? 'error' : failed > 0 ? 'partial' : 'success',
        durationMs: Date.now() - serviceStartTime,
        failedPages
      };

    } catch (error) {
      logger.error(`   ✗ Service error: ${(error as Error).message}`);
      
      return {
        service: service.code,
        pagesFound: 0,
        pagesScraped: 0,
        pagesFailed: 0,
        pagesSkipped: 0,
        status: 'error',
        error: (error as Error).message,
        durationMs: Date.now() - serviceStartTime,
        failedPages
      };
    }
  }

  /**
   * Scrape a single page
   */
  private async scrapePage(
    page: DocumentPage
  ): Promise<{ success: true } | { success: false; error: string }> {
    try {
      // 1. Fetch raw HTML
      const fetchResult = await this.documentFetcher.fetchPage(
        page.url,
        page.id,
        page.service,
        { rateLimiter: this.rateLimiter }
      );

      if (!fetchResult.success) {
        return { success: false, error: fetchResult.error };
      }

      const rawDoc = fetchResult.data;

      // 2. Save raw HTML
      await this.rawStore.saveDocument(rawDoc);

      // 3. Clean HTML
      const cleanedHtml = this.htmlCleaner.clean(rawDoc.html);

      if (!cleanedHtml || cleanedHtml.length < 100) {
        return { success: false, error: 'Empty or too short content after cleaning' };
      }

      // 4. Extract title (from original HTML if available, or cleaned)
      const title = this.htmlCleaner.extractTitle(rawDoc.html) || page.title;

      // 5. Convert to markdown
      const markdown = this.markdownConverter.convert(cleanedHtml);

      if (!markdown || markdown.length < 50) {
        return { success: false, error: 'Empty or too short markdown' };
      }

      // 6. Save clean document (FULL content, no truncation)
      const cleanDoc: CleanDocument = {
        metadata: {
          id: page.id,
          url: page.url,
          title,
          service: page.service,
          category: page.category,
          handbookCode: page.handbookCode,
          contentLength: markdown.length,
          processedAt: new Date().toISOString()
        },
        content: markdown  // Full content, no truncation!
      };

      await this.cleanStore.saveDocument(cleanDoc);

      return { success: true };

    } catch (error) {
      return { 
        success: false, 
        error: `Scraping error: ${(error as Error).message}` 
      };
    }
  }

  /**
   * Retry failed pages after main scrape completes
   * Retries up to 3 times with progressively more conservative settings
   */
  private async retryFailedPages(
    failedPages: FailedPage[]
  ): Promise<{ succeeded: FailedPage[]; failed: FailedPage[] }> {
    if (failedPages.length === 0) {
      return { succeeded: [], failed: [] };
    }

    let pagesToRetry = [...failedPages];
    const allSucceeded: FailedPage[] = [];
    const MAX_RETRY_ROUNDS = 3;
    
    for (let round = 1; round <= MAX_RETRY_ROUNDS; round++) {
      if (pagesToRetry.length === 0) {
        logger.success(`\n✓ All failed pages successfully recovered after ${round - 1} round(s)`);
        break;
      }
      
      logger.info(`\n🔄 Retry Round ${round}/${MAX_RETRY_ROUNDS}: ${pagesToRetry.length} pages remaining...`);
      
      // Progressive backoff: slower settings with each round
      // Round 1: 20 concurrent, 100ms delay
      // Round 2: 10 concurrent, 250ms delay  
      // Round 3: 5 concurrent, 500ms delay
      const concurrent = Math.max(5, 20 - (round - 1) * 7);
      const delay = 100 + (round - 1) * 200;
      
      const retryLimiter = createAdaptiveRateLimiter(concurrent, delay);
      logger.info(`   Settings: ${concurrent} concurrent, ${delay}ms delay`);
      
      const roundSucceeded: FailedPage[] = [];
      const roundStillFailed: FailedPage[] = [];
      
      // Process in smaller batches
      const BATCH_SIZE = Math.min(20, concurrent * 2);
      
      for (let i = 0; i < pagesToRetry.length; i += BATCH_SIZE) {
        const batch = pagesToRetry.slice(i, i + BATCH_SIZE);
        const batchNum = Math.floor(i / BATCH_SIZE) + 1;
        const totalBatches = Math.ceil(pagesToRetry.length / BATCH_SIZE);
        
        if (batch.length > 5) {
          logger.info(`  [Round ${round} - Batch ${batchNum}/${totalBatches}] ${batch.length} pages...`);
        }
        
        // Process batch in parallel
        const batchPromises = batch.map(async (failedPage) => {
          const page: DocumentPage = {
            id: this.generatePageIdFromUrl(failedPage.url),
            url: failedPage.url,
            title: failedPage.title || 'Unknown',
            service: failedPage.service,
            category: 'other',
            handbookCode: '',
            level: 1,
            status: 'pending'
          };
          
          const result = await this.scrapePageWithRateLimiter(page, retryLimiter);
          
          if (result.success) {
            roundSucceeded.push(failedPage);
            this.failedStore.removeFailedPage(failedPage.url);
          } else {
            const updatedFailedPage: FailedPage = {
              ...failedPage,
              error: result.error,
              lastAttempt: new Date().toISOString()
            };
            roundStillFailed.push(updatedFailedPage);
            this.failedStore.addFailedPage(updatedFailedPage);
          }
          
          return result;
        });
        
        await Promise.all(batchPromises);
        
        // Show progress every few batches
        if (totalBatches > 5 && batchNum % 5 === 0) {
          const progress = Math.round(((i + batch.length) / pagesToRetry.length) * 100);
          logger.info(`     Progress: ${progress}% (${i + batch.length}/${pagesToRetry.length})`);
        }
      }
      
      // Log round results
      logger.success(`   Round ${round} complete: ${roundSucceeded.length} recovered, ${roundStillFailed.length} still failed`);
      
      allSucceeded.push(...roundSucceeded);
      pagesToRetry = roundStillFailed; // Retry still-failed pages in next round
    }
    
    return { succeeded: allSucceeded, failed: pagesToRetry };
  }

  /**
   * Generate page ID from URL
   */
  private generatePageIdFromUrl(url: string): string {
    const urlObj = new URL(url);
    const pathParts = urlObj.pathname.split('/');
    const filename = pathParts[pathParts.length - 1];
    const name = filename.replace('.html', '');
    return name.replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase();
  }

  /**
   * Scrape a single page with a custom rate limiter
   */
  private async scrapePageWithRateLimiter(
    page: DocumentPage,
    rateLimiter: AdaptiveRateLimiter
  ): Promise<{ success: true } | { success: false; error: string }> {
    return rateLimiter.execute(async () => {
      try {
        const fetchResult = await this.documentFetcher.fetchPage(
          page.url,
          page.id,
          page.service,
          { rateLimiter }
        );

        if (!fetchResult.success) {
          return { success: false, error: fetchResult.error };
        }

        const rawDoc = fetchResult.data;
        await this.rawStore.saveDocument(rawDoc);

        const cleanedHtml = this.htmlCleaner.clean(rawDoc.html);
        if (!cleanedHtml || cleanedHtml.length < 100) {
          return { success: false, error: 'Empty or too short content after cleaning' };
        }

        const title = this.htmlCleaner.extractTitle(rawDoc.html) || page.title;
        const markdown = this.markdownConverter.convert(cleanedHtml);

        if (!markdown || markdown.length < 50) {
          return { success: false, error: 'Empty or too short markdown' };
        }

        const cleanDoc: CleanDocument = {
          metadata: {
            id: page.id,
            url: page.url,
            title,
            service: page.service,
            category: page.category,
            handbookCode: page.handbookCode,
            contentLength: markdown.length,
            processedAt: new Date().toISOString()
          },
          content: markdown
        };

        await this.cleanStore.saveDocument(cleanDoc);
        return { success: true };

      } catch (error) {
        return { 
          success: false, 
          error: `Retry scraping error: ${(error as Error).message}` 
        };
      }
    });
  }

  /**
   * Save final metadata
   */
  private saveFinalMetadata(
    results: ServiceScrapeResult[],
    catalog: ServiceCatalog
  ): void {
    const totalDocs = this.cleanStore.getTotalCount();
    const serviceCounts = this.cleanStore.getCountsByService();

    // Save clean docs metadata
    this.cleanStore.saveMetadata({
      timestamp: new Date().toISOString(),
      totalServices: Object.keys(serviceCounts).length,
      totalDocuments: totalDocs,
      services: serviceCounts
    });

    // Save raw HTML metadata
    this.rawStore.saveMetadata({
      timestamp: new Date().toISOString(),
      totalServices: Object.keys(serviceCounts).length,
      totalDocuments: totalDocs,
      services: Object.keys(serviceCounts)
    });

    logger.info(`\n💾 Metadata saved`);
  }

  /**
   * Print final summary
   */
  private printSummary(result: ScrapeResult): void {
    const successCount = result.services.filter(s => s.status === 'success').length;
    const partialCount = result.services.filter(s => s.status === 'partial').length;
    const errorCount = result.services.filter(s => s.status === 'error').length;

    const minutes = Math.floor(result.durationMs / 60000);
    const seconds = Math.floor((result.durationMs % 60000) / 1000);

    logger.info('\n' + '='.repeat(50));
    logger.info('📊 SCRAPING SUMMARY');
    logger.info('='.repeat(50));
    logger.info(`Services: ${result.totalServices}`);
    logger.info(`  ✓ Success: ${successCount}`);
    logger.info(`  ⚠ Partial: ${partialCount}`);
    logger.info(`  ✗ Error: ${errorCount}`);
    logger.info('');
    logger.info(`Pages: ${result.totalPages}`);
    logger.info(`Failed: ${result.failedPages.totalFailed}`);
    logger.info('');
    logger.info(`Duration: ${minutes}m ${seconds}s`);
    logger.info('='.repeat(50));
  }
}
