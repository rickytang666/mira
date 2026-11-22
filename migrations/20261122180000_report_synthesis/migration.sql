-- Retain full conversations and cache evidence-backed reports.
ALTER TABLE "Study" ADD COLUMN "report" JSONB,
ADD COLUMN "reportRevision" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "reportError" TEXT;
ALTER TABLE "Interview" ADD COLUMN "transcript" JSONB,
ADD COLUMN "questionSnapshot" JSONB;
