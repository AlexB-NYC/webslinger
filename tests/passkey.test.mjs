import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import Passkey, { PasskeyError, decode_base64url, encode_base64url } from '../src/passkey.js';

const bytes = (...values) => Uint8Array.from(values).buffer;
const b64 = (...values) => encode_base64url(bytes(...values));
const pkc = (extra = {}) => ({ ...extra });
const credentials = (extra = {}) => ({ create() {}, get() {}, ...extra });
const passkey = (extra = {}) => new Passkey({ credentials: credentials(), public_key_credential: pkc(), secure_context: true, ...extra });

const creation_json = () => ({
    challenge: b64(1, 2, 3),
    rp: { name: 'Example' },
    user: { id: b64(4, 5), name: 'pat@example.invalid', displayName: 'Pat Example' },
    pubKeyCredParams: [{ type: 'public-key', alg: -7 }],
    excludeCredentials: [{ type: 'public-key', id: b64(6, 7), transports: ['internal'] }],
});

const request_json = () => ({
    challenge: b64(8, 9, 10),
    rpId: 'example.invalid',
    allowCredentials: [{ type: 'public-key', id: b64(11, 12), transports: ['usb'] }],
});

const as_bytes = (value) => [...new Uint8Array(value)];

test('supported reports required secure WebAuthn capabilities', () => {
    assert.equal(passkey({ secure_context: false }).supported(), false);
    assert.equal(passkey({ public_key_credential: null }).supported(), false);
    assert.equal(passkey({ credentials: { get() {} } }).supported(), false);
    assert.equal(passkey({ credentials: { create() {} } }).supported(), false);
    assert.equal(passkey().supported(), true);
});

test('capability probes forward, return false when unavailable, and swallow probe failures', async () => {
    assert.equal(await passkey({ public_key_credential: { isUserVerifyingPlatformAuthenticatorAvailable: async () => true } }).platform_available(), true);
    assert.equal(await passkey({ public_key_credential: { isConditionalMediationAvailable: async () => true } }).conditional_mediation_available(), true);
    assert.equal(await passkey({ public_key_credential: {} }).platform_available(), false);
    assert.equal(await passkey({ public_key_credential: { isConditionalMediationAvailable: async () => { throw new DOMException('no', 'NotAllowedError'); } } }).conditional_mediation_available(), false);
});

test('native JSON parsers are preferred', () => {
    const creation = { native: true };
    const request = { native: true };
    assert.equal(passkey({ public_key_credential: { parseCreationOptionsFromJSON: () => creation } }).parse_creation_options(creation_json()), creation);
    assert.equal(passkey({ public_key_credential: { parseRequestOptionsFromJSON: () => request } }).parse_request_options(request_json()), request);
});

test('fallback parsers decode JSON options without mutating input', () => {
    const registration = creation_json();
    const registration_copy = structuredClone(registration);
    const parsed_registration = passkey().parse_creation_options(registration);
    assert.deepEqual(registration, registration_copy);
    assert.deepEqual(as_bytes(parsed_registration.challenge), [1, 2, 3]);
    assert.deepEqual(as_bytes(parsed_registration.user.id), [4, 5]);
    assert.deepEqual(as_bytes(parsed_registration.excludeCredentials[0].id), [6, 7]);

    const request = request_json();
    const request_copy = structuredClone(request);
    const parsed_request = passkey().parse_request_options(request);
    assert.deepEqual(request, request_copy);
    assert.deepEqual(as_bytes(parsed_request.challenge), [8, 9, 10]);
    assert.deepEqual(as_bytes(parsed_request.allowCredentials[0].id), [11, 12]);
});

test('fallback parser rejects nonempty JSON extensions', () => {
    assert.throws(() => passkey().parse_creation_options({ ...creation_json(), extensions: { appidExclude: true } }), /JSON extension/);
    assert.throws(() => passkey().parse_request_options({ ...request_json(), extensions: { appid: 'https://example.invalid' } }), (error) => error.code === 'json_extension_parsing_unsupported');
});

test('base64url conversion is URL-safe, unpadded, offset-aware, and rejects invalid input', () => {
    const source = Uint8Array.from([0, 251, 255, 1, 2]);
    assert.equal(encode_base64url(new Uint8Array(source.buffer, 1, 2)), '-_8');
    assert.doesNotMatch(encode_base64url(bytes(251, 255)), /[+/=]/);
    assert.deepEqual(as_bytes(decode_base64url('-_8')), [251, 255]);
    assert.throws(() => decode_base64url('abc+'), (error) => error instanceof PasskeyError && error.code === 'invalid_options');
});

test('create and get forward normalized options, signal, and mediation', async () => {
    const signal = AbortSignal.abort();
    let create_request;
    let get_request;
    const subject = passkey({ credentials: credentials({ create: async (request) => { create_request = request; return { ok: true }; }, get: async (request) => { get_request = request; return { ok: true }; } }) });
    assert.deepEqual(await subject.create(creation_json(), { signal }), { ok: true });
    assert.equal(create_request.signal, signal);
    assert.deepEqual(as_bytes(create_request.publicKey.challenge), [1, 2, 3]);
    assert.deepEqual(await subject.get(request_json(), { signal, mediation: 'conditional' }), { ok: true });
    assert.equal(get_request.signal, signal);
    assert.equal(get_request.mediation, 'conditional');
});

test('invalid mediation and null results raise stable PasskeyError codes', async () => {
    await assert.rejects(() => passkey().get(request_json(), { mediation: 'maybe' }), (error) => error.code === 'invalid_mediation');
    await assert.rejects(() => passkey({ credentials: credentials({ create: async () => null }) }).create(creation_json()), (error) => error.code === 'no_credential');
    await assert.rejects(() => passkey({ credentials: credentials({ get: async () => null }) }).get(request_json()), (error) => error.code === 'no_credential');
});

test('native credential toJSON output is accepted', () => {
    const output = { id: 'credential-json' };
    assert.equal(passkey().serialize({ toJSON: () => output }), output);
});

test('manual attestation serialization returns approved JSON-safe fields', () => {
    const output = passkey().serialize({
        id: 'attestation-id',
        rawId: bytes(1),
        type: 'public-key',
        authenticatorAttachment: 'platform',
        getClientExtensionResults: () => ({ largeBlob: { supported: true, blob: bytes(2) } }),
        response: {
            clientDataJSON: bytes(3),
            attestationObject: bytes(4),
            getTransports: () => ['internal'],
            getAuthenticatorData: () => bytes(5),
            getPublicKey: () => bytes(6),
            getPublicKeyAlgorithm: () => -7,
        },
    });
    assert.deepEqual(output, {
        id: 'attestation-id', rawId: 'AQ', type: 'public-key', authenticatorAttachment: 'platform', clientExtensionResults: { largeBlob: { supported: true, blob: 'Ag' } },
        response: { clientDataJSON: 'Aw', attestationObject: 'BA', transports: ['internal'], authenticatorData: 'BQ', publicKey: 'Bg', publicKeyAlgorithm: -7 },
    });
});

test('manual assertion serialization returns approved JSON-safe fields including null userHandle', () => {
    const output = passkey().serialize({
        id: 'assertion-id', rawId: bytes(7), type: 'public-key', getClientExtensionResults: () => ({}),
        response: { clientDataJSON: bytes(8), authenticatorData: bytes(9), signature: bytes(10), userHandle: null },
    });
    assert.deepEqual(output, {
        id: 'assertion-id', rawId: 'Bw', type: 'public-key', clientExtensionResults: {},
        response: { clientDataJSON: 'CA', authenticatorData: 'CQ', signature: 'Cg', userHandle: null },
    });
});

test('Passkey source has no network behavior or unrelated imports', async () => {
    const source = await readFile(new URL('../src/passkey.js', import.meta.url), 'utf8');
    assert.doesNotMatch(source, /\b(fetch|XMLHttpRequest|WebSocket)\b/);
    assert.doesNotMatch(source, /['"]\.\/(cipher|ajax)\.js['"]/i);
    assert.doesNotMatch(source, /from ['"][^.'"]/);
});
