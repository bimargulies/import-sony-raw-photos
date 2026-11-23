/** A gap this long across a date change means an open stack was forgotten, not shot past midnight. */
export const ABANDONED_STACK_GAP_MS = 60 * 60_000;

function captureMs(captured: string): number {
	return Date.parse(`${captured.slice(0, 10).replaceAll(":", "-")}T${captured.slice(11, 19)}`);
}

/**
 * Should an open stack be abandoned rather than continued by this capture? Times are
 * "YYYY:MM:DD HH:MM:SS.sss". True for a later calendar day at least an hour after the stack's last frame.
 */
export function stackAbandoned(last: string, next: string): boolean {
	return last.slice(0, 10) !== next.slice(0, 10) && captureMs(next) - captureMs(last) >= ABANDONED_STACK_GAP_MS;
}
