const rect = value => ({
    left: value.left,
    top: value.top,
    width: value.width,
    height: value.height
});

/** Check whether the document selection intersects an element. */
export function hasSelection(element) {
    if (!element || !element.ownerDocument) return false;

    if (["INPUT", "TEXTAREA"].includes(element.tagName))
        return element.selectionStart !== element.selectionEnd;

    const selection = element.ownerDocument.getSelection();
    if (!selection || selection.isCollapsed || !selection.rangeCount) return false;

    return selection.getRangeAt(0).intersectsNode(element);
}

export function getRangeRects(range, caret = range, host) {
    const selection = [...range.getClientRects()].map(rect);
    let position = [...caret.getClientRects()].at(-1);
    if (!position) {
        const node = caret.startContainer;
        const element = node.nodeType === 1 ? node : node.parentElement;
        const bounds = (element || host).getBoundingClientRect();
        const style = host.ownerDocument.defaultView.getComputedStyle(element || host);
        position = {
            left: bounds.left,
            top: bounds.top,
            width: 0,
            height: parseFloat(style.lineHeight) || parseFloat(style.fontSize) || 16
        };
    }
    return { selection, caret: rect(position) };
}

export function getTextControlRects(element, anchor, head = anchor) {
    if (![anchor, head].every(Number.isInteger) || Math.min(anchor, head) < 0 ||
        Math.max(anchor, head) > element.value.length)
        throw new RangeError("Invalid editor source range.");

    const doc = element.ownerDocument;
    const style = doc.defaultView.getComputedStyle(element);
    const bounds = element.getBoundingClientRect();
    const shell = doc.createElement("div");
    shell.style.cssText = "all:initial;position:fixed;visibility:hidden;pointer-events:none;left:0;top:0;";
    const mirror = doc.createElement("div");
    for (const name of style) mirror.style.setProperty(name, style.getPropertyValue(name));
    Object.assign(mirror.style, {
        position: "fixed", left: `${bounds.left}px`, top: `${bounds.top}px`,
        visibility: "hidden", pointerEvents: "none", margin: "0", transform: "none",
        scale: "none", rotate: "none", translate: "none", animation: "none", transition: "none",
        boxSizing: "border-box", width: `${element.offsetWidth}px`, height: `${element.offsetHeight}px`,
        overflowX: element.tagName === "INPUT" ? "hidden" : style.overflowX,
        overflowY: element.tagName === "INPUT" ? "hidden" : style.overflowY,
        whiteSpace: element.tagName === "INPUT" || element.wrap === "off" ? "pre" : "pre-wrap",
        overflowWrap: element.tagName === "INPUT" || element.wrap === "off" ? "normal" : "break-word"
    });
    const value = element.type === "password" ? "•".repeat(element.value.length) : element.value;
    const text = doc.createTextNode(value + "\u200b");
    mirror.append(text);
    shell.append(mirror);
    doc.documentElement.append(shell);
    try {
        mirror.scrollTop = element.scrollTop;
        mirror.scrollLeft = element.scrollLeft;
        const range = doc.createRange();
        range.setStart(text, Math.min(anchor, head));
        range.setEnd(text, Math.max(anchor, head));
        const caret = doc.createRange();
        caret.setStart(text, head);
        caret.collapse(true);
        const result = getRangeRects(range, caret, mirror);
        const scaleX = bounds.width / (element.offsetWidth || bounds.width);
        const scaleY = bounds.height / (element.offsetHeight || bounds.height);
        const translate = value => ({
            left: bounds.left + (value.left - bounds.left) * scaleX,
            top: bounds.top + (value.top - bounds.top) * scaleY,
            width: value.width * scaleX,
            height: value.height * scaleY
        });
        return { selection: result.selection.map(translate), caret: translate(result.caret) };
    } finally {
        shell.remove();
    }
}

/** Measure source offsets after the caller maps them to DOM ranges. */
export function getSelectionRects(element, anchor, head = anchor, getRange) {
    if (["INPUT", "TEXTAREA"].includes(element.tagName))
        return getTextControlRects(element, anchor, head);
    if (typeof getRange !== "function")
        throw new TypeError("A source-position range resolver is required.");
    const host = element.tagName === "IFRAME"
        ? element.contentDocument.documentElement
        : element;
    const start = Math.min(anchor, head), end = Math.max(anchor, head);
    return getRangeRects(getRange(element, start, end), getRange(element, head, head), host);
}
