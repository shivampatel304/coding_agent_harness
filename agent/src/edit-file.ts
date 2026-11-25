import { existsSync, readFile, readFileSync, writeFileSync, writeSync } from "node:fs";

export function editFile(args: {path: string; old_string: string; new_string: string}): string {
    const {path, old_string, new_string} = args;

    if(!existsSync(path)){
        throw new Error(`file not found: ${path}. Use list_files to check the path.`);
    }

    if(old_string === ""){
        throw new Error(`Old string is empty. Provide the exact text to repalce.`);
    }

    const content = readFileSync(path, "utf8");
    const count = content.split(old_string).length - 1;

    if(count === 0){
        throw new Error(`old_string was not found in ${path}. Read the file again and copy the exact text, including spaces and line breaks.`);
    }

    if(count > 1){
        throw new Error(`old_string appears ${count} times in ${path}. Include more surrounding lines so it matches exactly once.`);
    }

    const at = content.indexOf(old_string);
    const updated = content.slice(0,at) + new_string + content.slice(at + old_string.length);
    writeFileSync(path, updated, "utf8");
    return `edited ${path}: replaced 1 occurence`;
}