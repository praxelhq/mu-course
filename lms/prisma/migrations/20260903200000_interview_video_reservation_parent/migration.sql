-- The interview_v2 migration added the `interview_video` purpose to the enum
-- but not to this CHECK constraint, which enumerates which purposes may hang
-- off an interview parent. Reserving the room video therefore failed with
-- 23514, agent-context returned 500, and the interviewer never joined the room.
--
-- Forward-only: drop and recreate with the video purpose allowed.

ALTER TABLE "GeneratedObjectReservation"
  DROP CONSTRAINT "GeneratedObjectReservation_purpose_parent_check";

ALTER TABLE "GeneratedObjectReservation"
  ADD CONSTRAINT "GeneratedObjectReservation_purpose_parent_check" CHECK (
    (
      purpose = ANY (ARRAY['gallery_screenshot'::"GeneratedObjectPurpose",
                           'publication_preview'::"GeneratedObjectPurpose"])
      AND "submissionId" IS NOT NULL
    )
    OR (
      purpose = ANY (ARRAY['interview_recording'::"GeneratedObjectPurpose",
                           'interview_video'::"GeneratedObjectPurpose",
                           'interview_turn_audio'::"GeneratedObjectPurpose"])
      AND "interviewId" IS NOT NULL
    )
  );
