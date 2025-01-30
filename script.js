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
};

function calculateDimensions() {
  const updateDimensions = () => {
    const container = document.querySelector('.panels-container');
    state.containerDimensions.rect = container.getBoundingClientRect();
    state.containerDimensions.navHeight = document.querySelector('nav').offsetHeight;
  }

  updateDimensions();

  window.addEventListener('resize', () => {
    clearTimeout(state.resizeTimeout);
    state.resizeTimeout = setTimeout(updateDimensions, 100);
  });
}

function focusPanel(panel, navId) {
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
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
    panel.classList.add('active');
    state.activePanel = panel;
  }

  updateNavLinks(navId);
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

  focusPanel(targetPanel, targetId);

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
    state.activePanel.dragBounds = calculatePanelBounds(state.activePanel);
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

      updatePanelPosition(state.activePanel, x, y, state.activePanel.dragBounds);
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
  panel.innerHTML = `
    <div class="terminal-window">
      <header class="terminal-header">
        <h4>web preview ${state.isMobile ? "(click title bar to dismiss)" : "(click outside to dismiss)"}</h4>
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

  const destroyInactive = (e) => {
    const clickedPanel = e.target.closest('.panel');
    if ((state.isMobile && clickedPanel === state.previewPanel) ||
        (!state.isMobile && clickedPanel !== state.previewPanel)) {
      state.previewPanel.remove();
      state.previewPanel = null;
      document.removeEventListener('mousedown', destroyInactive);
      if (state.sourcePanel) focusPanel(state.sourcePanel, state.sourcePanel.id);
    }
  };

  document.addEventListener('mousedown', destroyInactive);
}

function loadTheme() {
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  if (!document.documentElement.hasAttribute('data-theme')) {
    document.documentElement.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
  }

  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
    document.documentElement.setAttribute('data-theme', e.matches ? 'dark' : 'light');
  });
}

function toggleTheme() {
  const currentTheme = document.documentElement.getAttribute('data-theme');
  document.documentElement.setAttribute('data-theme', currentTheme === 'dark' ? 'light' : 'dark');
}

// Tab management
function tabHandler(tabButtons, tabs) {
  const defaultTab = tabButtons[0].dataset.tab;

  tabs.forEach(tab => { tab.classList.toggle('tab-active', tab.id.split('-')[1] === defaultTab); });

  tabButtons.forEach(button => {
    button.classList.toggle('tab-active', button.dataset.tab === defaultTab);

    button.addEventListener('click', () => {
      const tabName = button.dataset.tab;

      tabButtons.forEach(btn => btn.classList.remove('tab-active'));
      button.classList.add('tab-active');

      tabs.forEach(tab => { tab.classList.toggle('tab-active', tab.id.split('-')[1] === tabName); });
    });
  });
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

    tabContainer.addEventListener('touchstart', (e) => {
      touchStartX = e.touches[0].clientX;
    }, { passive: true });

    tabContainer.addEventListener('touchend', (e) => {
      touchEndX = e.changedTouches[0].clientX;
      handleSwipe();
    }, { passive: true });
  });
}

// View initialization
function setupMobileView(elements) {
  elements.deviceMessage.textContent = `on mobile you may scroll to focus the windows.
    toggle the theme by clicking the button below the 'projects' link.`;

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

function setupDesktopView(elements) {
  elements.deviceMessage.textContent = `on desktop or tablets you may click or touch the windows to bring them into focus.
    you may also drag the active window around by dragging it's title bar.
    toggle the theme by clicking the button on the top right.`;

  elements.panels.forEach(panel => {
    panel.addEventListener('mousedown', (e) => {
      if (e.target.closest('.terminal-header')) return;
      elements.panels.forEach(p => p.classList.remove('active'));
      panel.classList.add('active');
      state.activePanel = panel;
      updateNavLinks(panel.id);
    });
  });
}

// Start the application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    loadTheme();
    calculateDimensions();

    const elements = {
      navLinks: document.querySelectorAll('nav a'),
      panels: document.querySelectorAll('.panel'),
      deviceMessage: document.getElementById('device-specific-message'),
      tabButtons: document.querySelectorAll('.tab-button'),
      tabs: document.querySelectorAll('.terminal-tab')
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
    document.getElementById('toggle-theme')?.addEventListener('click', toggleTheme);

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