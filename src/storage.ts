import type { Editor, EditorPosition } from "obsidian";
import { generateMergeId } from "./domain/ids";

export class StorageEngine {
	static readonly FOOTNOTE_CALLOUT = "ai-footnote";
	static readonly MERGED_CALLOUT = "ai-merged";

	/** Separator line before the AI Data Vault */
	static readonly VAULT_SEPARATOR =
		"\n\n---\n%%  AI Data Vault — 以下为 AI 注入的数据承载区，请勿手动修改结构  %%\n";

	/**
	 * Appends a new callout to the bottom of the editor's document.
	 * Ensures the vault separator exists.
	 */
	static appendCallout(editor: Editor, id: string, content: string) {
		const doc = editor.getDoc();
		const fullText = doc.getValue();

		// Ensure the vault separator exists
		if (!fullText.includes("AI Data Vault")) {
			const lastLineIndex = doc.lineCount() - 1;
			const lastLineLength = doc.getLine(lastLineIndex).length;
			const pos: EditorPosition = { line: lastLineIndex, ch: lastLineLength };
			editor.replaceRange(StorageEngine.VAULT_SEPARATOR, pos);
		}

		// Now append the callout at the very bottom
		const lastLineIndex = doc.lineCount() - 1;
		const lastLineLength = doc.getLine(lastLineIndex).length;
		const pos: EditorPosition = { line: lastLineIndex, ch: lastLineLength };

		const calloutText = `\n\n> [!${StorageEngine.FOOTNOTE_CALLOUT}]- ${id}\n${content
			.split("\n")
			.map((line) => `> ${line}`)
			.join("\n")}\n`;

		editor.replaceRange(calloutText, pos);
	}

	/**
	 * Finds a callout by ID in the text and returns its character range.
	 */
	static findCalloutRange(
		text: string,
		id: string,
	): { from: number; to: number } | null {
		const lines = text.split("\n");
		let currentOffset = 0;

		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];
			if (
				line.startsWith(`> [!${StorageEngine.FOOTNOTE_CALLOUT}]- ${id}`) ||
				line.startsWith(`> [!${StorageEngine.MERGED_CALLOUT}]- ${id}`)
			) {
				const startOffset = currentOffset;
				// find end: continue while lines start with >
				let j = i + 1;
				while (j < lines.length && lines[j].startsWith(">")) {
					j++;
				}
				const endLine = j - 1;

				let endOffset = currentOffset;
				for (let k = i; k <= endLine; k++) {
					endOffset += lines[k].length + 1; // +1 for newline
				}

				return { from: startOffset, to: endOffset - 1 };
			}
			currentOffset += line.length + 1;
		}

		return null;
	}

	/**
	 * Gets the content of a specific callout by ID.
	 */
	static getCalloutContent(text: string, id: string): string | null {
		const range = StorageEngine.findCalloutRange(text, id);
		if (!range) return null;

		const raw = text.slice(range.from, range.to);
		const lines = raw.split("\n");
		return lines
			.slice(1)
			.filter((l) => l.startsWith("> "))
			.map((l) => l.slice(2))
			.join("\n")
			.trim();
	}

	/**
	 * Generates a unique ID for a merged callout.
	 */
	static generateMergeId(): string {
		return generateMergeId();
	}

	/**
	 * Merges multiple annotation callouts into a single combined callout.
	 *
	 * @param id - The ID for the merged callout (e.g., "合并-AX123456")
	 * @param nodes - Array of MarkingNode objects with their callout contents
	 * @returns The formatted callout string ready to append
	 */
	static mergeCallouts(
		id: string,
		nodes: Array<{
			node: { text: string; tagId?: string; summary?: string };
			content: string;
		}>,
	): string {
		const sections: string[] = [];

		for (const { node, content } of nodes) {
			const tagLabel = node.tagId ? ` [${node.tagId}]` : "";
			const textPreview =
				node.text.length > 40 ? node.text.slice(0, 40) + "..." : node.text;
			const header = `## 📌 ${textPreview}${tagLabel}`;

			sections.push(header);
			sections.push("");

			// Original text as quote
			sections.push(`> 📝 **原文**: ${node.text}`);
			sections.push("");

			// AI content
			if (content) {
				sections.push(content);
			} else if (node.summary) {
				sections.push(node.summary);
			}

			sections.push("");
			sections.push("---");
			sections.push("");
		}

		const mergedContent = sections.join("\n").trim();
		return `\n\n> [!${StorageEngine.MERGED_CALLOUT}]- ${id}\n${mergedContent
			.split("\n")
			.map((line) => `> ${line}`)
			.join("\n")}\n`;
	}
}
