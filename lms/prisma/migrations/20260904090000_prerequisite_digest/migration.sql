-- A Make blueprint reaches the interviewer as raw exported JSON: module ids,
-- coordinates, mapper expressions. That is not something a voice interviewer
-- can question a student about, and it burns most of the artifact budget.
-- `digest` holds a short prose summary written once at upload time; the prompt
-- prefers it and falls back to the raw text when it is absent (queue outage,
-- or an interview started before the job ran).
ALTER TABLE "InterviewPrerequisite" ADD COLUMN "digest" TEXT;
ALTER TABLE "InterviewPrerequisite" ADD COLUMN "digestedAt" TIMESTAMP(3);
