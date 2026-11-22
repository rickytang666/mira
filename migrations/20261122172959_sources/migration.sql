-- CreateTable
CREATE TABLE "Source" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "studyId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "detail" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "Source_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Source" ADD CONSTRAINT "Source_studyId_fkey" FOREIGN KEY ("studyId") REFERENCES "Study"("id") ON DELETE CASCADE ON UPDATE CASCADE;
