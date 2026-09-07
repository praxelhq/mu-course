import { NodeHttpHandler, type NodeHttpHandlerOptions } from "@smithy/node-http-handler";
import { describe, expect, it, vi } from "vitest";
import {
  S3_CONNECTION_TIMEOUT_MS,
  S3_MAX_ATTEMPTS,
  S3_SOCKET_TIMEOUT_MS,
  createS3ClientConfig,
} from "../lib/s3";

describe("S3 production client configuration", () => {
  it("pins bounded standard retries instead of inheriting mutable SDK defaults", () => {
    const handler = new NodeHttpHandler();
    const config = createS3ClientConfig("ap-south-1", () => handler);

    expect(config).toMatchObject({
      region: "ap-south-1",
      maxAttempts: S3_MAX_ATTEMPTS,
      retryMode: "standard",
      requestHandler: handler,
    });
    expect(S3_MAX_ATTEMPTS).toBe(3);
    handler.destroy();
  });

  it("passes explicit connection and idle-socket deadlines to NodeHttpHandler", () => {
    let captured: NodeHttpHandlerOptions | undefined;
    const handlerFactory = vi.fn((options: NodeHttpHandlerOptions) => {
      captured = options;
      return new NodeHttpHandler(options);
    });
    const config = createS3ClientConfig("ap-south-1", handlerFactory);

    expect(handlerFactory).toHaveBeenCalledOnce();
    expect(captured).toEqual({
      connectionTimeout: S3_CONNECTION_TIMEOUT_MS,
      socketTimeout: S3_SOCKET_TIMEOUT_MS,
    });
    expect(S3_CONNECTION_TIMEOUT_MS).toBe(5_000);
    expect(S3_SOCKET_TIMEOUT_MS).toBe(30_000);
    (config.requestHandler as NodeHttpHandler).destroy();
  });
});
