/**
 * Retry handler with exponential backoff
 */
import { logger } from './logger.js';

interface RetryOptions {
  maxRetries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  onRetry?: (error: Error, attempt: number) => void;
  onFailed?: (error: Error, attempts: number) => void;
  retryableStatuses?: number[];
}

const DEFAULT_RETRYABLE_STATUSES = [408, 429, 500, 502, 503, 504];

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<{ success: true; data: T } | { success: false; error: Error; attempts: number }> {
  const {
    maxRetries = 3,
    baseDelayMs = 1000,
    maxDelayMs = 30000,
    onRetry,
    onFailed,
    retryableStatuses = DEFAULT_RETRYABLE_STATUSES
  } = options;

  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const result = await fn();
      return { success: true, data: result };
    } catch (error) {
      lastError = error as Error;

      // Check if it's the last attempt
      if (attempt === maxRetries) {
        onFailed?.(lastError, attempt);
        return { success: false, error: lastError, attempts: attempt };
      }

      // Check if error is retryable (for HTTP errors)
      if (error && typeof error === 'object' && 'status' in error) {
        const status = (error as any).status;
        if (!retryableStatuses.includes(status)) {
          // Not retryable, fail immediately
          onFailed?.(lastError, attempt);
          return { success: false, error: lastError, attempts: attempt };
        }
      }

      // Calculate delay with exponential backoff
      const delay = Math.min(baseDelayMs * Math.pow(2, attempt - 1), maxDelayMs);
      
      onRetry?.(lastError, attempt);
      logger.debug(`Retry ${attempt}/${maxRetries} after ${delay}ms: ${lastError.message}`);
      
      await sleep(delay);
    }
  }

  // Should never reach here
  return { 
    success: false, 
    error: lastError || new Error('Unknown error'), 
    attempts: maxRetries 
  };
}

export async function withRetryThrow<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const result = await withRetry(fn, options);
  
  if (result.success) {
    return result.data;
  }
  
  throw result.error;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Check if an error is a rate limit error (429/403)
 */
export function isRateLimitError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  
  const status = (error as any).status;
  return status === 429 || status === 403;
}

/**
 * Check if an error is a network/timeout error
 */
export function isNetworkError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  
  const message = (error as Error).message?.toLowerCase() || '';
  return message.includes('timeout') || 
         message.includes('network') || 
         message.includes('fetch failed') ||
         message.includes('ENOTFOUND') ||
         message.includes('ECONNREFUSED');
}
