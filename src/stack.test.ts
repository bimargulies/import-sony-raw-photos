import { describe, expect, it } from "vitest";
import { stackAbandoned } from "./stack.js";

describe("stackAbandoned", () => {
	it("abandons a stack left open overnight", () => {
		expect(stackAbandoned("2026:11:22 16:29:00.000", "2026:11:23 10:43:00.000")).toBe(true);
	});
	it("continues a stack shot across midnight", () => {
		expect(stackAbandoned("2026:11:22 23:59:30.000", "2026:11:23 00:00:30.000")).toBe(false);
	});
	it("continues a long stack on the same day", () => {
		expect(stackAbandoned("2026:11:23 08:00:00.000", "2026:11:23 18:00:00.000")).toBe(false);
	});
	it("ignores a frame captured earlier than the stack", () => {
		expect(stackAbandoned("2026:11:23 10:00:00.000", "2026:11:22 10:00:00.000")).toBe(false);
	});
});
