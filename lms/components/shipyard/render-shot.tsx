"use client";

import { useState } from "react";

// The screenshot the reviewer looked at for checkpoint 3, served through the
// presign redirect (staff may read any Shipyard key).
//
// It is a client island for one reason: a key can outlive its object — a seeded
// demo row, an expired bucket, storage not configured at all — and a broken
// image with alt text sitting in the middle of a student's file reads as a bug
// in the page rather than a fact about the object. On error it says which,
// and keeps the key visible so somebody can go and look.

export function RenderShot({ objectKey }: { objectKey: string }) {
  const [failed, setFailed] = useState(false);

  return (
    <figure className="sy-shot">
      {failed ? (
        <div className="sy-shot__missing">
          The render is not in storage. The review recorded this key, but the
          object behind it cannot be fetched from here.
        </div>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          className="sy-shot__img"
          src={`/api/shipyard/files/${objectKey}`}
          alt="The rendered product as the reviewer saw it"
          loading="lazy"
          onError={() => setFailed(true)}
        />
      )}
      <figcaption className="sy-shot__cap sy-mono">{objectKey}</figcaption>
    </figure>
  );
}
