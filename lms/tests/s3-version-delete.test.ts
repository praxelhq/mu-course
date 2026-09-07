import { afterEach, describe, expect, it, vi } from "vitest";
import {
  S3ObjectVersionMissingError,
  __setS3TestOverrides,
  deleteObjectVersion,
  listObjectVersionIds,
  putObject,
} from "../lib/s3";

afterEach(() => __setS3TestOverrides(null));

describe("exact-version S3 retention operations", () => {
  it("returns the immutable VersionId produced by a server-side PUT", async () => {
    __setS3TestOverrides({
      configured: true,
      write: async () => ({ versionId: "version-7", etag: '"etag-7"' }),
    });

    await expect(
      putObject("interviews/iv-1/q1.mp3", new Uint8Array([1, 2, 3]), "audio/mpeg"),
    ).resolves.toEqual({ versionId: "version-7", etag: "etag-7" });
  });

  it("fails closed when versioned storage does not return a VersionId", async () => {
    __setS3TestOverrides({
      configured: true,
      write: async () => ({ versionId: null, etag: '"etag-7"' }),
    });

    await expect(
      putObject("gallery/screenshots/sub-1.png", new Uint8Array([1]), "image/png"),
    ).rejects.toBeInstanceOf(S3ObjectVersionMissingError);
  });

  it("lists immutable versions for the exact key without accepting prefix siblings", async () => {
    const listVersions = vi.fn(async () => ["version-2", "version-1"]);
    __setS3TestOverrides({ configured: true, listVersions });

    await expect(listObjectVersionIds("submissions/u/reservation/file.json")).resolves.toEqual([
      "version-1",
      "version-2",
    ]);
    expect(listVersions).toHaveBeenCalledWith("submissions/u/reservation/file.json");
  });

  it("deletes and verifies one named version and returns only provider receipt metadata", async () => {
    const deleteVersion = vi.fn(async () => ({
      verified: true,
      providerReceipt: "request-id",
    }));
    __setS3TestOverrides({ configured: true, deleteVersion });

    await expect(
      deleteObjectVersion("submissions/u/reservation/file.json", "version-1"),
    ).resolves.toEqual({ verified: true, providerReceipt: "request-id" });
    expect(deleteVersion).toHaveBeenCalledWith(
      "submissions/u/reservation/file.json",
      "version-1",
    );
  });
});
