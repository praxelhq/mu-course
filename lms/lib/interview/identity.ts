/**
 * The identity the Python worker accepts interview jobs under
 * (`req.accept(identity=...)` in agent/main.py).
 *
 * Its own module because both sides need it and they cannot share the other's:
 * `lib/interview/realtime.ts` reaches for node:crypto, so a client component
 * importing the constant from there would drag it into the browser bundle.
 */
export const AGENT_IDENTITY = "forge-interviewer";
