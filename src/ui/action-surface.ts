export interface ActionSurfacePosition {
	left: number;
	top: number;
}

export function getDesktopActionPosition(
	anchorX: number,
	anchorY: number,
	menuWidth: number,
	menuHeight: number,
	viewportWidth: number,
	viewportHeight: number,
	margin = 8,
): ActionSurfacePosition {
	const left = Math.min(
		Math.max(anchorX, margin),
		viewportWidth - menuWidth - margin,
	);
	let top = anchorY - menuHeight - margin;

	if (top < margin) {
		top = Math.min(anchorY + margin, viewportHeight - menuHeight - margin);
	}

	return {
		left: Math.max(margin, left),
		top: Math.max(margin, top),
	};
}

export function getMobileActionBottom(
	layoutHeight: number,
	viewportTop: number,
	viewportHeight: number,
	margin = 8,
): number {
	const visibleBottom = viewportTop + viewportHeight;
	return Math.max(margin, layoutHeight - visibleBottom + margin);
}
