import type { MarkingTag } from './domain/types';

export function withOpacity(color: string, alpha: string): string {
    return color.replace(/[\d.]+\)$/, `${alpha})`);
}

export function getTagHighlightInlineStyle(tag: MarkingTag): string {
    switch (tag.style) {
        case 'highlight':
            return `background-color: ${tag.color}; color: ${tag.textColor};`;
        case 'underline':
            return `background-color: transparent; border-bottom: 2px solid ${withOpacity(tag.color, '0.8')}; color: ${tag.textColor};`;
        case 'dashed':
            return `background-color: transparent; border-bottom: 2px dashed ${withOpacity(tag.color, '0.7')}; color: ${tag.textColor};`;
        case 'semi-transparent':
            return `background-color: ${tag.color}; color: ${tag.textColor}; opacity: 0.6;`;
        default:
            return '';
    }
}

export function applyTagHighlightStyle(element: HTMLElement, tag: MarkingTag): void {
    switch (tag.style) {
        case 'highlight':
            element.style.background = tag.color;
            element.style.color = tag.textColor;
            element.style.opacity = '';
            element.style.borderBottom = '';
            break;
        case 'underline':
            element.style.background = 'transparent';
            element.style.borderBottom = `2px solid ${withOpacity(tag.color, '0.8')}`;
            element.style.color = tag.textColor;
            element.style.opacity = '';
            break;
        case 'dashed':
            element.style.background = 'transparent';
            element.style.borderBottom = `2px dashed ${withOpacity(tag.color, '0.7')}`;
            element.style.color = tag.textColor;
            element.style.opacity = '';
            break;
        case 'semi-transparent':
            element.style.background = tag.color;
            element.style.color = tag.textColor;
            element.style.opacity = '0.6';
            element.style.borderBottom = '';
            break;
    }
}

export function applyTagButtonStyle(element: HTMLElement, tag: MarkingTag): void {
    element.style.background = tag.color;
    element.style.color = tag.textColor !== 'inherit' ? tag.textColor : 'var(--text-normal)';
    element.style.borderColor = 'transparent';
}

export function getTagBorderAccent(tag: MarkingTag): string {
    return withOpacity(tag.color, '0.8');
}
