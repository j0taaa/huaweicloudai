import MarkdownIt from 'markdown-it';
import { DocumentChunk, Document } from '../types.js';

const md = new MarkdownIt();

interface HeaderInfo {
  level: number;
  text: string;
  position: number;
}

interface Section {
  headers: HeaderInfo[];
  content: string;
  level: number;
}

export class SemanticChunker {
  private targetSize: number;
  private maxSize: number;
  private minSize: number;

  constructor(targetSize = 500, maxSize = 1000, minSize = 100) {
    this.targetSize = targetSize;
    this.maxSize = maxSize;
    this.minSize = minSize;
  }

  /**
   * Chunk a document by semantic sections (headers)
   */
  chunkDocument(doc: Document): DocumentChunk[] {
    const tokens = this.tokenize(doc.content);
    const headers = this.extractHeaders(doc.content);
    const sections = this.splitByHeaders(doc.content, headers);
    
    const chunks: DocumentChunk[] = [];
    let position = 0;

    for (const section of sections) {
      const sectionTokens = this.tokenize(section.content);
      
      // Skip sections that are too small
      if (sectionTokens.length < this.minSize) {
        continue;
      }

      // Split large sections
      if (sectionTokens.length > this.maxSize) {
        const subChunks = this.splitLargeSection(section, position);
        chunks.push(...subChunks);
        position += subChunks.length;
      } else {
        const chunk: DocumentChunk = {
          id: `${doc.service}_${doc.pageId}_chunk${position}`,
          content: this.cleanContent(section.content),
          service: doc.service,
          pageId: doc.pageId,
          headers: section.headers.map(h => h.text),
          url: doc.metadata.url,
          position,
          tokenCount: sectionTokens.length,
        };
        chunks.push(chunk);
        position++;
      }
    }

    return chunks;
  }

  /**
   * Extract all headers from markdown content
   */
  private extractHeaders(content: string): HeaderInfo[] {
    const headers: HeaderInfo[] = [];
    const lines = content.split('\n');
    let position = 0;

    for (const line of lines) {
      const match = line.match(/^(#{1,6})\s+(.+)$/);
      if (match) {
        headers.push({
          level: match[1].length,
          text: match[2].trim(),
          position,
        });
      }
      position += line.length + 1;
    }

    return headers;
  }

  /**
   * Split content by headers into sections
   */
  private splitByHeaders(content: string, headers: HeaderInfo[]): Section[] {
    if (headers.length === 0) {
      return [{
        headers: [],
        content: content.trim(),
        level: 0,
      }];
    }

    const sections: Section[] = [];
    const headerStack: HeaderInfo[] = [];

    for (let i = 0; i < headers.length; i++) {
      const currentHeader = headers[i];
      const nextHeader = headers[i + 1];
      
      // Update header stack based on levels
      while (headerStack.length > 0 && 
             headerStack[headerStack.length - 1].level >= currentHeader.level) {
        headerStack.pop();
      }
      headerStack.push(currentHeader);

      // Extract content for this section
      const startPos = content.indexOf(currentHeader.text, currentHeader.position) + 
                       currentHeader.text.length;
      const endPos = nextHeader ? nextHeader.position : content.length;
      const sectionContent = content.slice(startPos, endPos).trim();

      if (sectionContent.length > 0) {
        sections.push({
          headers: [...headerStack],
          content: this.formatSection(headerStack, sectionContent),
          level: currentHeader.level,
        });
      }
    }

    // If no sections were created, use the whole content
    if (sections.length === 0) {
      sections.push({
        headers: [],
        content: content.trim(),
        level: 0,
      });
    }

    return sections;
  }

  /**
   * Format a section with its headers as context
   */
  private formatSection(headers: HeaderInfo[], content: string): string {
    const headerText = headers.map(h => '#'.repeat(h.level) + ' ' + h.text).join('\n');
    return headerText + '\n\n' + content;
  }

  /**
   * Split a large section into smaller chunks
   */
  private splitLargeSection(section: Section, startPosition: number): DocumentChunk[] {
    const chunks: DocumentChunk[] = [];
    const content = section.content;
    const paragraphs = content.split(/\n\n+/);
    
    let currentContent = '';
    let currentTokens = 0;
    let position = startPosition;

    for (const paragraph of paragraphs) {
      const paraTokens = this.tokenize(paragraph).length;
      
      if (currentTokens + paraTokens > this.maxSize && currentTokens > 0) {
        // Save current chunk
        chunks.push({
          id: `chunk${position}`,
          content: this.cleanContent(currentContent),
          service: '', // Will be set by caller
          pageId: '',
          headers: section.headers.map(h => h.text),
          url: '',
          position,
          tokenCount: currentTokens,
        });
        
        currentContent = paragraph;
        currentTokens = paraTokens;
        position++;
      } else {
        currentContent += (currentContent ? '\n\n' : '') + paragraph;
        currentTokens += paraTokens;
      }
    }

    // Don't forget the last chunk
    if (currentTokens >= this.minSize) {
      chunks.push({
        id: `chunk${position}`,
        content: this.cleanContent(currentContent),
        service: '',
        pageId: '',
        headers: section.headers.map(h => h.text),
        url: '',
        position,
        tokenCount: currentTokens,
      });
    }

    return chunks;
  }

  /**
   * Simple tokenization (split by whitespace and punctuation)
   */
  private tokenize(text: string): string[] {
    return text
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(t => t.length > 0);
  }

  /**
   * Clean up content (remove extra whitespace, etc.)
   */
  private cleanContent(content: string): string {
    return content
      .replace(/\n{3,}/g, '\n\n')
      .replace(/\s+/g, ' ')
      .trim();
  }
}

// Helper function for simple use
export function chunkDocument(doc: Document, targetSize = 500, maxSize = 1000, minSize = 100): DocumentChunk[] {
  const chunker = new SemanticChunker(targetSize, maxSize, minSize);
  return chunker.chunkDocument(doc);
}
