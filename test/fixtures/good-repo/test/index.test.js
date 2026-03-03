const test = require("node:test");
const assert = require("node:assert/strict");
const { sum } = require("../src/index");

test("sum works", () => {
  assert.equal(sum(1, 2), 3);
});
