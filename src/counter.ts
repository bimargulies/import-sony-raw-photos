import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

export const DEFAULT_COUNTER_FILE = path.join(
	os.homedir(),
	".config",
	"import-sony-raw-photos",
	"counter",
);

/** Persistent, monotonically increasing sequence number stored in a small text file. */
export class Counter {
	constructor(private readonly file: string) {}

	/** The last number handed out (0 if none yet). */
	async last(): Promise<number> {
		try {
			const n = Number.parseInt((await fs.readFile(this.file, "utf8")).trim(), 10);
			if (!Number.isInteger(n) || n < 0) throw new Error(`corrupt counter file ${this.file}`);
			return n;
		} catch (err) {
			if ((err as NodeJS.ErrnoException).code === "ENOENT") return 0;
			throw err;
		}
	}

	/** Record `n` as the last number used. Atomic via write-then-rename. */
	async commit(n: number): Promise<void> {
		await fs.mkdir(path.dirname(this.file), { recursive: true });
		const tmp = `${this.file}.${process.pid}.tmp`;
		await fs.writeFile(tmp, `${n}\n`);
		await fs.rename(tmp, this.file);
	}
}
