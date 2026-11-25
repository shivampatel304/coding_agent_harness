import { existsSync } from "node:fs";
import path from "node:path";

/** Walk up from `start` until a folder containing .git is found. */
export function findRepoRoot(start: string = process.cwd()): string {
  let dir = path.resolve(start);
  while (true) {
    if (existsSync(path.join(dir, ".git"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return path.resolve(start); // reached the filesystem root
    dir = parent;
  }
}
