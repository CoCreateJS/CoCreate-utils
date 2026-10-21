import { queryElements } from "../queryElements.js";

function getElement(context) {
    return context?.element || context?.$this || null;
}

const browserGlobals = {
    get $organization_id() { return typeof localStorage !== "undefined" ? localStorage.getItem("organization_id") : ""; },
    get $user_id() { return typeof localStorage !== "undefined" ? localStorage.getItem("user_id") : ""; },
    get $client_id() { return typeof localStorage !== "undefined" ? localStorage.getItem("clientId") : ""; },
    get $session_id() { return typeof localStorage !== "undefined" ? localStorage.getItem("session_id") : ""; },
    get $this() { return getElement(this); },
    set $this(value) {
        Object.defineProperty(this, "$this", {
            value,
            writable: true,
            configurable: true,
            enumerable: true
        });
    },
    get $value() {
        const element = getElement(this);
        if (!element) return "";
        if (typeof element.getValueSync === "function") return element.getValueSync();
        return typeof element.getValue === "function" ? element.getValue() : "";
    },
    get $innerWidth() { return typeof window !== "undefined" ? window.innerWidth : 0; },
    get $innerHeight() { return typeof window !== "undefined" ? window.innerHeight : 0; },
    get $href() { return typeof window !== "undefined" ? window.location.href.replace(/\/$/, "") : ""; },
    get $origin() { return typeof window !== "undefined" ? window.location.origin : ""; },
    get $protocol() { return typeof window !== "undefined" ? window.location.protocol : ""; },
    get $hostname() { return typeof window !== "undefined" ? window.location.hostname : ""; },
    get $host() { return typeof window !== "undefined" ? window.location.host : ""; },
    get $port() { return typeof window !== "undefined" ? window.location.port : ""; },
    get $pathname() { return typeof window !== "undefined" ? window.location.pathname.replace(/\/$/, "") : ""; },
    get $hash() { return typeof window !== "undefined" ? window.location.hash : ""; },
    get $subdomain() {
        if (typeof window === "undefined") return "";
        const parts = window.location.hostname.split(".");
        return parts.length > 2 ? parts[0] : "";
    },
    get $relativePath() {
        if (typeof window === "undefined") return "./";
        const currentPath = window.location.pathname.replace(/\/[^\/]*$/, "");
        const depth = currentPath.split("/").filter(Boolean).length;
        return depth > 0 ? "../".repeat(depth) : "./";
    },
    get $path() {
        if (typeof window === "undefined") return "";
        let path = window.location.pathname;
        if (path.split("/").pop().includes(".")) path = path.replace(/\/[^\/]+$/, "/");
        return path === "/" ? "" : path;
    },
    $query: function (selector) {
        const element = getElement(this);
        if (typeof selector === "string") selector = selector.trim().replace(/^['"]|['"]$/g, "");
        try {
            const results = queryElements({ element, selector });
            return results && results.length > 0 ? results[0] : undefined;
        } catch (error) {
            console.warn(`[Browser Globals] Invalid $query selector => "${selector}"`, error);
            return undefined;
        }
    },
    $queryAll: function (selector) {
        const element = getElement(this);
        if (typeof selector === "string") {
            selector = selector.trim().replace(/^['"]|['"]$/g, "");
            if (selector.includes("$document")) return [];
        }
        try {
            const results = queryElements({ element, selector });
            return results ? Array.from(results) : [];
        } catch (error) {
            console.warn(`[Browser Globals] Invalid $queryAll selector => "${selector}"`, error);
            return [];
        }
	},
	$attributes: function (value) {
		return this.element.getAttribute(value);
	},
	$setValue: function (...args) {
		return this.element && typeof this.element.setValue === "function"
			? this.element.setValue(...args) || ""
			: "";
	}
};

export const browserGlobalsScope = browserGlobals;

export const browserGlobalOperators = new Map(
    Object.entries(Object.getOwnPropertyDescriptors(browserGlobals)).map(([name, descriptor]) => [
        name,
        descriptor.get
            ? function (...args) {
                const value = descriptor.get.call(this);
                return typeof value === "function" ? value.apply(this, args) : value;
            }
            : descriptor.value
    ])
);
