export function generateAnnotationId(): string {
    const suffix = Date.now().toString(36).slice(-4).toUpperCase();
    const sequence = Math.floor(Math.random() * 100).toString().padStart(2, '0');
    return `#AX${suffix}${sequence}`;
}

export function generateMergeId(): string {
    const suffix = Date.now().toString(36).slice(-4).toUpperCase();
    const sequence = Math.floor(Math.random() * 100).toString().padStart(2, '0');
    return `合并-${suffix}${sequence}`;
}
