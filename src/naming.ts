/** Parse an EXIF "YYYY:MM:DD HH:MM:SS" timestamp into its date part "YYYY-MM-DD". */
export function exifDateToIso(exif: string): string | undefined {
	const m = /^(\d{4}):(\d{2}):(\d{2})[ T]/.exec(exif);
	return m ? `${m[1]}-${m[2]}-${m[3]}` : undefined;
}

/** Local-time "YYYY-MM-DD" for a Date. */
export function localIsoDate(d: Date): string {
	const p = (n: number) => String(n).padStart(2, "0");
	return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * Tracks the next free "YYYY-MM-DD-nn.dng" name per date prefix, continuing
 * after any files already in the destination folder.
 */
export class NameAllocator {
	private next = new Map<string, number>();

	constructor(existingFiles: Iterable<string> = []) {
		for (const f of existingFiles) {
			const m = /^(\d{4}-\d{2}-\d{2})-(\d+)\.dng$/i.exec(f);
			if (!m) continue;
			const n = Number(m[2]);
			if (n >= (this.next.get(m[1]) ?? 1)) this.next.set(m[1], n + 1);
		}
	}

	allocate(date: string): string {
		const n = this.next.get(date) ?? 1;
		this.next.set(date, n + 1);
		return `${date}-${String(n).padStart(2, "0")}.dng`;
	}
}
