import { describe, expect, it } from "vitest";
import { isBlackFrame } from "./blackframe.js";

const SIZE = 64;
function fill(f: (x: number, y: number) => [number, number, number]): Uint8Array {
	const out = new Uint8Array(SIZE * SIZE * 3);
	for (let y = 0; y < SIZE; y++) {
		for (let x = 0; x < SIZE; x++) out.set(f(x, y), (y * SIZE + x) * 3);
	}
	return out;
}

describe("isBlackFrame", () => {
	it("accepts a black frame, with noise", () => {
		expect(isBlackFrame(fill(() => [2, 2, 2]))).toBe(true);
		expect(isBlackFrame(fill((x, y) => [(x + y) % 4, 1, (x * y) % 3]))).toBe(true);
	});
	it("rejects a dark but textured frame", () => {
		expect(isBlackFrame(fill((x) => (x % 2 ? [0, 0, 0] : [40, 40, 40])))).toBe(false);
	});
	it("rejects gray, colored and white frames", () => {
		expect(isBlackFrame(fill(() => [120, 120, 120]))).toBe(false);
		expect(isBlackFrame(fill(() => [180, 90, 60]))).toBe(false);
		expect(isBlackFrame(fill(() => [250, 250, 250]))).toBe(false);
	});
});
