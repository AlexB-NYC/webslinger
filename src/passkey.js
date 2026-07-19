import { create_logger } from './logger.js';

const logger = create_logger('Passkey');
const mediation_values = new Set(['silent', 'optional', 'required', 'conditional']);

export class PasskeyError extends Error {
    constructor(code, message, { cause } = {}) {
        super(message);
        this.name = 'PasskeyError';
        this.code = code;
        this.cause_name = cause?.name || cause?.constructor?.name || null;
    }
}

const is_buffer_source = (value) => (
    value instanceof ArrayBuffer || ArrayBuffer.isView(value)
);

const clone_view = (value) => {
    if (value instanceof ArrayBuffer) {
        return value.slice(0);
    }
    if (ArrayBuffer.isView(value)) {
        return value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength);
    }
    return value;
};

const bytes_from_buffer_source = (value) => {
    if (value instanceof ArrayBuffer) {
        return new Uint8Array(value);
    }
    if (ArrayBuffer.isView(value)) {
        return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    }
    throw new PasskeyError('invalid_options', 'Expected a BufferSource value.');
};

const has_nonempty_extensions = (options) => (
    options?.extensions && Object.keys(options.extensions).length > 0
);

const clone_value = (value) => {
    if (is_buffer_source(value)) { return clone_view(value); }
    if (Array.isArray(value)) { return value.map(clone_value); }
    if (value && typeof value === 'object') {
        return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, clone_value(entry)]));
    }
    return value;
};

const clone_extensions = (extensions) => (
    extensions && Object.keys(extensions).length ? clone_value(extensions) : undefined
);

const copy_descriptor = (descriptor) => ({
    ...descriptor,
    id: typeof descriptor.id === 'string' ? decode_base64url(descriptor.id) : clone_view(descriptor.id),
    transports: descriptor.transports ? [...descriptor.transports] : descriptor.transports,
});

const copy_buffer_fields = (value) => {
    if (is_buffer_source(value)) {
        return encode_base64url(value);
    }
    if (Array.isArray(value)) {
        return value.map(copy_buffer_fields);
    }
    if (value && typeof value === 'object') {
        return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, copy_buffer_fields(entry)]));
    }
    return value;
};

export const encode_base64url = (value) => {
    const bytes = bytes_from_buffer_source(value);
    let binary = '';
    for (const byte of bytes) {
        binary += String.fromCharCode(byte);
    }
    return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
};

export const decode_base64url = (value) => {
    if (typeof value !== 'string') {
        throw new PasskeyError('invalid_options', 'Expected a Base64URL string.');
    }
    if (!/^[A-Za-z0-9_-]*={0,2}$/.test(value) || /=/.test(value.slice(0, -2))) {
        throw new PasskeyError('invalid_options', 'Invalid Base64URL string.');
    }
    const unpadded = value.replace(/=+$/, '');
    if (unpadded.length % 4 === 1) {
        throw new PasskeyError('invalid_options', 'Invalid Base64URL string.');
    }
    const padded = unpadded.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat((4 - (unpadded.length % 4)) % 4);
    try {
        const binary = atob(padded);
        const bytes = new Uint8Array(binary.length);
        for (let index = 0; index < binary.length; index += 1) {
            bytes[index] = binary.charCodeAt(index);
        }
        return bytes.buffer;
    } catch (error) {
        throw new PasskeyError('invalid_options', 'Invalid Base64URL string.', { cause: error });
    }
};

class Passkey {
    constructor({ credentials = globalThis.navigator?.credentials ?? null, public_key_credential = globalThis.PublicKeyCredential ?? null, secure_context = globalThis.isSecureContext === true } = {}) {
        this.credentials = credentials;
        this.public_key_credential = public_key_credential;
        this.secure_context = secure_context;
    }

    supported = () => (
        this.secure_context === true
        && Boolean(this.public_key_credential)
        && Boolean(this.credentials)
        && typeof this.credentials.create === 'function'
        && typeof this.credentials.get === 'function'
    );

    _assert_supported = () => {
        if (this.secure_context !== true) {
            throw new PasskeyError('insecure_context', 'WebAuthn requires a secure browser context.');
        }
        if (!this.supported()) {
            throw new PasskeyError('unsupported', 'The required browser credential APIs are unavailable.');
        }
    };

    platform_available = async () => this._probe('platform_available', 'isUserVerifyingPlatformAuthenticatorAvailable');

    conditional_mediation_available = async () => this._probe('conditional_mediation_available', 'isConditionalMediationAvailable');

    _probe = async (probe_name, method_name) => {
        logger.debug('Capability probe started', { probe_name });
        if (!this.supported() || typeof this.public_key_credential?.[method_name] !== 'function') {
            logger.debug('Capability probe completed', { probe_name, available: false });
            return false;
        }
        try {
            const available = await this.public_key_credential[method_name]();
            logger.debug('Capability probe completed', { probe_name, available: Boolean(available) });
            return Boolean(available);
        } catch (error) {
            logger.debug('Capability probe failed', { probe_name, error_name: error?.name || error?.constructor?.name || 'Error' });
            return false;
        }
    };

    parse_creation_options = (json_options) => {
        if (typeof json_options?.challenge === 'string') {
            if (typeof this.public_key_credential?.parseCreationOptionsFromJSON === 'function') {
                return this.public_key_credential.parseCreationOptionsFromJSON(json_options);
            }
            if (has_nonempty_extensions(json_options)) {
                throw new PasskeyError('json_extension_parsing_unsupported', 'JSON extension parsing requires native browser support.');
            }
            return {
                ...json_options,
                challenge: decode_base64url(json_options.challenge),
                user: { ...json_options.user, id: decode_base64url(json_options.user?.id) },
                excludeCredentials: json_options.excludeCredentials?.map(copy_descriptor),
                extensions: clone_extensions(json_options.extensions),
            };
        }
        if (is_buffer_source(json_options?.challenge)) {
            return {
                ...json_options,
                challenge: clone_view(json_options.challenge),
                user: { ...json_options.user, id: clone_view(json_options.user?.id) },
                excludeCredentials: json_options.excludeCredentials?.map(copy_descriptor),
                extensions: clone_extensions(json_options.extensions),
            };
        }
        throw new PasskeyError('invalid_options', 'Invalid registration options.');
    };

    parse_request_options = (json_options) => {
        if (typeof json_options?.challenge === 'string') {
            if (typeof this.public_key_credential?.parseRequestOptionsFromJSON === 'function') {
                return this.public_key_credential.parseRequestOptionsFromJSON(json_options);
            }
            if (has_nonempty_extensions(json_options)) {
                throw new PasskeyError('json_extension_parsing_unsupported', 'JSON extension parsing requires native browser support.');
            }
            return {
                ...json_options,
                challenge: decode_base64url(json_options.challenge),
                allowCredentials: json_options.allowCredentials?.map(copy_descriptor),
                extensions: clone_extensions(json_options.extensions),
            };
        }
        if (is_buffer_source(json_options?.challenge)) {
            return {
                ...json_options,
                challenge: clone_view(json_options.challenge),
                allowCredentials: json_options.allowCredentials?.map(copy_descriptor),
                extensions: clone_extensions(json_options.extensions),
            };
        }
        throw new PasskeyError('invalid_options', 'Invalid authentication options.');
    };

    create = async (public_key_options, { signal } = {}) => {
        this._assert_supported();
        const publicKey = this.parse_creation_options(public_key_options);
        const request = signal ? { publicKey, signal } : { publicKey };
        logger.info('Registration operation started');
        try {
            const credential = await this.credentials.create(request);
            if (!credential) {
                throw new PasskeyError('no_credential', 'The browser credential operation returned null.');
            }
            logger.info('Registration operation completed');
            return credential;
        } catch (error) {
            logger.error('Operation failed', { operation: 'create', error_name: error?.name || error?.constructor?.name || 'Error' });
            throw error;
        }
    };

    get = async (public_key_options, { signal, mediation } = {}) => {
        this._assert_supported();
        if (mediation !== undefined && !mediation_values.has(mediation)) {
            throw new PasskeyError('invalid_mediation', 'The requested mediation value is unsupported.');
        }
        const publicKey = this.parse_request_options(public_key_options);
        const request = { publicKey };
        if (signal) { request.signal = signal; }
        if (mediation) { request.mediation = mediation; }
        logger.info('Authentication operation started');
        try {
            const credential = await this.credentials.get(request);
            if (!credential) {
                throw new PasskeyError('no_credential', 'The browser credential operation returned null.');
            }
            logger.info('Authentication operation completed');
            return credential;
        } catch (error) {
            logger.error('Operation failed', { operation: 'get', error_name: error?.name || error?.constructor?.name || 'Error' });
            throw error;
        }
    };

    serialize = (credential) => {
        if (typeof credential?.toJSON === 'function') {
            const json = credential.toJSON();
            if (json && typeof json === 'object') {
                return json;
            }
        }
        if (credential?.type !== 'public-key' || !credential.rawId || !credential.response) {
            throw new PasskeyError('invalid_credential', 'The supplied object is not a serializable public-key credential.');
        }
        const response = credential.response;
        const output = {
            id: credential.id,
            rawId: encode_base64url(credential.rawId),
            type: credential.type,
            response: {},
            clientExtensionResults: copy_buffer_fields(credential.getClientExtensionResults?.() ?? {}),
        };
        if (credential.authenticatorAttachment != null) {
            output.authenticatorAttachment = credential.authenticatorAttachment;
        }
        if (response.attestationObject) {
            output.response.clientDataJSON = encode_base64url(response.clientDataJSON);
            output.response.attestationObject = encode_base64url(response.attestationObject);
            output.response.transports = response.getTransports?.() ?? [];
            const authenticatorData = response.getAuthenticatorData?.();
            if (authenticatorData) { output.response.authenticatorData = encode_base64url(authenticatorData); }
            const publicKey = response.getPublicKey?.();
            if (publicKey) { output.response.publicKey = encode_base64url(publicKey); }
            const algorithm = response.getPublicKeyAlgorithm?.();
            if (typeof algorithm === 'number') { output.response.publicKeyAlgorithm = algorithm; }
            return output;
        }
        if (response.authenticatorData && response.signature) {
            output.response.clientDataJSON = encode_base64url(response.clientDataJSON);
            output.response.authenticatorData = encode_base64url(response.authenticatorData);
            output.response.signature = encode_base64url(response.signature);
            output.response.userHandle = response.userHandle == null ? null : encode_base64url(response.userHandle);
            return output;
        }
        throw new PasskeyError('invalid_credential', 'The supplied object is not a serializable public-key credential.');
    };
}

export default Passkey;
