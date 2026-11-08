import { MongoClient, type Db } from "mongodb";

const uri = process.env.MONGODB_URI;

if (!uri) {
  throw new Error('Missing required environment variable: "MONGODB_URI"');
}

const options = {};

// Reuse the client across hot reloads in development and across invocations
// in production so we don't open a new connection pool on every request.
const globalForMongo = globalThis as unknown as {
  _mongoClientPromise?: Promise<MongoClient>;
};

const client = globalForMongo._mongoClientPromise
  ? undefined
  : new MongoClient(uri, options);

export const clientPromise: Promise<MongoClient> =
  globalForMongo._mongoClientPromise ??
  (globalForMongo._mongoClientPromise = client!.connect());

/**
 * The raw, UNSCOPED database — every company's rows at once. Only for
 * platform-level code: the company registry, domain routing, migrations and
 * jobs that deliberately fan out across companies (which should still do
 * their per-company work inside `runAsCompany`). Everything else uses
 * `getDb()` from `@/lib/mongodb`.
 */
export async function getPlatformDb(): Promise<Db> {
  const c = await clientPromise;
  return c.db();
}
