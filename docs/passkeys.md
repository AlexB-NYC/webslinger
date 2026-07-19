# Passkeys

Webslinger exposes a dedicated `Passkey` capability as `webslinger.passkey`. Subclasses inherit the same capability automatically, so an application class such as `class DPAMail extends Webslinger {}` can call `dpamail.passkey`.

## Overview

WebAuthn passkey registration begins on a relying-party server, which issues `PublicKeyCredentialCreationOptions` with a fresh challenge, RP information, and a user handle. The browser and authenticator create a credential with `navigator.credentials.create()`, then the application sends the serialized attestation response back to the server for verification and storage. Authentication similarly starts with server-issued `PublicKeyCredentialRequestOptions`; the browser obtains an assertion with `navigator.credentials.get()`, and the server verifies the signature, challenge, origin, RP ID, counters, and replay protections.

## Why Passkey is separate from Cipher

Passkeys orchestrate browser credential ceremonies. Authenticator cryptography, private keys, and user verification stay inside the authenticator and browser platform. `Cipher` remains for Webslinger-owned encryption behavior; it does not parse WebAuthn credentials or serialize passkey responses.

## Browser and deployment requirements

Passkey operations require a secure context such as HTTPS or a browser-recognized local development origin. The relying party is responsible for choosing and validating the origin and RP ID. Deploy passkeys on a permanent hostname because changing a production hostname or RP ID can make previously registered credentials unusable. Examples use only `example.invalid` identities.

```js
const webslinger = new Webslinger();

if (webslinger.passkey.supported()) {
    const has_platform_authenticator = await webslinger.passkey.platform_available();
    const can_use_conditional = await webslinger.passkey.conditional_mediation_available();
}
```

## Registration

The server must generate the registration options and later verify the response. Webslinger only converts options, invokes the browser API, and serializes the browser result.

```js
const registration_options = await get_registration_options_from_server();
const credential = await webslinger.passkey.create(registration_options);
const payload = webslinger.passkey.serialize(credential);
await send_registration_response_to_server(payload);
```

## Authentication

```js
const request_options = await get_authentication_options_from_server();
const assertion = await webslinger.passkey.get(request_options);
const payload = webslinger.passkey.serialize(assertion);
await send_authentication_response_to_server(payload);
```

## JSON and native options

`parse_creation_options()` and `parse_request_options()` accept server JSON options that encode BufferSource fields as Base64URL strings. They also accept already-native options that contain `ArrayBuffer` or typed-array values. When available, native browser helpers `PublicKeyCredential.parseCreationOptionsFromJSON()` and `PublicKeyCredential.parseRequestOptionsFromJSON()` are used. Without those helpers, Webslinger decodes the standard challenge and credential ID fields; nonempty JSON extensions fail with `json_extension_parsing_unsupported` so extension bytes are not passed through incorrectly.

## AbortSignal and conditional mediation

```js
const controller = new AbortController();
const credential = await webslinger.passkey.create(registration_options, {
    signal: controller.signal,
});

const assertion = await webslinger.passkey.get(request_options, {
    signal: controller.signal,
    mediation: 'conditional',
});
```

Supported mediation values are `silent`, `optional`, `required`, and `conditional`. Browser exceptions such as `NotAllowedError` and `AbortError` are rethrown unchanged so applications can handle user cancellation or aborted operations directly.

## Serialization

`serialize()` prefers `credential.toJSON()` when the browser provides it. Otherwise it returns JSON-safe Base64URL fields for registration attestation and authentication assertion responses. Webslinger does not inspect authenticator internals, expose biometrics, or access private keys.

## PasskeyError codes

- `insecure_context` — WebAuthn requires a secure browser context.
- `unsupported` — required browser credential APIs are unavailable.
- `invalid_options` — registration or request options are incompatible.
- `json_extension_parsing_unsupported` — fallback parsing cannot safely convert nonempty JSON extension inputs.
- `invalid_credential` — the supplied object is not a serializable public-key credential.
- `invalid_mediation` — the requested mediation value is unsupported.
- `no_credential` — the browser credential operation returned null.

## Server responsibilities

A production relying-party server must issue fresh challenges, bind them to sessions, validate origin and RP ID, verify attestation or assertion signatures, maintain signature counters where appropriate, store credential public keys and identifiers, and prevent replay. Webslinger does not provide server-side WebAuthn verification, challenge generation, credential storage, password authentication, one-time-password authentication, or enrollment UI.
