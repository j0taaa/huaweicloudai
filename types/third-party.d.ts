declare module "@xenova/transformers" {
  export function pipeline(...args: any[]): Promise<any>;
}

declare module "ssh2" {
  export interface ClientChannel {
    on(event: string, listener: (...args: any[]) => void): this;
    stderr?: { on(event: string, listener: (...args: any[]) => void): this };
    write(data: string): void;
    end(): void;
  }

  export interface ConnectConfig {
    host?: string;
    port?: number;
    username?: string;
    password?: string;
    readyTimeout?: number;
    keepaliveInterval?: number;
    keepaliveCountMax?: number;
  }

  export class Client {
    on(event: string, listener: (...args: any[]) => void): this;
    shell(
      options: { term?: string; cols?: number; rows?: number },
      callback: (error: Error | undefined, stream: ClientChannel) => void,
    ): void;
    connect(config: ConnectConfig): void;
    end(): void;
  }
}

declare module "turndown" {
  type TurndownRule = {
    filter: string | string[] | ((node: HTMLElement) => boolean);
    replacement: (content: string, node: HTMLElement) => string;
  };

  export default class TurndownService {
    constructor(options?: Record<string, unknown>);
    addRule(name: string, rule: TurndownRule): void;
    turndown(input: string): string;
  }
}
