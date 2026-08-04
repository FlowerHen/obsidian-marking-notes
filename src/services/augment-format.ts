export function formatAugmentOutput(output: string, instruction: string): string {
	const normalized = output.trim();
	if (!normalized || normalized.includes("> [!note]")) return normalized;
	if (normalized.includes("```") || normalized.startsWith("> [!")) return normalized;

	const paragraphCount = normalized
		.split(/\n\s*\n/)
		.map((paragraph) => paragraph.trim())
		.filter(Boolean).length;
	const requestsDetail = /详细|展开|完整说明|逐一|步骤|多角度|深入/.test(instruction);
	if (paragraphCount <= 2 && !requestsDetail) return normalized;

	return ["> [!note] 增补", ...normalized.split("\n").map((line) => `> ${line}`)].join("\n");
}
