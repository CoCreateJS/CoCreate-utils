// Tags that are self-closing and never expect a matching closing tag in standard HTML5
export const DEFAULT_SELF_CLOSING_ELEMENTS = new Set([
  "AREA", "BASE", "BR", "COL", "EMBED", "HR", "IMG", "INPUT",
  "LINK", "META", "PARAM", "SOURCE", "TRACK", "WBR", "FRAME"
]);

/**
 * Replaces HTML comment contents with spaces to preserve character index offsets 1:1.
 * @param {string} html - Raw HTML input
 * @returns {string} Comment-masked HTML string
 */
export function maskComments(html) {
  if (!html) return "";
  return html.replace(/<!--[\s\S]*?-->/g, (match) => " ".repeat(match.length));
}

/**
 * Parses raw HTML attribute string into a key-value map.
 * Handles double quotes, single quotes, unquoted values, and boolean attributes.
 * Distinguishes full attribute keys with hyphens (e.g., state-src vs src).
 * @param {string} attrString - Opening tag attributes string
 * @returns {Record<string, string>} Map of attribute names to string values
 */
export function parseAttributes(attrString) {
  if (!attrString) return {};
  const attrs = {};
  // Match full attribute names including hyphens, underscores, colons, dots, and @
  const regex = /([a-zA-Z0-9_.:@-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
  let match;

  while ((match = regex.exec(attrString)) !== null) {
    const name = match[1].toLowerCase();
    const value = match[2] ?? match[3] ?? match[4] ?? "";
    attrs[name] = value;
  }

  return attrs;
}

/**
 * Finds the corresponding matching end tag for a given open tag considering nested depth.
 * @param {string} html - Raw HTML string
 * @param {string} targetTag - Uppercase tag name to match
 * @param {number} searchFromIndex - Index after the opening tag
 * @param {Set<string>} [selfClosingElements] - Optional set of self-closing tag names
 * @returns {{ closeTagStart: number, endIndex: number } | null} Index boundaries
 */
export function findMatchingEndTag(html, targetTag, searchFromIndex, selfClosingElements = DEFAULT_SELF_CLOSING_ELEMENTS) {
  const cleanHtml = maskComments(html);
  const tagRegex = new RegExp(
    `<(/)?\\s*(${targetTag})\\b((?:"[^"]*"|'[^']*'|[^'">])*)>`,
    "gi"
  );
  tagRegex.lastIndex = searchFromIndex;
  const selfClosingSet = selfClosingElements instanceof Set 
    ? selfClosingElements 
    : new Set(Array.from(selfClosingElements || []).map(v => String(v).toUpperCase()));

  let depth = 1;
  let match;

  while ((match = tagRegex.exec(cleanHtml)) !== null) {
    const isClosing = Boolean(match[1]);
    const attrString = match[3] || "";
    const isSelfClosing = attrString.trim().endsWith("/") || selfClosingSet.has(targetTag);

    if (isClosing) {
      depth--;
      if (depth === 0) {
        return {
          closeTagStart: match.index,
          endIndex: tagRegex.lastIndex
        };
      }
    } else if (!isSelfClosing) {
      depth++;
    }
  }

  return null;
}

/**
 * Represents a matched element within the HTML document.
 * Provides intuitive DOM-like methods while recording pending mutations.
 */
export class ElementHandle {
  constructor(doc, match) {
    this._doc = doc;
    this.tagName = match.tagName;
    this.attributes = { ...match.attributes };
    this.startIndex = match.startIndex;
    this.openTagEnd = match.openTagEnd;
    this.closeTagStart = match.closeTagStart;
    this.endIndex = match.endIndex;
    this.isSelfClosing = match.isSelfClosing;

    this.pendingOuterHtml = null;
    this.pendingInnerHtml = null;
    this.attributeMutations = {};
  }

  getAttribute(name) {
    if (!name) return null;
    return this.attributes[name.toLowerCase()] ?? null;
  }

  getAttributes() {
    return { ...this.attributes };
  }

  hasAttribute(name) {
    if (!name) return false;
    return Object.prototype.hasOwnProperty.call(this.attributes, name.toLowerCase());
  }

  setAttribute(name, value) {
    if (!name) return;
    const key = name.toLowerCase();
    const strVal = String(value);
    this.attributes[key] = strVal;
    this.attributeMutations[key] = strVal;
  }

  removeAttribute(name) {
    if (!name) return;
    const key = name.toLowerCase();
    delete this.attributes[key];
    this.attributeMutations[key] = null;
  }

  getInnerHTML() {
    if (this.isSelfClosing) return "";
    return this._doc.rawHtml.slice(this.openTagEnd, this.closeTagStart);
  }

  getOuterHTML() {
    return this._doc.rawHtml.slice(this.startIndex, this.endIndex);
  }

  setInnerHTML(html) {
    if (this.isSelfClosing) return;
    this.pendingInnerHtml = String(html);
  }

  replaceWith(html) {
    this.pendingOuterHtml = String(html);
  }
}

/**
 * Zero-DOM high-performance HTML String Scanner.
 */
export class HTMLScanner {
  constructor(html, options = {}) {
    this.rawHtml = String(html || "");
    this.handles = [];
    const customSelfClosing = options.selfClosingElements;
    this.selfClosingElements = customSelfClosing
      ? new Set(Array.from(customSelfClosing).map(v => String(v).toUpperCase()))
      : DEFAULT_SELF_CLOSING_ELEMENTS;
  }

  querySelectorAll({ attributes = [], excludeTags = [], tags = [], selfClosingElements } = {}) {
    const cleanHtml = maskComments(this.rawHtml);
    const excludeSet = new Set(excludeTags.map(t => t.toUpperCase()));
    const targetTagsSet = tags.length > 0 ? new Set(tags.map(t => t.toUpperCase())) : null;
    const reqAttrs = attributes.map(a => a.toLowerCase());
    const selfClosingSet = selfClosingElements
      ? new Set(Array.from(selfClosingElements).map(v => String(v).toUpperCase()))
      : this.selfClosingElements;

    // A closing angle bracket inside a quoted attribute value belongs to the
    // value (for example, `query="form > .field"`), not to the opening tag.
    const openTagRegex = /<\s*([a-zA-Z0-9-]+)((?:"[^"]*"|'[^']*'|[^'">])*)>/g;
    const result = [];
    let match;

    while ((match = openTagRegex.exec(cleanHtml)) !== null) {
      const tagName = match[1].toUpperCase();

      if (excludeSet.has(tagName)) continue;
      if (targetTagsSet && !targetTagsSet.has(tagName)) continue;

      const attrString = match[2];
      const parsedAttrs = parseAttributes(attrString);

      // Check attribute presence filter
      if (reqAttrs.length > 0) {
        const matchesAttr = reqAttrs.some(attr => Object.prototype.hasOwnProperty.call(parsedAttrs, attr));
        if (!matchesAttr) continue;
      }

      const startIndex = match.index;
      const openTagEnd = openTagRegex.lastIndex;
      const isSelfClosing = attrString.trim().endsWith("/") || selfClosingSet.has(tagName);

      let closeTagStart = openTagEnd;
      let endIndex = openTagEnd;

      if (!isSelfClosing) {
        const bounds = findMatchingEndTag(this.rawHtml, tagName, openTagEnd, selfClosingSet);
        if (bounds) {
          closeTagStart = bounds.closeTagStart;
          endIndex = bounds.endIndex;
        }
      }

      const handle = new ElementHandle(this, {
        tagName,
        attributes: parsedAttrs,
        startIndex,
        openTagEnd,
        closeTagStart,
        endIndex,
        isSelfClosing
      });

      this.handles.push(handle);
      result.push(handle);
    }

    return result;
  }

  /**
   * Reconstructs the full HTML string by executing all pending handle mutations bottom-up (right-to-left).
   * @returns {string} Mutated HTML string
   */
  toString() {
    let result = this.rawHtml;

    // Filter handles that actually contain modifications
    const dirtyHandles = this.handles.filter(h =>
      h.pendingOuterHtml !== null ||
      h.pendingInnerHtml !== null ||
      Object.keys(h.attributeMutations).length > 0
    );

    // Sort descending by startIndex so earlier character indices remain perfectly aligned
    dirtyHandles.sort((a, b) => b.startIndex - a.startIndex);

    for (const handle of dirtyHandles) {
      // 1. Replace entire outer element
      if (handle.pendingOuterHtml !== null) {
        result = result.slice(0, handle.startIndex) + handle.pendingOuterHtml + result.slice(handle.endIndex);
        continue;
      }

      // 2. Apply attribute updates on opening tag
      let openTag = result.slice(handle.startIndex, handle.openTagEnd);
      if (Object.keys(handle.attributeMutations).length > 0) {
        for (const [attr, val] of Object.entries(handle.attributeMutations)) {
          if (val === null) {
            // Remove attribute using exact whitespace boundaries (preventing prefix matching)
            const removeRegex = new RegExp(`(?:^|\\s+)${attr}(?:\\s*=\\s*(?:"[^"]*"|'[^']*'|[^\\s"'>]+))?`, "gi");
            openTag = openTag.replace(removeRegex, "");
          } else {
            const strVal = String(val).replace(/"/g, "&quot;");
            // Match exact attribute name using strict whitespace/tag boundaries
            const attrRegex = new RegExp(`(?:^|\\s+)(${attr})\\s*=\\s*(?:"[^"]*"|'[^']*'|[^\\s"'>]+)`, "i");
            if (attrRegex.test(openTag)) {
              openTag = openTag.replace(attrRegex, (match, p1) => {
                const leadSpace = match.startsWith(" ") || match.startsWith("\t") || match.startsWith("\n") ? match[0] : " ";
                return `${leadSpace}${p1}="${strVal}"`;
              });
            } else {
              const closingAngle = openTag.lastIndexOf(">");
              if (openTag.endsWith("/>")) {
                openTag = openTag.slice(0, closingAngle - 1) + ` ${attr}="${strVal}" />`;
              } else {
                openTag = openTag.slice(0, closingAngle) + ` ${attr}="${strVal}">`;
              }
            }
          }
        }
      }

      // 3. Apply inner HTML updates
      if (handle.pendingInnerHtml !== null && !handle.isSelfClosing) {
        result = result.slice(0, handle.startIndex) + openTag + handle.pendingInnerHtml + result.slice(handle.closeTagStart);
      } else {
        result = result.slice(0, handle.startIndex) + openTag + result.slice(handle.openTagEnd);
      }
    }

    return result;
  }
}
