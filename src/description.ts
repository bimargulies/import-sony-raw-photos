import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);

/**
 * The fields that hold a photo's description. dnglab drops all of them when it converts an ARW,
 * so they are copied from the ARW to the DNG afterwards. Writing all three keeps Bridge,
 * Lightroom and others in agreement: IPTC caption, XMP dc:description, EXIF ImageDescription.
 */
export const DESCRIPTION_TAGS = ["-IPTC:Caption-Abstract", "-XMP-dc:Description", "-EXIF:ImageDescription"] as const;

/** True if any description field in the exiftool row has visible text (the camera writes blank ones). */
export function hasDescription(row: Record<string, unknown>): boolean {
	return Object.values(row).some((v) => typeof v === "string" && v.trim() !== "");
}

/** exiftool arguments that copy the description fields from `src` onto `dst` in place. */
export function copyDescriptionArgs(src: string, dst: string): string[] {
	return ["-overwrite_original", "-q", "-tagsFromFile", src, ...DESCRIPTION_TAGS, dst];
}

/**
 * Copy the description from the ARW onto its DNG. Does nothing (and leaves the DNG untouched)
 * when the ARW has no description. Returns whether anything was copied.
 */
export async function copyDescription(src: string, dst: string): Promise<boolean> {
	const { stdout } = await run("exiftool", ["-json", ...DESCRIPTION_TAGS, src]);
	const row = (JSON.parse(stdout)[0] ?? {}) as Record<string, unknown>;
	delete row.SourceFile;
	if (!hasDescription(row)) return false;
	await run("exiftool", copyDescriptionArgs(src, dst));
	return true;
}
