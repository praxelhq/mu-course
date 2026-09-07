// Shared by the presenter and its real-browser regression fixture. CSS Grid
// items default to min-width:auto, so a long no-wrap thumbnail rail can widen
// the entire projector beyond the viewport unless every grid boundary may
// shrink to zero.
export const projectorLayoutStyles = {
  overlay: {
    minWidth: 0,
    maxWidth: "100vw",
    overflow: "hidden",
  },
  header: {
    minWidth: 0,
    maxWidth: "100%",
  },
  heading: {
    color: "var(--cream)",
  },
  stage: {
    minWidth: 0,
    maxWidth: "100%",
    overflow: "hidden",
  },
  figure: {
    minWidth: 0,
    maxWidth: "100%",
  },
  footer: {
    minWidth: 0,
    maxWidth: "100%",
    overflow: "hidden",
  },
  thumbnailRail: {
    minWidth: 0,
    width: "100%",
    maxWidth: "100%",
  },
} as const;
