# e04s01 UAT: Migration and Reconciliation

## Preconditions

1. Build the plugin with `npm run build`.
2. Load the built plugin into a disposable Obsidian test vault.
3. Keep one test note that contains legacy `ai-footnote` annotations.
4. Record the note content before each case.

## Cases

### 1. Migration preview and confirm

1. Open a note with one valid legacy annotation and matching Callout.
2. Run `迁移当前文档到新版标注格式`.
3. Confirm the dialog.
4. Verify that the inline annotation becomes a marker with a stable ID.
5. Verify that one `marking-note-result` block contains the old state, tag, summary, and result.
6. Press `Ctrl+Z` once.
7. Verify that the complete pre-migration note returns.

### 2. Migration cancel

1. Run the migration command on a valid legacy note.
2. Cancel the confirmation dialog.
3. Verify that the note content is byte-for-byte unchanged.

### 3. Migration failure is non-destructive

1. Open a note with a legacy inline annotation but no matching `ai-footnote` Callout.
2. Run the migration command.
3. Verify that the command reports the missing ID.
4. Verify that the note content is unchanged.

### 4. Mixed-format migration

1. Use a note that already contains a new-format result section and one legacy annotation.
2. Run and confirm migration.
3. Verify that the note has one `## Marking Note Results` heading.
4. Verify that both old and new result IDs remain available.

### 5. Explicit reconciliation

1. Add a new inline marker without a result block.
2. Add a result block whose ID has no inline marker.
3. Run `同步当前文档的标注结果块` and confirm.
4. Verify that the missing result block is added and the orphan block is removed.
5. Press `Ctrl+Z` once.
6. Verify that both manual edits and the synchronization change are restored.

## Evidence

Record the Obsidian version, platform, test note name, result of each case, and whether one `Ctrl+Z` restored the entire operation. Keep this UAT open until all five cases pass.
