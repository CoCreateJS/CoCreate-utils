import { dotNotationToObject } from "../dotNotationToObject.js";
import { getValueFromObject } from "../getValueFromObject.js";
import { queryElements } from "../queryElements.js";
import { queryData } from "../dataQuery.js";
import { browserGlobalsScope } from "./browserGlobals.js";
import { sharedGlobalsScope } from "./sharedGlobals.js";
import { 
    processOperators, 
    processOperatorsAsync, 
    unpackTokens, 
    setASTEvaluators, 
    customOperators 
} from "./operators.js";

const isBrowser = typeof window !== 'undefined';
export const isomorphicSandbox = sharedGlobalsScope;
let baseSandboxScope = isBrowser ? Object.setPrototypeOf(browserGlobalsScope, sharedGlobalsScope) : sharedGlobalsScope;

const conditionalOperators = new Set([
    "$eq",
    "$ne",
    "$not",
    "$lt",
    "$lte",
    "$gt",
    "$gte",
    "$in",
    "$nin",
    "$all",
    "$elemMatch",
    "$size",
    "$exists",
    "$regex",
    "$type",
    "$mod"
]);

function resolveScopedPath(expression, registry, sandbox, bindFunction = false) {
    if (typeof expression !== "string" || !/^\$[\w$-]+(?:\.[\w$-]+|\[\d+\])*$/.test(expression)) {
        return { found: false, value: undefined };
    }

    const path = expression.slice(1).replace(/\[(\d+)\]/g, ".$1").split(".");
    const root = path.shift();
    const prefixedRoot = `$${root}`;
    let value;

    if (registry?.has(prefixedRoot)) {
        value = registry.get(prefixedRoot);
    } else if (registry?.has(root)) {
        value = registry.get(root);
    } else if (sandbox && (prefixedRoot in sandbox || root in sandbox)) {
        value = prefixedRoot in sandbox ? sandbox[prefixedRoot] : sandbox[root];
    } else {
        return { found: false, value: undefined };
    }

    let owner = null;
    for (const property of path) {
        if (value === null || value === undefined || !(property in Object(value))) {
            return { found: false, value: undefined };
        }
        owner = value;
        value = value[property];
    }

    if (bindFunction && owner && typeof value === "function") {
        value = value.bind(owner);
    }

    return { found: true, value };
}

function resolveOperator(expression, registry, sandbox) {
    if (typeof expression !== "string" || !expression.startsWith("$")) {
        return { found: false, value: undefined };
    }

    const [root, ...path] = expression
        .replace(/\[(\d+)\]/g, ".$1")
        .split(".");
    const unprefixedRoot = root.slice(1);
    let value;

    if (registry?.has(root)) {
        value = registry.get(root);
    } else if (registry?.has(unprefixedRoot)) {
        value = registry.get(unprefixedRoot);
    } else if (sandbox && root in Object(sandbox)) {
        value = sandbox[root];
    } else if (sandbox && unprefixedRoot in Object(sandbox)) {
        value = sandbox[unprefixedRoot];
    } else if (customOperators.has(root)) {
        value = customOperators.get(root);
    } else if (customOperators.has(unprefixedRoot)) {
        value = customOperators.get(unprefixedRoot);
    } else {
        return { found: false, value: undefined };
    }

    // Keep the root reference so the shared dot-notation writer can update
    // sandbox or registry objects, including paths whose parents do not exist.
    const assignmentScope = path.length && value !== null &&
        (typeof value === "object" || typeof value === "function")
        ? { [root]: value }
        : undefined;
    let owner = null;
    for (const property of path) {
        if (value === null || value === undefined || !(property in Object(value))) {
            return { found: false, value: undefined, assignmentScope };
        }
        owner = value;
        value = value[property];
    }

    if (owner && typeof value === "function") {
        value = value.bind(owner);
    }

    return { found: true, value, assignmentScope };
}

function getForDefinition(definition) {
    let shouldAwait = false;
    const modifierEntries = Object.entries(definition || {});
    if (modifierEntries.length === 1 && modifierEntries[0][0] === "$await") {
        shouldAwait = true;
        definition = modifierEntries[0][1];
    }

    const sourceEntries = Object.entries(definition || {});
    if (sourceEntries.length !== 1) {
        throw new Error("AST '$for' requires exactly one iterable source.");
    }

    const [source, scope] = sourceEntries[0];
    if (!source.startsWith("$")) {
        throw new Error(`AST '$for' source '${source}' must be a scoped value.`);
    }

    const scopeEntries = Object.entries(scope || {});
    if (scopeEntries.length !== 1) {
        throw new Error("AST '$for' requires exactly one scoped variable and iteration body.");
    }

    const [variable, body] = scopeEntries[0];
    if (!/^[A-Za-z_][\w$]*$/.test(variable)) {
        throw new Error(`AST '$for' has an invalid scoped variable '${variable}'.`);
    }

    return { source, variable, body, shouldAwait };
}

function createIterationScope({ sandbox, registry, variable, value }) {
    const iterationSandbox = sandbox instanceof Map
        ? undefined
        : Object.create(sandbox || null);

    if (iterationSandbox) {
        iterationSandbox[variable] = value;
    }

    const iterationRegistry = new Map(registry);
    iterationRegistry.set(variable, value);
    iterationRegistry.set(`$${variable}`, value);

    return { iterationSandbox, iterationRegistry };
}

function createNestedScope(sandbox, registry) {
    return {
        nestedSandbox: sandbox instanceof Map
            ? undefined
            : Object.create(sandbox || null),
        nestedRegistry: new Map(registry)
    };
}

function getFunctionDefinition(definition) {
    if (!definition || typeof definition !== "object" || Array.isArray(definition)) {
        throw new TypeError("AST '$function' requires an object definition.");
    }

    const params = definition.params || [];
    if (!Array.isArray(params) || params.some(param => typeof param !== "string")) {
        throw new TypeError("AST '$function.params' must be an array of names.");
    }
    if (!Object.prototype.hasOwnProperty.call(definition, "body")) {
        throw new Error("AST '$function' requires a body.");
    }

    if (Object.prototype.hasOwnProperty.call(definition, "async")) {
        throw new TypeError("AST '$function.async' is not supported; wrap '$function' in '$async' instead.");
    }

    return { params, body: definition.body, bind: definition.bind };
}

function createFunctionScope({ sandbox, registry, params, args, thisArg }) {
    const functionSandbox = sandbox instanceof Map
        ? undefined
        : Object.create(sandbox || null);
    const functionRegistry = new Map(registry);

    functionRegistry.set("$this", thisArg);
    functionRegistry.set("this", thisArg);
    if (functionSandbox) functionSandbox.$this = thisArg;

    params.forEach((param, index) => {
        const name = param.replace(/^\$/, "");
        const value = args[index];
        functionRegistry.set(name, value);
        functionRegistry.set(`$${name}`, value);
        if (functionSandbox) {
            functionSandbox[name] = value;
            functionSandbox[`$${name}`] = value;
        }
    });

    return { functionSandbox, functionRegistry };
}

function createASTFunction(expression, { sandbox, node, registry }) {
    const isAsync = Object.prototype.hasOwnProperty.call(expression, "$async");
    let functionExpression = expression;
    if (isAsync) {
        functionExpression = expression.$async;
        if (
            !functionExpression || typeof functionExpression !== "object" ||
            Array.isArray(functionExpression) || Object.keys(functionExpression).length !== 1 ||
            !Object.prototype.hasOwnProperty.call(functionExpression, "$function")
        ) {
            throw new TypeError("AST '$async' requires a nested '$function' definition.");
        }
    }

    const { params, body, bind } = getFunctionDefinition(functionExpression.$function);
    const evaluate = isAsync ? astAsync : astSync;
    const execute = (thisArg, args) => {
        const { functionSandbox, functionRegistry } = createFunctionScope({
            sandbox, registry, params, args, thisArg
        });
        return evaluate({
            executeAST: body,
            sandbox: functionSandbox,
            node,
            registry: functionRegistry
        });
    };
    const callback = isAsync
        ? async function (...args) { return execute(this, args); }
        : function (...args) { return execute(this, args); };

    return { callback, bind };
}

function isClassLike(func) {
    if (typeof func !== "function") return false;

    const source = Function.prototype.toString.call(func);
    if (/^class\s|^class{/.test(source)) return true;

    return !!func.prototype && Object.getOwnPropertyNames(func.prototype)
        .some(member => member !== "constructor");
}

function getIfDefinition(definition, expression = "$if") {
    if (expression !== "$if") {
        const parts = expression.split(".");
        const operator = parts.pop();
        const source = parts.slice(1).join(".");

        if (parts[0] !== "$if" || !source.startsWith("$") || !conditionalOperators.has(operator)) {
            throw new Error(`Invalid AST conditional expression '${expression}'.`);
        }

        return { source, operator, branches: definition };
    }

    const sourceEntries = Object.entries(definition || {});
    if (sourceEntries.length !== 1) {
        throw new Error("AST '$if' requires exactly one condition source.");
    }

    const [source, comparison] = sourceEntries[0];
    if (!source.startsWith("$")) {
        throw new Error(`AST '$if' source '${source}' must be a scoped value.`);
    }

    const comparisonEntries = Object.entries(comparison || {});
    if (comparisonEntries.length !== 1) {
        throw new Error("AST '$if' requires exactly one comparison operator.");
    }

    const [operator, branches] = comparisonEntries[0];
    if (!conditionalOperators.has(operator)) {
        throw new Error(`AST '$if' does not support comparison operator '${operator}'.`);
    }

    return { source, operator, branches };
}

function parseConditionalValue(value, evaluate) {
    if (value === "$true") return true;
    if (value === "$false") return false;
    if (value === "$null") return null;
    if (value === "$undefined") return undefined;
    if (value.startsWith("$")) return evaluate(value);
    return value;
}

function resolveConditionalValueSync(value, context) {
    if (typeof value === "string" && value.startsWith("$")) {
        const scoped = resolveScopedPath(value, context.registry, context.sandbox);
        if (scoped.found || /^\$[\w$-]+(?:\.[\w$-]+|\[\d+\])*$/.test(value)) {
            return scoped.value;
        }
    }

    return astSync({ executeAST: value, ...context });
}

async function resolveConditionalValueAsync(value, context) {
    if (typeof value === "string" && value.startsWith("$")) {
        const scoped = resolveScopedPath(value, context.registry, context.sandbox);
        if (scoped.found || /^\$[\w$-]+(?:\.[\w$-]+|\[\d+\])*$/.test(value)) {
            return scoped.value;
        }
    }

    return await astAsync({ executeAST: value, ...context });
}

function selectConditionalBranch({ definition, evaluate, exists }) {
    const { source, operator, branches } = definition;
    if (!branches || typeof branches !== "object" || Array.isArray(branches)) {
        throw new TypeError("AST '$if' comparison branches must be an object.");
    }

    const sourceValue = evaluate(source);
    const sourceExists = exists(source);
    for (const [condition, branch] of Object.entries(branches)) {
        if (condition === "$else") continue;

        const conditionValue = parseConditionalValue(condition, evaluate);
        const matches = operator === "$exists"
            ? sourceExists === Boolean(conditionValue)
            : queryData(
                { value: sourceValue },
                { value: { [operator]: conditionValue } }
            );
        if (matches) {
            return { found: true, branch };
        }
    }

    return Object.prototype.hasOwnProperty.call(branches, "$else")
        ? { found: true, branch: branches.$else }
        : { found: false };
}

async function selectConditionalBranchAsync({ definition, evaluate, exists }) {
    const { source, operator, branches } = definition;
    if (!branches || typeof branches !== "object" || Array.isArray(branches)) {
        throw new TypeError("AST '$if' comparison branches must be an object.");
    }

    const sourceValue = await evaluate(source);
    const sourceExists = exists(source);
    for (const [condition, branch] of Object.entries(branches)) {
        if (condition === "$else") continue;

        const conditionValue = await parseConditionalValue(condition, evaluate);
        const matches = operator === "$exists"
            ? sourceExists === Boolean(conditionValue)
            : queryData(
                { value: sourceValue },
                { value: { [operator]: conditionValue } }
            );
        if (matches) {
            return { found: true, branch };
        }
    }

    return Object.prototype.hasOwnProperty.call(branches, "$else")
        ? { found: true, branch: branches.$else }
        : { found: false };
}

function resolveNullishSync(values, context) {
    if (!Array.isArray(values)) {
        throw new TypeError("AST '$null' requires an array of candidate values.");
    }

    for (const value of values) {
        const resolved = resolveConditionalValueSync(value, context);
        if (resolved !== null && resolved !== undefined) return resolved;
    }
}

async function resolveNullishAsync(values, context) {
    if (!Array.isArray(values)) {
        throw new TypeError("AST '$null' requires an array of candidate values.");
    }

    for (const value of values) {
        const resolved = await resolveConditionalValueAsync(value, context);
        if (resolved !== null && resolved !== undefined) return resolved;
    }
}

export function astSync({ executeAST, sandbox, node, registry } = {}) {
    const targetNode = executeAST !== undefined ? executeAST : node;
    if (targetNode === null || targetNode === undefined) return targetNode;

    if (!registry) {
        if (!(sandbox instanceof Map)) {
            const activeScope = Object.create(baseSandboxScope);
            Object.assign(activeScope, sandbox || {});
            if (node && activeScope.element === undefined) activeScope.element = node;
            sandbox = activeScope;
        }
        registry = sandbox instanceof Map ? sandbox : new Map(Object.entries(sandbox));
    }

    // Leaf String Evaluator: route to OperatorJS engine
    if (typeof targetNode === "string") {
        const scoped = resolveScopedPath(targetNode, registry, sandbox);
        if (scoped.found) return scoped.value;

        if (targetNode.includes("$") || targetNode.includes("ObjectId()") || targetNode.includes("`")) {
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
        const structuralKey = keys.length === 1 ? keys[0] : undefined;

        const isConditionalExpression = structuralKey === "$if" || structuralKey?.startsWith("$if.");

        if (structuralKey?.startsWith("$") && structuralKey.includes(".$") && !isConditionalExpression) {
            throw new Error(`AST operators must be composed as nested objects, not '${structuralKey}'.`);
        }

        if (structuralKey === "$null") {
            return resolveNullishSync(targetNode.$null, { sandbox, node, registry });
        }

        if (structuralKey === "$await") {
            throw new Error("AST '$await' requires astAsync.");
        }

        if (structuralKey === "$function" || structuralKey === "$async") {
            const { callback, bind } = createASTFunction(targetNode, { sandbox, node, registry });
            if (bind === undefined) return callback;
            const thisArg = astSync({ executeAST: bind, sandbox, node, registry });
            return callback.bind(thisArg);
        }

        if (isConditionalExpression) {
            const context = { sandbox, node, registry };
            const selected = selectConditionalBranch({
                definition: getIfDefinition(targetNode[structuralKey], structuralKey),
                evaluate: (value) => resolveConditionalValueSync(value, context),
                exists: (value) => resolveScopedPath(value, registry, sandbox).found
            });
            return selected.found
                ? astSync({ executeAST: selected.branch, ...context })
                : undefined;
        }

        if (structuralKey === "$for") {
            const {
                source: sourceExpression,
                variable,
                body,
                shouldAwait
            } = getForDefinition(targetNode.$for);
            if (shouldAwait) {
                throw new Error("AST '$for' with '$await' requires astAsync.");
            }
            const source = resolveConditionalValueSync(sourceExpression, { sandbox, node, registry });
            if (!source || typeof source[Symbol.iterator] !== "function") {
                throw new TypeError("AST '$for' source is not synchronously iterable.");
            }

            let result;
            for (const value of source) {
                const { iterationSandbox, iterationRegistry } = createIterationScope({
                    sandbox,
                    registry,
                    variable,
                    value
                });
                result = astSync({
                    executeAST: body,
                    sandbox: iterationSandbox,
                    node,
                    registry: iterationRegistry
                });
            }
            return result;
        }
        
        // Context Function/Operator Evaluation for single key objects
        if (keys.length === 1 && keys[0].startsWith("$")) {
            const key = keys[0];

            const resolvedOperator = resolveOperator(key, registry, sandbox);
            let opFunc = resolvedOperator.value;
            const { assignmentScope } = resolvedOperator;

            if (opFunc !== undefined || assignmentScope) {
                const { nestedSandbox, nestedRegistry } = createNestedScope(sandbox, registry);
                const evaluatedParam = astSync({
                    executeAST: targetNode[key],
                    sandbox: nestedSandbox,
                    node,
                    registry: nestedRegistry
                });
                if (assignmentScope && typeof opFunc !== "function") {
                    dotNotationToObject({ [key]: evaluatedParam }, assignmentScope);
                    return evaluatedParam;
                }
                let opCtx = { element: node, registry };
                if (typeof opFunc === "function") {
                    const args = Array.isArray(evaluatedParam) ? evaluatedParam : [evaluatedParam];

                    if (isClassLike(opFunc)) {
                        return new opFunc(...args);
                    }

                    // Attempt invocation as function, fallback to constructor on TypeError
                    try {
                        return opFunc.call(opCtx, ...args);
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
            if (key === "$return") {
                return astSync({
                    executeAST: targetNode[key],
                    sandbox,
                    node,
                    registry
                });
            }

            if (key !== "$return" && key.startsWith("$")) {
                const operator = resolveOperator(key, registry, sandbox);
                if (
                    typeof operator.value === "function" ||
                    operator.assignmentScope
                ) {
                    resolvedObject[key] = astSync({
                        executeAST: { [key]: targetNode[key] },
                        sandbox,
                        node,
                        registry
                    });
                    continue;
                }
            }

            let finalKey = key;

            if (key.startsWith("$") && !["$array", "filter", "$storage", "$database"].includes(key)) {
                const resolvedKey = astSync({ executeAST: key, sandbox, node, registry });
                if (typeof resolvedKey === "string" || typeof resolvedKey === "number") {
                    finalKey = String(resolvedKey);
                }
            } else if (key.includes('{{') && key.includes('}}')) {
                finalKey = resolveInlinePlaceholdersSync(key, { sandbox, node, registry });
            }

            let finalValue = targetNode[key];
            if (typeof finalValue === "string") {
                if (finalValue.startsWith("$") && !["$array", "filter", "$storage", "$database"].includes(finalValue)) {
                    finalValue = astSync({ executeAST: finalValue, sandbox, node, registry });
                } else if (finalValue.includes('{{') && finalValue.includes('}}')) {
                    finalValue = resolveInlinePlaceholdersSync(finalValue, { sandbox, node, registry });
                }
            } else if (Array.isArray(finalValue) || (typeof finalValue === "object" && finalValue !== null)) {
                finalValue = astSync({ executeAST: finalValue, sandbox, node, registry });
            }

            if (finalKey === '$return') {
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
        if (!(sandbox instanceof Map)) {
            const activeScope = Object.create(baseSandboxScope);
            Object.assign(activeScope, sandbox || {});
            if (node && activeScope.element === undefined) activeScope.element = node;
            sandbox = activeScope;
        }
        registry = sandbox instanceof Map ? sandbox : new Map(Object.entries(sandbox));
    }

    // Leaf String Evaluator: route to OperatorJS engine
    if (typeof targetNode === "string") {
        const scoped = resolveScopedPath(targetNode, registry, sandbox);
        if (scoped.found) return scoped.value;

        if (targetNode.includes("$") || targetNode.includes("ObjectId()") || targetNode.includes("`")) {
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
        const structuralKey = keys.length === 1 ? keys[0] : undefined;

        const isConditionalExpression = structuralKey === "$if" || structuralKey?.startsWith("$if.");

        if (structuralKey?.startsWith("$") && structuralKey.includes(".$") && !isConditionalExpression) {
            throw new Error(`AST operators must be composed as nested objects, not '${structuralKey}'.`);
        }

        if (structuralKey === "$null") {
            return await resolveNullishAsync(targetNode.$null, { sandbox, node, registry });
        }

        if (structuralKey === "$await") {
            return await astAsync({
                executeAST: targetNode.$await,
                sandbox,
                node,
                registry
            });
        }

        if (structuralKey === "$function" || structuralKey === "$async") {
            const { callback, bind } = createASTFunction(targetNode, { sandbox, node, registry });
            if (bind === undefined) return callback;
            const thisArg = await astAsync({ executeAST: bind, sandbox, node, registry });
            return callback.bind(thisArg);
        }

        if (isConditionalExpression) {
            const context = { sandbox, node, registry };
            const selected = await selectConditionalBranchAsync({
                definition: getIfDefinition(targetNode[structuralKey], structuralKey),
                evaluate: (value) => resolveConditionalValueAsync(value, context),
                exists: (value) => resolveScopedPath(value, registry, sandbox).found
            });
            return selected.found
                ? await astAsync({ executeAST: selected.branch, ...context })
                : undefined;
        }

        if (structuralKey === "$for") {
            const {
                source: sourceExpression,
                variable,
                body,
                shouldAwait
            } = getForDefinition(targetNode.$for);
            const source = await resolveConditionalValueAsync(sourceExpression, { sandbox, node, registry });
            let result;
            if (shouldAwait) {
                const isIterable = source && (
                    typeof source[Symbol.asyncIterator] === "function" ||
                    typeof source[Symbol.iterator] === "function"
                );
                if (!isIterable) {
                    throw new TypeError("AST '$for' '$await' source is not iterable.");
                }

                for await (const value of source) {
                    const { iterationSandbox, iterationRegistry } = createIterationScope({
                        sandbox,
                        registry,
                        variable,
                        value
                    });
                    result = await astAsync({
                        executeAST: body,
                        sandbox: iterationSandbox,
                        node,
                        registry: iterationRegistry
                    });
                }
            } else {
                if (!source || typeof source[Symbol.iterator] !== "function") {
                    throw new TypeError("AST '$for' source is not synchronously iterable.");
                }

                for (const value of source) {
                    const { iterationSandbox, iterationRegistry } = createIterationScope({
                        sandbox,
                        registry,
                        variable,
                        value
                    });
                    result = await astAsync({
                        executeAST: body,
                        sandbox: iterationSandbox,
                        node,
                        registry: iterationRegistry
                    });
                }
            }
            return result;
        }
        
        // Context Function/Operator Evaluation for single key objects
        if (keys.length === 1 && keys[0].startsWith("$")) {
            const key = keys[0];

            const resolvedOperator = resolveOperator(key, registry, sandbox);
            let opFunc = resolvedOperator.value;
            const { assignmentScope } = resolvedOperator;

            if (opFunc !== undefined || assignmentScope) {
                const { nestedSandbox, nestedRegistry } = createNestedScope(sandbox, registry);
                const evaluatedParam = await astAsync({
                    executeAST: targetNode[key],
                    sandbox: nestedSandbox,
                    node,
                    registry: nestedRegistry
                });
                if (assignmentScope && typeof opFunc !== "function") {
                    dotNotationToObject({ [key]: evaluatedParam }, assignmentScope);
                    return evaluatedParam;
                }
                let opCtx = { element: node, registry };
                if (typeof opFunc === "function") {
                    const args = Array.isArray(evaluatedParam) ? evaluatedParam : [evaluatedParam];

                    if (isClassLike(opFunc)) {
                        return new opFunc(...args);
                    }

                    // Attempt invocation as function, fallback to constructor on TypeError
                    try {
                        return await opFunc.call(opCtx, ...args);
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
            if (key === "$return") {
                return await astAsync({
                    executeAST: targetNode[key],
                    sandbox,
                    node,
                    registry
                });
            }

            if (key !== "$return" && key.startsWith("$")) {
                const operator = resolveOperator(key, registry, sandbox);
                if (
                    typeof operator.value === "function" ||
                    operator.assignmentScope
                ) {
                    resolvedObject[key] = await astAsync({
                        executeAST: { [key]: targetNode[key] },
                        sandbox,
                        node,
                        registry
                    });
                    continue;
                }
            }

            let finalKey = key;

            if (key.startsWith("$") && !["$array", "filter", "$storage", "$database"].includes(key)) {
                const resolvedKey = await astAsync({ executeAST: key, sandbox, node, registry });
                if (typeof resolvedKey === "string" || typeof resolvedKey === "number") {
                    finalKey = String(resolvedKey);
                }
            } else if (key.includes('{{') && key.includes('}}')) {
                finalKey = await resolveInlinePlaceholdersAsync(key, { sandbox, node, registry });
            }

            let finalValue = targetNode[key];
            if (typeof finalValue === "string") {
                if (finalValue.startsWith("$") && !["$array", "filter", "$storage", "$database"].includes(finalValue)) {
                    finalValue = await astAsync({ executeAST: finalValue, sandbox, node, registry });
                } else if (finalValue.includes('{{') && finalValue.includes('}}')) {
                    finalValue = await resolveInlinePlaceholdersAsync(finalValue, { sandbox, node, registry });
                }
            } else if (Array.isArray(finalValue) || (typeof finalValue === "object" && finalValue !== null)) {
                finalValue = await astAsync({ executeAST: finalValue, sandbox, node, registry });
            }

            if (finalKey === '$return') {
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
