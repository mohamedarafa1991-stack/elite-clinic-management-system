import {
  createServer as createHttpServer,
  type IncomingMessage,
  type Server as HttpServer,
  type ServerResponse,
} from "node:http";
import {
  createServer as createHttpsServer,
  type Server as HttpsServer,
} from "node:https";
import { readFileSync } from "node:fs";
import type { SessionFrame, SessionInitRequest } from "@elite/contracts";
import { LanSessionService, LanSyncFrameRouter } from "@elite/auth";

const MAX_FRAME_BYTES = 1_048_576;

type LanServer = HttpServer | HttpsServer;

export class LanSyncHttpServer {
  private server: LanServer | undefined;

  public constructor(
    private readonly router: LanSyncFrameRouter,
    private readonly sessionService?: LanSessionService,
    private readonly bindAddress = process.env["ELITE_SYNC_BIND_ADDRESS"] ??
      "0.0.0.0",
    private readonly port = Number(process.env["ELITE_SYNC_PORT"] ?? 8787),
  ) {}

  public start(): Promise<void> {
    if (this.server) return Promise.resolve();
    const handler = (request: IncomingMessage, response: ServerResponse) => {
      void this.handle(request, response);
    };
    const certificatePath = process.env["ELITE_SYNC_TLS_CERT_PATH"];
    const privateKeyPath = process.env["ELITE_SYNC_TLS_KEY_PATH"];
    const requireTls = process.env["ELITE_SYNC_TLS_REQUIRED"] === "true";
    if (Boolean(certificatePath) !== Boolean(privateKeyPath)) {
      return Promise.reject(
        new Error("ELITE_LAN_TLS_CERTIFICATE_CONFIGURATION_INCOMPLETE"),
      );
    }
    if (certificatePath && privateKeyPath) {
      try {
        this.server = createHttpsServer(
          {
            cert: readFileSync(certificatePath),
            key: readFileSync(privateKeyPath),
          },
          handler,
        );
      } catch (error) {
        return Promise.reject(error);
      }
    } else {
      if (requireTls)
        return Promise.reject(new Error("ELITE_LAN_TLS_REQUIRED"));
      this.server = createHttpServer(handler);
    }
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
    if (request.method !== "POST") {
      response.writeHead(404).end();
      return;
    }
    try {
      const body = await readBody(request);
      if (request.url === "/sync/session-init") {
        if (!this.sessionService) {
          response.writeHead(503).end();
          return;
        }
        const sessionInit = JSON.parse(body) as SessionInitRequest;
        const established = this.sessionService.establishAndRegister(
          this.router,
          sessionInit,
        );
        writeJson(response, 200, established.grant);
        return;
      }
      if (request.url !== "/sync/lan") {
        response.writeHead(404).end();
        return;
      }
      const frame = JSON.parse(body) as SessionFrame;
      const result = this.router.route(frame);
      writeJson(response, 200, result);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "LAN_SYNC_REQUEST_FAILED";
      const status =
        message.includes("SESSION_NOT_FOUND") ||
        message.includes("AUTHENTICATION") ||
        message.includes("SESSION_") ||
        message.includes("SIGNATURE") ||
        message.includes("ENROLLMENT")
          ? 401
          : 400;
      writeJson(response, status, { error: message });
    }
  }
}

function writeJson(
  response: ServerResponse,
  status: number,
  value: unknown,
): void {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(value));
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
