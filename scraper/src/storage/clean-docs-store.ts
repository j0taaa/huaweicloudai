/**
 * Clean Documents Storage
 * Stores cleaned markdown documents
 */
import fs from 'fs';
import path from 'path';
import type { CleanDocument, DocumentCategory } from '../types/index.js';
import { logger } from '../utils/logger.js';
import { CLEAN_DOCS_DIR } from '../config/paths.js';

export interface DocumentMetadata {
  id: string;
  url: string;
  title: string;
  service: string;
  category: DocumentCategory;
  handbookCode: string;
  contentLength: number;
  processedAt: string;
}

export class CleanDocsStore {
  private readonly baseDir: string;

  constructor() {
    this.baseDir = CLEAN_DOCS_DIR;
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
   * Save clean document
   */
  async saveDocument(doc: CleanDocument): Promise<void> {
    const serviceDir = this.getServiceDir(doc.metadata.service);
    
    if (!fs.existsSync(serviceDir)) {
      fs.mkdirSync(serviceDir, { recursive: true });
    }

    const basePath = path.join(serviceDir, doc.metadata.id);

    // Save markdown content
    const mdPath = `${basePath}.md`;
    fs.writeFileSync(mdPath, doc.content, 'utf8');

    // Save metadata
    const metaPath = `${basePath}.json`;
    fs.writeFileSync(metaPath, JSON.stringify(doc.metadata, null, 2), 'utf8');

    logger.debug(`Saved clean doc: ${doc.metadata.id} (${doc.content.length} chars)`);
  }

  /**
   * Check if document exists
   */
  exists(serviceCode: string, pageId: string): boolean {
    const mdPath = path.join(this.getServiceDir(serviceCode), `${pageId}.md`);
    return fs.existsSync(mdPath);
  }

  /**
   * Load all documents (for RAG generation)
   */
  async loadAllDocuments(): Promise<CleanDocument[]> {
    const docs: CleanDocument[] = [];
    const services = this.getServices();

    logger.info(`Loading documents from ${services.length} services...`);

    for (const service of services) {
      const pageIds = this.getServiceDocuments(service);
      
      for (const pageId of pageIds) {
        const doc = this.loadDocument(service, pageId);
        if (doc) {
          docs.push(doc);
        }
      }
    }

    logger.success(`Loaded ${docs.length} documents`);
    return docs;
  }

  /**
   * Load a single document
   */
  loadDocument(serviceCode: string, pageId: string): CleanDocument | null {
    const serviceDir = this.getServiceDir(serviceCode);
    const basePath = path.join(serviceDir, pageId);
    const mdPath = `${basePath}.md`;
    const metaPath = `${basePath}.json`;

    if (!fs.existsSync(mdPath) || !fs.existsSync(metaPath)) {
      return null;
    }

    try {
      const content = fs.readFileSync(mdPath, 'utf8');
      const metadata = JSON.parse(fs.readFileSync(metaPath, 'utf8'));

      return { content, metadata };
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
      .filter(name => name.endsWith('.md'))
      .map(name => name.replace('.md', ''));
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
   * Get count by service
   */
  getCountsByService(): Record<string, number> {
    const counts: Record<string, number> = {};
    const services = this.getServices();
    
    for (const service of services) {
      counts[service] = this.getServiceDocuments(service).length;
    }

    return counts;
  }

  /**
   * Save metadata about processing
   */
  saveMetadata(metadata: {
    timestamp: string;
    totalServices: number;
    totalDocuments: number;
    services: Record<string, number>;
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
