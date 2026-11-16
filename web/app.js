/* Pocket Stars: entirely local, no network or runtime dependencies. */
(() => {
  "use strict";
  const app = document.querySelector("#app"),
    modal = document.querySelector("#modal");
  const PS = window.PocketStars,
    vault = window.PinVault;
  let ledger,
    child = null,
    parent = false,
    tab = "overview",
    lastTouch = Date.now(),
    busy = false,
    returnFocus,
    authEpoch = 0;
  const esc = (s) =>
    String(s ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
  const cash = (p) => PS.money(p),
    date = (s) =>
      new Date(s).toLocaleString("en-GB", {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      });
  const button = (label, action, cls = "", attrs = "") =>
    `<button class="${cls}" data-action="${action}" ${attrs}>${label}</button>`;
  function notice(text) {
    const n = document.querySelector("#notice");
    n.textContent = text;
    n.classList.add("show");
    clearTimeout(notice.timer);
    notice.timer = setTimeout(() => n.classList.remove("show"), 4500);
  }
  function save(data) {
    const json = JSON.stringify(data);
    if (window.Android) {
      const ok = Android.saveData(json);
      if (ok !== true && ok !== "true")
        throw Error("Could not save. Nothing has changed. Please try again.");
    } else localStorage.setItem("pocket-stars-data", json);
  }
  function requireParent() {
    if (!parent || !ledger.isAdmin || Date.now() - lastTouch >= 120000) {
      lock();
      throw Error("Parent session locked. Please enter your PIN again.");
    }
    lastTouch = Date.now();
  }
  function lock() {
    if (ledger) ledger.lock();
    parent = false;
    tab = "overview";
    closeModal(true);
    render();
  }
  function closeModal(force = false) {
    if (busy && !force) return;
    authEpoch++;
    if (!parent && ledger) ledger.lock();
    if (modal.open) modal.close();
    modal.replaceChildren();
    if (returnFocus?.isConnected) returnFocus.focus();
  }
  function dialog(title, body, actions = "", dismiss = true) {
    returnFocus = document.activeElement;
    modal.innerHTML = `<div class="dialog-heading"><h2 id="dialog-title">${esc(title)}</h2>${dismiss ? button("✕", "close", "icon-button", 'aria-label="Close dialog"') : ""}</div>${body}<p class="form-error" role="alert"></p>${actions}`;
    if (!modal.open) modal.showModal();
  }
  function confirmAction(title, body, label, fn, danger = false) {
    dialog(
      title,
      `<div class="dialog-copy">${body}</div>`,
      `<div class="dialog-actions">${button("Not now", "close", "secondary")}${button(esc(label), "confirm", danger ? "danger" : "primary")}</div>`,
    );
    modal.querySelector('[data-action="confirm"]').onclick = () =>
      run(async () => {
        await fn();
        closeModal(true);
        render();
      });
  }
  async function run(fn) {
    if (busy) return;
    busy = true;
    try {
      await fn();
    } catch (e) {
      const target = modal.open ? modal.querySelector(".form-error") : null;
      if (target)
        target.textContent =
          e.message || "Something went wrong. Please try again.";
      else notice(e.message || "Something went wrong.");
    } finally {
      busy = false;
    }
  }
  function pinField(label, name) {
    return `<label>${label}<input name="${name}" type="password" inputmode="numeric" pattern="[0-9]{4,8}" minlength="4" maxlength="8" autocomplete="off" required aria-label="${label}"></label>`;
  }
  function gate(setup = false, continuation = null) {
    if (continuation) ledger.lock();
    dialog(
      setup ? "A little setup for grown-ups" : "Parents only",
      `<p>${setup ? "Choose a private 4–8 digit PIN to keep fines, payments and settings in grown-up hands. There is no default PIN. Keep it safe: there is no PIN reset on this device." : continuation ? "Enter your parent PIN to approve this one action. You’ll stay on this star board; the parent area stays locked." : "Enter your parent PIN. This area locks after two minutes without activity, or when you leave the app."}</p><form id="pin-form">${setup ? pinField("New PIN", "pin") + pinField("Repeat new PIN", "confirm") : pinField("Parent PIN", "pin")}<button class="primary" type="submit">${setup ? "Save parent PIN" : continuation ? "Continue" : "Unlock parent area"}</button></form>`,
      "",
      !setup,
    );
    modal.querySelector("form").onsubmit = (e) => {
      e.preventDefault();
      const f = new FormData(e.target);
      run(async () => {
        if (setup) {
          await vault.setup(f.get("pin"), f.get("confirm"));
          closeModal(true);
          render();
          notice("Parent PIN saved. Ready to earn some stars!");
        } else {
          const epoch = authEpoch;
          if (!(await vault.unlock(f.get("pin"))))
            throw Error("Incorrect PIN. Please try again.");
          if (epoch !== authEpoch || document.hidden)
            throw Error(
              "Parent unlock cancelled because the app left the foreground. Please unlock again.",
            );
          if (continuation) {
            closeModal(true);
            continuation(authEpoch);
            return;
          }
          ledger.authorize();
          parent = true;
          lastTouch = Date.now();
          closeModal(true);
          render();
        }
      });
    };
  }
  function stats(view) {
    return `<div class="balance"><span>Unpaid balance</span><strong>${cash(view.balancePence)}</strong><small>${view.balancePence < 0 ? "Debt to carry forward until a parent clears it." : "Everything earned, less fines, since the last payment."}</small></div><div class="weekly"><h3>This week</h3><p class="week-net">${cash(view.weekNetPence)} <small>net</small></p><div><span>Earned <b>${cash(view.weekEarnedPence)}</b></span><span>Fines <b>−${cash(view.weekFinesPence)}</b></span></div><small>Monday–Sunday · separate from unpaid balance</small></div>`;
  }
  function history(view, admin = false) {
    return view.entries.length
      ? `<ol class="activity">${view.entries.map((e) => `<li class="${e.voidedAt ? "voided" : ""}"><span class="activity-symbol" aria-hidden="true">${e.kind === "chore" ? "★" : "−"}</span><div class="activity-info"><strong>${esc(e.label)}</strong><small>${date(e.at)} · ${e.voidedAt ? "Undone · audit record kept" : e.settlementId ? "Settled" : "Unpaid"}</small></div><b class="${e.pence < 0 ? "negative" : ""}">${cash(e.pence)}</b>${!e.voidedAt && !e.settlementId ? (admin ? button("Undo", "undo", "secondary", `data-id="${esc(e.id)}" aria-label="Undo ${esc(e.label)}"`) : e.kind === "chore" ? button("Remove", "remove-chore", "secondary", `data-id="${esc(e.id)}" aria-label="Remove ${esc(e.label)}"`) : button("Remove · PIN", "remove-fine", "secondary", `data-id="${esc(e.id)}" aria-label="Remove fine ${esc(e.label)}"`)) : ""}</li>`).join("")}</ol>`
      : '<div class="empty"><span aria-hidden="true">✦</span><h3>A fresh start</h3><p>Completed jobs will appear here. No stars earned just yet.</p></div>';
  }
  function recentActivity(view) {
    const rows = view.entries.slice(0, 5);
    return `<section class="recent-activity" aria-labelledby="recent-title"><h2 id="recent-title">Recent activity</h2>${rows.length
      ? `<ol>${rows.map((e) => `<li class="${e.voidedAt ? "voided" : ""}"><div><strong>${esc(e.label)}</strong><small><time datetime="${esc(e.at)}">${date(e.at)}</time>${e.voidedAt ? " · Undone" : e.settlementId ? " · Settled" : ""}</small></div><b class="${e.pence < 0 ? "negative" : ""}">${e.pence > 0 ? "+" : ""}${cash(e.pence)}</b></li>`).join("")}</ol>`
      : '<p class="muted">Nothing logged yet.</p>'}</section>`;
  }
  function render() {
    if (!ledger) return;
    document.querySelector("#parents").textContent = parent
      ? "Lock parents"
      : "Parents ⌑";
    if (parent) {
      renderParent();
      return;
    }
    if (!child) {
      app.className = "home";
      app.innerHTML = `<div class="kid-grid">${ledger.data.kids
        .map((k) => {
          const v = ledger.view(k.id);
          return `<button class="kid-card ${esc(k.id)}" data-action="child" data-id="${esc(k.id)}" aria-label="Open ${esc(k.name)}"><span class="kid-art" aria-hidden="true">${k.id === "rosie" ? "✿" : "✦"}</span><span class="kid-name">${esc(k.name)}<span aria-hidden="true">↗</span></span><span class="kid-balance"><small>Unpaid balance</small><strong>${cash(v.balancePence)}</strong></span><span class="kid-week">This week <b>${cash(v.weekNetPence)}</b></span></button>`;
        })
        .join(
          "",
        )}</div>`;
      return;
    }
    const v = ledger.view(child);
    app.className = `child-page ${child}`;
    app.innerHTML = `<div class="page-heading">${button("← Everyone", "everyone", "secondary")}<h1>Hi, ${esc(v.kid.name)} <span aria-hidden="true">${child === "rosie" ? "✿" : "✦"}</span></h1></div><section><div class="chore-grid">${v.chores.map((c) => `<button class="chore-card" data-action="credit" data-id="${esc(c.id)}" ><span class="chore-symbol" aria-hidden="true">${esc(c.emoji || "★")}</span><strong>${esc(c.label)}</strong><span class="chore-value">${cash(c.pence)}</span></button>`).join("") || '<p class="empty">No jobs available. Ask a grown-up to add some.</p>'}</div></section><section class="child-fines"><div class="fine-grid"><button class="fine-button" data-action="fine"><span class="chore-symbol" aria-hidden="true">−</span><strong>Add a fine</strong><small>Parent sets the amount</small></button></div></section>${recentActivity(v)}`;
  }
  function renderParent() {
    if (!ledger.isAdmin) {
      lock();
      return;
    }
    const data = ledger.data;
    child = child || data.kids[0].id;
    const v = ledger.view(child);
    app.className = "parent-page";
    app.innerHTML = `<div class="page-heading"><p class="eyebrow">GROWN-UP CORNER · PRIVATE SESSION</p><h1>A little keeping track.</h1><p>History is never deleted. Changes are saved on this device.</p></div><nav class="parent-tabs" aria-label="Parent sections">${[
      ["overview", "Balances & activity"],
      ["catalogue", "Jobs"],
      ["settings", "PIN & backup"],
    ]
      .map(([id, label]) =>
        button(
          label,
          "tab",
          tab === id ? "active" : "",
          `data-id="${id}" aria-pressed="${tab === id}"`,
        ),
      )
      .join("")}</nav>${
      tab === "overview"
        ? `<div class="child-switch" aria-label="Choose child">${data.kids.map((k) => button(esc(k.name), "select-parent", k.id === child ? "active" : "secondary", `data-id="${k.id}" aria-pressed="${k.id === child}"`)).join("")}</div><h2>${esc(v.kid.name)}’s balance</h2><section class="stats">${stats(v)}</section><section class="admin-block"><h2>Payday</h2><p>${v.balancePence < 0 ? "This balance is negative. Settlement clears the debt; no money is paid." : "Settle all unpaid entries for this child only. Older activity stays in the history."}</p>${button(v.balancePence < 0 ? "Clear debt…" : "Settle balance…", "settle", "primary", v.entries.some((e) => !e.voidedAt && !e.settlementId) ? "" : "disabled")}</section><section class="admin-block"><h2>Add a fine</h2><p>Enter a fine amount for ${esc(v.kid.name)}. Fines reduce the unpaid balance.</p><div class="fine-grid">${button("− Add a fine…", "fine", "fine-button")}</div></section><section><h2>All activity · ${esc(v.kid.name)}</h2>${history(v, true)}</section><section><h2>Settlement history</h2>${v.settlements.length ? `<ol class="settlements">${v.settlements.map((s) => `<li><strong>${date(s.at)}</strong><span>Paid ${cash(s.paidPence)}${s.forgivenPence ? ` · Debt cleared ${cash(s.forgivenPence)}` : ""}</span><small>${s.entryIds.length} entries retained</small></li>`).join("")}</ol>` : '<p class="muted">No settlements yet.</p>'}</section>`
        : tab === "catalogue"
          ? `<section class="admin-block"><h2>Make it your own</h2><p>The starting jobs are examples. Edit them to suit your family. Disable an item to hide it; old records keep their original labels and values.</p></section><section><div class="section-heading"><h2>Jobs</h2>${button("+ Add job", "new-type", "primary", 'data-kind="chore"')}</div><div class="catalogue-list">${data.chores.map((t) => `<div class="catalogue-row ${t.enabled ? "" : "disabled-item"}"><span class="catalogue-symbol" aria-hidden="true">${esc(t.emoji || "★")}</span><div><strong>${esc(t.label)}</strong><small>${cash(t.pence)} · ${t.enabled ? "Enabled" : "Disabled"}</small></div>${button("Edit", "edit-type", "secondary", `data-kind="chore" data-id="${esc(t.id)}"`)}${button(t.enabled ? "Disable" : "Enable", "toggle-type", "secondary", `data-kind="chore" data-id="${esc(t.id)}"`)}</div>`).join("")}</div></section>`
          : `<section class="admin-block"><h2>Parent PIN</h2><p>Use 4–8 digits. The app locks when it goes into the background or after two minutes without parent activity.</p>${button("Change parent PIN", "change-pin", "primary")}</section><section class="admin-block"><h2>A copy for safekeeping</h2><p>Export all jobs, fines and financial history as a JSON backup. The parent PIN is not included. Keep the backup somewhere private. Backup restore is not available in this version.</p>${button("Export JSON backup", "export", "primary")}</section>`
    }`;
  }
  function editType(kind, id) {
    requireParent();
    const t = id
      ? ledger.data[kind === "chore" ? "chores" : "fines"].find(
          (t) => t.id === id,
        )
      : { label: "", emoji: "", pence: 25, enabled: true, dailyLimit: 0 };
    dialog(
      `${id ? "Edit" : "Add"} ${kind === "chore" ? "job" : "fine"}`,
      `<form id="type-form"><label>Name<input name="label" maxlength="60" required value="${esc(t.label)}"></label><div class="form-columns"><label>Amount (£)<input name="amount" inputmode="decimal" pattern="[0-9]+(\\.[0-9]{1,2})?" required value="${(t.pence / 100).toFixed(2)}"></label><label>Symbol (optional)<input name="emoji" maxlength="12" value="${esc(t.emoji)}"></label></div><label class="checkbox"><input name="enabled" type="checkbox" ${t.enabled ? "checked" : ""}> Enabled (visible to use)</label><p class="muted">Existing activity keeps its original name and amount.</p><button class="primary" type="submit">Save ${kind === "chore" ? "job" : "fine"}</button></form>`,
    );
    modal.querySelector("form").onsubmit = (e) => {
      e.preventDefault();
      run(() => {
        requireParent();
        const f = new FormData(e.target);
        ledger.upsertType(kind, {
          ...(id ? { id } : {}),
          label: f.get("label"),
          pence: PS.parsePounds(f.get("amount")),
          emoji: f.get("emoji"),
          enabled: f.has("enabled"),
          ...(kind === "chore"
            ? { dailyLimit: 0 }
            : {}),
        });
        closeModal(true);
        render();
        notice("Catalogue saved.");
      });
    };
  }
  function changePin() {
    requireParent();
    dialog(
      "Change parent PIN",
      `<form>${pinField("Current PIN", "old")}${pinField("New PIN", "pin")}${pinField("Repeat new PIN", "confirm")}<button class="primary" type="submit">Save new PIN</button></form>`,
    );
    modal.querySelector("form").onsubmit = (e) => {
      e.preventDefault();
      const f = new FormData(e.target);
      run(async () => {
        requireParent();
        if (!(await vault.change(f.get("old"), f.get("pin"), f.get("confirm"))))
          throw Error("Incorrect PIN. Please try again.");
        lock();
        notice("PIN changed. Parent area locked.");
      });
    };
  }
  function exportBackup() {
    requireParent();
    const json = JSON.stringify(
      { format: "pocket-stars-backup", version: 1, data: ledger.data },
      null,
      2,
    );
    if (window.Android && typeof Android.exportBackup === "function") {
      const result = Android.exportBackup(json);
      if (result === false || result === "false")
        throw Error("Could not open backup export.");
      notice("Choose a location in the save picker.");
    } else {
      const url = URL.createObjectURL(
        new Blob([json], { type: "application/json" }),
      );
      const a = document.createElement("a");
      a.href = url;
      a.download = "pocket-stars-backup.json";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      notice("Backup download requested.");
    }
  }
  function fineDialog(kid, fn) {
    dialog(
      "Add a fine?",
      `<p>Enter the fine amount to subtract from ${esc(ledger.view(kid).kid.name)}’s unpaid balance. History is kept.</p><form id="fine-form"><label>Amount (£)<input name="amount" inputmode="decimal" pattern="[0-9]+(\\.[0-9]{1,2})?" required></label><div class="dialog-actions">${button("Not now", "close", "secondary", 'type="button"')}<button class="danger" type="submit">Confirm fine</button></div></form>`,
    );
    modal.querySelector("#fine-form").onsubmit = (e) => {
      e.preventDefault();
      const f = new FormData(e.target);
      run(async () => {
        await fn(f.get("amount"));
        closeModal(true);
        render();
      });
    };
  }
  async function action(el) {
    const a = el.dataset.action,
      id = el.dataset.id,
      kind = el.dataset.kind;
    if (a === "close") {
      closeModal(true);
      return;
    }
    if (a === "child") {
      child = id;
      render();
      return;
    }
    if (a === "everyone") {
      child = null;
      render();
      return;
    }
    if (a === "credit") {
      const t = ledger.view(child).chores.find((t) => t.id === id);
      if (!t) return;
      const kid = child;
      confirmAction(
        "All finished?",
        `<p class="confirm-symbol" aria-hidden="true">${esc(t.emoji || "★")}</p><h3>${esc(t.label)}</h3><p>Add <strong>${cash(t.pence)}</strong> to ${esc(ledger.view(kid).kid.name)}’s unpaid balance?</p>`,
        "Yes, I did it!",
        () => {
          ledger.credit(kid, id);
          notice("Nice work! Your job is saved.");
        },
      );
      return;
    }
    if (!parent && a === "fine") {
      const kid = child;
      gate(false, (epoch) => {
        const approvedAt = Date.now();
        fineDialog(kid, (amount) => {
          if (
            epoch !== authEpoch ||
            document.hidden ||
            child !== kid ||
            parent ||
            Date.now() - approvedAt >= 120000
          )
            throw Error("Parent approval expired. Please enter your PIN again.");
          const pence = PS.parsePounds(amount);
          // One approval, one attempt: never leave an elevated child board.
          ledger.authorize();
          try {
            ledger.fine(kid, pence);
            notice("Fine recorded.");
          } finally {
            ledger.lock();
            authEpoch++;
          }
        });
      });
      return;
    }
    requireParent();
    if (a === "tab") {
      tab = id;
      render();
    } else if (a === "select-parent") {
      child = id;
      render();
    } else if (a === "new-type" || a === "edit-type") {
      editType("chore", id);
    } else if (a === "change-pin") changePin();
    else if (a === "export") exportBackup();
    else if (a === "toggle-type") {
      const t = ledger.data.chores.find((t) => t.id === id);
      confirmAction(
        t.enabled ? "Disable this item?" : "Enable this item?",
        `<p>${esc(t.label)} will ${t.enabled ? "be hidden from new actions" : "be available again"}. Existing history will not change.</p>`,
        t.enabled ? "Disable item" : "Enable item",
        () => {
          requireParent();
          ledger.upsertType("chore", { ...t, enabled: !t.enabled });
        },
      );
    } else if (a === "fine") {
      const kid = child;
      fineDialog(kid, (amount) => {
        requireParent();
        ledger.fine(kid, PS.parsePounds(amount));
        notice("Fine recorded.");
      });
    } else if (a === "settle") {
      const kid = child,
        v = ledger.view(kid),
        debt = v.balancePence < 0;
      confirmAction(
        debt ? "Clear this debt?" : "Confirm payday",
        debt
          ? `<p class="warning">${esc(v.kid.name)} owes ${cash(-v.balancePence)}. This forgives and clears that debt. <strong>No money is paid.</strong></p><p>All unpaid entries will be marked settled. History is kept.</p>`
          : `<p>Record a payment of <strong>${cash(v.balancePence)}</strong> to ${esc(v.kid.name)} and set their unpaid balance to £0.00.</p><p>This records a payment; it does not transfer money. All history is kept.</p>`,
        debt ? "Yes, clear debt" : "Yes, record payment",
        () => {
          requireParent();
          ledger.settle(kid);
          notice(
            debt
              ? "Debt cleared. History kept."
              : "Payment recorded. History kept.",
          );
        },
        debt,
      );
    } else if (a === "undo") {
      const e = ledger.view(child).entries.find((e) => e.id === id);
      confirmAction(
        "Undo this entry?",
        `<p>${esc(e.label)} · ${cash(e.pence)}</p><p>This removes its effect on the balance but keeps an audit record. Settled entries cannot be undone.</p>`,
        "Undo entry",
        () => {
          requireParent();
          ledger.voidEntry(id);
          notice("Entry undone. Audit record kept.");
        },
        true,
      );
    }
  }
  document.addEventListener("click", (e) => {
    const el = e.target.closest("[data-action]");
    if (el && !el.disabled && !el.onclick) run(() => action(el));
  });
  document.querySelector("#home").onclick = () => {
    if (modal.open) return;
    if (parent) lock();
    child = null;
    render();
  };
  document.querySelector("#parents").onclick = () =>
    run(() => {
      if (parent) lock();
      else gate(!vault.hasPin());
    });
  modal.addEventListener("cancel", (e) => {
    if (busy || !vault.hasPin()) e.preventDefault();
    else closeModal();
  });
  ["pointerdown", "keydown"].forEach((type) =>
    document.addEventListener(
      type,
      () => {
        if (parent) {
          if (Date.now() - lastTouch >= 120000 || !ledger.isAdmin) lock();
          else lastTouch = Date.now();
        }
      },
      true,
    ),
  );
  function suspend() {
    authEpoch++;
    if (parent) lock();
    else if (ledger && modal.open && vault.hasPin()) closeModal(true);
  }
  function back() {
    if (!ledger || busy) return;
    if (modal.open) {
      if (vault.hasPin()) closeModal(true);
      return;
    }
    if (parent) {
      lock();
      return;
    }
    if (child) {
      child = null;
      render();
    }
  }
  window.PocketStarsApp = Object.freeze({ lock: suspend, back });
  document.addEventListener("pocketstars-background", suspend);
  window.addEventListener("pocketstars-back", back);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) suspend();
  });
  window.addEventListener("pagehide", suspend);
  window.addEventListener("blur", suspend);
  setInterval(() => {
    if (parent && (!ledger.isAdmin || Date.now() - lastTouch >= 120000)) lock();
  }, 1000);
  try {
    if (!PS || !vault)
      throw Error(
        "App components are missing. Please reinstall the complete app.",
      );
    let raw = window.Android
      ? Android.loadData()
      : localStorage.getItem("pocket-stars-data");
    let data;
    if (raw) {
      try {
        data = JSON.parse(raw);
      } catch {
        throw Error(
          "Saved data could not be read. Your data has not been reset. Keep this device and contact support before reinstalling.",
        );
      }
    } else {
      data = PS.createState();
      save(data);
    }
    ledger = new PS.Ledger(data, { persist: save });
    if (raw && JSON.stringify(ledger.data) !== JSON.stringify(data)) {
      save(ledger.data);
    }
    render();
    if (!vault.hasPin()) gate(true);
  } catch (e) {
    ledger = null;
    app.innerHTML = `<section class="recovery"><h1>Your data needs attention</h1><p>${esc(e.message)}</p><p>Nothing has been reset. Do not clear app storage or uninstall if you need to keep your records.</p></section>`;
    document.querySelector("#parents").disabled = true;
  }
})();
