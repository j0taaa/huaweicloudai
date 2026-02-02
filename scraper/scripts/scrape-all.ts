#!/usr/bin/env node
/**
 * CLI script to run the Huawei Cloud Documentation Scraper
 */
import { Command } from 'commander';
import { HuaweiCloudScraper } from '../src/index.js';
import { logger } from '../src/utils/logger.js';

const program = new Command();

program
  .name('huaweicloud-scraper')
  .description('Scrape Huawei Cloud documentation for RAG system')
  .version('1.0.0')
  .option('-s, --services <services...>', 'Specific services to scrape (e.g., ecs obs vpc)')
  .option('-f, --force', 'Force re-scrape even if cached', false)
  .option('-m, --max-pages <number>', 'Maximum pages to scrape (for testing)', parseInt)
  .option('-v, --verbose', 'Enable verbose logging', false)
  .action(async (options) => {
    try {
      const scraper = new HuaweiCloudScraper();
      
      const scrapeOptions = {
        services: options.services,
        force: options.force,
        maxPages: options.maxPages,
        verbose: options.verbose
      };

      const result = await scraper.scrape(scrapeOptions);
      
      // Exit with error code if everything failed
      const allFailed = result.services.every(s => s.status === 'error');
      if (allFailed) {
        process.exit(1);
      }
      
      // Exit with warning code if some failed
      const someFailed = result.services.some(s => s.status === 'error' || s.status === 'partial');
      if (someFailed) {
        process.exit(0); // Still success, but with warnings logged
      }
      
      process.exit(0);
    } catch (error) {
      logger.error('Scraper failed:', error as Error);
      process.exit(1);
    }
  });

program.parse();
