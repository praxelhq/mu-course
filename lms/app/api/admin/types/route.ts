import { z } from "zod";
import { withAuth } from "@/lib/auth";
import {
  AssignmentTypeError,
  createAssignmentType,
  listAssignmentTypes,
  updateAssignmentType,
} from "@/lib/assignment-types";

// Admin assignment-type editor API. All validation (zod, slug
// uniqueness, schema/rubric shape) lives in lib/assignment-types so tests
// prove the SAME code path the editor uses. Artifact kinds are rows, not
// code: a new type here is a working submit form with zero code changes.

export const dynamic = "force-dynamic";

function mapError(err: unknown): Response | null {
  if (err instanceof AssignmentTypeError) {
    return Response.json({ error: err.message }, { status: err.status });
  }
  return null;
}

export const GET = withAuth(
  async () => Response.json({ types: await listAssignmentTypes() }),
  { role: "admin" },
);

export const POST = withAuth(
  async (req, { user }) => {
    const body = await req.json().catch(() => null);
    if (!body) return Response.json({ error: "Invalid body" }, { status: 400 });
    try {
      const type = await createAssignmentType(body, user.userId);
      return Response.json({ type });
    } catch (err) {
      return mapError(err) ?? Promise.reject(err);
    }
  },
  { role: "admin" },
);

const patchSchema = z.object({ id: z.string().min(1) }).loose();

export const PATCH = withAuth(
  async (req, { user }) => {
    const body = await req.json().catch(() => null);
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) return Response.json({ error: "Invalid body" }, { status: 400 });
    const { id, ...input } = parsed.data;
    try {
      const type = await updateAssignmentType(id, input, user.userId);
      return Response.json({ type });
    } catch (err) {
      return mapError(err) ?? Promise.reject(err);
    }
  },
  { role: "admin" },
);
