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

import { getValueFromObject } from "../getValueFromObject.js";
import { queryElements } from "../queryElements.js";
import { ObjectId } from "../ObjectId.js";
import { uuid } from "../uuid.js";

// Late-binding references dynamically set at boot time to decouple circular import loops
let astSyncRef = null;
let astAsyncRef = null;

export function setASTEvaluators(syncFn, asyncFn) {
    astSyncRef = syncFn;
    astAsyncRef = asyncFn;
}

const mathConstants = { PI: Math.PI, E: Math.E };
const mathFunctions = {
    abs: Math.abs, ceil: Math.ceil, floor: Math.floor, round: Math.round,
    max: Math.max, min: Math.min, pow: Math.pow, sqrt: Math.sqrt,
    log: Math.log, sin: Math.sin, cos: Math.cos, tan: Math.tan,
    Number: (v) => Number(v)
};

class Ref {
    constructor(obj, prop) {
        this.obj = obj;
        this.prop = prop;

        let isList = Array.isArray(obj) ||
            (typeof NodeList !== "undefined" && obj instanceof NodeList) ||
            (typeof HTMLCollection !== "undefined" && obj instanceof HTMLCollection);

        this.isArrayContext = isList && !(prop in obj);

        if (this.isArrayContext && !Array.isArray(this.obj)) {
            this.obj = Array.from(this.obj);
        }
    }
    get() {
        if (this.isArrayContext) {
            return this.obj.map(item => item ? item[this.prop] : undefined);
        }
        return this.obj ? this.obj[this.prop] : undefined;
    }
    set(val) {
        if (this.isArrayContext) {
            this.obj.forEach(item => { if (item) item[this.prop] = val; });
            return val;
        }
        if (this.obj) this.obj[this.prop] = val;
        return val;
    }
}

function unref(val) {
    return val instanceof Ref ? val.get() : val;
}

export function safeParse(expression, registry = new Map()) {
    if (typeof expression !== "string") return expression;

    let currentExpr = expression.trim();
    if (!currentExpr) return null;

    const tokenizerRegex = /('[^']*'|"[^"]*"|\d+(?:\.\d+)?|>=|<=|===|!==|==|!=|&&|\|\||[a-zA-Z_][a-zA-Z0-9_\.]*|[\+\-\*\/\%\(\)\?\:\>\<\!\,\=])/g;
    const tokens = currentExpr.match(tokenizerRegex) || [];
    let pos = 0;

    function peek() { return tokens[pos]; }
    function consume() { return tokens[pos++]; }

    function parse() {
        return parseAssignment();
    }

    function parseAssignment() {
        let left = parseTernary();
        if (peek() === "=") {
            consume();
            let right = unref(parseAssignment());
            if (left instanceof Ref) {
                return left.set(right);
            }
            return right;
        }
        return left;
    }

    function parseTernary() {
        let left = parseLogical();
        if (peek() === "?") {
            consume();
            let trueExpr = parseTernary();
            if (peek() === ":") {
                consume();
                let falseExpr = parseTernary();
                return unref(left) ? unref(trueExpr) : unref(falseExpr);
            }
        }
        return left;
    }

    function parseLogical() {
        let left = parseComparison();
        while (peek() === "&&" || peek() === "||") {
            let op = consume();
            let right = parseComparison();
            if (op === "&&") left = unref(left) && unref(right);
            if (op === "||") left = unref(left) || unref(right);
        }
        return left;
    }

    function parseComparison() {
        let left = parseAdditive();
        while ([">", "<", ">=", "<=", "===", "!==", "==", "!="].includes(peek())) {
            let op = consume();
            let right = parseAdditive();
            let l = unref(left), r = unref(right);
            if (op === ">") left = l > r;
            if (op === "<") left = l < r;
            if (op === ">=") left = l >= r;
            if (op === "<=") left = l <= r;
            if (op === "===") left = l === r;
            if (op === "!==") left = l !== r;
            if (op === "==") left = l == r;
            if (op === "!=") left = l != r;
        }
        return left;
    }

    function parseAdditive() {
        let left = parseMultiplicative();
        while (["+", "-"].includes(peek())) {
            let op = consume();
            let right = parseMultiplicative();
            if (op === "+") left = unref(left) + unref(right);
            if (op === "-") left = unref(left) - unref(right);
        }
        return left;
    }

    function parseMultiplicative() {
        let left = parsePrimary();
        while (["*", "/", "%"].includes(peek())) {
            let op = consume();
            let right = parsePrimary();
            if (op === "*") left = unref(left) * unref(right);
            if (op === "/") left = unref(left) / unref(right);
            if (op === "%") left = unref(left) % unref(right);
        }
        return left;
    }

    function parsePrimary() {
        let token = consume();
        if (!token) return undefined;

        if (/^\d/.test(token)) return parseFloat(token);

        if (token.startsWith("'") || token.startsWith('"')) {
            return token.slice(1, -1);
        }

        if (token === "true") return true;
        if (token === "false") return false;

        if (token === "(") {
            let expr = unref(parse());
            if (peek() === ")") consume();
            return expr;
        }

        if (token === "-") return -unref(parsePrimary());
        if (token === "!") return !unref(parsePrimary());

        if (mathConstants.hasOwnProperty(token)) return mathConstants[token];

        if (peek() === "(" && mathFunctions.hasOwnProperty(token)) {
            consume();
            let args = [];
            if (peek() !== ")") {
                args.push(unref(parse()));
                while (peek() === ",") {
                    consume();
                    args.push(unref(parse()));
                }
            }
            if (peek() === ")") consume();
            return mathFunctions[token](...args);
        }

        let path = token.split(".");
        let baseToken = path[0];
        let val;

        if (registry && typeof registry.get === 'function' && registry.has(baseToken)) {
            val = registry.get(baseToken);
        } else if (typeof window !== "undefined" && window[baseToken]) {
            val = window[baseToken];
        } else {
            val = undefined;
        }

        if (path.length === 1) {
            if (peek() === "(" && typeof val === "function") {
                consume();
                let args = [];
                if (peek() !== ")") {
                    args.push(unref(parse()));
                    while (peek() === ",") {
                        consume();
                        args.push(unref(parse()));
                    }
                }
                if (peek() === ")") consume();
                return val(...args);
            }
            return val;
        }

        for (let i = 1; i < path.length - 1; i++) {
            if (val !== null && val !== undefined) {
                let isList = Array.isArray(val) || (typeof NodeList !== "undefined" && val instanceof NodeList) || (typeof HTMLCollection !== "undefined" && val instanceof HTMLCollection);
                if (isList && !(path[i] in val)) {
                    val = Array.from(val).map(item => item ? item[path[i]] : undefined);
                } else {
                    val = val[path[i]];
                }
            } else {
                return undefined;
            }
        }

        let ref = new Ref(val, path[path.length - 1]);

        if (peek() === "(") {
            consume();
            let args = [];
            if (peek() !== ")") {
                args.push(unref(parse()));
                while (peek() === ",") {
                    consume();
                    args.push(unref(parse()));
                }
            }
            if (peek() === ")") consume();

            if (ref.isArrayContext) {
                return ref.obj.map(item => {
                    let func = item ? item[ref.prop] : undefined;
                    return typeof func === "function" ? func.apply(item, args) : undefined;
                });
            } else {
                let func = ref.obj ? ref.obj[ref.prop] : undefined;
                if (typeof func === "function") {
                    return func.apply(ref.obj, args);
                }
            }
        }

        return ref;
    }

    try {
        return unref(parse());
    } catch (error) {
        console.warn(`safeParse error: ${error.message} (Expr: "${expression}")`, error);
        return null;
    }
}

export const customOperators = new Map(
    Object.entries({
        $organization_id: () => typeof localStorage !== 'undefined' ? localStorage.getItem("organization_id") : "",
        $user_id: () => typeof localStorage !== 'undefined' ? localStorage.getItem("user_id") : "",
        $client_id: () => typeof localStorage !== 'undefined' ? localStorage.getItem("clientId") : "",
        $session_id: () => typeof localStorage !== 'undefined' ? localStorage.getItem("session_id") : "",
        $this: function () { return this.element; },
        $value: function () {
            if (!this.element) return "";
            if (typeof this.element.getValueSync === "function") {
                return this.element.getValueSync();
            }
            return typeof this.element.getValue === "function"
                ? this.element.getValue()
                : "";
        },
        $innerWidth: () => typeof window !== 'undefined' ? window.innerWidth : 0,
        $innerHeight: () => typeof window !== 'undefined' ? window.innerHeight : 0,
        $href: () => typeof window !== 'undefined' ? window.location.href.replace(/\/$/, "") : "",
        $origin: () => typeof window !== 'undefined' ? window.location.origin : "",
        $protocol: () => typeof window !== 'undefined' ? window.location.protocol : "",
        $hostname: () => typeof window !== 'undefined' ? window.location.hostname : "",
        $host: () => typeof window !== 'undefined' ? window.location.host : "",
        $port: () => typeof window !== 'undefined' ? window.location.port : "",
        $pathname: () => typeof window !== 'undefined' ? window.location.pathname.replace(/\/$/, "") : "",
        $hash: () => typeof window !== 'undefined' ? window.location.hash : "",
        $subdomain: () => {
            if (typeof window === 'undefined') return "";
            const parts = window.location.hostname.split('.');
            return parts.length > 2 ? parts[0] : "";
        },
        $object_id: () => ObjectId().toString(),
        "ObjectId()": () => ObjectId().toString(),

        $query: function (selector) {
            let element = this.element;
            if (typeof selector === 'string') {
                selector = selector.trim();
                if ((selector.startsWith("'") && selector.endsWith("'")) ||
                    (selector.startsWith('"') && selector.endsWith('"'))) {
                    selector = selector.slice(1, -1);
                }
            }
            try {
                let results = queryElements({ element, selector });
                if (!results || results.length === 0) return undefined;
                return results[0];
            } catch (error) {
                console.warn(`Operator Engine: Invalid $query selector => "${selector}"`, error);
                return undefined;
            }
        },
        $queryAll: function (selector) {
            let element = this.element;
            if (typeof selector === 'string') {
                selector = selector.trim();
                if ((selector.startsWith("'") && selector.endsWith("'")) ||
                    (selector.startsWith('"') && selector.endsWith('"'))) {
                    selector = selector.slice(1, -1);
                }
                if (selector.includes('$document')) return [];
            }
            try {
                let results = queryElements({ element, selector });
                if (!results || results.length === 0) return [];
                return Array.from(results);
            } catch (error) {
                console.warn(`Operator Engine: Invalid $queryAll selector => "${selector}"`, error);
                return [];
            }
        },
        $eval: function (expression) {
            return safeParse(expression, this.registry);
        },
        "$": function (expression) {
            return safeParse(expression, this.registry);
        },
        $ast: function (expression) {
            if (!astSyncRef) {
                console.warn("[Operator Engine] AST Evaluator reference not registered.");
                return expression;
            }
            return astSyncRef({
                executeAST: expression,
                node: this.element,
                registry: this.registry
            });
        },
        $astAsync: async function (expression) {
            if (!astAsyncRef) {
                console.warn("[Operator Engine] AST Async Evaluator reference not registered.");
                return expression;
            }
            return await astAsyncRef({
                executeAST: expression,
                node: this.element,
                registry: this.registry
            });
        },
        $relativePath: () => {
            if (typeof window === 'undefined') return "./";
            let currentPath = window.location.pathname.replace(/\/[^\/]*$/, "");
            let depth = currentPath.split("/").filter(Boolean).length;
            return depth > 0 ? "../".repeat(depth) : "./";
        },
        $path: () => {
            if (typeof window === 'undefined') return "";
            let path = window.location.pathname;
            if (path.split("/").pop().includes(".")) path = path.replace(/\/[^\/]+$/, "/");
            return path === "/" ? "" : path;
        },
        $param: function (...args) { return args.length === 1 ? args[0] : args; },
        $getObjectValue: function (obj, key) {
            return getValueFromObject(obj, key);
        },
        $setValue: function (...args) {
            return this.element && typeof this.element.setValue === 'function' ? this.element.setValue(...args) || "" : "";
        },
        $true: () => true,
        $false: () => false,
        $parse: function (value = "") {
            try { return JSON.parse(value); } catch (e) { return value; }
        },
        $numberFormat: function () {
            let args = Array.from(arguments);
            const locale = args[0] || undefined;
            const options = args[1] || {};
            const numCandidate = args[2] !== undefined ? args[2] : args[0];
            let number = parseFloat(numCandidate);
            if (isNaN(number)) return String(numCandidate ?? "");
            return new Intl.NumberFormat(locale, options).format(number);
        },
        $uuid: function (prefix) { return uuid(prefix) || ""; },

        $add: function (value) {
            return Array.isArray(value) ? value.flat().reduce((a, b) => Number(a) + Number(b), 0) : Number(value) || 0;
        },
        $concat: function (value) {
            return Array.isArray(value) ? value.flat().map(arg => typeof arg === 'object' ? JSON.stringify(arg) : arg).join('') : String(value ?? "");
        },
        $attributes: function (value) {
            return this.element.getAttribute(value);
        },
        $getAttribute: function (value) {
            return this.element.getAttribute(value);
        },

    })
);

const isConstructor = (func, name) => {
    try {
        if (typeof func !== 'function') return false;
        if (/^\s*class\s+/.test(func.toString())) return true;
        if (!func.prototype) return false;
        const n = name || func.name;
        if (n && /^[A-Z]/.test(n)) return true;
    } catch (e) { }
    return false;
};

const findInnermostOperator = (expression) => {
    let parens = [];
    let stack = [];
    let inSQ = false, inDQ = false;

    for (let i = 0; i < expression.length; i++) {
        const char = expression[i];
        if (char === '\\') { i++; continue; }
        if (char === '"' && !inSQ) inDQ = !inDQ;
        if (char === "'" && !inDQ) inSQ = !inSQ;
        if (inSQ || inDQ) continue;

        if (char === '(') {
            stack.push(i);
        } else if (char === ')') {
            if (stack.length > 0) {
                const start = stack.pop();
                parens.push({ start: start, end: i, depth: stack.length });
            }
        }
    }

    parens.sort((a, b) => b.depth - a.depth || b.start - a.start);

    function stripParentheses(str) {
        let result = str.trim();
        if (result.startsWith("(") && result.endsWith(")")) {
            let balance = 0;
            let isMatchedPair = true;
            for (let i = 0; i < result.length - 1; i++) {
                if (result[i] === '(') balance++;
                else if (result[i] === ')') balance--;
                if (balance === 0) { isMatchedPair = false; break; }
            }
            if (isMatchedPair && balance === 1) {
                return result.substring(1, result.length - 1);
            }
        }
        return result;
    }

    for (const p of parens) {
        const insideParens = expression.substring(p.start + 1, p.end).trim();
        const leftPart = expression.substring(0, p.start);

        const match = leftPart.match(/(?:^|[^\w\$])(\$[\w\-]*|ObjectId\b)\s*$/);

        if (match) {
            let opName = match[1] === 'ObjectId' ? 'ObjectId()' : match[1];
            if (customOperators.has(opName) || /^\$[\w\-]*$/.test(opName)) {
                const spacesMatch = leftPart.match(/\s*$/);
                const spacesAtEnd = spacesMatch ? spacesMatch[0].length : 0;
                const fullMatchStart = match.index + match[0].length - match[1].length - spacesAtEnd;

                return {
                    operator: opName,
                    args: insideParens,
                    fullMatch: expression.substring(fullMatchStart, p.end + 1),
                    rawContent: expression.substring(fullMatchStart, p.end + 1)
                };
            }
        }
    }

    const bareRegex = /(?:^|[^\w\$])(\$[\w\-]+|ObjectId\b)/g;
    let bareMatch;
    let bareCandidates = [];

    while ((bareMatch = bareRegex.exec(expression)) !== null) {
        let possibleOp = bareMatch[1];
        let opName = possibleOp === 'ObjectId' ? 'ObjectId()' : possibleOp;
        let remainder = expression.substring(bareMatch.index + bareMatch[0].length);
        if (!/^\s*\(/.test(remainder)) {
            if (customOperators.has(opName) || /^\$[\w\-]+$/.test(opName)) {
                bareCandidates.push({
                    operator: opName,
                    args: undefined,
                    rawContent: possibleOp,
                    fullMatch: possibleOp,
                    start: bareMatch.index + (bareMatch[0].length - possibleOp.length)
                });
            }
        }
    }

    if (bareCandidates.length > 0) {
        bareCandidates.sort((a, b) => b.start - a.start);
        return bareCandidates[0];
    }

    return { operator: null, args: stripParentheses(expression), rawContent: expression.trim() };
};

function processValues(elements, operator, args, parent, objectRegistry) {
    let customOp = customOperators.get(operator);
    let results = [];
    let hasValidProperty = customOp ? true : false;

    for (const el of elements) {
        if (!el) continue;
        let rawValue = customOp;
        const propName = customOp ? null : operator.substring(1);
        if (!customOp) {
            if (propName in el) {
                hasValidProperty = true;
                rawValue = el[propName];
            } else {
                continue;
            }
        }

        let preparedArgs = [];
        const originalWasArray = Array.isArray(args);
        const hasArgs = originalWasArray || args !== undefined;

        if (originalWasArray) {
            preparedArgs = Array.from(args);
        } else if (typeof args === "string") {
            if (args === "") {
                preparedArgs = [""];
            } else {
                let parsedArgs = [];
                let currentArg = '';
                let inSQ = false, inDQ = false;
                let depth = 0;

                for (let i = 0; i < args.length; i++) {
                    const char = args[i];
                    if (char === '\\') {
                        currentArg += char;
                        if (i + 1 < args.length) currentArg += args[++i];
                        continue;
                    }
                    if (char === "'" && !inDQ) inSQ = !inSQ;
                    if (char === '"' && !inSQ) inDQ = !inDQ;

                    if (!inSQ && !inDQ) {
                        if (char === '(' || char === '[' || char === '{') depth++;
                        else if (char === ')' || char === ']' || char === '}') depth--;
                    }

                    if (char === ',' && !inSQ && !inDQ && depth === 0) {
                        parsedArgs.push(currentArg.trim());
                        currentArg = '';
                    } else {
                        currentArg += char;
                    }
                }
                if (currentArg.trim() !== "") parsedArgs.push(currentArg.trim());

                preparedArgs = parsedArgs.map(arg => {
                    if (/^__OBJ_\d+__$/.test(arg) && objectRegistry && objectRegistry.has(arg)) {
                        return objectRegistry.get(arg);
                    }
                    if (!isNaN(arg) && arg.trim() !== "") {
                        return Number(arg);
                    }
                    if (arg === "true") return true;
                    if (arg === "false") return false;
                    if (arg === "null") return null;
                    if (arg === "undefined") return undefined;

                    if ((arg.startsWith("'") && arg.endsWith("'")) || (arg.startsWith('"') && arg.endsWith('"'))) {
                        let unquoted = arg.slice(1, -1);
                        if (unquoted.includes("__OBJ_")) {
                            return unquoted.replace(/__OBJ_\d+__/g, (match) => {
                                if (objectRegistry && objectRegistry.has(match)) {
                                    let val = objectRegistry.get(match);
                                    return typeof val === "object" ? JSON.stringify(val) : String(val);
                                }
                                return match;
                            });
                        }
                        return unquoted;
                    }

                    if (typeof arg === "string" && arg.includes("__OBJ_")) {
                        return arg.replace(/__OBJ_\d+__/g, (match) => {
                            if (objectRegistry && objectRegistry.has(match)) {
                                let val = objectRegistry.get(match);
                                return typeof val === "object" ? JSON.stringify(val) : String(val);
                            }
                            return match;
                        });
                    }
                    return arg;
                });
            }
        } else if (hasArgs) {
            preparedArgs = [args];
        }

        if (originalWasArray) {
            preparedArgs = preparedArgs.map(a => {
                if (typeof a === 'string' && /^__OBJ_\d+__$/.test(a) && objectRegistry && objectRegistry.has(a)) {
                    return objectRegistry.get(a);
                }
                return a;
            });
        }

        let resolvedArgs;
        if (originalWasArray || preparedArgs.length > 1) {
            resolvedArgs = preparedArgs;
        } else if (preparedArgs.length === 1) {
            resolvedArgs = preparedArgs[0];
        } else {
            resolvedArgs = undefined;
        }

        if (typeof rawValue === "function") {
            try {
                let execCtx = { element: el, registry: objectRegistry };
                if (isConstructor(rawValue, propName)) {
                    if (Array.isArray(resolvedArgs)) {
                        rawValue = new rawValue(...resolvedArgs);
                    } else if (resolvedArgs !== undefined) {
                        rawValue = new rawValue(resolvedArgs);
                    } else {
                        rawValue = new rawValue();
                    }
                } else {
                    if (Array.isArray(resolvedArgs)) {
                        rawValue = rawValue.apply(execCtx, resolvedArgs);
                    } else if (resolvedArgs !== undefined) {
                        rawValue = rawValue.call(execCtx, resolvedArgs);
                    } else {
                        rawValue = rawValue.call(execCtx);
                    }
                }
            } catch (err) {
                console.warn(`Operator Engine: Failed to execute method or operator "${operator}"`, err);
                continue;
            }
        } else if (hasArgs && propName) {
            try {
                el[propName] = resolvedArgs;
                rawValue = el[propName];
            } catch (err) {
                console.warn(`Operator Engine: Failed to assign property "${propName}"`, err);
                continue;
            }
        }

        if (rawValue !== undefined && rawValue !== null) {
            results.push(rawValue);
        }
    }

    if (!hasValidProperty) return undefined;
    if (results.length === 0) return "";
    if (results.length === 1) return results[0];
    return results;
}

export function unpackTokens(val, registry) {
    if (typeof val === "string") {
        const exactMatch = val.match(/^__OBJ_(\d+)__$/);
        if (exactMatch && registry.has(val)) {
            return registry.get(val);
        }
        if (val.includes("__OBJ_")) {
            return val.replace(/__OBJ_\d+__(?:\.[a-zA-Z0-9_]+)*(?:\([^)]*\))?/g, (match) => {
                const parsed = safeParse(match, registry);
                if (parsed !== null && parsed !== undefined) {
                    return typeof parsed === "object" ? JSON.stringify(parsed) : String(parsed);
                }
                const baseTokenMatch = match.match(/^__OBJ_\d+__/);
                if (baseTokenMatch && registry.has(baseTokenMatch[0])) {
                    const baseVal = registry.get(baseTokenMatch[0]);
                    return typeof baseVal === "object" ? JSON.stringify(baseVal) : String(baseVal);
                }
                return "";
            });
        }
    }
    return val;
}

function resolveOperator(element, operator, args, parent, params, objectRegistry) {
    if (params.some((p) => p instanceof Promise)) return "";
    if (args && typeof args === "string" && args.includes("$")) {
        args = processOperators(element, args, [], operator, params, objectRegistry);
    }

    let targetElements = element ? [element] : [];
    if (args && typeof args === "string") {
        const objMatch = args.match(/^__OBJ_(\d+)__$/);
        if (objMatch && objectRegistry.has(args)) {
            let registeredVal = objectRegistry.get(args);
            let isList = Array.isArray(registeredVal) || (typeof NodeList !== "undefined" && registeredVal instanceof NodeList) || (typeof HTMLCollection !== "undefined" && registeredVal instanceof HTMLCollection);
            targetElements = isList ? Array.from(registeredVal) : [registeredVal];
        } else if (!customOperators.has(operator) && (operator === "$query")) {
            let qResults = queryElements({ element, selector: args });
            if (!qResults) {
                targetElements = [];
            } else {
                let isList = Array.isArray(qResults) || (typeof NodeList !== "undefined" && qResults instanceof NodeList) || (typeof HTMLCollection !== "undefined" && qResults instanceof HTMLCollection);
                targetElements = isList ? Array.from(qResults) : [qResults];
            }
            if (!targetElements.length) return undefined;
        }
    }

    let value = processValues(targetElements, operator, args, parent, objectRegistry);
    if (value && typeof value === "string" && value.includes("$")) {
        value = processOperators(element, value, [], parent, params, objectRegistry);
    }
    return value;
}

export function processOperators(element, value, exclude = [], parent, params = [], objectRegistry = new Map()) {
    if (typeof value !== "string" || (!value.includes("$") && !value.includes("ObjectId()"))) return value;
    let processedValue = value, hasPromise = false, unresolvedTokens = new Map();

    while (processedValue.includes("$") || processedValue.includes("ObjectId()")) {
        const paramMatch = processedValue.match(/^\$$PARAM_(\d+)\$\$/);
        if (paramMatch && Array.isArray(params) && params.length > 0) {
            const index = parseInt(paramMatch[1], 10);
            if (index < params.length) {
                processedValue = processedValue.replace(paramMatch[0], params[index]);
                continue;
            }
        }

        const { operator, args, rawContent, fullMatch } = findInnermostOperator(processedValue);
        if (!operator || (operator === "$param" && !args)) break;

        const textToReplace = fullMatch || rawContent;
        if (exclude.includes(operator)) {
            const token = `__UNRESOLVED_${unresolvedTokens.size}__`;
            unresolvedTokens.set(token, textToReplace);
            processedValue = processedValue.replace(textToReplace, token);
            continue;
        }

        let resolvedValue = resolveOperator(element, operator, args, parent, params, objectRegistry);
        if (resolvedValue === undefined) {
            const token = `__UNRESOLVED_${unresolvedTokens.size}__`;
            unresolvedTokens.set(token, textToReplace);
            processedValue = processedValue.replace(textToReplace, token);
            continue;
        }
        if (resolvedValue instanceof Promise) {
            const paramIndex = params.length;
            params.push(resolvedValue);
            processedValue = processedValue.replace(textToReplace, `$$PARAM_${paramIndex}$$`);
            hasPromise = true;
            break;
        }
        if (params.some((p) => p instanceof Promise)) { hasPromise = true; break; }

        let replacement = "";
        if (operator === "$param") params.push(resolvedValue);
        else if (resolvedValue !== null && (typeof resolvedValue === "object" || typeof resolvedValue === "function")) {
            const token = `__OBJ_${objectRegistry.size}__`;
            objectRegistry.set(token, resolvedValue);
            replacement = token;
        } else replacement = resolvedValue ?? "";

        if (processedValue === textToReplace) { processedValue = replacement; break; }
        processedValue = processedValue.replace(textToReplace, replacement);
    }

    if (typeof processedValue === "string") {
        let keys = Array.from(unresolvedTokens.keys()).reverse();
        for (const token of keys) {
            processedValue = processedValue.replaceAll(token, unresolvedTokens.get(token));
        }
        processedValue = unpackTokens(processedValue, objectRegistry);
    }

    if (hasPromise) return { value: processedValue, params, objectRegistry };
    return processedValue;
}

export async function processOperatorsAsync(element, value, exclude = [], parent, params = [], objectRegistry = new Map()) {
    let result = processOperators(element, value, exclude, parent, params, objectRegistry);
    while (typeof result === "object" && result.params) {
        const resolvedParams = await Promise.all(result.params);
        result = processOperators(element, result.value, exclude, parent, resolvedParams, result.objectRegistry || objectRegistry);
    }
    return result;
}
