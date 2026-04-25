import { ObjectId } from "./ObjectId.js";
import { uid } from "./uid.js";
import { queryElements } from "./queryElements.js";
import { getValueFromObject } from "./getValueFromObject.js";

// --- AST EVALUATION ENGINE (safeParse) ---

const mathConstants = { PI: Math.PI, E: Math.E };
const mathFunctions = {
    abs: Math.abs, ceil: Math.ceil, floor: Math.floor, round: Math.round,
    max: Math.max, min: Math.min, pow: Math.pow, sqrt: Math.sqrt,
    log: Math.log, sin: Math.sin, cos: Math.cos, tan: Math.tan,
    Number: (v) => Number(v) // Explicit numeric casting
};

/**
 * Reference class used by safeParse to track object properties for assignments.
 * Prevents dot-notation from just returning values when we need to assign to them (e.g., el.value = 5)
 * Upgraded to handle array contexts: if the object is an array, properties map across all items natively.
 */
class Ref {
    constructor(obj, prop) {
        this.obj = obj;
        this.prop = prop;
        
        // Ensure we recognize standard arrays AND DOM collections (NodeList/HTMLCollection)
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
            // Return the raw Array of extracted properties so the user can use .join() or other array methods
            let res = this.obj.map(item => item ? item[this.prop] : undefined);
            return res;
        }
        let res = this.obj ? this.obj[this.prop] : undefined; 
        return res; 
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

/**
 * Parses math, logic, ternaries, dot notation, and property assignments securely.
 */
function safeParse(expression, registry = new Map()) {
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
                return left.set(right); // Assign value to the actual object property (or all properties in an array)
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

        // --- Context & Object Registry Traversal ---
        let path = token.split(".");
        let baseToken = path[0];
        let val;

        if (registry.has(baseToken)) {
            val = registry.get(baseToken);
        } else if (typeof window !== "undefined" && window[baseToken]) {
            val = window[baseToken];
        } else {
            val = undefined;
        }

        if (path.length === 1) {
            // Support explicit call for root variables
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
                // Support deep traversal across arrays
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

        // Support explicit method calls (e.g., obj.method(arg))
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
            
            // Map the method call across all items if it's an array context
            if (ref.isArrayContext) {
                let results = ref.obj.map(item => {
                    let func = item ? item[ref.prop] : undefined;
                    if (func !== undefined && typeof func !== "function") {
                        console.warn(`Operator Engine: '${ref.prop}' is not a valid function on the target element.`);
                    }
                    let res = typeof func === "function" ? func.apply(item, args) : undefined;
                    return res;
                });
                return results; // Return the natively mapped Array so user can process it!
            } else {
                let func = ref.obj ? ref.obj[ref.prop] : undefined;
                if (typeof func === "function") {
                    let res = func.apply(ref.obj, args);
                    return res;
                } else {
                    console.warn(`Operator Engine: Method '${ref.prop}' does not exist on the target object.`);
                }
            }
        }

        return ref;
    }

    try {
        const result = parse();
        return unref(result);
    } catch (error) {
        console.warn(`safeParse error: ${error.message} (Expr: "${expression}")`, error);
        return null;
    }
}


// --- CORE OPERATOR ENGINE ---

const customOperators = new Map(
    Object.entries({
        $organization_id: () => localStorage.getItem("organization_id"),
        $user_id: () => localStorage.getItem("user_id"),
        $client_id: () => localStorage.getItem("clientId"),
        $session_id: () => localStorage.getItem("session_id"),
        $this: function() { return this; },
        $value: function() { return this && typeof this.getValue === 'function' ? this.getValue() : ""; },
        $innerWidth: () => window.innerWidth,
        $innerHeight: () => window.innerHeight,
        $href: () => window.location.href.replace(/\/$/, ""),
        $origin: () => window.location.origin,
        $protocol: () => window.location.protocol,
        $hostname: () => window.location.hostname,
        $host: () => window.location.host,
        $port: () => window.location.port,
        $pathname: () => window.location.pathname.replace(/\/$/, ""),
        $hash: () => window.location.hash,
        $subdomain: () => getSubdomain() || "",
        $object_id: () => ObjectId().toString(),
        "ObjectId()": () => ObjectId().toString(),
        
        // Unwrap query results correctly: Returns only the single first item
        $query: function(selector) {
            let element = this;
            if (typeof selector === 'string') {
                selector = selector.trim();
                // Strip quotes out of the selector in case they were passed (e.g., $query('#id1'))
                if ((selector.startsWith("'") && selector.endsWith("'")) || 
                    (selector.startsWith('"') && selector.endsWith('"'))) {
                    selector = selector.slice(1, -1);
                }
            }
            try {
                let results = queryElements({ element, selector });
                if (!results || results.length === 0) return undefined; 
                return results[0]; // Strict single item return
            } catch (error) {
                console.warn(`Operator Engine: Invalid $query selector => "${selector}"`, error);
                return undefined; 
            }
        },
        // Unwrap query results correctly: Always returns an array 
        $queryAll: function(selector) {
            let element = this;
            if (typeof selector === 'string') {
                selector = selector.trim();
                // Strip quotes out of the selector in case they were passed (e.g., $queryAll('.items'))
                if ((selector.startsWith("'") && selector.endsWith("'")) || 
                    (selector.startsWith('"') && selector.endsWith('"'))) {
                    selector = selector.slice(1, -1);
                }
                
                // Safely ignore queries targeting $document to prevent querySelector crashes
                if (selector.includes('$document')) return [];
            }
            try {
                let results = queryElements({ element, selector });
                if (!results || results.length === 0) return []; 
                // Always cast to array so Ref mapping handles methods uniformly
                return Array.from(results);
            } catch (error) {
                console.warn(`Operator Engine: Invalid $queryAll selector => "${selector}"`, error);
                return []; 
            }
        },
        $eval: function(expression) { return safeParse(expression); },
        $relativePath: () => {
            let currentPath = window.location.pathname.replace(/\/[^\/]*$/, ""); 
            let depth = currentPath.split("/").filter(Boolean).length;
            return depth > 0 ? "../".repeat(depth) : "./";
        },
        $path: () => {
            let path = window.location.pathname;
            if (path.split("/").pop().includes(".")) path = path.replace(/\/[^\/]+$/, "/");
            return path === "/" ? "" : path;
        },
        $param: function(...args) { return args.length === 1 ? args[0] : args; },
        $getObjectValue: function(obj, key) {
            return getValueFromObject(obj, key);
        },
        $setValue: function(...args) {
            return typeof this.setValue === 'function' ? this.setValue(...args) || "" : "";
        },
        $true: () => true,
        $false: () => false,
        $parse: function(value = "") {
            try { return JSON.parse(value); } catch (e) { return value; }
        },
        $numberFormat: function() {
            let args = Array.from(arguments);
            const locale = args[0] || undefined;
            const options = args[1] || {};
            const numCandidate = args[2] !== undefined ? args[2] : args[0];
            let number = parseFloat(numCandidate);
            if (isNaN(number)) return String(numCandidate ?? "");
            return new Intl.NumberFormat(locale, options).format(number);
        },
        $uid: function(prefix) { return uid(prefix) || ""; },
    })
);

const isConstructor = (func, name) => {
    try {
        if (typeof func !== 'function') return false;
        if (/^\s*class\s+/.test(func.toString())) return true;
        if (!func.prototype) return false;
        const n = name || func.name;
        if (n && /^[A-Z]/.test(n)) return true;
    } catch(e) {}
    return false;
};

const findInnermostOperator = (expression) => {
    let parens = [];
    let stack = [];
    let inSQ = false, inDQ = false;

    // 1. Capture all parenthesis pairs accurately (The Parenthesis-First "Animals" boundary)
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

    // Sort by depth descending (innermost first), then by start descending (right-most first)
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

    // 2. Look to the left of the innermost parentheses to find the keyword operator
    for (const p of parens) {
        // We safely isolate ONLY what is inside the parens, bypassing the need for string replacements
        const insideParens = expression.substring(p.start + 1, p.end).trim();
        const leftPart = expression.substring(0, p.start);

        // Check for an operator keyword directly attached to the left of the `(`
        const match = leftPart.match(/(?:^|[^\w\$])(\$[\w\-]+|ObjectId\b)\s*$/);
        
        if (match) {
            let opName = match[1] === 'ObjectId' ? 'ObjectId()' : match[1];
            if (customOperators.has(opName) || /^\$[\w\-]+$/.test(opName)) {
                // Pinpoint exactly where the operator string began
                const spacesMatch = leftPart.match(/\s*$/);
                const spacesAtEnd = spacesMatch ? spacesMatch[0].length : 0;
                const fullMatchStart = match.index + match[0].length - match[1].length - spacesAtEnd;
                
                const resultBlock = { 
                    operator: opName, 
                    args: insideParens, // Perfectly isolated arguments, handling nested chains
                    fullMatch: expression.substring(fullMatchStart, p.end + 1),
                    rawContent: expression.substring(fullMatchStart, p.end + 1)
                };
                return resultBlock;
            }
        }
    }

    // 3. Fallback: Find bare operators (like $this) that have no parentheses attached
    const bareRegex = /(?:^|[^\w\$])(\$[\w\-]+|ObjectId\b)/g;
    let bareMatch;
    let bareCandidates = [];
    
    while ((bareMatch = bareRegex.exec(expression)) !== null) {
        let possibleOp = bareMatch[1];
        let opName = possibleOp === 'ObjectId' ? 'ObjectId()' : possibleOp;
        
        // Ensure it isnt followed by a `(` (because if it was, it would have been caught above)
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

    const defaultFallback = { operator: null, args: stripParentheses(expression), rawContent: expression.trim() };
    return defaultFallback;
};

function processOperators(element, value, exclude = [], parent, params = [], objectRegistry = new Map()) {
    if (typeof value !== "string" || (!value.includes("$") && !value.includes("ObjectId()"))) return value;
    let processedValue = value, hasPromise = false, unresolvedTokens = new Map();
    while (processedValue.includes("$") || processedValue.includes("ObjectId()")) {
        const paramMatch = processedValue.match(/^\$\$PARAM_(\d+)\$\$/);
        if (paramMatch && Array.isArray(params) && params.length > 0) {
            const index = parseInt(paramMatch[1], 10);
            if (index < params.length) { processedValue = processedValue.replace(paramMatch[0], params[index]); continue; }
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
    
    // Restore unresolved exclusions (Reverse-order replaces ensure perfectly unnested loops)
    if (typeof processedValue === "string") {
        let keys = Array.from(unresolvedTokens.keys()).reverse();
        for (const token of keys) {
            processedValue = processedValue.replaceAll(token, unresolvedTokens.get(token));
        }
        
        // Native method and property chaining evaluation
        // 1. If the ENTIRE string is a pure method/property chain (e.g. __OBJ_0__.getValue() )
        const exactMethodMatch = processedValue.match(/^__OBJ_\d+__(?:\.[a-zA-Z0-9_]+)+(?:\(.*\))?$/);
        if (exactMethodMatch) {
            const parsed = safeParse(processedValue, objectRegistry);
            // DO NOT LEAK tokens to the UI. Fallback to "" instead of the processedValue placeholder if it fails.
            return parsed !== null && parsed !== undefined ? parsed : ""; 
        }
        
        // 2. Unpack pure object variables
        const exactMatch = processedValue.match(/^__OBJ_(\d+)__$/);
        if (exactMatch && objectRegistry.has(processedValue)) {
            processedValue = objectRegistry.get(processedValue);
        } else {
            // 3. Inline interpolation for methods/properties (e.g., "User clicked __OBJ_0__.getValue()")
            const objRegex = /__OBJ_\d+__(?:\.[a-zA-Z0-9_]+)+(?:\([^)]*\))?/g;
            if (processedValue.includes("__OBJ_")) {
                processedValue = processedValue.replace(objRegex, (match) => {
                    const parsed = safeParse(match, objectRegistry);
                    // DO NOT LEAK tokens to the UI. Fallback to "" instead of the match placeholder if it fails.
                    return parsed !== null && parsed !== undefined ? parsed : "";
                });
            }
        }
    }
    
    if (hasPromise) return { value: processedValue, params, objectRegistry };
    return processedValue;
}

async function processOperatorsAsync(element, value, exclude = [], parent, params = [], objectRegistry = new Map()) {
    let result = processOperators(element, value, exclude, parent, params, objectRegistry);
    while (typeof result === "object" && result.params) {
        const resolvedParams = await Promise.all(result.params);
        result = processOperators(element, result.value, exclude, parent, resolvedParams, result.objectRegistry || objectRegistry);
    }
    return result;
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
            // Ensure unrolled array natively
            let isList = Array.isArray(registeredVal) || (typeof NodeList !== "undefined" && registeredVal instanceof NodeList) || (typeof HTMLCollection !== "undefined" && registeredVal instanceof HTMLCollection);
            targetElements = isList ? Array.from(registeredVal) : [registeredVal];
        } else if (!customOperators.has(operator) &&  (operator === "$query")) {
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
            }
            else {
                continue;
            }
        }

        // --- 1. RECONSTRUCT THE "GHOST" STRUCTURE (Tokens -> Actual JS Types) ---
        let preparedArgs = [];
        const originalWasArray = Array.isArray(args);
        const hasArgs = originalWasArray || args !== undefined;

        if (originalWasArray) {
            preparedArgs = Array.from(args);
        } else if (typeof args === "string") {
            if (args === "") {
                preparedArgs = [""]; // Explicitly retain empty string arguments
            } else {
                // Smart parse for comma-separated arguments respecting strings and brackets
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
                    
                    // Keep track of brackets and parens grouping so we don't accidentally split them inside
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

                // Reconstruct actual JavaScript types
                preparedArgs = parsedArgs.map(arg => {
                    // 1. Direct object token match (brings back exactly the array, obj, or variable!)
                    if (/^__OBJ_\d+__$/.test(arg) && objectRegistry && objectRegistry.has(arg)) {
                        return objectRegistry.get(arg);
                    }
                    
                    // 2. Numbers
                    if (!isNaN(arg) && arg.trim() !== "") {
                        return Number(arg);
                    }
                    
                    // 3. Booleans and Null
                    if (arg === "true") return true;
                    if (arg === "false") return false;
                    if (arg === "null") return null;
                    if (arg === "undefined") return undefined;
                    
                    // 4. Strings with quotes (strip outer quotes reliably)
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
                    
                    // 5. Inline token replacements for mixed strings (e.g., "Welcome __OBJ_1__")
                    if (typeof arg === "string" && arg.includes("__OBJ_")) {
                        return arg.replace(/__OBJ_\d+__/g, (match) => {
                            if (objectRegistry && objectRegistry.has(match)) {
                                let val = objectRegistry.get(match);
                                return typeof val === "object" ? JSON.stringify(val) : String(val);
                            }
                            return match;
                        });
                    }
                    
                    // Fallback literal string
                    return arg;
                });
            }
        } else if (hasArgs) {
            preparedArgs = [args];
        }

        // Extra safety: Make sure tokens passed directly as Array items are mapped
        if (originalWasArray) {
            preparedArgs = preparedArgs.map(a => {
                if (typeof a === 'string' && /^__OBJ_\d+__$/.test(a) && objectRegistry && objectRegistry.has(a)) {
                    return objectRegistry.get(a);
                }
                return a;
            });
        }

        // Create the resolvedArgs shape the engine natively expects
        let resolvedArgs;
        if (originalWasArray || preparedArgs.length > 1) {
            resolvedArgs = preparedArgs;
        } else if (preparedArgs.length === 1) {
            resolvedArgs = preparedArgs[0];
        } else {
            resolvedArgs = undefined;
        }

        // --- 2. EXECUTE OR ASSIGN ---
        if (typeof rawValue === "function") {
            try {
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
                        rawValue = rawValue.apply(el, resolvedArgs); // Bind context correctly to element!
                    } else if (resolvedArgs !== undefined) {
                        rawValue = rawValue.call(el, resolvedArgs);
                    } else {
                        rawValue = rawValue.call(el);
                    }
                }
            } catch (err) {
                console.warn(`Operator Engine: Failed to execute method or operator "${operator}"`, err);
                continue; // Skip this element's value if execution failed
            }
        } else if (hasArgs && propName) {
            // PROPERTY ASSIGNMENT
            try {
                el[propName] = resolvedArgs;
                rawValue = el[propName]; // Read it back to ensure success/validate formatting
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
    if (results.length === 0) return ""; // Explicitly return empty string if elements are found but have no matches to prevent Token masking.
    
    // Return the array wrapper (even for length 1) to ensure .map array methods remain accessible!
    if (results.length === 1) return results[0];
    return results;
}

function getSubdomain() {
    const hostname = window.location.hostname, parts = hostname.split(".");
    if (parts.length > 2 && isNaN(parseInt(parts[parts.length - 1]))) return parts.slice(0, parts.length - 2).join(".");
    return null;
}

export { processOperators, processOperatorsAsync, customOperators };