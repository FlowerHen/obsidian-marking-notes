import { strict as assert } from "node:assert";
import { test } from "node:test";
// @ts-expect-error Bundled test runner resolves extensionless TypeScript source imports.
import * as commandPresets from "../src/settings/command-presets.ts";

const { normalizeInlineCommands, normalizeStewardCommands } = commandPresets;

test("normalizes legacy steward commands into conversation and augment lists", () => {
	const steward: any = {
		id: "test",
		name: "测试",
		icon: "🤖",
		systemPrompt: "",
		writingStyle: "",
		contextLength: 2000,
		temperature: 0.7,
		topP: 0.95,
		thinkingBudget: 0,
		footnoteLength: 30,
		boundModelProviderId: "provider",
		commands: [
			{
				id: "summary",
				name: "旧摘要",
				icon: "🪄",
				detailPrompt: "",
				type: "default-summary",
			},
			{
				id: "chat",
				name: "旧对话",
				icon: "💬",
				detailPrompt: "",
				type: "annotated",
			},
		],
	};

	normalizeStewardCommands(steward);

	assert.equal(steward.commands.length, 6);
	assert.equal(steward.augmentCommands?.length, 6);
	assert.equal(
		steward.commands.some((command: any) => command.type === "default-summary"),
		false,
	);
	assert.equal(
		steward.commands.every((command: any) => command.type === "conversation"),
		true,
	);
	assert.equal(
		steward.augmentCommands?.every(
			(command: any) => command.type === "augment",
		),
		true,
	);
	assert.equal(
		steward.commands.every((command: any) => command.enabled === true),
		true,
	);
});

test("fills inline commands to six and keeps the eight-command ceiling", () => {
	const steward: any = {
		boundModelProviderId: "provider",
		contextLength: 2000,
		temperature: 0.3,
		commands: [
			{
				id: "inline",
				name: "旧改写",
				icon: "✏️",
				detailPrompt: "",
				type: "inline-modify",
			},
		],
	};

	normalizeInlineCommands(steward);

	assert.equal(steward.commands.length, 6);
	assert.equal(
		steward.commands.every((command: any) => command.type === "inline-modify"),
		true,
	);
	assert.equal(steward.commands.length <= 8, true);
});
