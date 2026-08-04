import { strict as assert } from "node:assert";
import { test } from "node:test";
// @ts-expect-error Bundled test runner resolves extensionless TypeScript source imports.
import { extractCommandVariableIds, normalizeCommandVariables, resolveCommandPrompt } from "../src/commands/variables.ts";
// @ts-expect-error Bundled test runner resolves extensionless TypeScript source imports.
import { formatAugmentOutput } from "../src/services/augment-format.ts";

test("resolves text, select, and multi-select command variables", () => {
	const command: any = {
		id: "variable-test",
		name: "变量测试",
		icon: "?",
		type: "conversation",
		detailPrompt: "面向 {{audience}}，重点关注 {{focus}}。关键词：{{keywords}}。",
		variables: [
			{ id: "audience", label: "读者", type: "text", required: true },
			{ id: "focus", label: "重点", type: "select", required: true },
			{ id: "keywords", label: "关键词", type: "multiselect" },
		],
	};

	assert.deepEqual(extractCommandVariableIds(command.detailPrompt), [
		"audience",
		"focus",
		"keywords",
	]);
	const resolved = resolveCommandPrompt(command, {
		audience: "研究生",
		focus: "证据边界",
		keywords: ["因果", "样本"],
	});
	assert.equal(resolved.undeclared.length, 0);
	assert.equal(resolved.missing.length, 0);
	assert.equal(resolved.prompt, "面向 研究生，重点关注 证据边界。关键词：因果、样本。");
});

test("reports missing and undeclared variables without sending placeholders", () => {
	const command: any = {
		id: "invalid-variable-test",
		name: "错误变量",
		icon: "?",
		type: "augment",
		detailPrompt: "补充 {{scope}}，并说明 {{unknown}}。",
		variables: [{ id: "scope", label: "范围", type: "text", required: true }],
	};
	const resolved = resolveCommandPrompt(command, {});
	assert.deepEqual(resolved.missing, ["scope"]);
	assert.deepEqual(resolved.undeclared, ["unknown"]);
	assert.equal(resolved.prompt, "补充 ，并说明 。");
});

test("wraps long augment output in a Markdown callout", () => {
	const output = "第一段内容。\n\n第二段内容。\n\n第三段内容。";
	assert.match(formatAugmentOutput(output, ""), /^> \[!note\] 增补/);
	assert.equal(formatAugmentOutput("一段完整内容。", ""), "一段完整内容。");
	assert.match(formatAugmentOutput("详细内容。", "请展开详细步骤"), /^> \[!note\] 增补/);
	assert.equal(formatAugmentOutput("```mermaid\nmindmap\n```", ""), "```mermaid\nmindmap\n```");
});

test("normalizes malformed variable option lists", () => {
	const variables = normalizeCommandVariables([
		{
			id: " topic ",
			label: "",
			type: "select",
			options: [{ value: "x", label: "" }, { value: "" } as any],
		},
	] as any);
	assert.equal(variables[0].id, "topic");
	assert.deepEqual(variables[0].options, [{ value: "x", label: "x" }]);
});
