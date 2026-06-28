import axios, { AxiosError } from "axios";
import https from "https";
export async function getTvTmdbResultsWithRetry(seriesName) {
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
        }
        catch (error) {
            const err = error;
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
export async function getEpisodeDetails(seriesId, seasonNumber, episodeNumber) {
    const apiKey = process.env.TMDB_API_KEY;
    if (!apiKey)
        throw new Error("TMDB_API_KEY is not set");
    const url = `https://api.themoviedb.org/3/tv/${seriesId}/season/${seasonNumber}/episode/${episodeNumber}?api_key=${apiKey}`;
    const maxAttempts = 3;
    const delayMs = 1000;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            const resp = await axios.get(url, {
                timeout: 5000,
                httpsAgent: new https.Agent({ keepAlive: false }),
            });
            console.log(resp.data);
            return resp.data;
        }
        catch (error) {
            const err = error;
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
export async function getTvSeriesIdByNameWithRetry(seriesTmdbId, seasonNumber) {
    const apiKey = process.env.TMDB_API_KEY;
    if (!apiKey)
        throw new Error("TMDB_API_KEY missing");
    const url = `https://api.themoviedb.org/3/tv/${seriesTmdbId}/season/${seasonNumber}?api_key=${apiKey}`;
    const maxAttempts = 3, delayMs = 1000;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            const resp = await axios.get(url, {
                timeout: 5000,
                httpsAgent: new https.Agent({ keepAlive: false }),
            });
            const data = resp.data;
            let id = data.id;
            return { id };
            // ✅ season.id directly from response
        }
        catch (err) {
            const e = err;
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
export async function getTmdbIdWithRetry(cleanTitle) {
    const apiKey = process.env.TMDB_API_KEY;
    if (!apiKey) {
        throw new Error("TMDB_API_KEY is not set in environment variables.");
    }
    const tmdbUrl = `https://api.themoviedb.org/3/search/movie?api_key=${apiKey}&query=${encodeURIComponent(cleanTitle)}`;
    const maxAttempts = 3;
    const delayMs = 1000;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            const response = await axios.get(tmdbUrl, {
                timeout: 5000,
                httpsAgent: new https.Agent({ keepAlive: false }),
            });
            const results = response.data.results || [];
            return results.length > 0 ? results[0].id : null;
        }
        catch (error) {
            const err = error;
            if (err.code === "ECONNRESET" && attempt < maxAttempts) {
                // Wait before retrying
                await new Promise((res) => setTimeout(res, delayMs));
                continue;
            }
            // Log and rethrow for non-retryable errors or final failure
            console.error(`[TMDB] Attempt ${attempt} failed:`, err.message);
            throw err;
        }
    }
    return null;
}
//# sourceMappingURL=gettmdbseries.js.map