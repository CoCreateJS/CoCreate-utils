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
