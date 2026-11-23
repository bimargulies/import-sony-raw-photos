import { describe, expect, it } from "vitest";
import { describeStack, isWatchCommand } from "./watch-control.js";

const cli = "/work/import/dist/index.js";

describe("isWatchCommand", () => {
	it("recognizes the watcher", () => {
		expect(isWatchCommand(`/bin/node ${cli} --watch`, cli)).toBe(true);
	});
	it("ignores the control commands", () => {
		expect(isWatchCommand(`/bin/node ${cli} --watch-status`, cli)).toBe(false);
		expect(isWatchCommand(`/bin/node ${cli} --watch-restart`, cli)).toBe(false);
	});
	it("ignores one-off imports and other programs", () => {
		expect(isWatchCommand(`/bin/node ${cli}`, cli)).toBe(false);
		expect(isWatchCommand("/bin/node other.js --watch", cli)).toBe(false);
	});
});

describe("describeStack", () => {
	it("describes each state", () => {
		expect(describeStack({ stack: "none", photos: 0 })).toBe("no stack open");
		expect(describeStack({ stack: "pending", photos: 0 })).toMatch(/waiting for its first photo/);
		expect(describeStack({ stack: "stack-057", photos: 3 })).toBe("stack-057 is open with 3 photo(s)");
	});
});
