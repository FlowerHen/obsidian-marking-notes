# e01s01 UAT: Unified Action Surface

## Preconditions

1. Reload the `marking-note` plugin in a disposable Obsidian Vault.
2. Open a Markdown note in edit mode.
3. Prepare one selection near the center, one near the top edge, and one near the right edge.
4. Use a Vault with at least one active steward command and one empty-command steward if available.

## Desktop Cases

### 1. Four operations

Select text and verify that one selection-adjacent action bar contains exactly:

- 对话
- 改写
- 增补
- 链接

Verify that the bar remains inside the viewport for all three selection positions.

### 2. Native link flow

Select text, click `链接`, and verify that Obsidian's native link command opens with the selection preserved. Cancel the native dialog and verify that the selection remains available.

### 3. Empty command state

Open an operation with no commands. Verify the empty state includes `打开管家设置` and that it opens Obsidian settings.

## Mobile / Narrow Viewport Cases

Use an Obsidian mobile device or a narrow touch viewport.

1. Select text and verify that the four operations appear in a bottom action bar.
2. Verify each button has a touch target of at least 44px.
3. Open the keyboard and verify the action bar remains above the visible keyboard and safe-area inset.
4. Rotate or resize the viewport and verify the action bar remains visible.
5. Open `改写` and verify its command list opens above the bottom bar.

## Evidence

Record the Obsidian version, platform, viewport size, plugin reload time, and pass/fail result for every case. Keep task 5 open until desktop and mobile cases pass in a real Obsidian environment.
