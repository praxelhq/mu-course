-- Public project reports are opt-in. Existing projects remain private.
ALTER TABLE "Project"
  ADD COLUMN "remixOrigin" TEXT,
  ADD COLUMN "publicId" TEXT,
  ADD COLUMN "isPublic" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "publishedAt" TIMESTAMP(3),
  ADD COLUMN "publishedVersion" INTEGER;

CREATE UNIQUE INDEX "Project_publicId_key" ON "Project"("publicId");

CREATE TABLE "ProductEvent" (
  "id" TEXT NOT NULL,
  "event" TEXT NOT NULL,
  "blueprintSlug" TEXT,
  "publicId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProductEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ProductEvent_event_createdAt_idx" ON "ProductEvent"("event", "createdAt");
CREATE INDEX "ProductEvent_blueprintSlug_createdAt_idx" ON "ProductEvent"("blueprintSlug", "createdAt");
CREATE INDEX "ProductEvent_publicId_createdAt_idx" ON "ProductEvent"("publicId", "createdAt");

CREATE TABLE "NewsletterSubscriber" (
  "id" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "consentedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "unsubscribedAt" TIMESTAMP(3),
  "reactivationRequestedAt" TIMESTAMP(3),
  "unsubscribeToken" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "NewsletterSubscriber_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "NewsletterSubscriber_email_key" ON "NewsletterSubscriber"("email");
CREATE UNIQUE INDEX "NewsletterSubscriber_unsubscribeToken_key" ON "NewsletterSubscriber"("unsubscribeToken");
CREATE INDEX "NewsletterSubscriber_active_createdAt_idx" ON "NewsletterSubscriber"("active", "createdAt");
