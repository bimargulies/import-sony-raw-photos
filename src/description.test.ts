import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { findSidecars, pickDescription, removeSidecars, writeDescriptionArgs } from "./description.js";

describe("pickDescription", () => {
	it("is undefined for no fields or blank ones", () => {
		expect(pickDescription({})).toBeUndefined();
		expect(pickDescription({ ImageDescription: "", "Caption-Abstract": "   " })).toBeUndefined();
	});
	it("prefers the XMP description, then the IPTC caption, then the EXIF description", () => {
		expect(pickDescription({ ImageDescription: "c", "Caption-Abstract": "b", Description: "a" })).toBe("a");
		expect(pickDescription({ ImageDescription: "c", "Caption-Abstract": "b" })).toBe("b");
		expect(pickDescription({ ImageDescription: "  c  " })).toBe("c");
	});
	it("ignores non-string values", () => {
		expect(pickDescription({ Description: 3, "Caption-Abstract": null })).toBeUndefined();
	});
});

describe("writeDescriptionArgs", () => {
	it("writes the text into all three fields, as UTF-8", () => {
		const a = writeDescriptionArgs("café < &", "out.dng");
		expect(a).toContain("-IPTC:Caption-Abstract=café < &");
		expect(a).toContain("-XMP-dc:Description=café < &");
		expect(a).toContain("-EXIF:ImageDescription=café < &");
		expect(a).toContain("exif=utf8");
		expect(a).toContain("iptc=utf8");
		expect(a.at(-1)).toBe("out.dng");
	});
});

describe("sidecars", () => {
	let dir: string;
	beforeEach(async () => {
		dir = await mkdtemp(path.join(tmpdir(), "sidecar-test-"));
	});
	afterEach(async () => {
		await rm(dir, { recursive: true, force: true });
	});
	const touch = (n: string) => writeFile(path.join(dir, n), "x");

	it("finds Adobe-style and darktable-style sidecars, case-insensitively", async () => {
		await touch("CAP-0001.ARW");
		await touch("CAP-0001.xmp");
		await touch("CAP-0001.ARW.XMP");
		await touch("CAP-0002.xmp"); // someone else's
		const found = (await findSidecars(path.join(dir, "CAP-0001.ARW"))).map((p) => path.basename(p));
		expect(found).toEqual(["CAP-0001.ARW.XMP", "CAP-0001.xmp"]);
	});
	it("finds nothing when there is no sidecar, or the folder is gone", async () => {
		await touch("CAP-0001.ARW");
		expect(await findSidecars(path.join(dir, "CAP-0001.ARW"))).toEqual([]);
		expect(await findSidecars(path.join(dir, "nope", "x.ARW"))).toEqual([]);
	});
	it("ignores hidden partial files", async () => {
		await touch(".CAP-0001.xmp.partial");
		await touch(".CAP-0001.xmp");
		expect(await findSidecars(path.join(dir, "CAP-0001.ARW"))).toEqual([]);
	});
	it("removes the sidecars of an imported ARW and no others", async () => {
		await touch("CAP-0001.xmp");
		await touch("CAP-0002.xmp");
		await removeSidecars(path.join(dir, "CAP-0001.ARW"));
		expect((await findSidecars(path.join(dir, "CAP-0002.ARW"))).length).toBe(1);
		expect(await findSidecars(path.join(dir, "CAP-0001.ARW"))).toEqual([]);
	});
});
