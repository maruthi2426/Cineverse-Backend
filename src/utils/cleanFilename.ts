export function cleanFilename(fileName: string): string {
  return fileName
    .replace(/\.(mkv|mp4|avi|mov|wmv|flv|m4v|mpg|mpeg)$/i, "")
    .replace(/[_\.]+/g, " ")
    .replace(/\b\d{1,2}(st|nd|rd|th)?\s*ann?iversar(y|y edition)?\b/gi, "")
    .replace(
      /\b((19|20)\d{2}|720p|1080p|2160p|480p|4k|8k|hdr10\+?|hdr|dv|dolby|vision|dts|truehd|atmos|web\s?dl|web\s?rip|webrip|bluray|brrip|hdrip|x264|x265|hevc|h\.?265|avc|aac2?\.?0?|ddp\S*|esubs?|dual\s?audio|tagalog|hindi|telugu|tamil|malayalam|korean|japanese|amzn|nf|psa|aeencodes|yts|hq|hc|ds4k|pahe|rarbg|extended|remastered|multi|proper|repack|imax|org|world|uncut|internal|regraded|10bit|xvid|h264|plus|\+|\d+)\b.*$/gi,
      "",
    )
    .replace(/\bEdition\b/gi, "")
    .replace(/\[Hex_Movies\]/gi, "")
    .replace(/[\(\)\[\]\-]/g, " ")
    .replace(/[+\-_.!@#\$%^&*(),?\/\\]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function extractYear(fileName: string): string | null {
  const match = fileName.match(/\b(19|20)\d{2}\b/);
  return match ? match[0] : null;
}

export function extractSeriesEpisode(fileName: string): {
  seriesName: string;
  seasonNumber: number;
  episodeNumber: number;
} | null {
  const match = fileName.match(/^(.*?)[.\s_-]+S(\d{1,2})E(\d{1,2})/i);
  if (!match || !match[1] || !match[2] || !match[3]) return null;
  return {
    seriesName: match[1].trim(),
    seasonNumber: parseInt(match[2], 10),
    episodeNumber: parseInt(match[3], 10),
  };
}
