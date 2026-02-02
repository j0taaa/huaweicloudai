/**
 * Rate limiter with adaptive rate limiting
 * Auto-detects rate limiting (429/403) and adjusts accordingly
 */
import { logger } from './logger.js';

interface RateLimitConfig {
  maxConcurrent: number;
  baseDelayMs: number;
  adaptive?: boolean;
}

interface RateLimitState {
  currentConcurrent: number;
  currentDelayMs: number;
  lastRateLimitTime: number | null;
  rateLimitCount: number;
}

export class RateLimiter {
  private queue: Array<() => Promise<any>> = [];
  private running = 0;
  private config: RateLimitConfig;
  private state: RateLimitState;

  constructor(config: RateLimitConfig) {
    this.config = {
      adaptive: true,
      ...config
    };
    
    this.state = {
      currentConcurrent: config.maxConcurrent,
      currentDelayMs: config.baseDelayMs,
      lastRateLimitTime: null,
      rateLimitCount: 0
    };
  }

  /**
   * Execute a function with rate limiting
   */
  async execute<T>(fn: () => Promise<T>, context?: string): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push(async () => {
        try {
          const result = await fn();
          resolve(result);
        } catch (error) {
          reject(error);
        }
      });
      
      this.processQueue(context);
    });
  }

  /**
   * Report a rate limit hit (429/403)
   * Will automatically slow down if adaptive mode is enabled
   */
  reportRateLimit(): void {
    if (!this.config.adaptive) return;

    const now = Date.now();
    this.state.rateLimitCount++;
    this.state.lastRateLimitTime = now;

    // Reduce concurrency by half, minimum 2
    const oldConcurrent = this.state.currentConcurrent;
    this.state.currentConcurrent = Math.max(2, Math.floor(this.state.currentConcurrent / 2));

    // Increase delay, max 2000ms
    const oldDelay = this.state.currentDelayMs;
    this.state.currentDelayMs = Math.min(2000, this.state.currentDelayMs * 2);

    logger.warn(`Rate limit detected! Adjusting: concurrent ${oldConcurrent}→${this.state.currentConcurrent}, delay ${oldDelay}ms→${this.state.currentDelayMs}ms`);

    // Reset after 5 minutes
    setTimeout(() => {
      this.state.currentConcurrent = this.config.maxConcurrent;
      this.state.currentDelayMs = this.config.baseDelayMs;
      this.state.rateLimitCount = 0;
      logger.info('Rate limit reset to normal levels');
    }, 5 * 60 * 1000);
  }

  /**
   * Get current rate limit stats
   */
  getStats(): RateLimitState {
    return { ...this.state };
  }

  private async processQueue(context?: string): Promise<void> {
    if (this.running >= this.state.currentConcurrent || this.queue.length === 0) {
      return;
    }

    this.running++;
    const fn = this.queue.shift()!;

    try {
      await fn();
    } finally {
      this.running--;
      
      // Add delay before next request
      if (this.queue.length > 0) {
        await this.sleep(this.state.currentDelayMs);
        this.processQueue(context);
      }
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Create a rate limiter with default settings
 */
export function createRateLimiter(maxConcurrent = 10, baseDelayMs = 100): RateLimiter {
  return new RateLimiter({
    maxConcurrent,
    baseDelayMs,
    adaptive: true
  });
}
