import { PrismaClient } from "@prisma/client";

const prismaClientSingleton = () => {
  // connection_limit=1 required for Supabase PgBouncer (transaction mode).
  // Without it, each Prisma instance opens its own pool and exhausts the 60-slot free tier limit.
  const base = process.env.DATABASE_URL ?? "";
  const url = base.includes("connection_limit") ? base : `${base}&connection_limit=1&pool_timeout=20`;
  return new PrismaClient({ datasourceUrl: url });
};

declare const globalThis: {
  prismaGlobal: ReturnType<typeof prismaClientSingleton>;
} & typeof global;

const prisma = globalThis.prismaGlobal ?? prismaClientSingleton();

// Always cache in globalThis — in production Next.js can import this module
// multiple times across different chunks, each creating a new PrismaClient
// and exhausting database connection slots.
globalThis.prismaGlobal = prisma;

export { prisma };
