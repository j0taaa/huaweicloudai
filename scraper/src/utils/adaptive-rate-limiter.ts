/**
 * Aggressive Adaptive Rate Limiter
 * Starts fast and dynamically adjusts based on success/failure patterns
 * Specifically designed for Huawei Cloud's rate limiting behavior
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
  consecutiveSuccesses: number;
  consecutiveFailures: number;
  totalRequests: number;
  totalSuccesses: number;
  totalFailures: number;
  lastAdjustmentTime: number;
}

export class AdaptiveRateLimiter {
  private queue: Array<() => Promise<any>> = [];
  private running = 0;
  private config: RateLimitConfig;
  private state: RateLimitState;
  private processing = false;

  constructor(config: RateLimitConfig) {
    this.config = {
      adaptive: true,
      ...config
    };
    
    this.state = {
      currentConcurrent: config.maxConcurrent,
      currentDelayMs: config.baseDelayMs,
      lastRateLimitTime: null,
      rateLimitCount: 0,
      consecutiveSuccesses: 0,
      consecutiveFailures: 0,
      totalRequests: 0,
      totalSuccesses: 0,
      totalFailures: 0,
      lastAdjustmentTime: Date.now()
    };
    
    logger.info(`🔧 Rate limiter initialized: ${config.maxConcurrent} concurrent, ${config.baseDelayMs}ms delay`);
  }

  /**
   * Execute a function with rate limiting
   */
  async execute<T>(fn: () => Promise<T>, context?: string): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push(async () => {
        this.state.totalRequests++;
        try {
          const result = await fn();
          this.reportSuccess();
          resolve(result);
        } catch (error) {
          this.reportFailure(error as Error);
          reject(error);
        }
      });
      
      this.processQueue(context);
    });
  }

  /**
   * Report a successful request - may increase speed
   */
  private reportSuccess(): void {
    if (!this.config.adaptive) return;

    this.state.consecutiveSuccesses++;
    this.state.consecutiveFailures = 0;
    this.state.totalSuccesses++;

    // Gradually increase speed after 50 consecutive successes (more conservative)
    if (this.state.consecutiveSuccesses >= 50) {
      this.increaseSpeed();
      this.state.consecutiveSuccesses = 0;
    }
  }

  /**
   * Report a failed request - will decrease speed if it's a rate limit
   */
  private reportFailure(error: Error): void {
    if (!this.config.adaptive) return;

    this.state.consecutiveFailures++;
    this.state.consecutiveSuccesses = 0;
    this.state.totalFailures++;

    // Check if this is a rate limit error
    if (this.isRateLimitError(error)) {
      this.state.rateLimitCount++;
      this.state.lastRateLimitTime = Date.now();
      this.decreaseSpeed(error);
    } else if (this.state.consecutiveFailures >= 5) {
      // Too many failures, slow down a bit even if not rate limited
      logger.warn(`5 consecutive failures, reducing speed slightly`);
      this.state.currentDelayMs = Math.min(1000, this.state.currentDelayMs * 1.5);
      this.state.consecutiveFailures = 0;
    }
  }

  /**
   * Check if error is a rate limit error
   * Handles multiple Huawei Cloud and generic patterns
   */
  private isRateLimitError(error: Error): boolean {
    if (!error) return false;
    
    const status = (error as any).status;
    const message = error.message?.toLowerCase() || '';
    
    // HTTP status codes
    if (status === 429) return true; // Too Many Requests
    if (status === 403) return true; // Forbidden (sometimes used for rate limiting)
    if (status === 503) return true; // Service Unavailable (can be rate limiting)
    
    // Message-based detection for various patterns
    const rateLimitPatterns = [
      'rate limit',
      'ratelimit',
      'too many requests',
      'too many connections',
      'throttled',
      'throttling',
      'quota exceeded',
      'limit exceeded',
      'request limit',
      'api limit',
      'slow down',
      'retry-after',
      'rate exceeded',
      'bandwidth limit',
      'concurrent request',
      '请求过于频繁', // Chinese: "requests too frequent"
      '访问过于频繁', // Chinese: "access too frequent"
      '已达到限制', // Chinese: "limit reached"
      '频率限制', // Chinese: "frequency limit"
    ];
    
    for (const pattern of rateLimitPatterns) {
      if (message.includes(pattern)) {
        return true;
      }
    }
    
    return false;
  }

  /**
   * Increase speed (reduce delay, increase concurrency)
   */
  private increaseSpeed(): void {
    const now = Date.now();
    
    // Only adjust every 10 seconds at most
    if (now - this.state.lastAdjustmentTime < 10000) return;
    
    const oldConcurrent = this.state.currentConcurrent;
    const oldDelay = this.state.currentDelayMs;
    
    // Increase concurrency up to max (very conservative: +2 at a time)
    if (this.state.currentConcurrent < this.config.maxConcurrent) {
      this.state.currentConcurrent = Math.min(
        this.config.maxConcurrent,
        this.state.currentConcurrent + 2
      );
    }
    
    // Decrease delay down to minimum 50ms (very conservative: only 10% reduction)
    if (this.state.currentDelayMs > 50) {
      this.state.currentDelayMs = Math.max(50, this.state.currentDelayMs * 0.9);
    }
    
    this.state.lastAdjustmentTime = now;
    
    if (oldConcurrent !== this.state.currentConcurrent || oldDelay !== this.state.currentDelayMs) {
      logger.success(`📈 Speed increased: ${oldConcurrent}→${this.state.currentConcurrent} concurrent, ${oldDelay}ms→${this.state.currentDelayMs}ms delay`);
    }
  }

  /**
   * Decrease speed (increase delay, reduce concurrency)
   */
  private decreaseSpeed(error: Error): void {
    const now = Date.now();
    
    // Prevent too frequent adjustments
    if (now - this.state.lastAdjustmentTime < 1000) return;
    
    const oldConcurrent = this.state.currentConcurrent;
    const oldDelay = this.state.currentDelayMs;
    
    // Reduce concurrency by half, minimum 2
    this.state.currentConcurrent = Math.max(2, Math.floor(this.state.currentConcurrent / 2));
    
    // Increase delay significantly (start with 500ms, max 5000ms)
    this.state.currentDelayMs = Math.min(5000, Math.max(500, this.state.currentDelayMs * 2));
    
    this.state.lastAdjustmentTime = now;
    
    logger.warn(`⛔ Rate limit detected! ${error.message}`);
    logger.warn(`📉 Speed reduced: ${oldConcurrent}→${this.state.currentConcurrent} concurrent, ${oldDelay}ms→${this.state.currentDelayMs}ms delay`);
    
    // Reset to minimum values after 30 seconds of no rate limits
    setTimeout(() => {
      if (Date.now() - (this.state.lastRateLimitTime || 0) > 30000) {
        this.state.currentConcurrent = this.config.maxConcurrent;
        this.state.currentDelayMs = this.config.baseDelayMs;
        this.state.rateLimitCount = 0;
        logger.info(`🔄 Rate limiter reset to aggressive mode after cooldown`);
      }
    }, 30000);
  }

  /**
   * Get current rate limit stats
   */
  getStats(): RateLimitState & { queueLength: number; running: number } {
    return { 
      ...this.state,
      queueLength: this.queue.length,
      running: this.running
    };
  }

  /**
   * Log current stats
   */
  logStats(): void {
    const stats = this.getStats();
    const successRate = stats.totalRequests > 0 
      ? Math.round((stats.totalSuccesses / stats.totalRequests) * 100) 
      : 0;
    
    logger.info(`📊 Rate Limiter Stats: ${stats.currentConcurrent} concurrent | ${stats.currentDelayMs}ms delay | ${successRate}% success | Queue: ${stats.queueLength} | Running: ${stats.running}`);
  }

  /**
   * Legacy method for backward compatibility
   * Rate limit detection is now automatic via execute() method
   */
  reportRateLimit(): void {
    // This is now handled automatically in the execute() method
    // Kept for backward compatibility with old code
    logger.debug('Manual rate limit report received (auto-detection is active)');
  }

  private async processQueue(context?: string): Promise<void> {
    if (this.processing) return;
    this.processing = true;

    while (this.queue.length > 0) {
      // Process up to currentConcurrent items simultaneously
      const batchSize = Math.min(this.state.currentConcurrent - this.running, this.queue.length);
      
      if (batchSize <= 0) {
        // Wait a bit if at capacity
        await this.sleep(10);
        continue;
      }

      const batch = this.queue.splice(0, batchSize);
      this.running += batchSize;

      // Execute batch in parallel
      batch.forEach(fn => {
        fn().finally(() => {
          this.running--;
        });
      });

      // Small delay between batches
      if (this.queue.length > 0) {
        await this.sleep(this.state.currentDelayMs);
      }
    }

    this.processing = false;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Create an aggressive adaptive rate limiter
 * Starts with high concurrency and adjusts based on actual rate limits
 */
export function createAdaptiveRateLimiter(maxConcurrent = 15, baseDelayMs = 300): AdaptiveRateLimiter {
  return new AdaptiveRateLimiter({
    maxConcurrent,
    baseDelayMs,
    adaptive: true
  });
}
