document.addEventListener('DOMContentLoaded', () => {
    const isMobile = window.innerWidth <= 768;
    const navLinks = document.querySelectorAll('nav a');
    const panels = document.querySelectorAll('.panel');
    const VERTICAL_OFFSET = 80;
    const CEILING_OFFSET = 20;
    let isDragging = false;
    let activePanel = null;
    let startX, startY;
    let initialPanelX, initialPanelY;

    function activatePanel(panel, navId) {
        if (isMobile) {
            const navHeight = document.querySelector('nav').offsetHeight;
            window.scrollTo({
                top: panel.offsetTop - navHeight,
                behavior: 'smooth'
            });
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
            maxX: containerRect.right - panelRect.width,
            maxY: containerRect.bottom - panelRect.height
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
            const panel = e.target.closest('.panel');
            const header = e.target.closest('.terminal-header');
            if (!panel || !panel.classList.contains('active') || !header) return;

            isDragging = true;
            activePanel = panel;
            startX = e.clientX;
            startY = e.clientY;

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

            const [dx, dy] = [e.clientX - startX, e.clientY - startY];
            const [x, y] = [initialPanelX + dx, initialPanelY + dy - VERTICAL_OFFSET];

            const bounds = calculateBounds(activePanel);
            updatePanelPosition(activePanel, x, y, bounds);
        }

        document.addEventListener('mousedown', startDragging);
        document.addEventListener('mousemove', drag);
        document.addEventListener('mouseup', stopDragging);
        document.addEventListener('mouseleave', stopDragging);
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

    document.getElementById('welcome').classList.add('active');
    document.querySelector('[data-panel="welcome"]').classList.add('active-link');

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
        deviceMessage.textContent = "on mobile you may scroll to focus the windows.";
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting && entry.intersectionRatio >= 0.5) {
                    const panel = entry.target;
                    panels.forEach(p => p.classList.remove('active'));
                    panel.classList.add('active');
                    updateNavLinks(panel.id);
                }
            });
        }, {
            threshold: [0.5],
            rootMargin: '-10% 0px -10% 0px'
        });
    
        panels.forEach(panel => observer.observe(panel));
    } else {
        deviceMessage.textContent = "on desktop you may click the windows to bring them into focus.";
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
});