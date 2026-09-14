// Typed failures for the Shipyard's data layer.
//
// Every route in `app/api/shipyard/**` answers with `{ error, ...extra }`, so a
// refusal is carried from the module that decided it to the wire without each
// route re-deciding the status code. `body` is the JSON verbatim: a cooldown
// refusal carries its own `nextAllowedResubmitAt` and `humanText` beside the
// message, because a form that is told "no" and not "until when" has to guess.

export type ShipyardErrorBody = { error: string } & Record<string, unknown>;

export class ShipyardError extends Error {
  readonly status: number;
  readonly body: ShipyardErrorBody;

  constructor(status: number, body: ShipyardErrorBody) {
    super(body.error);
    this.name = "ShipyardError";
    this.status = status;
    this.body = body;
  }
}

/** Map a typed Shipyard failure onto its JSON Response, or null if unknown. */
export function shipyardErrorResponse(err: unknown): Response | null {
  if (err instanceof ShipyardError) {
    return Response.json(err.body, { status: err.status });
  }
  return null;
}
