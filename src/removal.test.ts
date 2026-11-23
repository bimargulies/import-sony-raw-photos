import { existsSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { PendingRemovals } from "./removal.js";

async function tmpFile() {
	const file = path.join(await mkdtemp(path.join(os.tmpdir(), "removal-")), "CAP-0001.ARW");
	await writeFile(file, "photo");
	return file;
}

function failingOnce() {
	let failed = false;
	return vi.fn(async (file: string) => {
		if (!failed) {
			failed = true;
			throw new Error("EBUSY");
		}
		await rm(file, { force: true });
	});
}

describe("PendingRemovals", () => {
	it("retries a failed delete until it works", async () => {
		const file = await tmpFile();
		const removals = new PendingRemovals(() => {}, undefined, 1000, failingOnce());
		await removals.removeOrRemember(file, 0);
		expect(removals.has(file)).toBe(true);
		await removals.retry(1);
		expect(removals.has(file)).toBe(false);
		expect(existsSync(file)).toBe(false);
	});

	it("does not delete a new delivery that reuses the name", async () => {
		const file = await tmpFile();
		const remove = vi.fn(async () => {
			throw new Error("EBUSY");
		});
		const removals = new PendingRemovals(() => {}, undefined, 1000, remove);
		await removals.removeOrRemember(file, 0);
		await writeFile(file, "a different, longer photo");
		await removals.retry(1);
		expect(removals.has(file)).toBe(false);
		expect(remove).toHaveBeenCalledTimes(1);
		expect(existsSync(file)).toBe(true);
	});

	it("warns once when the delete keeps failing", async () => {
		const file = await tmpFile();
		const warn = vi.fn();
		const remove = async () => {
			throw new Error("EBUSY");
		};
		const removals = new PendingRemovals(() => {}, warn, 1000, remove);
		await removals.removeOrRemember(file, 0);
		await removals.retry(999);
		expect(warn).not.toHaveBeenCalled();
		await removals.retry(1000);
		await removals.retry(2000);
		expect(warn).toHaveBeenCalledTimes(1);
	});
});
