import { equal } from 'node:assert/strict';
import test from 'node:test';

import webdriver from './support/webdriver.js';

const { isTimeoutError } = webdriver;

test('timeout classification accepts explicit identities and rejects similar wording', () => {
    const named_timeout = new Error('The operation exceeded its deadline.');
    named_timeout.name = 'TimeoutError';

    const coded_timeout = new Error('The operation exceeded its deadline.');
    Reflect.set(coded_timeout, 'code', 'ETIMEDOUT');

    const webdriver_timeout = new Error('A WebDriver command exceeded its deadline.');
    Reflect.set(webdriver_timeout, 'code', 'script timeout');

    const poll_timeout = new Error('The expected page state did not appear.');
    Reflect.set(poll_timeout, 'code', 'UI_POLL_TIMEOUT');

    equal(isTimeoutError(named_timeout), true);
    equal(isTimeoutError(coded_timeout), true);
    equal(isTimeoutError(webdriver_timeout), true);
    equal(isTimeoutError(poll_timeout), true);

    equal(isTimeoutError(new Error('A timeout-like message is not an identity.')), false);
    equal(isTimeoutError({ code: 'ECONNRESET' }), false);
    equal(isTimeoutError(null), false);
});
