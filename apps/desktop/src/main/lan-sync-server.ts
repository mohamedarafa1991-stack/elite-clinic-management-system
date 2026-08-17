import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import type { SessionFrame } from "@elite/contracts";
import { LanSyncFrameRouter } from "@elite/auth";

const MAX_FRAME_BYTES = 1_048_576;

export class LanSyncHttpServer {
  private server: Server | undefined;

  public constructor(
    private readonly router: LanSyncFrameRouter,
    private readonly bindAddress = process.env["ELITE_SYNC_BIND_ADDRESS"] ??
      "0.0.0.0",
    private readonly port = Number(process.env["ELITE_SYNC_PORT"] ?? 8787),
  ) {}

  public start(): Promise<void> {
    if (this.server) return Promise.resolve();
    this.server = createServer((request, response) => {
      void this.handle(request, response);
    });
    return new Promise((resolve, reject) => {
      const server = this.server!;
      const onError = (error: Error) => {
        server.off("listening", onListening);
        reject(error);
      };
      const onListening = () => {
        server.off("error", onError);
        resolve();
      };
      server.once("error", onError);
      server.once("listening", onListening);
      server.listen(this.port, this.bindAddress);
    });
  }

  public stop(): Promise<void> {
    const server = this.server;
    this.server = undefined;
    if (!server) return Promise.resolve();
    return new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }

  private async handle(
    request: IncomingMessage,
    response: ServerResponse,
  ): Promise<void> {
    if (request.method !== "POST" || request.url !== "/sync/lan") {
      response.writeHead(404).end();
      return;
    }
    try {
      const body = await readBody(request);
      const frame = JSON.parse(body) as SessionFrame;
      const result = this.router.route(frame);
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify(result));
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "LAN_SYNC_REQUEST_FAILED";
      const status =
        message.includes("SESSION_NOT_FOUND") ||
        message.includes("AUTHENTICATION") ||
        message.includes("SESSION_")
          ? 401
          : 400;
      response.writeHead(status, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ error: message }));
    }
  }
}

function readBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_FRAME_BYTES) {
        reject(
          new Error("ELITE_LAN_FRAME_TOO_LARGE: encrypted frame exceeds limit"),
        );
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    request.on("error", reject);
  });
}
