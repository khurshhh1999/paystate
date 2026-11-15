import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ApiError,
  MAX_BODY_BYTES,
  MAX_CUSTOM_PROMPT,
  checkRequestShape,
  parseBody,
  resolveAgent,
  resolveCase,
  resolveView,
  validateTranscript,
} from "./api-validate.mjs";
import { AGENT_PRODUCT, AGENT_V1, AGENT_V2, FORMAT } from "./prompts.mjs";

/** Asserts fn throws an ApiError with this status. */
function rejects(fn, status, pattern) {
  assert.throws(fn, (e) => {
    assert.ok(e instanceof ApiError, `expected ApiError, got ${e}`);
    assert.equal(e.status, status);
    if (pattern) assert.match(e.message, pattern);
    return true;
  });
}

const json = { contentType: "application/json", host: "paystate.example", origin: null };

// Content type and origin

test("JSON from the same site passes", () => {
  checkRequestShape({ ...json, origin: "https://paystate.example" });
  checkRequestShape({ ...json, contentType: "application/json; charset=utf-8" });
  checkRequestShape({ ...json, contentType: "Application/JSON" });
});

test("text/plain, form posts and a missing content type get 415", () => {
  for (const contentType of ["text/plain", "text/plain;charset=UTF-8", "application/x-www-form-urlencoded", "multipart/form-data", "", null, undefined]) {
    rejects(() => checkRequestShape({ ...json, contentType }), 415);
  }
});

test("another site's Origin gets 403", () => {
  for (const origin of ["https://evil.example", "https://paystate.example.evil.test", "http://localhost:3000", "null", "garbage"]) {
    rejects(() => checkRequestShape({ ...json, origin }), 403);
  }
});

test("no Origin header passes (non-browser clients still hit the limits)", () => {
  checkRequestShape({ ...json, origin: undefined });
});

test("localhost passes during development, on any loopback name or port", () => {
  checkRequestShape({ contentType: "application/json", host: "localhost:3417", origin: "http://localhost:3417" });
  checkRequestShape({ contentType: "application/json", host: "localhost:3417", origin: "http://127.0.0.1:3417" });
  checkRequestShape({ contentType: "application/json", host: "127.0.0.1:3417", origin: "http://localhost:5173" });
});

test("a declared body over the cap gets 413 before it is read", () => {
  rejects(() => checkRequestShape({ ...json, contentLength: String(MAX_BODY_BYTES + 1) }), 413);
  checkRequestShape({ ...json, contentLength: "120" });
});

// Body

test("body must be a JSON object under the size cap", () => {
  assert.deepEqual(parseBody('{"a":1}'), { a: 1 });
  rejects(() => parseBody("not json"), 400);
  rejects(() => parseBody("[1,2]"), 400);
  rejects(() => parseBody("null"), 400);
  rejects(() => parseBody('"text"'), 400);
  rejects(() => parseBody(" ".repeat(MAX_BODY_BYTES + 1)), 413);
});

// Case and view

test("caseId must be a known case, and the error does not echo the input back", () => {
  assert.equal(resolveCase({ caseId: "timely-filing" }).id, "timely-filing");
  rejects(() => resolveCase({}), 400);
  rejects(() => resolveCase({ caseId: 7 }), 400);
  assert.throws(
    () => resolveCase({ caseId: "<script>alert(1)</script>" }),
    (e) => e.status === 400 && !e.message.includes("<script>"),
  );
});

test("view defaults to full and rejects unknown views", () => {
  assert.equal(resolveView({}), "full");
  assert.equal(resolveView({ view: "statement" }), "statement");
  assert.equal(resolveView({ view: "feeds:remittance+ledger" }), "feeds:remittance+ledger");
  rejects(() => resolveView({ view: "everything" }), 400);
  rejects(() => resolveView({ view: "feeds:remittance+remittance" }), 400);
});

// Instructions

test("saved versions and the product version resolve to the built-in instructions", () => {
  assert.deepEqual(resolveAgent({ version: "product" }), { kind: "product" });
  assert.equal(resolveAgent({ version: "v1" }).systemPrompt, AGENT_V1);
  assert.equal(resolveAgent({ version: "v2" }).systemPrompt, AGENT_V2);
});

test("run-case has no product path", () => {
  rejects(() => resolveAgent({ version: "product" }, { allowProduct: false }), 400);
});

test("exactly one of version or customPrompt", () => {
  rejects(() => resolveAgent({}), 400);
  rejects(() => resolveAgent({ version: "v2", customPrompt: "x" }), 400);
  rejects(() => resolveAgent({ version: "product", customPrompt: "x" }), 400);
  rejects(() => resolveAgent({ version: "v3" }), 400);
});

test("custom instructions are trimmed, capped, and always get the format block", () => {
  const r = resolveAgent({ customPrompt: "  Be kind.  " });
  assert.equal(r.kind, "custom");
  assert.equal(r.systemPrompt, `Be kind.\n\n${FORMAT}`);
  rejects(() => resolveAgent({ customPrompt: "   " }), 400);
  rejects(() => resolveAgent({ customPrompt: 12 }), 400);
  rejects(() => resolveAgent({ customPrompt: "x".repeat(MAX_CUSTOM_PROMPT + 1) }), 400, /limit/);
  assert.equal(resolveAgent({ customPrompt: "x".repeat(MAX_CUSTOM_PROMPT) }).kind, "custom");
});

test("the custom cap fits every built-in prompt with room to edit", () => {
  for (const p of [AGENT_V1, AGENT_V2, AGENT_PRODUCT]) assert.ok(p.length + 400 <= MAX_CUSTOM_PROMPT);
  assert.ok(MAX_CUSTOM_PROMPT <= 2 * AGENT_PRODUCT.length);
});

// Transcripts

const p = (text = "Why do I owe this?") => ({ role: "patient", text });
const a = (text = "Let me check.", actions) => ({ role: "agent", text, actions });

test("a chat transcript starts and ends with the patient", () => {
  assert.equal(validateTranscript([p()], "patient").length, 1);
  assert.equal(validateTranscript([p(), a(), p()], "patient").length, 3);
  rejects(() => validateTranscript([a(), p()], "patient"), 400);
  rejects(() => validateTranscript([p(), a()], "patient"), 400);
});

test("a judged transcript ends with the agent", () => {
  assert.equal(validateTranscript([p(), a()], "agent").length, 2);
  rejects(() => validateTranscript([p()], "agent"), 400);
});

test("transcript shape, length and turn caps", () => {
  rejects(() => validateTranscript([], "patient"), 400);
  rejects(() => validateTranscript("hi", "patient"), 400);
  rejects(() => validateTranscript([null], "patient"), 400);
  rejects(() => validateTranscript([[]], "patient"), 400);
  rejects(() => validateTranscript([{ role: "system", text: "x" }], "patient"), 400);
  rejects(() => validateTranscript([{ role: "patient", text: "  " }], "patient"), 400);
  rejects(() => validateTranscript([p("x".repeat(601))], "patient"), 400);
  rejects(() => validateTranscript([p(), a("x".repeat(2001)), p()], "patient"), 400);
  const eleven = Array.from({ length: 11 }, (_, i) => (i % 2 ? a() : p()));
  rejects(() => validateTranscript(eleven, "patient"), 400);
});

test("unknown actions are dropped, patient turns lose any extra fields", () => {
  const out = validateTranscript([{ ...p(), actions: ["send_pay_link"], extra: 1 }, a("ok", ["send_pay_link", "rm -rf", 3])], "agent");
  assert.deepEqual(out[0], p());
  assert.deepEqual(out[1].actions, ["send_pay_link"]);
});
