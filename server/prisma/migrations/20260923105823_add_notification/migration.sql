-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('IN_APP');

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "alertId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "notifications_userId_createdAt_idx" ON "notifications"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "notifications_userId_readAt_createdAt_idx" ON "notifications"("userId", "readAt", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "notifications_alertId_userId_channel_key" ON "notifications"("alertId", "userId", "channel");

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_alertId_fkey" FOREIGN KEY ("alertId") REFERENCES "alerts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================
-- Stage 15.6 backfill (hand-written -- Prisma never auto-generates data
-- migrations; this section did not come from `prisma migrate dev`).
--
-- Every pre-existing Alert row already deterministically maps to exactly
-- one recipient via Alert.websiteId -> Website.userId (verified before
-- writing this migration: 0 orphaned/unresolvable Alerts existed). This
-- creates exactly one IN_APP Notification per pre-existing Alert:
--   - id: gen_random_uuid()::text -- Postgres 13+ built-in (no extension
--     needed, confirmed on this database's Postgres 18.4), used only
--     because Prisma's @default(cuid()) is an application-level default,
--     not a DB-level one, so a raw SQL INSERT needs its own id-generation
--     expression. Mixing a UUID-format id here with cuid()-format ids on
--     every future application-created row is safe: the column is a plain
--     TEXT primary key with no format constraint, only a uniqueness one.
--   - userId: Website.userId, the authoritative DB-owned recipient at
--     backfill time -- never guessed, never a client-supplied value.
--   - readAt: NULL for every backfilled row -- no historical read
--     timestamp is fabricated. Consequence (documented, not silently
--     changed): every pre-existing Alert will appear unread the first
--     time an inbox reads it.
--   - createdAt: the Alert's OWN createdAt, not migration time -- so
--     backfilled rows sort correctly alongside future real-time
--     notifications by when the underlying event actually happened,
--     rather than bunching at the moment this migration ran.
-- The (alertId, userId, channel) unique constraint above guarantees this
-- INSERT can never produce a duplicate pair even if this migration were
-- ever mistakenly re-run in a controlled environment (each Alert appears
-- exactly once in the alerts table, so each generated tuple is unique by
-- construction).
-- ============================================================
INSERT INTO "notifications" ("id", "alertId", "userId", "channel", "readAt", "createdAt")
SELECT gen_random_uuid()::text, a."id", w."userId", 'IN_APP', NULL, a."createdAt"
FROM "alerts" a
JOIN "websites" w ON w."id" = a."websiteId";
