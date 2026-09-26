declare module "node:sqlite" {
  export class DatabaseSync {
    constructor(path: string, options?: { readOnly?: boolean });
    close(): void;
    exec(sql: string): void;
    prepare(sql: string): {
      get(...values: Array<string | number>): Record<string, unknown> | undefined;
      all(...values: Array<string | number>): Array<Record<string, unknown>>;
      run(...values: Array<string | number>): unknown;
    };
  }
}
