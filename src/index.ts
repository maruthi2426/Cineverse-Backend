import express from "express";
import dotenv from "dotenv";
import bot from "./bot.js";

import cors from 'cors'
import { prismaMovies } from "./prisma.js";
import { seriesPrisma } from "./Prismaseries.js";

dotenv.config();


const app = express();

app.use(cors({origin : ["http://localhost:3000","https://cinevers.vercel.app/"]}))

app.get('/', (req, res) => {
  res.status(200).json({ msg: "HealthCheck : Good" });
});


app.get('/latestMovies',async(req,res)=>{
  try {
    const movies = await prismaMovies.videos.findMany({
      orderBy : { id : 'desc'},
      take : 20,
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
    console.error(error);
    res.status(500).json({ msg: 'Internal Server Error' });
  }})

app.get('/latestSeries',async(req,res)=>{
  try {
    const movies = await seriesPrisma.tVSeries.findMany({
      orderBy : { id : 'desc'},
      take : 20,
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
    console.error(error);
    res.status(500).json({ msg: 'Internal Server Error' });
  }})

app.get('/allvideos',async (req, res) => {
  try {
    const data = await prismaMovies.videos.findMany({})
    res.status(200).json({ msg: "All videos", data });
  } catch (error) {
    console.log(error);
    res.status(500).json({ msg: "Internal Server Error" });
  }
});

app.get('/allseries',async (req, res) => {
  try {
    const data = await seriesPrisma.tVSeries.findMany({})
    res.status(200).json({ msg: "All Series", data });
  } catch (error) {
    console.log(error);
    res.status(500).json({ msg: "Internal Server Error" });
  }
});
app.get('/allseasons',async (req, res) => {
  try {
    const data = await seriesPrisma.season.findMany({})
    res.status(200).json({ msg: "All seasons", data });
  } catch (error) {
    console.log(error);
    res.status(500).json({ msg: "Internal Server Error" });
  }
});
app.get('/allepisode',async (req, res) => {
  try {
    const data = await seriesPrisma.episode.findMany({})
    res.status(200).json({ msg: "All Episode", data });
  } catch (error) {
    console.log(error);
    res.status(500).json({ msg: "Internal Server Error" });
  }
});
(async () => {
  try {
    await bot.launch();
    console.log("🚀 Telegram bot launched successfully!");
  } catch (err) {
    console.error("❌ Failed to launch bot:", err);
  }
})();

app.listen(3001, () => {
  console.log('Express server running on port 3001');
});
