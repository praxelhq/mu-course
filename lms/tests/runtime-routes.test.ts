import { afterEach, describe, expect, it, vi } from "vitest";
import { GET as liveness } from "../app/api/health/route";
import { GET as readiness } from "../app/api/readiness/route";
import { POST as agentHeartbeat } from "../app/api/internal/service-heartbeat/route";

afterEach(() => vi.unstubAllEnvs());

describe("runtime probe routes", () => {
  it("keeps unauthenticated liveness shallow and configuration-free", async () => {
    const response = await liveness();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, service: "web" });
  });

  it("guards database-backed readiness before any probe runs", async () => {
    vi.stubEnv("READINESS_TOKEN", "release-proof-token");
    const response = await readiness(
      new Request("https://forge.test/api/readiness", {
        headers: { authorization: "Bearer wrong" },
      }),
    );
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ ok: false, code: "unauthorized" });
  });

  it("guards and bounds the agent heartbeat ingress before parsing identity", async () => {
    vi.stubEnv("AGENT_INTERNAL_TOKEN", "agent-token");
    const unauthorized = await agentHeartbeat(
      new Request("https://forge.test/api/internal/service-heartbeat", {
        method: "POST",
        headers: { "content-type": "application/json", "x-agent-token": "wrong" },
        body: "{}",
      }),
    );
    expect(unauthorized.status).toBe(401);

    const oversized = await agentHeartbeat(
      new Request("https://forge.test/api/internal/service-heartbeat", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "content-length": "5000",
          "x-agent-token": "agent-token",
        },
        body: "{}",
      }),
    );
    expect(oversized.status).toBe(413);
    expect(await oversized.json()).toEqual({ ok: false, code: "payload-too-large" });
  });
});
