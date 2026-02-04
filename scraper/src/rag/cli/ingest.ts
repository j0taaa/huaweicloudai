#!/usr/bin/env node
import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import fs from 'fs/promises';
import path from 'path';
import { glob } from 'glob';
import { Embedder } from '../embeddings/embedder.js';
import { ChromaStore } from '../vector-store/chroma-store.js';
import { SemanticChunker } from '../chunker/semantic-chunker.js';
import { Document, DocumentChunk, IngestionStats } from '../types.js';
import { RAG_CONFIG } from '../config.js';

const program = new Command();

program
  .name('rag:ingest')
  .description('Ingest documents into the RAG vector store')
  .option('-b, --batch-size <number>', 'Batch size for processing', '64')
  .option('--clear', 'Clear existing collection before ingestion')
  .option('--dry-run', 'Show what would be processed without actually ingesting')
  .action(async (options) => {
    const batchSize = parseInt(options.batchSize);
    const spinner = ora();
    
    try {
      console.log(chalk.bold('\n📚 RAG Document Ingestion\n'));
      
      // Initialize stats
      const stats: IngestionStats = {
        totalDocuments: 0,
        totalChunks: 0,
        processedDocuments: 0,
        failedDocuments: 0,
        startTime: new Date(),
        errors: [],
      };

      // Find all markdown files
      spinner.start('Scanning for documents...');
      const docFiles = await glob('**/*.md', {
        cwd: RAG_CONFIG.DOCS_PATH,
        absolute: true,
      });
      stats.totalDocuments = docFiles.length;
      spinner.succeed(`Found ${chalk.cyan(docFiles.length.toLocaleString())} documents`);

      if (options.dryRun) {
        console.log(chalk.yellow('\nDry run - would process:'));
        console.log(`  - ${docFiles.length} documents`);
        console.log(`  - Estimated ~${Math.round(docFiles.length * 2.5)} chunks`);
        return;
      }

      // Initialize embedder
      spinner.start('Loading embedding model...');
      const embedder = new Embedder();
      await embedder.load();
      spinner.succeed(`Model loaded: ${chalk.cyan(embedder.getModelInfo().name)}`);

      // Initialize ChromaDB
      spinner.start('Connecting to ChromaDB...');
      const store = new ChromaStore(embedder);
      await store.initialize();
      spinner.succeed('ChromaDB connected');

      // Clear if requested
      if (options.clear) {
        spinner.start('Clearing existing collection...');
        await store.clear();
        spinner.succeed('Collection cleared');
      }

      // Initialize chunker
      const chunker = new SemanticChunker(
        RAG_CONFIG.TARGET_CHUNK_SIZE,
        RAG_CONFIG.MAX_CHUNK_SIZE,
        RAG_CONFIG.MIN_CHUNK_SIZE
      );

      // Process documents in batches
      console.log(chalk.bold('\nProcessing documents...\n'));
      
      const serviceDocs = new Map<string, string[]>();
      
      // Group by service (limit to first 10 services for testing if TEST_MODE env var is set)
      const testMode = process.env.TEST_MODE === 'true';
      const maxServices = testMode ? 5 : undefined;
      
      for (const filePath of docFiles) {
        const relativePath = path.relative(RAG_CONFIG.DOCS_PATH, filePath);
        const service = relativePath.split(path.sep)[0];
        
        if (!serviceDocs.has(service)) {
          serviceDocs.set(service, []);
        }
        serviceDocs.get(service)!.push(filePath);
      }
      
      // Limit services in test mode
      if (testMode && maxServices) {
        const limitedServices = new Map([...serviceDocs.entries()].slice(0, maxServices));
        serviceDocs.clear();
        limitedServices.forEach((v, k) => serviceDocs.set(k, v));
        console.log(chalk.yellow(`\nTEST MODE: Limited to ${maxServices} services\n`));
      }

      console.log(`Found ${chalk.cyan(serviceDocs.size.toString())} services\n`);

      // Process each service
      let serviceNum = 0;
      for (const [service, files] of serviceDocs) {
        serviceNum++;
        console.log(chalk.bold(`[${serviceNum}/${serviceDocs.size}] Service: ${chalk.cyan(service)}`));
        console.log(`  Documents: ${files.length}`);
        
        // Process files
        let processedCount = 0;
        for (const filePath of files) {
          try {
            const content = await fs.readFile(filePath, 'utf-8');
            const pageId = path.basename(filePath, '.md');
            
            // Load metadata if exists
            const metaPath = filePath.replace('.md', '.json');
            let metadata: any = {};
            try {
              const metaContent = await fs.readFile(metaPath, 'utf-8');
              metadata = JSON.parse(metaContent);
            } catch {
              // Metadata file might not exist
            }

            const doc: Document = {
              service,
              pageId,
              content,
              metadata: {
                url: metadata.url || '',
                title: metadata.title || '',
              },
            };

            // Chunk the document
            const chunks = chunker.chunkDocument(doc);
            
            if (chunks.length > 0) {
              // Generate embeddings
              const embeddings = await embedder.embedChunks(chunks, RAG_CONFIG.EMBEDDING_BATCH_SIZE);
              
              // Add to store
              await store.addChunks(chunks, embeddings);
              
              stats.totalChunks += chunks.length;
            }

            stats.processedDocuments++;
            processedCount++;
            
            // Progress update every 10 docs
            if (processedCount % 10 === 0) {
              process.stdout.write(`  Progress: ${processedCount}/${files.length}\r`);
            }
          } catch (error) {
            stats.failedDocuments++;
            stats.errors.push(`${filePath}: ${error instanceof Error ? error.message : String(error)}`);
          }
        }

        console.log(`  ✓ Completed: ${processedCount} docs, ${stats.totalChunks} total chunks\n`);
      }

      stats.endTime = new Date();
      
      // Print summary
      console.log(chalk.bold('\n✅ Ingestion Complete\n'));
      console.log(`  Documents processed: ${chalk.green(stats.processedDocuments.toLocaleString())}`);
      console.log(`  Documents failed:    ${chalk.red(stats.failedDocuments.toLocaleString())}`);
      console.log(`  Total chunks:        ${chalk.cyan(stats.totalChunks.toLocaleString())}`);
      
      const duration = (stats.endTime.getTime() - stats.startTime.getTime()) / 1000;
      console.log(`  Duration:            ${chalk.cyan(Math.round(duration))} seconds`);
      console.log(`  Avg chunks/doc:      ${chalk.cyan((stats.totalChunks / stats.processedDocuments).toFixed(1))}`);

      // Get final collection stats
      const collectionStats = await store.getStats();
      console.log(`\n  Collection size:     ${chalk.cyan(collectionStats.count.toLocaleString())} vectors`);

      // Save stats to file
      const statsPath = path.join(RAG_CONFIG.LOGS_PATH, 'ingestion-stats.json');
      await fs.mkdir(path.dirname(statsPath), { recursive: true });
      await fs.writeFile(statsPath, JSON.stringify(stats, null, 2));
      console.log(`\n  Stats saved to: ${chalk.dim(statsPath)}`);

      if (stats.errors.length > 0) {
        const errorPath = path.join(RAG_CONFIG.LOGS_PATH, 'ingestion-errors.log');
        await fs.writeFile(errorPath, stats.errors.join('\n'));
        console.log(`  Errors saved to: ${chalk.dim(errorPath)}`);
      }

    } catch (error) {
      spinner.fail(chalk.red(`Error: ${error instanceof Error ? error.message : String(error)}`));
      process.exit(1);
    }
  });

program.parse();
