"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const PS = require("../web/core.js");
test("A child can remove an accidental unpaid chore without parent access", () => {
  const l = new PS.Ledger();
  const first = l.credit("jake", "tidy-room");
  l.credit("jake", "tidy-room");
  assert.equal(l.isAdmin, false);
  l.removeChore("jake", first.id);
  assert.equal(l.view("jake").balancePence, 50);
  assert.equal(l.view("jake").entries.length, 2);
  assert.ok(l.view("jake").entries.find((e) => e.id === first.id).voidedAt);
  assert.equal(l.isAdmin, false);
  assert.throws(() => l.removeChore("jake", first.id), /already/i);
});
test("Default chores match the family 9-chore list and migrate legacy starter chores", () => {
  const expected = [
    ["Bath Molly", 200],
    ["Clean up poo in garden", 100],
    ["Tidy room", 50],
    ["Unload dishwasher", 50],
    ["Load dishwasher", 50],
    ["Do schoolwork", 50],
    ["Tidy clothes drawer", 50],
    ["Buy food from shops", 50],
    ["Help with the washing", 50],
  ];
  const state = PS.createState();
  assert.deepEqual(
    state.chores.map((c) => [c.label, c.pence]),
    expected,
  );
  const legacy = {
    version: 1,
    kids: state.kids,
    chores: [
      { id: "tidy-room", label: "Tidied room", pence: 50, emoji: "🛏️", enabled: true, dailyLimit: 0 },
      { id: "laid-table", label: "Laid the table", pence: 25, emoji: "🍽️", enabled: true, dailyLimit: 0 },
      { id: "fed-pet", label: "Fed the pet", pence: 25, emoji: "🐾", enabled: true, dailyLimit: 0 },
      { id: "homework", label: "Finished homework", pence: 50, emoji: "📚", enabled: true, dailyLimit: 0 },
    ],
    fines: [],
    entries: [
      {
        id: "e1",
        kidId: "rosie",
        typeId: "laid-table",
        kind: "chore",
        label: "Laid the table",
        pence: 25,
        at: "2026-11-13T12:00:00.000Z",
        weekStart: "2026-11-09",
        settlementId: null,
        voidedAt: null,
      },
    ],
    settlements: [],
  };
  const migrated = new PS.Ledger(legacy);
  assert.deepEqual(
    migrated.data.chores.map((c) => [c.label, c.pence]),
    expected,
  );
  assert.equal(migrated.view("rosie").balancePence, 25);
});
