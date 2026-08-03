import { strict as assert } from "node:assert";
import { test } from "node:test";
// @ts-expect-error Node 24 type-stripping test runner resolves TypeScript source imports.
import * as actionSurface from "../src/ui/action-surface.ts";
const { getDesktopActionPosition, getMobileActionBottom } = actionSurface;

test("clamps desktop action bar to the viewport edges", () => {
	assert.deepEqual(getDesktopActionPosition(380, 200, 180, 40, 400, 300), {
		left: 212,
		top: 152,
	});

	assert.deepEqual(getDesktopActionPosition(20, 10, 180, 40, 400, 300), {
		left: 20,
		top: 18,
	});
});

test("places mobile action bar above the visible keyboard area", () => {
	assert.equal(getMobileActionBottom(800, 0, 500), 308);
	assert.equal(getMobileActionBottom(800, 100, 500), 208);
});
