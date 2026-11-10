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

/** "YYYY-MM-DD-NNNN.dng" where NNNN is the zero-padded global sequence number (widens past 9999). */
export function formatName(date: string, seq: number): string {
	return `${date}-${String(seq).padStart(4, "0")}.dng`;
}

/** "stack-NNN" for a stack sequence number (widens past 999). */
export function formatStackName(seq: number): string {
	return `stack-${String(seq).padStart(3, "0")}`;
}
