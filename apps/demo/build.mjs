import { cpSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));
const source = join(root, "src");
const publicDirectory = join(root, "public");
const output = join(root, "dist");

rmSync(output, { recursive: true, force: true });
mkdirSync(output, { recursive: true });

for (const file of readdirSync(source)) {
  if (file.endsWith(".js")) cpSync(join(source, file), join(output, file));
}

cpSync(publicDirectory, join(output, "static"), { recursive: true });
