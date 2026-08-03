import { EMOJI_CATEGORIES } from '../domain/constants';

export function showEmojiGrid(anchor: HTMLElement, onSelect: (emoji: string) => void) {
    const existing = document.querySelector('.mn-emoji-picker');
    if (existing) existing.remove();

    const picker = document.createElement('div');
    picker.addClass('mn-emoji-picker');
    const rect = anchor.getBoundingClientRect();
    picker.style.position = 'fixed';

    const pickerWidth = 320;
    let posX = rect.left - pickerWidth - 6;
    if (posX < 10) posX = rect.right + 6;

    if (posX + pickerWidth + 10 > window.innerWidth) {
        posX = window.innerWidth - pickerWidth - 10;
        if (posX < 10) posX = 10;
    }

    let posY = rect.top;
    if (posY + 400 > window.innerHeight) {
        posY = window.innerHeight - 410;
        if (posY < 10) posY = 10;
    }

    picker.style.left = `${posX}px`;
    picker.style.top = `${posY}px`;
    picker.style.zIndex = '10000';

    const tabsHeader = picker.createEl('div', { cls: 'mn-emoji-tabs' });
    const gridContainer = picker.createEl('div', { cls: 'mn-emoji-grid' });

    let isFirst = true;

    for (const cat of EMOJI_CATEGORIES) {
        const tab = tabsHeader.createEl('div', { cls: 'mn-emoji-tab', text: cat.name });
        if (isFirst) tab.addClass('mn-emoji-tab-active');

        const populateGrid = () => {
            gridContainer.empty();
            for (const emoji of cat.emojis) {
                const cell = gridContainer.createEl('span', { text: emoji, cls: 'mn-emoji-cell' });
                cell.onclick = () => {
                    onSelect(emoji);
                    picker.remove();
                };
            }
        };

        if (isFirst) populateGrid();

        tab.onclick = () => {
            tabsHeader.querySelectorAll('.mn-emoji-tab').forEach((node) => {
                node.removeClass('mn-emoji-tab-active');
            });
            tab.addClass('mn-emoji-tab-active');
            populateGrid();
        };

        isFirst = false;
    }

    document.body.appendChild(picker);
    const closeHandler = (e: MouseEvent) => {
        if (!picker.contains(e.target as Node) && e.target !== anchor) {
            picker.remove();
            document.removeEventListener('click', closeHandler);
        }
    };
    setTimeout(() => document.addEventListener('click', closeHandler), 10);
}
