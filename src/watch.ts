import { setTimeout as sleep } from "node:timers/promises";
import type { Importer } from "./importer.js";

/** Scan repeatedly until `signal` aborts. Scan errors (e.g. volume unmounted) are logged and retried. */
export async function watchLoop(
	importer: Importer,
	opts: { intervalMs: number; log: (msg: string) => void; signal: AbortSignal },
): Promise<void> {
	let lastError = "";
	while (!opts.signal.aborted) {
		try {
			const r = await importer.scan();
			if (r.imported || r.failed) {
				opts.log(`scan: ${r.imported} imported, ${r.failed} failed`);
			}
			lastError = "";
		} catch (err) {
			const msg = (err as Error).message;
			if (msg !== lastError) opts.log(`scan error (will keep retrying): ${msg}`);
			lastError = msg;
		}
		await sleep(opts.intervalMs, undefined, { signal: opts.signal }).catch(() => {});
	}
}
