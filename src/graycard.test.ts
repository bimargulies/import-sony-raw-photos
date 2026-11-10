import { describe, expect, it } from "vitest";
import { isGrayCard } from "./graycard.js";

const SIZE = 64;
function fill(f: (x: number, y: number) => [number, number, number]): Uint8Array {
	const out = new Uint8Array(SIZE * SIZE * 3);
	for (let y = 0; y < SIZE; y++) {
		for (let x = 0; x < SIZE; x++) out.set(f(x, y), (y * SIZE + x) * 3);
	}
	return out;
}

describe("isGrayCard", () => {
	it("accepts a uniform mid-gray frame", () => {
		expect(isGrayCard(fill(() => [120, 120, 120]))).toBe(true);
	});
	it("accepts gray with slight noise and a small tint", () => {
		expect(isGrayCard(fill((x, y) => [118 + ((x + y) % 5), 120, 122]))).toBe(true);
	});
	it("rejects a colored frame", () => {
		expect(isGrayCard(fill(() => [180, 90, 60]))).toBe(false);
	});
	it("rejects a textured gray frame", () => {
		expect(isGrayCard(fill((x) => (x % 2 ? [60, 60, 60] : [180, 180, 180])))).toBe(false);
	});
	it("accepts a black frame (lens cap), with noise", () => {
		expect(isGrayCard(fill(() => [2, 2, 2]))).toBe(true);
		expect(isGrayCard(fill((x, y) => [(x + y) % 4, 1, (x * y) % 3]))).toBe(true);
	});
	it("rejects a dark but textured frame and a white frame", () => {
		expect(isGrayCard(fill((x) => (x % 2 ? [0, 0, 0] : [40, 40, 40])))).toBe(false);
		expect(isGrayCard(fill(() => [250, 250, 250]))).toBe(false);
	});
});
