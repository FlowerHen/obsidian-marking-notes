# Marking Note

Marking Note is a progressive AI knowledge annotation plugin for Obsidian that uses native Markdown highlights and state machines.

## Version History

### v1.1.5
- **Mobile Keyboard Auto-Focus Fix**:
  - Fundamentally intercepted click propagation inside CodeMirror. Tapping on a capsule/badge no longer falsely triggers the document cursor, effectively preventing the mobile keyboard from popping up and typing errant characters into your note when chatting with AI.
- **Mobile Interface Makeover**:
  - The Popover window on mobile now anchors naturally to the lower-center of the screen, instead of aggressively hugging the top edge where it could obscure status bars or top-menus.
  - Revamped the fullscreen state `.ai-popover-fullscreen` on mobile devices with a 65px safe-area top offset to guarantee zero interference with the Obsidian header/mobile status bar.
  - Substantially increased the tap-target sizes (`padding` and `font-size`) for the control row buttons (Close ✖, Fullscreen ⛶) ensuring effortless thumb usability.

### v1.1.3
- **Mobile Experience Enhancements:**
  - Simplified the popover header by removing the redundant jump button. You can now **double-click** the title area to quickly jump back to the original source text.
- **Improved Emoji / Icon Picker:**
  - Redesigned the emoji picker with categorized tabs for faster icon selection.
  - The picker now intelligently opens to the left to avoid clipping off-screen.
  - Replaced the manual text input for Steward (管家) icons with the new visual emoji picker.

### v1.1.2
- **Reading Mode Logic Overhaul:**
  - Fixed an issue where clicking an annotation in Reading Mode incorrectly brought up the edit menu. Reading Mode now correctly displays a Read-only Viewer for annotations.
- **Popover UI Fixes:**
  - Fixed mobile popovers being placed off-screen or un-draggable. The popover now centers perfectly using JS calculations without CSS transform conflicts.
  - Enabled external click-to-close behavior on desktop when the pin is disabled, bringing it in line with standard dropdown behavior.
  - Introduced the fullscreen expansion button `⛶`.
  - Replaced raw ID strings in the popover header with a human-readable truncated summary of the note.

### v1.1.1
- Cleaned up settings and generalized AI provider interface.
- Resolved styling conflicts and initialized the AI pipeline.
- Improved the floating menu interactions and trigger mechanics.

### v1.1.0
- Base refactoring release establishing the Popover Editor paradigm.
- Implemented core state machine (`0` = pending, `1` = annotated, `2` = review, `3` = archived).
- Introduced AI footnote sync binding (in-text highlight to bottom-of-document callout block).
- Added multi-steward architecture for different contexts (e.g. translation, summarization).
