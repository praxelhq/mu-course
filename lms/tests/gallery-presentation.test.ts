import { describe, expect, it } from "vitest";
import { buildGalleryPresentationItems } from "../lib/gallery-presentation";
import {
  reconcilePresentationSelection,
  stepPresentationIndex,
} from "../lib/gallery-presentation-navigation";
import { selectLegacyGalleryImageKey } from "../lib/galleries";

const row = (overrides: Record<string, unknown> = {}) => ({
  id: "sub-1",
  userId: "user-1",
  ownerName: "Asha",
  status: "submitted",
  version: 1,
  attempt: 1,
  fields: { image: "private/asha.png", caption: "When the prompt finally works" },
  files: ["private/asha.png"],
  galleryItem: { caption: null },
  ...overrides,
});

describe("instructor image-gallery presentation", () => {
  it("projects only the latest published, gallery-backed images through the protected route", () => {
    const items = buildGalleryPresentationItems({
      assignmentTypeSlug: "meme",
      namesVisible: true,
      rows: [
        row(),
        row({ id: "sub-2", userId: "user-2", ownerName: "Bela", galleryItem: null }),
        row({ id: "sub-3", userId: "user-3", ownerName: "Chen", status: "draft" }),
        row({ id: "sub-4", userId: "user-4", ownerName: "Dev", fields: {}, files: [] }),
        row({ id: "sub-old", version: 1 }),
        row({ id: "sub-new", version: 2, fields: { image: "private/new.png" } }),
      ],
    });

    expect(items).toEqual([
      {
        submissionId: "sub-new",
        imageUrl: "/api/gallery/image/sub-new",
        ownerName: "Asha",
        caption: null,
      },
    ]);
    expect(JSON.stringify(items)).not.toContain("private/");
  });

  it("keeps authors anonymous until reveal and shows only a short meme caption", () => {
    const [item] = buildGalleryPresentationItems({
      assignmentTypeSlug: "ai-image",
      namesVisible: false,
      rows: [
        row({
          fields: {
            image: "private/scene.png",
            caption: "  Small caption  ",
            scenePrompt: "Private long-form prompt that should not be projected",
          },
        }),
      ],
    });

    expect(item).toMatchObject({ ownerName: "Anonymous", caption: "Small caption" });
    expect(JSON.stringify(item)).not.toContain("Private long-form prompt");
  });

  it("accepts the same files fallback as the protected image route", () => {
    const fallbackRow = row({ fields: {}, files: ["private/files-fallback.png"] });

    expect(
      selectLegacyGalleryImageKey({
        assignmentTypeSlug: "meme",
        fields: fallbackRow.fields,
        files: fallbackRow.files,
        screenshotS3Key: null,
      }),
    ).toBe("private/files-fallback.png");
    expect(
      buildGalleryPresentationItems({
        assignmentTypeSlug: "meme",
        namesVisible: true,
        rows: [fallbackRow],
      }),
    ).toHaveLength(1);
  });

  it("prefers the committed S3 file over a new-upload reservation id", () => {
    const committedKey =
      "submissions/individual/user/asg_s2_meme/legacy/v1/attempt-1/image/reservation/meme.png";

    expect(
      selectLegacyGalleryImageKey({
        assignmentTypeSlug: "meme",
        fields: { image: "cms8else8002oqi01c5thsx4u" },
        files: [committedKey],
        screenshotS3Key: null,
      }),
    ).toBe(committedKey);
  });

  it("does not reinterpret another gallery artifact as a Session 2 image", () => {
    expect(
      buildGalleryPresentationItems({
        assignmentTypeSlug: "app",
        namesVisible: true,
        rows: [row()],
      }),
    ).toEqual([]);
  });

  it("wraps previous and next navigation safely", () => {
    expect(stepPresentationIndex(0, -1, 4)).toBe(3);
    expect(stepPresentationIndex(3, 1, 4)).toBe(0);
    expect(stepPresentationIndex(1, 1, 4)).toBe(2);
    expect(stepPresentationIndex(99, 1, 0)).toBe(0);
  });

  it("keeps the selected submission through reorder and insertion refreshes", () => {
    expect(
      reconcilePresentationSelection("sub-2", ["sub-1", "sub-2", "sub-3"], [
        "sub-3",
        "sub-1",
        "sub-2",
      ]),
    ).toEqual({ submissionId: "sub-2", index: 2 });
    expect(
      reconcilePresentationSelection("sub-2", ["sub-1", "sub-2", "sub-3"], [
        "sub-new",
        "sub-1",
        "sub-2",
        "sub-3",
      ]),
    ).toEqual({ submissionId: "sub-2", index: 2 });
  });

  it("selects the nearest survivor when the selected submission disappears", () => {
    expect(
      reconcilePresentationSelection("sub-2", ["sub-1", "sub-2", "sub-3"], [
        "sub-3",
        "sub-1",
      ]),
    ).toEqual({ submissionId: "sub-3", index: 0 });
    expect(
      reconcilePresentationSelection("sub-3", ["sub-1", "sub-2", "sub-3"], ["sub-1"]),
    ).toEqual({ submissionId: "sub-1", index: 0 });
  });

  it("uses deterministic first and empty-list fallbacks", () => {
    expect(reconcilePresentationSelection("missing", [], ["sub-4", "sub-5"])).toEqual({
      submissionId: "sub-4",
      index: 0,
    });
    expect(reconcilePresentationSelection("sub-1", ["sub-1"], [])).toEqual({
      submissionId: null,
      index: -1,
    });
  });
});
