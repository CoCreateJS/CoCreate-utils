/********************************************************************************
 * Copyright (C) 2023-2026 CoCreate and Contributors.
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published
 * by the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 ********************************************************************************/

import crypto from 'node:crypto';

/**
 * Universal Security Engine
 *
 * Provides atomic, single-purpose cryptographic and encoding primitives
 * designed to be dynamically composed by an Abstract System / ASC engine.
 * Avoids monolithic "magic" header functions in favor of modular operations.
 */
export class Security {

    /**
     * Constant-time comparison between two string or Buffer values.
     * Guards against timing side-channel attacks during verification.
     *
     * @param {string|Buffer} a - First comparison value
     * @param {string|Buffer} b - Second comparison value
     * @returns {boolean} True if values match identically
     */
    static timingSafeEqual(a, b) {
        if (typeof a !== typeof b) return false;

        const bufA = Buffer.isBuffer(a) ? a : Buffer.from(String(a));
        const bufB = Buffer.isBuffer(b) ? b : Buffer.from(String(b));

        if (bufA.length !== bufB.length) {
            crypto.timingSafeEqual(bufA, bufA);
            return false;
        }

        return crypto.timingSafeEqual(bufA, bufB);
    }

    /**
     * Encodes input into Base64URL format.
     */
    static base64urlEncode(input) {
        const str = (typeof input === 'object' && !Buffer.isBuffer(input)) 
            ? JSON.stringify(input) 
            : String(input);
        return Buffer.from(str).toString('base64url');
    }

    /**
     * Decodes Base64URL string back into UTF-8 string or parsed JSON.
     */
    static base64urlDecode(str, parseJson = true) {
        try {
            const decoded = Buffer.from(str, 'base64url').toString('utf8');
            return parseJson ? JSON.parse(decoded) : decoded;
        } catch {
            return null;
        }
    }

    /**
     * Encodes input into standard Base64 format.
     */
    static base64Encode(input) {
        const str = (typeof input === 'object' && !Buffer.isBuffer(input)) 
            ? JSON.stringify(input) 
            : String(input);
        return Buffer.from(str).toString('base64');
    }

    /**
     * Encodes input into Hexadecimal format.
     */
    static hexEncode(input) {
        const str = (typeof input === 'object' && !Buffer.isBuffer(input)) 
            ? JSON.stringify(input) 
            : String(input);
        return Buffer.from(str).toString('hex');
    }

    /**
     * Generates a cryptographic hash digest (SHA-256, SHA-512, MD5, etc.).
     *
     * @param {string|Buffer|Object} payload - Data to hash
     * @param {string} [algorithm='sha256'] - Hashing algorithm
     * @param {string} [digest='hex'] - Output format ('hex', 'base64', 'base64url')
     * @returns {string} Calculated digest string
     */
    static hash(payload, algorithm = 'sha256', digest = 'hex') {
        const data = (typeof payload === 'object' && !Buffer.isBuffer(payload))
            ? JSON.stringify(payload)
            : String(payload);
        return crypto.createHash(algorithm).update(data).digest(digest);
    }

    /**
     * Generates an HMAC signature using a shared secret.
     *
     * @param {string|Buffer|Object} payload - Data to sign
     * @param {string|Buffer} secret - Shared secret key
     * @param {string} [algorithm='sha256'] - HMAC algorithm
     * @param {string} [digest='hex'] - Output digest format
     * @returns {string} Calculated HMAC string
     */
    static signHmac(payload, secret, algorithm = 'sha256', digest = 'hex') {
        const data = (typeof payload === 'object' && !Buffer.isBuffer(payload))
            ? JSON.stringify(payload)
            : String(payload);
        return crypto.createHmac(algorithm, secret).update(data).digest(digest);
    }

    /**
     * Dynamically generates RSA, EC, Ed25519, or X25519 key pairs.
     */
    static generateKeyPair(type = 'rsa', options = {}) {
        const algoType = type.toLowerCase();

        switch (algoType) {
            case 'rsa': {
                const { modulusLength = 2048 } = options;
                return crypto.generateKeyPairSync('rsa', {
                    modulusLength,
                    publicKeyEncoding: { type: 'spki', format: 'pem' },
                    privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
                });
            }
            case 'ec': {
                const { namedCurve = 'prime256v1' } = options;
                return crypto.generateKeyPairSync('ec', {
                    namedCurve,
                    publicKeyEncoding: { type: 'spki', format: 'pem' },
                    privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
                });
            }
            case 'ed25519':
            case 'x25519': {
                return crypto.generateKeyPairSync(algoType, {
                    publicKeyEncoding: { type: 'spki', format: 'pem' },
                    privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
                });
            }
            default:
                throw new Error(`[SECURITY] Unsupported key pair algorithm: ${type}`);
        }
    }

    /**
     * Constructs API keys with custom service prefixes and entropy lengths.
     */
    static generateApiKey(options = {}) {
        const { prefix = 'sk_', byteLength = 32, encoding = 'base64url' } = options;
        
        const rawBytes = crypto.randomBytes(byteLength);
        const secret = rawBytes.toString(encoding);
        const apiKey = `${prefix}${secret}`;
        const hashedKey = crypto.createHash('sha256').update(apiKey).digest('hex');

        return { apiKey, secret, hashedKey };
    }

    /**
     * Validates an incoming API key against a stored SHA-256 hash in constant time.
     */
    static verifyApiKey(incomingApiKey, storedHashedKey) {
        if (!incomingApiKey || !storedHashedKey) return false;
        const computedHash = crypto.createHash('sha256').update(incomingApiKey).digest('hex');
        return this.timingSafeEqual(computedHash, storedHashedKey);
    }

    /**
     * Generates a signed JWT with standard or asymmetric algorithms (RS256, HS256, ES256, EdDSA).
     */
    static generateJWT(tokenEnvelope, secretOrPrivateKey, algorithm = 'RS256') {
        const { header = {}, payload = {} } = tokenEnvelope;

        const jwtHeader = { alg: algorithm, typ: 'JWT', ...header };
        const encodedHeader = this.base64urlEncode(jwtHeader);
        const encodedPayload = this.base64urlEncode(payload);
        const signatureInput = `${encodedHeader}.${encodedPayload}`;

        let signature = '';

        if (algorithm.startsWith('HS')) {
            const hashAlg = algorithm === 'HS512' ? 'sha512' : 'sha256';
            signature = crypto
                .createHmac(hashAlg, secretOrPrivateKey)
                .update(signatureInput)
                .digest('base64url');
        } else {
            const hashAlg = algorithm.startsWith('ES') ? 'sha256' : (algorithm === 'RS512' ? 'sha512' : 'sha256');
            const signer = crypto.createSign(hashAlg);
            signer.update(signatureInput);
            signer.end();
            signature = signer.sign(secretOrPrivateKey, 'base64url');
        }

        return `${signatureInput}.${signature}`;
    }

    /**
     * Verifies and decodes a JWT token.
     */
    static verifyJWT(token, secretOrPublicKey, algorithm = 'RS256') {
        try {
            const parts = token.split('.');
            if (parts.length !== 3) return null;

            const [headerB64, payloadB64, signatureB64] = parts;
            const signatureInput = `${headerB64}.${payloadB64}`;

            let isValid = false;

            if (algorithm.startsWith('HS')) {
                const hashAlg = algorithm === 'HS512' ? 'sha512' : 'sha256';
                const expectedSignature = crypto
                    .createHmac(hashAlg, secretOrPublicKey)
                    .update(signatureInput)
                    .digest('base64url');
                isValid = this.timingSafeEqual(signatureB64, expectedSignature);
            } else {
                const hashAlg = algorithm.startsWith('ES') ? 'sha256' : (algorithm === 'RS512' ? 'sha512' : 'sha256');
                const verifier = crypto.createVerify(hashAlg);
                verifier.update(signatureInput);
                verifier.end();
                isValid = verifier.verify(secretOrPublicKey, signatureB64, 'base64url');
            }

            if (!isValid) return null;

            const payload = this.base64urlDecode(payloadB64);
            if (payload && payload.exp && (payload.exp * 1000) < Date.now()) {
                return null;
            }

            return payload;
        } catch {
            return null;
        }
    }

    /**
     * AES-256-GCM Authenticated Symmetric Encryption.
     */
    static encrypt(data, secretKey) {
        const key = Buffer.isBuffer(secretKey) && secretKey.length === 32 
            ? secretKey 
            : crypto.createHash('sha256').update(String(secretKey)).digest();

        const iv = crypto.randomBytes(12);
        const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

        const plaintext = (typeof data === 'object') ? JSON.stringify(data) : String(data);
        let ciphertext = cipher.update(plaintext, 'utf8', 'base64url');
        ciphertext += cipher.final('base64url');

        const tag = cipher.getAuthTag().toString('base64url');

        return { ciphertext, iv: iv.toString('base64url'), tag, alg: 'aes-256-gcm' };
    }

    /**
     * AES-256-GCM Authenticated Symmetric Decryption.
     */
    static decrypt(envelope, secretKey, parseJson = true) {
        try {
            const { ciphertext, iv, tag } = envelope;
            const key = Buffer.isBuffer(secretKey) && secretKey.length === 32 
                ? secretKey 
                : crypto.createHash('sha256').update(String(secretKey)).digest();

            const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url'));
            decipher.setAuthTag(Buffer.from(tag, 'base64url'));

            let plaintext = decipher.update(ciphertext, 'base64url', 'utf8');
            plaintext += decipher.final('utf8');

            return parseJson ? JSON.parse(plaintext) : plaintext;
        } catch {
            return null;
        }
    }

    /**
     * Dynamic Transformation Pipeline (ASC Executor Integration)
     * Executes a chain of atomic security operations sequentially.
     * Allows the ASC engine to dynamically construct complex tokens without magic code.
     *
     * Example Pipeline Steps:
     * [
     *   { op: 'timestamp', format: 'seconds' },
     *   { op: 'concat', prefix: 'POST\n/api/v1\n' },
     *   { op: 'signHmac', secret: 'my-secret', algorithm: 'sha256', digest: 'base64' },
     *   { op: 'format', prefix: 'Bearer ' }
     * ]
     *
     * @param {any} initialValue - Base input string, object, or buffer
     * @param {Array<Object>} pipelineSteps - Ordered list of dynamic operations
     * @returns {string|Buffer|Object} Final transformed token/header value
     */
    static transform(initialValue, pipelineSteps = []) {
        return pipelineSteps.reduce((acc, step) => {
            const { op, ...opts } = step;

            switch (op) {
                case 'timestamp':
                    return opts.format === 'seconds' 
                        ? Math.floor(Date.now() / 1000) 
                        : Date.now();

                case 'hash':
                    return this.hash(acc, opts.algorithm || 'sha256', opts.digest || 'hex');

                case 'signHmac':
                    return this.signHmac(acc, opts.secret, opts.algorithm || 'sha256', opts.digest || 'hex');

                case 'base64Encode':
                    return this.base64Encode(acc);

                case 'base64urlEncode':
                    return this.base64urlEncode(acc);

                case 'hexEncode':
                    return this.hexEncode(acc);

                case 'encrypt':
                    return this.encrypt(acc, opts.secretKey);

                case 'generateJWT':
                    return this.generateJWT(acc, opts.secretOrPrivateKey, opts.algorithm || 'RS256');

                case 'concat':
                    return `${opts.prefix || ''}${acc}${opts.suffix || ''}`;

                case 'format':
                    return `${opts.prefix || ''}${acc}${opts.suffix || ''}`;

                case 'jsonStringify':
                    return JSON.stringify(acc);

                default:
                    if (typeof this[op] === 'function') {
                        return this[op](acc, opts);
                    }
                    return acc;
            }
        }, initialValue);
    }
}

// Default export manifest
export default Security;