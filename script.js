(function () {
    'use strict';

    const MOBILE_QUERY = '(max-width: 31.25rem)';
    const RESIZE_DEBOUNCE_MS = 100;
    const HIGHLIGHT_MS = 2000;
    const TOOLTIP_DISMISS_MS = 3000;
    const SWIPE_THRESHOLD_PX = 50;

    const selectors = {
        activePanel: '.panel.active',
        deviceMessage: '.device-specific-message',
        nav: 'nav',
        navLink: 'nav a[data-panel]',
        panel: '.panel',
        panelsContainer: '.panels-container',
        previewLink: 'a[data-preview="true"]',
        tab: '.terminal-tab',
        tabButton: '.tab-button',
        tabGroup: '.terminal-tabs',
        terminalHeader: '.terminal-header',
        terminalWindow: '.terminal-window',
        themeToggle: '#toggle-theme',
    };

    const state = {
        activePanel: null,
        containerRect: null,
        drag: {
            frame: 0,
            isActive: false,
            panel: null,
            pointerX: 0,
            pointerY: 0,
            startX: 0,
            startY: 0,
            startPanelX: 0,
            startPanelY: 0,
        },
        isMobile: window.matchMedia(MOBILE_QUERY).matches,
        navHeight: 0,
        panelBounds: new Map(),
        previewPanel: null,
        previewSourcePanel: null,
        resizeTimeout: 0,
        zIndexMax: 0,
    };

    function queryRequired(selector, root = document) {
        const element = root.querySelector(selector);
        if (element) return element;

        throw new Error(`Missing required element: ${selector}`);
    }

    function queryAll(selector, root = document) {
        return Array.from(root.querySelectorAll(selector));
    }

    function getPanels() {
        return queryAll(selectors.panel);
    }

    function getInteractivePanels() {
        return getPanels().filter((panel) => panel.id !== 'preview');
    }

    function getPointer(event) {
        return event.touches?.[0] ?? event.changedTouches?.[0] ?? event;
    }

    function getPanelZIndex(panel) {
        const styleValue = panel.style.zIndex || getComputedStyle(panel).zIndex;
        const zIndex = Number.parseInt(styleValue, 10);

        return Number.isFinite(zIndex) ? zIndex : 0;
    }

    function refreshZIndexMax() {
        state.zIndexMax = getPanels().reduce((max, panel) => {
            return Math.max(max, getPanelZIndex(panel));
        }, 0);
    }

    function getPanelBounds(panel) {
        const panelRect = panel.getBoundingClientRect();
        const containerRect = state.containerRect;

        // Dragging writes transforms relative to the panels container. Keeping bounds in the same
        // coordinate system avoids subtle offsets when the fixed nav changes height on mobile.
        return {
            maxX: Math.max(0, containerRect.width - panelRect.width),
            maxY: Math.max(0, containerRect.height - panelRect.height),
            minX: 0,
            minY: 0,
        };
    }

    function refreshLayoutMeasurements() {
        const container = queryRequired(selectors.panelsContainer);
        const nav = queryRequired(selectors.nav);

        state.containerRect = container.getBoundingClientRect();
        state.navHeight = nav.offsetHeight;
        state.isMobile = window.matchMedia(MOBILE_QUERY).matches;
        state.panelBounds.clear();

        for (const panel of getInteractivePanels()) {
            state.panelBounds.set(panel, getPanelBounds(panel));
        }
    }

    function bindLayoutMeasurements() {
        refreshLayoutMeasurements();

        window.addEventListener('resize', () => {
            window.clearTimeout(state.resizeTimeout);
            state.resizeTimeout = window.setTimeout(() => {
                refreshLayoutMeasurements();
            }, RESIZE_DEBOUNCE_MS);
        });
    }

    function setActivePanel(panel) {
        for (const candidate of getPanels()) {
            candidate.classList.toggle('active', candidate === panel);
        }

        state.activePanel = panel;

        if (panel.id && panel.id !== 'preview') {
            updateNavLinks(panel.id);
        }
    }

    function focusPanel(panel) {
        if (!panel) return;

        if (state.isMobile) {
            setActivePanel(panel);
            scrollPanelIntoMobileView(panel);
            return;
        }

        if (!panel.classList.contains('active')) {
            setActivePanel(panel);
        }

        if (panel.id !== 'preview') {
            state.zIndexMax += 1;
            panel.style.zIndex = String(state.zIndexMax);
        }
    }

    function scrollPanelIntoMobileView(panel) {
        const container = queryRequired(selectors.panelsContainer);
        const top = panel.offsetTop - state.navHeight / 2;

        // The nav is fixed, so the scroll target is biased upward to keep the panel title visible.
        // Mobile layout normally scrolls the page, but retaining the container scroll keeps the
        // behavior correct if the CSS later gives the panel container its own scrollport.
        container.scrollTo({
            behavior: 'smooth',
            top,
        });
        window.scrollTo({
            behavior: 'smooth',
            top,
        });
    }

    function updateNavLinks(activeId) {
        for (const link of queryAll(selectors.navLink)) {
            link.classList.toggle('active-link', link.dataset.panel === activeId);
        }
    }

    function bindNavLinks() {
        for (const link of queryAll(selectors.navLink)) {
            link.addEventListener('click', (event) => {
                event.preventDefault();

                const targetId = link.dataset.panel;
                const targetPanel = document.getElementById(targetId);
                if (!targetPanel) return;

                focusPanel(targetPanel);
            });
        }
    }

    function bindReferenceLinks() {
        const referenceToPanel = new Map();

        for (const reference of queryAll('sup[id^="ref-"]')) {
            const referenceNumber = reference.id.slice('ref-'.length);
            const panel = reference.closest(selectors.panel);
            if (!panel) continue;

            referenceToPanel.set(referenceNumber, panel.id);
            reference.addEventListener('click', (event) => {
                event.preventDefault();

                const backReference = document.getElementById(`back-ref-${referenceNumber}`);
                activateReference('refs', backReference);
            });
        }

        const refsPanel = document.getElementById('refs');
        if (!refsPanel) return;

        for (const backReference of queryAll('sup[id^="back-ref-"]', refsPanel)) {
            backReference.addEventListener('click', (event) => {
                event.preventDefault();

                const referenceNumber = backReference.id.slice('back-ref-'.length);
                const targetId = referenceToPanel.get(referenceNumber);
                const originalReference = document.getElementById(`ref-${referenceNumber}`);

                activateReference(targetId, originalReference);
            });
        }
    }

    function activateReference(targetId, highlightElement) {
        const targetPanel = document.getElementById(targetId);
        if (!targetPanel) return;

        focusPanel(targetPanel);
        highlightTemporary(highlightElement);

        if (state.isMobile && highlightElement) {
            window.setTimeout(() => {
                highlightElement.scrollIntoView({
                    behavior: 'smooth',
                    block: 'center',
                });
            }, RESIZE_DEBOUNCE_MS);
        }
    }

    function highlightTemporary(element) {
        if (!element) return;

        element.classList.add('highlight');
        window.setTimeout(() => {
            element.classList.remove('highlight');
        }, HIGHLIGHT_MS);
    }

    function bindDragging() {
        if (state.isMobile) return;

        document.addEventListener('mousedown', startDrag);
        document.addEventListener('mousemove', queueDrag);
        document.addEventListener('mouseup', stopDrag);
        document.addEventListener('mouseleave', stopDrag);
        document.addEventListener('touchstart', startDrag, { passive: false });
        document.addEventListener('touchmove', queueDrag, { passive: false });
        document.addEventListener('touchend', stopDrag);
        document.addEventListener('touchcancel', stopDrag);
    }

    function startDrag(event) {
        const pointer = getPointer(event);
        const panel = pointer.target.closest(selectors.panel);
        const header = pointer.target.closest(selectors.terminalHeader);

        if (!panel) return;
        if (!header) return;
        if (panel.id === 'preview') return;

        if (!panel.classList.contains('active')) {
            focusPanel(panel);
            return;
        }

        const panelRect = panel.getBoundingClientRect();

        state.drag.isActive = true;
        state.drag.panel = panel;
        state.drag.pointerX = pointer.clientX;
        state.drag.pointerY = pointer.clientY;
        state.drag.startX = pointer.clientX;
        state.drag.startY = pointer.clientY;
        state.drag.startPanelX = panelRect.left - state.containerRect.left;
        state.drag.startPanelY = panelRect.top - state.containerRect.top;

        panel.classList.add('dragging');
    }

    function queueDrag(event) {
        if (!state.drag.isActive) return;

        event.preventDefault();

        const pointer = getPointer(event);
        state.drag.pointerX = pointer.clientX;
        state.drag.pointerY = pointer.clientY;

        // Pointer events can arrive faster than the display refresh rate. One animation frame keeps
        // dragging smooth while preventing redundant style writes.
        if (state.drag.frame === 0) {
            state.drag.frame = window.requestAnimationFrame(applyDrag);
        }
    }

    function applyDrag() {
        state.drag.frame = 0;

        const panel = state.drag.panel;
        if (!state.drag.isActive || !panel) return;

        const deltaX = state.drag.pointerX - state.drag.startX;
        const deltaY = state.drag.pointerY - state.drag.startY;
        const x = state.drag.startPanelX + deltaX;
        const y = state.drag.startPanelY + deltaY;
        const bounds = state.panelBounds.get(panel);

        if (bounds) {
            setPanelPosition(panel, x, y, bounds);
        }
    }

    function stopDrag() {
        if (!state.drag.isActive) return;

        if (state.drag.frame !== 0) {
            window.cancelAnimationFrame(state.drag.frame);
        }

        if (state.drag.panel) {
            state.drag.panel.classList.remove('dragging');
        }

        state.drag.frame = 0;
        state.drag.isActive = false;
        state.drag.panel = null;
    }

    function setPanelPosition(panel, x, y, bounds) {
        const boundedX = Math.max(bounds.minX, Math.min(bounds.maxX, x));
        const boundedY = Math.max(bounds.minY, Math.min(bounds.maxY, y));
        const terminalWindow = queryRequired(selectors.terminalWindow, panel);
        const terminalRect = terminalWindow.getBoundingClientRect();

        // Once a panel has been moved, freeze its rendered size. Otherwise responsive width rules
        // can reflow the panel while the user drags it, which makes the pointer feel detached.
        panel.style.height = `${terminalRect.height}px`;
        panel.style.left = '0';
        panel.style.position = 'absolute';
        panel.style.top = '0';
        panel.style.transform = `translate(${boundedX}px, ${boundedY}px)`;
        panel.style.width = `${terminalRect.width}px`;
    }

    function createPreviewPanel() {
        const panel = document.createElement('div');
        const hint = state.isMobile
            ? 'tap outside to dismiss'
            : 'press Esc to dismiss or click outside';

        panel.className = 'panel';
        panel.id = 'preview';
        panel.popover = 'auto';
        panel.innerHTML = `
            <div class="terminal-window">
                <header class="terminal-header">
                    <h4>web preview (${hint})</h4>
                </header>
                <section class="terminal-content">
                    <div class="preview-container">
                        <iframe frameborder="0" loading="lazy"></iframe>
                    </div>
                </section>
            </div>
        `;

        queryRequired(selectors.panelsContainer).appendChild(panel);

        return panel;
    }

    function bindPreviewLinks() {
        for (const link of queryAll(selectors.previewLink)) {
            link.addEventListener('click', (event) => {
                event.preventDefault();

                showPreview(link.href, link.closest(selectors.panel));
            });
        }
    }

    function showPreview(url, sourcePanel) {
        state.previewSourcePanel = sourcePanel;

        if (!state.previewPanel) {
            state.previewPanel = createPreviewPanel();
        }

        const iframe = queryRequired('iframe', state.previewPanel);
        iframe.src = url;

        setActivePanel(state.previewPanel);
        state.zIndexMax += 1;
        state.previewPanel.style.zIndex = String(state.zIndexMax);

        state.previewPanel.removeEventListener('beforetoggle', restorePreviewSource);
        state.previewPanel.addEventListener('beforetoggle', restorePreviewSource);

        if (typeof state.previewPanel.showPopover === 'function') {
            state.previewPanel.showPopover();
        }
    }

    function restorePreviewSource(event) {
        if (event.newState !== 'closed') return;

        const previewPanel = state.previewPanel;
        previewPanel.removeEventListener('beforetoggle', restorePreviewSource);
        previewPanel.remove();
        state.previewPanel = null;

        if (state.previewSourcePanel) {
            setActivePanel(state.previewSourcePanel);
        }
    }

    function bindTabs() {
        for (const panel of getPanels()) {
            const buttons = queryAll(selectors.tabButton, panel);
            if (buttons.length === 0) continue;

            selectTab(panel, buttons[0].dataset.tab);

            for (const button of buttons) {
                button.addEventListener('click', () => {
                    selectTab(panel, button.dataset.tab);
                });
            }
        }

        document.addEventListener('keydown', switchActivePanelTabWithKeyboard);
    }

    function switchActivePanelTabWithKeyboard(event) {
        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;

        const activePanel = document.querySelector(selectors.activePanel);
        if (!activePanel) return;

        const buttons = queryAll(selectors.tabButton, activePanel);
        if (buttons.length === 0) return;

        const activeButton = activePanel.querySelector(`${selectors.tabButton}.tab-active`);
        const activeIndex = buttons.indexOf(activeButton);
        if (activeIndex < 0) return;

        const direction = event.key === 'ArrowLeft' ? -1 : 1;
        const nextIndex = (activeIndex + direction + buttons.length) % buttons.length;

        selectTab(activePanel, buttons[nextIndex].dataset.tab);
    }

    function selectTab(panel, tabName) {
        for (const button of queryAll(selectors.tabButton, panel)) {
            button.classList.toggle('tab-active', button.dataset.tab === tabName);
        }

        for (const tab of queryAll(selectors.tab, panel)) {
            tab.classList.toggle('tab-active', tab.id === `${panel.id}-${tabName}`);
        }

        // Tab content can change panel dimensions, so drag bounds are refreshed after
        // layout settles.
        window.setTimeout(() => {
            if (panel.id !== 'preview') {
                state.panelBounds.set(panel, getPanelBounds(panel));
            }
        }, RESIZE_DEBOUNCE_MS);
    }

    function bindSwipes() {
        if (!state.isMobile) return;

        for (const panel of getPanels()) {
            const tabGroup = panel.querySelector(selectors.tabGroup);
            if (!tabGroup) continue;

            let touchStartX = 0;

            panel.addEventListener('touchstart', (event) => {
                touchStartX = event.touches[0].clientX;
            }, { passive: true });

            panel.addEventListener('touchend', (event) => {
                const touchEndX = event.changedTouches[0].clientX;
                activateSwipedTab(tabGroup, touchEndX - touchStartX);
            }, { passive: true });
        }
    }

    function activateSwipedTab(tabGroup, swipeDistance) {
        if (Math.abs(swipeDistance) < SWIPE_THRESHOLD_PX) return;

        const buttons = queryAll(selectors.tabButton, tabGroup);
        const activeButton = tabGroup.querySelector(`${selectors.tabButton}.tab-active`);
        const activeIndex = buttons.indexOf(activeButton);
        if (activeIndex < 0) return;

        const direction = swipeDistance > 0 ? -1 : 1;
        const nextIndex = (activeIndex + direction + buttons.length) % buttons.length;

        buttons[nextIndex].click();
    }

    function bindThemeToggle() {
        const toggle = document.querySelector(selectors.themeToggle);
        if (!toggle) return;

        toggle.addEventListener('click', () => {
            const currentScheme = document.documentElement.style.colorScheme;
            const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
            const currentIsDark = currentScheme === 'dark' || (!currentScheme && systemPrefersDark);

            document.documentElement.style.colorScheme = currentIsDark ? 'light' : 'dark';
        });
    }

    function getDeviceMessage(elementId) {
        const [panelId, messageNumber] = elementId.split('-message-');
        const messages = state.isMobile ? mobileMessages : desktopMessages;

        return messages[panelId]?.[messageNumber] ?? '';
    }

    const mobileMessages = {
        about: {
            1: 'try clicking the tabs or swiping left or right on this window to switch ' +
                'between them.',
            2: 'touch the image...',
        },
        welcome: {
            1: `on mobile you may scroll to focus the windows.
            toggle the theme by clicking the button below the 'projects' link.`,
        },
    };

    const desktopMessages = {
        about: {
            1: 'try clicking or using the arrow keys to switch between tabs.',
            2: 'hover the image...',
        },
        welcome: {
            1: `on desktop or tablets you may click or touch the windows to bring them into focus.
            you may also drag the active window around by dragging its title bar.
            toggle the theme by clicking the button on the top right.`,
        },
    };

    function setDeviceMessages() {
        for (const message of queryAll(selectors.deviceMessage)) {
            message.textContent = getDeviceMessage(message.id);
        }
    }

    function bindMobilePanelObserver() {
        if (!state.isMobile) return;

        const observer = new IntersectionObserver((entries) => {
            for (const entry of entries) {
                if (entry.target.id === 'preview') continue;
                if (!entry.isIntersecting) continue;
                if (entry.intersectionRatio < 0.93) continue;

                setActivePanel(entry.target);
            }
        }, {
            rootMargin: '-5% 0px',
            threshold: [0.93],
        });

        for (const panel of getInteractivePanels()) {
            observer.observe(panel);
        }
    }

    function bindDesktopPanelFocus() {
        if (state.isMobile) return;

        for (const panel of getInteractivePanels()) {
            panel.addEventListener('mousedown', (event) => {
                if (event.target.closest(selectors.terminalHeader)) return;
                focusPanel(panel);
            });
        }
    }

    function bindMobileTooltips() {
        if (!state.isMobile) return;

        for (const abbr of queryAll('abbr[title]')) {
            let tooltip = null;
            let dismissTimeout = 0;

            const dismissTooltip = () => {
                if (!tooltip) return;

                window.clearTimeout(dismissTimeout);
                tooltip.remove();
                tooltip = null;
            };

            abbr.addEventListener('touchstart', (event) => {
                event.preventDefault();
                dismissTooltip();

                tooltip = createTooltip(abbr.getAttribute('title'));
                positionTooltip(tooltip, abbr, event.touches[0].clientX);

                dismissTimeout = window.setTimeout(dismissTooltip, TOOLTIP_DISMISS_MS);

                const dismissOnOutsideTouch = (outsideEvent) => {
                    if (abbr.contains(outsideEvent.target)) return;

                    dismissTooltip();
                    document.removeEventListener('touchstart', dismissOnOutsideTouch);
                };

                document.addEventListener('touchstart', dismissOnOutsideTouch);
            });
        }
    }

    function createTooltip(text) {
        const tooltip = document.createElement('div');
        tooltip.textContent = text;

        Object.assign(tooltip.style, {
            backgroundColor: 'var(--text-color)',
            borderRadius: '0.25rem',
            boxShadow: '0.0625rem 0.0625rem 0.3125rem 0rem var(--shadow-color)',
            color: 'var(--bg-color)',
            fontSize: '0.75rem',
            maxWidth: 'min(16rem, 80vw)',
            opacity: '0',
            overflowWrap: 'break-word',
            padding: '0.125rem 0.25rem',
            pointerEvents: 'none',
            position: 'absolute',
            transition: 'opacity 0.2s ease-in-out',
            transform: 'translateX(0)',
            whiteSpace: 'normal',
            zIndex: '100',
        });

        document.body.appendChild(tooltip);

        return tooltip;
    }

    function positionTooltip(tooltip, target, touchX) {
        const rect = target.getBoundingClientRect();
        const tooltipRect = tooltip.getBoundingClientRect();
        const viewportPadding = 8;
        const viewportCenter = window.innerWidth / 2;

        let left = rect.left + (rect.width - tooltipRect.width) / 2;
        left = clamp(
            left,
            viewportPadding,
            window.innerWidth - tooltipRect.width - viewportPadding,
        );

        // Touch users often hide the trigger with their finger. Biasing toward the touched side
        // keeps the tooltip readable without requiring a second interaction.
        if (touchX < viewportCenter) {
            left = Math.max(viewportPadding, rect.left + window.scrollX);
        } else {
            left = Math.min(
                window.innerWidth - tooltipRect.width - viewportPadding,
                rect.right + window.scrollX - tooltipRect.width,
            );
        }

        let top = rect.top + window.scrollY - tooltipRect.height - 8;
        if (top < window.scrollY + viewportPadding) {
            top = rect.bottom + window.scrollY + 8;
        }

        tooltip.style.left = `${left}px`;
        tooltip.style.top = `${top}px`;
        tooltip.style.opacity = '1';
    }

    function clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    function init() {
        refreshZIndexMax();
        bindLayoutMeasurements();
        bindNavLinks();
        bindPreviewLinks();
        bindReferenceLinks();
        bindTabs();
        bindThemeToggle();
        setDeviceMessages();
        bindSwipes();
        bindMobilePanelObserver();
        bindMobileTooltips();
        bindDesktopPanelFocus();
        bindDragging();

        if (!state.isMobile) {
            focusPanel(document.getElementById('welcome'));
        }
    }

    document.addEventListener('DOMContentLoaded', init);
}());
