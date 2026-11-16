"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const PS = require("../web/core.js");
test("Negative balances settle as recorded debt forgiveness, never a negative payout", () => {
  const l = new PS.Ledger();
  l.authorize();
  l.fine("rosie", 50);
  assert.equal(l.view("rosie").balancePence, -50);
  const settlement = l.settle("rosie");
  assert.equal(settlement.netPence, -50);
  assert.equal(settlement.paidPence, 0);
  assert.equal(settlement.forgivenPence, 50);
  assert.equal(l.view("rosie").balancePence, 0);
  const restored = new PS.Ledger(l.data);
  assert.equal(restored.view("rosie").settlements[0].forgivenPence, 50);
  assert.equal(restored.isAdmin, false);
});
test("A fully settled ledger restores with accurate history and no parent session", () => {
  let saved;
  const l = new PS.Ledger(undefined, {
    persist: (s) => {
      saved = JSON.stringify(s);
    },
  });
  l.credit("jake", "tidy-room");
  l.credit("rosie", "do-schoolwork");
  l.authorize();
  l.fine("jake", 25);
  l.settle("jake");
  const r = new PS.Ledger(JSON.parse(saved));
  assert.equal(r.view("jake").balancePence, 0);
  assert.equal(r.view("rosie").balancePence, 50);
  assert.equal(r.view("jake").entries.length, 2);
  assert.equal(r.view("jake").settlements[0].paidPence, 25);
  assert.equal(r.isAdmin, false);
});
test("Mutating a view or exported state cannot mutate stored balances", () => {
  const l = new PS.Ledger();
  l.credit("jake", "tidy-room");
  const state = l.data;
  state.entries[0].pence = 99999;
  const view = l.view("jake");
  view.entries[0].pence = 99999;
  assert.equal(l.view("jake").balancePence, 50);
});
