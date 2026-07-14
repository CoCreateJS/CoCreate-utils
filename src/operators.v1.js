import { ObjectId } from "./ObjectId.js";
import { uid } from "./uid.js";
import { queryElements } from "./queryElements.js";
import { getValueFromObject } from "./getValueFromObject.js";

// --- AST EVALUATION ENGINE (safeParse) ---

const mathConstants = { PI: Math.PI, E: Math.E };
const mathFunctions = {
    abs: Math.abs, ceil: Math.ceil, floor: Math.floor, round: Math.round,
    max: Math.max, min: Math.min, pow: Math.pow, sqrt: Math.sqrt,
    log: Math.log, sin: Math.sin, cos: Math.cos, tan: Math.tan
};

/**
 * Reference class used by safeParse to track object properties for assignments.
 * Prevents dot-notation from just returning values when we need to assign to them (e.g., el.value = 5)
 */
class Ref {
    constructor(obj, prop) {
        this.obj = obj;
        this.prop = prop;
    }
    get() { return this.obj ? this.obj[this.prop] : undefined; }
    set(val) { 
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
                return left.set(right); // Assign the value to the actual object property
            }
            return right; // Fallback if LHS wasn't a valid reference
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
            return token.slice(1, -1); // Strip quotes
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

        // Check if the token is a tracked DOM Element/Object from processOperators
        if (registry.has(baseToken)) {
            val = registry.get(baseToken);
        } else if (typeof window !== "undefined" && window[baseToken]) {
            val = window[baseToken];
        } else {
            val = undefined;
        }

        if (path.length === 1) return val; // No dot notation, return the raw object

        // Traverse down the object path, stopping before the last property
        for (let i = 1; i < path.length - 1; i++) {
            if (val !== null && val !== undefined) {
                val = val[path[i]];
            } else {
                return undefined;
            }
        }

        // Return a Ref object for the final property to enable Assignment (LHS)
        return new Ref(val, path[path.length - 1]);
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

// Operators handled directly for simple, synchronous value retrieval
const customOperators = new Map(
    Object.entries({
        $organization_id: () => localStorage.getItem("organization_id"),
        $user_id: () => localStorage.getItem("user_id"),
        $clientId: () => localStorage.getItem("clientId"),
        $session_id: () => localStorage.getItem("session_id"),
        $value: (element) => element.getValue() || "",
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
        $query: (element, args) => queryElements({ element, selector: args }),
        
        // ✨ THE NEW AST PORTAL ✨
        $eval: (element, args, context) => safeParse(args, context.registry),
        
        $relativePath: () => {
            let currentPath = window.location.pathname.replace(/\/[^\/]*$/, ""); 
            let depth = currentPath.split("/").filter(Boolean).length;
            return depth > 0 ? "../".repeat(depth) : "./";
        },
        $path: () => {
            let path = window.location.pathname;
            if (path.split("/").pop().includes(".")) {
                path = path.replace(/\/[^\/]+$/, "/");
            }
            return path === "/" ? "" : path;
        },
        $param: (element, args) => args,
        $getObjectValue: (element, args) => {
            if (Array.isArray(args) && args.length >= 2) {
                return getValueFromObject(args[0], args[1]);
            }
            return "";
        },
        $setValue: (element, args) => element.setValue(...args) || "",
        $true: () => true,
        $false: () => false,
        $parse: (element, args) => {
            let value = args || "";
            try { return JSON.parse(value); } 
            catch (e) { return value; }
        },
        $numberFormat: (element, args) => {
            let number = parseFloat(args[0]);
            if (!Array.isArray(args)) args = [args];

            const locale = args[0] || undefined;
            const options = args[1] || {};
            const numCandidate = args[2] !== undefined ? args[2] : args[0];

            number = parseFloat(numCandidate);
            if (isNaN(number)) return String(numCandidate ?? "");
            return new Intl.NumberFormat(locale, options).format(number);
        },
        $uid: (element, args) => uid(args[0]) || "",
    })
);

/**
 * Helper to determine if a function should be called with 'new'.
 * Uses heuristics like ES6 class syntax, lack of prototype (arrow function), or PascalCase naming.
 */
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

/**
 * Helper function to check if a string path starts with a potential bare operator.
 */
const findBareOperatorInPath = (path) => {
    const trimmedPath = path.trim();
    const match = trimmedPath.match(/^(\$[\w\-]+)/);
    
    if (match) {
        const key = match[1];
        const remaining = trimmedPath.substring(key.length);
        if (remaining.length === 0 || /^\s|\[|\./.test(remaining)) {
            return key;
        }
    }
    return null;
}

/**
 * Finds the innermost function call (operator + its balanced parentheses argument)
 */
const findInnermostFunctionCall = (expression) => {
    let balance = 0;
    let deepestStart = -1;
    let deepestEnd = -1;
    let deepestBalance = -1;
    let inSingleQuote = false;
    let inDoubleQuote = false;

    for (let i = 0; i < expression.length; i++) {
        const char = expression[i];

        if (char === '"' && !inSingleQuote) {
            inDoubleQuote = !inDoubleQuote;
            continue;
        } else if (char === "'" && !inDoubleQuote) {
            inSingleQuote = !inDoubleQuote;
            continue;
        }

        if (inSingleQuote || inDoubleQuote) continue;

        if (char === '(') {
            balance++;
            if (balance > deepestBalance) {
                deepestBalance = balance;
                deepestStart = i;
                deepestEnd = -1;
            }
        } else if (char === ')') {
            if (balance === deepestBalance) {
                deepestEnd = i;
            }
            balance--;
        }
    }
    
    if (deepestStart === -1 || deepestEnd === -1 || deepestEnd <= deepestStart) {
        return null;
    }

    const rawArgs = expression.substring(deepestStart + 1, deepestEnd).trim();
    
    let operatorStart = -1;
    let nonWhitespaceFound = false;

    for (let i = deepestStart - 1; i >= 0; i--) {
        const char = expression[i];
        
        if (!nonWhitespaceFound) {
            if (/\s/.test(char)) continue;
            nonWhitespaceFound = true;
        }
        
        let isOperatorChar = /[\w\-\$]/.test(char);
        
        if (!isOperatorChar) {
            operatorStart = i + 1;
            break;
        }
        operatorStart = i;
    }
    
    if (operatorStart === -1) operatorStart = 0;
    const operatorNameCandidate = expression.substring(operatorStart, deepestStart).trim();

    if (/^\$[\w\-]+$/.test(operatorNameCandidate) || customOperators.has(operatorNameCandidate)) {
        const fullMatch = expression.substring(operatorStart, deepestEnd + 1);
        return { operator: operatorNameCandidate, args: rawArgs, fullMatch: fullMatch };
    }
    return null;
};

/**
 * Main function to find the innermost operator.
 */
const findInnermostOperator = (expression) => {
    function stripParentheses(str) {
        let result = str;
        if (result.startsWith("(")) result = result.substring(1);
        if (result.endsWith(")")) result = result.substring(0, result.length - 1);
        return result;
    }
    let args;

    const functionCall = findInnermostFunctionCall(expression);
    if (functionCall) {
        args = stripParentheses(functionCall.args);
        return {
            operator: functionCall.operator,
            args,
            rawContent: functionCall.args,
            fullMatch: functionCall.fullMatch
        };
    }
    
    const rawContent = expression.trim();
    const innermostOperator = findBareOperatorInPath(rawContent);

    if (innermostOperator) {
        const operatorArgs = rawContent.substring(innermostOperator.length).trim();
        args = stripParentheses(operatorArgs);
        return { operator: innermostOperator, args, rawContent: rawContent };
    }

    args = stripParentheses(rawContent);
    return { operator: null, args, rawContent: rawContent };
};

/**
 * Synchronously processes a string, finding and replacing operators recursively.
 * Uses an objectRegistry to safely store complex DOM elements and functions during parsing.
 */
function processOperators(
    element,
    value,
    exclude = [],
    parent,
    params = [],
    objectRegistry = new Map() // Pass the registry through recursive layers
) {
    if (typeof value !== "string" || (!value.includes("$") && !value.includes("ObjectId()"))) {
        return value;
    }

    let processedValue = value;
    let hasPromise = false;
    let unresolvedTokens = new Map(); 

    while (processedValue.includes("$") || processedValue.includes("ObjectId()")) {
        
        const paramMatch = processedValue.match(/^\$\$PARAM_(\d+)\$\$/);
        if (paramMatch && Array.isArray(params) && params.length > 0) {
            const index = parseInt(paramMatch[1], 10);
            if (index < params.length) {
                const resolvedTokenValue = params[index];
                processedValue = processedValue.replace(paramMatch[0], resolvedTokenValue);
                continue; 
            }
        }

        const { operator, args, rawContent, fullMatch } = findInnermostOperator(processedValue);

        if (!operator) break; 
        if (operator === "$param" && !args) break;

        const textToReplace = fullMatch || rawContent;

        if (exclude.includes(operator)) {
            const token = `__UNRESOLVED_${unresolvedTokens.size}__`;
            unresolvedTokens.set(token, textToReplace);
            processedValue = processedValue.replace(textToReplace, token);
            continue;
        }

        // Execute operator, passing the objectRegistry down contextually
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

        if (params.some((p) => p instanceof Promise)) {
            hasPromise = true;
            break; 
        }

        let replacement = "";
        if (operator === "$param") {
            params.push(resolvedValue);
        } else if (resolvedValue !== null && (typeof resolvedValue === "object" || typeof resolvedValue === "function")) {
            // ✨ THE TOKEN REGISTRY ✨
            // Instead of stringifying Elements/Arrays/Functions, we store them safely 
            // and leave a token so safeParse can grab them later!
            const token = `__OBJ_${objectRegistry.size}__`;
            objectRegistry.set(token, resolvedValue);
            replacement = token;
        } else {
            replacement = resolvedValue ?? "";
        }

        if (processedValue === textToReplace) {
            processedValue = replacement;
            break;
        }
            
        processedValue = processedValue.replace(textToReplace, replacement);

        if (!processedValue.includes("$") && !processedValue.includes("ObjectId()")) {
            break;
        }
    }

    // Restore any unresolvable operator syntax
    for (const [token, originalText] of unresolvedTokens.entries()) {
        processedValue = processedValue.replace(token, originalText);
    }

    // FINAL UNWRAP: If the final evaluated string is literally just a single object token, 
    // unwrap it and return the actual raw Object/Element instead of the string!
    if (typeof processedValue === "string") {
        const exactMatch = processedValue.match(/^__OBJ_(\d+)__$/);
        if (exactMatch && objectRegistry.has(processedValue)) {
            processedValue = objectRegistry.get(processedValue);
        }
    }

    if (hasPromise) {
        return { value: processedValue, params, objectRegistry };
    }

    if (params.length) {
        if (typeof processedValue === 'string' && processedValue.trim() === "") {
            return params;
        }
    }

    return processedValue;
}

async function processOperatorsAsync(
    element,
    value,
    exclude = [],
    parent,
    params = [],
    objectRegistry = new Map()
) {
    let result = processOperators(element, value, exclude, parent, params, objectRegistry);

    while (typeof result === "object" && result.params) {
        const resolvedParams = await Promise.all(result.params);
        result = processOperators(
            element,
            result.value,
            exclude,
            parent,
            resolvedParams,
            result.objectRegistry || objectRegistry
        );
    }

    if (result instanceof Promise) return await result;
    return result;
}

/**
 * Synchronously determines and executes the action for processing a single operator token.
 */
function resolveOperator(element, operator, args, parent, params, objectRegistry) {
    if (params.some((p) => p instanceof Promise)) return "";

    if (args && typeof args === "string" && args.includes("$")) {
        args = processOperators(element, args, [], operator, params, objectRegistry);
    }

    if (params.some((p) => p instanceof Promise)) return operator;

    let targetElements = element ? [element] : [];
    
    if (args && typeof args === "string" && !customOperators.has(operator)) {
        targetElements = queryElements({ element, selector: args });
        if (!targetElements.length) return undefined;
    }

    let value = processValues(targetElements, operator, args, parent, objectRegistry);

    if (value && typeof value === "string" && value.includes("$")) {
        value = processOperators(element, value, [], parent, params, objectRegistry);
    }

    return value;
}

/**
 * Synchronously processes and aggregates values from a set of elements based on a specified operator.
 */
function processValues(elements, operator, args, parent, objectRegistry) {
    let customOp = customOperators.get(operator);
    let aggregatedString = "";
    let hasValidProperty = false;

    // Pass the active registry down so custom operators (like $eval) can utilize it
    const context = { registry: objectRegistry, element: elements[0] };

    if (customOp) hasValidProperty = true;

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

        if (typeof rawValue === "function") {
            if (customOp) {
                // Execute standard Custom Operators (always pass element and context)
                if (Array.isArray(args)) {
                    rawValue = rawValue(el, ...args, context);
                } else {
                    rawValue = rawValue(el, args, context);
                }
            } else {
                // Execute native Element properties/methods dynamically using robust evaluation
                if (isConstructor(rawValue, propName)) {
                    if (Array.isArray(args)) {
                        rawValue = new rawValue(...args);
                    } else if (args !== undefined && args !== "") {
                        rawValue = new rawValue(args);
                    } else {
                        rawValue = new rawValue();
                    }
                } else {
                    if (Array.isArray(args)) {
                        rawValue = rawValue.apply(el, args); // Bind context correctly to element!
                    } else if (args !== undefined && args !== "") {
                        rawValue = rawValue.call(el, args);
                    } else {
                        rawValue = rawValue.call(el);
                    }
                }
            }
        }

        if (parent === "$param") {
            if (rawValue !== undefined && rawValue !== null) return rawValue;
        } else {
            // Return raw objects/functions immediately so processOperators can tokenize them
            if (
                rawValue instanceof Promise ||
                (typeof rawValue === "object" && rawValue !== null) ||
                typeof rawValue === "function"
            ) {
                return rawValue;
            }
            aggregatedString += String(rawValue ?? "");
        }
    }

    if (!hasValidProperty) return undefined;
    return aggregatedString;
}

function getSubdomain() {
    const hostname = window.location.hostname;
    const parts = hostname.split(".");
    if (parts.length > 2 && isNaN(parseInt(parts[parts.length - 1]))) {
        return parts.slice(0, parts.length - 2).join(".");
    }
    return null;
}

export { processOperators, processOperatorsAsync, customOperators };