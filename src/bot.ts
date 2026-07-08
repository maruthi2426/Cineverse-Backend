import { Context, Telegraf } from "telegraf";
import { Api, TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions/index.js";
import type { Update } from "telegraf/types";
import dotenv from "dotenv";
import { type SeriesEpisode, TMDB_GENRES } from "./types.js";

import { seriesPrisma } from "./Prismaseries.js";
import { prismaMovies } from "./prisma.js";
import {
  searchMovie,
  searchTvSeries,
  getSeasonDetails as getTvSeasonDetails,
  getEpisodeDetails as getTvEpisodeDetails,
  extractBestMovieMatch,
  findBestSeriesMatch,
} from "./utils/tmdb.js";
import { cleanFilename, extractYear, extractSeriesEpisode } from "./utils/cleanFilename.js";
import { logger } from "./utils/logger.js";

dotenv.config();

// Initialize bot
export const bot: Telegraf<Context<Update>> = new Telegraf(
  process.env.BOT_TOKEN as string,
);

// Telegram user client (for >2GB)
const apiId = Number(process.env.apiId);
const apiHash = process.env.apiHash as string;
const stringSession = new StringSession(process.env.STRING_SESSION as string);

const MOVIE_CHANNEL_ID = Number(process.env.MOVIE_CHANNEL_ID) || -1003137257780;
const SERIES_CHANNEL_ID = Number(process.env.SERIES_CHANNEL_ID) || -1003259326946;
// Create a Telegram user client instance (persistent)
const userClient = new TelegramClient(stringSession, apiId, apiHash, {
  connectionRetries: 5,
});

// Connect once at startup — export promise so backfill can await it
export const mtProtoReady = (async () => {
  try {
    await userClient.connect();
    logger.info("Bot", "MTProto user client connected successfully");
  } catch (err) {
    logger.warn("Bot", "MTProto user client failed to connect (large file sending disabled)", err);
  }
})();

// ⚡ Send via user account (>2 GB) — also used for backfilled records via MTProto
async function sendLargeVideo(toUser: number, video: Record<string, any>) {
  const movieTitle =
    typeof video.file_name === "string"
      ? video.file_name.replace(/\.[^/.]+$/, "")
      : "Video";

  if (!video.accessHash || !video.fileReference) {
    logger.error("Bot-largeVideo", "Missing access_hash or file_reference");
    throw new Error("Large video missing MTProto metadata (file_reference / access_hash)");
  }

  await userClient.invoke(
    new Api.messages.SendMedia({
      peer: toUser,
      media: new Api.InputMediaDocument({
        id: new Api.InputDocument({
          id: video.fileid, // could be BigInt (backfill) or string (unused path)
          accessHash: video.accessHash,
          fileReference: Buffer.from(video.fileReference, "base64"),
        }),
      }),
      message: movieTitle,
    }),
  );

  logger.info("Bot-largeVideo", `Sent large video "${movieTitle}" to ${toUser}`);
}

bot.start(async (ctx) => {
  const payload = ctx.startPayload;
  const userId = ctx.from.id;

  if (!payload) {
    return ctx.reply("🎬 Welcome! Please select a movie from our website.");
  }

  const messageId = parseInt(payload, 10);
  if (Number.isNaN(messageId)) {
    return ctx.reply("Invalid Payload");
  }

  // ⚡ Immediately respond — gives user feedback
  const searchingMsg = await ctx.reply(
    `🔍 Searching For Your Request...\n Please Wait! `,
  );

  // --- Fetch movie or series ---
  const video = await prismaMovies.videos.findFirst({
    where: { message_id: messageId, chat_id: String(MOVIE_CHANNEL_ID) },
  });

  const seriesEpisode = video
    ? null
    : await seriesPrisma.episode.findFirst({
        where: { message_id: messageId, chat_id: String(SERIES_CHANNEL_ID) },
      });

  if (!video && !seriesEpisode) {
    await ctx.telegram.editMessageText(
      ctx.chat.id,
      searchingMsg.message_id,
      undefined,
      "⚠️ Movie not found.",
    );
    return;
  }

  const record = video
    ? {
        filesize: video.file_size,
        filename: video.file_name,
        fileid: video.file_id ?? null,
        accessHash: video.access_hash,
        fileReference: video.file_reference,
      }
    : {
        filesize: seriesEpisode?.filesize ?? null,
        filename: seriesEpisode?.title ?? null,
        fileid: seriesEpisode?.file_id ?? null,
        accessHash: seriesEpisode?.access_hash,
        fileReference: seriesEpisode?.file_reference,
      };

  try {
    if (!record.filename) {
      await ctx.telegram.editMessageText(
        ctx.chat.id,
        searchingMsg.message_id,
        undefined,
        "⚠️ File name is missing.",
      );
      return;
    }

    const size = record.filesize ? Number(record.filesize) : 0;
    const movieTitle = record.filename.replace(/\.[^/.]+$/, "");

    // Prefer MTProto when we have access_hash (backfilled records or large files)
    if (record.accessHash && record.fileReference) {
      await ctx.telegram.editMessageText(
        ctx.chat.id,
        searchingMsg.message_id,
        undefined,
        "🎥 Sending...",
      );
      await sendLargeVideo(userId, record);
      try {
        await ctx.telegram.deleteMessage(ctx.chat.id, searchingMsg.message_id);
      } catch (e) {}
      return ctx.reply("🎬 Enjoy !");
    }

    if (size > 2000 * 1024 * 1024) {
      await ctx.telegram.editMessageText(
        ctx.chat.id,
        searchingMsg.message_id,
        undefined,
        "⚠️ Cannot send files >2GB without MTProto session.",
      );
      return;
    }

    await ctx.telegram.editMessageText(
      ctx.chat.id,
      searchingMsg.message_id,
      undefined,
      "Sending...",
    );

    await ctx.telegram.sendVideo(userId, String(record.fileid), {
      caption: movieTitle,
      supports_streaming: true,
    });
    try {
      await ctx.telegram.deleteMessage(ctx.chat.id, searchingMsg.message_id);
    } catch (e) {}
    return ctx.reply("🎬 Enjoy !");
  } catch (err) {
    logger.error("Bot-start", "Failed to send video", err);
    await ctx.telegram.editMessageText(
      ctx.chat.id,
      searchingMsg.message_id,
      undefined,
      "⚠️ Failed to send movie.",
    );
  }
});

bot.on("channel_post", async (ctx) => {
  try {
    const chatId = ctx.channelPost.chat.id;

    if (chatId === MOVIE_CHANNEL_ID) {
      await handleMovieChannelPost(ctx);
    } else if (chatId === SERIES_CHANNEL_ID) {
      await handleSeriesChannelPost(ctx);
    } else {
      logger.warn("Bot", `Unknown channel post from chat ID: ${chatId}`);
    }
  } catch (error) {
    logger.error("Bot-channel_post", "Unhandled error processing channel post", error);
  }
});

async function handleMovieChannelPost(ctx: Context) {
  const post = ctx.channelPost;
  if (!post) return;
  const message_id = post.message_id;
  const chat_id = String(post.chat.id);
  const telegram_link = `https://t.me/CineVerse9_bot?start=${message_id}`;

  if ("video" in post && post.video) {
    const video = post.video;
    const file_id = video.file_id;
    const file_name = video.file_name as string;
    const file_size = video.file_size != null ? String(video.file_size) : null;

    const cleanTitle = cleanFilename(file_name);
    const year = extractYear(file_name);

    logger.info("Movie", `Processing video: "${cleanTitle}" (${year || "N/A"})`);

    const results = await searchMovie(cleanTitle);
    const { tmdb_id, releaseDate, genre, popularity, language, rating, thumbnail } =
      extractBestMovieMatch(results, cleanTitle);

    logger.info("Movie", `Matched TMDB ID: ${tmdb_id ?? "❌ Not found"}`);

    const teleMsg = `https://t.me/CineVerse9_bot?start=${message_id}`;
    await prismaMovies.videos.upsert({
      where: { file_id },
      update: {
        popularity: String(popularity),
        language,
        genre,
        thumbnail,
        releaseDate,
        rating: String(rating),
        tmdb_id,
        file_name,
        message_id,
        chat_id,
        file_size,
        telegram_link: teleMsg,
      },
      create: {
        file_id,
        popularity: String(popularity),
        file_name,
        genre,
        language,
        file_size,
        thumbnail,
        releaseDate,
        message_id,
        chat_id,
        telegram_link: teleMsg,
        rating: String(rating),
        title: cleanTitle,
        tmdb_id,
      },
    });

    logger.info("Movie", `Saved video: "${file_name}" -> TMDB#${tmdb_id}`);
  } else if ("document" in post && post.document) {
    const doc = post.document;
    const file_id = doc.file_id;
    const file_name = doc.file_name || "";
    const file_size = doc.file_size != null ? String(doc.file_size) : null;

    const cleanTitle = cleanFilename(file_name);
    const year = extractYear(file_name);

    logger.info("Movie", `Processing document: "${cleanTitle}" (${year || "N/A"})`);

    const results = await searchMovie(cleanTitle);
    const { tmdb_id, releaseDate, genre, popularity, language, rating, backdrop, thumbnail } =
      extractBestMovieMatch(results, cleanTitle);

    logger.info("Movie", `Matched TMDB ID: ${tmdb_id ?? "❌ Not found"}`);

    await prismaMovies.videos.upsert({
      where: { file_id },
      update: {
        popularity: String(popularity),
        language,
        genre,
        backdrop,
        thumbnail,
        releaseDate,
        rating: String(rating),
        tmdb_id,
        file_name,
        message_id,
        chat_id,
        file_size,
        telegram_link,
      },
      create: {
        file_id,
        popularity: String(popularity),
        file_name,
        genre,
        language,
        file_size,
        backdrop,
        thumbnail,
        releaseDate,
        message_id,
        chat_id,
        telegram_link,
        rating: String(rating),
        title: cleanTitle,
        tmdb_id,
      },
    });

    logger.info("Movie", `Saved document: "${file_name}" -> TMDB#${tmdb_id}`);
  }
}

async function handleSeriesChannelPost(ctx: Context) {
  const post = ctx.channelPost;
  if (!post) return;
  if (!("document" in post && post.document)) return;

  const doc = post.document;
  const file_name = doc.file_name || "";
  const message_id = post.message_id;
  const chat_id = String(post.chat.id);
  const telegram_link = `https://t.me/CineVerse9_bot?start=${message_id}`;

  const parsed = extractSeriesEpisode(file_name);
  if (!parsed) {
    logger.warn("Series", `Could not extract series info from "${file_name}"`);
    return;
  }

  const cleanTitle = cleanFilename(parsed.seriesName);
  const seasonNumber = parsed.seasonNumber;
  const episodeNumber = parsed.episodeNumber;

  logger.info("Series", `Processing: "${cleanTitle}" S${seasonNumber}E${episodeNumber}`);

  const results = await searchTvSeries(cleanTitle);
  if (!results.length) {
    logger.warn("Series", `No TMDB results for "${cleanTitle}"`);
    return;
  }

  const bestMatch = findBestSeriesMatch(results, cleanTitle);
  if (!bestMatch) {
    logger.warn("Series", `No close TMDB match for "${cleanTitle}"`);
    return;
  }

  const { tmdbSeriesId, popularity, genre, language, rating, releaseDate, backdrop, bestMatchSeries } = bestMatch;
  const seasonDetails = await getTvSeasonDetails(tmdbSeriesId, seasonNumber);
  if (!seasonDetails) {
    logger.warn("Series", `Season ${seasonNumber} not found for TMDB #${tmdbSeriesId}`);
    return;
  }

  const tmdbSeasonId = seasonDetails.id;
  logger.info("Series", `Matched TMDB Series #${tmdbSeriesId}, Season #${tmdbSeasonId}`);

  const episodeData = await getTvEpisodeDetails(tmdbSeriesId, seasonNumber, episodeNumber);

  const episodeObj: SeriesEpisode = {
    file_id: doc.file_id,
    file_name,
    message_id,
    chat_id,
    telegram_link,
    file_size: doc.file_size != null ? String(doc.file_size) : null,
    mime_type: doc.mime_type,
    series_name: bestMatchSeries.name || bestMatchSeries.original_name || cleanTitle,
    tmdb_series_id: tmdbSeriesId,
    season_number: seasonNumber,
    episode_number: episodeNumber,
    tmdbEpisodeId: episodeData?.id ?? 0,
    episode_title: episodeData?.name ?? undefined,
    episode_overview: episodeData?.overview ?? undefined,
    episode_air_date: episodeData?.air_date ?? undefined,
    episode_still: episodeData?.still_path ?? undefined,
    runtime: episodeData?.runtime ?? undefined,
    tmdb_season_id: tmdbSeasonId,
  };

  // Upsert TVSeries
  const series = await seriesPrisma.tVSeries.upsert({
    where: { tmdbId: episodeObj.tmdb_series_id },
    update: {},
    create: {
      genre,
      backdrop,
      popularity: String(popularity),
      language: String(language),
      rating: String(rating),
      releaseDate,
      tmdbId: episodeObj.tmdb_series_id,
      title: episodeObj.series_name,
      chat_id,
      overview: bestMatchSeries.overview ?? "",
      posterPath: bestMatchSeries.poster_path ?? null,
    },
  });

  // Upsert Season
  const season = await seriesPrisma.season.upsert({
    where: {
      seriesId_seasonNumber: {
        seriesId: series.id,
        seasonNumber: episodeObj.season_number,
      },
    },
    update: {},
    create: {
      tmdbId: tmdbSeasonId,
      seriesId: series.id,
      chat_id,
      seasonNumber: episodeObj.season_number,
    },
  });

  // Create Episode (avoid duplicates by checking file_id)
  const existingEpisode = await seriesPrisma.episode.findFirst({
    where: { file_id: episodeObj.file_id },
  });
  if (existingEpisode) {
    logger.info("Series", `Episode file_id already exists, skipping: "${episodeObj.file_id}"`);
    return;
  }

  await seriesPrisma.episode.create({
    data: {
      season: { connect: { id: season.id } },
      chat_id,
      file_id: episodeObj.file_id,
      episodeNumber: episodeObj.episode_number,
      tmdbEpisodeId: episodeObj.tmdbEpisodeId,
      filesize: episodeObj.file_size ?? null,
      message_id,
      telegramLink: episodeObj.telegram_link ?? null,
      title:
        episodeObj.series_name +
        " S" +
        episodeObj.season_number +
        "E" +
        episodeObj.episode_number +
        " " +
        (episodeObj.episode_title ?? ""),
      overview: episodeObj.episode_overview ?? null,
      runtime: episodeObj.runtime ?? null,
      stillPath: episodeObj.episode_still ?? null,
      airDate: episodeObj.episode_air_date ? new Date(episodeObj.episode_air_date) : null,
    },
  });

  logger.info("Series", `✅ Episode added: ${episodeObj.series_name} S${episodeObj.season_number}E${episodeObj.episode_number}`);
}

bot.help((ctx) => ctx.reply("Send /start to receive a movie 🎥"));

export default bot;
export { userClient, MOVIE_CHANNEL_ID, SERIES_CHANNEL_ID };