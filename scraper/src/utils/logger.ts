/**
 * Logger utility with colored output
 */
import chalk from 'chalk';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'success';

export class Logger {
  private static instance: Logger;
  private verbose: boolean;

  constructor(verbose = false) {
    this.verbose = verbose;
  }

  static getInstance(verbose = false): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger(verbose);
    }
    return Logger.instance;
  }

  setVerbose(verbose: boolean): void {
    this.verbose = verbose;
  }

  debug(message: string): void {
    if (this.verbose) {
      console.log(chalk.gray(`[DEBUG] ${message}`));
    }
  }

  info(message: string): void {
    console.log(chalk.blue(`[INFO] ${message}`));
  }

  warn(message: string): void {
    console.log(chalk.yellow(`[WARN] ${message}`));
  }

  error(message: string, error?: Error): void {
    console.error(chalk.red(`[ERROR] ${message}`));
    if (error && this.verbose) {
      console.error(chalk.red(error.stack || error.message));
    }
  }

  success(message: string): void {
    console.log(chalk.green(`[SUCCESS] ${message}`));
  }

  progress(current: number, total: number, message: string): void {
    const percent = Math.round((current / total) * 100);
    const bar = '█'.repeat(Math.round(percent / 5)) + '░'.repeat(20 - Math.round(percent / 5));
    process.stdout.write(`\r${chalk.cyan(`[${bar}] ${percent}%`)} ${message}`);
  }

  clearLine(): void {
    process.stdout.write('\r' + ' '.repeat(80) + '\r');
  }

  /**
   * Show global progress with time tracking
   */
  showGlobalProgress(percent: number, bar: string, completed: number, total: number, elapsed: string, eta: string): void {
    const line = `${chalk.magenta(`[GLOBAL ${bar}] ${percent}%`)} ${completed}/${total} pages | ⏱️ ${elapsed} | ⏳ ${eta}`;
    process.stdout.write(`\r${line}`);
  }

  clearGlobalProgress(): void {
    process.stdout.write('\r' + ' '.repeat(100) + '\r');
  }
}

export const logger = Logger.getInstance();
