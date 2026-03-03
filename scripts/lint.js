const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const TARGET_DIRS = ["src", "test", "scripts"];
const IGNORE_DIRS = new Set(["node_modules", ".git", "reports"]);
const FILES = [];

function walk(dirPath) {
  let entries;
  try {
    entries = fs.readdirSync(dirPath, { withFileTypes: true });
  } catch (error) {
    process.stderr.write(`Cannot read directory: ${dirPath}\n`);
    process.exitCode = 1;
    return;
  }

  for (const entry of entries) {
    const absPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      if (IGNORE_DIRS.has(entry.name)) {
        continue;
      }
      walk(absPath);
      continue;
    }
    if (entry.isFile() && path.extname(entry.name).toLowerCase() === ".js") {
      FILES.push(absPath);
    }
  }
}

for (const dirName of TARGET_DIRS) {
  const absDir = path.join(ROOT, dirName);
  if (fs.existsSync(absDir)) {
    walk(absDir);
  }
}

let failed = false;
for (const filePath of FILES) {
  const result = spawnSync(process.execPath, ["--check", filePath], { encoding: "utf8" });
  if (result.status !== 0) {
    failed = true;
    process.stderr.write(`Syntax check failed: ${path.relative(ROOT, filePath)}\n`);
    if (result.stderr) {
      process.stderr.write(result.stderr);
    }
  }
}

if (failed) {
  process.exitCode = 1;
} else {
  process.stdout.write(`Lint passed (${FILES.length} files checked).\n`);
}
