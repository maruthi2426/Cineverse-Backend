import express from "express";
import dotenv from "dotenv";
import bot, { userClient, mtProtoReady } from "./bot.js";

import cors from 'cors'
import { prismaMovies } from "./prisma.js";
import { seriesPrisma } from "./Prismaseries.js";
import { logger } from "./utils/logger.js";
import { backfillMovies, backfillSeries } from "./utils/backfill.js";

dotenv.config();


const app = express();

app.use(cors({origin : ["http://localhost:3000","https://v1moviewebsite-ashy.vercel.app/"]}))

app.get('/', async (req, res) => {
  try {
    await prismaMovies.$queryRaw`SELECT 1`;
    await seriesPrisma.$queryRaw`SELECT 1`;
    res.status(200).json({ msg: "HealthCheck : Good" });
  } catch {
    res.status(503).json({ msg: "HealthCheck : Database unavailable" });
  }
});


app.get('/latestMovies', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string) || 20));
    const skip = (page - 1) * limit;
    const movies = await prismaMovies.videos.findMany({
      orderBy : { id : 'desc'},
      skip,
      take: limit,
      select : {
     thumbnail : true,
     tmdb_id : true,
     telegram_link : true,
     backdrop : true,
     popularity  :true,
     language : true,
     genre : true,
     rating : true,
     releaseDate :true,
     title : true
      }
    })

    res.status(200).json({ msg: 'Latest Movies', data: movies });
  } catch(error) {
    logger.error("API", "/latestMovies failed", error);
    res.status(500).json({ msg: 'Internal Server Error' });
  }})

app.get('/latestSeries', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string) || 20));
    const skip = (page - 1) * limit;
    const movies = await seriesPrisma.tVSeries.findMany({
      orderBy : { id : 'desc'},
      skip,
      take: limit,
      select : {
     posterPath : true,
     overview : true,
    rating : true,
    popularity : true,
    language : true,
    releaseDate : true,
    backdrop : true,
    genre:true,
     title: true,
     tmdbId: true,
      }
    })


    res.status(200).json({ msg: 'Latest Series', data: movies });
  } catch(error) {
    logger.error("API", "/latestSeries failed", error);
    res.status(500).json({ msg: 'Internal Server Error' });
  }})

app.get('/allvideos', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 50));
    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
      prismaMovies.videos.findMany({ skip, take: limit, orderBy: { id: 'desc' } }),
      prismaMovies.videos.count(),
    ]);
    res.status(200).json({ msg: "All videos", data, total, page, limit });
  } catch (error) {
    logger.error("API", "/allvideos failed", error);
    res.status(500).json({ msg: "Internal Server Error" });
  }
});

app.get('/allseries', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 50));
    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
      seriesPrisma.tVSeries.findMany({ skip, take: limit, orderBy: { id: 'desc' } }),
      seriesPrisma.tVSeries.count(),
    ]);
    res.status(200).json({ msg: "All Series", data, total, page, limit });
  } catch (error) {
    logger.error("API", "/allseries failed", error);
    res.status(500).json({ msg: "Internal Server Error" });
  }
});
app.get('/allseasons', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 50));
    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
      seriesPrisma.season.findMany({ skip, take: limit, orderBy: { id: 'desc' } }),
      seriesPrisma.season.count(),
    ]);
    res.status(200).json({ msg: "All seasons", data, total, page, limit });
  } catch (error) {
    logger.error("API", "/allseasons failed", error);
    res.status(500).json({ msg: "Internal Server Error" });
  }
});
app.get('/allepisode', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 50));
    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
      seriesPrisma.episode.findMany({ skip, take: limit, orderBy: { id: 'desc' } }),
      seriesPrisma.episode.count(),
    ]);
    res.status(200).json({ msg: "All Episode", data, total, page, limit });
  } catch (error) {
    logger.error("API", "/allepisode failed", error);
    res.status(500).json({ msg: "Internal Server Error" });
  }
});

const PORT = Number(process.env.PORT) || 3001;

const server = app.listen(PORT, () => {
  logger.info("Server", `Express running on port ${PORT}`);
});

// Launch Telegram bot
(async () => {
  try {
    await bot.launch();
    logger.info("Server", "Telegram bot launched");

    // Wait for MTProto to connect, then backfill missed channel posts
    await mtProtoReady;
    logger.info("Server", "Starting channel backfill...");
    await Promise.all([
      backfillMovies(userClient, 100),
      backfillSeries(userClient, 100),
    ]);
    logger.info("Server", "Backfill complete");
  } catch (err) {
    logger.error("Server", "Failed to launch bot", err);
  }
})();

// Graceful shutdown
async function shutdown(signal: string) {
  logger.info("Server", `${signal} received — shutting down gracefully`);
  server.close();
  bot.stop();
  await Promise.allSettled([
    prismaMovies.$disconnect(),
    seriesPrisma.$disconnect(),
  ]);
  logger.info("Server", "Shutdown complete");
  process.exit(0);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

// Prevent unhandled rejections from crashing the process
process.on("unhandledRejection", (reason) => {
  logger.error("Process", "Unhandled rejection", reason);
});
process.on("uncaughtException", (err) => {
  logger.error("Process", "Uncaught exception", err);
});
