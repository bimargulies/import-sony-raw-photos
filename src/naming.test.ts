import { describe, expect, it } from "vitest";
import { exifDateToIso, localIsoDate, formatName } from "./naming.js";

describe("exifDateToIso", () => {
	it("parses EXIF timestamps", () => {
		expect(exifDateToIso("2026:11:08 12:08:25")).toBe("2026-11-08");
	});
	it("rejects garbage", () => {
		expect(exifDateToIso("nope")).toBeUndefined();
	});
});

describe("localIsoDate", () => {
	it("zero-pads", () => {
		expect(localIsoDate(new Date(2026, 0, 5))).toBe("2026-01-05");
	});
});

describe("formatName", () => {
	it("pads to four digits", () => {
		expect(formatName("2026-11-08", 7)).toBe("2026-11-08-0007.dng");
	});
	it("widens past 9999", () => {
		expect(formatName("2026-11-08", 10000)).toBe("2026-11-08-10000.dng");
	});
});
