import OpenAI from "openai";
import { readFileSync, readdirSync } from "node:fs";
import { config } from "dotenv";
import { spawnSync } from "node:child_process";
import * as readline from "node:readline/promises";
import { editFile } from "./edit-file.js";

config({ path: "../.env" });

const apiKey = process.env.OPENAI_API_KEY;
const model = process.env.OPENAI_MODEL;

if (!apiKey || !model) {
  throw new Error("Set OPENAI_API_KEY and OPENAI_MODEL in ../..env");
}

const client = new OpenAI({ apiKey });

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

async function confirm(question: string): Promise<boolean> {
  const answer = await rl.question(`${question} [y/N] `);
  return answer.trim().toLowerCase() === "y";
}

const tools = [
  {
    type: "function" as const,
    name: "read_file",
    description: "Read a text file and return its contents.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "Path of the file to read" },
      },
      required: ["path"],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    type: "function" as const,
    name: "list_files",
    description:
      'List the files and folders in a directory. Folders end with a slash. Use "." for the current folder.',
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "Directory to list" },
      },
      required: ["path"],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    type: "function" as const,
    name: "run_command",
    description:
      "Run a shell command in the current folder and return its exit code and output.",
    parameters: {
      type: "object",
      properties: {
        command: { type: "string", description: "The shell command to run" },
      },
      required: ["command"],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    type: "function" as const,
    name: "edit_file",
    description:
      "Replace one exact piece of text in a file with new text. old_string must match the file exactly, including spaces and line breaks, and must appear exactly once. Read the file first so you can copy the text exactly.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "path of file to read" },
        old_string: {
          type: "string",
          description: "The exact existing text to replace.",
        },
        new_string: {
          type: "string",
          description: "The text to put in its place.",
        },
      },
      required: ["path", "old_string", "new_string"],
      additionalProperties: false,
    },
    strict: true,
  },
];

const run: Record<string, (args: any) => string | Promise<string>> = {
  read_file: (args) => readFileSync(args.path, "utf-8"),

  list_files: (args) =>
    readdirSync(args.path, { withFileTypes: true })
      .filter((e) => e.name !== "node_modules" && e.name !== ".git")
      .map((e) => (e.isDirectory() ? e.name + "/" : e.name))
      .join("\n"),

  run_command: async (args) => {
    console.log(`\n The agent wants to run: ${args.command}`);
    if (!(await confirm(" Allow?")))
      return "The user refused to run this command.";
    const r = spawnSync(args.command, {
      shell: true,
      encoding: "utf8",
      timeout: 30_000,
    });
    const output = `${r.stdout ?? ""} ${r.stderr ?? ""}`.slice(0, 10_000);
    return `exit code: ${r.status}\n${output}${r.error ? `\nerror: ${r.error.message}` : ""}`;
  },

  edit_file: async (args) => {
    console.log(`\n  The agent wants to edit: ${args.path}`);
    console.log("  --- old ---\n" + args.old_string);
    console.log("  --- new ---\n" + args.new_string);
    if (!(await confirm("  Apply this edit?")))
      return "The user refused this edit. The file was not changed.";
    return editFile(args);
  },
};

const input: any[] = [
  {
    role: "user",
    content: process.argv[2] ?? "What is the project name in package.json",
  },
];

const instructions = `You are a coding agent working in the user's project folder. You can list files, read files, edit files and run shell commands.

When asked to fix a bug:
1. Run the tests first to see the exact failure. If you are not told how, look for a test command in package.json or the project files.
2. Read the failing test and the code it tests before changing anything.
3. Work out the cause and state it in one sentence before editing.
4. Make the smallest edit that fixes the cause. Copy old_string exactly from the file you just read.
5. Run the same tests again.
6. If they still fail, read the new failure and try again. If a tool returns an error, read it and change your approach instead of repeating the same call.
7. Stop after 3 failed fix attempts and explain what you tried.

Rules:
- Never say the bug is fixed unless you ran the tests after your last edit and they passed.
- Fix the code, not the tests. Only change a test if it is clearly wrong, and say so explicitly.
- Do not read or print secrets files such as .env.
- Do not make changes the task did not ask for.

When you finish, reply in this format:
Cause: ...
Change: ...
Verification: (the test command you ran and its result)`;

try {
  for (let step = 1; step <= 10; step++) {
    console.log(`\n[call ${step}] sending ${input.length} items to the model`);
    const response = await client.responses.create({
      model,
      tools,
      input,
      instructions,
    });

    console.log("Output : ", response.output);

    input.push(...response.output);

    const calls: any[] = [];

    for (const item of response.output) {
      if (item.type === "function_call") calls.push(item);
    }

    if (calls.length === 0) {
      console.log("[done] ANSWER: ", response.output_text);
      break;
    }

    for (const call of calls) {
      console.log(
        `[call ${step}] model asks for: ${call.name} (${call.arguments})`,
      );
      let result: string;
      try {
        if (!run[call.name]) throw new Error(`unknown tool ${call.name}`);
        result = await run[call.name](JSON.parse(call.arguments));
      } catch (err) {
        result = `Error: ${(err as Error).message}`;
      }

      console.log(`[call ${step}] tool returned ${result.length} characters`);
      input.push({
        type: "function_call_output",
        call_id: call.call_id,
        output: result,
      });
    }
  }
} finally {
  rl.close();
}
