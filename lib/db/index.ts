import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL;
const client = connectionString ? postgres(connectionString, { max: 5 }) : null;
export const db = client ? drizzle(client, { schema }) : null;

export function assertProductionDatabaseConfigured() {
  if (process.env.NODE_ENV === "production" && !connectionString) {
    throw new Error("DATABASE_URL must be configured in production; refusing to use volatile memory storage");
  }
}

export function requireDb() {
  if (!db) throw new Error("DATABASE_URL 未配置。开发环境可使用内存适配器，生产环境必须配置 PostgreSQL。");
  return db;
}

// Call before the worker's first query. PostgreSQL must cancel busy statements:
// postgres-js end({timeout}) ends sockets but a server query may still be busy.
// This is process-local; web/Runner connections retain their existing settings.
export function configureWorkerDatabaseTimeouts() {
  if (!client) return;
  Object.assign(client.options.connection, {
    statement_timeout: 4000, lock_timeout: 3000, idle_in_transaction_session_timeout: 4000,
  });
}

export async function closeDb(timeout?: number) {
  await client?.end(timeout === undefined ? undefined : { timeout });
}
