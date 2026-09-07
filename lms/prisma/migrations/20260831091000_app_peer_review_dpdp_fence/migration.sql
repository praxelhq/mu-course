-- Join the existing global DPDP barrier before acquiring learner row locks.
-- Cascade deletion of User -> entry/review removes all new personal evidence.
CREATE TRIGGER "barrier_AppReviewEntry_dpdp"
BEFORE INSERT OR UPDATE OR DELETE ON "AppReviewEntry"
FOR EACH STATEMENT EXECUTE FUNCTION "acquire_dpdp_write_barrier"();
CREATE TRIGGER "barrier_AppReview_dpdp"
BEFORE INSERT OR UPDATE OR DELETE ON "AppReview"
FOR EACH STATEMENT EXECUTE FUNCTION "acquire_dpdp_write_barrier"();
