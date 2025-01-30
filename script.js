const state = {
    isMobile: window.innerWidth <= 500,
    containerDimensions: { rect: null, navHeight: 0 },
    resizeTimeout: null,
    isDragging: false,
    activePanel: null,
    previewPanel: null,
    sourcePanel: null,
    startX: 0,
    startY: 0,
    initialPanelX: 0,
    initialPanelY: 0,
    lastZIndex: 0,
    previewZIndex: 1000,
    panelBounds: new Map(),
};

function initializePanelZIndices() {
    const panels = [...document.querySelectorAll('.panel')].reverse();
    let currentZ = 1;

    panels.forEach(panel => { if (panel.id !== 'preview') panel.style.zIndex = currentZ++; });
}

function calculateAllPanelBounds() {
    const panels = document.querySelectorAll('.panel');
    state.panelBounds.clear();

    panels.forEach(panel => {
        if (panel.id !== 'preview') {
            const panelRect = panel.getBoundingClientRect();
            state.panelBounds.set(panel, {
                minX: state.containerDimensions.rect.left,
                minY: state.containerDimensions.rect.top - state.containerDimensions.navHeight,
                maxX: state.containerDimensions.rect.right - panelRect.width,
                maxY: state.containerDimensions.rect.bottom - panelRect.height - state.containerDimensions.navHeight
            });
        }
    });
}

function calculateDimensions() {
    const updateDimensions = () => {
        const container = document.querySelector('.panels-container');
        state.containerDimensions.rect = container.getBoundingClientRect();
        state.containerDimensions.navHeight = document.querySelector('nav').offsetHeight;
        calculateAllPanelBounds();
    }

    updateDimensions();

    window.addEventListener('resize', () => {
        clearTimeout(state.resizeTimeout);
        state.resizeTimeout = setTimeout(updateDimensions, 100);
    });
}

function focusPanel(panel) {
    if (state.isMobile) {
        const container = document.querySelector('.panels-container');
        const navHeight = document.querySelector('nav').offsetHeight;

        document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
        panel.classList.add('active');

        container.scrollTo({
            top: panel.offsetTop - navHeight / 2,
            behavior: 'smooth'
        });
    } else {
        if (panel.classList.contains('active')) return;

        const panels = document.querySelectorAll('.panel');
        const currentZ = parseInt(panel.style.zIndex || 0);

        if (panel.id !== 'preview') {
            panels.forEach(p => {
                if (p.id === 'preview') return;

                const pZ = parseInt(p.style.zIndex || 0);
                if (pZ > currentZ) p.style.zIndex = Math.max(1, pZ - 1);
                p.classList.remove('active');
            });

            panel.style.zIndex = state.lastZIndex;
        }

        panel.classList.add('active');
        state.activePanel = panel;
    }

    if (panel.id && panel.id !== 'preview') updateNavLinks(panel.id);
}

function updateNavLinks(activeId) {
    document.querySelectorAll('nav a').forEach(link => {
        link.classList.toggle('active-link', link.dataset.panel === activeId);
    });
}

function refLinkHandler() {
    const refMapping = {};

    document.querySelectorAll('sup[id^="ref-"]').forEach(ref => {
        const refNumber = ref.id.split('-')[1];
        refMapping[refNumber] = ref.closest('.panel').id;

        ref.addEventListener('click', (e) => {
            e.preventDefault();
            const refLink = document.querySelector(`#back-ref-${refNumber}`);
            handleRefClick('refs', refLink);
        });
    });

    document.querySelector('#refs').querySelectorAll('sup[id^="back-ref-"]').forEach(ref => {
        ref.addEventListener('click', (e) => {
            e.preventDefault();
            const refNumber = ref.id.split('-')[2];
            const targetPanelId = refMapping[refNumber];
            const originalRef = document.querySelector(`#ref-${refNumber}`);
            handleRefClick(targetPanelId, originalRef);
        });
    });
}

function handleRefClick(targetId, highlightElement) {
    const targetPanel = document.getElementById(targetId);
    if (!targetPanel) return;

    focusPanel(targetPanel);

    if (highlightElement) {
        highlightElement.classList.add('highlight');
        setTimeout(() => highlightElement.classList.remove('highlight'), 2000);
    }
}

function dragHandler() {
    if (state.isMobile) return;

    const startDragging = (e) => {
        const event = e.touches?.[0] ?? e;
        const panel = event.target.closest('.panel');
        const header = event.target.closest('.terminal-header');

        if (!panel || !panel.classList.contains('active') || !header || panel.id === 'preview') return;

        state.isDragging = true;
        state.activePanel = panel;
        state.startX = event.clientX;
        state.startY = event.clientY;

        const rect = panel.getBoundingClientRect();
        state.initialPanelX = rect.left;
        state.initialPanelY = rect.top;
        state.activePanel.cachedWidth = rect.width;
        state.activePanel.cachedHeight = rect.height;
        panel.classList.add('dragging');
    }

    const stopDragging = () => {
        if (!state.isDragging) return;
        state.isDragging = false;
        if (state.activePanel) {
            state.activePanel.dragBounds = null;
            state.activePanel.classList.remove('dragging');
        }
    }

    const drag = (e) => {
      if (!state.isDragging || !state.activePanel) return;
      e.preventDefault();

      requestAnimationFrame(() => {
          const event = e.touches?.[0] ?? e;
          const [dx, dy] = [event.clientX - state.startX, event.clientY - state.startY];
          const [x, y] = [state.initialPanelX + dx, state.initialPanelY + dy - state.containerDimensions.navHeight];

          // Use cached bounds from state
          const bounds = state.panelBounds.get(state.activePanel);
          if (bounds) {
              updatePanelPosition(state.activePanel, x, y, bounds);
          }
      });
    }

    document.addEventListener('mousedown', startDragging);
    document.addEventListener('mousemove', drag);
    document.addEventListener('mouseup', stopDragging);
    document.addEventListener('mouseleave', stopDragging);
    document.addEventListener('touchstart', startDragging, { passive: false });
    document.addEventListener('touchmove', drag, { passive: false });
    document.addEventListener('touchend', stopDragging);
    document.addEventListener('touchcancel', stopDragging);
}

function calculatePanelBounds(panel) {
    const panelRect = panel.getBoundingClientRect();
    return {
        minX: state.containerDimensions.rect.left,
        minY: state.containerDimensions.rect.top - state.containerDimensions.navHeight,
        maxX: state.containerDimensions.rect.right - panelRect.width,
        maxY: state.containerDimensions.rect.bottom - panelRect.height - state.containerDimensions.navHeight
    };
}

function updatePanelPosition(panel, x, y, bounds) {
    const boundedX = Math.max(bounds.minX, Math.min(bounds.maxX, x));
    const boundedY = Math.max(bounds.minY, Math.min(bounds.maxY, y));
    panel.style.transform = `translate(${boundedX}px, ${boundedY}px)`;
    panel.style.position = 'absolute';
    panel.style.left = '0';
    panel.style.top = '0';
}

function createPreviewPanel() {
    const panel = document.createElement('div');
    panel.className = 'panel';
    panel.id = 'preview';
    panel.popover = 'auto';
    panel.innerHTML = `
    <div class="terminal-window">
      <header class="terminal-header">
        <h4>web preview ${state.isMobile ? "(tap outside to dismiss)" : "(press Esc to dismiss or click outside)"}</h4>
      </header>
      <section class="terminal-content">
        <div class="preview-container">
          <iframe frameborder="0" loading="lazy"></iframe>
        </div>
      </section>
    </div>
    `;
    document.querySelector('.panels-container').appendChild(panel);
    return panel;
}

function showPreview(url, source) {
    state.sourcePanel = source;
    if (!state.previewPanel) state.previewPanel = createPreviewPanel();

    const iframe = state.previewPanel.querySelector('iframe');
    iframe.src = url;

    document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
    state.previewPanel.classList.add('active');
    state.previewPanel.style.zIndex = state.previewZIndex;
    
    // Show popover
    state.previewPanel.showPopover();

    // Handle popover hiding
    state.previewPanel.addEventListener('beforetoggle', (e) => {
        if (e.newState === 'closed') {
            state.previewPanel.remove();
            state.previewPanel = null;

            if (state.sourcePanel) {
                document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
                state.sourcePanel.classList.add('active');
                state.activePanel = state.sourcePanel;
                updateNavLinks(state.sourcePanel.id);
            }
        }
    }, { once: true });
}

// tab management
function tabHandler(tabButtons, tabs) {
    const defaultTab = tabButtons[0].dataset.tab;

    tabs.forEach(tab => { tab.classList.toggle('tab-active', tab.id.split('-')[1] === defaultTab); });

    tabButtons.forEach(button => {
        button.classList.toggle('tab-active', button.dataset.tab === defaultTab);

        button.addEventListener('click', () => {
            const tabName = button.dataset.tab;
            switchTab(tabButtons, tabs, tabName);
        });
    });

    document.addEventListener('keydown', (e) => {
        if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
        
        const activePanel = document.querySelector('.panel.active');
        if (!activePanel) return;
        
        const activeTabButton = activePanel.querySelector('.tab-button.tab-active');
        if (!activeTabButton) return;

        const tabsList = [...activePanel.querySelectorAll('.tab-button')];
        const currentIndex = tabsList.indexOf(activeTabButton);
        const direction = e.key === 'ArrowLeft' ? -1 : 1;
        const newIndex = (currentIndex + direction + tabsList.length) % tabsList.length;
        
        const newTab = tabsList[newIndex].dataset.tab;
        switchTab(tabButtons, tabs, newTab);
    });
}

function switchTab(tabButtons, tabs, tabName) {
    tabButtons.forEach(btn => btn.classList.toggle('tab-active', btn.dataset.tab === tabName));
    tabs.forEach(tab => tab.classList.toggle('tab-active', tab.id.split('-')[1] === tabName));
}

function swipeHandler() {
    if (!state.isMobile) return;

    const panels = document.querySelectorAll('.panel');

    panels.forEach(panel => {
        const tabContainer = panel.querySelector('.terminal-tabs');
        if (!tabContainer) return;

        let touchStartX = 0;
        let touchEndX = 0;

        const handleSwipe = () => {
            const swipeThreshold = 50;
            const swipeDistance = touchEndX - touchStartX;

            if (Math.abs(swipeDistance) < swipeThreshold) return;

            const tabs = [...tabContainer.querySelectorAll('.tab-button')];
            const activeTab = tabContainer.querySelector('.tab-button.tab-active');
            const currentIndex = tabs.indexOf(activeTab);

            const direction = swipeDistance > 0 ? -1 : 1;
            const newIndex = (currentIndex + direction + tabs.length) % tabs.length;

            tabs[newIndex].click();
        };

        panel.addEventListener('touchstart', (e) => {
            touchStartX = e.touches[0].clientX;
        }, { passive: true });

        panel.addEventListener('touchend', (e) => {
            touchEndX = e.changedTouches[0].clientX;
            handleSwipe();
        }, { passive: true });
    });
}

// view initialization
function getMobileMessage(panelId) {
    switch(panelId) {
        case 'welcome':
            return `on mobile you may scroll to focus the windows.
            toggle the theme by clicking the button below the 'projects' link.`;
        case 'about':
            return `try clicking the tabs or swiping left or right on this window to switch between them.`;
        default:
            return '';
    }
}

function setupMobileView(elements) {
    elements.deviceMessages.forEach(message => {
        const panelId = message.id.replace('-message', '');
        message.textContent = getMobileMessage(panelId);
    });

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.target.id === 'preview') return;
            if (entry.isIntersecting && entry.intersectionRatio >= 0.93) {
                const panel = entry.target;
                elements.panels.forEach(p => p.classList.remove('active'));
                panel.classList.add('active');
                updateNavLinks(panel.id);
            }
        });
    }, {
        threshold: [0.93],
        rootMargin: '-5% 0px'
    });

    elements.panels.forEach(panel => {
        if (panel.id !== 'preview') observer.observe(panel);
    });
}

function getDesktopMessage(panelId) {
    switch(panelId) {
        case 'welcome':
            return `on desktop or tablets you may click or touch the windows to bring them into focus.
            you may also drag the active window around by dragging it's title bar.
            toggle the theme by clicking the button on the top right.`;
        case 'about':
            return `try clicking or using the arrow keys to switch between tabs.`;
        default:
            return '';
    }
}

function setupDesktopView(elements) {
    elements.deviceMessages.forEach(message => {
        const panelId = message.id.replace('-message', '');
        message.textContent = getDesktopMessage(panelId);
    });

    elements.panels.forEach(panel => {
        panel.addEventListener('mousedown', (e) => {
            if (e.target.closest('.terminal-header')) return;
            focusPanel(panel);
        });
    });
}

document.addEventListener('DOMContentLoaded', () => {
    calculateDimensions();
    state.lastZIndex = document.querySelectorAll('.panel').length;
    initializePanelZIndices();

    const elements = {
        navLinks: document.querySelectorAll('nav a'),
        panels: document.querySelectorAll('.panel'),
        tabButtons: document.querySelectorAll('.tab-button'),
        tabs: document.querySelectorAll('.terminal-tab'),
        deviceMessages: document.querySelectorAll('.device-specific-message'),
    };

    // event listeners for nav links
    elements.navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const targetId = e.target.dataset.panel;
            const targetPanel = document.getElementById(targetId);
            if (targetPanel) focusPanel(targetPanel, targetId);
        });
    });

    // event listener for preview links
    document.querySelectorAll('a[data-preview="true"]').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            showPreview(link.href, e.target.closest('.panel'));
        });
    });

    // toggle theme button
    document.getElementById('toggle-theme')?.addEventListener('click', () => {
        if (window.matchMedia('(prefers-color-scheme: dark)').matches && document.documentElement.style.colorScheme !== "light") {
            document.documentElement.style.colorScheme = "light";
        } else {
            document.documentElement.style.colorScheme = "dark";
        }
    });

    refLinkHandler();
    tabHandler(elements.tabButtons, elements.tabs);

    if (state.isMobile) {
        setupMobileView(elements);
        swipeHandler();
    } else {
        setupDesktopView(elements);
        dragHandler();
        focusPanel(document.getElementById('welcome'), 'welcome');
    }
});