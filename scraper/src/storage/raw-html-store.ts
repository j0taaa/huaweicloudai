/**
 * Raw HTML Storage
 * Stores raw HTML responses for debugging and reprocessing
 */
import fs from 'fs';
import path from 'path';
import type { RawHtmlDocument } from '../types/index.js';
import { logger } from '../utils/logger.js';
import { RAW_HTML_DIR } from '../config/paths.js';

export class RawHtmlStore {
  private readonly baseDir: string;

  constructor() {
    this.baseDir = RAW_HTML_DIR;
    this.ensureDirectory();
  }

  private ensureDirectory(): void {
    if (!fs.existsSync(this.baseDir)) {
      fs.mkdirSync(this.baseDir, { recursive: true });
    }
  }

  /**
   * Get service directory path
   */
  private getServiceDir(serviceCode: string): string {
    return path.join(this.baseDir, serviceCode);
  }

  /**
   * Save raw HTML document
   */
  async saveDocument(doc: RawHtmlDocument): Promise<void> {
    const serviceDir = this.getServiceDir(doc.metadata.service);
    
    if (!fs.existsSync(serviceDir)) {
      fs.mkdirSync(serviceDir, { recursive: true });
    }

    const basePath = path.join(serviceDir, doc.metadata.id);

    // Save HTML content
    const htmlPath = `${basePath}.html`;
    fs.writeFileSync(htmlPath, doc.html, 'utf8');

    // Save metadata
    const metaPath = `${basePath}.json`;
    fs.writeFileSync(metaPath, JSON.stringify(doc.metadata, null, 2), 'utf8');

    logger.debug(`Saved raw HTML: ${doc.metadata.id} (${doc.html.length} chars)`);
  }

  /**
   * Check if document exists
   */
  exists(serviceCode: string, pageId: string): boolean {
    const htmlPath = path.join(this.getServiceDir(serviceCode), `${pageId}.html`);
    return fs.existsSync(htmlPath);
  }

  /**
   * Load document if it exists
   */
  loadDocument(serviceCode: string, pageId: string): RawHtmlDocument | null {
    const serviceDir = this.getServiceDir(serviceCode);
    const basePath = path.join(serviceDir, pageId);
    const htmlPath = `${basePath}.html`;
    const metaPath = `${basePath}.json`;

    if (!fs.existsSync(htmlPath) || !fs.existsSync(metaPath)) {
      return null;
    }

    try {
      const html = fs.readFileSync(htmlPath, 'utf8');
      const metadata = JSON.parse(fs.readFileSync(metaPath, 'utf8'));

      return { html, metadata };
    } catch (error) {
      logger.error(`Error loading document ${pageId}:`, error as Error);
      return null;
    }
  }

  /**
   * Get all service directories
   */
  getServices(): string[] {
    if (!fs.existsSync(this.baseDir)) return [];
    
    return fs.readdirSync(this.baseDir)
      .filter(name => {
        const fullPath = path.join(this.baseDir, name);
        return fs.statSync(fullPath).isDirectory();
      });
  }

  /**
   * Get all documents for a service
   */
  getServiceDocuments(serviceCode: string): string[] {
    const serviceDir = this.getServiceDir(serviceCode);
    
    if (!fs.existsSync(serviceDir)) return [];

    return fs.readdirSync(serviceDir)
      .filter(name => name.endsWith('.html'))
      .map(name => name.replace('.html', ''));
  }

  /**
   * Get total document count
   */
  getTotalCount(): number {
    let count = 0;
    const services = this.getServices();
    
    for (const service of services) {
      count += this.getServiceDocuments(service).length;
    }

    return count;
  }

  /**
   * Save metadata about the scrape
   */
  saveMetadata(metadata: {
    timestamp: string;
    totalServices: number;
    totalDocuments: number;
    services: string[];
  }): void {
    const metaPath = path.join(this.baseDir, 'metadata.json');
    fs.writeFileSync(metaPath, JSON.stringify(metadata, null, 2), 'utf8');
  }

  /**
   * Load metadata
   */
  loadMetadata(): any | null {
    const metaPath = path.join(this.baseDir, 'metadata.json');
    
    if (!fs.existsSync(metaPath)) return null;

    try {
      return JSON.parse(fs.readFileSync(metaPath, 'utf8'));
    } catch {
      return null;
    }
  }
}
