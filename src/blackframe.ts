import { execFile } from "node:child_process";
import { promisify } from "node:util";
import sharp from "sharp";

const run = promisify(execFile);

const SIZE = 64;

export interface BlackFrameThresholds {
	/** Max mean luma (0-255, sRGB preview) of the central region. */
	maxLuma: number;
	/** Max luma standard deviation across the central region. */
	maxStdDev: number;
}

export const DEFAULT_THRESHOLDS: BlackFrameThresholds = { maxLuma: 12, maxStdDev: 5 };

/** True if packed RGB pixels (size x size) have a very dark, flat center: a frame shot with the lens cap on. */
export function isBlackFrame(rgb: Uint8Array, size = SIZE, t: BlackFrameThresholds = DEFAULT_THRESHOLDS): boolean {
	const lo = Math.floor(size * 0.25);
	const hi = Math.ceil(size * 0.75);
	const lumas: number[] = [];
	for (let y = lo; y < hi; y++) {
		for (let x = lo; x < hi; x++) {
			const i = (y * size + x) * 3;
			lumas.push(0.2126 * rgb[i] + 0.7152 * rgb[i + 1] + 0.0722 * rgb[i + 2]);
		}
	}
	if (lumas.length === 0) return false;
	const mean = lumas.reduce((s, v) => s + v, 0) / lumas.length;
	const stdDev = Math.sqrt(lumas.reduce((s, v) => s + (v - mean) ** 2, 0) / lumas.length);
	return mean <= t.maxLuma && stdDev <= t.maxStdDev;
}

/** Extract the ARW's embedded JPEG preview, downsample it, and decide whether it's a black frame. */
export async function detectBlackFrame(file: string, t: BlackFrameThresholds = DEFAULT_THRESHOLDS): Promise<boolean> {
	let jpeg = Buffer.alloc(0);
	for (const tag of ["-PreviewImage", "-JpgFromRaw", "-OtherImage"]) {
		const { stdout } = await run("exiftool", ["-b", tag, file], { encoding: "buffer", maxBuffer: 64 * 1024 * 1024 });
		if (stdout.length > 0) {
			jpeg = stdout;
			break;
		}
	}
	if (jpeg.length === 0) throw new Error("no embedded preview to check for a black frame");
	const raw = await sharp(jpeg).rotate().resize(SIZE, SIZE, { fit: "fill" }).removeAlpha().raw().toBuffer();
	return isBlackFrame(raw, SIZE, t);
}
