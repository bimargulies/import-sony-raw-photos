#!/usr/bin/env node
import os from "node:os";
import path from "node:path";
import { Command } from "commander";
import { DEFAULT_COUNTER_FILE } from "./counter.js";
import { importPhotos } from "./importer.js";

const program = new Command();

program
	.name("import-sony-raw-photos")
	.description(
		"Convert ARW files delivered by Imaging Edge into DNGs under <dest>/YYYY-MM-DD/YYYY-MM-DD-NNNN.dng (NNNN is a persistent counter), then delete the originals.",
	)
	.version("0.1.0")
	.option("-s, --source <dir>", "folder Imaging Edge delivers into", "/Volumes/Photos/Bridge/Capture")
	.option("-d, --dest <dir>", "import destination", path.join(os.homedir(), "Bridge", "New"))
	.option("-n, --dry-run", "show what would happen without converting or deleting")
	.option("--keep-originals", "don't delete the ARW files after a successful import")
	.option("--counter-file <file>", "file persisting the last sequence number used", DEFAULT_COUNTER_FILE)
	.option("--min-age <seconds>", "skip files modified more recently than this", "10")
	.action(async (opts) => {
		const result = await importPhotos({
			source: opts.source,
			dest: opts.dest,
			dryRun: Boolean(opts.dryRun),
			keepOriginals: Boolean(opts.keepOriginals),
			counterFile: opts.counterFile,
			minAgeMs: Number(opts.minAge) * 1000,
		});
		console.log(
			`Done: ${result.imported} imported, ${result.skipped} skipped, ${result.failed} failed.`,
		);
		if (result.failed > 0) process.exitCode = 1;
	});

await program.parseAsync();
