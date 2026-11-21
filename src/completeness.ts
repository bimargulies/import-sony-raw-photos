import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);

export interface Completeness {
	complete: boolean;
	/** Bytes the header says the file must have (undefined if the header couldn't be read). */
	expected?: number;
	/** Why the file is not complete, when it isn't. */
	reason?: string;
}

/**
 * A TIFF-based raw file records where its image data starts and how long it is. The data must end
 * inside the file, so a file shorter than that is still being written (or was cut off).
 * `offsets` and `counts` are the strip offsets / byte counts from one IFD.
 */
export function evaluateCompleteness(size: number, offsets: number[], counts: number[]): Completeness {
	if (offsets.length === 0 || offsets.length !== counts.length) {
		return { complete: false, reason: "header has no readable image data location" };
	}
	let expected = 0;
	for (let i = 0; i < offsets.length; i++) expected = Math.max(expected, offsets[i]! + counts[i]!);
	if (size < expected) {
		return { complete: false, expected, reason: `${size} of at least ${expected} bytes present` };
	}
	return { complete: true, expected };
}

function numbers(v: unknown): number[] {
	return String(v ?? "")
		.split(/\s+/)
		.filter(Boolean)
		.map(Number)
		.filter(Number.isFinite);
}

/**
 * Read the strip offsets/byte counts with exiftool and check them against `size`.
 * An unreadable header counts as incomplete: a partly written file may not even have one yet.
 */
export async function checkComplete(file: string, size: number): Promise<Completeness> {
	let row: Record<string, unknown>;
	try {
		const { stdout } = await run("exiftool", ["-json", "-a", "-G1", "-StripOffsets", "-StripByteCounts", file]);
		row = JSON.parse(stdout)[0] as Record<string, unknown>;
	} catch (err) {
		return { complete: false, reason: `header unreadable: ${(err as Error).message.split("\n")[0]}` };
	}
	// Keys look like "SubIFD:StripOffsets"; pair offsets with counts from the same group.
	const offsets: number[] = [];
	const counts: number[] = [];
	for (const key of Object.keys(row)) {
		if (!key.endsWith(":StripOffsets")) continue;
		const group = key.slice(0, -"StripOffsets".length);
		const c = numbers(row[`${group}StripByteCounts`]);
		const o = numbers(row[key]);
		if (o.length !== c.length) return { complete: false, reason: "header strip tables disagree" };
		offsets.push(...o);
		counts.push(...c);
	}
	return evaluateCompleteness(size, offsets, counts);
}
