import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);

/**
 * The description of a photo. It is looked for in a sidecar `.xmp` file next to the ARW first (the
 * ARW is never modified by the capture app; Sony's raw files can be damaged by tools that rewrite
 * them), then, as a fallback, in fields embedded in the ARW itself.
 *
 * dnglab drops every description field when it converts an ARW, so the text is written into the
 * DNG afterwards: IPTC Caption-Abstract, XMP dc:Description and EXIF ImageDescription, so Bridge,
 * Lightroom and others agree.
 */

/** Source tags to read, in order of preference. */
export const SOURCE_TAGS = ["XMP-dc:Description", "IPTC:Caption-Abstract", "EXIF:ImageDescription"] as const;

/**
 * Sidecar files for a raw file, matched case-insensitively in its folder: `IMG_1.xmp` (the Adobe
 * convention, used by Bridge and Lightroom) and `IMG_1.ARW.xmp`.
 */
export async function findSidecars(raw: string): Promise<string[]> {
	const dir = path.dirname(raw);
	const base = path.basename(raw);
	const stem = path.parse(base).name;
	const wanted = new Set([`${stem}.xmp`.toLowerCase(), `${base}.xmp`.toLowerCase()]);
	let names: string[];
	try {
		names = await fs.readdir(dir);
	} catch {
		return [];
	}
	return names
		.filter((n) => !n.startsWith(".") && wanted.has(n.toLowerCase()))
		.sort()
		.map((n) => path.join(dir, n));
}

/** The first non-blank description in an exiftool JSON row (keys are bare tag names), by preference. */
export function pickDescription(row: Record<string, unknown>): string | undefined {
	for (const key of ["Description", "Caption-Abstract", "ImageDescription"]) {
		const v = row[key];
		if (typeof v === "string" && v.trim() !== "") return v.trim();
	}
	return undefined;
}

/** Read a description from a file (an `.xmp` sidecar or an ARW) with exiftool. */
export async function readDescription(file: string): Promise<string | undefined> {
	const { stdout } = await run("exiftool", ["-json", "-charset", "iptc=utf8", ...SOURCE_TAGS.map((t) => `-${t}`), file]);
	return pickDescription((JSON.parse(stdout)[0] ?? {}) as Record<string, unknown>);
}

/** exiftool arguments that write the description into all three fields of `dst`, in place. */
export function writeDescriptionArgs(text: string, dst: string): string[] {
	return [
		"-overwrite_original",
		"-q",
		"-charset",
		"exif=utf8",
		"-charset",
		"iptc=utf8",
		"-IPTC:CodedCharacterSet=UTF8",
		`-IPTC:Caption-Abstract=${text}`,
		`-XMP-dc:Description=${text}`,
		`-EXIF:ImageDescription=${text}`,
		dst,
	];
}

export interface DescriptionResult {
	text: string;
	/** Where it came from: a sidecar path, or the ARW itself. */
	source: string;
}

/**
 * Find the description for an ARW (sidecar first, then the ARW's own fields) and write it into the
 * DNG. Does nothing, leaving the DNG untouched, when there is no description.
 */
export async function copyDescription(arw: string, dng: string): Promise<DescriptionResult | undefined> {
	let found: DescriptionResult | undefined;
	for (const sidecar of await findSidecars(arw)) {
		const text = await readDescription(sidecar);
		if (text) {
			found = { text, source: sidecar };
			break;
		}
	}
	if (!found) {
		const text = await readDescription(arw);
		if (text) found = { text, source: arw };
	}
	if (!found) return undefined;
	await run("exiftool", writeDescriptionArgs(found.text, dng));
	return found;
}

/** Delete the sidecars of an ARW that has been imported. */
export async function removeSidecars(arw: string): Promise<void> {
	for (const s of await findSidecars(arw)) await fs.rm(s, { force: true });
}
