#!/usr/bin/env node
import os from "node:os";
import path from "node:path";
import { Command } from "commander";
import { Counter, DEFAULT_COUNTER_FILE } from "./counter.js";
import { Importer } from "./importer.js";
import { acquireLock } from "./lock.js";
import { watchLoop } from "./watch.js";

const stamp = () => new Date().toTimeString().slice(0, 8);

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
	.option("-w, --watch", "keep running and import new files as they arrive (Ctrl-C to stop)")
	.option("--interval <seconds>", "watch: how often to scan the source folder", "5")
	.option("--settle <seconds>", "watch: a file must be unchanged (size and mtime) this long before import", "10")
	.action(async (opts) => {
		if (opts.watch && opts.dryRun) {
			program.error("--watch can't be combined with --dry-run (originals aren't removed, so files would repeat)");
		}
		const release = await acquireLock(path.join(path.dirname(opts.counterFile), "lock")).catch((err: Error) =>
			program.error(`error: ${err.message}`),
		);
		try {
			const watching = Boolean(opts.watch);
			const log = watching ? (m: string) => console.log(`[${stamp()}] ${m}`) : console.log;
			const importer = new Importer({
				source: opts.source,
				dest: opts.dest,
				dryRun: Boolean(opts.dryRun),
				keepOriginals: Boolean(opts.keepOriginals),
				counterFile: opts.counterFile,
				minAgeMs: Number(opts.minAge) * 1000,
				settleMs: watching ? Number(opts.settle) * 1000 : 0,
				verbose: watching,
				log,
			});

			if (watching) {
				const ac = new AbortController();
				const stop = () => {
					if (ac.signal.aborted) process.exit(130);
					log("stopping after the current scan (Ctrl-C again to force)");
					ac.abort();
				};
				process.on("SIGINT", stop);
				process.on("SIGTERM", stop);
				log(
					`watching ${opts.source} every ${opts.interval}s; files import after ${opts.settle}s unchanged; next number ${(await new Counter(opts.counterFile).last()) + 1}`,
				);
				await watchLoop(importer, { intervalMs: Number(opts.interval) * 1000, log, signal: ac.signal });
				return;
			}

			const result = await importer.scan();
			console.log(`Done: ${result.imported} imported, ${result.skipped} skipped, ${result.failed} failed.`);
			if (result.failed > 0) process.exitCode = 1;
		} finally {
			await release();
		}
	});

await program.parseAsync();
