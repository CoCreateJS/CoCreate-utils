/********************************************************************************
 * Copyright (C) 2026 CoCreate and Contributors.
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

import { getValueFromObject } from "./getValueFromObject.js";
import { queryElements } from "./queryElements.js";

const IsomorphicGlobals = {
    Math,
    Number,
    String,
    Boolean,
    Date,
    JSON,
    Array,
    Object,
    parseInt,
    parseFloat,
    encodeURIComponent,
    decodeURIComponent,
    btoa: (str) => {
        if (typeof btoa === 'function') return btoa(String(str));
        return Buffer.from(String(str)).toString("base64");
    },
    atob: (b64) => {
        if (typeof atob === 'function') return atob(b64);
        return Buffer.from(String(b64), "base64").toString("utf-8");
    },
    concat: (...args) => args.flat().map(arg => typeof arg === 'object' ? JSON.stringify(arg) : arg).join(''),
    
    // Core Asynchronous Flow Control Operators
    await: {
        all: async (promises) => Promise.all(promises),
        any: async (promises) => Promise.any(promises),
        race: async (promises) => Promise.race(promises),
        allSettled: async (promises) => Promise.allSettled(promises),
        delay: (ms) => new Promise(resolve => setTimeout(resolve, Number(ms) || 0))
    }
};

const BrowserGlobals = {
    get $organization_id() { return typeof localStorage !== 'undefined' ? localStorage.getItem("organization_id") : ""; },
    get $user_id() { return typeof localStorage !== 'undefined' ? localStorage.getItem("user_id") : ""; },
    get $client_id() { return typeof localStorage !== 'undefined' ? localStorage.getItem("clientId") : ""; },
    get $session_id() { return typeof localStorage !== 'undefined' ? localStorage.getItem("session_id") : ""; },
    get $innerWidth() { return typeof window !== 'undefined' ? window.innerWidth : 0; },
    get $innerHeight() { return typeof window !== 'undefined' ? window.innerHeight : 0; },
    get $href() { return typeof window !== 'undefined' ? window.location.href.replace(/\/$/, "") : ""; },
    get $origin() { return typeof window !== 'undefined' ? window.location.origin : ""; },
    get $protocol() { return typeof window !== 'undefined' ? window.location.protocol : ""; },
    get $hostname() { return typeof window !== 'undefined' ? window.location.hostname : ""; },
    get $host() { return typeof window !== 'undefined' ? window.location.host : ""; },
    get $port() { return typeof window !== 'undefined' ? window.location.port : ""; },
    get $pathname() { return typeof window !== 'undefined' ? window.location.pathname.replace(/\/$/, "") : ""; },
    get $hash() { return typeof window !== 'undefined' ? window.location.hash : ""; },
    get $subdomain() {
        if (typeof window === 'undefined') return "";
        const parts = window.location.hostname.split('.');
        return parts.length > 2 ? parts[0] : "";
    },
    get $relativePath() {
        if (typeof window === 'undefined') return "./";
        const currentPath = window.location.pathname.replace(/\/[^\/]*$/, ""); 
        const depth = currentPath.split("/").filter(Boolean).length;
        return depth > 0 ? "../".repeat(depth) : "./";
    },
    get $path() {
        if (typeof window === 'undefined') return "";
        let path = window.location.pathname;
        if (path.split("/").pop().includes(".")) path = path.replace(/\/[^\/]+$/, "/");
        return path === "/" ? "" : path;
    },
    $true: () => true,
    $false: () => false,
    $parse: (value = "") => {
        try { return JSON.parse(value); } catch (e) { return value; }
    },
    $query: function(selector) {
        if (typeof document === 'undefined') return undefined;
        let element = this?.this || this?.element || null;
        if (typeof selector === 'string') {
            selector = selector.trim().replace(/^['"]|['"]$/g, '');
        }
        try {
            const results = queryElements({ element, selector });
            return results && results.length > 0 ? results[0] : undefined;
        } catch (error) {
            console.warn(`[AST Engine] Invalid $query selector => "${selector}"`, error);
            return undefined;
        }
    },
    $queryAll: function(selector) {
        if (typeof document === 'undefined') return [];
        let element = this?.this || this?.element || null;
        if (typeof selector === 'string') {
            selector = selector.trim().replace(/^['"]|['"]$/g, '');
            if (selector.includes('$document')) return [];
        }
        try {
            const results = queryElements({ element, selector });
            return results ? Array.from(results) : [];
        } catch (error) {
            console.warn(`[AST Engine] Invalid $queryAll selector => "${selector}"`, error);
            return [];
        }
    }
};

const getSandboxScope = (context) => {
    const isBrowser = typeof window !== 'undefined';
    return {
        ...IsomorphicGlobals,
        ...(isBrowser ? BrowserGlobals : {}),
        ...context
    };
};

/**
 * Universal Stateless AST Operator Engine Executor.
 * Directly imported and run symmetrically across browser and node files.
 * 
 * @param {Object} context - Transient execution state (element, data, event, custom refs)
 * @param {Any} execute - The JSON AST tree to interpret
 */
export async function processOperators(context, execute) {
    if (execute instanceof Promise) {
        execute = await execute;
    }

    if (Array.isArray(execute)) {
        const evaluatedArray = [];
        for (let i = 0; i < execute.length; i++) {
            evaluatedArray[i] = await processOperators(context, execute[i]);
        }
        return evaluatedArray;
    } else if (typeof execute === "object" && execute !== null) {
        const keys = Object.keys(execute);
        
        // Match operators starting with "$" except basic structural operators
        const operatorKey = keys.find(k => k.startsWith("$") && !["$array", "$filter", "$storage", "$database"].includes(k));
        
        if (operatorKey && keys.length === 1) {
            return await executeOperator(context, operatorKey, execute[operatorKey]);
        }

        const evaluatedObject = {};
        for (const key of keys) {
            let finalKey = key;

            if (key.startsWith("$") && !["$array", "$filter", "$storage", "$database"].includes(key)) {
                const resolvedKey = await executeOperator(context, key);
                if (typeof resolvedKey === "string" || typeof resolvedKey === "number") {
                    finalKey = String(resolvedKey);
                }
            }

            let finalValue = execute[key];
            if (typeof finalValue === "string" && finalValue.startsWith("$") && !["$array", "$filter", "$storage", "$database"].includes(finalValue)) {
                finalValue = await executeOperator(context, finalValue);
            } else if (Array.isArray(finalValue) || (typeof finalValue === "object" && finalValue !== null)) {
                finalValue = await processOperators(context, finalValue);
            }

            evaluatedObject[finalKey] = finalValue;
        }
        
        return evaluatedObject;
    } else if (typeof execute === "string" && execute.startsWith("$") && !["$array", "$filter", "$storage", "$database"].includes(execute)) {
        return await executeOperator(context, execute);
    }

    return execute;
}

async function executeOperator(context, operator, args) {
    const localContext = {
        state: {},
        ...context
    };

    // Evaluate basic context property lookups
    if (args === undefined) {
        if (operator.startsWith("$state.")) {
            return getValueFromObject(localContext.state, operator.substring(7));
        } else if (operator === "$state") {
            return localContext.state;
        } else if (operator.startsWith("$data.")) {
            return getValueFromObject(localContext.data, operator.substring(6));
        } else if (operator === "$data") {
            return localContext.data;
        } else if (operator.startsWith("$event.")) {
            return getValueFromObject(localContext.event, operator.substring(7));
        } else if (operator === "$event") {
            return localContext.event;
        } else if (operator.startsWith("$request.")) {
            return getValueFromObject(localContext.request, operator.substring(9));
        } else if (operator === "$request") {
            return localContext.request;
        } else if (operator.startsWith("$header.")) {
            const headerKey = operator.substring(8).toLowerCase();
            return localContext.request?.headers?.[headerKey];
        } else if (operator === "$rawBody") {
            return localContext.rawBody;
        } else if (operator === "$this") {
            return localContext.this || localContext.element;
        } else if (operator === "$value") {
            const el = localContext.this || localContext.element;
            return el && typeof el.getValue === 'function' ? el.getValue() : "";
        }
    }

    let isExplicitNew = false;
    let cleanPath = operator.startsWith("$") ? operator.substring(1) : operator;
    
    if (cleanPath.startsWith("new.")) {
        isExplicitNew = true;
        cleanPath = cleanPath.substring(4);
    }
    
    const parts = cleanPath.split('.');
    const SandboxScope = getSandboxScope(localContext);

    let target = SandboxScope[parts[0]];
    let parentContext = SandboxScope;

    if (target !== undefined) {
        for (let i = 1; i < parts.length; i++) {
            parentContext = target;
            target = target[parts[i]];
            if (target === undefined) break;
        }

        if (typeof target === 'function') {
            let argsArray = [];
            if (args !== undefined) {
                // Intercept human-friendly parameter keywords ($args, $arguments)
                if (typeof args === 'object' && args !== null && (args.$args !== undefined || args.$arguments !== undefined)) {
                    const explicitArgs = args.$args !== undefined ? args.$args : args.$arguments;
                    
                    if (Array.isArray(explicitArgs)) {
                        argsArray = [];
                        for (let i = 0; i < explicitArgs.length; i++) {
                            argsArray.push(await processOperators(localContext, explicitArgs[i]));
                        }
                    } else {
                        const evaluatedSingle = await processOperators(localContext, explicitArgs);
                        argsArray = [evaluatedSingle];
                    }
                } else {
                    const evaluatedSingle = await processOperators(localContext, args);
                    argsArray = [evaluatedSingle];
                }
            }
            
            const isEs6Class = /^\s*class\s+/.test(target.toString());
            
            if (isExplicitNew || isEs6Class) {
                return new target(...argsArray);
            }

            // Implicit auto-await globally executes any resolved function natively
            return await target.apply(localContext, argsArray);
        } else if (target !== undefined) {
            return target;
        }
    }

    return operator;
}

export { processOperators as processOperatorsAsync }; // Alias for async usage
export const customOperators = {}; // Stateless fallback placeholder registry
export default processOperators;
