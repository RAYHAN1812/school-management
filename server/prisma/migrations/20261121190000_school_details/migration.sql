CREATE TABLE "school_details" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "nameBn" TEXT,
  "logoUrl" TEXT,
  "coverUrl" TEXT,
  "aboutUs" TEXT,
  "introduction" TEXT,
  "history" TEXT,
  "educationalPhilosophy" TEXT,
  "objectives" TEXT,
  "mission" TEXT,
  "vision" TEXT,
  "coreValues" TEXT,
  "principalMessage" TEXT,
  "academicPrograms" TEXT,
  "educationLevels" TEXT,
  "teachingApproach" TEXT,
  "academicCalendar" TEXT,
  "examinationInfo" TEXT,
  "achievements" TEXT,
  "specialPrograms" TEXT,
  "activities" JSONB,
  "awards" JSONB,
  "published" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "school_details_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "school_details_schoolId_key" UNIQUE ("schoolId"),
  CONSTRAINT "school_details_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "school_gallery_albums" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "coverUrl" TEXT,
  "published" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "school_gallery_albums_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "school_gallery_albums_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "school_gallery_images" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "albumId" TEXT,
  "title" TEXT NOT NULL,
  "caption" TEXT,
  "category" TEXT NOT NULL,
  "eventDate" DATE,
  "imageUrl" TEXT NOT NULL,
  "published" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "school_gallery_images_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "school_gallery_images_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "school_gallery_images_albumId_fkey" FOREIGN KEY ("albumId") REFERENCES "school_gallery_albums"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "school_gallery_albums_schoolId_published_idx" ON "school_gallery_albums"("schoolId", "published");
CREATE INDEX "school_gallery_images_schoolId_published_category_idx" ON "school_gallery_images"("schoolId", "published", "category");
