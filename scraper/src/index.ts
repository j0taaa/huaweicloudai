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
import { createRateLimiter, RateLimiter } from './utils/rate-limiter.js';
import { logger } from './utils/logger.js';
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
  private rateLimiter: RateLimiter;

  constructor() {
    this.catalogFetcher = new ServiceCatalogFetcher();
    this.pageNavigator = new PageNavigator();
    this.documentFetcher = new DocumentFetcher();
    this.htmlCleaner = new HtmlCleaner();
    this.markdownConverter = new MarkdownConverter();
    this.rawStore = new RawHtmlStore();
    this.cleanStore = new CleanDocsStore();
    this.failedStore = new FailedPagesStore();
    this.rateLimiter = createRateLimiter(10, 100);
  }

  /**
   * Main scrape method
   */
  async scrape(options: ScraperOptions = {}): Promise<ScrapeResult> {
    const startTime = Date.now();
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

    // 3. Scrape each service
    const results: ServiceScrapeResult[] = [];
    let totalPages = 0;
    let totalFailed: FailedPage[] = [];

    for (let i = 0; i < targetServices.length; i++) {
      const service = targetServices[i];
      const progress = `[${i + 1}/${targetServices.length}]`;
      
      logger.info(`${progress} Scraping ${service.code.toUpperCase()} (${service.title})...`);
      
      const result = await this.scrapeService(service, {
        force,
        maxPages: maxPages ? maxPages - totalPages : undefined
      });

      results.push(result);
      totalPages += result.pagesScraped;

      // Collect failed pages
      if (result.failedPages) {
        totalFailed.push(...result.failedPages);
      }

      // Progress update
      if (maxPages && totalPages >= maxPages) {
        logger.info(`\n✓ Reached max pages limit (${maxPages})`);
        break;
      }

      // Service separator
      if (i < targetServices.length - 1) {
        logger.info(''); // Empty line
      }
    }

    // 4. Save final metadata
    this.saveFinalMetadata(results, catalog);

    // 5. Build result
    const duration = Date.now() - startTime;
    const scrapeResult: ScrapeResult = {
      totalServices: targetServices.length,
      totalPages,
      services: results,
      failedPages: {
        timestamp: new Date().toISOString(),
        totalFailed: totalFailed.length,
        pages: totalFailed
      },
      timestamp: new Date().toISOString(),
      durationMs: duration
    };

    // 6. Print summary
    this.printSummary(scrapeResult);

    return scrapeResult;
  }

  /**
   * Fetch and cache service catalog
   */
  private async fetchServiceCatalog(): Promise<ServiceCatalog | null> {
    try {
      const catalog = await this.catalogFetcher.fetchAllServices();
      
      // Save to disk
      const catalogPath = path.resolve('../rag_cache/service-catalog.json');
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
    options: { force?: boolean; maxPages?: number }
  ): Promise<ServiceScrapeResult & { failedPages?: FailedPage[] }> {
    const serviceStartTime = Date.now();
    const { force, maxPages } = options;
    const failedPages: FailedPage[] = [];

    try {
      // 1. Fetch page URLs
      const pages = await this.pageNavigator.fetchServicePages(service.code);
      
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

      // 4. Scrape pages
      let scraped = 0;
      let failed = 0;

      for (let i = 0; i < targetPages.length; i++) {
        const page = targetPages[i];
        const result = await this.scrapePage(page);

        if (result.success) {
          scraped++;
          // Remove from failed list if it was there
          this.failedStore.removeFailedPage(page.url);
        } else {
          failed++;
          // Add to failed list
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

        // Progress indicator
        if ((i + 1) % 10 === 0 || i === targetPages.length - 1) {
          const percent = Math.round(((i + 1) / targetPages.length) * 100);
          logger.progress(i + 1, targetPages.length, `Processing ${service.code}`);
        }
      }

      logger.clearLine();
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
