(function () {
    'use strict';

    const THEME_STORAGE_KEY = 'portfolio-color-scheme';
    const THEME_TOGGLE_SELECTOR = '#toggle-theme';

    /** @typedef {'dark' | 'light'} ColorScheme */

    /**
     * Gets a saved color scheme, falling back to the operating system preference.
     *
     * @returns {ColorScheme}
     */
    function getPreferredTheme() {
        try {
            const savedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
            if (savedTheme === 'dark' || savedTheme === 'light') {
                return savedTheme;
            }
        } catch (error) {
            console.warn('Theme preference could not be read.', error);
        }

        return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }

    /**
     * Applies a color scheme and updates the toggle's screen-reader description.
     *
     * @param {ColorScheme} scheme
     * @param {Element} toggle
     */
    function applyTheme(scheme, toggle) {
        const nextScheme = scheme === 'dark' ? 'light' : 'dark';

        document.documentElement.style.colorScheme = scheme;
        toggle.setAttribute('aria-label', `Switch to ${nextScheme} theme`);
        toggle.setAttribute('aria-pressed', String(scheme === 'dark'));
    }

    /** Connects the shared theme button used by both portfolio pages. */
    function bindThemeToggle() {
        const toggle = document.querySelector(THEME_TOGGLE_SELECTOR);
        if (!toggle) return;

        applyTheme(getPreferredTheme(), toggle);

        toggle.addEventListener('click', () => {
            const currentScheme = document.documentElement.style.colorScheme;
            const nextScheme = currentScheme === 'dark' ? 'light' : 'dark';

            applyTheme(nextScheme, toggle);

            try {
                window.localStorage.setItem(THEME_STORAGE_KEY, nextScheme);
            } catch (error) {
                console.warn('Theme preference could not be saved.', error);
            }
        });
    }

    document.addEventListener('DOMContentLoaded', bindThemeToggle);
}());
