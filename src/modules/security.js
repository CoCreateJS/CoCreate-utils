import crypto from "node:crypto";
import { Buffer } from "node:buffer";

/**
 * Packs a single ASN.1 tag and length wrapper around content bytes.
 * @param {number} tag - ASN.1 tag identifier byte
 * @param {Buffer} content - Raw content payload buffer
 * @returns {Buffer} DER-encoded tag-length-value structure
 */
function derTag(tag, content) {
    let lenBytes;
    const len = content.length;

    if (len < 128) {
        lenBytes = Buffer.from([len]);
    } else if (len < 256) {
        lenBytes = Buffer.from([0x81, len]);
    } else if (len < 65536) {
        lenBytes = Buffer.from([0x82, (len >> 8) & 0xff, len & 0xff]);
    } else {
        lenBytes = Buffer.from([0x83, (len >> 16) & 0xff, (len >> 8) & 0xff, len & 0xff]);
    }

    return Buffer.concat([Buffer.from([tag]), lenBytes, content]);
}

/**
 * Packs an array of ASN.1 DER elements into a DER Sequence (0x30).
 * @param {Buffer[]} items - Array of DER-encoded element buffers
 * @returns {Buffer} DER Sequence buffer
 */
function derSequence(items) {
    return derTag(0x30, Buffer.concat(items));
}

/**
 * Packs an array of ASN.1 DER elements into a DER Set (0x31).
 * @param {Buffer[]} items - Array of DER-encoded element buffers
 * @returns {Buffer} DER Set buffer
 */
function derSet(items) {
    return derTag(0x31, Buffer.concat(items));
}

/**
 * Encodes a dot-separated Object Identifier (OID) string into DER format.
 * @param {string} oidString - Dot-separated OID string (e.g. "2.5.4.3")
 * @returns {Buffer} DER OID buffer
 */
function derOID(oidString) {
    const parts = oidString.split(".").map(Number);
    const bytes = [parts[0] * 40 + parts[1]];

    for (let i = 2; i < parts.length; i++) {
        let val = parts[i];
        const stack = [];
        stack.push(val & 0x7f);
        while ((val >>= 7) > 0) {
            stack.push((val & 0x7f) | 0x80);
        }
        bytes.push(...stack.reverse());
    }

    return derTag(0x06, Buffer.from(bytes));
}

/**
 * Universal Security Engine
 *
 * Provides atomic cryptographic primitives, ASN.1/DER certificate utilities,
 * and high-level token composers designed to be invoked directly or
 * evaluated dynamically by an Abstract System / ASC engine ($security.*).
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
     * Encodes input into Base64URL format (RFC 7515).
     * @param {any} input - Input object, string, or buffer
     * @returns {string} Base64URL encoded string
     */
    static base64urlEncode(input) {
        if (Buffer.isBuffer(input)) {
            return input.toString("base64url");
        }
        const str = typeof input === "object" ? JSON.stringify(input) : String(input);
        return Buffer.from(str, "utf8").toString("base64url");
    }

    /**
     * CamelCase alias for base64urlEncode for normalized cross-module conventions.
     * @param {any} input - Input object, string, or buffer
     * @returns {string} Base64URL encoded string
     */
    static base64UrlEncode(input) {
        return this.base64urlEncode(input);
    }

    /**
     * Decodes Base64URL string back into UTF-8 string or parsed JSON object.
     * @param {string} str - Base64URL encoded input
     * @param {boolean} [parseJson=true] - Attempt JSON parsing if true
     * @returns {any} Decoded string or parsed object
     */
    static base64urlDecode(str, parseJson = true) {
        try {
            const decoded = Buffer.from(str, "base64url").toString("utf8");
            return parseJson ? JSON.parse(decoded) : decoded;
        } catch {
            return null;
        }
    }

    /**
     * CamelCase alias for base64urlDecode for normalized cross-module conventions.
     * @param {string} str - Base64URL encoded input
     * @param {boolean} [parseJson=true] - Attempt JSON parsing if true
     * @returns {any} Decoded string or parsed object
     */
    static base64UrlDecode(str, parseJson = true) {
        return this.base64urlDecode(str, parseJson);
    }

    /**
     * Encodes input into standard Base64 format.
     * @param {any} input - Input object, string, or buffer
     * @returns {string} Base64 string
     */
    static base64Encode(input) {
        if (Buffer.isBuffer(input)) {
            return input.toString("base64");
        }
        const str = typeof input === "object" ? JSON.stringify(input) : String(input);
        return Buffer.from(str, "utf8").toString("base64");
    }

    /**
     * Encodes input into Hexadecimal format.
     * @param {any} input - Input object, string, or buffer
     * @returns {string} Hex string
     */
    static hexEncode(input) {
        if (Buffer.isBuffer(input)) {
            return input.toString("hex");
        }
        const str = typeof input === "object" ? JSON.stringify(input) : String(input);
        return Buffer.from(str, "utf8").toString("hex");
    }

    /**
     * Generates a cryptographic hash digest (SHA-256, SHA-512, MD5, etc.).
     *
     * @param {string|Buffer|Object} payload - Data to hash
     * @param {string} [algorithm='sha256'] - Hashing algorithm
     * @param {string} [digest='hex'] - Output format ('hex', 'base64', 'base64url')
     * @returns {string} Calculated digest string
     */
    static hash(payload, algorithm = "sha256", digest = "hex") {
        const data = (typeof payload === "object" && !Buffer.isBuffer(payload))
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
     * @param {string} [digest='hex'] - Output digest format ('hex', 'base64', 'base64url')
     * @returns {string} Calculated HMAC string
     */
    static signHmac(payload, secret, algorithm = "sha256", digest = "hex") {
        const data = (typeof payload === "object" && !Buffer.isBuffer(payload))
            ? JSON.stringify(payload)
            : String(payload);
        return crypto.createHmac(algorithm, secret).update(data).digest(digest);
    }

    /**
     * Dynamically generates RSA, EC, Ed25519, or X25519 key pairs.
     * @param {string} [type='rsa'] - Key algorithm type ('rsa', 'ec', 'ed25519', 'x25519')
     * @param {Object} [options={}] - Options (e.g. { modulusLength: 2048 }, { namedCurve: 'prime256v1' })
     * @returns {{publicKey: string, privateKey: string}} PEM key pair object
     */
    static generateKeyPair(type = "rsa", options = {}) {
        const algoType = type.toLowerCase();

        switch (algoType) {
            case "rsa": {
                const { modulusLength = 2048 } = options;
                return crypto.generateKeyPairSync("rsa", {
                    modulusLength,
                    publicKeyEncoding: { type: "spki", format: "pem" },
                    privateKeyEncoding: { type: "pkcs8", format: "pem" }
                });
            }
            case "ec": {
                const { namedCurve = "prime256v1" } = options;
                return crypto.generateKeyPairSync("ec", {
                    namedCurve,
                    publicKeyEncoding: { type: "spki", format: "pem" },
                    privateKeyEncoding: { type: "pkcs8", format: "pem" }
                });
            }
            case "ed25519":
            case "x25519": {
                return crypto.generateKeyPairSync(algoType, {
                    publicKeyEncoding: { type: "spki", format: "pem" },
                    privateKeyEncoding: { type: "pkcs8", format: "pem" }
                });
            }
            default:
                throw new Error(`[SECURITY] Unsupported key pair algorithm: ${type}`);
        }
    }

    /**
     * Constructs API keys with custom service prefixes and entropy lengths.
     * @param {Object} [options={}] - Options ({ prefix, byteLength, encoding })
     * @returns {{apiKey: string, secret: string, hashedKey: string}} Key details
     */
    static generateApiKey(options = {}) {
        const { prefix = "sk_", byteLength = 32, encoding = "base64url" } = options;

        const rawBytes = crypto.randomBytes(byteLength);
        const secret = rawBytes.toString(encoding);
        const apiKey = `${prefix}${secret}`;
        const hashedKey = crypto.createHash("sha256").update(apiKey).digest("hex");

        return { apiKey, secret, hashedKey };
    }

    /**
     * Validates an incoming API key against a stored SHA-256 hash in constant time.
     * @param {string} incomingApiKey - Incoming API key
     * @param {string} storedHashedKey - Expected SHA-256 hash
     * @returns {boolean} True if key matches
     */
    static verifyApiKey(incomingApiKey, storedHashedKey) {
        if (!incomingApiKey || !storedHashedKey) return false;
        const computedHash = crypto.createHash("sha256").update(incomingApiKey).digest("hex");
        return this.timingSafeEqual(computedHash, storedHashedKey);
    }

    /**
     * Generates a signed JWT with symmetric or asymmetric algorithms.
     * @param {Object} tokenEnvelope - Token envelope ({ header, payload })
     * @param {string|Buffer} secretOrPrivateKey - Key or secret
     * @param {string} [algorithm='RS256'] - JWT algorithm (HS256, RS256, ES256, etc.)
     * @returns {string} Compact signed JWT string
     */
    static generateJWT(tokenEnvelope, secretOrPrivateKey, algorithm = "RS256") {
        const { header = {}, payload = {} } = tokenEnvelope;

        const jwtHeader = { alg: algorithm, typ: "JWT", ...header };
        const encodedHeader = this.base64urlEncode(jwtHeader);
        const encodedPayload = this.base64urlEncode(payload);
        const signatureInput = `${encodedHeader}.${encodedPayload}`;

        let signature = "";

        if (algorithm.startsWith("HS")) {
            const hashAlg = algorithm === "HS512" ? "sha512" : "sha256";
            signature = crypto
                .createHmac(hashAlg, secretOrPrivateKey)
                .update(signatureInput)
                .digest("base64url");
        } else {
            const hashAlg = algorithm.startsWith("ES") ? "sha256" : (algorithm === "RS512" ? "sha512" : "sha256");
            const signer = crypto.createSign(hashAlg);
            signer.update(signatureInput);
            signer.end();
            signature = signer.sign(secretOrPrivateKey, "base64url");
        }

        return `${signatureInput}.${signature}`;
    }

    /**
     * Verifies and decodes a signed JWT token.
     * @param {string} token - Signed JWT string
     * @param {string|Buffer} secretOrPublicKey - Key or secret
     * @param {string} [algorithm='RS256'] - JWT algorithm
     * @returns {Object|null} Decoded payload object or null if invalid
     */
    static verifyJWT(token, secretOrPublicKey, algorithm = "RS256") {
        try {
            const parts = token.split(".");
            if (parts.length !== 3) return null;

            const [headerB64, payloadB64, signatureB64] = parts;
            const signatureInput = `${headerB64}.${payloadB64}`;

            let isValid = false;

            if (algorithm.startsWith("HS")) {
                const hashAlg = algorithm === "HS512" ? "sha512" : "sha256";
                const expectedSignature = crypto
                    .createHmac(hashAlg, secretOrPublicKey)
                    .update(signatureInput)
                    .digest("base64url");
                isValid = this.timingSafeEqual(signatureB64, expectedSignature);
            } else {
                const hashAlg = algorithm.startsWith("ES") ? "sha256" : (algorithm === "RS512" ? "sha512" : "sha256");
                const verifier = crypto.createVerify(hashAlg);
                verifier.update(signatureInput);
                verifier.end();
                isValid = verifier.verify(secretOrPublicKey, signatureB64, "base64url");
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
     * High-level token decoder and verifier.
     * Decodes JWT payload directly or verifies signature when secret is supplied.
     * Normalized method to prevent module-level execution errors.
     *
     * @param {string} token - Token string to decode
     * @param {string|Buffer} [secretOrPublicKey] - Optional secret/key for verification
     * @param {string} [algorithm='RS256'] - JWT algorithm
     * @returns {Object|null} Decoded payload or null
     */
    static decodeToken(token, secretOrPublicKey, algorithm = "RS256") {
        if (!token || typeof token !== "string") return null;
        if (secretOrPublicKey) {
            return this.verifyJWT(token, secretOrPublicKey, algorithm);
        }
        const parts = token.split(".");
        const payloadSegment = parts.length === 3 ? parts[1] : parts[0];
        return this.base64urlDecode(payloadSegment, true);
    }

    /**
     * Alias for verifyJWT for normalized authentication module contracts.
     */
    static verifyToken(token, secretOrPublicKey, algorithm = "RS256") {
        return this.verifyJWT(token, secretOrPublicKey, algorithm);
    }

    /**
     * Alias for generateJWT for normalized authentication module contracts.
     */
    static generateToken(tokenEnvelope, secretOrPrivateKey, algorithm = "RS256") {
        return this.generateJWT(tokenEnvelope, secretOrPrivateKey, algorithm);
    }

    /**
     * AES-256-GCM Authenticated Symmetric Encryption.
     * @param {any} payload - Plaintext payload string or object
     * @param {string|Buffer} secretKey - Passphrase or 32-byte key buffer
     * @returns {{ciphertext: string, iv: string, tag: string}} Encrypted envelope
     */
    static encrypt(payload, secretKey) {
        const key = Buffer.isBuffer(secretKey) && secretKey.length === 32
            ? secretKey
            : crypto.createHash("sha256").update(String(secretKey)).digest();
        const iv = crypto.randomBytes(12);
        const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);

        const data = typeof payload === "object" && !Buffer.isBuffer(payload)
            ? JSON.stringify(payload)
            : String(payload);

        let ciphertext = cipher.update(data, "utf8", "base64url");
        ciphertext += cipher.final("base64url");
        const tag = cipher.getAuthTag().toString("base64url");

        return {
            ciphertext,
            iv: iv.toString("base64url"),
            tag
        };
    }

    /**
     * AES-256-GCM Authenticated Symmetric Decryption.
     * @param {{ciphertext: string, iv: string, tag: string}} envelope - Encrypted envelope
     * @param {string|Buffer} secretKey - Passphrase or 32-byte key buffer
     * @param {boolean} [parseJson=true] - Attempt JSON parsing if true
     * @returns {any} Decoded plaintext string or object
     */
    static decrypt(envelope, secretKey, parseJson = true) {
        try {
            const { ciphertext, iv, tag } = envelope;
            const key = Buffer.isBuffer(secretKey) && secretKey.length === 32
                ? secretKey
                : crypto.createHash("sha256").update(String(secretKey)).digest();

            const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"));
            decipher.setAuthTag(Buffer.from(tag, "base64url"));

            let plaintext = decipher.update(ciphertext, "base64url", "utf8");
            plaintext += decipher.final("utf8");

            return parseJson ? JSON.parse(plaintext) : plaintext;
        } catch {
            return null;
        }
    }

    /**
     * Generates a DER-encoded PKCS#10 Certificate Signing Request (CSR)
     * supporting single and multi-domain (SAN) configurations for Let's Encrypt / SSL.
     *
     * @param {string|crypto.KeyObject} privateKeyInput - Domain private key (PEM or KeyObject)
     * @param {string[]} domains - List of SAN domain names (primary domain first)
     * @returns {string} Base64URL-encoded DER CSR
     */
    static createCSR(privateKeyInput, domains) {
        if (!domains || domains.length === 0) {
            throw new Error("[SECURITY] At least one domain is required to generate a CSR");
        }

        const privateKey = typeof privateKeyInput === "string"
            ? crypto.createPrivateKey(privateKeyInput)
            : privateKeyInput;

        const primaryDomain = domains[0];
        const pubKeyDetails = crypto.createPublicKey(privateKey);
        const spkiDer = pubKeyDetails.export({ type: "spki", format: "der" });

        // Subject Attribute: Common Name (CN = primaryDomain)
        const subject = derSequence([
            derSet([
                derSequence([
                    derOID("2.5.4.3"), // CommonName OID
                    derTag(0x0c, Buffer.from(primaryDomain, "utf8")) // UTF8String
                ])
            ])
        ]);

        // Extension Request: Subject Alternative Names (SAN)
        const sanEntries = domains.map(domain => derTag(0x82, Buffer.from(domain, "utf8"))); // Context primitive [2] dNSName
        const sanExtension = derSequence([
            derOID("2.5.29.17"), // subjectAltName OID
            derTag(0x04, derSequence(sanEntries)) // OCTET STRING containing SAN Sequence
        ]);

        const extensionsSequence = derSequence([sanExtension]);
        const attributeExtensionReq = derTag(0xa0, derSequence([
            derOID("1.2.840.113549.1.9.14"), // extensionRequest OID
            derSet([extensionsSequence])
        ]));

        // CertificationRequestInfo structure
        const certReqInfo = derSequence([
            derTag(0x02, Buffer.from([0x00])), // Version 0
            subject,
            spkiDer,
            attributeExtensionReq
        ]);

        // Sign CertificationRequestInfo with Domain Private Key
        const signer = crypto.createSign("SHA256");
        signer.update(certReqInfo);
        const signature = signer.sign(privateKey);

        // Signature Algorithm OID (sha256WithRSAEncryption or ecdsa-with-SHA256)
        const isEC = privateKey.asymmetricKeyType === "ec";
        const sigAlgOid = isEC ? "1.2.840.10045.4.3.2" : "1.2.840.113549.1.1.11";
        const sigAlgorithm = derSequence([
            derOID(sigAlgOid),
            isEC ? Buffer.alloc(0) : derTag(0x05, Buffer.alloc(0)) // NULL parameters for RSA
        ]);

        // PKCS#10 CertificationRequest Sequence
        const csrDer = derSequence([
            certReqInfo,
            sigAlgorithm,
            derTag(0x03, Buffer.concat([Buffer.from([0x00]), signature])) // BIT STRING
        ]);

        return this.base64urlEncode(csrDer);
    }

    /**
     * Extracts expiration Date from a PEM Certificate using native Node X509 parser.
     * @param {string|Buffer} certPem - PEM-encoded certificate
     * @returns {Date|null} Expiration date object or null if invalid
     */
    static readCertificateExpiry(certPem) {
        try {
            const x509 = new crypto.X509Certificate(certPem);
            return new Date(x509.validTo);
        } catch {
            return null;
        }
    }

    /**
     * Converts a PEM string or KeyObject into a KeyObject.
     * @param {string|crypto.KeyObject} keyInput
     * @returns {crypto.KeyObject}
     */
    static parsePrivateKey(keyInput) {
        return typeof keyInput === "string" ? crypto.createPrivateKey(keyInput) : keyInput;
    }

    /**
     * Exports a public key derived from key input as a JWK object.
     * @param {string|crypto.KeyObject} keyInput
     * @returns {Object} JWK representation
     */
    static exportJwk(keyInput) {
        const key = typeof keyInput === "string" ? crypto.createPrivateKey(keyInput) : keyInput;
        const pubKey = crypto.createPublicKey(key);
        return pubKey.export({ format: "jwk" });
    }

    /**
     * Calculates RFC 7638 SHA-256 JWK Thumbprint
     * @param {Object} jwk - JWK key object
     * @returns {string} Base64URL encoded thumbprint
     */
    static getJwkThumbprint(jwk) {
        const orderedJwk = jwk.kty === "RSA"
            ? { e: jwk.e, kty: jwk.kty, n: jwk.n }
            : { crv: jwk.crv, kty: jwk.kty, x: jwk.x, y: jwk.y };

        const hashBuf = this.hash(JSON.stringify(orderedJwk), "sha256", "buffer");
        return this.base64urlEncode(hashBuf);
    }

    /**
     * Constructs a JWS signature object for ACME RFC 8555 protocol requests.
     * @param {Object} header - Protected header fields (nonce, url, kid/jwk)
     * @param {any} payload - Body payload string or object
     * @param {string|crypto.KeyObject} privateKey - Signing private key
     * @returns {string} Stringified JOSE JSON structure { protected, payload, signature }
     */
    static createJWS(header, payload, privateKey) {
        const key = typeof privateKey === "string" ? crypto.createPrivateKey(privateKey) : privateKey;
        const isEC = key.asymmetricKeyType === "ec";
        const alg = header.alg || (isEC ? "ES256" : "RS256");

        const fullHeader = { alg, ...header };
        const protectedHeader = this.base64urlEncode(fullHeader);
        const payloadString = payload !== "" ? this.base64urlEncode(payload) : "";

        const signInput = `${protectedHeader}.${payloadString}`;
        const signer = crypto.createSign(isEC ? "sha256" : "SHA256");
        signer.update(signInput);
        const signature = this.base64urlEncode(signer.sign(key));

        return JSON.stringify({
            protected: protectedHeader,
            payload: payloadString,
            signature
        });
    }

    /**
     * Generates NIST P-256 (prime256v1) ECC key pairs for VAPID Web Push Notifications.
     * @returns {{ publicKey: string, privateKey: string }} Base64URL-encoded key pair
     */
    static generateVapidKeys() {
        const keyPair = crypto.generateKeyPairSync("ec", {
            namedCurve: "prime256v1",
            publicKeyEncoding: { type: "spki", format: "der" },
            privateKeyEncoding: { type: "pkcs8", format: "der" }
        });

        // Uncompressed EC point extraction (65 bytes)
        const pubDer = keyPair.publicKey;
        const uncompressedPoint = pubDer.subarray(pubDer.length - 65);

        return {
            publicKey: this.base64urlEncode(uncompressedPoint),
            privateKey: this.base64urlEncode(keyPair.privateKey)
        };
    }

    /**
     * Generates a VAPID token value for browser push notifications (RFC 8292).
     * Returns: "vapid t=<jwt>, k=<public_key>"
     *
     * @param {Object} options - VAPID options ({ audience, subject, expiration, publicKey })
     * @param {string|crypto.KeyObject} privateKey - VAPID private key
     * @returns {string} Formatted VAPID authorization string
     */
    static createVapidToken(options, privateKey) {
        const { audience, subject, expiration = Math.floor(Date.now() / 1000) + 43200, publicKey } = options;

        const jwt = this.generateJWT({
            header: { typ: "JWT", alg: "ES256" },
            payload: { aud: audience, sub: subject, exp: expiration }
        }, privateKey, "ES256");

        return `vapid t=${jwt}, k=${publicKey}`;
    }

    /**
     * Generates an OAuth 2.0 Client Assertion JWT (RFC 7523).
     * Standardized protocol used for service-to-service authentication across
     * Google Cloud, Salesforce, DocuSign, Okta, and enterprise OAuth 2.0 providers.
     *
     * @param {Object} options - Assertion details ({ issuer, subject, audience, scopes, expirationSeconds })
     * @param {string|crypto.KeyObject} privateKey - Signing private key
     * @param {string} [algorithm='RS256'] - Signing algorithm
     * @returns {string} Signed OAuth assertion JWT string
     */
    static createOAuthAssertion(options, privateKey, algorithm = "RS256") {
        const {
            issuer,
            subject = issuer,
            audience,
            scopes,
            expirationSeconds = 3600
        } = options;

        const now = Math.floor(Date.now() / 1000);
        const scopeString = Array.isArray(scopes) ? scopes.join(" ") : scopes;

        const payload = {
            iss: issuer,
            sub: subject,
            aud: audience,
            iat: now,
            exp: now + expirationSeconds
        };

        if (scopeString) {
            payload.scope = scopeString;
        }

        return this.generateJWT({
            header: { alg: algorithm, typ: "JWT" },
            payload
        }, privateKey, algorithm);
    }

    /**
     * Computes a standard Webhook signature string (Stripe, Twilio, GitHub).
     *
     * @param {string|Buffer|Object} payload - Raw incoming request body
     * @param {string} secret - Webhook signing secret key
     * @param {Object} [options={}] - Options ({ timestamp, algorithm, format })
     * @returns {string} Webhook signature string
     */
    static createWebhookSignature(payload, secret, options = {}) {
        const { timestamp = Math.floor(Date.now() / 1000), algorithm = "sha256", format = "stripe" } = options;
        const rawBody = typeof payload === "object" && !Buffer.isBuffer(payload) ? JSON.stringify(payload) : String(payload);

        if (format === "stripe") {
            const signatureInput = `${timestamp}.${rawBody}`;
            const signature = this.signHmac(signatureInput, secret, algorithm, "hex");
            return `t=${timestamp},v1=${signature}`;
        }

        if (format === "github") {
            const signature = this.signHmac(rawBody, secret, algorithm, "hex");
            return `sha256=${signature}`;
        }

        return this.signHmac(rawBody, secret, algorithm, "hex");
    }

    /**
     * Calculates an AWS SigV4 authorization signature string.
     *
     * @param {Object} requestDetails - Details ({ method, uri, queryParams, headers, payload, region, service })
     * @param {Object} credentials - Credentials ({ accessKeyId, secretAccessKey })
     * @returns {string} Full AWS SigV4 Authorization string
     */
    static createAwsSigV4Token(requestDetails, credentials) {
        const {
            method = "GET",
            uri = "/",
            queryParams = "",
            headers = {},
            payload = "",
            region = "us-east-1",
            service = "s3",
            isoDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, "")
        } = requestDetails;

        const dateStamp = isoDate.slice(0, 8);
        const hashedPayload = this.hash(payload, "sha256", "hex");

        const canonicalHeaders = Object.keys(headers)
            .map(k => `${k.toLowerCase()}:${headers[k].trim()}\n`)
            .sort()
            .join("");

        const signedHeaders = Object.keys(headers)
            .map(k => k.toLowerCase())
            .sort()
            .join(";");

        const canonicalRequest = [
            method.toUpperCase(),
            uri,
            queryParams,
            canonicalHeaders,
            signedHeaders,
            hashedPayload
        ].join("\n");

        const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
        const stringToSign = [
            "AWS4-HMAC-SHA256",
            isoDate,
            credentialScope,
            this.hash(canonicalRequest, "sha256", "hex")
        ].join("\n");

        const kDate = crypto.createHmac("sha256", `AWS4${credentials.secretAccessKey}`).update(dateStamp).digest();
        const kRegion = crypto.createHmac("sha256", kDate).update(region).digest();
        const kService = crypto.createHmac("sha256", kRegion).update(service).digest();
        const kSigning = crypto.createHmac("sha256", kService).update("aws4_request").digest();

        const signature = crypto.createHmac("sha256", kSigning).update(stringToSign).digest("hex");

        return `AWS4-HMAC-SHA256 Credential=${credentials.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
    }

    /**
     * Dynamic Transformation Pipeline (ASC Executor Integration)
     * Executes a chain of atomic security operations sequentially.
     *
     * @param {any} initialValue - Base input string, object, or buffer
     * @param {Array<Object>} pipelineSteps - Ordered list of dynamic operations
     * @returns {string|Buffer|Object} Final transformed token string or object
     */
    static transform(initialValue, pipelineSteps = []) {
        return pipelineSteps.reduce((acc, step) => {
            const { op, ...opts } = step;

            switch (op) {
                case "timestamp":
                    if (opts.format === "seconds") {
                        return Math.floor(Date.now() / 1000);
                    }
                    if (opts.format === "iso-basic") {
                        return new Date().toISOString().replace(/[:-]|\.\d{3}/g, "");
                    }
                    return Date.now();

                case "hash":
                    return this.hash(acc, opts.algorithm || "sha256", opts.digest || "hex");

                case "signHmac":
                    return this.signHmac(acc, opts.secret, opts.algorithm || "sha256", opts.digest || "hex");

                case "base64Encode":
                    return this.base64Encode(acc);

                case "base64urlEncode":
                    return this.base64urlEncode(acc);

                case "hexEncode":
                    return this.hexEncode(acc);

                case "encrypt":
                    return this.encrypt(acc, opts.secretKey);

                case "generateJWT":
                    return this.generateJWT(acc, opts.secretOrPrivateKey, opts.algorithm || "RS256");

                case "concat":
                case "format":
                    return `${opts.prefix || ""}${acc}${opts.suffix || ""}`;

                case "jsonStringify":
                    return JSON.stringify(acc);

                default:
                    if (typeof this[op] === "function") {
                        return this[op](acc, opts);
                    }
                    return acc;
            }
        }, initialValue);
    }
}

// Bind all static methods to Security.prototype so instance calls work
Object.getOwnPropertyNames(Security).forEach(prop => {
    if (typeof Security[prop] === "function" && prop !== "length" && prop !== "name" && prop !== "prototype") {
        Security.prototype[prop] = Security[prop].bind(Security);
    }
});

// Create a singleton instance containing class reference for hybrid object/instance/class usage
export const security = new Security();
security.Security = Security;

// Attach static methods directly onto singleton instance for fail-safe property invocation
Object.getOwnPropertyNames(Security).forEach(prop => {
    if (typeof Security[prop] === "function" && prop !== "length" && prop !== "name" && prop !== "prototype") {
        security[prop] = Security[prop].bind(Security);
    }
});

// Export all utility methods as named ESM exports for namespace imports (import * as security)
export const {
    timingSafeEqual,
    base64urlEncode,
    base64urlDecode,
    base64UrlEncode,
    base64UrlDecode,
    base64Encode,
    hexEncode,
    hash,
    signHmac,
    generateKeyPair,
    generateApiKey,
    verifyApiKey,
    generateJWT,
    verifyJWT,
    decodeToken,
    verifyToken,
    generateToken,
    encrypt,
    decrypt,
    createCSR,
    readCertificateExpiry,
    parsePrivateKey,
    exportJwk,
    getJwkThumbprint,
    createJWS,
    generateVapidKeys,
    createVapidToken,
    createOAuthAssertion,
    createWebhookSignature,
    createAwsSigV4Token,
    transform
} = Security;

// Default export provides hybrid singleton instance with bound functions and embedded Class reference
export default security;
