import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { acquireLock } from "./lock.js";

async function tmpLock() {
	return path.join(await mkdtemp(path.join(os.tmpdir(), "lock-")), "lock");
}

describe("acquireLock", () => {
	it("is exclusive and releasable", async () => {
		const f = await tmpLock();
		const release = await acquireLock(f);
		await expect(acquireLock(f)).rejects.toThrow(/already running/);
		await release();
		await (await acquireLock(f))();
	});
	it("reclaims a stale lock", async () => {
		const f = await tmpLock();
		await writeFile(f, "2147483646"); // no such pid
		await (await acquireLock(f))();
	});
});
