/********************************************************************************
 * Copyright (C) 2026 CoCreate LLC and Contributors.
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

// Strict validation patterns for IPv4 and IPv6 addresses
const IPV4_REGEX = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
const IPV6_REGEX = /^(?:[a-fA-F0-9]{1,4}:){7}[a-fA-F0-9]{1,4}$/;

// Operational defaults and fallback configurations
const DEFAULT_TIMEOUT_MS = 3000;
const LOCAL_FALLBACK_IP = "127.0.0.1";
const SESSION_STORAGE_KEY = "client_info";

// Single environment flags
const isBrowser = typeof window !== "undefined" && typeof window.document !== "undefined";
const isNode = typeof process !== "undefined" && process.versions && !!process.versions.node;

// Single ordered list of rich JSON geolocation providers
const PROVIDERS = [
    {
        name: "ipapi.co",
        url: "https://ipapi.co/json/",
        parser: (data) => ({
            ip: data.ip,
            city: data.city,
            region: data.region,
            country: data.country_name,
            countryCode: data.country_code,
            latitude: data.latitude ? parseFloat(data.latitude) : null,
            longitude: data.longitude ? parseFloat(data.longitude) : null,
            timezone: data.timezone,
            org: data.org || data.asn,
        })
    },
    {
        name: "ip-api.com",
        url: "http://ip-api.com/json/?fields=status,message,country,countryCode,region,regionName,city,lat,lon,timezone,isp,org,query",
        parser: (data) => {
            if (data.status !== "success") return null;
            return {
                ip: data.query,
                city: data.city,
                region: data.regionName,
                country: data.country,
                countryCode: data.countryCode,
                latitude: data.lat ? parseFloat(data.lat) : null,
                longitude: data.lon ? parseFloat(data.lon) : null,
                timezone: data.timezone,
                org: data.org || data.isp,
            };
        }
    },
    {
        name: "ipwho.is",
        url: "https://ipwho.is/",
        parser: (data) => {
            if (!data.success) return null;
            return {
                ip: data.ip,
                city: data.city,
                region: data.region,
                country: data.country,
                countryCode: data.country_code,
                latitude: data.latitude ? parseFloat(data.latitude) : null,
                longitude: data.longitude ? parseFloat(data.longitude) : null,
                timezone: data.timezone?.id,
                org: data.connection?.isp || data.connection?.org,
            };
        }
    },
    {
        name: "my-ip.io",
        url: "https://api.my-ip.io/v2/ip.json",
        parser: (data) => {
            if (!data || !data.success) return null;
            return {
                ip: data.ip,
                city: data.city,
                region: data.region,
                country: data.country?.name,
                countryCode: data.country?.code,
                latitude: data.location?.lat ? parseFloat(data.location.lat) : null,
                longitude: data.location?.lon ? parseFloat(data.location.lon) : null,
                timezone: data.timeZone,
                org: data.asn?.name,
            };
        }
    }
];

/**
 * Internal helper to perform fetch requests with an AbortSignal timeout.
 */
async function fetchWithTimeout(url, timeoutMs = DEFAULT_TIMEOUT_MS) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const response = await fetch(url, {
            signal: controller.signal,
            headers: { "Accept": "application/json, text/plain, */*" }
        });
        clearTimeout(timeoutId);
        return response;
    } catch (err) {
        clearTimeout(timeoutId);
        throw err;
    }
}

/**
 * Internal helper to validate IPv4 and IPv6 strings.
 */
function isValidIP(ip) {
    if (typeof ip !== "string") return false;
    const cleanIp = ip.trim();
    return IPV4_REGEX.test(cleanIp) || IPV6_REGEX.test(cleanIp);
}

/**
 * Inspects node OS network interfaces to find a valid non-internal local IP.
 */
function getLocalNodeIP() {
    if (!isNode) return null;
    try {
        const req = typeof __non_webpack_require__ !== "undefined" ? __non_webpack_require__ : require;
        const os = req("os");
        const interfaces = os.networkInterfaces();
        for (const interfaceName of Object.keys(interfaces)) {
            for (const iface of interfaces[interfaceName]) {
                if (!iface.internal && iface.family === "IPv4" && iface.address) {
                    return iface.address;
                }
            }
        }
    } catch (e) {
        // Fallback gracefully if restricted
    }
    return null;
}

/**
 * Formats data into a normalized client information payload.
 */
function normalizeInfoPayload(rawData = {}, sourceProvider = "unknown", isPartial = false, isLocal = false) {
    return {
        ip: rawData.ip || LOCAL_FALLBACK_IP,
        city: rawData.city || null,
        region: rawData.region || null,
        country: rawData.country || null,
        countryCode: rawData.countryCode || null,
        latitude: typeof rawData.latitude === "number" ? rawData.latitude : null,
        longitude: typeof rawData.longitude === "number" ? rawData.longitude : null,
        timezone: rawData.timezone || null,
        org: rawData.org || null,
        source: sourceProvider,
        isPartial,
        isLocal,
        timestamp: Date.now()
    };
}

/**
 * Internal resolver that attempts provider endpoints sequentially.
 */
async function fetchClientInfo(options = {}) {
    const timeout = options.timeout || DEFAULT_TIMEOUT_MS;

    // Single iteration loop over ordered JSON providers
    for (const provider of PROVIDERS) {
        try {
            const res = await fetchWithTimeout(provider.url, timeout);
            if (res.ok) {
                const json = await res.json();
                const parsed = provider.parser(json);

                if (parsed && isValidIP(parsed.ip)) {
                    const isPartial = Boolean(provider.isPartial || !parsed.city);
                    return normalizeInfoPayload(parsed, provider.name, isPartial, false);
                }
            }
        } catch (err) {
            // Fail silently and try the next provider
        }
    }

    // Local Interface Fallback if all external APIs fail
    const localNodeIp = getLocalNodeIP();
    const finalIp = localNodeIp || LOCAL_FALLBACK_IP;

    return normalizeInfoPayload({ ip: finalIp }, localNodeIp ? "node:os" : "fallback", true, true);
}

// Single set of module-level references for active promise and resolved payload
let cachedInfoPromise = null;
let cachedInfoPayload = null;

/**
 * Single unified function to retrieve client IP, location, and network metadata.
 * Returns the same in-memory object reference across calls.
 * 
 * @param {Object} [options]
 * @param {number} [options.timeout=3000] Hard timeout limit per request (ms)
 * @param {boolean} [options.bypassCache=false] Force a fresh network request
 * @returns {Promise<Object>} Standardized location object
 */
export async function getClientInfo(options = {}) {
    const { bypassCache = false } = options;

    // 1. Return existing in-memory object reference if available
    if (!bypassCache && cachedInfoPayload) {
        return cachedInfoPayload;
    }

    // 2. Return active in-flight request promise if currently executing
    if (!bypassCache && cachedInfoPromise) {
        return cachedInfoPromise;
    }

    // 3. Rehydrate from browser sessionStorage across page refreshes
    if (!bypassCache && isBrowser) {
        try {
            const stored = sessionStorage.getItem(SESSION_STORAGE_KEY);
            if (stored) {
                const parsed = JSON.parse(stored);
                if (parsed && isValidIP(parsed.ip)) {
                    cachedInfoPayload = parsed;
                    return cachedInfoPayload;
                }
            }
        } catch (e) {
            // Fall back silently
        }
    }

    // 4. Fetch fresh network data, assign to cachedInfoPayload, and persist to sessionStorage
    cachedInfoPromise = fetchClientInfo(options).then((info) => {
        cachedInfoPayload = info;
        cachedInfoPromise = null;

        if (isBrowser) {
            try {
                sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(info));
            } catch (e) {
                // Ignore storage errors
            }
        }
        return cachedInfoPayload;
    }).catch((err) => {
        cachedInfoPromise = null;
        throw err;
    });

    return cachedInfoPromise;
}

// Automatically listen for browser network reconnects to refresh location data
if (isBrowser) {
    window.addEventListener("online", () => {
        getClientInfo({ bypassCache: true }).catch(() => {
            // Suppress background reconnect error
        });
    });
}

// Export single unified function
export default getClientInfo;