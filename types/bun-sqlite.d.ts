declare module "bun:sqlite" {
  export default class Database {
    constructor(filename: string, options?: { create?: boolean; readwrite?: boolean; readonly?: boolean; strict?: boolean });
    run(query: string, ...params: unknown[]): unknown;
    query<T = unknown>(query: string): {
      get(...params: unknown[]): T | null;
      all(...params: unknown[]): T[];
      run(...params: unknown[]): unknown;
    };
  }
}
