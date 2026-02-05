/**
 * Failed Pages Storage
 * Tracks pages that failed to scrape for later retry
 */
import fs from 'fs';
import path from 'path';
import type { FailedPage, FailedPagesLog } from '../types/index.js';
import { logger } from '../utils/logger.js';
import { FAILED_PAGES_FILE } from '../config/paths.js';

export class FailedPagesStore {
  private readonly filePath: string;

  constructor() {
    this.filePath = FAILED_PAGES_FILE;
    this.ensureDirectory();
  }

  private ensureDirectory(): void {
    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  /**
   * Load failed pages log
   */
  load(): FailedPagesLog {
    if (!fs.existsSync(this.filePath)) {
      return {
        timestamp: new Date().toISOString(),
        totalFailed: 0,
        pages: []
      };
    }

    try {
      const data = JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
      return {
        timestamp: data.timestamp || new Date().toISOString(),
        totalFailed: data.totalFailed || 0,
        pages: data.pages || []
      };
    } catch (error) {
      logger.error('Error loading failed pages log:', error as Error);
      return {
        timestamp: new Date().toISOString(),
        totalFailed: 0,
        pages: []
      };
    }
  }

  /**
   * Save failed pages log
   */
  save(log: FailedPagesLog): void {
    fs.writeFileSync(this.filePath, JSON.stringify(log, null, 2), 'utf8');
  }

  /**
   * Add a failed page
   */
  addFailedPage(page: Omit<FailedPage, 'lastAttempt'> & { lastAttempt?: string }): void {
    const log = this.load();
    
    // Check if page already exists
    const existingIndex = log.pages.findIndex(p => p.url === page.url);
    
    const failedPage: FailedPage = {
      ...page,
      lastAttempt: page.lastAttempt || new Date().toISOString()
    };

    if (existingIndex >= 0) {
      // Update existing entry
      log.pages[existingIndex] = failedPage;
    } else {
      // Add new entry
      log.pages.push(failedPage);
    }

    log.totalFailed = log.pages.length;
    log.timestamp = new Date().toISOString();

    this.save(log);
    logger.debug(`Logged failed page: ${page.url}`);
  }

  /**
   * Remove a page from failed list (when it succeeds on retry)
   */
  removeFailedPage(url: string): void {
    const log = this.load();
    const initialCount = log.pages.length;
    
    log.pages = log.pages.filter(p => p.url !== url);
    
    if (log.pages.length < initialCount) {
      log.totalFailed = log.pages.length;
      this.save(log);
      logger.debug(`Removed from failed list: ${url}`);
    }
  }

  /**
   * Get all failed pages
   */
  getFailedPages(): FailedPage[] {
    return this.load().pages;
  }

  /**
   * Get failed pages for a specific service
   */
  getFailedPagesForService(serviceCode: string): FailedPage[] {
    return this.load().pages.filter(p => p.service === serviceCode);
  }

  /**
   * Check if a page is in the failed list
   */
  isFailed(url: string): boolean {
    return this.load().pages.some(p => p.url === url);
  }

  /**
   * Get total count of failed pages
   */
  getFailedCount(): number {
    return this.load().totalFailed;
  }

  /**
   * Clear all failed pages
   */
  clear(): void {
    this.save({
      timestamp: new Date().toISOString(),
      totalFailed: 0,
      pages: []
    });
    logger.info('Cleared failed pages log');
  }

  /**
   * Get pages that should be retried (failed with willRetry flag or recent failures)
   */
  getRetryablePages(): FailedPage[] {
    const log = this.load();
    const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

    return log.pages.filter(p => {
      // Retry if marked for retry
      if (p.willRetry) return true;

      // Retry if last attempt was more than a week ago
      const lastAttempt = new Date(p.lastAttempt).getTime();
      if (lastAttempt < oneWeekAgo) return true;

      return false;
    });
  }
}
