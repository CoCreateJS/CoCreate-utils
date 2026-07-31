import { getValueFromObject } from "../getValueFromObject.js";
import { queryElements } from "../queryElements.js";
import { 
    processOperators, 
    processOperatorsAsync, 
    unpackTokens, 
    setASTEvaluators, 
    customOperators 
} from "./operators.js";

export const isomorphicSandbox = {
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
        all: async (promises) => {
            if (promises && typeof promises === 'object' && !Array.isArray(promises)) {
                const keys = Object.keys(promises);
                const results = await Promise.all(keys.map(key => promises[key]));
                return Object.fromEntries(keys.map((key, i) => [key, results[i]]));
            }
            return Promise.all(Array.isArray(promises) ? promises : [promises]);
        },
        any: async (promises) => {
            if (promises && typeof promises === 'object' && !Array.isArray(promises)) {
                return Promise.any(Object.values(promises));
            }
            return Promise.any(Array.isArray(promises) ? promises : [promises]);
        },
        race: async (promises) => {
            if (promises && typeof promises === 'object' && !Array.isArray(promises)) {
                return Promise.race(Object.values(promises));
            }
            return Promise.race(Array.isArray(promises) ? promises : [promises]);
        },
        allSettled: async (promises) => {
            if (promises && typeof promises === 'object' && !Array.isArray(promises)) {
                const keys = Object.keys(promises);
                const results = await Promise.allSettled(keys.map(key => promises[key]));
                return Object.fromEntries(keys.map((key, i) => [key, results[i]]));
            }
            return Promise.allSettled(Array.isArray(promises) ? promises : [promises]);
        },
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
    $parse: (value = "") => {
        try { return JSON.parse(value); } catch (e) { return value; }
    },
    $query: function(selector) {
        if (typeof document === 'undefined') return undefined;
        let element = this?.element || null;
        if (typeof selector === 'string') {
            selector = selector.trim().replace(/^['"]|['']$/g, '');
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
        let element = this?.element || null;
        if (typeof selector === 'string') {
            selector = selector.trim().replace(/^['"]|['']$/g, '');
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

const isBrowser = typeof window !== 'undefined';
let baseSandboxScope = isBrowser ? Object.setPrototypeOf(BrowserGlobals, isomorphicSandbox) : isomorphicSandbox;

export function astSync({ executeAST, sandbox, node, registry } = {}) {
    const targetNode = executeAST !== undefined ? executeAST : node;
    if (targetNode === null || targetNode === undefined) return targetNode;

    if (!registry) {
        registry = sandbox instanceof Map ? sandbox : new Map(Object.entries(sandbox || {}));
    }

    // Leaf String Evaluator: route to OperatorJS engine
    if (typeof targetNode === "string") {
        if (targetNode.includes("$") || targetNode.includes("ObjectId()")) {
            let resolved = processOperators(node || null, targetNode, [], null, [], registry);
            return unpackTokens(resolved, registry);
        }
        return targetNode;
    }

    // List Evaluator: maps items sequentially in a synchronous pipeline
    if (Array.isArray(targetNode)) {
        return targetNode.map(item => astSync({ executeAST: item, sandbox, node, registry }));
    }

    if (typeof targetNode === "object") {
        if (targetNode instanceof Date || targetNode instanceof RegExp) {
            return targetNode;
        }

        const keys = Object.keys(targetNode);
        
        // Context Function/Operator Evaluation for single key objects
        if (keys.length === 1) {
            const key = keys[0];
            const isPrefixed = key.startsWith("$") && !["$array", "$filter", "$storage", "$database"].includes(key);
            const prefixedKey = isPrefixed ? key : `$${key}`;

            let opFunc = registry.get(key) || registry.get(prefixedKey) ||
                         customOperators.get(key) || customOperators.get(prefixedKey) ||
                         (sandbox && typeof sandbox === 'object' ? (sandbox[key] || sandbox[prefixedKey]) : undefined);

            if (opFunc !== undefined) {
                const evaluatedParam = astSync({ executeAST: targetNode[key], sandbox, node, registry });
                let opCtx = { element: node, registry };
                if (typeof opFunc === "function") {
                    const args = Array.isArray(evaluatedParam) ? evaluatedParam : [evaluatedParam];

                    // Pre-check for ES6 Class syntax
                    const isNativeClass = /^class\s|^class{/.test(Function.prototype.toString.call(opFunc));
                    if (isNativeClass) {
                        return new opFunc(...args);
                    }

                    // Attempt invocation as function, fallback to constructor on TypeError
                    try {
                        return opFunc.call(opCtx, evaluatedParam);
                    } catch (e) {
                        if (e instanceof TypeError && /cannot be invoked without 'new'|class constructor/i.test(e.message)) {
                            return new opFunc(...args);
                        }
                        throw e;
                    }
                }
                return opFunc;
            }
        }

        const resolvedObject = {};
        for (const key of keys) {
            let finalKey = key;

            if (key.startsWith("$") && !["$array", "$filter", "$storage", "$database"].includes(key)) {
                const resolvedKey = astSync({ executeAST: key, sandbox, node, registry });
                if (typeof resolvedKey === "string" || typeof resolvedKey === "number") {
                    finalKey = String(resolvedKey);
                }
            } else if (key.includes('{{') && key.includes('}}')) {
                finalKey = resolveInlinePlaceholdersSync(key, { sandbox, node, registry });
            }

            let finalValue = targetNode[key];
            if (typeof finalValue === "string") {
                if (finalValue.startsWith("$") && !["$array", "$filter", "$storage", "$database"].includes(finalValue)) {
                    finalValue = astSync({ executeAST: finalValue, sandbox, node, registry });
                } else if (finalValue.includes('{{') && finalValue.includes('}}')) {
                    finalValue = resolveInlinePlaceholdersSync(finalValue, { sandbox, node, registry });
                }
            } else if (Array.isArray(finalValue) || (typeof finalValue === "object" && finalValue !== null)) {
                finalValue = astSync({ executeAST: finalValue, sandbox, node, registry });
            }

            if (finalKey === 'return' || finalKey === '$return') {
                return finalValue;
            }

            resolvedObject[finalKey] = finalValue;
            registry.set(finalKey, finalValue);
            if (sandbox && typeof sandbox === 'object') {
                sandbox[finalKey] = finalValue;
            }
        }
        return resolvedObject;
    }

    return targetNode;
}

export async function astAsync({ executeAST, sandbox, node, registry } = {}) {
    const targetNode = executeAST !== undefined ? executeAST : node;
    if (targetNode === null || targetNode === undefined) return targetNode;

    if (!registry) {
        registry = sandbox instanceof Map ? sandbox : new Map(Object.entries(sandbox || {}));
    }

    // Leaf String Evaluator: route to OperatorJS engine
    if (typeof targetNode === "string") {
        if (targetNode.includes("$") || targetNode.includes("ObjectId()")) {
            let resolved = await processOperatorsAsync(node || null, targetNode, [], null, [], registry);
            return unpackTokens(resolved, registry);
        }
        return targetNode;
    }

    // List Evaluator: maps items concurrently
    if (Array.isArray(targetNode)) {
        return await Promise.all(
            targetNode.map(item => astAsync({ executeAST: item, sandbox, node, registry }))
        );
    }

    if (typeof targetNode === "object") {
        if (targetNode instanceof Date || targetNode instanceof RegExp) {
            return targetNode;
        }

        const keys = Object.keys(targetNode);
        
        // Context Function/Operator Evaluation for single key objects
        if (keys.length === 1) {
            const key = keys[0];
            const isPrefixed = key.startsWith("$") && !["$array", "$filter", "$storage", "$database"].includes(key);
            const prefixedKey = isPrefixed ? key : `$${key}`;

            let opFunc = registry.get(key) || registry.get(prefixedKey) ||
                         customOperators.get(key) || customOperators.get(prefixedKey) ||
                         (sandbox && typeof sandbox === 'object' ? (sandbox[key] || sandbox[prefixedKey]) : undefined);

            if (opFunc !== undefined) {
                const evaluatedParam = await astAsync({ executeAST: targetNode[key], sandbox, node, registry });
                let opCtx = { element: node, registry };
                if (typeof opFunc === "function") {
                    const args = Array.isArray(evaluatedParam) ? evaluatedParam : [evaluatedParam];

                    // Pre-check for ES6 Class syntax
                    const isNativeClass = /^class\s|^class{/.test(Function.prototype.toString.call(opFunc));
                    if (isNativeClass) {
                        return new opFunc(...args);
                    }

                    // Attempt invocation as function, fallback to constructor on TypeError
                    try {
                        return await opFunc.call(opCtx, evaluatedParam);
                    } catch (e) {
                        if (e instanceof TypeError && /cannot be invoked without 'new'|class constructor/i.test(e.message)) {
                            return new opFunc(...args);
                        }
                        throw e;
                    }
                }
                return opFunc;
            }
        }

        const resolvedObject = {};
        for (const key of keys) {
            let finalKey = key;

            if (key.startsWith("$") && !["$array", "$filter", "$storage", "$database"].includes(key)) {
                const resolvedKey = await astAsync({ executeAST: key, sandbox, node, registry });
                if (typeof resolvedKey === "string" || typeof resolvedKey === "number") {
                    finalKey = String(resolvedKey);
                }
            } else if (key.includes('{{') && key.includes('}}')) {
                finalKey = await resolveInlinePlaceholdersAsync(key, { sandbox, node, registry });
            }

            let finalValue = targetNode[key];
            if (typeof finalValue === "string") {
                if (finalValue.startsWith("$") && !["$array", "$filter", "$storage", "$database"].includes(finalValue)) {
                    finalValue = await astAsync({ executeAST: finalValue, sandbox, node, registry });
                } else if (finalValue.includes('{{') && finalValue.includes('}}')) {
                    finalValue = await resolveInlinePlaceholdersAsync(finalValue, { sandbox, node, registry });
                }
            } else if (Array.isArray(finalValue) || (typeof finalValue === "object" && finalValue !== null)) {
                finalValue = await astAsync({ executeAST: finalValue, sandbox, node, registry });
            }

            if (finalKey === 'return' || finalKey === '$return') {
                return finalValue;
            }

            resolvedObject[finalKey] = finalValue;
            registry.set(finalKey, finalValue);
            if (sandbox && typeof sandbox === 'object') {
                sandbox[finalKey] = finalValue;
            }
        }
        return resolvedObject;
    }

    return targetNode;
}

function resolveInlinePlaceholdersSync(str, { sandbox, node, registry }) {
    let result = str;
    const regex = /\{\{\s*([\w\W]+?)\s*\}\}/g;
    let match;

    while ((match = regex.exec(str)) !== null) {
        const placeholder = match[0];
        const variablePath = match[1];
        const evaluatedValue = astSync({ executeAST: variablePath, sandbox, node, registry });
        const replacement = typeof evaluatedValue === 'object' ? JSON.stringify(evaluatedValue) : String(evaluatedValue);
        result = result.replace(placeholder, replacement);
    }
    return result;
}

async function resolveInlinePlaceholdersAsync(str, { sandbox, node, registry }) {
    let result = str;
    const regex = /\{\{\s*([\w\W]+?)\s*\}\}/g;
    let match;

    while ((match = regex.exec(str)) !== null) {
        const placeholder = match[0];
        const variablePath = match[1];
        const evaluatedValue = await astAsync({ executeAST: variablePath, sandbox, node, registry });
        const replacement = typeof evaluatedValue === 'object' ? JSON.stringify(evaluatedValue) : String(evaluatedValue);
        result = result.replace(placeholder, replacement);
    }
    return result;
}

export async function evaluateAST({ node, executeAST, sandbox = {} } = {}) {
    const targetNode = executeAST !== undefined ? executeAST : node;
    
    if (typeof targetNode === "string") {
        const tempRegistry = sandbox instanceof Map ? sandbox : new Map(Object.entries(sandbox));
        let resolved = await processOperatorsAsync(node || null, targetNode, [], null, [], registry);
        return unpackTokens(resolved, tempRegistry);
    }

    const activeScope = Object.create(baseSandboxScope);
    Object.assign(activeScope, sandbox);

    if (node) {
        activeScope.element = node;
    }

    return await astAsync({
        executeAST: targetNode,
        sandbox: activeScope,
        node: node
    });
}

setASTEvaluators(astSync, astAsync);

export default astSync;