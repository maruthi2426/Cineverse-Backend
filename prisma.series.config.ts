import "dotenv/config";
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "./prisma/series.schema.prisma",
  datasource: { url: env("TVSERIES_URL") },
});
