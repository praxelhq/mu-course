// Camera preflight for the interview room. The camera is required to START —
// every interview must leave a recording — but losing it mid-call must not end
// the conversation or burn the student's single attempt.
//
// The classification lives here, apart from the component, so the remediation
// a student is shown for each failure is testable without a browser.

export const VIDEO_LOST_FLAG = "video-lost";

export type CameraFailure =
  | "permission-denied"
  | "no-device"
  | "device-busy"
  | "insecure-context"
  | "unsupported"
  | "unknown";

/**
 * Map a getUserMedia rejection onto a cause. Browsers disagree on the exact
 * name, so this keys on the documented DOMException names and falls back
 * rather than guessing.
 */
export function classifyCameraError(error: unknown): CameraFailure {
  const name =
    typeof error === "object" && error !== null && "name" in error
      ? String((error as { name: unknown }).name)
      : "";
  switch (name) {
    case "NotAllowedError":
    case "SecurityError":
      return "permission-denied";
    case "NotFoundError":
    case "OverconstrainedError":
      return "no-device";
    case "NotReadableError":
    case "AbortError":
      return "device-busy";
    case "TypeError":
      // getUserMedia is undefined outside a secure context.
      return "insecure-context";
    default:
      return name ? "unknown" : "unsupported";
  }
}

/**
 * What the student should actually do about it. Each message names the cause
 * and one concrete next step — "camera failed" helps nobody mid-window.
 */
export function cameraRemediation(failure: CameraFailure): string {
  switch (failure) {
    case "permission-denied":
      return "Your browser is blocking camera access. Open the camera icon in the address bar, allow it for this site, then try again.";
    case "no-device":
      return "No camera was found. Plug one in or switch to a device with a camera, then try again.";
    case "device-busy":
      return "Your camera is in use by another app. Close Zoom, Meet, or any other video call, then try again.";
    case "insecure-context":
      return "Your browser will only share a camera over a secure connection. Open this page over https and try again.";
    case "unsupported":
      return "This browser cannot share a camera. Try the latest Chrome, Edge, or Safari.";
    default:
      return "The camera could not be started. Check that no other app is using it, then try again.";
  }
}

/**
 * The interview cannot begin without video. This is deliberately a hard stop:
 * a recording that does not exist cannot be reviewed later, and there is no
 * second attempt to fall back on.
 */
export const CAMERA_REQUIRED_NOTICE =
  "Your interview is recorded, so a working camera is required to begin.";

/**
 * Losing video mid-interview is NOT a hard stop. The conversation continues on
 * audio and the interview is flagged, so a device failure never costs the
 * student their attempt.
 */
export const VIDEO_LOST_NOTICE =
  "Your camera stopped, so the rest of this interview is audio only. Keep going — your answers are still being recorded and nothing is lost.";
