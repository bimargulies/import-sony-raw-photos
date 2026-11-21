import { describe, expect, it } from "vitest";
import { evaluateCompleteness } from "./completeness.js";

describe("evaluateCompleteness", () => {
	it("accepts a complete file (data ends before the end, with trailing bytes)", () => {
		const r = evaluateCompleteness(65_695_744, [4_485_120], [61_209_600]);
		expect(r.complete).toBe(true);
		expect(r.expected).toBe(65_694_720);
	});
	it("accepts a file that ends exactly where the data ends", () => {
		expect(evaluateCompleteness(100, [40], [60]).complete).toBe(true);
	});
	it("rejects a truncated file", () => {
		const r = evaluateCompleteness(58_195_968, [2_560_000], [61_209_600]);
		expect(r.complete).toBe(false);
		expect(r.expected).toBe(63_769_600);
	});
	it("uses the furthest end across several strips", () => {
		expect(evaluateCompleteness(150, [0, 100], [50, 60]).complete).toBe(false);
		expect(evaluateCompleteness(160, [0, 100], [50, 60]).complete).toBe(true);
	});
	it("treats a missing or inconsistent header as incomplete", () => {
		expect(evaluateCompleteness(1000, [], []).complete).toBe(false);
		expect(evaluateCompleteness(1000, [1, 2], [3]).complete).toBe(false);
	});
});
