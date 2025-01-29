document.addEventListener('DOMContentLoaded', () => {
    const isMobile = window.innerWidth <= 500;
    const navLinks = document.querySelectorAll('nav a');
    const panels = document.querySelectorAll('.panel');
    const VERTICAL_OFFSET = 80;
    const CEILING_OFFSET = 25;
    const FLOOR_OFFSET = 70;
    const SIDE_OFFSET = 10;
    let isDragging = false;
    let activePanel = null;
    let previewPanel = null;
    let sourcePanel = null;
    let startX, startY;
    let initialPanelX, initialPanelY;

    function activatePanel(panel, navId) {
        console.log(isMobile)
        if (isMobile) {
            const container = document.querySelector('.panels-container');
            const navHeight = document.querySelector('nav').offsetHeight;
            
            panels.forEach(p => p.classList.remove('active'));
            panel.classList.add('active');
    
            container.scrollTo({
                top: panel.offsetTop - navHeight / 2,
                behavior: 'smooth'
            });
    
            updateNavLinks(navId);
        } else {
            panels.forEach(p => p.classList.remove('active'));
            panel.classList.add('active');
            activePanel = panel;
            updateNavLinks(navId);
        }
    }

    function calculateBounds(panel) {
        const container = document.querySelector('.panels-container');
        const containerRect = container.getBoundingClientRect();
        const panelRect = panel.getBoundingClientRect();
        const navHeight = document.querySelector('nav').offsetHeight;
        const headerHeight = panel.querySelector('.terminal-header').offsetHeight;
    
        return {
            minX: containerRect.left,
            minY: navHeight - headerHeight - CEILING_OFFSET,
            maxX: containerRect.right - panelRect.width - SIDE_OFFSET,
            maxY: containerRect.bottom - panelRect.height - FLOOR_OFFSET
        };
    }
    
    function updatePanelPosition(panel, x, y, bounds) {
        panel.style.left = `${Math.max(bounds.minX, Math.min(bounds.maxX, x))}px`;
        panel.style.top = `${Math.max(bounds.minY, Math.min(bounds.maxY, y))}px`;
        panel.style.right = 'auto';
        panel.style.bottom = 'auto';
        panel.style.transform = 'none';
    }

    function updateNavLinks(activeId) {
        navLinks.forEach(link => {
            link.classList.toggle('active-link', link.dataset.panel === activeId);
        });
    }

    function initializeRefs() {
        const refMapping = {};
        document.querySelectorAll('sup[id^="ref-"]').forEach(ref => {
            const refNumber = ref.id.split('-')[1];
            refMapping[refNumber] = ref.closest('.panel').id;
        });
    
        // forward refs
        document.querySelectorAll('sup[id^="ref-"]').forEach(ref => {
            ref.addEventListener('click', (e) => {
                e.preventDefault();
                const refNumber = ref.id.split('-')[1];
                const refLink = document.querySelector(`#back-ref-${refNumber}`);
                handleRefClick('refs', refLink);
            });
        });
    
        // back refs
        document.querySelector('#refs').querySelectorAll('sup[id^="back-ref-"]').forEach(ref => {
            ref.addEventListener('click', (e) => {
                e.preventDefault();
                const refNumber = ref.id.split('-')[2];
                const targetPanelId = refMapping[refNumber];
                const originalRef = document.querySelector(`#ref-${refNumber}`);
                handleRefClick(targetPanelId, originalRef);
            });
        });
    
        return refMapping;
    }

    function handleRefClick(targetId, highlightElement) {
        const targetPanel = document.getElementById(targetId);
        if (!targetPanel) return;

        activatePanel(targetPanel, targetId);

        if (highlightElement) {
            highlightElement.classList.add('highlight');
            setTimeout(() => highlightElement.classList.remove('highlight'), 2000);
        }
    }

    // window dragging
    function initializeDragging() {
        if (isMobile) return;

        function startDragging(e) {
            const event = e.touches?.[0] ?? e;
            const panel = event.target.closest('.panel');
            const header = event.target.closest('.terminal-header');
    
            if (!panel || !panel.classList.contains('active') || !header || panel.id === 'preview') return;
    
            isDragging = true;
            activePanel = panel;
            startX = event.clientX;
            startY = event.clientY;
    
            const rect = panel.getBoundingClientRect();
            initialPanelX = rect.left;
            initialPanelY = rect.top;
            panel.classList.add('dragging');
        }

        function stopDragging() {
            if (!isDragging) return;
            isDragging = false;
            activePanel?.classList.remove('dragging');
        }

        function drag(e) {
            if (!isDragging || !activePanel) return;
            e.preventDefault();
    
            const event = e.touches?.[0] ?? e;
            const [dx, dy] = [event.clientX - startX, event.clientY - startY];
            const [x, y] = [initialPanelX + dx, initialPanelY + dy - VERTICAL_OFFSET];
    
            const bounds = calculateBounds(activePanel);
            updatePanelPosition(activePanel, x, y, bounds);
        }

        // mouse events
        document.addEventListener('mousedown', startDragging);
        document.addEventListener('mousemove', drag);
        document.addEventListener('mouseup', stopDragging);
        document.addEventListener('mouseleave', stopDragging);

        // touch events
        document.addEventListener('touchstart', startDragging, { passive: false });
        document.addEventListener('touchmove', drag, { passive: false });
        document.addEventListener('touchend', stopDragging);
        document.addEventListener('touchcancel', stopDragging);
    }
    
    // handle clicks in nav bar
    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const targetId = e.target.dataset.panel;
            const targetPanel = document.getElementById(targetId);
            if (!targetPanel) return;

            activatePanel(targetPanel, targetId);
        });
    });

    const refMapping = initializeRefs();
    initializeDragging();

    document.querySelectorAll('sup[id^="ref-"]').forEach(ref => {
        ref.addEventListener('click', (e) => {
            e.preventDefault();
            const refNumber = ref.id.split('-')[1];
            const refsPanel = document.getElementById('refs');
            const refLink = refsPanel.querySelector(`#back-ref-${refNumber}`);
            const refAnchor = refLink?.parentElement?.querySelector('a');
            handleRefClick('refs', refAnchor);
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

    // initialize view based on device type
    const deviceMessage = document.getElementById('device-specific-message');

    if (isMobile) {
        deviceMessage.textContent = `on mobile you may scroll to focus the windows.
        
        toggle the theme by clicking the button below the 'projects' link.`;

        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                // ignore the preview panel
                if (entry.target.id === 'preview') return;

                if (entry.isIntersecting && entry.intersectionRatio >= 0.95) {
                    const panel = entry.target;
                    panels.forEach(p => p.classList.remove('active'));
                    panel.classList.add('active');
                    updateNavLinks(panel.id);
                }
            });
        }, {
            threshold: [0.95],
            rootMargin: '-5% 0px'
        });
    
        // observe all panels except the preview panel
        panels.forEach(panel => { if (panel.id !== 'preview') observer.observe(panel); });
    } else {
        deviceMessage.textContent = `on desktop or tablets you may click or touch the windows to bring them into focus.
        you may also drag the active window around by dragging it's title bar.
        
        toggle the theme by clicking the button on the top right.`;
        
        panels.forEach(panel => {
            panel.addEventListener('mousedown', (e) => {
                if (e.target.closest('.terminal-header')) return;
                panels.forEach(p => p.classList.remove('active'));
                panel.classList.add('active');
                activePanel = panel;
                updateNavLinks(panel.id);
            });
        });
    }

    // initialize the theme
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    if (!document.documentElement.hasAttribute('data-theme')) {
        document.documentElement.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
    }

    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
        document.documentElement.setAttribute('data-theme', e.matches ? 'dark' : 'light');
    });

    document.getElementById('toggle-theme')?.addEventListener('click', () => {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        document.documentElement.setAttribute('data-theme', currentTheme === 'dark' ? 'light' : 'dark');
    });

    // image preview functionality
    function createPreviewPanel() {
        const panel = document.createElement('div');
        panel.className = 'panel';
        panel.id = 'preview';
        
        panel.innerHTML = `
            <div class="terminal-window">
                <header class="terminal-header"><h4>web preview ${isMobile ? "(click title bar to dismiss)" : "(click outside to dismiss)"}</h4></header>
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
        sourcePanel = source
        if (!previewPanel) previewPanel = createPreviewPanel();

        const iframe = previewPanel.querySelector('iframe');
        iframe.src = url;

        panels.forEach(p => p.classList.remove('active'));
        previewPanel.classList.add('active');

        const destroyInactive = (e) => {
            const clickedPanel = e.target.closest('.panel');

            // destroy the preview panel if the user clicks outside of it on desktop, or if the user clicks on the preview panel on mobile
            if (isMobile) {
                if (clickedPanel === previewPanel) {
                    previewPanel.remove();
                    previewPanel = null;
                    document.removeEventListener('mousedown', destroyInactive);
                    if (sourcePanel) activatePanel(sourcePanel, sourcePanel.id);
                }
            } else {
                if (clickedPanel !== previewPanel) {
                    previewPanel.remove();
                    previewPanel = null;
                    document.removeEventListener('mousedown', destroyInactive);
                    if (sourcePanel) activatePanel(sourcePanel, sourcePanel.id);
                }
            }
        };

        document.addEventListener('mousedown', destroyInactive);
    }

    document.querySelectorAll('a[data-preview="true"]').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            showPreview(link.href, e.target.closest('.panel'));
        });
    });

    if (!isMobile) {
        const welcomePanel = document.getElementById('welcome');
        activatePanel(welcomePanel, 'welcome');
    }
});