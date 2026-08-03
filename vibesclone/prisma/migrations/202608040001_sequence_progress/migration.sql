-- Persist per-sequence Build Sequence completion. Additive only; rollback is a column drop.
ALTER TABLE "PromptSet" ADD COLUMN "completedOrders" INTEGER[] NOT NULL DEFAULT '{}';
