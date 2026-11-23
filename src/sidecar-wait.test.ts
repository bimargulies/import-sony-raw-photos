import { describe, expect, it } from "vitest";
import { earliest, expectsSidecar, rowSaysMarker, splitAtBarrier, waitedMs, LEGACY_MARKER_KEYWORD, MARKER_KEYWORD } from "./sidecar-wait.js";

describe("expectsSidecar", () => {
	it("matches the prefix on the file name, ignoring case and folders", () => {
		expect(expectsSidecar("/Volumes/Photos/Capture/CAP-20261121-0001.ARW", "CAP-")).toBe(true);
		expect(expectsSidecar("/x/cap-20261121-0001.arw", "CAP-")).toBe(true);
		expect(expectsSidecar("/x/DSC00123.ARW", "CAP-")).toBe(false);
		expect(expectsSidecar("/CAP-folder/DSC00123.ARW", "CAP-")).toBe(false);
	});
	it("an empty prefix turns the wait off", () => {
		expect(expectsSidecar("/x/CAP-1.ARW", "")).toBe(false);
	});
});

describe("waitedMs", () => {
	it("uses the longer of time since last change and time since the file was written", () => {
		expect(waitedMs(1000, 900, 100)).toBe(900);
		expect(waitedMs(1000, 100, 900)).toBe(900);
	});
});

describe("barrier", () => {
	const photos = ["2026:11:21 14:00:01.000", "2026:11:21 14:00:02.000", "2026:11:21 14:00:03.000"].map((captured) => ({ captured }));
	it("earliest picks the smallest time", () => {
		expect(earliest([])).toBeUndefined();
		expect(earliest(["2026:11:21 14:00:03.000", "2026:11:21 14:00:02.500"])).toBe("2026:11:21 14:00:02.500");
	});
	it("with no barrier everything is ready", () => {
		expect(splitAtBarrier(photos, undefined)).toEqual({ ready: photos, held: [] });
	});
	it("holds back the waiting photo's time and everything after it", () => {
		const { ready, held } = splitAtBarrier(photos, "2026:11:21 14:00:02.000");
		expect(ready.map((p) => p.captured)).toEqual(["2026:11:21 14:00:01.000"]);
		expect(held.map((p) => p.captured)).toEqual(["2026:11:21 14:00:02.000", "2026:11:21 14:00:03.000"]);
	});
});

describe("rowSaysMarker", () => {
	it("recognizes the keyword as a string or in a list", () => {
		expect(rowSaysMarker({ Subject: MARKER_KEYWORD })).toBe(true);
		expect(rowSaysMarker({ Subject: ["x", MARKER_KEYWORD] })).toBe(true);
	});
	it("still recognizes markers written before the capture app was renamed", () => {
		expect(rowSaysMarker({ Subject: "capture-viewfinder:stack-marker" })).toBe(true);
		expect(rowSaysMarker({ Subject: ["x", LEGACY_MARKER_KEYWORD] })).toBe(true);
	});
	it("is false otherwise", () => {
		expect(rowSaysMarker({})).toBe(false);
		expect(rowSaysMarker({ Subject: "landscape" })).toBe(false);
		expect(rowSaysMarker({ Subject: [3, null] })).toBe(false);
	});
});
