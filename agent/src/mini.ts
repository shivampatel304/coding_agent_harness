import OpenAI from "openai";
import { readFileSync, readdirSync } from "node:fs";
import { config } from "dotenv";

config({ path: "../.env" });

const apiKey = process.env.OPENAI_API_KEY;
const model = process.env.OPENAI_MODEL;

if(!apiKey || !model){
    throw new Error("Set OPENAI_API_KEY and OPENAI_MODEL in ../..env");
}

const client = new OpenAI({apiKey});

const tools = [
    {
        type: "function" as const,
        name: "read_file",
        description: "Read a text file and return its contents.",
        parameters: {
            type: "object",
            properties: { path: { type: "string", description: "Path of the file to read"}},
            required: ["path"],
            additionalProperties: false,
        },
        strict: true,
    },
    {
        type: "function" as const,
        name: "list_files",
        description: 'List the files and folders in a directory. Folders end with a slash. Use "." for the current folder.',
        parameters: {
            type: "object",
            properties: { path: {type: "string", description: "Directory to list"}},
            required: ["path"],
            additionalProperties: false,
        },
        strict: true,
    },
    
];

const run: Record<string, (args: any) => string> = {
    read_file: (args) => readFileSync(args.path, "utf-8"),
    list_files: (args) => readdirSync(args.path, { withFileTypes: true})
    .filter((e) => e.name !== "node_modules" && e.name !== ".git")
    .map((e) => (e.isDirectory() ? e.name + "/" : e.name))
    .join("\n"),
};

const input: any[] = [
    {role: "user", content: process.argv[2] ?? "What is the project name in package.json"}
]

for(let step=1; step<=10; step++){
    console.log(`\n[call ${step}] sending ${input.length} items to the model`);
    const response = await client.responses.create({
        model,
        tools,
        input,
        instructions: "You are a coding agent. Look at files with your tools before answering."
    });

    console.log("Output : " , response.output);

    input.push(...response.output);

    const calls: any[] = [];

    for(const item of response.output){
        if(item.type === "function_call")   calls.push(item);
    }

    if(calls.length === 0){
        console.log("[done] ANSWER: ", response.output_text);
        break;
    }

    for(const call of calls){
        console.log(`[call ${step}] model asks for: ${call.name} (${call.arguments})`);
        let result: string;
        try{
            if (!run[call.name]) throw new Error(`unknown tool ${call.name}`);
            result = run[call.name](JSON.parse(call.arguments));
        }catch (err){
            result = `Error: ${(err as Error).message}`;
        }

        console.log(`[call ${step}] tool returned ${result.length} characters`);
        input.push({type: "function_call_output", call_id: call.call_id, output: result})
    }
}
