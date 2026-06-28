import "dotenv/config";
import { PrismaClient as SeriesClient } from "@prisma/series-client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
const datasourceUrl = process.env.TVSERIES_URL;
if (!datasourceUrl) {
    throw new Error("TVSERIES_URL is not set");
}
const globalForSeries = globalThis;
export const seriesPrisma = globalForSeries.seriesPrisma ||
    new SeriesClient({
        adapter: new PrismaPg(new Pool({ connectionString: datasourceUrl })),
    });
if (process.env.NODE_ENV !== "production")
    globalForSeries.seriesPrisma = seriesPrisma;
//# sourceMappingURL=Prismaseries.js.map