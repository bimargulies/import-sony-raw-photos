#!/usr/bin/env node
// Installs the Adobe Bridge menu command by writing a startup script.
// Usage: node scripts/install-bridge-plugin.mjs [bridge-dir-name]   e.g. "Bridge 2026"
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cli = path.join(root, "dist", "index.js");
await fs.access(cli).catch(() => {
	console.error(`${cli} not found; run "pnpm build" first.`);
	process.exit(1);
});

const support = path.join(os.homedir(), "Library", "Application Support", "Adobe");
let bridge = process.argv[2];
if (!bridge) {
	const dirs = (await fs.readdir(support)).filter((d) => /^Bridge \d{4}$/.test(d)).sort();
	bridge = dirs.at(-1);
	if (!bridge) {
		console.error("No Bridge preferences folder found; pass its name as an argument.");
		process.exit(1);
	}
}

// Bridge launches commands with a bare PATH; make sure dnglab and exiftool are findable.
const toolPath = ["/opt/homebrew/bin", "/usr/local/bin", "/usr/bin", "/bin"].join(":");

const template = await fs.readFile(
	path.join(root, "bridge", "import-sony-raw-photos.jsx.template"),
	"utf8",
);
const script = template
	.replace("__NODE__", process.execPath)
	.replace("__CLI__", cli)
	.replace("__DEST__", path.join(os.homedir(), "Bridge", "New"))
	.replace("__PATH__", toolPath);

const dir = path.join(support, bridge, "Startup Scripts");
await fs.mkdir(dir, { recursive: true });
const out = path.join(dir, "import-sony-raw-photos.jsx");
await fs.writeFile(out, script);
console.log(`Installed ${out}\nRestart ${bridge} and look under Tools.`);
