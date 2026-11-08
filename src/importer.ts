import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { exifDateToIso, localIsoDate, NameAllocator } from "./naming.js";

const run = promisify(execFile);

export interface ImportOptions {
	source: string;
	dest: string;
	dryRun: boolean;
	keepOriginals: boolean;
	/** Skip files modified more recently than this (still being delivered). */
	minAgeMs: number;
	now?: Date;
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
		file,
	]);
	const row = JSON.parse(stdout)[0] as {
		DateTimeOriginal?: string;
		SubSecTimeOriginal?: string | number;
	};
	if (!row.DateTimeOriginal || !exifDateToIso(row.DateTimeOriginal)) {
		throw new Error("no usable EXIF DateTimeOriginal");
	}
	const sub = String(row.SubSecTimeOriginal ?? "0").padEnd(3, "0");
	return { file, captured: `${row.DateTimeOriginal}.${sub}` };
}

export async function importPhotos(opts: ImportOptions): Promise<ImportResult> {
	const log = opts.log ?? console.log;
	const result: ImportResult = { imported: 0, skipped: 0, failed: 0 };
	const now = opts.now ?? new Date();

	const all = await findArws(opts.source);
	const candidates: Candidate[] = [];
	for (const file of all) {
		try {
			const st = await fs.stat(file);
			if (now.getTime() - st.mtimeMs < opts.minAgeMs) {
				log(`skip (still being written?): ${file}`);
				result.skipped++;
				continue;
			}
			candidates.push(await readCapture(file));
		} catch (err) {
			log(`FAILED ${file}: ${(err as Error).message}`);
			result.failed++;
		}
	}
	candidates.sort(
		(a, b) => a.captured.localeCompare(b.captured) || a.file.localeCompare(b.file),
	);
	if (candidates.length === 0) {
		log("Nothing to import.");
		return result;
	}

	const folder = path.join(opts.dest, localIsoDate(now));
	let existing: string[] = [];
	try {
		existing = await fs.readdir(folder);
	} catch {
		/* folder doesn't exist yet */
	}
	const names = new NameAllocator(existing);
	const partialDir = path.join(folder, `.partial-${process.pid}`);

	for (const c of candidates) {
		const name = names.allocate(exifDateToIso(c.captured)!);
		const target = path.join(folder, name);
		if (opts.dryRun) {
			log(`would import ${c.file} -> ${target}`);
			result.imported++;
			continue;
		}
		try {
			await fs.mkdir(partialDir, { recursive: true });
			const tmp = path.join(partialDir, name);
			await run("dnglab", ["convert", c.file, tmp]);
			const st = await fs.stat(tmp);
			if (st.size === 0) throw new Error("converter produced an empty file");
			await fs.rename(tmp, target);
			if (!opts.keepOriginals) await fs.unlink(c.file);
			log(`${c.file} -> ${target}`);
			result.imported++;
		} catch (err) {
			const e = err as Error & { stderr?: string };
			log(`FAILED ${c.file}: ${e.stderr?.trim() || e.message}`);
			result.failed++;
		}
	}
	await fs.rm(partialDir, { recursive: true, force: true });
	return result;
}
