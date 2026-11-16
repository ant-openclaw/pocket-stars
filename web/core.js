(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.PocketStars = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const clone = (x) => JSON.parse(JSON.stringify(x));
  function newId() {
    if (typeof globalThis.crypto.randomUUID === "function")
      return globalThis.crypto.randomUUID();
    return Array.from(
      globalThis.crypto.getRandomValues(new Uint8Array(16)),
      (b) => b.toString(16).padStart(2, "0"),
    ).join("");
  }
  function dayKey(ms) {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/London",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date(ms));
    const get = (t) => parts.find((p) => p.type === t).value;
    return get("year") + "-" + get("month") + "-" + get("day");
  }
  function createState() {
    return {
      version: 1,
      kids: [
        { id: "rosie", name: "Rosie" },
        { id: "jake", name: "Jake" },
      ],
      chores: [
        {
          id: "bath-molly",
          label: "Bath Molly",
          pence: 200,
          emoji: "🛁",
          enabled: true,
          dailyLimit: 0,
        },
        {
          id: "garden-poo",
          label: "Clean up poo in garden",
          pence: 100,
          emoji: "💩",
          enabled: true,
          dailyLimit: 0,
        },
        {
          id: "tidy-room",
          label: "Tidy room",
          pence: 50,
          emoji: "🛏️",
          enabled: true,
          dailyLimit: 0,
        },
        {
          id: "unload-dishwasher",
          label: "Unload dishwasher",
          pence: 50,
          emoji: "🍽️",
          enabled: true,
          dailyLimit: 0,
        },
        {
          id: "load-dishwasher",
          label: "Load dishwasher",
          pence: 50,
          emoji: "🧼",
          enabled: true,
          dailyLimit: 0,
        },
        {
          id: "do-schoolwork",
          label: "Do schoolwork",
          pence: 50,
          emoji: "📚",
          enabled: true,
          dailyLimit: 0,
        },
        {
          id: "tidy-clothes-drawer",
          label: "Tidy clothes drawer",
          pence: 50,
          emoji: "👕",
          enabled: true,
          dailyLimit: 0,
        },
        {
          id: "buy-food-shops",
          label: "Buy food from shops",
          pence: 50,
          emoji: "🛒",
          enabled: true,
          dailyLimit: 0,
        },
        {
          id: "help-washing",
          label: "Help with the washing",
          pence: 50,
          emoji: "🧺",
          enabled: true,
          dailyLimit: 0,
        },
      ],
      fines: [],
      entries: [],
      settlements: [],
    };
  }
  function weekKey(ms) {
    const d = new Date(dayKey(ms) + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
    return d.toISOString().slice(0, 10);
  }
  function parsePounds(value) {
    const s = String(value).trim();
    if (!/^\d{1,4}(?:\.\d{1,2})?$/.test(s))
      throw Error("Enter pounds with up to two decimal places");
    const parts = s.split(".");
    const p = Number(parts[0]) * 100 + Number((parts[1] || "").padEnd(2, "0"));
    if (p < 1 || p > 100000) throw Error("Amount must be £0.01–£1,000.00");
    return p;
  }
  function money(pence) {
    if (!Number.isSafeInteger(pence)) throw Error("Invalid pennies");
    return new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency: "GBP",
    }).format(pence / 100);
  }
  function validateState(s) {
    const bad = () => {
      throw Error(
        "Saved data is invalid. Keep the backup and do not clear app data.",
      );
    };
    if (
      !s ||
      s.version !== 1 ||
      !["kids", "chores", "fines", "entries", "settlements"].every((k) =>
        Array.isArray(s[k]),
      )
    )
      bad();
    const unique = (items) => {
      const ids = items.map((x) => x && x.id);
      if (
        ids.some(
          (id) => typeof id !== "string" || !id.length || id.length > 120,
        ) ||
        new Set(ids).size !== ids.length
      )
        bad();
    };
    ["kids", "chores", "fines", "entries", "settlements"].forEach((k) =>
      unique(s[k]),
    );
    if (
      s.kids.length !== 2 ||
      !s.kids.some((k) => k.id === "rosie") ||
      !s.kids.some((k) => k.id === "jake")
    )
      bad();
    for (const t of [...s.chores, ...s.fines])
      if (
        typeof t.label !== "string" ||
        !t.label.trim() ||
        t.label.length > 60 ||
        !Number.isInteger(t.pence) ||
        t.pence < 1 ||
        t.pence > 100000 ||
        typeof t.enabled !== "boolean"
      )
        bad();
    for (const t of s.chores) if (![0, 1].includes(t.dailyLimit)) bad();
    const kids = new Set(s.kids.map((k) => k.id));
    const settlements = new Map(s.settlements.map((x) => [x.id, x]));
    for (const e of s.entries) {
      if (
        !kids.has(e.kidId) ||
        !["chore", "fine"].includes(e.kind) ||
        typeof e.typeId !== "string" ||
        typeof e.label !== "string" ||
        !Number.isInteger(e.pence) ||
        Math.abs(e.pence) < 1 ||
        Math.abs(e.pence) > 100000 ||
        (e.kind === "chore" ? e.pence < 0 : e.pence > 0) ||
        !Number.isFinite(Date.parse(e.at))
      )
        bad();
      if (e.voidedAt && !Number.isFinite(Date.parse(e.voidedAt))) bad();
      if (
        e.settlementId &&
        (!settlements.has(e.settlementId) ||
          settlements.get(e.settlementId).kidId !== e.kidId)
      )
        bad();
    }
    for (const r of s.settlements) {
      if (
        !kids.has(r.kidId) ||
        !Number.isFinite(Date.parse(r.at)) ||
        ![r.netPence, r.paidPence, r.forgivenPence].every(
          Number.isSafeInteger,
        ) ||
        !Array.isArray(r.entryIds) ||
        r.paidPence !== Math.max(0, r.netPence) ||
        r.forgivenPence !== Math.max(0, -r.netPence)
      )
        bad();
      const rows = s.entries.filter((e) => e.settlementId === r.id);
      if (
        rows.length !== r.entryIds.length ||
        rows.some((e) => !r.entryIds.includes(e.id) || e.voidedAt) ||
        rows.reduce((a, e) => a + e.pence, 0) !== r.netPence
      )
        bad();
    }
    return true;
  }
  class Ledger {
    constructor(state, options = {}) {
      const data = state === undefined ? createState() : state;
      validateState(data);
      this._state = clone(data);
      // v1.1+: chores are repeatable and fines use a single parent-set amount button.
      // Migrate legacy v1 starter chores to the family's 9-chore catalogue while preserving
      // every financial entry and settlement.
      const legacyStarterIds = new Set([
        "tidy-room",
        "laid-table",
        "fed-pet",
        "homework",
      ]);
      if (
        this._state.chores.some((t) =>
          ["laid-table", "fed-pet", "homework"].includes(t.id),
        ) &&
        this._state.chores.every((t) => legacyStarterIds.has(t.id))
      ) {
        this._state.chores = createState().chores;
      } else {
        this._state.chores.forEach((t) => {
          t.dailyLimit = 0;
        });
      }
      this._state.fines = [];
      this._now = options.now || Date.now;
      this._persist = options.persist || (() => {});
    }
    get data() {
      return clone(this._state);
    }
    authorize() {
      this._adminUntil = this._now() + 120000;
    }
    lock() {
      this._adminUntil = 0;
    }
    get isAdmin() {
      return Number(this._adminUntil) > this._now();
    }
    _requireParent() {
      if (!this.isAdmin) throw Error("Parent PIN required");
    }
    _replay(requestId, kidId, typeId, kind, pence) {
      if (!requestId) return null;
      if (typeof requestId !== "string" || requestId.length > 120)
        throw Error("Invalid operation ID");
      const e = this._state.entries.find((e) => e.id === requestId);
      if (!e) return null;
      if (
        e.kidId !== kidId ||
        e.typeId !== typeId ||
        e.kind !== kind ||
        (pence !== undefined && e.pence !== pence)
      )
        throw Error("Operation ID already used");
      return clone(e);
    }
    fine(kidId, pence, requestId) {
      this._requireParent();
      this.view(kidId);
      if (!Number.isInteger(pence) || pence < 1 || pence > 100000)
        throw Error("Amount must be £0.01–£1,000.00");
      const replay = this._replay(requestId, kidId, "fine", "fine", -pence);
      if (replay) return replay;
      const e = {
        id: requestId || newId(),
        kidId,
        typeId: "fine",
        kind: "fine",
        label: "Fine",
        pence: -pence,
        at: new Date(this._now()).toISOString(),
        weekStart: weekKey(this._now()),
        settlementId: null,
        voidedAt: null,
      };
      const next = clone(this._state);
      next.entries.push(e);
      if (this._persist(clone(next)) === false)
        throw Error("Could not save to storage");
      this._state = next;
      this.authorize();
      return clone(e);
    }
    upsertType(kind, input) {
      this._requireParent();
      if (kind !== "chore") throw Error("Unknown type");
      const label = String(input.label || "").trim();
      if (!label || label.length > 60)
        throw Error("Name must be 1–60 characters");
      if (
        !Number.isInteger(input.pence) ||
        input.pence < 1 ||
        input.pence > 100000
      )
        throw Error("Amount must be £0.01–£1,000.00");
      if (
        kind === "chore" &&
        input.dailyLimit !== undefined &&
        ![0, 1].includes(input.dailyLimit)
      )
        throw Error("Choose once daily or repeatable");
      const key = kind === "chore" ? "chores" : "fines";
      const next = clone(this._state);
      const index = next[key].findIndex((t) => t.id === input.id);
      if (input.id && index < 0) throw Error("Type not found");
      const t = {
        id: input.id || newId(),
        label,
        pence: input.pence,
        emoji: String(input.emoji || "⭐").slice(0, 12),
        enabled: input.enabled !== false,
      };
      if (kind === "chore") t.dailyLimit = 0;
      if (index < 0) next[key].push(t);
      else next[key][index] = t;
      if (this._persist(clone(next)) === false)
        throw Error("Could not save to storage");
      this._state = next;
      this.authorize();
      return clone(t);
    }
    removeChore(kidId, entryId) {
      this.view(kidId);
      const next = clone(this._state);
      const e = next.entries.find((e) => e.id === entryId);
      if (!e || e.kidId !== kidId)
        throw Error("Entry does not belong to this child");
      if (e.kind !== "chore")
        throw Error("Parent PIN required to remove a fine");
      if (e.settlementId) throw Error("Settled entries cannot be changed");
      if (e.voidedAt) throw Error("Entry already corrected");
      e.voidedAt = new Date(this._now()).toISOString();
      if (this._persist(clone(next)) === false)
        throw Error("Could not save to storage");
      this._state = next;
      return clone(e);
    }
    voidEntry(entryId) {
      this._requireParent();
      const next = clone(this._state);
      const e = next.entries.find((e) => e.id === entryId);
      if (!e) throw Error("Entry not found");
      if (e.settlementId) throw Error("Settled entries cannot be changed");
      if (e.voidedAt) throw Error("Entry already corrected");
      e.voidedAt = new Date(this._now()).toISOString();
      if (this._persist(clone(next)) === false)
        throw Error("Could not save to storage");
      this._state = next;
      this.authorize();
      return clone(e);
    }
    settle(kidId) {
      this._requireParent();
      const v = this.view(kidId);
      const rows = v.entries.filter((e) => !e.voidedAt && !e.settlementId);
      if (!rows.length) throw Error("Nothing to settle");
      const s = {
        id: newId(),
        kidId,
        at: new Date(this._now()).toISOString(),
        netPence: v.balancePence,
        paidPence: Math.max(0, v.balancePence),
        forgivenPence: Math.max(0, -v.balancePence),
        entryIds: rows.map((e) => e.id),
      };
      const next = clone(this._state);
      next.entries.forEach((e) => {
        if (s.entryIds.includes(e.id)) e.settlementId = s.id;
      });
      next.settlements.push(s);
      if (this._persist(clone(next)) === false)
        throw Error("Could not save to storage");
      this._state = next;
      this.authorize();
      return clone(s);
    }
    view(kidId) {
      const kid = this._state.kids.find((k) => k.id === kidId);
      if (!kid) throw Error("Unknown child");
      const entries = this._state.entries.filter((e) => e.kidId === kidId);
      const weekStart = weekKey(this._now());
      const weekly = entries.filter(
        (e) => !e.voidedAt && weekKey(Date.parse(e.at)) === weekStart,
      );
      const weekEarnedPence = weekly
        .filter((e) => e.kind === "chore")
        .reduce((a, e) => a + e.pence, 0);
      const weekFinesPence = -weekly
        .filter((e) => e.kind === "fine")
        .reduce((a, e) => a + e.pence, 0);
      return {
        kid: clone(kid),
        weekStart,
        weekEarnedPence,
        weekFinesPence,
        weekNetPence: weekEarnedPence - weekFinesPence,
        balancePence: entries
          .filter((e) => !e.voidedAt && !e.settlementId)
          .reduce((a, e) => a + e.pence, 0),
        entries: clone(entries).reverse(),
        chores: clone(
          this._state.chores
            .filter((t) => t.enabled)
            .map((t) => {
              const claimedToday = entries.filter(
                (e) =>
                  e.kind === "chore" &&
                  e.typeId === t.id &&
                  !e.voidedAt &&
                  dayKey(Date.parse(e.at)) === dayKey(this._now()),
              ).length;
              return {
                ...t,
                claimedToday,
                available: true,
              };
            }),
        ),
        settlements: clone(
          this._state.settlements.filter((s) => s.kidId === kidId).reverse(),
        ),
      };
    }
    credit(kidId, choreId, requestId) {
      const replay = this._replay(requestId, kidId, choreId, "chore");
      if (replay) return replay;
      const v = this.view(kidId);
      const t = v.chores.find((t) => t.id === choreId);
      if (!t) throw Error("Chore unavailable");
      const e = {
        id: requestId || newId(),
        kidId,
        typeId: t.id,
        kind: "chore",
        label: t.label,
        pence: t.pence,
        at: new Date(this._now()).toISOString(),
        weekStart: weekKey(this._now()),
        settlementId: null,
        voidedAt: null,
      };
      const next = clone(this._state);
      next.entries.push(e);
      if (this._persist(clone(next)) === false)
        throw Error("Could not save to storage");
      this._state = next;
      return clone(e);
    }
  }
  return { createState, Ledger, parsePounds, money, weekKey, validateState };
});
