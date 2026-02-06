import { pipeline } from '@xenova/transformers';
import { RAG_CONFIG } from '../config.js';
import { DocumentChunk } from '../types.js';

type FeatureExtractionPipeline = Awaited<ReturnType<typeof pipeline>>;

export class Embedder {
  private model: FeatureExtractionPipeline | null = null;
  private modelName: string;
  private isLoaded: boolean = false;

  constructor(modelName = RAG_CONFIG.EMBEDDING_MODEL) {
    this.modelName = modelName;
  }

  /**
   * Load the embedding model
   */
  async load(): Promise<void> {
    if (this.isLoaded) return;
    
    console.log(`Loading embedding model: ${this.modelName}...`);
    this.model = await pipeline('feature-extraction', this.modelName, {
      quantized: true, // Use quantized model for faster inference
    });
    this.isLoaded = true;
    console.log('Embedding model loaded successfully');
  }

  /**
   * Generate embedding for a single text
   */
  async embed(text: string): Promise<number[]> {
    if (!this.model) {
      await this.load();
    }

    // Truncate long texts
    const maxLength = 512;
    const tokens = text.split(/\s+/);
    const truncatedText = tokens.slice(0, maxLength).join(' ');

    const result = await this.model!(truncatedText, {
      pooling: 'mean',
      normalize: true,
    });

    return Array.from(result.data as Iterable<number>);
  }

  /**
   * Generate embeddings for multiple chunks in batches
   */
  async embedChunks(chunks: DocumentChunk[], batchSize = RAG_CONFIG.EMBEDDING_BATCH_SIZE): Promise<Map<string, number[]>> {
    if (!this.model) {
      await this.load();
    }

    const embeddings = new Map<string, number[]>();
    const totalBatches = Math.ceil(chunks.length / batchSize);

    console.log(`  Embedding ${chunks.length} chunks in ${totalBatches} batches...`);

    for (let i = 0; i < chunks.length; i += batchSize) {
      const batch = chunks.slice(i, i + batchSize);
      const batchNum = Math.floor(i / batchSize) + 1;
      
      // Process the entire batch at once for better performance
      const texts = batch.map(c => {
        // Truncate long texts
        const tokens = c.content.split(/\s+/);
        return tokens.slice(0, 512).join(' ');
      });
      
      // Generate embeddings for all texts at once
      const batchResults = await this.model!(texts, {
        pooling: 'mean',
        normalize: true,
      });
      
      // Store embeddings
      for (let j = 0; j < batch.length; j++) {
        const embedding = Array.from(batchResults[j].data as Iterable<number>);
        embeddings.set(batch[j].id, embedding);
      }
      
      if (batchNum % 5 === 0 || batchNum === totalBatches) {
        process.stdout.write(`    Batch ${batchNum}/${totalBatches} complete\r`);
      }
    }

    process.stdout.write(`  \r  Generated ${embeddings.size} embeddings\n`);
    return embeddings;
  }

  /**
   * Check if model is loaded
   */
  isReady(): boolean {
    return this.isLoaded;
  }

  /**
   * Get model info
   */
  getModelInfo(): { name: string; dimensions: number; loaded: boolean } {
    return {
      name: this.modelName,
      dimensions: RAG_CONFIG.EMBEDDING_DIMENSIONS,
      loaded: this.isLoaded,
    };
  }
}

// Singleton instance
let embedderInstance: Embedder | null = null;

export function getEmbedder(): Embedder {
  if (!embedderInstance) {
    embedderInstance = new Embedder();
  }
  return embedderInstance;
}
