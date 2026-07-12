'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { setTimeout: delay } = require('node:timers/promises');

/**
 * @typedef {object} DriverProbeOptions
 * @property {string | null} driver_path Explicit ChromeDriver path, or null to probe known paths.
 * @property {number} probe_timeout_ms Maximum time allowed for each version probe.
 */

/**
 * @typedef {object} WebDriverOptions
 * @property {number} command_timeout_ms Maximum time allowed for one protocol command.
 * @property {number} commands_max Maximum commands allowed across the fixture lifetime.
 * @property {string | null} driver_path Explicit ChromeDriver path, or null to probe known paths.
 * @property {string} host Loopback host used by ChromeDriver.
 * @property {number} probe_timeout_ms Maximum time allowed for each version probe.
 * @property {boolean} required Whether an absent driver must fail the run.
 * @property {number} sessions_max Maximum simultaneous browser sessions.
 * @property {number} shutdown_timeout_ms Maximum time allowed for each shutdown stage.
 * @property {number} startup_attempts_max Maximum readiness probes before startup fails.
 * @property {number} startup_interval_ms Delay between readiness probes.
 * @property {number} stderr_length_max Maximum retained ChromeDriver diagnostic characters.
 */

/**
 * @typedef {object} WebDriverCommand
 * @property {unknown} [body] Optional JSON-serializable request body.
 * @property {string} method HTTP method required by the WebDriver endpoint.
 * @property {string} name Human-readable command name used in diagnostics.
 * @property {string} path Absolute WebDriver endpoint path.
 */

/**
 * @typedef {object} WebDriverState
 * @property {number} command_count Commands issued during this fixture lifetime.
 * @property {string} origin ChromeDriver HTTP origin.
 * @property {import('node:child_process').ChildProcess} process ChromeDriver child process.
 * @property {Error | null} spawn_error Asynchronous process-spawn failure, when present.
 * @property {string} stderr Bounded tail of ChromeDriver diagnostics.
 */

/**
 * @typedef {object} WebDriverSession
 * @property {() => Promise<void>} close Deletes this isolated browser session.
 * @property {(script: string, args: unknown[]) => Promise<any>} execute Runs synchronous script.
 * @property {(url: string) => Promise<unknown>} navigate Navigates the top-level browsing context.
 * @property {(actions: object[]) => Promise<unknown>} performActions Sends W3C input actions.
 * @property {() => Promise<unknown>} releaseActions Releases every active input source.
 * @property {(rect: object) => Promise<unknown>} setWindowRect Sets the outer browser rectangle.
 */

/**
 * @typedef {object} WebDriverManager
 * @property {() => Promise<void>} close Closes sessions and the ChromeDriver process.
 * @property {(options: {browser_arguments: string[]}) => Promise<WebDriverSession>} createSession
 * Creates one isolated browser session.
 * @property {WebDriverOptions} options Explicit bounds and timeouts owned by the fixture.
 * @property {(command: WebDriverCommand) => Promise<any>} send Sends one protocol command.
 * @property {Set<WebDriverSession>} sessions Live sessions owned by the fixture.
 * @property {WebDriverState} state ChromeDriver process and diagnostic state.
 */

/**
 * Builds a short, deterministic candidate list instead of searching the host filesystem.
 *
 * @param {DriverProbeOptions} options Explicit driver path and probe deadline.
 * @returns {string[]} Unique executable candidates in deterministic preference order.
 */
function getDriverCandidates(options) {
    const executable_name = process.platform === 'win32' ? 'chromedriver.exe' : 'chromedriver';
    const runner_directory = process.env.CHROMEWEBDRIVER;
    const candidates = [
        options.driver_path,
        process.env.CHROMEDRIVER_BIN,
        runner_directory ? path.join(runner_directory, executable_name) : null,
        'chromedriver',
        '/usr/local/share/chromedriver-linux64/chromedriver',
    ].filter((candidate) => typeof candidate === 'string' && candidate.length > 0);

    assert.ok(candidates.length <= 5);
    return [...new Set(candidates)];
}

/**
 * Probes each fixed candidate with a bounded command because PATH entries may be stale.
 *
 * @param {DriverProbeOptions} options Explicit driver path and probe deadline.
 * @returns {string | null} First working executable, or null when none is available.
 */
function resolveDriverPath(options) {
    for (const candidate of getDriverCandidates(options)) {
        if (path.isAbsolute(candidate) && !fs.existsSync(candidate)) continue;

        const result = spawnSync(candidate, ['--version'], {
            encoding: 'utf8',
            timeout: options.probe_timeout_ms,
            windowsHide: true,
        });
        if (!result.error && result.status === 0) return candidate;
    }

    return null;
}

/**
 * Allows the test declarations to mark optional local browser cases as skipped up front.
 *
 * @param {DriverProbeOptions} options Explicit driver path and probe deadline.
 * @returns {boolean} Whether a candidate executes successfully within the deadline.
 */
function isWebDriverAvailable(options) {
    return resolveDriverPath(options) !== null;
}

/**
 * Reserves a loopback port briefly so parallel host services are unlikely to collide.
 *
 * @param {string} host Loopback host on which to reserve the port.
 * @returns {Promise<number>} Ephemeral port selected by the operating system.
 */
async function reservePort(host) {
    const server = http.createServer((_request, response) => response.end());
    await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen({ exclusive: true, host, port: 0 }, resolve);
    });

    const address = server.address();
    assert.equal(typeof address, 'object');
    assert.notEqual(address, null);
    await new Promise((resolve, reject) => server.close((error) => {
        if (error) reject(error);
        else resolve();
    }));
    return address.port;
}

/**
 * Waits a fixed number of times and reports ChromeDriver diagnostics on failure.
 *
 * @param {WebDriverState} state ChromeDriver process and diagnostic state.
 * @param {WebDriverOptions} options Explicit startup bounds and command deadline.
 * @returns {Promise<void>}
 */
async function waitForDriver(state, options) {
    let last_error = null;

    for (let attempt = 0; attempt < options.startup_attempts_max; attempt += 1) {
        if (state.spawn_error) throw state.spawn_error;
        if (state.process.exitCode !== null) {
            throw new Error(`ChromeDriver exited early with code ${state.process.exitCode}.`);
        }

        try {
            const response = await fetch(`${state.origin}/status`, {
                method: 'GET',
                signal: AbortSignal.timeout(options.command_timeout_ms),
            });
            if (response.ok) return;
            last_error = new Error(`ChromeDriver status returned HTTP ${response.status}.`);
        } catch (error) {
            last_error = error;
        }

        await delay(options.startup_interval_ms);
    }

    const detail = state.stderr.trim() || last_error?.message || 'No diagnostics were reported.';
    throw new Error(`ChromeDriver did not become ready: ${detail}`);
}

/**
 * Parses a WebDriver response strictly so protocol errors retain their command context.
 *
 * @param {Response} response HTTP response returned by ChromeDriver.
 * @param {string} command_name Human-readable command name used in diagnostics.
 * @returns {Promise<any>} WebDriver protocol value.
 */
async function readWebDriverResponse(response, command_name) {
    const response_text = await response.text();
    let payload;
    try {
        payload = response_text ? JSON.parse(response_text) : { value: null };
    } catch (_parse_error) {
        throw new Error(`${command_name} returned invalid JSON: ${response_text.slice(0, 200)}`);
    }

    const webdriver_error = payload?.value?.error;
    if (!response.ok || webdriver_error) {
        const message = payload?.value?.message ?? `HTTP ${response.status}`;
        throw new Error(`${command_name} failed: ${message}`);
    }
    return payload.value;
}

/**
 * Sends one bounded command and limits total commands to catch accidental polling explosions.
 *
 * @param {WebDriverState} state ChromeDriver process and diagnostic state.
 * @param {WebDriverOptions} options Explicit command-count and timeout bounds.
 * @param {WebDriverCommand} command Protocol command to send.
 * @returns {Promise<any>} WebDriver protocol value.
 */
async function sendWebDriverCommand(state, options, command) {
    state.command_count += 1;
    if (state.command_count > options.commands_max) {
        throw new Error(`WebDriver command limit ${options.commands_max} exceeded.`);
    }

    const headers = { accept: 'application/json' };
    const request = {
        headers,
        method: command.method,
        signal: AbortSignal.timeout(options.command_timeout_ms),
    };
    if (command.body !== undefined) {
        headers['content-type'] = 'application/json; charset=utf-8';
        request.body = JSON.stringify(command.body);
    }

    const response = await fetch(`${state.origin}${command.path}`, request);
    return readWebDriverResponse(response, command.name);
}

/**
 * Waits for one child-process exit without leaving a timer or listener behind.
 *
 * @param {import('node:child_process').ChildProcess} child_process Process being reaped.
 * @param {number} timeout_ms Maximum time allowed for this shutdown stage.
 * @returns {Promise<boolean>} Whether the process exited before the deadline.
 */
function waitForProcessExit(child_process, timeout_ms) {
    if (child_process.exitCode !== null) return Promise.resolve(true);

    return new Promise((resolve) => {
        const onExit = () => finish(true);
        const timeout = setTimeout(() => finish(false), timeout_ms);
        const finish = (did_exit) => {
            clearTimeout(timeout);
            child_process.removeListener('exit', onExit);
            resolve(did_exit);
        };

        child_process.once('exit', onExit);
    });
}

/**
 * Gives ChromeDriver a short graceful exit before forcefully ending the test-only process.
 *
 * @param {import('node:child_process').ChildProcess} child_process ChromeDriver process.
 * @param {number} shutdown_timeout_ms Maximum time allowed for each shutdown stage.
 * @returns {Promise<void>}
 */
async function stopDriverProcess(child_process, shutdown_timeout_ms) {
    if (child_process.exitCode !== null) return;

    child_process.kill();
    if (await waitForProcessExit(child_process, shutdown_timeout_ms)) return;

    child_process.kill('SIGKILL');
    if (await waitForProcessExit(child_process, shutdown_timeout_ms)) return;

    throw new Error('ChromeDriver did not exit after it was forcefully terminated.');
}

/**
 * Wraps the small WebDriver surface used by these tests and nothing more.
 *
 * @param {WebDriverManager} manager Fixture that owns protocol transport and live sessions.
 * @param {string} session_id Identifier returned by ChromeDriver.
 * @returns {WebDriverSession}
 */
function createSessionApi(manager, session_id) {
    const prefix = `/session/${encodeURIComponent(session_id)}`;
    let is_closed = false;
    const send = (name, method, suffix, body) => manager.send({
        body,
        method,
        name,
        path: `${prefix}${suffix}`,
    });

    const session = {
        execute: (script, args) => send('execute script', 'POST', '/execute/sync', {
            args,
            script,
        }),
        navigate: (url) => send('navigate', 'POST', '/url', { url }),
        performActions: (actions) => send('perform actions', 'POST', '/actions', { actions }),
        releaseActions: () => send('release actions', 'DELETE', '/actions'),
        setWindowRect: (rect) => send('set window rect', 'POST', '/window/rect', rect),
    };
    session.close = async () => {
        if (is_closed) return;
        is_closed = true;
        manager.sessions.delete(session);
        await send('delete session', 'DELETE', '');
    };
    return session;
}

/**
 * Creates one isolated browser session so failed pointer state cannot bleed between tests.
 *
 * @param {WebDriverManager} manager Fixture that owns protocol transport and live sessions.
 * @param {{browser_arguments: string[]}} session_options Explicit Chrome launch arguments.
 * @returns {Promise<WebDriverSession>}
 */
async function createSession(manager, session_options) {
    if (manager.sessions.size >= manager.options.sessions_max) {
        throw new Error(`WebDriver session limit ${manager.options.sessions_max} exceeded.`);
    }

    const value = await manager.send({
        body: {
            capabilities: {
                alwaysMatch: {
                    browserName: 'chrome',
                    pageLoadStrategy: 'eager',
                    'goog:chromeOptions': { args: session_options.browser_arguments },
                },
            },
        },
        method: 'POST',
        name: 'create session',
        path: '/session',
    });
    if (typeof value?.sessionId !== 'string') {
        throw new Error('ChromeDriver did not return a WebDriver session ID.');
    }

    const session = createSessionApi(manager, value.sessionId);
    manager.sessions.add(session);
    return session;
}

/**
 * Closes leaked sessions before the driver, preserving the first cleanup error for the caller.
 *
 * @param {WebDriverManager} manager Fixture that owns all resources being released.
 * @returns {Promise<void>}
 */
async function closeManager(manager) {
    let cleanup_error = null;
    for (const session of [...manager.sessions]) {
        try {
            await session.close();
        } catch (error) {
            cleanup_error ??= error;
        }
    }

    await stopDriverProcess(manager.state.process, manager.options.shutdown_timeout_ms);
    if (cleanup_error) throw cleanup_error;
}

/**
 * Starts ChromeDriver, or returns null only when an optional local driver is genuinely absent.
 *
 * @param {WebDriverOptions} options Explicit lifecycle, resource, and timeout bounds.
 * @returns {Promise<WebDriverManager | null>}
 */
async function startWebDriver(options) {
    const driver_path = resolveDriverPath(options);
    if (!driver_path) {
        if (options.required) throw new Error('ChromeDriver is required but was not found.');
        return null;
    }

    const port = await reservePort(options.host);
    const child_process = spawn(driver_path, [`--port=${port}`], {
        stdio: ['ignore', 'ignore', 'pipe'],
        windowsHide: true,
    });
    const state = {
        command_count: 0,
        origin: `http://${options.host}:${port}`,
        process: child_process,
        spawn_error: null,
        stderr: '',
    };
    child_process.once('error', (error) => {
        state.spawn_error = error;
    });
    child_process.stderr.setEncoding('utf8');
    child_process.stderr.on('data', (chunk) => {
        state.stderr = `${state.stderr}${chunk}`.slice(-options.stderr_length_max);
    });

    try {
        await waitForDriver(state, options);
    } catch (error) {
        await stopDriverProcess(child_process, options.shutdown_timeout_ms);
        throw error;
    }

    const manager = { options, sessions: new Set(), state };
    manager.send = (command) => sendWebDriverCommand(state, options, command);
    manager.createSession = (session_options) => createSession(manager, session_options);
    manager.close = () => closeManager(manager);
    return manager;
}

module.exports = { isWebDriverAvailable, startWebDriver };
