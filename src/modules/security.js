/********************************************************************************
 * Copyright (C) 2023 CoCreate and Contributors.
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
 *
 ********************************************************************************/

// Commercial Licensing Information:
// For commercial use of this software without the copyleft provisions of the AGPLv3,
// you must obtain a commercial license from CoCreate LLC.
// For details, visit <https://cocreate.app/licenses/> or contact us at sales@cocreate.app.

import crypto from 'node:crypto';
import { astAsync } from '@cocreate/utils';

export const Security = {
    generateKeyPair,
    generateJWT,
    verifySignature,
    signVapid,
    buildAuthHeaders
};

/**
 * Generates cryptographic key pairs (e.g. EC prime256v1 for VAPID/ES256, RSA, HMAC)
 * using Node's native crypto module without third-party libraries like web-push.
 */
export function generateKeyPair(type = 'vapid', options = {}) {
    if (type === 'vapid' || type === 'ec') {
        const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', {
            namedCurve: options.curve || 'prime256v1',
            publicKeyEncoding: { type: 'spki', format: 'der' },
            privateKeyEncoding: { type: 'pkcs8', format: 'der' }
        });
        
        // Formats raw base64url keys suitable for VAPID web push standards
        const rawPublicKey = publicKey.subarray(publicKey.length - 65).toString('base64url');
        const rawPrivateKey = privateKey.subarray(privateKey.length - 32).toString('base64url');
        
        return { publicKey: rawPublicKey, privateKey: rawPrivateKey };
    }
    
    return { secret: crypto.randomBytes(options.length || 32).toString('hex') };
}

/**
 * Universal AST JWT Generator: Supports HS256 (HMAC) and ES256 (ECDSA/VAPID).
 */
export function generateJWT(config = {}, secretOrPrivateKey, algorithm = 'HS256') {
    try {
        const header = config.header || { alg: algorithm, typ: 'JWT' };
        const payload = config.payload || {};
        
        const encodedHeader = Buffer.from(JSON.stringify(header)).toString('base64url');
        const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
        const signatureInput = `${encodedHeader}.${encodedPayload}`;
        
        let signature;
        if (algorithm === 'HS256') {
            const hmac = crypto.createHmac('sha256', secretOrPrivateKey);
            hmac.update(signatureInput);
            signature = hmac.digest('base64url');
        } else if (algorithm === 'ES256') {
            const sign = crypto.createSign('SHA256');
            sign.update(signatureInput);
            sign.end();
            signature = sign.sign({ key: secretOrPrivateKey, dsaEncoding: 'ieee-p1363' }, 'base64url');
        } else {
            throw new Error(`Unsupported JWT algorithm: ${algorithm}`);
        }
        
        return `${signatureInput}.${signature}`;
    } catch (err) {
        console.error('[@cocreate/security] Failed to generate JWT:', err);
        throw err;
    }
}

/**
 * Universal signature verification method (HMAC SHA256, Webhooks, API Payloads).
 */
export function verifySignature(payload, signature, secret, algorithm = 'sha256') {
    try {
        if (!payload || !signature || !secret) return false;

        const hmac = crypto.createHmac(algorithm, secret);
        hmac.update(payload);
        
        const expectedSignature = hmac.digest();
        let receivedSignature = Buffer.isBuffer(signature) ? signature : Buffer.from(signature, 'hex');

        if (receivedSignature.length !== expectedSignature.length) {
            receivedSignature = Buffer.from(signature, 'base64');
        }

        if (receivedSignature.length !== expectedSignature.length) {
            console.warn('[@cocreate/security] Signature verification rejected due to length mismatch.');
            return false;
        }
        
        return crypto.timingSafeEqual(expectedSignature, receivedSignature);
    } catch (err) {
        console.error('[@cocreate/security] Failed signature verification:', err.message);
        return false;
    }
}

/**
 * Creates AST-native Web Push VAPID authentication headers without web-push.
 */
export function signVapid(endpoint, vapidDetails) {
    const url = new URL(endpoint);
    const audience = `${url.protocol}//${url.host}`;
    const exp = Math.floor(Date.now() / 1000) + (12 * 60 * 60); // 12-hour expiration window
    
    const jwt = generateJWT({
        header: { alg: 'ES256', typ: 'JWT' },
        payload: {
            aud: audience,
            exp,
            sub: vapidDetails.subject || 'mailto:contact@cocreate.app'
        }
    }, vapidDetails.privateKey, 'ES256');

    return {
        headers: {
            'Authorization': `vapid t=${jwt}, k=${vapidDetails.publicKey}`,
            'Crypto-Key': `p256ecdsa=${vapidDetails.publicKey}`
        },
        jwt
    };
}

/**
 * Dynamically resolves authentication headers and signing profiles using AST context.
 */
export async function buildAuthHeaders(authConfig, sandboxContext) {
    if (!authConfig) return {};
    
    const resolvedAuth = await astAsync({ executeAST: authConfig, sandbox: sandboxContext });
    
    if (resolvedAuth.type === 'bearer') {
        return { 'Authorization': `Bearer ${resolvedAuth.token}` };
    }
    if (resolvedAuth.type === 'vapid') {
        return signVapid(resolvedAuth.endpoint, resolvedAuth.vapidDetails).headers;
    }
    if (resolvedAuth.type === 'jwt') {
        const token = generateJWT(resolvedAuth.config, resolvedAuth.secret, resolvedAuth.alg || 'HS256');
        return { 'Authorization': `Bearer ${token}` };
    }
    
    return resolvedAuth;
}

export default Security;