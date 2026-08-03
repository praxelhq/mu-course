CREATE TYPE "LicenseCreditStatus" AS ENUM ('available', 'redeemed', 'revoked');

DROP TABLE "Entitlement";

CREATE TABLE "LicensePurchase" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "licenseCount" INTEGER NOT NULL,
    "studentGrant" BOOLEAN NOT NULL DEFAULT false,
    "effectiveAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "LicensePurchase_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LicenseCredit" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "purchaseId" TEXT NOT NULL,
    "projectId" TEXT,
    "status" "LicenseCreditStatus" NOT NULL DEFAULT 'available',
    "redeemedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "LicenseCredit_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SalesInquiry" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "teamSize" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SalesInquiry_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LicensePurchase_externalId_key" ON "LicensePurchase"("externalId");
CREATE INDEX "LicensePurchase_userId_createdAt_idx" ON "LicensePurchase"("userId", "createdAt");
CREATE UNIQUE INDEX "LicenseCredit_projectId_key" ON "LicenseCredit"("projectId");
CREATE INDEX "LicenseCredit_userId_status_createdAt_idx" ON "LicenseCredit"("userId", "status", "createdAt");
CREATE INDEX "SalesInquiry_email_createdAt_idx" ON "SalesInquiry"("email", "createdAt");

ALTER TABLE "LicensePurchase" ADD CONSTRAINT "LicensePurchase_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LicenseCredit" ADD CONSTRAINT "LicenseCredit_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LicenseCredit" ADD CONSTRAINT "LicenseCredit_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "LicensePurchase"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LicenseCredit" ADD CONSTRAINT "LicenseCredit_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
