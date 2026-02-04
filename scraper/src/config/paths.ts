import path from 'path';

/**
 * Centralized path configuration for RAG cache
 * Ensures consistent path resolution regardless of where scraper is run
 */

// Get project root (handles running from scraper/ or project root)
function getProjectRoot(): string {
  const cwd = process.cwd();
  
  // If running from scraper directory, go up one level
  if (cwd.endsWith('/scraper') || cwd.endsWith('\\scraper')) {
    return path.join(cwd, '..');
  }
  
  // Otherwise assume running from project root
  return cwd;
}

const PROJECT_ROOT = getProjectRoot();

// RAG cache root
export const RAG_CACHE_ROOT = path.join(PROJECT_ROOT, 'rag_cache');

// Individual storage paths
export const RAW_HTML_DIR = path.join(RAG_CACHE_ROOT, 'raw_html');
export const CLEAN_DOCS_DIR = path.join(RAG_CACHE_ROOT, 'clean_docs');
export const FAILED_PAGES_FILE = path.join(RAG_CACHE_ROOT, 'failed_pages.json');
export const SERVICE_CATALOG_FILE = path.join(RAG_CACHE_ROOT, 'service-catalog.json');

// Export for backward compatibility (optional parameter in constructors)
export { RAG_CACHE_ROOT as default };
