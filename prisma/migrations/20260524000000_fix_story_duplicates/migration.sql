-- 1. Remove duplicate GLOBAL_YEARLY_RETROSPECTIVE stories, keeping the newest per period.
--    This is necessary because PostgreSQL's UNIQUE constraint does NOT prevent duplicate rows
--    when userId IS NULL (NULL != NULL in unique constraints), so multiple global stories
--    could be created for the same period.
DELETE FROM "Story"
WHERE "userId" IS NULL
  AND "id" NOT IN (
    SELECT DISTINCT ON ("type", "periodStart", "periodEnd") "id"
    FROM "Story"
    WHERE "userId" IS NULL
    ORDER BY "type", "periodStart", "periodEnd", "createdAt" DESC
  );

-- 2. Replace the combined unique index with two partial indexes so that NULL userId
--    is also correctly constrained.

-- Drop the original index that doesn't handle NULL userId properly.
DROP INDEX IF EXISTS "Story_type_userId_periodStart_periodEnd_key";

-- Unique constraint for user-specific stories (userId IS NOT NULL).
CREATE UNIQUE INDEX "Story_type_userId_periodStart_periodEnd_key"
  ON "Story"("type", "userId", "periodStart", "periodEnd")
  WHERE "userId" IS NOT NULL;

-- Unique constraint for global stories (userId IS NULL).
CREATE UNIQUE INDEX "Story_global_type_periodStart_periodEnd_key"
  ON "Story"("type", "periodStart", "periodEnd")
  WHERE "userId" IS NULL;

-- 3. Rename the enum value to match what the service code actually uses.
ALTER TYPE "StoryType" RENAME VALUE 'USER_QUARTERLY_RETROSPECTIVE' TO 'USER_SEMESTERLY_RETROSPECTIVE';
