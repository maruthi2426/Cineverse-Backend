import { TelegramClient } from "telegram";
import { Api } from "telegram";
import { logger } from "./logger.js";
import { prismaMovies } from "../prisma.js";
import { seriesPrisma } from "../Prismaseries.js";
import { searchMovie, searchTvSeries, getSeasonDetails, getEpisodeDetails, extractBestMovieMatch, findBestSeriesMatch } from "./tmdb.js";
import { cleanFilename, extractSeriesEpisode } from "./cleanFilename.js";
import { type SeriesEpisode, TMDB_GENRES } from "../types.js";

const MOVIE_CHANNEL_ID = Number(process.env.MOVIE_CHANNEL_ID) || -1003137257780;
const SERIES_CHANNEL_ID = Number(process.env.SERIES_CHANNEL_ID) || -1003259326946;

function getFileName(doc: Api.Document): string {
  for (const attr of doc.attributes) {
    if (attr instanceof Api.DocumentAttributeFilename) {
      return attr.fileName;
    }
  }
  return `file_${doc.id}`;
}

export async function backfillMovies(userClient: TelegramClient, limit = 100): Promise<void> {
  const chat_id = String(MOVIE_CHANNEL_ID);
  const entity = await userClient.getEntity(MOVIE_CHANNEL_ID);
  const messages = await userClient.getMessages(entity, { limit });

  let processed = 0;
  let skipped = 0;
  let errors = 0;

  for (const msg of messages) {
    try {
      if (!msg || !msg.media || !(msg.media instanceof Api.MessageMediaDocument)) continue;

      const message_id = msg.id;
      const rawDoc = msg.media.document;
      if (!rawDoc || !(rawDoc instanceof Api.Document)) continue;

      const doc = rawDoc as Api.Document;

      // Skip if already in DB
      const exists = await prismaMovies.videos.findFirst({
        where: { message_id, chat_id },
      });
      if (exists) { skipped++; continue; }

      const file_name = getFileName(doc);
      const file_size = String(doc.size);
      const file_id = String(doc.id);
      const access_hash = doc.accessHash ? BigInt(String(doc.accessHash)) : null;
      const file_reference = (doc.fileReference as Buffer).toString("base64");
      const mimeType = doc.mimeType ?? "";

      const isVideo = mimeType.startsWith("video/");

      const cleanTitle = cleanFilename(file_name);
      logger.info("Backfill", `Processing movie: "${cleanTitle}" (msg #${message_id})`);

      const results = await searchMovie(cleanTitle);
      const match = extractBestMovieMatch(results, cleanTitle);
      const telegram_link = `https://t.me/Rssfeeds26bot_bot?start=${message_id}`;

      await prismaMovies.videos.upsert({
        where: { file_id },
        update: {
          popularity: match.popularity,
          language: match.language,
          genre: match.genre,
          thumbnail: match.thumbnail,
          backdrop: isVideo ? null : match.backdrop,
          releaseDate: match.releaseDate,
          rating: match.rating,
          tmdb_id: match.tmdb_id,
          file_name,
          message_id,
          chat_id,
          file_size,
          telegram_link,
          access_hash,
          file_reference,
        },
        create: {
          file_id,
          popularity: match.popularity,
          file_name,
          genre: match.genre,
          language: match.language,
          file_size,
          thumbnail: match.thumbnail,
          backdrop: isVideo ? null : match.backdrop,
          releaseDate: match.releaseDate,
          message_id,
          chat_id,
          telegram_link,
          rating: match.rating,
          title: cleanTitle,
          tmdb_id: match.tmdb_id,
          access_hash,
          file_reference,
        },
      });

      logger.info("Backfill", `✅ Movie added: "${file_name}" (TMDB #${match.tmdb_id})`);
      processed++;
    } catch (err) {
      logger.error("Backfill", `Error processing movie msg #${msg?.id}`, err);
      errors++;
    }
  }

  logger.info("Backfill", `Movies backfill done: ${processed} added, ${skipped} skipped, ${errors} errors`);
}

export async function backfillSeries(userClient: TelegramClient, limit = 100): Promise<void> {
  const chat_id = String(SERIES_CHANNEL_ID);
  const entity = await userClient.getEntity(SERIES_CHANNEL_ID);
  const messages = await userClient.getMessages(entity, { limit });

  let processed = 0;
  let skipped = 0;
  let errors = 0;

  for (const msg of messages) {
    try {
      if (!msg || !msg.media || !(msg.media instanceof Api.MessageMediaDocument)) continue;

      const message_id = msg.id;
      const rawDoc = msg.media.document;
      if (!rawDoc || !(rawDoc instanceof Api.Document)) continue;

      const doc = rawDoc as Api.Document;
      const mimeType = doc.mimeType ?? "";

      // Skip non-video documents (subtitles, images, etc.)
      if (!mimeType.startsWith("video/")) { skipped++; continue; }

      // Skip if already in DB (by message_id)
      const exists = await seriesPrisma.episode.findFirst({
        where: { message_id, chat_id },
      });
      if (exists) { skipped++; continue; }

      const file_name = getFileName(doc);
      const file_size = String(doc.size);
      const file_id = String(doc.id);
      const access_hash = doc.accessHash ? BigInt(String(doc.accessHash)) : null;
      const file_reference = (doc.fileReference as Buffer).toString("base64");

      const parsed = extractSeriesEpisode(file_name);
      if (!parsed) {
        logger.warn("Backfill", `Could not parse series info from "${file_name}"`);
        skipped++;
        continue;
      }

      const cleanTitle = cleanFilename(parsed.seriesName);
      logger.info("Backfill", `Processing series: "${cleanTitle}" S${parsed.seasonNumber}E${parsed.episodeNumber} (msg #${message_id})`);

      const results = await searchTvSeries(cleanTitle);
      const match = findBestSeriesMatch(results, cleanTitle);
      if (!match) {
        logger.warn("Backfill", `No TMDB match for series "${cleanTitle}"`);
        skipped++;
        continue;
      }

      const { tmdbSeriesId, popularity, genre, language, rating, releaseDate, backdrop, bestMatchSeries } = match;

      const seasonDetails = await getSeasonDetails(tmdbSeriesId, parsed.seasonNumber);
      if (!seasonDetails) {
        logger.warn("Backfill", `Season ${parsed.seasonNumber} not found for TMDB #${tmdbSeriesId}`);
        skipped++;
        continue;
      }

      const episodeData = await getEpisodeDetails(tmdbSeriesId, parsed.seasonNumber, parsed.episodeNumber);
      const telegram_link = `https://t.me/Rssfeeds26bot_bot?start=${message_id}`;

      const episodeObj: SeriesEpisode = {
        file_id,
        file_name,
        message_id,
        chat_id,
        telegram_link,
        file_size,
        mime_type: mimeType,
        series_name: bestMatchSeries.name || bestMatchSeries.original_name || cleanTitle,
        tmdb_series_id: tmdbSeriesId,
        season_number: parsed.seasonNumber,
        episode_number: parsed.episodeNumber,
        tmdbEpisodeId: episodeData?.id ?? 0,
        episode_title: episodeData?.name ?? undefined,
        episode_overview: episodeData?.overview ?? undefined,
        episode_air_date: episodeData?.air_date ?? undefined,
        episode_still: episodeData?.still_path ?? undefined,
        runtime: episodeData?.runtime ?? undefined,
        tmdb_season_id: seasonDetails.id,
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
          tmdbId: episodeObj.tmdb_season_id,
          seriesId: series.id,
          chat_id,
          seasonNumber: episodeObj.season_number,
        },
      });

      // Create Episode
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
          title: `${episodeObj.series_name} S${episodeObj.season_number}E${episodeObj.episode_number} ${episodeObj.episode_title ?? ""}`,
          overview: episodeObj.episode_overview ?? null,
          runtime: episodeObj.runtime ?? null,
          stillPath: episodeObj.episode_still ?? null,
          airDate: episodeObj.episode_air_date ? new Date(episodeObj.episode_air_date) : null,
          access_hash,
          file_reference,
        },
      });

      logger.info("Backfill", `✅ Episode added: ${episodeObj.series_name} S${episodeObj.season_number}E${episodeObj.episode_number}`);
      processed++;
    } catch (err) {
      logger.error("Backfill", `Error processing series msg #${msg?.id}`, err);
      errors++;
    }
  }

  logger.info("Backfill", `Series backfill done: ${processed} added, ${skipped} skipped, ${errors} errors`);
}
