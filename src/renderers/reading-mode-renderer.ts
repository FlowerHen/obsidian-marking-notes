import type { MarkingTag } from '../domain/types';
import { applyTagHighlightStyle } from '../tag-styles';

interface RenderReadingModeAnnotationsInput {
    container: HTMLElement;
    tags: MarkingTag[];
    onOpenPopover: (input: {
        nodeId: string;
        summary: string;
        state: string;
        tagId: string;
        anchorX: number;
        anchorY: number;
    }) => void;
}

export function renderReadingModeAnnotations(input: RenderReadingModeAnnotationsInput): void {
    const marks = input.container.querySelectorAll('mark');
    marks.forEach(mark => {
        mark.classList.add('marking-highlight-region');
        mark.style.cursor = 'pointer';

        let state = '0';
        let id = '';
        let tagId = '';
        let summary = '';
        let hasFootprint = false;

        let currentNode = mark.nextSibling;
        let buffer = '';
        const nodesToRemove: Node[] = [];
        let foundMatch: RegExpExecArray | null = null;

        while (currentNode && nodesToRemove.length < 15 && buffer.length < 300) {
            nodesToRemove.push(currentNode);
            buffer += currentNode.textContent || '';

            const match = /^\s*(?:\[\^\[|\[)([0-3])(?:\]\s*\[|\s*\[)\s*(#[a-zA-Z0-9_-]+)\s*\](?:\[([a-zA-Z0-9_-]*)\])?([^\]]*)\]([\s\S]*)/.exec(buffer);
            if (match) {
                foundMatch = match;
                break;
            }

            const trimmed = buffer.trimLeft();
            if (!trimmed.startsWith('[') && !trimmed.startsWith('^')) {
                break;
            }
            currentNode = currentNode.nextSibling;
        }

        if (foundMatch) {
            hasFootprint = true;
            state = foundMatch[1];
            id = foundMatch[2];
            tagId = foundMatch[3] || '';
            summary = (foundMatch[4] || '').trim();

            const parent = mark.parentNode;
            if (parent) {
                const insertBeforeNode = nodesToRemove[nodesToRemove.length - 1]?.nextSibling ?? null;
                nodesToRemove.forEach(node => {
                    parent.removeChild(node);
                });
                if (foundMatch[5]) {
                    parent.insertBefore(document.createTextNode(foundMatch[5]), insertBeforeNode);
                }
            }
        }

        if (!hasFootprint) {
            mark.classList.add('mark-state-0');
            return;
        }

        mark.classList.add(`mark-state-${state}`);
        if (tagId) {
            const tag = input.tags.find(candidate => candidate.id === tagId);
            if (tag) {
                mark.classList.add('marking-tagged');
                applyTagHighlightStyle(mark as HTMLElement, tag);
            }
        }

        const badge = document.createElement('span');
        badge.addClass('marking-capsule', `marking-capsule-${state}`);
        if (tagId) {
            badge.dataset.tagId = tagId;
        }

        const emoji = input.tags.find(candidate => candidate.id === tagId)?.emoji
            || (state === '0' ? '🪄' : state === '1' ? '⚡' : state === '2' ? '👤' : '📦');
        const iconSpan = document.createElement('span');
        iconSpan.innerText = emoji;
        badge.appendChild(iconSpan);

        if (summary) {
            const summarySpan = document.createElement('span');
            summarySpan.innerText = summary;
            summarySpan.style.marginLeft = '3px';
            badge.appendChild(summarySpan);
        }

        mark.parentNode?.insertBefore(badge, mark.nextSibling);

        const openPopover = (target: HTMLElement) => {
            const rect = target.getBoundingClientRect();
            input.onOpenPopover({
                nodeId: id,
                summary,
                state,
                tagId,
                anchorX: rect.left,
                anchorY: rect.bottom + 6,
            });
        };

        badge.addEventListener('click', event => {
            event.preventDefault();
            event.stopPropagation();
            openPopover(badge);
        });

        mark.addEventListener('click', event => {
            if (state !== '0') {
                event.preventDefault();
                event.stopPropagation();
                openPopover(mark as HTMLElement);
            }
        });
    });
}
