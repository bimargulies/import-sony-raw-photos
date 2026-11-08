import { describe, expect, it } from "vitest";
import { exifDateToIso, localIsoDate, NameAllocator } from "./naming.js";

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

describe("NameAllocator", () => {
	it("starts at 01 and counts per date", () => {
		const a = new NameAllocator();
		expect(a.allocate("2026-11-08")).toBe("2026-11-08-01.dng");
		expect(a.allocate("2026-11-08")).toBe("2026-11-08-02.dng");
		expect(a.allocate("2026-11-07")).toBe("2026-11-07-01.dng");
	});
	it("continues after existing files", () => {
		const a = new NameAllocator(["2026-11-08-03.dng", "2026-11-08-01.dng", "x.txt"]);
		expect(a.allocate("2026-11-08")).toBe("2026-11-08-04.dng");
	});
	it("widens past 99", () => {
		const a = new NameAllocator(["2026-11-08-99.dng"]);
		expect(a.allocate("2026-11-08")).toBe("2026-11-08-100.dng");
	});
});
