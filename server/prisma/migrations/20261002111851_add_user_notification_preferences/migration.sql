-- AlterTable
ALTER TABLE "users" ADD COLUMN     "emailNotificationsEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "inAppNotificationsEnabled" BOOLEAN NOT NULL DEFAULT true;
