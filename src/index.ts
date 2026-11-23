#!/usr/bin/env node
import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Command } from "commander";
import { Counter, DEFAULT_COUNTER_FILE } from "./counter.js";
import { Importer } from "./importer.js";
import { acquireLock } from "./lock.js";
import { watchLoop } from "./watch.js";
import {
	clearWatchState,
	startWatcher,
	stopWatcher,
	watchStatus,
	writeWatchState,
	type WatchPaths,
} from "./watch-control.js";

// package.json is the single source of truth for the version (dist/ and src/ both sit beside it).
const { version } = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { version: string };

const stamp = () => new Date().toTimeString().slice(0, 8);

/** Non-blocking macOS alert so a background watcher can get the user's attention. */
function popup(msg: string): void {
	const text = `${msg}`.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
	execFile("osascript", ["-e", `display alert "Import Sony RAW Photos" message "${text}" as warning`], () => {});
}

const program = new Command();

program
	.name("import-sony-raw-photos")
	.description(
		"Convert ARW files delivered by Imaging Edge into DNGs under <dest>/YYYY-MM-DD/YYYY-MM-DD-NNNN.dng (NNNN is a persistent counter), then delete the originals.",
	)
	.version(version)
	.option("-s, --source <dir>", "folder Imaging Edge delivers into", "/Volumes/Photos/Bridge/Capture")
	.option("-d, --dest <dir>", "import destination", path.join(os.homedir(), "Bridge", "New"))
	.option("-n, --dry-run", "show what would happen without converting or deleting")
	.option("--keep-originals", "don't delete the ARW files after a successful import")
	.option("--counter-file <file>", "file persisting the last sequence number used", DEFAULT_COUNTER_FILE)
	.option("--min-age <seconds>", "skip files modified more recently than this", "10")
	.option("--sidecar-prefix <prefix>", "files named with this prefix wait for a sidecar .xmp before importing ('' = never wait)", "CAP-")
	.option("--sidecar-wait <minutes>", "how long to wait for a sidecar before importing the photo without one", "30")
	.option("-w, --watch", "keep running and import new files as they arrive (Ctrl-C to stop)")
	.option("--interval <seconds>", "watch: how often to scan the source folder", "5")
	.option("--settle <seconds>", "watch: a file must be unchanged (size and mtime) this long before import", "10")
	.option("--watch-start", "start the background watcher with default settings")
	.option("--watch-stop", "stop the background watcher after its current import")
	.option("--watch-restart", "stop the background watcher, then start it again")
	.option("--watch-status", "show whether the watcher is running and whether a stack is open")
	.action(async (opts) => {
		const configDir = path.dirname(opts.counterFile);
		const watchPaths: WatchPaths = {
			cli: fileURLToPath(import.meta.url),
			lockFile: path.join(configDir, "lock"),
			stateFile: path.join(configDir, "watch-state.json"),
			logFile: path.join(os.homedir(), "Library", "Logs", "import-sony-raw-photos", "watch.log"),
		};
		const controls = [opts.watchStart, opts.watchStop, opts.watchRestart, opts.watchStatus].filter(Boolean).length;
		if (controls > 1 || (controls === 1 && opts.watch)) {
			program.error("use only one of --watch, --watch-start, --watch-stop, --watch-restart, --watch-status");
		}
		if (controls === 1) {
			try {
				if (opts.watchStatus) console.log(await watchStatus(watchPaths));
				if (opts.watchStart) console.log(await startWatcher(watchPaths));
				if (opts.watchStop) console.log(await stopWatcher(watchPaths));
				if (opts.watchRestart) {
					console.log(await stopWatcher(watchPaths));
					console.log(await startWatcher(watchPaths));
				}
			} catch (err) {
				program.error(`error: ${(err as Error).message}`);
			}
			return;
		}
		if (opts.watch && opts.dryRun) {
			program.error("--watch can't be combined with --dry-run (originals aren't removed, so files would repeat)");
		}
		const release = await acquireLock(watchPaths.lockFile).catch((err: Error) =>
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
				sidecarPrefix: opts.sidecarPrefix,
				sidecarWaitMs: Number(opts.sidecarWait) * 60_000,
				verbose: watching,
				log,
				warn: watching ? popup : undefined,
				onStackState: watching
					? (s) => {
							try {
								writeWatchState(watchPaths.stateFile, { pid: process.pid, version, ...s });
							} catch (err) {
								log(`could not record watcher state: ${(err as Error).message}`);
							}
						}
					: undefined,
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
					`v${version} watching ${opts.source} every ${opts.interval}s; files import after ${opts.settle}s unchanged; next number ${(await new Counter(opts.counterFile).last()) + 1}`,
				);
				writeWatchState(watchPaths.stateFile, { pid: process.pid, version, ...importer.stackState() });
				try {
					await watchLoop(importer, { intervalMs: Number(opts.interval) * 1000, log, signal: ac.signal });
				} finally {
					clearWatchState(watchPaths.stateFile);
				}
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
