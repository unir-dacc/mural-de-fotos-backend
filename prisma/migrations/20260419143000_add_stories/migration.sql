CREATE TYPE "StoryType" AS ENUM (
  'USER_QUARTERLY_RETROSPECTIVE',
  'USER_YEARLY_RETROSPECTIVE',
  'GLOBAL_YEARLY_RETROSPECTIVE'
);

CREATE TYPE "StoryVisibility" AS ENUM ('USER_ONLY', 'GLOBAL');

CREATE TABLE "Story" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "subtitle" TEXT,
    "type" "StoryType" NOT NULL,
    "visibility" "StoryVisibility" NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Story_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StoryItem" (
    "id" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "storyId" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "mediaId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StoryItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Story_userId_expiresAt_idx" ON "Story"("userId", "expiresAt");
CREATE INDEX "Story_visibility_expiresAt_idx" ON "Story"("visibility", "expiresAt");
CREATE UNIQUE INDEX "Story_type_userId_periodStart_periodEnd_key" ON "Story"("type", "userId", "periodStart", "periodEnd");

CREATE UNIQUE INDEX "StoryItem_storyId_order_key" ON "StoryItem"("storyId", "order");
CREATE UNIQUE INDEX "StoryItem_storyId_mediaId_key" ON "StoryItem"("storyId", "mediaId");
CREATE INDEX "StoryItem_storyId_order_idx" ON "StoryItem"("storyId", "order");
CREATE INDEX "StoryItem_postId_idx" ON "StoryItem"("postId");
CREATE INDEX "StoryItem_mediaId_idx" ON "StoryItem"("mediaId");

ALTER TABLE "Story"
ADD CONSTRAINT "Story_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StoryItem"
ADD CONSTRAINT "StoryItem_storyId_fkey"
FOREIGN KEY ("storyId") REFERENCES "Story"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StoryItem"
ADD CONSTRAINT "StoryItem_postId_fkey"
FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StoryItem"
ADD CONSTRAINT "StoryItem_mediaId_fkey"
FOREIGN KEY ("mediaId") REFERENCES "Media"("id") ON DELETE CASCADE ON UPDATE CASCADE;
