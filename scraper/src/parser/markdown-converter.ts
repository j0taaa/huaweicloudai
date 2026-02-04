/**
 * Markdown Converter
 * Converts cleaned HTML to markdown format
 */
import TurndownService from 'turndown';
import { logger } from '../utils/logger.js';

export class MarkdownConverter {
  private turndown: TurndownService;

  constructor() {
    this.turndown = new TurndownService({
      headingStyle: 'atx',
      codeBlockStyle: 'fenced',
      bulletListMarker: '-',
      strongDelimiter: '**',
      emDelimiter: '_'
    });

    // Custom rules for better markdown conversion
    this.setupRules();
  }

  private setupRules(): void {
    // Handle code blocks with language specification
    this.turndown.addRule('codeBlocks', {
      filter: 'pre',
      replacement: (content: string, node: HTMLElement) => {
        const $node = node as HTMLElement;
        let language = '';
        
        // Try to detect language from class
        const className = $node.getAttribute('class') || '';
        const code = $node.querySelector('code');
        const codeClass = code?.getAttribute('class') || '';
        
        // Extract language from class names like "language-python", "lang-js", "code-bash"
        const langMatch = (className + ' ' + codeClass).match(/(?:language|lang)-([a-z0-9]+)/i);
        if (langMatch) {
          language = langMatch[1];
        }

        // Clean content
        const cleanContent = content
          .replace(/^\n+|\n+$/g, '')  // Remove leading/trailing newlines
          .replace(/\n{3,}/g, '\n\n'); // Normalize multiple newlines

        return `\n\n\`\`\`${language}\n${cleanContent}\n\`\`\`\n\n`;
      }
    });

    // Handle tables - preserve them as markdown tables
    this.turndown.addRule('tables', {
      filter: 'table',
      replacement: (content: string, node: HTMLElement) => {
        // Let default table handling work, but add spacing
        return '\n\n' + content + '\n\n';
      }
    });

    // Remove empty links
    this.turndown.addRule('emptyLinks', {
      filter: (node: HTMLElement) => {
        return node.nodeName === 'A' && !node.textContent?.trim();
      },
      replacement: () => ''
    });

    // Preserve image alt text and URLs
    this.turndown.addRule('images', {
      filter: 'img',
      replacement: (content: string, node: HTMLElement) => {
        const $node = node as HTMLImageElement;
        const alt = $node.getAttribute('alt') || '';
        const src = $node.getAttribute('src') || '';
        
        if (!src) return '';
        
        return `![${alt}](${src})`;
      }
    });
  }

  /**
   * Convert HTML to markdown
   */
  convert(html: string): string {
    try {
      if (!html || html.trim().length === 0) {
        return '';
      }

      let markdown = this.turndown.turndown(html);

      // Post-processing cleanup
      markdown = this.postProcess(markdown);

      return markdown;
    } catch (error) {
      logger.error('Error converting HTML to markdown:', error as Error);
      return '';
    }
  }

  /**
   * Post-process markdown for better formatting
   */
  private postProcess(markdown: string): string {
    return markdown
      // Remove excessive blank lines
      .replace(/\n{4,}/g, '\n\n\n')
      // Fix heading spacing
      .replace(/^(#{1,6})\s+/gm, '$1 ')
      // Remove trailing whitespace
      .replace(/[ \t]+$/gm, '')
      // Normalize code block spacing
      .replace(/```\n\n+/g, '```\n')
      .replace(/\n\n+```/g, '\n\n```')
      // Trim
      .trim();
  }
}
