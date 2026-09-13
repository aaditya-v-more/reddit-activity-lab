import test from "node:test";
import assert from "node:assert/strict";
import { rankCommunities, searchName } from "../dist/subreddit-picker.js";

test("subreddit matching ranks exact names, then prefixes, then substrings", () => {
  const matches = rankCommunities(
    ["AskClaude", "ClaudeCode", "ClaudeAI", "Claude", "ollama"],
    "r/claude",
  );
  assert.deepEqual(
    matches.map((x) => x.name),
    ["Claude", "ClaudeAI", "ClaudeCode", "AskClaude"],
  );
  assert.equal(searchName(" /r/ClaudeAI  "), "ClaudeAI");
});
test("subreddit matching deduplicates directory results and preserves recent ordering for an empty search", () => {
  const matches = rankCommunities(
    [
      { name: "ollama", detail: "Recently selected" },
      "ClaudeAI",
      "OLLAMA",
      "ClaudeCode",
    ],
    "",
  );
  assert.deepEqual(
    matches.map((x) => x.name),
    ["ollama", "ClaudeAI", "ClaudeCode"],
  );
  assert.equal(matches[0].detail, "Recently selected");
});
test("matching rejects malformed source names, handles no results, and bounds the list", () => {
  assert.deepEqual(
    rankCommunities([null, {}, 12, "<script>", "valid_name"], "missing"),
    [],
  );
  assert.deepEqual(
    rankCommunities([null, {}, "good", "bad name", "a"], "").map((x) => x.name),
    ["good"],
  );
  assert.equal(
    rankCommunities(
      Array.from({ length: 30 }, (_, i) => `community${i}`),
      "com",
      10,
    ).length,
    10,
  );
});
