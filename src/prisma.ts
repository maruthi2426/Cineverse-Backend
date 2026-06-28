import "dotenv/config";
import { PrismaClient } from "@prisma/movies-client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const datasourceUrl = process.env.DATABASE_URL;

if (!datasourceUrl) {
  throw new Error("DATABASE_URL is not set");
}

const globalForPrisma = globalThis as unknown as { prismaMovies: PrismaClient };

export const prismaMovies =
  globalForPrisma.prismaMovies ||
  new PrismaClient({
    adapter: new PrismaPg(new Pool({ connectionString: datasourceUrl })),
  });

if (process.env.NODE_ENV !== "production")
  globalForPrisma.prismaMovies = prismaMovies;
