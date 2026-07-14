import { equal, notEqual } from 'node:assert/strict';
import { createReadStream, promises, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { resolve as _resolve, extname, sep } from 'node:path';

const content_types = new Map([
    ['.css', 'text/css; charset=utf-8'],
    ['.gif', 'image/gif'],
    ['.html', 'text/html; charset=utf-8'],
    ['.jpg', 'image/jpeg'],
    ['.js', 'text/javascript; charset=utf-8'],
    ['.json', 'application/json; charset=utf-8'],
    ['.md', 'text/markdown; charset=utf-8'],
    ['.png', 'image/png'],
    ['.svg', 'image/svg+xml'],
    ['.webp', 'image/webp'],
]);

/**
 * @typedef {object} StaticServerOptions
 * @property {number} close_timeout_ms Maximum time allowed for a graceful shutdown.
 * @property {number} connections_max Maximum concurrent connections accepted by the fixture.
 * @property {number} headers_timeout_ms Maximum time allowed for complete request headers.
 * @property {string} host Loopback host on which the fixture listens.
 * @property {number} keep_alive_timeout_ms Maximum idle time for a keep-alive connection.
 * @property {number} request_timeout_ms Maximum time allowed for a complete request.
 * @property {string} root_path Directory exposed by the fixture.
 */

/**
 * @typedef {object} StaticServer
 * @property {() => Promise<void>} close Closes the listener and every remaining connection.
 * @property {string} origin Origin used by the browser tests.
 */

/**
 * Sends one complete error response so malformed requests cannot leave sockets hanging.
 *
 * @param {http.ServerResponse} response Response owned by the current request.
 * @param {number} status_code HTTP status code sent to the client.
 * @param {string} message Plain-text diagnostic sent to the client.
 * @returns {void}
 */
function sendError(response, status_code, message) {
    if (response.headersSent) {
        response.destroy();
        return;
    }

    response.writeHead(status_code, {
        'cache-control': 'no-store',
        'content-length': Buffer.byteLength(message),
        'content-type': 'text/plain; charset=utf-8',
    });

    response.end(message);
}

/**
 * Resolves a request without allowing encoded or platform-specific traversal outside the root.
 *
 * @param {string} root_path Absolute directory exposed by the fixture.
 * @param {string} request_url URL supplied by the loopback client.
 * @returns {string | null} An absolute file path, or null when the path escapes the root.
 */
function resolveRequestPath(root_path, request_url) {
    const url = new URL(request_url, 'http://127.0.0.1');
    const pathname = decodeURIComponent(url.pathname);
    const relative_path = pathname === '/' ? 'index.html' : pathname.slice(1);
    const file_path = _resolve(root_path, relative_path);
    const root_prefix = `${root_path}${sep}`;

    if (file_path === root_path) return null;
    if (!file_path.startsWith(root_prefix)) return null;
    return file_path;
}

/**
 * Serves only regular files because directory listings would make test behavior host-dependent.
 *
 * @param {http.IncomingMessage} request Request received by the loopback fixture.
 * @param {http.ServerResponse} response Response paired with the request.
 * @param {string} root_path Absolute directory exposed by the fixture.
 * @returns {Promise<void>}
 */
async function handleRequest(request, response, root_path) {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
        sendError(response, 405, 'Method not allowed.\n');
        return;
    }

    let file_path;

    try {
        file_path = resolveRequestPath(root_path, request.url ?? '/');
    } catch (_invalid_url_error) {
        sendError(response, 400, 'Invalid request path.\n');
        return;
    }

    if (!file_path) {
        sendError(response, 403, 'Request path is outside the test root.\n');
        return;
    }

    let file_stats;

    try {
        file_stats = await promises.stat(file_path);
    } catch (error) {
        if (error.code === 'ENOENT') {
            sendError(response, 404, 'File not found.\n');
            return;
        }
        throw error;
    }

    if (!file_stats.isFile()) {
        sendError(response, 404, 'File not found.\n');
        return;
    }

    response.writeHead(200, {
        'cache-control': 'no-store',
        'content-length': file_stats.size,
        'content-type': content_types.get(extname(file_path)) ??
            'application/octet-stream',
    });

    if (request.method === 'HEAD') {
        response.end();
        return;
    }

    const stream = createReadStream(file_path);
    stream.on('error', (error) => response.destroy(error));
    stream.pipe(response);
}

/**
 * Closes the server within a fixed deadline so a failed browser cannot stall the test process.
 *
 * @param {http.Server} server Server owned by the test fixture.
 * @param {number} close_timeout_ms Maximum time allowed for a graceful shutdown.
 * @returns {Promise<void>}
 */
function closeServer(server, close_timeout_ms) {
    if (!server.listening) return Promise.resolve();

    return new Promise((resolve) => {
        let is_complete = false;

        const finish = () => {
            if (is_complete) return;
            is_complete = true;
            clearTimeout(timeout);
            resolve();
        };

        const timeout = setTimeout(() => {
            server.closeAllConnections();
            finish();
        }, close_timeout_ms);

        server.close(finish);
    });
}

/**
 * Starts a deliberately small loopback-only server for the real-browser regression tests.
 *
 * @param {StaticServerOptions} options Explicit resource and timeout bounds for the fixture.
 * @returns {Promise<StaticServer>}
 */
async function startStaticServer(options) {
    const root_path = _resolve(options.root_path);
    equal(statSync(root_path).isDirectory(), true);

    const server = createServer((request, response) => {
        void handleRequest(request, response, root_path).catch((error) => {
            sendError(response, 500, `Static server failed: ${error.message}\n`);
        });
    });

    server.headersTimeout = options.headers_timeout_ms;
    server.keepAliveTimeout = options.keep_alive_timeout_ms;
    server.maxConnections = options.connections_max;
    server.requestTimeout = options.request_timeout_ms;
    server.on('clientError', (_error, socket) => socket.destroy());

    await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen({ exclusive: true, host: options.host, port: 0 }, resolve);
    });

    const address = server.address();
    equal(typeof address, 'object');
    notEqual(address, null);

    return {
        close: () => closeServer(server, options.close_timeout_ms),
        origin: `http://${options.host}:${address.port}`,
    };
}

export default { startStaticServer };
