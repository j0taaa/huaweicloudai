#!/usr/bin/env node
import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import readline from 'readline';
import { Embedder } from '../embeddings/embedder.js';
import { ChromaStore } from '../vector-store/chroma-store.js';
import { RAG_CONFIG } from '../config.js';

const program = new Command();

program
  .name('rag:query')
  .description('Query the RAG system')
  .option('-q, --query <text>', 'Query text (if not provided, enters interactive mode)')
  .option('-k, --top-k <number>', 'Number of results to return', '5')
  .option('-s, --service <name>', 'Filter by service name')
  .option('--no-interactive', 'Exit after single query')
  .option('--format <type>', 'Output format (table|json|compact)', 'table')
  .action(async (options) => {
    const spinner = ora();
    
    try {
      console.log(chalk.bold('\n🔍 RAG Query Interface\n'));
      
      // Initialize embedder
      spinner.start('Loading embedding model...');
      const embedder = new Embedder();
      await embedder.load();
      spinner.succeed(`Model ready: ${chalk.cyan(embedder.getModelInfo().name)}`);

      // Initialize ChromaDB
      spinner.start('Connecting to ChromaDB...');
      const store = new ChromaStore(embedder);
      await store.initialize();
      const stats = await store.getStats();
      spinner.succeed(`Connected: ${chalk.cyan(stats.count.toLocaleString())} vectors available`);

      // If query provided, run once
      if (options.query) {
        await executeQuery(store, options.query, {
          topK: parseInt(options.topK),
          filter: options.service ? { service: options.service } : undefined,
        }, options.format);
        
        if (options.noInteractive) {
          return;
        }
      }

      // Interactive mode
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });

      console.log(chalk.dim('\nEnter your query (or type "quit" to exit):\n'));

      const askQuestion = () => {
        return new Promise<string>((resolve) => {
          rl.question(chalk.cyan('Query: '), (answer) => {
            resolve(answer.trim());
          });
        });
      };

      while (true) {
        const query = await askQuestion();
        
        if (query.toLowerCase() === 'quit' || query.toLowerCase() === 'exit') {
          console.log(chalk.green('\nGoodbye! 👋'));
          break;
        }

        if (!query) {
          continue;
        }

        await executeQuery(store, query, {
          topK: parseInt(options.topK),
          filter: options.service ? { service: options.service } : undefined,
        }, options.format);
      }

      rl.close();

    } catch (error) {
      spinner.fail(chalk.red(`Error: ${error instanceof Error ? error.message : String(error)}`));
      process.exit(1);
    }
  });

async function executeQuery(
  store: ChromaStore,
  query: string,
  options: { topK: number; filter?: { service?: string } },
  format: string
) {
  const startTime = Date.now();
  
  try {
    const results = await store.search(query, options);
    const latency = Date.now() - startTime;

    if (format === 'json') {
      console.log(JSON.stringify({
        query,
        latency,
        results: results.map(r => ({
          id: r.chunk.id,
          service: r.chunk.service,
          pageId: r.chunk.pageId,
          score: r.score,
          headers: r.chunk.headers,
          content: r.chunk.content.substring(0, 500) + (r.chunk.content.length > 500 ? '...' : ''),
          url: r.chunk.url,
        })),
      }, null, 2));
    } else if (format === 'compact') {
      console.log(chalk.bold(`\nQuery: "${query}" (${latency}ms)\n`));
      results.forEach((r, i) => {
        console.log(`${i + 1}. [${chalk.cyan(r.chunk.service)}] ${r.chunk.headers.join(' > ')}`);
        console.log(`   Score: ${(r.score * 100).toFixed(1)}% | ${r.chunk.url}`);
      });
    } else {
      // Table format (default)
      console.log(chalk.bold(`\nQuery: "${query}"\n`));
      console.log(chalk.dim(`Found ${results.length} results in ${latency}ms\n`));

      results.forEach((result, index) => {
        const rank = index + 1;
        const score = (result.score * 100).toFixed(1);
        const service = result.chunk.service;
        const headers = result.chunk.headers.join(' > ') || 'No headers';
        
        console.log(chalk.bold(`${rank}. ${headers}`));
        console.log(`   Service: ${chalk.cyan(service)} | Score: ${chalk.green(score + '%')}`);
        console.log(`   URL: ${chalk.dim(result.chunk.url || 'N/A')}`);
        
        // Show content preview
        const preview = result.chunk.content
          .replace(/\n/g, ' ')
          .substring(0, 200);
        console.log(`   Preview: ${preview}${result.chunk.content.length > 200 ? '...' : ''}\n`);
      });
    }

  } catch (error) {
    console.error(chalk.red(`Error executing query: ${error instanceof Error ? error.message : String(error)}`));
  }
}

program.parse();
