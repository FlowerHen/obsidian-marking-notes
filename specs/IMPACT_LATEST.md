# Impact Analysis: e04s01

## Target

`e04s01` changes the annotation data contract used by:

- `src/state.ts`: annotation states, node shape, and Markdown parsing.
- `src/storage.ts`: result block discovery, content extraction, and deletion ranges.
- `src/repository/annotation-repository.ts`: annotation mutations and serialization.
- `main.ts`: plugin commands, reading-mode lookup, and document orchestration.

The current implementation stores inline annotations and `ai-footnote` Callouts. The story replaces that contract with stable inline IDs and human-readable fenced result blocks, plus manual current-document migration.

## Dependents (8 direct areas)

- `main.ts`: clears annotations, consolidates notes, opens reading popovers, and resolves result content.
- `src/cm6.ts`: parses nodes and builds editor decorations and capsule click targets.
- `src/renderers/reading-mode-renderer.ts`: parses rendered marks and inserts reading-mode capsules.
- `src/sidebar.ts`: lists, filters, updates, deletes, merges, and jumps to annotation nodes.
- `src/ui.ts`: reads and updates current result content, summaries, and deletion ranges.
- `src/services/annotation-service.ts`: creates pending nodes and applies AI results.
- `src/services/merge-service.ts`: reads annotation snippets and appends merged results.
- `src/repository/annotation-repository.ts`: centralizes mutations and now prefers the new result-block contract with legacy Callout fallback.

## Affected Stories

- `e04s01`: primary owner of the new format, migration, synchronization, and rollback.
- `e01s01`: operation surfaces and popovers must open and render the new result blocks.
- `e02s01`: persistent conversation results must update the new result block and survive reload.
- `e03s01`: rewrite must remain independent from result-block mutation; link and clipboard flows must not corrupt selection ranges.
- `e05s01`: state, tag, delete, filter, and management views must use the new node and result-block fields.

## Test Coverage

- `tests/annotation-format.test.ts`: five pure-format tests cover migration, tags, result parsing, updates, inline markers, append, and delete.
- `tests/annotation-repository.test.ts`: two bundled integration tests cover creation/application and deletion of new-format annotations.
- Existing verification is also the build command and manual Obsidian checks documented in `PLAN.md`.
- Gap: migration confirmation, partial parse failure, and one-step Ctrl+Z behavior are not automated.
- Gap: manual movement or deletion of result blocks has no synchronization test.
- Gap: desktop and mobile reading-mode rendering has no automated UI coverage.

## Existing Risk Signals

- The working tree contains a broad uncommitted architecture migration and generated `main.js` changes.
- LSP currently reports type errors in `src/ai.ts`, `src/services/merge-service.ts`, and `src/sidebar.ts`.
- The current parser and repository use the legacy `ai-footnote` Callout contract.
- `main.ts`, `src/ui.ts`, and `src/sidebar.ts` remain large orchestration modules, increasing migration coordination cost.

## Risk: High

The change replaces a shared API and serialization contract with partial automated coverage. More than ten call sites depend on parsing, result lookup, state mutation, or result ranges, and a format mistake can make existing annotations invisible or destructive to user notes.

## Recommended Action

Keep the parser and repository tests as the gate for the shared contract. Complete migration preview/cancel/failure tests and one-step Ctrl+Z validation in a controlled Obsidian test vault before enabling the UI stories. Do not proceed to broad UI changes until the new format can round-trip, cancel, fail without partial writes, and restore through one Ctrl+Z.
