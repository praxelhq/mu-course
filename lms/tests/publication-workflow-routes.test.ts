import { describe, expect, it, vi } from "vitest";
import type { SessionUser } from "../lib/auth";

const student: SessionUser = {
  userId: "student-1",
  email: "student@example.edu",
  role: "student",
  sectionId: "section-a",
  teamId: "team-a",
};
const instructor: SessionUser = {
  userId: "instructor-1",
  email: "instructor@example.edu",
  role: "instructor",
  sectionId: null,
  teamId: null,
};

function request(body: unknown) {
  return new Request("http://test.local/api", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("publication and workflow action routes", () => {
  it("requires authentication and rejects client-supplied publication ownership", async () => {
    const mutate = vi.fn();
    const { createPublicationConsentHandler } = await import(
      "../app/api/publication/consent/route"
    );
    const unauthenticated = createPublicationConsentHandler({
      getUser: async () => null,
      mutate,
    });
    expect(
      (await unauthenticated(request({ submissionId: "sub-1", consent: true }))).status,
    ).toBe(401);

    const handler = createPublicationConsentHandler({ getUser: async () => student, mutate });
    expect(
      (
        await handler(
          request({ submissionId: "sub-1", consent: true, ownerId: "student-9" }),
        )
      ).status,
    ).toBe(400);
    expect(mutate).not.toHaveBeenCalled();
  });

  it("keeps instructor curation role-gated and rejects a client fingerprint", async () => {
    const decide = vi.fn();
    const { createInstructorPublicationHandler } = await import(
      "../app/api/instructor/publication/route"
    );
    const studentHandler = createInstructorPublicationHandler({
      getUser: async () => student,
      decide,
    });
    expect(
      (
        await studentHandler(
          request({ submissionId: "sub-1", state: "approved", reason: "Looks safe." }),
        )
      ).status,
    ).toBe(403);

    const instructorHandler = createInstructorPublicationHandler({
      getUser: async () => instructor,
      decide,
    });
    expect(
      (
        await instructorHandler(
          request({
            submissionId: "sub-1",
            state: "approved",
            reason: "Looks safe.",
            reviewedFingerprint: "sha256:client-controlled",
          }),
        )
      ).status,
    ).toBe(400);
    expect(decide).not.toHaveBeenCalled();
  });

  it("derives nomination team from the authenticated student", async () => {
    const nominate = vi.fn().mockResolvedValue({ nomination: { id: "nom-1" } });
    const { createWorkflowNominationHandler } = await import(
      "../app/api/workflows/nominate/route"
    );
    const handler = createWorkflowNominationHandler({ getUser: async () => student, nominate });
    const response = await handler(
      request({
        assignmentId: "assignment-5",
        submissionId: "sub-final",
        reason: "Best verified run.",
      }),
    );
    expect(response.status).toBe(200);
    expect(nominate).toHaveBeenCalledWith(
      expect.objectContaining({ actor: { userId: "student-1", teamId: "team-a" } }),
    );
  });

  it("allows only staff to create the authoritative team selection", async () => {
    const select = vi.fn().mockResolvedValue({ selection: { id: "selection-1" } });
    const { createInstructorWorkflowSelectionHandler } = await import(
      "../app/api/instructor/workflows/select/route"
    );
    const studentHandler = createInstructorWorkflowSelectionHandler({
      getUser: async () => student,
      select,
    });
    const body = {
      teamId: "team-a",
      assignmentId: "assignment-5",
      submissionId: "sub-final",
      reason: "Verified run.",
    };
    expect((await studentHandler(request(body))).status).toBe(403);
    expect(select).not.toHaveBeenCalled();

    const instructorHandler = createInstructorWorkflowSelectionHandler({
      getUser: async () => instructor,
      select,
    });
    expect((await instructorHandler(request(body))).status).toBe(200);
    expect(select).toHaveBeenCalledWith(
      expect.objectContaining({ actor: { userId: "instructor-1", role: "instructor" } }),
    );
  });
});
