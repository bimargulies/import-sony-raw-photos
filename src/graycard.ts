import { execFile } from "node:child_process";
import { promisify } from "node:util";
import sharp from "sharp";

const run = promisify(execFile);

const SIZE = 64;

export interface GrayCardThresholds {
	/** Mean luma (0-255, sRGB preview) must fall in this range; 18% gray is about 118. */
	minLuma: number;
	maxLuma: number;
	/** Max (R,G,B) spread of the mean color, as a fraction of mean luma. */
	maxTint: number;
	/** Max luma standard deviation across the central region. */
	maxStdDev: number;
	/** A frame this dark and flat (lens cap on) also counts as a marker. */
	maxBlackLuma: number;
	maxBlackStdDev: number;
}

export const DEFAULT_THRESHOLDS: GrayCardThresholds = { minLuma: 60, maxLuma: 210, maxTint: 0.1, maxStdDev: 14, maxBlackLuma: 12, maxBlackStdDev: 5 };

/** True if packed RGB pixels (SIZE x SIZE) of the central region look like a uniform neutral gray. */
export function isGrayCard(rgb: Uint8Array, size = SIZE, t: GrayCardThresholds = DEFAULT_THRESHOLDS): boolean {
	const lo = Math.floor(size * 0.25);
	const hi = Math.ceil(size * 0.75);
	let n = 0;
	let r = 0;
	let g = 0;
	let b = 0;
	const lumas: number[] = [];
	for (let y = lo; y < hi; y++) {
		for (let x = lo; x < hi; x++) {
			const i = (y * size + x) * 3;
			r += rgb[i];
			g += rgb[i + 1];
			b += rgb[i + 2];
			lumas.push(0.2126 * rgb[i] + 0.7152 * rgb[i + 1] + 0.0722 * rgb[i + 2]);
			n++;
		}
	}
	if (n === 0) return false;
	r /= n;
	g /= n;
	b /= n;
	const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
	const variance = lumas.reduce((s, v) => s + (v - luma) ** 2, 0) / n;
	const stdDev = Math.sqrt(variance);
	if (luma <= t.maxBlackLuma && stdDev <= t.maxBlackStdDev) return true; // black frame
	if (luma < t.minLuma || luma > t.maxLuma) return false;
	if ((Math.max(r, g, b) - Math.min(r, g, b)) / luma > t.maxTint) return false;
	return stdDev <= t.maxStdDev;
}

/** Extract the ARW's embedded JPEG preview, downsample it, and decide whether it's a gray-card frame. */
export async function detectGrayCard(file: string, t: GrayCardThresholds = DEFAULT_THRESHOLDS): Promise<boolean> {
	let jpeg = Buffer.alloc(0);
	for (const tag of ["-PreviewImage", "-JpgFromRaw", "-OtherImage"]) {
		const { stdout } = await run("exiftool", ["-b", tag, file], { encoding: "buffer", maxBuffer: 64 * 1024 * 1024 });
		if (stdout.length > 0) {
			jpeg = stdout;
			break;
		}
	}
	if (jpeg.length === 0) throw new Error("no embedded preview to check for gray card");
	const raw = await sharp(jpeg).rotate().resize(SIZE, SIZE, { fit: "fill" }).removeAlpha().raw().toBuffer();
	return isGrayCard(raw, SIZE, t);
}
