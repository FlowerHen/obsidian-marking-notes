import type {
	LightningCommand,
	LightningCommandVariable,
	LightningVariableValue,
} from "../domain/types";

const VARIABLE_PATTERN = /\{\{\s*([A-Za-z][A-Za-z0-9_-]*)\s*\}\}/g;

export interface ResolvedCommandPrompt {
	prompt: string;
	missing: string[];
	undeclared: string[];
}

export function extractCommandVariableIds(prompt: string): string[] {
	const ids: string[] = [];
	for (const match of prompt.matchAll(VARIABLE_PATTERN)) {
		if (!ids.includes(match[1])) ids.push(match[1]);
	}
	return ids;
}

export function normalizeCommandVariables(
	variables: LightningCommandVariable[] | undefined,
): LightningCommandVariable[] {
	if (!Array.isArray(variables)) return [];
	return variables.flatMap((variable) => {
		if (!variable || typeof variable.id !== "string") return [];
		const id = variable.id.trim();
		if (!id) return [];
		const options = Array.isArray(variable.options)
			? variable.options.flatMap((option) => {
					if (!option || typeof option.value !== "string" || !option.value.trim()) return [];
					const value = option.value.trim();
					return [{ value, label: option.label?.trim() || value }];
				})
			: undefined;
		return [
			{
				...variable,
				id,
				label: variable.label?.trim() || id,
				options,
			},
		];
	});
}

function valueToText(value: LightningVariableValue | undefined): string {
	if (Array.isArray(value)) return value.filter(Boolean).join("、");
	return typeof value === "string" ? value.trim() : "";
}

export function resolveCommandPrompt(
	command: LightningCommand,
	values: Record<string, LightningVariableValue> = {},
): ResolvedCommandPrompt {
	const variables = normalizeCommandVariables(command.variables);
	const byId = new Map(variables.map((variable) => [variable.id, variable]));
	const referenced = extractCommandVariableIds(command.detailPrompt);
	const undeclared = referenced.filter((id) => !byId.has(id));
	const missing: string[] = [];

	for (const variable of variables) {
		const rawValue = values[variable.id] ?? variable.defaultValue;
		if (variable.required && !valueToText(rawValue)) missing.push(variable.id);
	}

	const prompt = command.detailPrompt.replace(
		VARIABLE_PATTERN,
		(_whole, id: string) => valueToText(values[id] ?? byId.get(id)?.defaultValue),
	);

	return { prompt, missing, undeclared };
}
