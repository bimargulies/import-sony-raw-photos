import { promises as fs } from "node:fs";
import path from "node:path";

function isAlive(pid: number): boolean {
	try {
		process.kill(pid, 0);
		return true;
	} catch (err) {
		return (err as NodeJS.ErrnoException).code === "EPERM";
	}
}

/**
 * Take an exclusive lock so only one import runs at a time (the counter and
 * the source folder are shared). A lock left by a dead process is reclaimed.
 * Returns a function that releases the lock.
 */
export async function acquireLock(file: string): Promise<() => Promise<void>> {
	await fs.mkdir(path.dirname(file), { recursive: true });
	for (let attempt = 0; attempt < 2; attempt++) {
		try {
			const fh = await fs.open(file, "wx");
			await fh.writeFile(String(process.pid));
			await fh.close();
			return async () => {
				try {
					if ((await fs.readFile(file, "utf8")).trim() === String(process.pid)) await fs.rm(file);
				} catch {
					/* already gone */
				}
			};
		} catch (err) {
			if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;
			const pid = Number.parseInt(await fs.readFile(file, "utf8").catch(() => ""), 10);
			if (!Number.isInteger(pid)) throw new Error(`lock file ${file} is unreadable; remove it if no import is running`);
			if (isAlive(pid)) throw new Error(`another import is already running (pid ${pid})`);
			await fs.rm(file, { force: true }); // stale
		}
	}
	throw new Error(`could not acquire lock ${file}`);
}
