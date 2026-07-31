export function getRelativePath(path) {
	const isBrowser = typeof window !== "undefined";

	if (!path && isBrowser) {
		path = window.location.pathname.replace(/\/[^\/]*$/, "");
	}

	if (
		isBrowser &&
		(location.hostname === "localhost" ||
			location.hostname === "127.0.0.1")
	) {
		const srcIndex = path.indexOf("/src");
		if (srcIndex !== -1) {
			path = path.slice(srcIndex + 4);
		}
	}

	if (!path.endsWith("/")) {
		path += "/";
	}
	let depth = path.split("/").filter(Boolean).length;
	return depth > 0 ? "../".repeat(depth) : "./";
}
