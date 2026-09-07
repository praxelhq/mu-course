-- Rooms gain a pacing mode, and players report where they actually are.
--
-- "guided" keeps the facilitator's phase as a ceiling students move freely
-- below; "open" removes the ceiling entirely. Either way the pitches, the
-- ballot and the close still pull the room together, because those are the
-- only stages that stop working when people are on different screens.
ALTER TABLE "Room" ADD COLUMN "pacing" TEXT NOT NULL DEFAULT 'guided';
ALTER TABLE "Player" ADD COLUMN "stage" TEXT NOT NULL DEFAULT 'offer';
