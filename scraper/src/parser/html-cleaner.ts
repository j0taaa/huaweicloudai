/**
 * HTML Cleaner
 * Removes boilerplate elements from documentation pages
 */
import * as cheerio from 'cheerio';
import { logger } from '../utils/logger.js';

// CSS selectors for content areas (in priority order)
const CONTENT_SELECTORS = [
  // Primary content areas
  '.help-doc-content',
  '.documentation-content', 
  '#doc-content',
  'article.main-content',
  '.main-content',
  
  // Secondary fallbacks
  '.content-wrapper',
  '.help-content',
  '[class*="content"] article',
  
  // Huawei Cloud specific selectors
  '.doc-content',
  '.article-content',
  '.help-detail-content',
  
  // Last resort: body with removals
  'body'
];

// Elements to remove
const REMOVE_SELECTORS = [
  // Navigation
  'header', 'nav', 'aside', '.sidebar', '.navigation',
  '.left-nav', '.right-nav', '.side-nav',
  '.breadcrumb', '.breadcrumbs',
  '.menu', '.main-menu', '.side-menu',
  
  // Headers and footers
  'footer', '.footer', '#footer',
  '.site-header', '.page-header',
  
  // Interactive elements
  '.social-media', '.share-buttons',
  '.search-box', '#search', '.search-form',
  '.cookie-banner', '.gdpr', '.cookie-consent',
  '.helpful-widget', '.feedback', '.rate-this-page',
  
  // Ads and promotions
  '.advertisement', '.ads', '.promo', '.promotion',
  
  // Scripts and styles
  'script', 'style', 'noscript', 'link[rel="stylesheet"]',
  
  // Meta elements
  'meta', 'base',
  
  // Comments
  'comment',
  
  // Empty elements
  'div:empty', 'p:empty', 'span:empty'
];

export class HtmlCleaner {
  /**
   * Clean HTML by removing boilerplate and extracting main content
   */
  clean(html: string): string {
    try {
      const $ = cheerio.load(html);

      // Remove unwanted elements
      REMOVE_SELECTORS.forEach(selector => {
        try {
          $(selector).remove();
        } catch (e) {
          // Ignore errors for individual selectors
        }
      });

      // Remove comments
      $('*').contents().filter(function(this: { type?: string }) {
        return this.type === 'comment';
      }).remove();

      // Find main content
      let $content: cheerio.Cheerio<any> | null = null;
      
      for (const selector of CONTENT_SELECTORS) {
        const $found = $(selector);
        if ($found.length > 0) {
          // Check if it has substantial content
          const text = $found.text().trim();
          if (text.length > 100) {
            $content = $found.first();
            break;
          }
        }
      }

      if (!$content || $content.length === 0) {
        // Fallback: use body but keep only text content
        $content = $('body');
        
        if ($content.length === 0) {
          logger.warn('No content found in HTML');
          return '';
        }
      }

      // Clean up the content
      let content = $content.html() || '';

      // Remove data attributes and event handlers
      content = content.replace(/\s(data-[a-z0-9-]+|on[a-z]+)="[^"]*"/gi, '');
      
      // Clean up excessive whitespace
      content = content
        .replace(/\n\s*\n\s*\n/g, '\n\n')  // Remove triple newlines
        .replace(/[ \t]+/g, ' ')            // Normalize spaces
        .trim();

      return content;
    } catch (error) {
      logger.error('Error cleaning HTML:', error as Error);
      return '';
    }
  }

  /**
   * Extract title from HTML
   */
  extractTitle(html: string): string {
    try {
      const $ = cheerio.load(html);
      
      // Try various title selectors
      const title = 
        $('h1').first().text().trim() ||
        $('h2').first().text().trim() ||
        $('title').text().trim() ||
        $('.doc-title').first().text().trim() ||
        $('.article-title').first().text().trim() ||
        'Untitled';

      return title;
    } catch (error) {
      return 'Untitled';
    }
  }
}
