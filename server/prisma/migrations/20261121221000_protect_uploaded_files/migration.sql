CREATE TABLE "uploaded_files" (
  "filename" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "uploaderId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "uploaded_files_pkey" PRIMARY KEY ("filename"),
  CONSTRAINT "uploaded_files_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "uploaded_files_uploaderId_fkey" FOREIGN KEY ("uploaderId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "uploaded_files_schoolId_uploaderId_idx" ON "uploaded_files"("schoolId", "uploaderId");
