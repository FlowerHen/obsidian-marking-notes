export interface ModelProvider {
	id: string;
	name: string;
	baseURL: string;
	apiKey: string;
	modelId: string;
}

export type HighlightStyle =
	| "highlight"
	| "underline"
	| "dashed"
	| "semi-transparent";

export interface MarkingTag {
	id: string;
	name: string;
	emoji: string;
	color: string;
	textColor: string;
	style: HighlightStyle;
}

export type LightningCommandType =
	| "conversation"
	| "augment"
	| "annotated"
	| "default-summary"
	| "inline-modify";

export type LightningVariableType = "text" | "select" | "multiselect";

export interface LightningVariableOption {
	value: string;
	label: string;
}

export interface LightningCommandVariable {
	id: string;
	label: string;
	type: LightningVariableType;
	required?: boolean;
	placeholder?: string;
	defaultValue?: string | string[];
	options?: LightningVariableOption[];
}

export type LightningVariableValue = string | string[];

export interface LightningCommand {
	id: string;
	name: string;
	icon: string;
	detailPrompt: string;
	type: LightningCommandType;
	enabled?: boolean;
	enableWebSearch?: boolean;
	contextMode?: "full" | "writingOnly" | "none";
	tagId?: string;
	contextLength?: number;
	temperature?: number;
	topP?: number;
	thinkingBudget?: number;
	footnoteLength?: number;
	language?: string;
	variables?: LightningCommandVariable[];
}

export interface StewardConfig {
	id: string;
	name: string;
	icon: string;
	systemPrompt: string;
	writingStyle: string;
	language?: string;
	contextLength: number;
	temperature: number;
	topP: number;
	thinkingBudget: number;
	footnoteLength: number;
	boundModelProviderId: string;
	commands: LightningCommand[];
	augmentCommands?: LightningCommand[];
	legacyCommands?: LightningCommand[];
}

export interface InlineStewardConfig {
	boundModelProviderId: string;
	contextLength: number;
	temperature: number;
	commands: LightningCommand[];
}

export interface MarkingNoteSettings {
	modelProviders: ModelProvider[];
	defaultProviderId: string;
	tavilyApiKey: string;
	stewards: StewardConfig[];
	activeStewardId: string;
	inlineSteward: InlineStewardConfig;
	tags: MarkingTag[];
	enableFloatingMenu: boolean;
	enableInlineModification: boolean;
	enableDebugMode: boolean;
	enableDeveloperMode: boolean;
	defaultSummarySystemPromptTemplate: string;
	annotationSystemPromptTemplate: string;
	augmentSystemPromptTemplate: string;
	inlineRewriteSystemPromptTemplate: string;
}
