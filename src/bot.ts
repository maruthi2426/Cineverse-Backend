import { Context, Telegraf } from "telegraf";
import { Api, TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions/index.js";
import type { Update } from "telegraf/types";
import dotenv from "dotenv";
import { type SeriesEpisode, type Movie, TMDB_GENRES } from "./types.js";

import axios, { AxiosError } from "axios";
import stringSimilarity from "string-similarity";

import { seriesPrisma } from "./Prismaseries.js";
import { prismaMovies } from "./prisma.js";
import {
  getEpisodeDetails,
  getTmdbIdWithRetry,
  getTvSeriesIdByNameWithRetry,
  getTvTmdbResultsWithRetry,
} from "./gettmdbseries.js";
dotenv.config();

// Initialize bot
export const bot: Telegraf<Context<Update>> = new Telegraf(
  process.env.BOT_TOKEN as string,
);

// Telegram user client (for >2GB)
const apiId = Number(process.env.apiId);
const apiHash = process.env.apiHash as string;
const stringSession = new StringSession(process.env.STRING_SESSION as string);

const MOVIE_CHANNEL_ID = -1003137257780;
const SERIES_CHANNEL_ID = -1003259326946;
// Create a Telegram user client instance (persistent)
const userClient = new TelegramClient(stringSession, apiId, apiHash, {
  connectionRetries: 5,
});

// Connect once at startup
(async () => {
  await userClient.connect();
  console.log("✅ User client connected successfully (MTProto ready).");
})();

// ⚡ Send via user account (>2 GB)
async function sendLargeVideo(toUser: number, video: any) {
  const movieTitle = video.file_name.replace(/\.[^/.]+$/, ""); // clean title

  await userClient.invoke(
    new Api.messages.SendMedia({
      peer: toUser,
      media: new Api.InputMediaDocument({
        id: new Api.InputDocument({
          id: video.file_id, // stored in DB
          accessHash: video.access_hash,
          fileReference: Buffer.from(video.file_reference, "base64"),
        }),
      }),
      message: movieTitle,
    }),
  );

  console.log(`✅ Sent large movie "${movieTitle}" to ${toUser}`);
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

  const SeriesEpisode = video
    ? null
    : await seriesPrisma.episode.findFirst({
        where: { message_id: messageId, chat_id: String(SERIES_CHANNEL_ID) },
      });

  if (!video && !SeriesEpisode) {
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
      }
    : {
        filesize: SeriesEpisode?.filesize ?? null,
        filename: SeriesEpisode?.title ?? null,
        fileid: SeriesEpisode?.file_id ?? null,
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

    const size = Number(record.filesize || 0);
    const movieTitle = record.filename.replace(/\.[^/.]+$/, "");

    if (size > 2000 * 1024 * 1024) {
      await ctx.telegram.editMessageText(
        ctx.chat.id,
        searchingMsg.message_id,
        undefined,
        "🎥 Sending via client (file > 2GB)...",
      );
      await sendLargeVideo(userId, video);
      return ctx.reply("✅ Sent successfully!");
    } else {
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
    }
  } catch (err) {
    console.error("❌ Failed to send:", err);
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
      if (
        ctx.channelPost &&
        "video" in ctx.channelPost &&
        ctx.channelPost.video
      ) {
        const video = ctx.channelPost.video;
        const file_id = video.file_id;
        const file_name = video.file_name as string;
        const message_id = ctx.channelPost.message_id;
        const file_size =
          video.file_size != null ? String(video.file_size) : null;
        const chat_id = String(ctx.channelPost.chat.id);
        const cleanTitle = file_name
          // Remove file extension
          .replace(/\.(mkv|mp4|avi|mov|wmv|flv|m4v|mpg|mpeg)$/i, "")
          // Replace dots and underscores with spaces
          .replace(/[_\.]+/g, " ")
          // Remove special edition phrases like "10th Anniversary Edition"
          .replace(
            /\b\d{1,2}(st|nd|rd|th)?\s*ann?iversar(y|y edition)?\b/gi,
            "",
          )
          // Remove known junk like resolution, codecs, etc.
          .replace(
            /\b((19|20)\d{2}|720p|1080p|2160p|480p|4k|8k|hdr10\+?|hdr|dv|dolby|vision|dts|truehd|atmos|web\s?dl|web\s?rip|webrip|bluray|brrip|hdrip|x264|x265|hevc|h\.?265|avc|aac2?\.?0?|ddp\S*|esubs?|dual\s?audio|tagalog|hindi|telugu|tamil|malayalam|korean|japanese|amzn|nf|psa|aeencodes|yts|hq|hc|ds4k|pahe|rarbg|extended|remastered|multi|proper|repack|imax|org|world|uncut|internal|regraded|10bit|xvid|h264|plus|\+|\d+)\b.*$/gi,
            "",
          )
          // Remove special edition phrases like "10th Anniversary Edition"
          .replace(
            /\b\d{1,2}(st|nd|rd|th)?\s*ann?iversar(y|y edition)?\b/gi,
            "",
          )
          // Remove extra words like 'edition' if left alone
          .replace(/\bEdition\b/gi, "")
          // Remove brackets, dashes, and leftover punctuation
          .replace(/[\(\)\[\]\-]/g, " ")
          // Remove trailing symbols
          .replace(/[+\-_.!@#\$%^&*(),?\/\\]+$/g, "")
          // Remove multiple spaces
          .replace(/\s+/g, " ").replace(/\[Hex_Movies\]/gi, "")

          .trim();

        const yearMatch = file_name.match(/\b(19|20)\d{2}\b/);
        const year = yearMatch ? yearMatch[0] : null;

        console.log(`Clean Title: "${cleanTitle}" | Year: ${year || "N/A"}`);
        const apiKey = process.env.TMDB_API_KEY;
        const tmdbUrl = `https://api.themoviedb.org/3/search/movie?api_key=${apiKey}&query=${encodeURIComponent(cleanTitle)}`;
        const tmdbId = await getTmdbIdWithRetry(cleanTitle);
        const tmdbResp = await axios.get(tmdbUrl);
        const results = tmdbResp.data.results || [];

        let tmdb_id: number | null = null;
        let releaseDate: string = "";
        let genre = [];
        let popularity: string = "";
        let language;
        let rating;
        let thumbnail = "";
        if (results.length > 0) {
          const bestMatch = stringSimilarity.findBestMatch(
            cleanTitle.toLowerCase(),
            results.map((r: any) => r.title.toLowerCase()),
          );
          tmdb_id = results[bestMatch.bestMatchIndex]?.id || null || tmdbId;
          releaseDate = results.release_date || null;
          genre =
            results.genre_ids
              .map((id: number) => TMDB_GENRES[id])
              .filter(Boolean) || [];
          popularity = results.popularity;
          language = results.original_language;
          rating = results.vote_average;
          thumbnail = results.poster_path;
        }

        console.log(
          `🎬 Matched TMDB ID for "${cleanTitle}": ${tmdb_id || "❌ Not found"}`,
        );

        await prismaMovies.videos.create({
          data: {
            language,
            rating,
            title: cleanTitle,
            file_id,
            popularity,
            genre,
            releaseDate,
            file_name,
            message_id,
            chat_id,
            file_size,
            telegram_link: `https://t.me/CineVerse9_bot?start=${message_id}`,
            thumbnail,
            tmdb_id,
          },
        });
        console.log(`Channel video saved: ${file_name} TMDBID${tmdb_id}`);
      } else if ("document" in ctx.channelPost && ctx.channelPost.document) {
        const doc = ctx.channelPost.document;
        const file_id = doc.file_id;
        const file_name = doc.file_name || "";
        const message_id = ctx.channelPost.message_id;
        const file_size = doc.file_size != null ? String(doc.file_size) : null;
        const chat_id = String(ctx.channelPost.chat.id);

        const cleanTitle = file_name
          // Remove file extension
          .replace(/\.(mkv|mp4|avi|mov|wmv|flv|m4v|mpg|mpeg)$/i, "")
          // Replace dots and underscores with spaces
          .replace(/[_\.]+/g, " ")
          // Remove everything after a year or junk tag (very strict cutoff)
          .replace(
            /\b((19|20)\d{2}|720p|1080p|2160p|480p|4k|8k|hdr10\+?|hdr|dv|dolby|vision|dts|truehd|atmos|web\s?dl|web\s?rip|webrip|bluray|brrip|hdrip|x264|x265|hevc|h\.?265|avc|aac2?\.?0?|ddp\S*|esubs?|dual\s?audio|tagalog|hindi|telugu|tamil|malayalam|korean|japanese|amzn|nf|psa|aeencodes|yts|hq|hc|ds4k|pahe|rarbg|extended|remastered|multi|proper|repack|imax|org|world|uncut|internal|regraded|10bit|xvid|h264|plus|\+|\d+)\b.*$/gi,
            "",
          )
          // Remove brackets, dashes, and leftover punctuation
          .replace(/[\(\)\[\]\-]/g, " ")
          // Remove trailing symbols
          .replace(/[+\-_.!@#\$%^&*(),?\/\\]+$/g, "")
          // Remove multiple spaces
          .replace(/\s+/g, " ")
          .trim();

        const yearMatch = file_name.match(/\b(19|20)\d{2}\b/);
        const year = yearMatch ? yearMatch[0] : null;

        console.log(`Clean Title: "${cleanTitle}" | Year: ${year || "N/A"}`);
        const apiKey = process.env.TMDB_API_KEY;
        const tmdbUrl = `https://api.themoviedb.org/3/search/movie?api_key=${apiKey}&query=${encodeURIComponent(cleanTitle)}`;

        const tmdbResp = await axios.get(tmdbUrl);
        const results = tmdbResp.data.results || [];

        let tmdb_id: number | null = null;
        let releaseDate: string = "";
        let genre: string[] = [];
        let popularity: string = "";
        let language;
        let rating;
        let backdrop;
        let thumbnail;
        if (results.length > 0) {
          const bestMatch = stringSimilarity.findBestMatch(
            cleanTitle.toLowerCase(),
            results.map((r: any) => r.title.toLowerCase()),
          );
          tmdb_id = results[bestMatch.bestMatchIndex]?.id || null;
          releaseDate = results[bestMatch.bestMatchIndex].release_date || null;

          genre = results[bestMatch.bestMatchIndex].genre_ids.map(
            (id: number) => TMDB_GENRES[id],
          );
          backdrop = results[bestMatch.bestMatchIndex].backdrop_path;
          popularity = results[bestMatch.bestMatchIndex].popularity;
          language = results[bestMatch.bestMatchIndex].original_language;
          rating = results[bestMatch.bestMatchIndex].vote_average;
          thumbnail = results[bestMatch.bestMatchIndex].poster_path;
        }

        console.log(
          `🎬 Matched TMDB ID for "${cleanTitle}": ${tmdb_id || "❌ Not found"}`,
        );

        await prismaMovies.videos.create({
          data: {
            language,
            rating: String(rating),
            file_id,
            popularity: String(popularity),
            genre,
            backdrop,
            title: cleanTitle,
            releaseDate,
            file_name,
            message_id,
            chat_id,
            file_size,
            telegram_link: `https://t.me/CineVerse9_bot?start=${message_id}`,
            thumbnail,
            tmdb_id,
          },
        });
        console.log(`Channel document saved: ${file_name}`);
      }
    } else if (chatId === SERIES_CHANNEL_ID) {
      if ("document" in ctx.channelPost && ctx.channelPost.document) {
        const doc = ctx.channelPost.document;
        const file_name = doc.file_name || "";
        const message_id = ctx.channelPost.message_id;
        const chat_id = String(ctx.channelPost.chat.id);

        const match = file_name.match(/^(.*?)[.\s_-]+S(\d{1,2})E(\d{1,2})/i);

        if (!match) {
          console.log(`❌ Could not extract series info from ${file_name}`);
          return;
        }

        const seriesName = match[1];

        if (!seriesName) return;
        // Use your cleaning logic for cleanTitle (series name)
        const cleanTitle = seriesName
          // Remove file extension (shouldn't be needed, but for safety)
          .replace(/\.(mkv|mp4|avi|mov|wmv|flv|m4v|mpg|mpeg)$/i, "")
          // Replace dots and underscores with spaces
          .replace(/[_\.]+/g, " ")
          // Remove everything after a year or junk tag (very strict cutoff)
          .replace(
            /\b((19|20)\d{2}|720p|1080p|2160p|480p|4k|8k|hdr10\+?|hdr|dv|dolby|vision|dts|truehd|atmos|web\s?dl|web\s?rip|webrip|bluray|brrip|hdrip|x264|x265|hevc|h\.?265|avc|aac2?\.?0?|ddp\S*|esubs?|dual\s?audio|tagalog|hindi|telugu|tamil|malayalam|korean|japanese|amzn|nf|psa|aeencodes|yts|hq|hc|ds4k|pahe|rarbg|extended|remastered|multi|proper|repack|imax|org|world|uncut|internal|regraded|10bit|xvid|h264|plus|\+|\d+)\b.*$/gi,
            "",
          )
          // Remove brackets, dashes, and leftover punctuation
          .replace(/[\(\)\[\]\-]/g, " ")
          // Remove trailing symbols
          .replace(/[+\-_.!@#\$%^&*(),?\/\\]+$/g, "")
          // Remove multiple spaces
          .replace(/\s+/g, " ")
          .trim();
        if (!match[2] || !match[3]) {
          throw new Error("Regex match failed for season or episode number");
        }
        const seasonNumber = parseInt(match[2], 10);
        const episodeNumber = parseInt(match[3], 10);
        console.log(
          `Series: "${cleanTitle}" | Season: ${seasonNumber} | Episode: ${episodeNumber}`,
        );

        const results = await getTvTmdbResultsWithRetry(cleanTitle);

        let tmdbSeriesId: number | null = null;
        let popularity;
        let genre;
        let bestMatchSeries;
        let language;
        let rating;
        let releaseDate;
        let backdrop;
        if (results.length > 0) {
          const bestMatch = stringSimilarity.findBestMatch(
            cleanTitle.toLowerCase(),
            results.map((r: any) =>
              (r.name || r.original_name || "").toLowerCase(),
            ),
          );

          tmdbSeriesId = results[bestMatch.bestMatchIndex]?.id || null;
          popularity = results[bestMatch.bestMatchIndex].popularity;
          genre =
            results[bestMatch.bestMatchIndex].genre_ids
              .map((id: number) => TMDB_GENRES[id])
              .filter(Boolean) || [];
          language = results[bestMatch.bestMatchIndex].original_language;
          rating = results[bestMatch.bestMatchIndex].vote_average;
          releaseDate = results[bestMatch.bestMatchIndex].first_air_date;
          backdrop = results[bestMatch.bestMatchIndex].backdrop_path;
          bestMatchSeries = results[bestMatch.bestMatchIndex];
        }

        if (!tmdbSeriesId) {
          console.log(`❌ No TMDB match for series "${cleanTitle}"`);
          return;
        }
        const seasonDetails = await getTvSeriesIdByNameWithRetry(
          tmdbSeriesId,
          seasonNumber,
        );
        if (seasonDetails === null) {
          return;
        }

        const tmdbSeasonId = seasonDetails.id;
        console.log(
          `📺 Matched TMDB Series ID for "${cleanTitle}": ${tmdbSeriesId}`,
        );
        const episodeData = await getEpisodeDetails(
          tmdbSeriesId,
          seasonNumber,
          episodeNumber,
        );
        // --- Compose SeriesEpisode object (type-safe) ---
        const episodeObj: SeriesEpisode = {
          file_id: doc.file_id,
          file_name,
          message_id,
          chat_id,
          telegram_link: `https://t.me/CineVerse9_bot?start=${message_id}`,
          file_size: doc.file_size != null ? String(doc.file_size) : null,
          mime_type: doc.mime_type,
          series_name: bestMatchSeries.name, // Use name from TMDB
          tmdb_series_id: tmdbSeriesId,
          season_number: seasonNumber,
          episode_number: episodeNumber,
          tmdbEpisodeId: episodeData.id,
          episode_title: episodeData.name,
          episode_overview: episodeData.overview,
          episode_air_date: episodeData.air_date,
          episode_still: episodeData.still_path,
          runtime: episodeData.runtime,
          tmdb_season_id: tmdbSeasonId,
        };

        const series = await seriesPrisma.tVSeries.upsert({
          where: { tmdbId: episodeObj.tmdb_series_id },
          update: {},
          create: {
            genre: genre,
            backdrop,
            popularity: String(popularity),
            language: String(language),
            rating: String(rating),
            releaseDate,
            tmdbId: episodeObj.tmdb_series_id,
            title: episodeObj.series_name,
            chat_id: chat_id,
            overview: bestMatchSeries.overview, // Make sure `bestMatchSeries` is the full series object from TMDB
            posterPath: bestMatchSeries.poster_path,
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
            chat_id: chat_id,
            seasonNumber: episodeObj.season_number,
          },
        });

        // =================================================================
        //  FIX: Create Episode with ALL the details from episodeObj
        // =================================================================
        await seriesPrisma.episode.create({
          data: {
            // Link to the season
            season: { connect: { id: season.id } },
            chat_id: chat_id,
            file_id: episodeObj.file_id,
            episodeNumber: episodeObj.episode_number,
            tmdbEpisodeId: episodeObj.tmdbEpisodeId,
            filesize: episodeObj.file_size ?? null,
            message_id: message_id,
            // optional fields: convert undefined -> null to match Prisma types
            telegramLink: episodeObj.telegram_link ?? null,

            title:
              episodeObj.series_name +
              " " +
              " S" +
              episodeObj.season_number +
              "E" +
              episodeObj.episode_number +
              " " +
              episodeObj.episode_title,
            overview: episodeObj.episode_overview ?? null,
            runtime: episodeObj.runtime ?? null,
            stillPath: episodeObj.episode_still ?? null,
            airDate: episodeObj.episode_air_date
              ? new Date(episodeObj.episode_air_date)
              : null,
          },
        });
        // =================================================================

        console.log(
          `✅ Episode added: ${episodeObj.series_name} S${episodeObj.season_number}E${episodeObj.episode_number}`,
        );
      }
    } else {
      console.log(`⚠️ Unknown channel: ${chatId}`);
    }
  } catch (error) {
    console.log(error);
  }
});

bot.help((ctx) => ctx.reply("Send /start to receive a movie 🎥"));

export default bot;
