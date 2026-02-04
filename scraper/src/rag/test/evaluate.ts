#!/usr/bin/env node
import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import fs from 'fs/promises';
import path from 'path';
import { Embedder } from '../embeddings/embedder.js';
import { ChromaStore } from '../vector-store/chroma-store.js';
import { TestQuery, TestResult, SearchResult } from '../types.js';
import { RAG_CONFIG } from '../config.js';

const program = new Command();

// Predefined test queries
const TEST_QUERIES: TestQuery[] = [
  {
    id: 'ecs-create',
    query: 'How do I create an ECS instance?',
    expectedServices: ['ecs', 'ecs_01'],
    description: 'ECS instance creation',
  },
  {
    id: 'vpc-config',
    query: 'How to configure a Virtual Private Cloud network?',
    expectedServices: ['vpc', 'vpc_01'],
    description: 'VPC network configuration',
  },
  {
    id: 's3-pricing',
    query: 'What are the pricing options for object storage?',
    expectedServices: ['obs', 'obs_01', 'evs'],
    description: 'Object storage pricing',
  },
  {
    id: 'api-auth',
    query: 'API authentication methods and security',
    expectedServices: ['iam', 'iam_01', 'api'],
    description: 'API authentication',
  },
  {
    id: 'database-backup',
    query: 'How to backup and restore RDS databases?',
    expectedServices: ['rds', 'rds_01'],
    description: 'RDS backup and restore',
  },
  {
    id: 'load-balancer',
    query: 'Configure elastic load balancer for high availability',
    expectedServices: ['elb', 'elb_01'],
    description: 'Load balancer configuration',
  },
  {
    id: 'kubernetes-deploy',
    query: 'Deploy container applications on Kubernetes cluster',
    expectedServices: ['cce', 'cce_01'],
    description: 'Kubernetes deployment',
  },
  {
    id: 'monitoring-alerts',
    query: 'Set up monitoring alerts and notifications',
    expectedServices: ['ces', 'ces_01', 'aom'],
    description: 'Monitoring and alerts',
  },
  {
    id: 'ssl-certificate',
    query: 'How to manage SSL certificates for HTTPS?',
    expectedServices: ['scm', 'scm_01', 'waf'],
    description: 'SSL certificate management',
  },
  {
    id: 'data-migration',
    query: 'Migrate data from on-premises to cloud',
    expectedServices: ['drs', 'drs_01', 'cdm'],
    description: 'Data migration',
  },
  {
    id: 'serverless-function',
    query: 'Create serverless functions with FunctionGraph',
    expectedServices: ['functiongraph', 'fg', 'fgs'],
    description: 'Serverless functions',
  },
  {
    id: 'cdn-setup',
    query: 'Configure Content Delivery Network for faster access',
    expectedServices: ['cdn', 'cdn_01'],
    description: 'CDN configuration',
  },
  {
    id: 'security-group',
    query: 'Configure security group firewall rules',
    expectedServices: ['ecs', 'vpc', 'sg'],
    description: 'Security group rules',
  },
  {
    id: 'auto-scaling',
    query: 'Set up auto scaling for dynamic resource allocation',
    expectedServices: ['as', 'as_01'],
    description: 'Auto scaling configuration',
  },
  {
    id: 'dns-configuration',
    query: 'Configure DNS and domain name resolution',
    expectedServices: ['dns', 'dns_01'],
    description: 'DNS configuration',
  },
];

program
  .name('rag:test')
  .description('Test RAG system with sample queries')
  .option('-k, --top-k <number>', 'Number of results to check', '5')
  .option('--save-results', 'Save detailed results to file')
  .option('--query-id <id>', 'Run specific test by ID')
  .action(async (options) => {
    const spinner = ora();
    const topK = parseInt(options.topK);
    
    try {
      console.log(chalk.bold('\n🧪 RAG Testing Suite\n'));
      
      // Initialize
      spinner.start('Initializing RAG system...');
      const embedder = new Embedder();
      await embedder.load();
      const store = new ChromaStore(embedder);
      await store.initialize();
      const stats = await store.getStats();
      spinner.succeed(`Ready: ${chalk.cyan(stats.count.toLocaleString())} vectors indexed`);

      // Filter queries if specific ID provided
      let queries = TEST_QUERIES;
      if (options.queryId) {
        queries = TEST_QUERIES.filter(q => q.id === options.queryId);
        if (queries.length === 0) {
          console.log(chalk.red(`Error: Test query "${options.queryId}" not found`));
          process.exit(1);
        }
      }

      console.log(chalk.bold(`\nRunning ${queries.length} test queries (top-${topK})\n`));

      // Run tests
      const results: TestResult[] = [];
      let passed = 0;
      let failed = 0;

      for (let i = 0; i < queries.length; i++) {
        const testQuery = queries[i];
        const progress = `[${i + 1}/${queries.length}]`;
        
        process.stdout.write(`${progress} Testing: ${chalk.dim(testQuery.description)}... `);
        
        const startTime = Date.now();
        const searchResults = await store.search(testQuery.query, { topK });
        const latency = Date.now() - startTime;

        // Check if expected service found in results
        let relevantFound = false;
        let topRelevantRank: number | undefined;

        for (let rank = 0; rank < searchResults.length; rank++) {
          const result = searchResults[rank];
          const service = result.chunk.service.toLowerCase();
          
          const isRelevant = testQuery.expectedServices.some(
            expected => service.includes(expected.toLowerCase())
          );
          
          if (isRelevant) {
            relevantFound = true;
            if (topRelevantRank === undefined) {
              topRelevantRank = rank + 1;
            }
          }
        }

        const testResult: TestResult = {
          query: testQuery,
          results: searchResults,
          relevantFound,
          topRelevantRank,
          latency,
        };
        results.push(testResult);

        // Print result
        if (relevantFound) {
          passed++;
          console.log(chalk.green(`✓ PASS`));
          console.log(`   Found at rank ${topRelevantRank} | ${latency}ms`);
        } else {
          failed++;
          console.log(chalk.red(`✗ FAIL`));
          console.log(`   Expected: ${testQuery.expectedServices.join(', ')}`);
          console.log(`   Got: ${searchResults.slice(0, 3).map(r => r.chunk.service).join(', ')}`);
        }
      }

      // Calculate metrics
      const precisionAtK = results.filter(r => r.relevantFound).length / results.length;
      const avgLatency = results.reduce((sum, r) => sum + r.latency, 0) / results.length;
      const mrr = results.reduce((sum, r) => {
        if (r.topRelevantRank) {
          return sum + (1 / r.topRelevantRank);
        }
        return sum;
      }, 0) / results.length;

      // Print summary
      console.log(chalk.bold('\n📊 Test Results Summary\n'));
      console.log(`  Total queries:     ${chalk.cyan(results.length)}`);
      console.log(`  Passed:            ${chalk.green(passed)}`);
      console.log(`  Failed:            ${chalk.red(failed)}`);
      console.log(`  Precision@${topK}:       ${chalk.cyan((precisionAtK * 100).toFixed(1))}%`);
      console.log(`  Mean Reciprocal Rank: ${chalk.cyan(mrr.toFixed(3))}`);
      console.log(`  Avg latency:       ${chalk.cyan(Math.round(avgLatency))}ms`);

      // Grade
      let grade = 'F';
      let gradeColor = chalk.red;
      if (precisionAtK >= 0.9) { grade = 'A+'; gradeColor = chalk.green; }
      else if (precisionAtK >= 0.8) { grade = 'A'; gradeColor = chalk.green; }
      else if (precisionAtK >= 0.7) { grade = 'B'; gradeColor = chalk.yellow; }
      else if (precisionAtK >= 0.6) { grade = 'C'; gradeColor = chalk.yellow; }
      else if (precisionAtK >= 0.5) { grade = 'D'; gradeColor = chalk.red; }

      console.log(`\n  Overall Grade:     ${gradeColor.bold(grade)}`);

      // Save results if requested
      if (options.saveResults) {
        const resultsPath = path.join(RAG_CONFIG.LOGS_PATH, 'test-results.json');
        await fs.mkdir(path.dirname(resultsPath), { recursive: true });
        
        const output = {
          timestamp: new Date().toISOString(),
          summary: {
            total: results.length,
            passed,
            failed,
            precisionAtK,
            mrr,
            avgLatency,
            grade,
          },
          results: results.map(r => ({
            id: r.query.id,
            query: r.query.query,
            description: r.query.description,
            expectedServices: r.query.expectedServices,
            relevantFound: r.relevantFound,
            topRelevantRank: r.topRelevantRank,
            latency: r.latency,
            topResults: r.results.slice(0, 3).map(res => ({
              service: res.chunk.service,
              score: res.score,
              headers: res.chunk.headers,
            })),
          })),
        };
        
        await fs.writeFile(resultsPath, JSON.stringify(output, null, 2));
        console.log(`\n  Detailed results saved to: ${chalk.dim(resultsPath)}`);
      }

      // Exit with error code if too many failures
      if (failed > results.length * 0.5) {
        console.log(chalk.red('\n⚠️  Too many test failures. RAG system may need tuning.\n'));
        process.exit(1);
      }

      console.log(chalk.green('\n✅ Tests completed successfully\n'));

    } catch (error) {
      spinner.fail(chalk.red(`Error: ${error instanceof Error ? error.message : String(error)}`));
      process.exit(1);
    }
  });

program.parse();
