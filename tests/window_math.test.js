'use strict';

import { doesNotThrow, deepEqual, strictEqual, throws, equal } from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';

import window_handling from '../index.js';

const { boundPanelPosition, getVisibleHeight, selectMostVisiblePanel } = window_handling;

/**
 * @typedef {object} PositionCase
 * @property {{x: number, y: number}} expected Expected bounded target coordinates.
 * @property {number} x Unbounded horizontal input coordinate.
 * @property {number} y Unbounded vertical input coordinate.
 */

/**
 * @typedef {object} VisibilityCase
 * @property {number} expected Expected intersection height in CSS pixels.
 * @property {{bottom: number, top: number}} rect Vertical panel bounds in viewport coordinates.
 */

test('page bootstraps are inert when an ESM server has no document', () => {
    // CommonJS takes explicit export branches. A fresh VM without module/document exercises the
    // separate ESM/SSR fallthrough that previously dereferenced document during evaluation.
    const script_paths = ['../index.js', '../theme.js', '../blog.js'];

    for (const script_path of script_paths) {
        const source = readFileSync(new URL(script_path, import.meta.url), 'utf8');
        doesNotThrow(() => runInNewContext(source, { console }));
    }
});

test('window handling exports only its pure regression surface', () => {
    // A deliberately narrow API keeps browser state private while making the hard geometry rules
    // executable under Node, where failures are quicker and easier to localize than browser tests.
    deepEqual(Object.keys(window_handling).sort(), [
        'boundPanelPosition',
        'getVisibleHeight',
        'selectMostVisiblePanel',
    ]);
});

test('boundPanelPosition clamps both axes and preserves its stable target', () => {
    const bounds = { maxX: 100, maxY: 90, minX: 0, minY: 10 };
    /** @type {PositionCase[]} */
    const cases = [
        { expected: { x: 0, y: 90 }, x: -1, y: 91 },
        { expected: { x: 50, y: 50 }, x: 50, y: 50 },
        { expected: { x: 100, y: 10 }, x: 101, y: 9 },
        { expected: { x: 0, y: 90 }, x: 0, y: 90 },
    ];

    for (const test_case of cases) {
        const target = { x: 777, y: 777 };
        const result = boundPanelPosition(
            target,
            test_case.x,
            test_case.y,
            bounds,
        );

        // Identity matters because allocating a new point for every pointer frame creates avoidable
        // garbage-collector pressure in the drag hot path.
        strictEqual(result, target);
        deepEqual(target, test_case.expected);
    }
});

test('boundPanelPosition rejects non-finite positions and inverted bounds', () => {
    const target = { x: 0, y: 0 };
    const bounds = { maxX: 100, maxY: 100, minX: 0, minY: 0 };

    throws(() => {
        boundPanelPosition(target, Number.NaN, 0, bounds);
    }, TypeError);
    throws(() => {
        boundPanelPosition(target, 0, Number.POSITIVE_INFINITY, bounds);
    }, TypeError);
    throws(() => {
        boundPanelPosition(target, 0, 0, { ...bounds, minX: 101 });
    }, RangeError);
    throws(() => {
        boundPanelPosition(target, 0, 0, { ...bounds, minY: 101 });
    }, RangeError);
});

test('getVisibleHeight covers the positive and negative overlap spaces', () => {
    /** @type {VisibilityCase[]} */
    const cases = [
        { expected: 100, rect: { bottom: 250, top: 150 } },
        { expected: 50, rect: { bottom: 150, top: 50 } },
        { expected: 50, rect: { bottom: 350, top: 250 } },
        { expected: 200, rect: { bottom: 350, top: 50 } },
        { expected: 0, rect: { bottom: 100, top: 0 } },
        { expected: 0, rect: { bottom: 400, top: 300 } },
    ];

    for (const test_case of cases) {
        const result = getVisibleHeight(test_case.rect, 100, 300);
        equal(result, test_case.expected);
    }

    equal(getVisibleHeight({ bottom: 200, top: 100 }, 100, 100), 0);
    throws(() => {
        getVisibleHeight({ bottom: 0, top: 1 }, 100, 300);
    }, RangeError);
    throws(() => {
        getVisibleHeight({ bottom: 200, top: 100 }, 300, 100);
    }, RangeError);
});

test('selectMostVisiblePanel is deterministic for absence, dominance, and ties', () => {
    const first_panel = { id: 'first' };
    const second_panel = { id: 'second' };

    equal(selectMostVisiblePanel([]), null);
    equal(selectMostVisiblePanel([
        { centerDistance: 0, panel: first_panel, visibleHeight: 0 },
    ]), null);
    strictEqual(selectMostVisiblePanel([
        { centerDistance: 1, panel: first_panel, visibleHeight: 20 },
        { centerDistance: 100, panel: second_panel, visibleHeight: 21 },
    ]), second_panel);
    strictEqual(selectMostVisiblePanel([
        { centerDistance: 9, panel: first_panel, visibleHeight: 20 },
        { centerDistance: 8, panel: second_panel, visibleHeight: 20 },
    ]), second_panel);
    strictEqual(selectMostVisiblePanel([
        { centerDistance: 8, panel: first_panel, visibleHeight: 20 },
        { centerDistance: 8, panel: second_panel, visibleHeight: 20 },
    ]), first_panel);

    throws(() => selectMostVisiblePanel(null), TypeError);
    throws(() => selectMostVisiblePanel([
        { centerDistance: 0, panel: first_panel, visibleHeight: -1 },
    ]), RangeError);
});
