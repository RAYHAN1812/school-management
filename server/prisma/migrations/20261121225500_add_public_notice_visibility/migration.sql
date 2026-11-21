ALTER TABLE "notices"
ADD COLUMN "isPublic" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "notices_schoolId_isPublic_status_publishDate_idx"
ON "notices"("schoolId", "isPublic", "status", "publishDate");
