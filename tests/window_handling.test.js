'use strict';

import { equal, match } from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

import { startStaticServer } from './support/static_server.js';
import { isWebDriverAvailable, startWebDriver } from './support/webdriver.js';

const poll_attempts_max = 40;
const poll_interval_ms = 25;
const test_timeout_ms = 10_000;
const browser_required = process.env.REQUIRE_BROWSER_TESTS === '1';
const browser_available = isWebDriverAvailable({
    driver_path: null,
    probe_timeout_ms: 1_000,
});
const browser_skip_reason = !browser_required && !browser_available
    ? 'ChromeDriver is not installed locally.'
    : false;

const browser_arguments = [
    '--disable-background-networking',
    '--disable-default-apps',
    '--disable-extensions',
    '--disable-sync',
    '--headless=new',
    '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1',
    '--no-first-run',
    '--no-sandbox',
    '--touch-events=enabled',
    '--window-size=1280,800',
];

let driver = null;
let server = null;

/** @typedef {NonNullable<Awaited<ReturnType<typeof startWebDriver>>>} WebDriver */
/** @typedef {Awaited<ReturnType<WebDriver['createSession']>>} WebDriverSession */
/** @typedef {import('node:test').TestContext} TestContext */

/**
 * Starts both shared processes once because their startup cost exceeds each isolated page.
 */
before(async () => {
    if (browser_skip_reason) return;

    server = await startStaticServer({
        close_timeout_ms: 1_000,
        connections_max: 8,
        headers_timeout_ms: 2_000,
        host: '127.0.0.1',
        keep_alive_timeout_ms: 1_000,
        request_timeout_ms: 2_000,
        root_path: fileURLToPath(new URL('..', import.meta.url)),
    });
    driver = await startWebDriver({
        command_timeout_ms: 2_000,
        commands_max: 512,
        driver_path: null,
        host: '127.0.0.1',
        probe_timeout_ms: 1_000,
        required: browser_required,
        sessions_max: 1,
        shutdown_timeout_ms: 1_000,
        startup_attempts_max: 40,
        startup_interval_ms: 25,
        stderr_length_max: 4_096,
    });
});

/** Preserves the first teardown failure while still releasing every process. */
after(async () => {
    let teardown_error = null;
    try {
        await driver?.close();
    } catch (error) {
        teardown_error = error;
    }

    try {
        await server?.close();
    } catch (error) {
        teardown_error ??= error;
    }

    if (teardown_error) throw teardown_error;
});

/**
 * Polls browser state with a hard bound because UI timing must never become an infinite wait.
 *
 * @param {WebDriverSession} session Browser session under test.
 * @param {string} script Synchronous browser predicate that returns a truthy value when ready.
 * @param {unknown[]} args Serializable arguments passed to the browser predicate.
 * @param {string} description Human-readable state included in timeout diagnostics.
 * @returns {Promise<void>}
 */
async function pollScript(session, script, args, description) {
    for (let attempt = 0; attempt < poll_attempts_max; attempt += 1) {
        if (await session.execute(script, args)) return;
        await delay(poll_interval_ms);
    }

    throw new Error(`Timed out waiting for ${description}.`);
}

/**
 * Registers cleanup before navigation so partial page failures cannot leak a browser session.
 *
 * @param {TestContext} test_context Node test context that owns session cleanup.
 * @param {number} width Initial outer window width in CSS pixels.
 * @param {number} height Initial outer window height in CSS pixels.
 * @returns {Promise<WebDriverSession>}
 */
async function openPage(test_context, width, height) {
    const session = await driver.createSession({ browser_arguments });
    test_context.after(async () => {
        let cleanup_error = null;
        try {
            await session.releaseActions();
        } catch (error) {
            cleanup_error = error;
        }
        try {
            await session.close();
        } catch (error) {
            cleanup_error ??= error;
        }
        if (cleanup_error) throw cleanup_error;
    });

    await session.setWindowRect({ height, width, x: 0, y: 0 });
    await session.navigate(`${server.origin}/index.html`);
    await pollScript(
        session,
        'return document.querySelectorAll(".panel.active").length === 1;',
        [],
        'the portfolio to initialize',
    );
    return session;
}

/**
 * Skips only optional local runs; CI requires the driver and therefore fails when it is absent.
 *
 * @param {string} name Regression-test name reported by the Node test runner.
 * @param {(context: TestContext) => Promise<void>} body Isolated browser scenario.
 * @returns {void}
 */
function browserTest(name, body) {
    test(name, {
        concurrency: false,
        skip: browser_skip_reason,
        timeout: test_timeout_ms,
    }, body);
}

/**
 * Waits for device copy as an observable contract that the media-query transition completed.
 *
 * @param {WebDriverSession} session Browser session under test.
 * @param {string} expected_text Copy unique to the expected responsive mode.
 * @returns {Promise<void>}
 */
async function waitForMode(session, expected_text) {
    await pollScript(
        session,
        `return document.querySelector('#welcome-message-1')?.textContent.includes(arguments[0]);`,
        [expected_text],
        `${expected_text} interaction mode`,
    );
}

/**
 * Returns an integer viewport point accepted by the W3C pointer-actions endpoint.
 *
 * @param {WebDriverSession} session Browser session under test.
 * @param {string} selector Selector for the element whose center is required.
 * @returns {Promise<{x: number, y: number}>}
 */
async function getElementCenter(session, selector) {
    return session.execute(`
        const rect = document.querySelector(arguments[0]).getBoundingClientRect();
        return {
            x: Math.round(rect.left + rect.width / 2),
            y: Math.round(rect.top + rect.height / 2),
        };
    `, [selector]);
}

/**
 * Builds one explicit mouse input source so held-button state persists between action batches.
 *
 * @param {object[]} actions Ordered W3C pointer actions for one input source.
 * @returns {object[]} A single mouse source accepted by the WebDriver actions endpoint.
 */
function mouseActions(actions) {
    return [{
        actions,
        id: 'regression-mouse',
        parameters: { pointerType: 'mouse' },
        type: 'pointer',
    }];
}

/**
 * Activates a panel through its public navigation behavior before testing its title-bar drag.
 *
 * @param {WebDriverSession} session Browser session under test.
 * @param {string} panel_id DOM identifier of the panel to activate.
 * @returns {Promise<void>}
 */
async function activatePanel(session, panel_id) {
    await session.execute(
        `document.querySelector('nav a[data-panel="' + arguments[0] + '"]').click();`,
        [panel_id],
    );
    await pollScript(
        session,
        `return document.getElementById(arguments[0]).classList.contains('active');`,
        [panel_id],
        `${panel_id} panel activation`,
    );
}

browserTest('a live page switches desktop to mobile and back to desktop', async (test_context) => {
    const session = await openPage(test_context, 1_280, 800);
    await waitForMode(session, 'on desktop or tablets');

    await session.setWindowRect({ height: 800, width: 375, x: 0, y: 0 });
    await waitForMode(session, 'on mobile');

    // Synthetic touch payloads isolate the lifecycle assertion from WebDriver touch emulation while
    // still exercising the listeners installed in the real browser document.
    const selected_tab = await session.execute(`
        const panel = document.querySelector('#about');
        const start = new Event('touchstart', { bubbles: true, cancelable: true });
        Object.defineProperty(start, 'touches', { value: [{ clientX: 300 }] });
        panel.dispatchEvent(start);
        const end = new Event('touchend', { bubbles: true, cancelable: true });
        Object.defineProperty(end, 'changedTouches', { value: [{ clientX: 80 }] });
        panel.dispatchEvent(end);
        return panel.querySelector('.terminal-tab.tab-active').id;
    `, []);
    equal(selected_tab, 'about-author');

    await session.setWindowRect({ height: 800, width: 1_280, x: 0, y: 0 });
    await waitForMode(session, 'on desktop or tablets');

    // Direct dispatch avoids panel overlap deciding which element WebDriver hits. The event still
    // crosses the browser's real DOM listener boundary that changes between responsive modes.
    await session.execute(`
        const content = document.querySelector('#projects .terminal-content');
        content.dispatchEvent(new PointerEvent('pointerdown', {
            bubbles: true,
            button: 0,
            isPrimary: true,
            pointerId: 17,
        }));
    `, []);
    equal(await session.execute(
        `return document.querySelector('#projects').classList.contains('active');`,
        [],
    ), true);
});

browserTest(
    'resize reclamps a dragged panel and mobile clears drag styles',
    async (test_context) => {
        const session = await openPage(test_context, 1_000, 800);
        await activatePanel(session, 'about');
        await pollScript(session, `
            const panel = document.querySelector('#about').getBoundingClientRect();
            const container = document.querySelector('.panels-container').getBoundingClientRect();
            const maxWidth = Number.parseFloat(
                getComputedStyle(document.querySelector('#about')).maxWidth,
            );
            const expectedWidth = Math.min(container.width * 0.75, maxWidth);
            return panel.width >= expectedWidth - 1;
        `, [], 'the first active width transition');
        const start = await getElementCenter(session, '#about .terminal-header');
        const edge = await session.execute(`
            const rect = document.querySelector('.panels-container').getBoundingClientRect();
            return { x: Math.floor(rect.right - 4), y: Math.floor(rect.bottom - 4) };
        `, []);

        await session.performActions(mouseActions([
            { duration: 0, origin: 'viewport', type: 'pointerMove', x: start.x, y: start.y },
            { button: 0, type: 'pointerDown' },
            { duration: 100, origin: 'viewport', type: 'pointerMove', x: edge.x, y: edge.y },
            { button: 0, type: 'pointerUp' },
        ]));
        equal(await session.execute(
            `return document.querySelector('#about').style.position === 'absolute';`,
            [],
        ), true);
        equal(await session.execute(`
            const panel = document.querySelector('#about').getBoundingClientRect();
            const container = document.querySelector('.panels-container').getBoundingClientRect();
            return panel.left >= container.left && panel.top >= container.top &&
                panel.right <= container.right && panel.bottom <= container.bottom;
        `, []), true);

        // Resize while the moved panel is inactive, then reactivate it. This catches stale inline
        // widths that otherwise override the responsive 75% active-panel rule.
        await activatePanel(session, 'projects');
        await session.setWindowRect({ height: 600, width: 800, x: 0, y: 0 });
        await activatePanel(session, 'about');
        await pollScript(session, `
            const panel = document.querySelector('#about').getBoundingClientRect();
            const container = document.querySelector('.panels-container').getBoundingClientRect();
            const maxWidth = Number.parseFloat(
                getComputedStyle(document.querySelector('#about')).maxWidth,
            );
            const expectedWidth = Math.min(container.width * 0.75, maxWidth);
            const expanded = panel.width >= expectedWidth - 1;
            return expanded && panel.left >= container.left && panel.top >= container.top &&
                panel.right <= container.right && panel.bottom <= container.bottom;
        `, [], 'the reactivated panel to expand and remain clamped');

        await session.setWindowRect({ height: 800, width: 375, x: 0, y: 0 });
        await waitForMode(session, 'on mobile');
        equal(await session.execute(`
            const properties = ['height', 'left', 'position', 'top', 'transform', 'width'];
            return [...document.querySelectorAll('.panel:not(#preview)')].every((panel) => {
                return properties.every((property) => panel.style[property] === '');
            });
        `, []), true);
    },
);

browserTest(
    'web previews are isolated and unsupported popovers navigate normally',
    async (context) => {
        const session = await openPage(context, 1_280, 800);
        const preview_policy = await session.execute(`
            const link = document.querySelector('#skills a[href*="Philips_PM5544"]');
            link.href = 'https://preview.invalid/page';
            link.click();

            const preview = document.querySelector('#preview');
            const iframe = preview.querySelector('iframe');
            const external = preview.querySelector('.preview-external-link');
            return {
                allow: iframe.allow,
                externalRel: external.rel,
                externalTarget: external.target,
                isOpen: preview.matches(':popover-open'),
                referrerPolicy: iframe.referrerPolicy,
                sandbox: iframe.getAttribute('sandbox'),
            };
        `, []);

        equal(preview_policy.isOpen, true);
        equal(preview_policy.sandbox, '');
        equal(preview_policy.referrerPolicy, 'no-referrer');
        match(preview_policy.allow, /camera 'none'/);
        equal(preview_policy.externalRel, 'noopener noreferrer');
        equal(preview_policy.externalTarget, '_blank');

        await session.navigate(`${server.origin}/index.html`);
        await pollScript(
            session,
            'return document.querySelectorAll(".panel.active").length === 1;',
            [],
            'the portfolio to reinitialize',
        );

        const failure_state = await session.execute(`
            Object.defineProperty(HTMLElement.prototype, 'showPopover', {
                configurable: true,
                value: () => { throw new Error('Synthetic opening failure.'); },
            });
            const link = document.querySelector('#skills a[href*="Philips_PM5544"]');
            link.href = '#skills';
            link.click();
            return {
                active: document.querySelector('#skills').classList.contains('active'),
                previewExists: document.querySelector('#preview') !== null,
            };
        `, []);
        equal(failure_state.active, true);
        equal(failure_state.previewExists, false);

        await session.execute(`
            Object.defineProperty(HTMLElement.prototype, 'showPopover', {
                configurable: true,
                value: undefined,
            });
            const link = document.querySelector('#skills a[href="#skills"]');
            link.href = arguments[0];
            link.click();
        `, [`${server.origin}/blog.html`]);
        await pollScript(
            session,
            `return window.location.pathname.endsWith('/blog.html');`,
            [],
            'normal navigation when the Popover API is unavailable',
        );
    },
);

/**
 * Starts a held drag so lifecycle events can prove they cancel both state and queued frames.
 *
 * @param {WebDriverSession} session Browser session under test.
 * @returns {Promise<void>}
 */
async function holdDrag(session) {
    const start = await getElementCenter(session, '#about .terminal-header');
    await session.performActions(mouseActions([
        { duration: 0, origin: 'viewport', type: 'pointerMove', x: start.x, y: start.y },
        { button: 0, type: 'pointerDown' },
        {
            duration: 50,
            origin: 'viewport',
            type: 'pointerMove',
            x: start.x + 40,
            y: start.y + 30,
        },
    ]));
    await pollScript(
        session,
        `return document.querySelector('#about').classList.contains('dragging');`,
        [],
        'the held drag to start',
    );
}

browserTest('blur and pagehide each cancel an in-progress drag', async (test_context) => {
    const session = await openPage(test_context, 1_280, 800);
    await activatePanel(session, 'about');

    for (const lifecycle_event of ['blur', 'pagehide']) {
        await holdDrag(session);
        await session.execute(`window.dispatchEvent(new Event(arguments[0]));`, [lifecycle_event]);
        equal(await session.execute(
            `return document.querySelector('#about').classList.contains('dragging');`,
            [],
        ), false);

        const transform_before = await session.execute(
            `return document.querySelector('#about').style.transform;`,
            [],
        );
        await session.performActions(mouseActions([
            { duration: 50, origin: 'pointer', type: 'pointerMove', x: 20, y: 20 },
            { button: 0, type: 'pointerUp' },
        ]));
        const transform_after = await session.execute(
            `return document.querySelector('#about').style.transform;`,
            [],
        );
        equal(transform_after, transform_before);
        await session.releaseActions();
    }
});
