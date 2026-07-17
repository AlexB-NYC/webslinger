import assert from 'node:assert/strict';
import test from 'node:test';

import Ajax from '../src/ajax.js';

const successful_response = (body='ok') => ({
    ok: true,
    status: 200,
    text: async () => body,
});

const capture_fetch = (test_context, response_body='ok') => {
    const calls = [];

    test_context.mock.method(console, 'log', () => {});
    test_context.mock.method(globalThis, 'fetch', async (...args) => {
        calls.push(args);
        return successful_response(response_body);
    });

    return calls;
};

test('go defaults to form encoding with the session token in the body', async (test_context) => {
    const calls = capture_fetch(test_context);
    const ajax = new Ajax('session token');
    const data = { name: 'Alex & Co' };

    await ajax.go('/api/example', data);

    assert.deepEqual(data, { name: 'Alex & Co' });
    assert.deepEqual(calls[0], [
        '/api/example',
        {
            method: 'POST',
            credentials: 'same-origin',
            headers: {
                'Content-type': 'application/x-www-form-urlencoded',
            },
            body: 'name=Alex%20%26%20Co&session_token=session%20token',
        },
    ]);
});

test('go can form encode without adding the session token', async (test_context) => {
    const calls = capture_fetch(test_context);
    const ajax = new Ajax('session-token');

    await ajax.go('/api/example', { value: 'one two' }, 'POST', {
        use_session_token: false,
    });

    assert.equal(calls[0][0], '/api/example');
    assert.equal(calls[0][1].body, 'value=one%20two');
    assert.equal(calls[0][1].headers['Content-type'], 'application/x-www-form-urlencoded');
});

test('go can preserve a raw body without adding the session token', async (test_context) => {
    const calls = capture_fetch(test_context);
    const ajax = new Ajax('session-token');
    const raw_body = JSON.stringify({ value: true });

    await ajax.go('/api/example', raw_body, 'POST', {
        form_encode: false,
        use_session_token: false,
    });

    assert.deepEqual(calls[0], [
        '/api/example',
        {
            method: 'POST',
            credentials: 'same-origin',
            body: raw_body,
        },
    ]);
});

test('go adds the session token to the URL when preserving a raw body', async (test_context) => {
    const calls = capture_fetch(test_context);
    const ajax = new Ajax('session token');
    const raw_body = 'raw-body';

    await ajax.go('/api/example?mode=raw#result', raw_body, 'POST', {
        form_encode: false,
    });

    assert.equal(
        calls[0][0],
        '/api/example?mode=raw&session_token=session%20token#result',
    );
    assert.equal(calls[0][1].body, raw_body);
    assert.equal(calls[0][1].headers, undefined);
});

test('GET and HEAD requests never receive a body', async (test_context) => {
    const calls = capture_fetch(test_context);
    const ajax = new Ajax('session-token');

    await ajax.go('/api/example', { ignored: true }, 'get');
    await ajax.head('/api/example', { use_session_token: false });

    assert.deepEqual(calls[0], [
        '/api/example?session_token=session-token',
        {
            method: 'GET',
            credentials: 'same-origin',
        },
    ]);
    assert.deepEqual(calls[1], [
        '/api/example',
        {
            method: 'HEAD',
            credentials: 'same-origin',
        },
    ]);
});

test('json and post forward request options and parse JSON responses', async (test_context) => {
    const calls = capture_fetch(test_context, '{"accepted":true}');
    const ajax = new Ajax('session-token');
    const raw_body = '{"value":1}';

    const result = await ajax.post('/api/example', raw_body, {
        form_encode: false,
        use_session_token: false,
    });

    assert.deepEqual(result, { accepted: true });
    assert.equal(calls[0][0], '/api/example');
    assert.equal(calls[0][1].body, raw_body);
});
