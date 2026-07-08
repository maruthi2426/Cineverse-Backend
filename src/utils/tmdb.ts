import axios, { AxiosError } from "axios";
import { tmdbRateLimiter } from "./rateLimiter.js";
import { logger } from "./logger.js";

const TMDB_API_KEY = process.env.TMDB_API_KEY;
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

async function tmdbFetch<T>(url: string, useBearer = false): Promise<T | null> {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      await tmdbRateLimiter.consume();
      const headers: Record<string, string> = {};
      if (useBearer && TMDB_BEARER) {
        headers["Authorization"] = `Bearer ${TMDB_BEARER}`;
      }
      const response = await axios.get(url, { headers, timeout: 8000 });
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
  const apiKey = TMDB_API_KEY;
  if (!apiKey) throw new Error("TMDB_API_KEY not set");
  const url = `https://api.themoviedb.org/3/search/movie?api_key=${apiKey}&query=${encodeURIComponent(query)}`;
  const data = await tmdbFetch<TmdbSearchResponse>(url);
  return data?.results ?? [];
}

export async function searchTvSeries(query: string): Promise<TmdbSearchResult[]> {
  const apiKey = TMDB_API_KEY;
  if (!apiKey) throw new Error("TMDB_API_KEY not set");
  const url = `https://api.themoviedb.org/3/search/tv?api_key=${apiKey}&query=${encodeURIComponent(query)}`;
  const data = await tmdbFetch<TmdbSearchResponse>(url);
  return data?.results ?? [];
}

export async function getSeasonDetails(
  seriesId: number,
  seasonNumber: number,
): Promise<TmdbSeasonResponse | null> {
  const apiKey = TMDB_API_KEY;
  if (!apiKey) throw new Error("TMDB_API_KEY not set");
  const url = `https://api.themoviedb.org/3/tv/${seriesId}/season/${seasonNumber}?api_key=${apiKey}`;
  return tmdbFetch<TmdbSeasonResponse>(url);
}

export async function getEpisodeDetails(
  seriesId: number,
  seasonNumber: number,
  episodeNumber: number,
): Promise<TmdbEpisodeResponse | null> {
  const apiKey = TMDB_API_KEY;
  if (!apiKey) throw new Error("TMDB_API_KEY not set");
  const url = `https://api.themoviedb.org/3/tv/${seriesId}/season/${seasonNumber}/episode/${episodeNumber}?api_key=${apiKey}`;
  return tmdbFetch<TmdbEpisodeResponse>(url);
}

export async function getEpisodeExternalIds(
  seriesId: number,
  seasonNumber: number,
  episodeNumber: number,
): Promise<TmdbEpisodeExternalIds | null> {
  const apiKey = TMDB_API_KEY;
  if (!apiKey) throw new Error("TMDB_API_KEY not set");
  const url = `https://api.themoviedb.org/3/tv/${seriesId}/season/${seasonNumber}/episode/${episodeNumber}/external_ids?api_key=${apiKey}`;
  return tmdbFetch<TmdbEpisodeExternalIds>(url);
}

export type { TmdbSearchResult, TmdbSeasonResponse, TmdbEpisodeResponse };
