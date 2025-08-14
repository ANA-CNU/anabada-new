declare module 'better-sqlite3' {
  export interface Database {
    exec(sql: string): void;
    prepare(sql: string): Statement;
    close(): void;
    pragma(sql: string): any;
  }
  
  export interface Statement {
    all(params?: any[]): any[];
    run(params?: any[]): RunResult;
  }
  
  export interface RunResult {
    changes: number;
    lastInsertRowid: number;
  }
  
  const Database: {
    new(path: string, options?: any): Database;
  };
  
  export default Database;
} 