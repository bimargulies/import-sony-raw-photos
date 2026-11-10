import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { Counter, DEFAULT_COUNTER_FILE } from "./counter.js";
import { detectGrayCard } from "./graycard.js";
import { exifDateToIso, formatName, formatStackName, localIsoDate } from "./naming.js";

const run = promisify(execFile);

export interface ImportOptions {
	source: string;
	dest: string;
	dryRun: boolean;
	keepOriginals: boolean;
	/** Skip files modified more recently than this (still being delivered). */
	minAgeMs: number;
	/** Also require a file's size and mtime to be unchanged for this long across scans. */
	settleMs?: number;
	/** Don't retry a failed file again until it changes or this long has passed. */
	retryMs?: number;
	/** Log each new / growing / ready file (for watch mode). */
	verbose?: boolean;
	/** File holding the last sequence number used. */
	counterFile?: string;
	/** File holding the last stack number used (default: "stack-counter" beside the counter file). */
	stackCounterFile?: string;
	log?: (msg: string) => void;
}

export interface ImportResult {
	imported: number;
	skipped: number;
	failed: number;
}

interface Candidate {
	file: string;
	captured: string; // "YYYY:MM:DD HH:MM:SS.sss" — sorts lexically
	width?: number;
	height?: number;
	grayCard?: boolean;
}

async function findArws(dir: string, out: string[] = []): Promise<string[]> {
	for (const e of await fs.readdir(dir, { withFileTypes: true })) {
		if (e.name.startsWith(".")) continue;
		const p = path.join(dir, e.name);
		if (e.isDirectory()) await findArws(p, out);
		else if (e.isFile() && /\.arw$/i.test(e.name)) out.push(p);
	}
	return out;
}

async function readCapture(file: string): Promise<Candidate> {
	const { stdout } = await run("exiftool", [
		"-json",
		"-DateTimeOriginal",
		"-SubSecTimeOriginal",
		"-ImageWidth",
		"-ImageHeight",
		file,
	]);
	const row = JSON.parse(stdout)[0] as {
		DateTimeOriginal?: string;
		SubSecTimeOriginal?: string | number;
		ImageWidth?: number;
		ImageHeight?: number;
	};
	if (!row.DateTimeOriginal || !exifDateToIso(row.DateTimeOriginal)) {
		throw new Error("no usable EXIF DateTimeOriginal");
	}
	const sub = String(row.SubSecTimeOriginal ?? "0").padEnd(3, "0");
	return {
		file,
		captured: `${row.DateTimeOriginal}.${sub}`,
		width: row.ImageWidth,
		height: row.ImageHeight,
	};
}

/** dnglab can emit thousands of lines for a corrupt file; keep just the head. */
function firstLines(text: string, lines = 3, maxChars = 400): string {
	const head = text.split(/\r?\n/).filter(Boolean).slice(0, lines).join(" | ");
	return head.length > maxChars ? `${head.slice(0, maxChars)}…` : head;
}

/** Confirm the converted DNG is readable and matches its source before the source is deleted. */
async function verifyDng(dng: string, src: Candidate): Promise<void> {
	const { stdout } = await run("exiftool", ["-json", "-DateTimeOriginal", "-ImageWidth", "-ImageHeight", dng]);
	const row = JSON.parse(stdout)[0] as { DateTimeOriginal?: string; ImageWidth?: number; ImageHeight?: number };
	if (row.DateTimeOriginal !== src.captured.slice(0, 19)) throw new Error("DNG capture time doesn't match the source");
	if (src.width && src.height && (row.ImageWidth !== src.width || row.ImageHeight !== src.height)) {
		throw new Error(`DNG size ${row.ImageWidth}x${row.ImageHeight} doesn't match source ${src.width}x${src.height}`);
	}
}

interface Seen {
	size: number;
	mtimeMs: number;
	since: number;
}

/** Scans the source folder and imports whatever is ready. Keeps state between scans for watch mode. */
export class Importer {
	private seen = new Map<string, Seen>();
	private failed = new Map<string, { size: number; mtimeMs: number; at: number }>();
	private readonly log: (msg: string) => void;
	/** A gray card was seen and the next imported photo starts a new stack. */
	private stackPending = false;
	/** Folder of the stack currently being filled; persists across scans so watch mode can continue it. */
	private stackDir: string | undefined;

	constructor(private readonly opts: ImportOptions) {
		this.log = opts.log ?? console.log;
	}

	async scan(now: Date = new Date()): Promise<ImportResult> {
		const { opts, log } = this;
		const result: ImportResult = { imported: 0, skipped: 0, failed: 0 };
		const t = now.getTime();
		const settleMs = opts.settleMs ?? 0;
		const retryMs = opts.retryMs ?? 5 * 60_000;

		const all = await findArws(opts.source);
		const present = new Set(all);
		for (const k of [...this.seen.keys()]) if (!present.has(k)) this.seen.delete(k);
		for (const k of [...this.failed.keys()]) if (!present.has(k)) this.failed.delete(k);

		const candidates: Candidate[] = [];
		for (const file of all) {
			try {
				const st = await fs.stat(file);
				const prev = this.seen.get(file);
				if (!prev || prev.size !== st.size || prev.mtimeMs !== st.mtimeMs) {
					this.seen.set(file, { size: st.size, mtimeMs: st.mtimeMs, since: t });
					if (opts.verbose) {
						log(prev ? `growing: ${file} (${prev.size} -> ${st.size} bytes)` : `new file: ${file} (${st.size} bytes)`);
					}
				}
				const cur = this.seen.get(file)!;
				const f = this.failed.get(file);
				if (f && f.size === st.size && f.mtimeMs === st.mtimeMs && t - f.at < retryMs) continue;
				if (t - st.mtimeMs < opts.minAgeMs || t - cur.since < settleMs) {
					if (!opts.verbose) log(`skip (still being written?): ${file}`);
					result.skipped++;
					continue;
				}
				if (opts.verbose) log(`stable, importing: ${file}`);
				const cand = await readCapture(file);
				try {
					cand.grayCard = await detectGrayCard(file);
				} catch (err) {
					log(`gray card check failed for ${file}, treating as a photo: ${(err as Error).message}`);
				}
				candidates.push(cand);
			} catch (err) {
				if ((err as NodeJS.ErrnoException).code === "ENOENT") continue; // vanished mid-scan
				log(`FAILED ${file}: ${(err as Error).message}`);
				await this.remember(file);
				result.failed++;
			}
		}
		candidates.sort((a, b) => a.captured.localeCompare(b.captured) || a.file.localeCompare(b.file));
		if (candidates.length === 0) {
			if (!opts.verbose) log("Nothing to import.");
			return result;
		}

		const folder = path.join(opts.dest, localIsoDate(now));
		const counter = new Counter(opts.counterFile ?? DEFAULT_COUNTER_FILE);
		let seq = await counter.last();
		const stackCounter = new Counter(
			opts.stackCounterFile ?? path.join(path.dirname(opts.counterFile ?? DEFAULT_COUNTER_FILE), "stack-counter"),
		);
		let stackSeq = await stackCounter.last();
		const partialDir = path.join(folder, `.partial-${process.pid}`);

		for (const c of candidates) {
			if (c.grayCard) {
				// Markers come in open/close pairs: the first opens a stack, the next closes it.
				const closing = this.stackPending || this.stackDir !== undefined;
				this.stackPending = !closing;
				this.stackDir = undefined;
				try {
					if (opts.dryRun) {
						log(`would drop marker frame ${c.file} (${closing ? "closes" : "opens"} a stack)`);
					} else {
						if (!opts.keepOriginals) await fs.unlink(c.file);
						log(`marker frame, ${closing ? "closing the stack" : "starting a new stack"}: ${c.file}`);
					}
					result.imported++;
				} catch (err) {
					log(`FAILED ${c.file}: ${(err as Error).message}`);
					await this.remember(c.file);
					result.failed++;
				}
				continue;
			}
			let destDir = folder;
			if (this.stackPending) {
				stackSeq++;
				this.stackPending = false;
				this.stackDir = path.join(folder, formatStackName(stackSeq));
			}
			if (this.stackDir) destDir = this.stackDir;
			const name = formatName(exifDateToIso(c.captured)!, seq + 1);
			const target = path.join(destDir, name);
			if (opts.dryRun) {
				log(`would import ${c.file} -> ${target}`);
				seq++;
				result.imported++;
				continue;
			}
			try {
				await fs.mkdir(partialDir, { recursive: true });
				const tmp = path.join(partialDir, name);
				await run("dnglab", ["convert", c.file, tmp]);
				const st = await fs.stat(tmp);
				if (st.size === 0) throw new Error("converter produced an empty file");
				await verifyDng(tmp, c);
				await fs.mkdir(destDir, { recursive: true });
				await fs.rename(tmp, target);
				seq++;
				await counter.commit(seq);
				if (destDir !== folder) await stackCounter.commit(stackSeq);
				if (!opts.keepOriginals) await fs.unlink(c.file);
				log(`${c.file} -> ${target}`);
				result.imported++;
			} catch (err) {
				const e = err as Error & { stderr?: string };
				log(`FAILED ${c.file}: ${firstLines(e.stderr?.trim() || e.message)}`);
				await this.remember(c.file);
				result.failed++;
			}
		}
		await fs.rm(partialDir, { recursive: true, force: true });
		return result;
	}

	private async remember(file: string): Promise<void> {
		try {
			const st = await fs.stat(file);
			this.failed.set(file, { size: st.size, mtimeMs: st.mtimeMs, at: Date.now() });
		} catch {
			/* gone */
		}
	}
}

export function importPhotos(opts: ImportOptions): Promise<ImportResult> {
	return new Importer(opts).scan();
}
