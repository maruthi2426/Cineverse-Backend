import axios, { AxiosError } from "axios";
import { tmdbRateLimiter } from "./rateLimiter.js";
import { logger } from "./logger.js";
import stringSimilarity from "string-similarity";
import { TMDB_GENRES } from "../types.js";

const TMDB_BEARER = process.env.TMDB_BEARER;

const RETRYABLE_CODES = new Set(["ECONNRESET", "ETIMEDOUT", "ECONNABORTED"]);
const MAX_ATTEMPTS = 3;
const BASE_DELAY_MS = 1000;

function isRetryable(err: AxiosError): boolean {
  if (err.response) {
    const status = err.response.status;
    return status === 429 || (status >= 500 && status < 600);
  }
  return RETRYABLE_CODES.has(err.code ?? "");
}

async function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function tmdbFetch<T>(url: string): Promise<T | null> {
  if (!TMDB_BEARER) throw new Error("TMDB_BEARER is not set");

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      await tmdbRateLimiter.consume();
      const response = await axios.get(url, {
        headers: { Authorization: `Bearer ${TMDB_BEARER}` },
        timeout: 8000,
      });
      return response.data as T;
    } catch (error) {
      const err = error as AxiosError;
      if (isRetryable(err) && attempt < MAX_ATTEMPTS) {
        const backoff = BASE_DELAY_MS * Math.pow(2, attempt - 1);
        logger.warn("TMDB", `Attempt ${attempt} failed, retrying in ${backoff}ms`, {
          url,
          code: err.code,
          status: err.response?.status,
        });
        await delay(backoff);
        continue;
      }
      logger.error("TMDB", `Request failed after ${attempt} attempts`, err);
      return null;
    }
  }
  return null;
}

interface TmdbSearchResult {
  id: number;
  title?: string;
  name?: string;
  original_name?: string;
  original_language?: string;
  popularity?: number;
  vote_average?: number;
  genre_ids?: number[];
  release_date?: string;
  first_air_date?: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
  overview?: string | null;
}

interface TmdbSearchResponse {
  results: TmdbSearchResult[];
}

interface TmdbSeasonResponse {
  id: number;
  name?: string;
  overview?: string;
  air_date?: string;
  poster_path?: string | null;
}

interface TmdbEpisodeResponse {
  id: number;
  name?: string;
  overview?: string;
  air_date?: string;
  still_path?: string | null;
  runtime?: number;
  vote_average?: number;
}

interface TmdbEpisodeExternalIds {
  imdb_id?: string | null;
  tvdb_id?: number | null;
}

export async function searchMovie(query: string): Promise<TmdbSearchResult[]> {
  const url = `https://api.themoviedb.org/3/search/movie?query=${encodeURIComponent(query)}`;
  const data = await tmdbFetch<TmdbSearchResponse>(url);
  return data?.results ?? [];
}

export async function searchTvSeries(query: string): Promise<TmdbSearchResult[]> {
  const url = `https://api.themoviedb.org/3/search/tv?query=${encodeURIComponent(query)}`;
  const data = await tmdbFetch<TmdbSearchResponse>(url);
  return data?.results ?? [];
}

export async function getSeasonDetails(
  seriesId: number,
  seasonNumber: number,
): Promise<TmdbSeasonResponse | null> {
  const url = `https://api.themoviedb.org/3/tv/${seriesId}/season/${seasonNumber}`;
  return tmdbFetch<TmdbSeasonResponse>(url);
}

export async function getEpisodeDetails(
  seriesId: number,
  seasonNumber: number,
  episodeNumber: number,
): Promise<TmdbEpisodeResponse | null> {
  const url = `https://api.themoviedb.org/3/tv/${seriesId}/season/${seasonNumber}/episode/${episodeNumber}`;
  return tmdbFetch<TmdbEpisodeResponse>(url);
}

export async function getEpisodeExternalIds(
  seriesId: number,
  seasonNumber: number,
  episodeNumber: number,
): Promise<TmdbEpisodeExternalIds | null> {
  const url = `https://api.themoviedb.org/3/tv/${seriesId}/season/${seasonNumber}/episode/${episodeNumber}/external_ids`;
  return tmdbFetch<TmdbEpisodeExternalIds>(url);
}

export type { TmdbSearchResult, TmdbSeasonResponse, TmdbEpisodeResponse };

export function extractBestMovieMatch(
  results: TmdbSearchResult[],
  cleanTitle: string,
): {
  tmdb_id: number | null;
  releaseDate: string | null;
  genre: string[];
  popularity: string;
  language: string;
  rating: string;
  backdrop: string | null;
  thumbnail: string | null;
} {
  const empty = {
    tmdb_id: null as number | null,
    releaseDate: null as string | null,
    genre: [] as string[],
    popularity: "",
    language: "",
    rating: "",
    backdrop: null as string | null,
    thumbnail: null as string | null,
  };

  if (!results.length) return empty;

  const bestMatch = stringSimilarity.findBestMatch(
    cleanTitle.toLowerCase(),
    results.map((r: any) => (r.title || r.name || "").toLowerCase()),
  );

  const best = results[bestMatch.bestMatchIndex];
  if (!best) return empty;

  return {
    tmdb_id: best.id ?? null,
    releaseDate: best.release_date ?? null,
    genre: ((best.genre_ids || []).map((id: number) => TMDB_GENRES[id]).filter(Boolean) as string[]),
    popularity: best.popularity != null ? String(best.popularity) : "",
    language: best.original_language ?? "",
    rating: best.vote_average != null ? String(best.vote_average) : "",
    backdrop: best.backdrop_path ?? null,
    thumbnail: best.poster_path ?? null,
  };
}

export function findBestSeriesMatch(
  results: TmdbSearchResult[],
  cleanTitle: string,
): {
  tmdbSeriesId: number;
  popularity: number;
  genre: string[];
  language: string;
  rating: number;
  releaseDate: string;
  backdrop: string;
  bestMatchSeries: TmdbSearchResult;
} | null {
  if (!results.length) return null;

  const bestMatch = stringSimilarity.findBestMatch(
    cleanTitle.toLowerCase(),
    results.map((r: any) => (r.name || r.original_name || "").toLowerCase()),
  );

  const best = results[bestMatch.bestMatchIndex];
  if (!best) return null;

  return {
    tmdbSeriesId: best.id,
    popularity: best.popularity ?? 0,
    genre: ((best.genre_ids || []).map((id: number) => TMDB_GENRES[id]).filter(Boolean) as string[]),
    language: best.original_language ?? "",
    rating: best.vote_average ?? 0,
    releaseDate: best.first_air_date ?? "",
    backdrop: best.backdrop_path ?? "",
    bestMatchSeries: best,
  };
}
