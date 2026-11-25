import { appendFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import type OpenAI from "openai";
import { findRepoRoot } from "./paths.js";

function timestamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function secondsSince(start: number): number {
  return Math.round(performance.now() - start) / 1000;
}

export class Tracer {
  readonly file: string;

  constructor(file?: string) {
    if (file) {
      this.file = file;
    } else {
      const dir = path.join(findRepoRoot(), "runs");
      mkdirSync(dir, { recursive: true });
      this.file = path.join(dir, `${timestamp()}.jsonl`);
    }
  }

  /** Append one JSON record as a single line. */
  log(type: string, data: Record<string, unknown> = {}): void {
    const record = { ts: new Date().toISOString(), type, ...data };
    appendFileSync(this.file, JSON.stringify(record) + "\n", "utf8");
  }

  /** Call client.responses.create(...) and log the request and the result. */
  async createResponse(
    client: OpenAI,
    params: OpenAI.Responses.ResponseCreateParamsNonStreaming,
  ): Promise<OpenAI.Responses.Response> {
    this.log("request", { request: params });
    const start = performance.now();
    try {
      const response = await client.responses.create(params);
      this.log("response", { seconds: secondsSince(start), response });
      return response;
    } catch (err) {
      const e = err as Error;
      this.log("error", { error_type: e.name, message: e.message, seconds: secondsSince(start) });
      throw err; // log it, but don't hide it
    }
  }
}
