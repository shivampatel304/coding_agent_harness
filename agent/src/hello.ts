import path from "node:path";
import { config } from "dotenv";
import OpenAI from "openai";
import { findRepoRoot } from "./paths.js";
import { Tracer } from "./trace.js";

config({ path: path.join(findRepoRoot(), ".env") });

const model = process.env.OPENAI_MODEL;
if (!model || !process.env.OPENAI_API_KEY) {
  console.error("Set OPENAI_API_KEY and OPENAI_MODEL in .env");
  process.exit(1);
}

const client = new OpenAI();
const tracer = new Tracer();

const response = await tracer.createResponse(client, {
  model,
  input: "Write a beautiful motivation line.",
});

console.log("Reply:", response.output_text);
const u = response.usage;
console.log(`Tokens: input=${u?.input_tokens} output=${u?.output_tokens} total=${u?.total_tokens}`);
console.log("Trace:", tracer.file);
