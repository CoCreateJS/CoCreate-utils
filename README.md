# CoCreate-utils

A simple utils component in vanilla javascript. Easily configured using HTML5 attributes and/or JavaScript API. Take it for a spin in our [playground!](https://cocreate.app/docs/utils)

![minified](https://img.badgesize.io/https://cdn.cocreate.app/utils/latest/CoCreate-utils.min.js?style=flat-square&label=minified&color=orange)
![gzip](https://img.badgesize.io/https://cdn.cocreate.app/utils/latest/CoCreate-utils.min.js?compression=gzip&style=flat-square&label=gzip&color=yellow)
![brotli](https://img.badgesize.io/https://cdn.cocreate.app/utils/latest/CoCreate-utils.min.js?compression=brotli&style=flat-square&label=brotli)
![GitHub latest release](https://img.shields.io/github/v/release/CoCreate-app/CoCreate-utils?style=flat-square)
![License](https://img.shields.io/github/license/CoCreate-app/CoCreate-utils?style=flat-square)
![Hiring](https://img.shields.io/static/v1?style=flat-square&label=&message=Hiring&color=blueviolet)

![CoCreate-utils](https://cdn.cocreate.app/docs/CoCreate-utils.gif)

## [Docs & Demo](https://cocreate.app/docs/utils)

For a complete guide and working demo refer to the [doumentation](https://cocreate.app/docs/utils)

## CDN

```html
<script src="https://cdn.cocreate.app/utils/latest/CoCreate-utils.min.js"></script>
```

```html
<script src="https://cdn.cocreate.app/utils/latest/CoCreate-utils.min.css"></script>
```

## NPM

```shell
$ npm i @cocreate/utils
```

## yarn

```shell
$ yarn install @cocreate/utils
```

## Module Usage

### ESM (tree-shaking)

```js
import { uid, ObjectId } from "@cocreate/utils";
```

### ESM subpath imports

```js
import { getValueFromObject } from "@cocreate/utils/getValueFromObject";
import { queryElements } from "@cocreate/utils/queryElements";
```

### CommonJS (Node)

```js
const { uid, ObjectId } = require("@cocreate/utils");
const { getValueFromObject } = require("@cocreate/utils/getValueFromObject");
```

## Querying and Sorting

CoCreate exposes one data-object API across MongoDB, IndexedDB, MySQL, and
other storage providers. MongoDB query and sort behavior is the canonical
contract. A storage wrapper may use its native query engine or indexes as an
optimization, but it must return the same logical result.

The shared helpers are available from `@cocreate/utils`:

```js
import { queryData, searchData, sortData } from "@cocreate/utils";
```

### Querying

`queryData(object, query)` evaluates a MongoDB-style query against one object.
Keys may use dot notation to address nested values.

```js
const matches = queryData(
    {
        status: "active",
        profile: { score: 82 },
        tags: ["customer", "priority"]
    },
    {
        status: "active",
        "profile.score": { $gte: 80 },
        tags: { $in: ["priority"] }
    }
);
```

Queries can combine conditions using `$and`, `$or`, and `$nor`. Supported
field operators include equality and inequality comparisons, membership,
array matching, existence, regular expressions, type checks, and modulus
checks. Storage wrappers should translate these conditions to their native
query language when equivalent behavior is available and use the shared
helper as the compatibility fallback.

`searchData(object, search)` performs text-oriented matching across an object.
It is separate from structured `queryData` filtering and can be applied after
a record satisfies the structured query.

### Multi-field sorting

`sortData(data, sort)` applies sort fields in their declared order:

```js
const sorted = sortData(records, [
    { key: "status", direction: "asc" },
    { key: "modified.on", direction: "desc" },
    { key: "_id", direction: "desc" }
]);
```

The first field is the primary sort. The second field is compared only when
the primary values are equal, and each later field breaks ties left by all
preceding fields. A missing secondary or tertiary value does not exclude the
record.

Sorting follows MongoDB conventions:

- Keys support dot notation, including nested values such as `modified.on`.
- A missing field is treated as `null` for comparison.
- Null and missing values sort before ordinary values in ascending order and
  after them in descending order.
- Values of different types follow MongoDB's BSON comparison order.
- Array and object comparisons should follow MongoDB behavior where the
  corresponding JavaScript representation permits it.
- Equivalent sort keys do not imply a stable order. Include `_id` as the final
  field when deterministic pagination or rendering is required.

### Storage-native sorting

Storage wrappers should prefer native sorting when it produces the canonical
result:

- MongoDB can use its native sort directly.
- IndexedDB can use one cursor over a compound index when every indexed field
  is present and all fields use the same direction.
- SQL wrappers can translate the sort to `ORDER BY` while explicitly matching
  MongoDB's null ordering.
- Mixed directions, optional IndexedDB index fields, or incompatible native
  type ordering must use the shared comparator as a fallback.

IndexedDB compound indexes omit records that do not contain every indexed
field. Therefore, an optional secondary or tertiary field must not be placed
in the only cursor used to collect results unless the wrapper also collects
the omitted records. Falling back to `sortData` preserves the unified
behavior.

### Pagination

Filtering and the complete canonical ordering must be established before
`index` and `limit` are applied. Paginating an incompletely sorted result set
can return different records across storage providers.

For cursor pagination, include `_id` as the final sort key and build the next
range from all sort-key values plus `_id`. This provides a deterministic
boundary when multiple records share the same preceding values.

## Build

```shell
# Build UMD + ESM + CJS
npm run build

# Build only module outputs
npm run build:modules

# Build only UMD bundle
npm run build:umd
```

# Table of Contents

-   [Table of Contents](#table-of-contents)
-   [Querying and Sorting](#querying-and-sorting)
-   [Announcements](#announcements)
-   [Roadmap](#roadmap)
-   [How to Contribute](#how-to-contribute)
-   [About](#about)
-   [License](#license)

<a name="announcements"></a>

# Announcements

All updates to this library are documented in our [CHANGELOG](https://github.com/CoCreate-app/CoCreate-utils/blob/master/CHANGELOG.md) and [releases](https://github.com/CoCreate-app/CoCreate-utils/releases). You may also subscribe to email for releases and breaking changes.

<a name="roadmap"></a>

# Roadmap

If you are interested in the future direction of this project, please take a look at our open [issues](https://github.com/CoCreate-app/CoCreate-utils/issues) and [pull requests](https://github.com/CoCreate-app/CoCreate-utils/pulls). We would love to hear your feedback.

<a name="about"></a>

# About

CoCreate-utils is guided and supported by the CoCreate Developer Experience Team.

Please Email the Developer Experience Team [here](mailto:develop@cocreate.app) in case of any queries.

CoCreate-utils is maintained and funded by CoCreate. The names and logos for CoCreate are trademarks of CoCreate, LLC.

<a name="contribute"></a>

# How to Contribute

We encourage contribution to our libraries (you might even score some nifty swag), please see our [CONTRIBUTING](https://github.com/CoCreate-app/CoCreate-utils/blob/master/CONTRIBUTING.md) guide for details.

We want this library to be community-driven, and CoCreate led. We need your help to realize this goal. To help make sure we are building the right things in the right order, we ask that you create [issues](https://github.com/CoCreate-app/CoCreate-utils/issues) and [pull requests](https://github.com/CoCreate-app/CoCreate-utils/pulls) or merely upvote or comment on existing issues or pull requests.

We appreciate your continued support, thank you!

<a name="license"></a>

# License

This software is dual-licensed under the GNU Affero General Public License version 3 (AGPLv3) and a commercial license.

-   **Open Source Use**: For open-source projects and non-commercial use, this software is available under the AGPLv3. The AGPLv3 allows you to freely use, modify, and distribute this software, provided that all modifications and derivative works are also licensed under the AGPLv3. For the full license text, see the [LICENSE file](https://github.com/CoCreate-app/CoCreate-utils/blob/master/LICENSE).

-   **Commercial Use**: For-profit companies and individuals intending to use this software for commercial purposes must obtain a commercial license. The commercial license is available when you sign up for an API key on our [website](https://cocreate.app). This license permits proprietary use and modification of the software without the copyleft requirements of the AGPLv3. It is ideal for integrating this software into proprietary commercial products and applications.

If you have not purchased a commercial license and intend to use this software for commercial purposes, you are required to sign up for an API key on our website.

### Leading `$this` selector

Start a query branch with `$this` to return the current element, or attach a
CSS selector to test that element with `matches()` before continuing:

```html
click-query="$this:checked $closest .api-type-filter input:checked[]"
click-query="$this.active[aria-pressed='true'] $parent .target"
```

`$this#id`, `$this.class`, `$this[attribute]`, and pseudo-classes all match the
current element, rather than descendants. A failed match stops only that
comma-separated branch. Bare `$this` returns the current element without a
test. Whitespace after the attached selector starts the remaining query;
whitespace inside quoted attributes or parentheses remains part of the test.
`$this` is supported only at the beginning of a branch. Existing traversal
operators and descendant selectors continue normally after it.

### Resolve property names

```js
import { resolveProperty } from "@cocreate/utils";

const key = resolveProperty(element, "textcontent"); // "textContent"
if (key !== undefined) element[key] = "Updated";
```

`resolveProperty(object, name)` returns the original string key matching a name
without case sensitivity, or `undefined` when no match exists. It searches own
and inherited properties, including non-enumerable properties, without reading
getters. Distinct keys must be unique ignoring case: `myMethod` and `mymethod`
on the same object or its prototype chain cause a `TypeError`, even if one is
an exact match. Overrides using the same spelling are allowed. The caller
chooses whether to read, assign, or invoke the resolved member.

### Assign nested AST results

A dotted operator key identifies a property on an existing scoped object. When
that member is not a function, AST evaluates the nested value, assigns the
result to the property, and returns that result:

```js
await astAsync({
    node: element,
    sandbox: { $this: element, $ExamplePlugin: ExamplePlugin },
    executeAST: {
        "$this.myInstance": { "$ExamplePlugin": ["$this", {}] }
    }
});
```

This works in both `astSync` and `astAsync`, including multiple sibling keys,
nested paths, numeric array indices, and `items[]` appends. AST resolves the
root from its sandbox or registry and delegates writes to `dotNotationToObject`.
The root object must exist; missing parent objects are created by the shared
helper. Its conventions apply: `undefined` deletes a property, and assigning
`undefined` to an indexed array entry splices that entry out.
Existing callable members retain method invocation semantics. A string such as
`"$this.myInstance"` still reads a value; ordinary keys still store values in
the AST result and scope. Returned results are not automatically assigned to
the host element by the plugin loader.
