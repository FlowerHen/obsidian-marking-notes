import { strict as assert } from "node:assert";
import { test } from "node:test";
// @ts-expect-error Node 24 type-stripping test runner resolves TypeScript source imports.
import * as annotationFormat from "../src/domain/annotation-format.ts";
const {
	appendResultBlock,
	deleteResultBlock,
	migrateLegacyDocument,
	parseInlineMarkers,
	parseResultBlocks,
	reconcileDocument,
	updateResultBlock,
} = annotationFormat;

test("migrates one legacy annotation into a stable result block", () => {
	const legacy = [
		"正文前 ==重要概念==[^[1][#ABC123] 核心概念]",
		"",
		"> [!ai-footnote]- #ABC123",
		"> 这是 AI 结果。",
		"",
		"正文后",
	].join("\n");

	const result = migrateLegacyDocument(legacy);

	assert.equal(result.skipped.length, 0);
	assert.equal(result.migrated, 1);
	assert.match(result.text, /==重要概念==<!-- marking-note:id=ABC123 -->/);
	assert.match(result.text, /```marking-note-result/);
	assert.match(result.text, /id: ABC123/);
	assert.match(result.text, /state: annotated/);
	assert.match(result.text, /summary: 核心概念/);
	assert.match(result.text, /这是 AI 结果。/);
	assert.match(result.text, /正文前/);
	assert.match(result.text, /正文后/);
});

test("rejects partial migration when a legacy result is missing", () => {
	const legacy = "正文 ==缺失结果==[^[1][#MISSING001] 摘要]";

	const result = migrateLegacyDocument(legacy);

	assert.equal(result.migrated, 0);
	assert.deepEqual(result.skipped, ["MISSING001"]);
	assert.equal(result.text, legacy);
});

test("preserves a legacy tag in the result block", () => {
	const legacy = [
		"==带标签==[^[1][#TAG001][concept] 标签摘要]",
		"",
		"> [!ai-footnote]- #TAG001",
		"> 标签结果。",
	].join("\n");

	const result = migrateLegacyDocument(legacy);

	assert.equal(result.migrated, 1);
	assert.match(result.text, /tag: concept/);
	assert.match(result.text, /summary: 标签摘要/);
});

test("reuses an existing result heading during mixed-format migration", () => {
	const legacy = [
		"==旧标注==[^[1][#OLD001] 旧摘要]",
		"",
		"> [!ai-footnote]- #OLD001",
		"> 旧结果。",
		"",
		"## Marking Note Results",
		"",
		"```marking-note-result",
		"id: EXIST001",
		"state: reviewed",
		"tag: ",
		"summary: ",
		"---",
		"已有结果。",
		"```",
	].join("\n");

	const result = migrateLegacyDocument(legacy);

	assert.equal(result.migrated, 1);
	assert.equal((result.text.match(/^## Marking Note Results$/gm) || []).length, 1);
	assert.match(result.text, /id: OLD001/);
	assert.match(result.text, /id: EXIST001/);
});

test("parses and updates a human-readable result block by stable ID", () => {
	const document = [
		"正文",
		"",
		"```marking-note-result",
		"id: ABC123",
		"state: annotated",
		"tag: concept",
		"summary: 核心概念",
		"---",
		"旧结果。",
		"```",
		"",
		"其他内容",
	].join("\n");

	const blocks = parseResultBlocks(document);

	assert.equal(blocks.length, 1);
	assert.equal(blocks[0].id, "ABC123");
	assert.equal(blocks[0].state, "annotated");
	assert.equal(blocks[0].tagId, "concept");
	assert.equal(blocks[0].summary, "核心概念");
	assert.equal(blocks[0].content, "旧结果。");

	const updated = updateResultBlock(document, "ABC123", "新结果。");

	assert.match(updated, /新结果。/);
	assert.doesNotMatch(updated, /旧结果。/);
	assert.match(updated, /其他内容/);
});

test("hydrates a new inline marker from its result block", () => {
	const document = [
		"==概念==<!-- marking-note:id=ABC123 -->",
		"",
		"```marking-note-result",
		"id: ABC123",
		"state: reviewed",
		"tag: concept",
		"summary: 已复核概念",
		"---",
		"结果内容。",
		"```",
	].join("\n");

	const marker = parseInlineMarkers(document)[0];

	assert.ok(marker);
	assert.equal(marker.id, "ABC123");
	assert.equal(marker.state, "reviewed");
	assert.equal(marker.tagId, "concept");
	assert.equal(marker.summary, "已复核概念");
});

test("parses generated hash-prefixed annotation IDs", () => {
	const document = [
		"==真实标注==<!-- marking-note:id=#AXAB1201 -->",
		"",
		"```marking-note-result",
		"id: #AXAB1201",
		"state: unprocessed",
		"tag: ",
		"summary: ",
		"---",
		"",
		"```",
	].join("\n");

	const marker = parseInlineMarkers(document)[0];

	assert.ok(marker);
	assert.equal(marker.id, "#AXAB1201");
});

test("reconciles missing and orphaned result blocks by stable ID", () => {
	const document = [
		"==保留标注==<!-- marking-note:id=#KEEP001 -->",
		"==缺失结果==<!-- marking-note:id=#MISSING001 -->",
		"",
		"## Marking Note Results",
		"",
		"```marking-note-result",
		"id: #KEEP001",
		"state: annotated",
		"tag: ",
		"summary: ",
		"---",
		"已有结果。",
		"```",
		"",
		"```marking-note-result",
		"id: #ORPHAN001",
		"state: reviewed",
		"tag: ",
		"summary: ",
		"---",
		"孤立结果。",
		"```",
	].join("\n");

	const result = reconcileDocument(document);

	assert.deepEqual(result.addedResultIds, ["#MISSING001"]);
	assert.deepEqual(result.removedOrphanResultIds, ["#ORPHAN001"]);
	assert.match(result.text, /id: #MISSING001/);
	assert.doesNotMatch(result.text, /#ORPHAN001/);
});

test("appends and deletes one result block without changing正文", () => {
	const block = {
		id: "NEW001",
		state: "unprocessed",
		tagId: "",
		summary: "",
		content: "待生成结果。",
	};

	const appended = appendResultBlock("正文", block);

	assert.match(appended, /正文/);
	assert.match(appended, /## Marking Note Results/);
	assert.match(appended, /id: NEW001/);

	const deleted = deleteResultBlock(appended, "NEW001");

	assert.equal(deleted.trim(), "正文\n\n## Marking Note Results");
	assert.doesNotMatch(deleted, /NEW001/);
});
