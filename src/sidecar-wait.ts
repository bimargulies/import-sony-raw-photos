import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);

/**
 * Files delivered by the capture app are named with this prefix, and each one gets a sidecar .xmp
 * (even with no description) written AFTER the ARW. On a slow or lagging network share the ARW can
 * show up before its sidecar, so the importer waits for the sidecar of any file with this prefix.
 */
export const DEFAULT_SIDECAR_PREFIX = "CAP-";

/** How long to wait for a sidecar before importing the photo without it (a slow NAS can take a long time). */
export const DEFAULT_SIDECAR_WAIT_MS = 30 * 60_000;

/** The keyword in a marker's sidecar (XMP dc:subject) that says "this file is a stack marker". */
export const MARKER_KEYWORD = "macro-capture-for-sony:stack-marker";

/** The keyword written before the capture app was renamed. Markers already on disk may still carry it. */
export const LEGACY_MARKER_KEYWORD = "capture-viewfinder:stack-marker";

/** True if the file name starts with the prefix (case-insensitive). An empty prefix turns the wait off. */
export function expectsSidecar(file: string, prefix: string): boolean {
	if (prefix === "") return false;
	const name = file.split(/[\\/]/).pop() ?? file;
	return name.toLowerCase().startsWith(prefix.toLowerCase());
}

/**
 * How long a file has been waiting: since it was last seen to change, or since it was written,
 * whichever is longer (so a one-off import of an old folder does not wait all over again).
 */
export function waitedMs(nowMs: number, sinceMs: number, mtimeMs: number): number {
	return Math.max(nowMs - sinceMs, nowMs - mtimeMs);
}

/** The earliest of a list of capture times ("YYYY:MM:DD HH:MM:SS.sss" sorts as text), if any. */
export function earliest(times: string[]): string | undefined {
	return times.length === 0 ? undefined : [...times].sort()[0];
}

/**
 * Split photos (already in capture order) at a barrier: those captured before it may be imported;
 * the rest are held back. Importing a later photo before an earlier one that is still waiting would
 * put the earlier one in the wrong place (for instance outside the focus stack it belongs to).
 */
export function splitAtBarrier<T extends { captured: string }>(sorted: T[], barrier: string | undefined): { ready: T[]; held: T[] } {
	if (barrier === undefined) return { ready: sorted, held: [] };
	return { ready: sorted.filter((c) => c.captured < barrier), held: sorted.filter((c) => c.captured >= barrier) };
}

/** True if an exiftool JSON row (from `-XMP-dc:Subject`) carries the current or legacy marker keyword. */
export function rowSaysMarker(row: Record<string, unknown>): boolean {
	const s = row.Subject;
	const list = Array.isArray(s) ? s : typeof s === "string" ? [s] : [];
	return list.some((v) => typeof v === "string" && (v.trim() === MARKER_KEYWORD || v.trim() === LEGACY_MARKER_KEYWORD));
}

/** Does any of these sidecars say the file is a stack marker? */
export async function sidecarSaysMarker(sidecars: string[]): Promise<boolean> {
	for (const sc of sidecars) {
		const { stdout } = await run("exiftool", ["-json", "-XMP-dc:Subject", sc]);
		if (rowSaysMarker((JSON.parse(stdout)[0] ?? {}) as Record<string, unknown>)) return true;
	}
	return false;
}
