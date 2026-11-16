"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
let PS = {};
try {
  PS = require("../web/core.js");
} catch (e) {
  if (e.code !== "MODULE_NOT_FOUND") throw e;
}
test("Jake earns exactly 50p for tidying his room without crediting Rosie", () => {
  assert.equal(typeof PS.Ledger, "function", "Ledger is implemented");
  const ledger = new PS.Ledger(undefined, {
    now: () => Date.parse("2026-11-13T12:00:00Z"),
  });
  assert.equal(ledger.view("jake").balancePence, 0);
  ledger.credit("jake", "tidy-room");
  assert.equal(ledger.view("jake").balancePence, 50);
  assert.equal(ledger.view("rosie").balancePence, 0);
});
test("Parents edit catalogue without rewriting past credits and can archive a chore", () => {
  const l = new PS.Ledger();
  l.credit("jake", "tidy-room");
  assert.throws(
    () => l.upsertType("chore", { label: "Hoovered", pence: 100 }),
    /parent/i,
  );
  l.authorize();
  const added = l.upsertType("chore", {
    label: "Hoovered",
    pence: 100,
    dailyLimit: 0,
    enabled: true,
  });
  l.credit("rosie", added.id);
  l.upsertType("chore", {
    id: "tidy-room",
    label: "Room tidy",
    pence: 75,
    enabled: true,
    dailyLimit: 1,
  });
  assert.equal(l.view("jake").entries[0].pence, 50);
  assert.equal(l.view("jake").entries[0].label, "Tidy room");
  l.upsertType("chore", {
    id: added.id,
    label: "Hoovered",
    pence: 100,
    enabled: false,
    dailyLimit: 0,
  });
  assert.throws(() => l.credit("jake", added.id), /unavailable/i);
  assert.throws(
    () => l.upsertType("chore", { label: "Bad", pence: 0 }),
    /amount/i,
  );
  assert.throws(
    () => l.upsertType("chore", { label: "Bad", pence: 0.1 }),
    /amount/i,
  );
  assert.throws(
    () => l.upsertType("fine", { label: "No fine categories", pence: 50 }),
    /unknown|chore/i,
  );
});
test("Chores can be repeated on the same day, including legacy once-daily definitions", () => {
  const state = PS.createState();
  state.chores.forEach((t) => (t.dailyLimit = 1));
  const l = new PS.Ledger(state, {
    now: () => Date.parse("2026-11-13T12:00:00Z"),
  });
  l.credit("jake", "tidy-room");
  l.credit("jake", "tidy-room");
  assert.equal(l.view("jake").balancePence, 100);
  assert.equal(
    l.view("jake").chores.find((t) => t.id === "tidy-room").available,
    true,
  );
  l.authorize();
  const t = l.upsertType("chore", {
    label: "Washed up",
    pence: 20,
    enabled: true,
  });
  l.credit("jake", t.id);
  l.credit("jake", t.id);
  assert.equal(l.view("jake").balancePence, 140);
});
test("Pounds input is converted to exact integer pennies and invalid amounts rejected", () => {
  assert.equal(PS.parsePounds("0.50"), 50);
  assert.equal(PS.parsePounds("1.2"), 120);
  for (const bad of ["-1", "NaN", "1.001", "1e2", "", "1,50"])
    assert.throws(() => PS.parsePounds(bad));
});
test("Money is displayed in pounds including negative balances", () => {
  assert.equal(PS.money(50), "£0.50");
  assert.equal(PS.money(-25), "-£0.25");
  assert.equal(PS.money(0), "£0.00");
});
test("Monday starts a new UK week but never erases unpaid money", () => {
  let time = Date.parse("2026-11-15T12:00:00Z");
  const l = new PS.Ledger(undefined, { now: () => time });
  l.credit("jake", "tidy-room");
  assert.equal(l.view("jake").weekEarnedPence, 50);
  time = Date.parse("2026-11-16T12:00:00Z");
  assert.equal(l.view("jake").weekEarnedPence, 0);
  assert.equal(l.view("jake").balancePence, 50);
  l.credit("jake", "tidy-room");
  l.authorize();
  l.fine("jake", 25);
  assert.equal(l.view("jake").weekNetPence, 25);
  assert.equal(l.view("jake").weekFinesPence, 25);
  assert.equal(l.view("jake").weekStart, "2026-11-16");
  assert.equal(l.view("jake").balancePence, 75);
  assert.equal(PS.weekKey(Date.parse("2026-03-29T23:30:00Z")), "2026-03-30");
});
test("Parents can void an unpaid mistake but never rewrite a settled entry", () => {
  const l = new PS.Ledger();
  const e = l.credit("jake", "tidy-room");
  assert.throws(() => l.voidEntry(e.id), /parent/i);
  l.authorize();
  l.voidEntry(e.id);
  assert.equal(l.view("jake").balancePence, 0);
  assert.ok(l.view("jake").entries[0].voidedAt);
  const replacement = l.credit("jake", "tidy-room");
  l.settle("jake");
  assert.throws(() => l.voidEntry(replacement.id), /settled/i);
});
test("Failed durable save never commits a credit to in-memory balance", () => {
  const l = new PS.Ledger(undefined, { persist: () => false });
  assert.throws(() => l.credit("jake", "tidy-room"), /save|storage/i);
  assert.equal(l.view("jake").balancePence, 0);
  const ok = new PS.Ledger(undefined, {
    persist: () => {
      throw Error("disk full");
    },
  });
  assert.throws(() => ok.credit("jake", "tidy-room"), /disk full/);
  assert.equal(ok.view("jake").balancePence, 0);
});
test("A retried operation ID never creates a duplicate credit or fine", () => {
  const l = new PS.Ledger();
  const e = l.credit("jake", "tidy-room", "request-one");
  assert.equal(l.credit("jake", "tidy-room", "request-one").id, e.id);
  assert.equal(l.view("jake").balancePence, 50);
  assert.throws(
    () => l.credit("rosie", "tidy-room", "request-one"),
    /operation/i,
  );
  l.authorize();
  l.fine("jake", 25, "fine-one");
  l.fine("jake", 25, "fine-one");
  assert.equal(l.view("jake").balancePence, 25);
  assert.throws(() => l.fine("jake", 50, "fine-one"), /operation/i);
});
test("Damaged saved ledgers are rejected instead of silently resetting balances", () => {
  assert.throws(() => new PS.Ledger({ version: 99 }), /saved|data|version/i);
  for (const change of [
    (s) =>
      s.entries.push({
        id: "oops",
        kidId: "jake",
        kind: "chore",
        pence: 0.5,
        at: "not-a-date",
      }),
    (s) => (s.chores[0].pence = -50),
    (s) => (s.kids[1].id = "rosie"),
  ]) {
    const s = PS.createState();
    change(s);
    assert.throws(() => new PS.Ledger(s), /saved|data|amount|duplicate/i);
  }
});
test("Credits work on WebViews without crypto.randomUUID", () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "crypto");
  const real = globalThis.crypto;
  try {
    Object.defineProperty(globalThis, "crypto", {
      configurable: true,
      value: { getRandomValues: real.getRandomValues.bind(real) },
    });
    const l = new PS.Ledger();
    const e = l.credit("jake", "tidy-room");
    assert.ok(e.id.length >= 32);
    assert.equal(l.view("jake").balancePence, 50);
  } finally {
    Object.defineProperty(globalThis, "crypto", descriptor);
  }
});
test("Settlement resets only the paid child and preserves history", () => {
  const l = new PS.Ledger();
  l.credit("jake", "tidy-room");
  l.credit("rosie", "tidy-room");
  assert.throws(() => l.settle("jake"), /parent/i);
  l.authorize();
  const paid = l.settle("jake");
  assert.equal(paid.paidPence, 50);
  assert.equal(l.view("jake").balancePence, 0);
  assert.equal(l.view("jake").entries.length, 1);
  assert.equal(l.view("rosie").balancePence, 50);
  assert.equal(l.view("jake").settlements.length, 1);
  assert.throws(() => l.settle("jake"), /nothing/i);
});
test("Only a currently authorised parent can deduct a parent-set fine amount", () => {
  let time = Date.parse("2026-11-13T12:00:00Z");
  const l = new PS.Ledger(undefined, { now: () => time });
  assert.deepEqual(l.data.fines, []);
  l.credit("jake", "tidy-room");
  assert.throws(() => l.fine("jake", 50), /parent/i);
  l.authorize();
  for (const bad of [0, -10, 12.5, 100001, "50"])
    assert.throws(() => l.fine("jake", bad), /amount/i);
  const f = l.fine("jake", 50);
  assert.equal(f.label, "Fine");
  assert.equal(f.pence, -50);
  assert.equal(l.view("jake").balancePence, 0);
  time += 120001;
  assert.throws(() => l.fine("jake", 50), /parent/i);
});
