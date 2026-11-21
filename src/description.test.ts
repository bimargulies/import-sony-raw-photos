import { describe, expect, it } from "vitest";
import { copyDescriptionArgs, hasDescription } from "./description.js";

describe("hasDescription", () => {
	it("is false for no fields or blank ones", () => {
		expect(hasDescription({})).toBe(false);
		expect(hasDescription({ ImageDescription: "", "Caption-Abstract": "   " })).toBe(false);
	});
	it("is true when any field has text", () => {
		expect(hasDescription({ ImageDescription: "", Description: "widget, stack 2" })).toBe(true);
	});
	it("ignores non-string values", () => {
		expect(hasDescription({ Foo: 3, Bar: null })).toBe(false);
	});
});

describe("copyDescriptionArgs", () => {
	it("copies the three description fields from the source onto the destination", () => {
		expect(copyDescriptionArgs("a.ARW", "b.dng")).toEqual([
			"-overwrite_original",
			"-q",
			"-tagsFromFile",
			"a.ARW",
			"-IPTC:Caption-Abstract",
			"-XMP-dc:Description",
			"-EXIF:ImageDescription",
			"b.dng",
		]);
	});
});
