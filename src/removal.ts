import { promises as fs } from "node:fs";
import path from "node:path";
import { removeSidecars } from "./description.js";

/** Delete an imported original and its sidecars. Safe to repeat if part of it already happened. */
export async function removeOriginal(file: string): Promise<void> {
	await fs.rm(file, { force: true });
	await removeSidecars(file);
}

interface Pending {
	size?: number;
	mtimeMs?: number;
	since: number;
	warned: boolean;
}

/**
 * Originals that have been fully handled but could not be deleted (a NAS can report EBUSY). They are
 * only ever retried as deletes: importing one again would duplicate a photo, and counting a marker
 * again would flip the stack state. A file that changes is a new delivery reusing the name.
 */
export class PendingRemovals {
	private readonly pending = new Map<string, Pending>();

	constructor(
		private readonly log: (msg: string) => void,
		private readonly warn: ((msg: string) => void) | undefined,
		private readonly warnAfterMs: number,
		private readonly remove: (file: string) => Promise<void> = removeOriginal,
	) {}

	has(file: string): boolean {
		return this.pending.has(file);
	}

	/** Delete now; on failure remember the file so later scans retry the delete. Never throws. */
	async removeOrRemember(file: string, now = Date.now()): Promise<void> {
		const st = await fs.stat(file).catch(() => undefined);
		try {
			await this.remove(file);
		} catch (err) {
			this.pending.set(file, { size: st?.size, mtimeMs: st?.mtimeMs, since: now, warned: false });
			this.log(`could not delete ${file}, will retry the delete only: ${(err as Error).message}`);
		}
	}

	async retry(now = Date.now()): Promise<void> {
		for (const [file, p] of [...this.pending]) {
			const st = await fs.stat(file).catch(() => undefined);
			if (st && (st.size !== p.size || st.mtimeMs !== p.mtimeMs)) {
				this.pending.delete(file);
				this.log(`${file} changed while waiting to be deleted; treating it as a new file`);
				continue;
			}
			try {
				await this.remove(file);
				this.pending.delete(file);
				this.log(`deleted imported original: ${file}`);
			} catch (err) {
				if (!p.warned && now - p.since >= this.warnAfterMs) {
					p.warned = true;
					const w = `could not delete ${path.basename(file)} after it was imported: ${(err as Error).message}. Still retrying. If the watcher restarts first, the file will be imported again.`;
					this.log(`WARNING: ${w}`);
					this.warn?.(w);
				}
			}
		}
	}
}
