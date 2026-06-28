import axios, { AxiosError } from "axios";
import https from "https";

export async function getTvTmdbResultsWithRetry(seriesName: string): Promise<any[]> {
  const apiKey = process.env.TMDB_API_KEY;
  if (!apiKey) {
    throw new Error("TMDB_API_KEY is not set in environment variables.");
  }

  const tmdbUrl = `https://api.themoviedb.org/3/search/tv?api_key=${apiKey}&query=${encodeURIComponent(seriesName)}`;

  const maxAttempts = 3;
  const delayMs = 1000;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await axios.get(tmdbUrl, {
        timeout: 5000,
        httpsAgent: new https.Agent({ keepAlive: false }),
      });
      return response.data.results || [];
    } catch (error) {
      const err = error as AxiosError;
      if (err.code === "ECONNRESET" && attempt < maxAttempts) {
        await new Promise((res) => setTimeout(res, delayMs));
        continue;
      }
      console.error(`[TMDB] TV search attempt ${attempt} failed:`, err.message);
      throw err;
    }
  }

  return [];
}

export async function getEpisodeDetails(
  seriesId: number, seasonNumber: number, episodeNumber: number
) {
  const apiKey = process.env.TMDB_API_KEY;
  if (!apiKey) throw new Error("TMDB_API_KEY is not set");
  const url = `https://api.themoviedb.org/3/tv/${seriesId}/season/${seasonNumber}/episode/${episodeNumber}?api_key=${apiKey}`;
  const maxAttempts = 3;
  const delayMs = 1000;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const resp = await axios.get(url, {
        timeout: 5000,
        httpsAgent: new https.Agent({ keepAlive: false }),
      });
      console.log(resp.data)
      return resp.data;
    } catch (error) {
      const err = error as AxiosError;
      if (err.code === "ECONNRESET" && attempt < maxAttempts) {
        await new Promise((res) => setTimeout(res, delayMs));
        continue;
      }
      console.error(`[TMDB] Episode details attempt ${attempt} failed:`, err.message);
      throw err;
    }
  }
  throw new Error("Failed to fetch episode details after 3 attempts");
}
export async function getTvSeriesIdByNameWithRetry(
  seriesTmdbId: number,
  seasonNumber: number
): Promise<any | null> {
  const apiKey = process.env.TMDB_API_KEY;
  if (!apiKey) throw new Error("TMDB_API_KEY missing");

  const url = `https://api.themoviedb.org/3/tv/${seriesTmdbId}/season/${seasonNumber}?api_key=${apiKey}`;
  const maxAttempts = 3, delayMs = 1000;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const resp = await axios.get(url, {
        timeout: 5000,
        httpsAgent: new https.Agent({ keepAlive: false }),
      });
      const data = resp.data;
     
     
      let id = data.id
      return { id}; 
      // ✅ season.id directly from response
    } catch (err) {
      const e = err as AxiosError;
      if (e.code === "ECONNRESET" && attempt < maxAttempts) {
        await new Promise((r) => setTimeout(r, delayMs));
        continue;
      }
      console.error(`[TMDB] TV season fetch attempt ${attempt} failed:`, e.message);
      throw err;
    }
  }
  return null;
}

export async function getTmdbIdWithRetry(
  cleanTitle: string
): Promise<number | null> {
  const token = process.env.TMDB_BEARER;
  if (!token) throw new Error("TMDB_BEARER is not set");

  const maxAttempts = 3;
  const delayMs = 1000;
  const retryableErrors = new Set([
    "ECONNRESET",
    "ETIMEDOUT",
    "ECONNABORTED",
  ]);

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await axios.get(
        "https://api.themoviedb.org/3/search/movie",
        {
          params: { query: cleanTitle },
          headers: { Authorization: `Bearer ${token}` },
          timeout: 5000,
          httpsAgent: new https.Agent({ keepAlive: false }),
        }
      );

      const results = response.data?.results ?? [];
      return results.length ? results[0].id : null;
    } catch (error) {
      const err = error as AxiosError;

      if (
        retryableErrors.has(err.code ?? "") &&
        attempt < maxAttempts
      ) {
        await new Promise((r) => setTimeout(r, delayMs));
        continue;
      }

      console.error(`[TMDB] Failed for "${cleanTitle}":`, err.message);
      return null; // <-- graceful exit
    }
  }

  return null;
}
