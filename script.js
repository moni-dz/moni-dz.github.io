document.addEventListener('DOMContentLoaded', () => {
    const isMobile = window.innerWidth <= 500;
    const navLinks = document.querySelectorAll('nav a');
    const panels = document.querySelectorAll('.panel');

    let containerDimensions = {
        rect: null,
        navHeight: 0
    };

    let resizeTimeout;
    let isDragging = false;
    let activePanel = null;
    let previewPanel = null;
    let sourcePanel = null;
    let startX, startY;
    let initialPanelX, initialPanelY;

    function updateContainerDimensions() {
        const container = document.querySelector('.panels-container');
        containerDimensions.rect = container.getBoundingClientRect();
        containerDimensions.navHeight = document.querySelector('nav').offsetHeight;
    }

    updateContainerDimensions();

    window.addEventListener('resize', () => {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(updateContainerDimensions, 100);
    });

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
        const panelRect = panel.getBoundingClientRect();
        return {
            minX: containerDimensions.rect.left,
            minY: containerDimensions.rect.top - containerDimensions.navHeight,
            maxX: containerDimensions.rect.right - panelRect.width,
            maxY: containerDimensions.rect.bottom - panelRect.height - containerDimensions.navHeight
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
            activePanel.dragBounds = calculateBounds(activePanel);
            activePanel.cachedWidth = rect.width;
            activePanel.cachedHeight = rect.height;
            panel.classList.add('dragging');
        }

        function stopDragging() {
            if (!isDragging) return;
            isDragging = false;
            if (activePanel) {
                activePanel.dragBounds = null;
                activePanel.classList.remove('dragging');
            }
        }

        function drag(e) {
            if (!isDragging || !activePanel) return;
            e.preventDefault();
        
            requestAnimationFrame(() => {
                const event = e.touches?.[0] ?? e;
                const [dx, dy] = [event.clientX - startX, event.clientY - startY];
                const [x, y] = [initialPanelX + dx, initialPanelY + dy - containerDimensions.navHeight];
                
                updatePanelPosition(activePanel, x, y, activePanel.dragBounds);
            });
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

    // tabs functionality
    const tabButtons = document.querySelectorAll('.tab-button');
    const tabs = document.querySelectorAll('.terminal-tab');
    const defaultTab = tabButtons[0].dataset.tab;
    
    tabs.forEach(tab => { tab.classList.toggle('tab-active', tab.id.split('-')[1] === defaultTab); });
    tabButtons.forEach(button => { button.classList.toggle('tab-active', button.dataset.tab === defaultTab); });
    
    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            const tabName = button.dataset.tab;
            
            tabButtons.forEach(btn => btn.classList.remove('tab-active'));
            button.classList.add('tab-active');
            
            tabs.forEach(tab => { 
                tab.classList.toggle('tab-active', tab.id.split('-')[1] === tabName); 
            });
        });
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

    // tab swiping on mobile
    function initializeTabSwipes() {
        if (!isMobile) return;
        
        const tabContainer = document.querySelector('.terminal-tabs');
        let touchStartX = 0;
        let touchEndX = 0;
    
        const handleSwipe = () => {
            const swipeThreshold = 50; // minimum swipe distance
            const swipeDistance = touchEndX - touchStartX;
            
            if (Math.abs(swipeDistance) < swipeThreshold) return;
            
            const tabs = [...document.querySelectorAll('.tab-button')];
            const activeTab = document.querySelector('.tab-button.active');
            const currentIndex = tabs.indexOf(activeTab);
            
            // swipe left moves forward, right moves backward
            const direction = swipeDistance > 0 ? -1 : 1;
            const newIndex = (currentIndex + direction + tabs.length) % tabs.length;
            
            tabs[newIndex].click();
        }
    
        tabContainer.addEventListener('touchstart', (e) => {
            touchStartX = e.touches[0].clientX;
        }, { passive: true });
    
        tabContainer.addEventListener('touchend', (e) => {
            touchEndX = e.changedTouches[0].clientX;
            handleSwipe();
        }, { passive: true });
    }

    initializeTabSwipes();

    if (!isMobile) {
        const welcomePanel = document.getElementById('welcome');
        activatePanel(welcomePanel, 'welcome');
    }
});