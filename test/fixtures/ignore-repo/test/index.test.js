const test = require("node:test");
const assert = require("node:assert/strict");
const { ok } = require("../src/index");

test("ok returns true", () => {
  assert.equal(ok(), true);
});
