import { strict as assert } from "node:assert";
import { test } from "node:test";
// @ts-expect-error The bundled test runner resolves TypeScript source imports.
import * as repositoryModule from "../src/repository/annotation-repository.ts";

const { annotationRepository } = repositoryModule;

test("repository creates and applies a new-format annotation", () => {
	const pending = annotationRepository.createPendingAnnotation({
		text: "正文",
		selection: "概念",
		selectionFrom: 0,
		selectionTo: 2,
		id: "NEW001",
	});

	const applied = annotationRepository.applyAnnotationResult({
		text: pending.text,
		id: "NEW001",
		state: "1",
		summary: "核心概念",
		richText: "结果内容。",
	});

	assert.match(applied.text, /==概念==<!-- marking-note:id=NEW001 -->/);
	assert.match(applied.text, /```marking-note-result/);
	assert.match(applied.text, /state: annotated/);
	assert.match(applied.text, /summary: 核心概念/);
	assert.match(applied.text, /结果内容。/);
});

test("repository deletes the marker and its result block together", () => {
	const pending = annotationRepository.createPendingAnnotation({
		text: "正文",
		selection: "概念",
		selectionFrom: 0,
		selectionTo: 2,
		id: "DEL001",
	});

	const deleted = annotationRepository.deleteAnnotation(pending.text, "DEL001");

	assert.equal(deleted.text.trim(), "概念\n\n## Marking Note Results");
	assert.doesNotMatch(deleted.text, /DEL001/);
});
