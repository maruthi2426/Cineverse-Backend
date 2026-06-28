-- CreateTable
CREATE TABLE "Videos" (
    "id" SERIAL NOT NULL,
    "file_id" TEXT NOT NULL,
    "popularity" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "genre" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "language" TEXT NOT NULL,
    "file_size" TEXT DEFAULT '',
    "thumbnail" TEXT,
    "backdrop" TEXT,
    "releaseDate" TEXT,
    "message_id" INTEGER,
    "chat_id" TEXT NOT NULL,
    "telegram_link" TEXT,
    "rating" TEXT,
    "title" TEXT NOT NULL,
    "tmdb_id" INTEGER,

    CONSTRAINT "Videos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Videos_file_id_key" ON "Videos"("file_id");
