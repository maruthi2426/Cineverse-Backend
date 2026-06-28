export type Movie = {
  file_id:string ,
   file_name:string , 
   populatiry : string | null , 
   file_size :string | undefined | null,
   thumbnail ?: any,
  link? : string,
  message_id : number,
  chat_id?:  string;     
  language : string[],
  genre?: string[];
 telegram_link : string,
 releaseDat : string,
  rating : string
}

export type SeriesEpisode = {
  file_id: string;
  file_name: string;
  message_id: number;
  chat_id?: string;
  telegram_link: string;
  thumbnail?: string | null;
  file_size?: string | undefined | null;
  mime_type?: string | undefined;
  // TV-specific fields
  series_name: string;
  tmdb_series_id: number;
  tmdb_season_id : number | null
  season_number: number;
  episode_number: number;
  // You may want to add these if you store them
  width?: number | null;
  height?: number | null;
  tmdbEpisodeId: number;
  episode_title?: string;
  episode_overview?: string;
  episode_air_date?: string;
  episode_still?: string;
  runtime?: number;
  vote_average?: number;
};

export const TMDB_GENRES: Record<number, string> = {
  28: "Action",
  12: "Adventure",
  16: "Animation",
  35: "Comedy",
  80: "Crime",
  99: "Documentary",
  18: "Drama",
  10751: "Family",
  14: "Fantasy",
  36: "History",
  27: "Horror",
  10402: "Music",
  9648: "Mystery",
  10749: "Romance",
  878: "Science Fiction",
  10770: "TV Movie",
  53: "Thriller",
  10752: "War",
  37: "Western"
};
