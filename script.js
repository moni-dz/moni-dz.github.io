document.addEventListener('DOMContentLoaded', () => {
    const isMobile = window.innerWidth <= 768;
    const deviceMessage = document.getElementById('device-specific-message');
    
    // dynamic message based on device dimensions
    if (deviceMessage) {
        deviceMessage.textContent = isMobile 
            ? "on mobile you may scroll to focus the windows."
            : "on desktop you may click the windows to bring them into focus.";
    }

    // read system theme preferences
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    if (!document.documentElement.hasAttribute('data-theme')) {
        document.documentElement.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
    }

    // watch for system theme changes
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
        document.documentElement.setAttribute('data-theme', e.matches ? 'dark' : 'light');
    });

    const navLinks = document.querySelectorAll('nav a');
    const panels = document.querySelectorAll('.panel');
    let isDragging = false;
    let activePanel = null;
    let startX, startY;
    let initialPanelX, initialPanelY;
    const VERTICAL_OFFSET = 80;
    const CEILING_OFFSET = 20;

    // mark welcome panel as active
    document.getElementById('welcome').classList.add('active');

    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            navLinks.forEach(l => l.classList.remove('active-link'));
            e.target.classList.add('active-link');

            const targetId = e.target.dataset.panel;
            const targetPanel = document.getElementById(targetId);

            // scroll behavior for mobile, otherwise toggle active panel on desktop
            if (isMobile) {
                const navHeight = document.querySelector('nav').offsetHeight;
                
                window.scrollTo({
                    top: targetPanel.offsetTop - navHeight,
                    behavior: 'smooth'
                });
            } else {
                panels.forEach(panel => panel.classList.remove('active'));
                targetPanel.classList.add('active');
                activePanel = targetPanel;
            }
        });
    });

    if (isMobile) {
        // make panel active on scroll
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting && entry.intersectionRatio >= 0.5) {
                    const panel = entry.target;
                    
                    panels.forEach(p => p.classList.remove('active'));
                    panel.classList.add('active');
                    
                    navLinks.forEach(link => {
                        link.classList.remove('active-link');
                        if (link.dataset.panel === panel.id) {
                            link.classList.add('active-link');
                        }
                    });
                }
            });
        }, {
            threshold: [0.5],
            rootMargin: '-10% 0px -10% 0px' // Adds a bit of buffer to the top and bottom
        });

        panels.forEach(panel => observer.observe(panel));
    } else {
        // make panel active on click
        panels.forEach(panel => {
            panel.addEventListener('mousedown', (e) => {
                if (e.target.closest('.terminal-header')) return;

                panels.forEach(p => p.classList.remove('active'));

                panel.classList.add('active');
                activePanel = panel;

                navLinks.forEach(link => {
                    link.classList.remove('active-link');
                    if (link.dataset.panel === panel.id) {
                        link.classList.add('active-link');
                    }
                });
            });
        });
    }

    // mark welcome link initially as active
    document.querySelector('[data-panel="welcome"]').classList.add('active-link');

    // dragging functionality
    if (!isMobile) {
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
            if (activePanel) {
                activePanel.classList.remove('dragging');
            }
        }

        function drag(e) {
            if (!isDragging || !activePanel) return;
            e.preventDefault();

            const dx = e.clientX - startX;
            const dy = e.clientY - startY;
            const newX = initialPanelX + dx;
            const newY = initialPanelY + dy - VERTICAL_OFFSET;
            const container = document.querySelector('.panels-container');
            const containerRect = container.getBoundingClientRect();
            const panelRect = activePanel.getBoundingClientRect();
            const navHeight = document.querySelector('nav').offsetHeight;
            const headerHeight = activePanel.querySelector('.terminal-header').offsetHeight;

            // bounds calculation
            const minX = containerRect.left;
            const minY = navHeight - headerHeight - CEILING_OFFSET;
            const maxX = containerRect.right - panelRect.width;
            const maxY = containerRect.bottom - panelRect.height;

            // modify the panel's position
            activePanel.style.left = `${Math.max(minX, Math.min(maxX, newX))}px`;
            activePanel.style.top = `${Math.max(minY, Math.min(maxY, newY))}px`;
            activePanel.style.right = 'auto';
            activePanel.style.bottom = 'auto';
            activePanel.style.transform = 'none';
        }

        document.addEventListener('mousedown', startDragging);
        document.addEventListener('mousemove', drag);
        document.addEventListener('mouseup', stopDragging);
        document.addEventListener('mouseleave', stopDragging);
    }

    const themeToggle = document.getElementById('toggle-theme');

    themeToggle.addEventListener('click', () => {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', newTheme);
    });
});