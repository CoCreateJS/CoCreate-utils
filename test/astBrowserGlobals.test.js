import assert from "node:assert/strict";
import test from "node:test";

globalThis.window = {
    innerWidth: 1024,
    innerHeight: 768,
    location: {
        href: "https://example.test/",
        origin: "https://example.test",
        protocol: "https:",
        hostname: "example.test",
        host: "example.test",
        port: "",
        pathname: "/",
        hash: ""
    }
};
globalThis.localStorage = { getItem: () => null };

const { astAsync, astSync } = await import("../src/modules/ast/index.js");

const regexEnabledLabel = {
	$if: {
		$value: {
			$regex: {
				"^true$": "Enabled",
				"^false$": "Disabled",
				$else: ""
			}
		}
	}
};
const directEnabledLabel = {
	$if: {
		$value: {
			$eq: {
				"true": "Enabled",
				"false": "Disabled",
				$else: ""
			}
		}
	}
};
const typedEnabledLabel = {
	$if: {
		$value: {
			$eq: {
				$true: "Enabled",
				$false: "Disabled",
				$else: ""
			}
		}
	}
};
const parsedEnabledLabel = {
	parsed: { $parse: "$value" },
	$return: {
		$if: {
			$parsed: {
				$eq: {
					$true: "Enabled",
					$false: "Disabled",
					$else: ""
				}
			}
		}
	}
};

function createElement(value) {
    return { getValue: () => value };
}

test("AST reads the current element value in sync and async contexts", async () => {
    for (const value of [true, false]) {
        const element = createElement(value);
        const sandbox = { $this: element };

        assert.equal(astSync({ executeAST: "$value", node: element, sandbox }), value);
        assert.equal(
            await astAsync({ executeAST: "$value", node: element, sandbox }),
            value
        );
    }
});

test("AST direct equality preserves string branch keys", async () => {
	for (const [value, expected] of [
		["true", "Enabled"],
		["false", "Disabled"],
		[true, ""],
		[false, ""]
	]) {
        const element = createElement(value);
        const sandbox = { $this: element };

        assert.equal(astSync({ executeAST: directEnabledLabel, node: element, sandbox }), expected);
        assert.equal(
            await astAsync({ executeAST: directEnabledLabel, node: element, sandbox }),
            expected
        );
    }
});

test("AST boolean branch keys require explicit boolean operators", async () => {
	for (const [value, expected] of [
		[true, "Enabled"],
		[false, "Disabled"],
		["true", ""],
		["false", ""]
	]) {
		const element = createElement(value);
		const sandbox = { $this: element };

		assert.equal(astSync({ executeAST: typedEnabledLabel, node: element, sandbox }), expected);
		assert.equal(
			await astAsync({ executeAST: typedEnabledLabel, node: element, sandbox }),
			expected
		);
	}
});

test("AST JSON parsing maps boolean strings and booleans without regex", async () => {
	for (const [value, expected] of [
		[true, "Enabled"],
		[false, "Disabled"],
		["true", "Enabled"],
		["false", "Disabled"]
	]) {
		const element = createElement(value);
		const sandbox = { $this: element };

		assert.equal(astSync({ executeAST: parsedEnabledLabel, node: element, sandbox }), expected);
		assert.equal(
			await astAsync({ executeAST: parsedEnabledLabel, node: element, sandbox }),
			expected
		);
	}
});

test("AST regex maps string booleans", async () => {
	for (const [value, expected] of [["true", "Enabled"], ["false", "Disabled"]]) {
		const element = createElement(value);
		const sandbox = { $this: element };

		assert.equal(astSync({ executeAST: regexEnabledLabel, node: element, sandbox }), expected);
		assert.equal(
			await astAsync({ executeAST: regexEnabledLabel, node: element, sandbox }),
			expected
		);
	}
});

test("OperatorJS does not execute JavaScript function blocks in safeParse", () => {
	const expression = "$( (() => { if ($value === 'true') { return 'Enabled'; } else { return 'Disabled'; } })() )";

	for (const value of ["true", "false"]) {
		const element = createElement(value);
		const sandbox = { $this: element };
		assert.equal(astSync({ executeAST: expression, node: element, sandbox }), "");
	}
});

test("OperatorJS converts a backtick value to a string inside a safeParse ternary", () => {
	const expression = "$(`\u0024value` === 'true' ? 'Enabled' : 'Disabled')";

	for (const [value, expected] of [["true", "Enabled"], ["false", "Disabled"]]) {
		const element = createElement(value);
		const sandbox = { $this: element };
		assert.equal(astSync({ executeAST: expression, node: element, sandbox }), expected);
	}
});

test("AST conditional mapping works with an injected sandbox value", async () => {
    const testingLabel = {
        $if: {
            $testing: {
                $eq: {
                    $true: "Enabled",
                    $false: "Disabled",
                    $else: ""
                }
            }
        }
    };

    for (const [testing, expected] of [[true, "Enabled"], [false, "Disabled"]]) {
        const sandbox = { $testing: testing };

        assert.equal(astSync({ executeAST: testingLabel, sandbox }), expected);
        assert.equal(await astAsync({ executeAST: testingLabel, sandbox }), expected);
    }
});

test("AST browser globals read window and the current CoCreate namespace", async () => {
    for (const evaluate of [astSync, astAsync]) {
        assert.equal(await evaluate({ executeAST: "$window" }), window);
        delete window.CoCreate;
        assert.equal(await evaluate({ executeAST: "$CoCreate" }), undefined);

        const first = { label: "first" };
        window.CoCreate = first;
        assert.equal(await evaluate({ executeAST: "$CoCreate" }), first);
        assert.equal(await evaluate({ executeAST: "$window.CoCreate.label" }), "first");

        const second = { label: "second" };
        window.CoCreate = second;
        assert.equal(await evaluate({ executeAST: "$CoCreate" }), second);
        assert.equal(await evaluate({ executeAST: "$CoCreate.label" }), "second");
    }
    delete window.CoCreate;
});

test("AST browser global paths support assignments and preserve method receivers", async () => {
    for (const evaluate of [astSync, astAsync]) {
        window.CoCreate = {
            label: "CoCreate",
            describe(value) { return `${this.label}: ${value}`; }
        };
        await evaluate({ executeAST: { "$window.astGlobalTest": { enabled: true } } });
        assert.deepEqual(window.astGlobalTest, { enabled: true });
        await evaluate({ executeAST: { "$CoCreate.label": "Updated" } });
        assert.equal(await evaluate({ executeAST: { "$CoCreate.describe": ["value"] } }), "Updated: value");
        assert.equal(await evaluate({ executeAST: { "$window.CoCreate.describe": ["nested"] } }), "Updated: nested");
        delete window.astGlobalTest;
    }
    delete window.CoCreate;
});

test("OperatorJS accepts browser globals inside expressions", async () => {
    window.window = window;
    window.CoCreate = { label: "CoCreate" };
    try {
        for (const evaluate of [astSync, astAsync]) {
            assert.equal(await evaluate({ node: createElement(""), executeAST: "$(window.innerWidth)" }), 1024);
            assert.equal(await evaluate({ node: createElement(""), executeAST: "$(CoCreate.label)" }), "CoCreate");
            assert.equal(await evaluate({ node: createElement(""), executeAST: "$($window.innerWidth)" }), 1024);
            assert.equal(await evaluate({ node: createElement(""), executeAST: "$($CoCreate.label)" }), "CoCreate");
        }
    } finally {
        delete window.window;
        delete window.CoCreate;
    }
});


test("browser globals accept explicit plugin sandbox bindings without changing global defaults", async () => {
    const injectedWindow = { label: "Scoped window" };
    const injectedCoCreate = { label: "Scoped CoCreate" };
    for (const evaluate of [astSync, astAsync]) {
        const sandbox = { $window: injectedWindow, $CoCreate: injectedCoCreate };
        assert.equal(await evaluate({ sandbox, executeAST: "$window" }), injectedWindow);
        assert.equal(await evaluate({ sandbox, executeAST: "$CoCreate" }), injectedCoCreate);
        await evaluate({ sandbox, executeAST: { "$window.example": "Assigned" } });
        assert.equal(injectedWindow.example, "Assigned");
        assert.equal(await evaluate({ executeAST: "$window" }), window);
    }
});
