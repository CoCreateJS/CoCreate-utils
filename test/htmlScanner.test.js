import assert from "node:assert/strict";
import test from "node:test";

import { HTMLScanner } from "../src/server.js";

test("preserves child combinators inside quoted attribute values", () => {
  const html = '<div onload-query="form > .card-body[]"></div>';
  const scanner = new HTMLScanner(html);
  const [element] = scanner.querySelectorAll({ tags: ["DIV"] });

  assert.equal(element.getAttribute("onload-query"), "form > .card-body[]");
  assert.equal(scanner.toString(), html);
});

test("does not corrupt quoted selectors when mutating an opening tag", () => {
  const scanner = new HTMLScanner(
    '<div onload-query=".offcanvas-app-view > form > .card-body[]"></div>'
  );
  const [element] = scanner.querySelectorAll({ tags: ["DIV"] });

  element.setAttribute("rendered", "");

  assert.equal(
    scanner.toString(),
    '<div onload-query=".offcanvas-app-view > form > .card-body[]" rendered=""></div>'
  );
});

test("finds nested matching tags with child combinators in attributes", () => {
  const html = [
    '<section onload-query="form > .card-body[]">',
    '  <section observe-query="main > form"></section>',
    '</section>',
    '<p>after</p>'
  ].join("\n");
  const scanner = new HTMLScanner(html);
  const [outer] = scanner.querySelectorAll({ tags: ["SECTION"] });

  outer.setAttribute("rendered", "");

  assert.match(scanner.toString(), /<\/section>\n<p>after<\/p>$/);
  assert.match(
    scanner.toString(),
    /onload-query="form > \.card-body\[\]" rendered=""/
  );
});
