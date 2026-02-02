/**
 * Document Fetcher
 * Fetches individual documentation pages with rate limiting
 */
import type { RawHtmlDocument } from '../types/index.js';
import { logger } from '../utils/logger.js';
import { RateLimiter } from '../utils/rate-limiter.js';
import { withRetry, isRateLimitError, isNetworkError } from '../utils/retry-handler.js';

interface FetchOptions {
  rateLimiter: RateLimiter;
  timeoutMs?: number;
}

export class DocumentFetcher {
  private readonly timeoutMs: number;

  constructor(timeoutMs = 30000) {
    this.timeoutMs = timeoutMs;
  }

  /**
   * Fetch a single document page with rate limiting and retries
   */
  async fetchPage(
    url: string, 
    pageId: string, 
    serviceCode: string,
    options: FetchOptions
  ): Promise<{ success: true; data: RawHtmlDocument } | { success: false; error: string }> {
    const { rateLimiter } = options;

    return rateLimiter.execute(async () => {
      const result = await withRetry(
        async () => {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

          try {
            const response = await fetch(url, {
              signal: controller.signal,
              headers: {
                'Accept': 'text/html',
                'User-Agent': 'HuaweiCloud-Scraper/1.0'
              }
            });

            clearTimeout(timeout);

            if (!response.ok) {
              const error = new Error(`HTTP ${response.status}: ${response.statusText}`);
              (error as any).status = response.status;
              
              // Report rate limit to adjust speed
              if (isRateLimitError(error)) {
                rateLimiter.reportRateLimit();
              }
              
              throw error;
            }

            const html = await response.text();
            const headers: Record<string, string> = {};
            response.headers.forEach((value, key) => {
              headers[key] = value;
            });

            return {
              metadata: {
                id: pageId,
                url,
                service: serviceCode,
                status: response.status,
                headers,
                fetchedAt: new Date().toISOString(),
                contentType: headers['content-type'],
                contentLength: html.length
              },
              html
            };
          } catch (error) {
            clearTimeout(timeout);
            throw error;
          }
        },
        {
          maxRetries: 3,
          baseDelayMs: 1000,
          retryableStatuses: [408, 429, 500, 502, 503, 504],
          onRetry: (error, attempt) => {
            if (isRateLimitError(error)) {
              logger.debug(`Rate limit on ${url}, attempt ${attempt}/3`);
            } else if (isNetworkError(error)) {
              logger.debug(`Network error on ${url}, attempt ${attempt}/3: ${error.message}`);
            }
          }
        }
      );

      if (result.success) {
        return { success: true, data: result.data };
      } else {
        return { 
          success: false, 
          error: `Failed after ${result.attempts} attempts: ${result.error.message}` 
        };
      }
    }, `${serviceCode}/${pageId}`);
  }

  /**
   * Fetch multiple pages in parallel with rate limiting
   */
  async fetchPages(
    pages: Array<{ url: string; id: string; service: string }>,
    options: FetchOptions,
    onProgress?: (completed: number, total: number, current: string) => void
  ): Promise<Map<string, RawHtmlDocument>> {
    const results = new Map<string, RawHtmlDocument>();
    let completed = 0;
    const total = pages.length;

    const promises = pages.map(async (page) => {
      const result = await this.fetchPage(page.url, page.id, page.service, options);
      completed++;
      
      if (result.success) {
        results.set(page.id, result.data);
      }

      onProgress?.(completed, total, page.id);
      return result;
    });

    await Promise.all(promises);
    return results;
  }
}
