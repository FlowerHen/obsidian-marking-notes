export function setEditorValuePreservingViewport(
	editor: any,
	text: string,
): void {
	const cursor = editor.getCursor?.();
	const scrollInfo = editor.getScrollInfo?.();
	editor.setValue(text);

	if (cursor && editor.setCursor) editor.setCursor(cursor);
	restoreEditorScroll(editor, scrollInfo);
}

export function dispatchEditorChangePreservingViewport(
	view: any,
	transaction: Record<string, unknown>,
): void {
	const scrollDom = view.scrollDOM as HTMLElement | undefined;
	const scrollTop = scrollDom?.scrollTop ?? 0;
	const scrollLeft = scrollDom?.scrollLeft ?? 0;
	view.dispatch(transaction);

	const restore = () => {
		if (!scrollDom) return;
		scrollDom.scrollTop = scrollTop;
		scrollDom.scrollLeft = scrollLeft;
	};
	if (typeof requestAnimationFrame === "function")
		requestAnimationFrame(restore);
	else setTimeout(restore, 0);
}

function restoreEditorScroll(editor: any, scrollInfo: any): void {
	if (!scrollInfo || typeof editor.scrollTo !== "function") return;
	const restore = () =>
		editor.scrollTo(scrollInfo.left || 0, scrollInfo.top || 0);
	if (typeof requestAnimationFrame === "function")
		requestAnimationFrame(restore);
	else setTimeout(restore, 0);
}
