import { execFile, spawn } from "node:child_process";
import { closeSync, mkdirSync, openSync, promises as fs, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { promisify } from "node:util";

const run = promisify(execFile);

/** Bridge and other launchers can have a bare PATH; dnglab and exiftool must stay findable. */
const TOOL_PATH = ["/opt/homebrew/bin", "/usr/local/bin", "/usr/bin", "/bin"];

export interface WatchPaths {
	cli: string;
	lockFile: string;
	stateFile: string;
	logFile: string;
}

export interface StackStatus {
	/** "none", "pending" (opened, no photo yet), or the open stack's folder name. */
	stack: string;
	photos: number;
}

export interface WatchState extends StackStatus {
	pid: number;
	version: string;
}

/** Is this `ps` command line a watcher for this CLI? `--watch-status` and friends don't count. */
export function isWatchCommand(command: string, cli: string): boolean {
	return command.includes(cli) && /\s--watch(\s|$)/.test(command);
}

export function describeStack(s: StackStatus): string {
	if (s.stack === "none") return "no stack open";
	if (s.stack === "pending") return "a stack is open, waiting for its first photo";
	return `${s.stack} is open with ${s.photos} photo(s)`;
}

export function writeWatchState(file: string, state: WatchState): void {
	mkdirSync(path.dirname(file), { recursive: true });
	const tmp = `${file}.${process.pid}.tmp`;
	writeFileSync(tmp, `${JSON.stringify(state)}\n`);
	renameSync(tmp, file);
}

export function clearWatchState(file: string): void {
	rmSync(file, { force: true });
}

/** PID of the running watcher, or undefined. A one-off import holding the lock is not a watcher. */
export async function watcherPid(paths: WatchPaths): Promise<number | undefined> {
	const pid = Number.parseInt(await fs.readFile(paths.lockFile, "utf8").catch(() => ""), 10);
	if (!Number.isInteger(pid)) return undefined;
	try {
		const { stdout } = await run("ps", ["-p", String(pid), "-o", "command="]);
		return isWatchCommand(stdout.trim(), paths.cli) ? pid : undefined;
	} catch {
		return undefined; // ps exits non-zero when the process is gone
	}
}

async function readState(paths: WatchPaths, pid: number): Promise<WatchState | undefined> {
	try {
		const state = JSON.parse(await fs.readFile(paths.stateFile, "utf8")) as WatchState;
		return state.pid === pid ? state : undefined;
	} catch {
		return undefined;
	}
}

function describeRunning(pid: number, state: WatchState | undefined): string {
	return state
		? `watcher running (pid ${pid}, v${state.version}); ${describeStack(state)}`
		: `watcher running (pid ${pid}, version older than 0.8.0); stack state unknown`;
}

export async function watchStatus(paths: WatchPaths): Promise<string> {
	const pid = await watcherPid(paths);
	return pid ? describeRunning(pid, await readState(paths, pid)) : "watcher not running";
}

/** Ask the watcher to finish its current import and exit, and wait until it has. */
export async function stopWatcher(paths: WatchPaths, timeoutMs = 10 * 60_000): Promise<string> {
	const pid = await watcherPid(paths);
	if (!pid) return "watcher not running";
	const before = describeRunning(pid, await readState(paths, pid));
	process.kill(pid, "SIGINT");
	const deadline = Date.now() + timeoutMs;
	while ((await watcherPid(paths)) === pid) {
		if (Date.now() >= deadline) {
			throw new Error(`watcher (pid ${pid}) is still finishing after ${Math.round(timeoutMs / 1000)}s; it was not forced to stop`);
		}
		await sleep(250);
	}
	return `stopped; was: ${before}`;
}

export async function startWatcher(paths: WatchPaths, timeoutMs = 10_000): Promise<string> {
	const running = await watcherPid(paths);
	if (running) return `already running: ${describeRunning(running, await readState(paths, running))}`;

	await fs.mkdir(path.dirname(paths.logFile), { recursive: true });
	const fd = openSync(paths.logFile, "a");
	const child = spawn(process.execPath, [paths.cli, "--watch"], {
		detached: true,
		stdio: ["ignore", fd, fd],
		env: { ...process.env, PATH: [...TOOL_PATH, process.env.PATH].filter(Boolean).join(":") },
	});
	closeSync(fd);
	let exited = false;
	child.once("exit", () => {
		exited = true;
	});
	child.unref();

	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline && !exited) {
		if ((await watcherPid(paths)) === child.pid) {
			const state = await readState(paths, child.pid!);
			if (state) return `started: ${describeRunning(child.pid!, state)}`;
		}
		await sleep(100);
	}
	const tail = (await fs.readFile(paths.logFile, "utf8").catch(() => "")).trimEnd().split("\n").slice(-5).join("\n");
	throw new Error(`the watcher did not start. Log (${paths.logFile}):\n${tail}`);
}
