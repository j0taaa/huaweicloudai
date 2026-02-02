/**
 * Page Navigator
 * Fetches and parses service navigation to extract all documentation page URLs
 */
import * as cheerio from 'cheerio';
import type { DocumentPage, Service } from '../types/index.js';
import { ServiceCatalogFetcher } from './service-catalog.js';
import { logger } from '../utils/logger.js';
import { withRetryThrow, isRateLimitError } from '../utils/retry-handler.js';

export class PageNavigator {
  private readonly baseUrl: string;

  constructor(baseUrl = 'https://support.huaweicloud.com/intl/en-us') {
    this.baseUrl = baseUrl;
  }

  /**
   * Generate page ID from URL
   */
  private generatePageId(url: string): string {
    // Extract meaningful ID from URL
    const urlObj = new URL(url);
    const pathParts = urlObj.pathname.split('/');
    const filename = pathParts[pathParts.length - 1];
    
    // Remove .html extension
    const name = filename.replace('.html', '');
    
    // Create safe ID
    return name.replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase();
  }

  /**
   * Fetch all page URLs for a service
   */
  async fetchServicePages(serviceCode: string): Promise<DocumentPage[]> {
    const url = `${this.baseUrl}/${serviceCode}/v3_support_leftmenu_fragment.html`;
    
    logger.debug(`Fetching navigation for ${serviceCode} from ${url}`);

    try {
      const html = await withRetryThrow(
        async () => {
          const response = await fetch(url, {
            headers: {
              'Accept': 'text/html',
              'User-Agent': 'HuaweiCloud-Scraper/1.0'
            }
          });

          if (!response.ok) {
            if (response.status === 404) {
              // Some services may not have documentation
              logger.warn(`No documentation found for service: ${serviceCode} (404)`);
              return '';
            }

            const error = new Error(`HTTP ${response.status}: ${response.statusText}`);
            (error as any).status = response.status;
            throw error;
          }

          return response.text();
        },
        {
          maxRetries: 3,
          baseDelayMs: 1000,
          onRetry: (error, attempt) => {
            if (isRateLimitError(error)) {
              logger.warn(`Rate limit hit for ${serviceCode}, will back off`);
            } else {
              logger.debug(`Retry ${attempt}/3 for ${serviceCode}: ${error.message}`);
            }
          }
        }
      );

      if (!html) {
        return [];
      }

      return this.parseNavigation(html, serviceCode);
    } catch (error) {
      logger.error(`Failed to fetch navigation for ${serviceCode}: ${(error as Error).message}`);
      return [];
    }
  }

  /**
   * Parse navigation HTML to extract page URLs
   */
  private parseNavigation(html: string, serviceCode: string): DocumentPage[] {
    const $ = cheerio.load(html);
    const pages: DocumentPage[] = [];
    const seenUrls = new Set<string>();

    // Find all navigation items
    $('li.nav-item').each((_: number, element: any) => {
      const $item = $(element);
      const $link = $item.find('a.js-title');

      if (!$link.length) return;

      const href = $link.attr('href') || '';
      const pHref = $link.attr('p-href') || '';

      // Skip parent/expandable nodes (javascript: links)
      if (href.startsWith('javascript:') || (!href && !pHref)) {
        return;
      }

      // Get the actual URL
      let url = href.startsWith('http') ? href : pHref;
      if (!url) return;

      // Normalize URL to en-us
      url = url.replace(/\/pt-br\//, '/en-us/');

      // Skip duplicates
      if (seenUrls.has(url)) return;
      seenUrls.add(url);

      // Extract navigation level from class names
      const itemClasses = $item.attr('class') || '';
      const levelMatch = itemClasses.match(/level(\d)/);
      const level = levelMatch ? parseInt(levelMatch[1]) : 1;
      
      const title = $link.text().trim();
      const handbookCode = $link.attr('data-handbookcode') || '';
      const category = ServiceCatalogFetcher.extractCategory(handbookCode);

      pages.push({
        id: this.generatePageId(url),
        url,
        title,
        service: serviceCode,
        category,
        handbookCode,
        level,
        status: 'pending'
      });
    });

    logger.debug(`Found ${pages.length} pages for ${serviceCode}`);
    return pages;
  }

  /**
   * Fetch pages for multiple services
   */
  async fetchMultipleServices(services: Service[]): Promise<Map<string, DocumentPage[]>> {
    const results = new Map<string, DocumentPage[]>();

    for (const service of services) {
      const pages = await this.fetchServicePages(service.code);
      results.set(service.code, pages);
    }

    return results;
  }
}
