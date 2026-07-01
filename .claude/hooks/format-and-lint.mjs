#!/usr/bin/env node
// Hook PostToolUse (Write|Edit): formatea con Prettier y lintea con ESLint --fix
// el archivo recién creado/editado. No bloqueante: nunca rompe el flujo de Claude.

import { execFileSync } from "node:child_process";
import path from "node:path";

const PROJECT_DIR = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();

// Extensiones que Prettier debe formatear.
const PRETTIER_EXTS = new Set([
  ".tsx",
  ".jsx",
  ".ts",
  ".js",
  ".mjs",
  ".cjs",
  ".md",
  ".mdx",
]);
// Solo estos pasan también por ESLint (la config de Next no lintea Markdown).
const ESLINT_EXTS = new Set([".tsx", ".jsx", ".ts", ".js", ".mjs", ".cjs"]);
// Rutas que nunca tocamos.
const IGNORED = ["node_modules", ".next", "references", "out", "build"];

async function getPayload() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

function isNpxExec() {
  // En Windows el binario es npx.cmd; execFileSync necesita shell para .cmd.
  return process.platform === "win32";
}

function run(cmd, args, label, filePath) {
  try {
    execFileSync(cmd, args, {
      cwd: PROJECT_DIR,
      stdio: "ignore",
      shell: isNpxExec(),
    });
  } catch (err) {
    // No bloqueante: informamos por stderr pero salimos 0.
    process.stderr.write(
      `[format-and-lint] ${label} reportó problemas en ${filePath}\n`,
    );
  }
}

async function main() {
  const raw = await getPayload();
  if (!raw) process.exit(0);

  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    process.exit(0);
  }

  const filePath = data?.tool_input?.file_path;
  if (!filePath) process.exit(0);

  const normalized = filePath.replaceAll("\\", "/");
  if (IGNORED.some((seg) => normalized.includes(`/${seg}/`) || normalized.startsWith(`${seg}/`))) {
    process.exit(0);
  }

  const ext = path.extname(filePath).toLowerCase();
  if (!PRETTIER_EXTS.has(ext)) process.exit(0);

  run("npx", ["prettier", "--write", filePath], "Prettier", filePath);

  if (ESLINT_EXTS.has(ext)) {
    run("npx", ["eslint", "--fix", filePath], "ESLint", filePath);
  }

  process.exit(0);
}

main().catch(() => process.exit(0));
