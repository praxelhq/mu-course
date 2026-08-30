ALTER TYPE "GateTarget" ADD VALUE 'app_review';

CREATE TABLE "AppReviewRound" (
  "id" TEXT PRIMARY KEY, "assignmentId" TEXT NOT NULL REFERENCES "Assignment"("id"),
  "title" TEXT NOT NULL, "rubricVersion" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "AppReviewEntry" (
  "id" TEXT PRIMARY KEY, "roundId" TEXT NOT NULL REFERENCES "AppReviewRound"("id"),
  "authorId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "sectionId" TEXT NOT NULL, "appUrl" TEXT NOT NULL, "sourceRef" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "AppReviewEntry_roundId_authorId_key" ON "AppReviewEntry"("roundId", "authorId");
CREATE INDEX "AppReviewEntry_roundId_sectionId_idx" ON "AppReviewEntry"("roundId", "sectionId");
CREATE TABLE "AppReview" (
  "id" TEXT PRIMARY KEY, "roundId" TEXT NOT NULL REFERENCES "AppReviewRound"("id"),
  "entryId" TEXT NOT NULL REFERENCES "AppReviewEntry"("id") ON DELETE CASCADE,
  "reviewerId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "slot" INTEGER NOT NULL CHECK ("slot" BETWEEN 1 AND 5),
  "visual" INTEGER CHECK ("visual" BETWEEN 1 AND 5),
  "functionality" INTEGER CHECK ("functionality" BETWEEN 1 AND 5),
  "overall" INTEGER CHECK ("overall" BETWEEN 1 AND 5),
  "comment" TEXT NOT NULL DEFAULT '', "accessIssue" TEXT,
  "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3), "retiredAt" TIMESTAMP(3),
  CONSTRAINT "AppReview_complete_scores" CHECK (
    ("completedAt" IS NULL AND "visual" IS NULL AND "functionality" IS NULL AND "overall" IS NULL AND "comment" = '') OR
    ("completedAt" IS NOT NULL AND "visual" IS NOT NULL AND "functionality" IS NOT NULL AND "overall" IS NOT NULL
      AND length("comment") <= 5000 AND cardinality(regexp_split_to_array(trim("comment"), '\s+')) >= 20)
  )
);
CREATE UNIQUE INDEX "AppReview_roundId_reviewerId_entryId_key" ON "AppReview"("roundId", "reviewerId", "entryId");
CREATE UNIQUE INDEX "AppReview_active_slot_key" ON "AppReview"("roundId", "reviewerId", "slot") WHERE "retiredAt" IS NULL;
CREATE INDEX "AppReview_roundId_reviewerId_retiredAt_idx" ON "AppReview"("roundId", "reviewerId", "retiredAt");
CREATE INDEX "AppReview_entryId_idx" ON "AppReview"("entryId");

CREATE FUNCTION "validate_app_review"() RETURNS trigger AS $$
DECLARE entry "AppReviewEntry"; reviewer "User";
BEGIN
  PERFORM "reject_dpdp_user_write"(NEW."reviewerId");
  SELECT * INTO entry FROM "AppReviewEntry" WHERE "id" = NEW."entryId";
  PERFORM "reject_dpdp_user_write"(entry."authorId");
  SELECT * INTO reviewer FROM "User" WHERE "id" = NEW."reviewerId";
  IF entry."roundId" IS DISTINCT FROM NEW."roundId" OR entry."authorId" = NEW."reviewerId"
    OR reviewer."role" <> 'student' OR reviewer."sectionId" IS DISTINCT FROM entry."sectionId" THEN
    RAISE EXCEPTION 'Invalid app review ownership or section' USING ERRCODE = 'check_violation';
  END IF;
  IF TG_OP = 'UPDATE' AND (
    ROW(NEW."roundId", NEW."entryId", NEW."reviewerId", NEW."slot", NEW."assignedAt") IS DISTINCT FROM
    ROW(OLD."roundId", OLD."entryId", OLD."reviewerId", OLD."slot", OLD."assignedAt")
    OR OLD."completedAt" IS NOT NULL OR OLD."retiredAt" IS NOT NULL
  ) THEN RAISE EXCEPTION 'App review receipt is immutable' USING ERRCODE = 'check_violation'; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "validate_AppReview" BEFORE INSERT OR UPDATE ON "AppReview" FOR EACH ROW EXECUTE FUNCTION "validate_app_review"();

CREATE FUNCTION "validate_app_review_entry"() RETURNS trigger AS $$
BEGIN
  PERFORM "reject_dpdp_user_write"(NEW."authorId");
  IF TG_OP = 'UPDATE' THEN RAISE EXCEPTION 'App review entry snapshots are immutable' USING ERRCODE = 'check_violation'; END IF;
  IF NOT EXISTS (SELECT 1 FROM "User" WHERE "id" = NEW."authorId" AND "role" = 'student' AND "sectionId" = NEW."sectionId") THEN
    RAISE EXCEPTION 'Invalid app review author' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "validate_AppReviewEntry" BEFORE INSERT OR UPDATE ON "AppReviewEntry" FOR EACH ROW EXECUTE FUNCTION "validate_app_review_entry"();
