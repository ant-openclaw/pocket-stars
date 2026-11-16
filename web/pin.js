(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.PinVault = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const hex = (b) =>
    Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  function createVault(storage, options = {}) {
    const now = options.now || Date.now;
    const load = () => {
      const s = storage.load();
      if (!s) return null;
      const r = JSON.parse(s);
      if (!/^[a-f0-9]{32}$/.test(r.salt) || !/^[a-f0-9]{64}$/.test(r.hash))
        throw Error("PIN storage is damaged. Do not reset app data.");
      return r;
    };
    const save = (r) => {
      if (storage.save(JSON.stringify(r)) === false)
        throw Error("Unable to save parent PIN");
    };
    const validate = (pin, confirm) => {
      if (!/^\d{4,8}$/.test(pin)) throw Error("Choose a PIN of 4–8 digits");
      if (pin !== confirm) throw Error("PINs do not match");
    };
    async function derive(pin, salt) {
      if (globalThis.Android && typeof Android.derivePin === "function") {
        const h = String(Android.derivePin(pin, salt));
        if (!/^[a-f0-9]{64}$/.test(h))
          throw Error("PIN protection unavailable");
        return h;
      }
      const key = await crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(pin),
        "PBKDF2",
        false,
        ["deriveBits"],
      );
      const bytes = Uint8Array.from(salt.match(/../g), (x) => parseInt(x, 16));
      return hex(
        new Uint8Array(
          await crypto.subtle.deriveBits(
            {
              name: "PBKDF2",
              salt: bytes,
              iterations: 120000,
              hash: "SHA-256",
            },
            key,
            256,
          ),
        ),
      );
    }
    async function record(pin) {
      const salt = hex(crypto.getRandomValues(new Uint8Array(16)));
      return {
        version: 1,
        salt,
        hash: await derive(pin, salt),
        failures: 0,
        lockedUntil: 0,
      };
    }
    const vault = {
      hasPin: () => load() !== null,
      async change(oldPin, newPin, confirm) {
        validate(newPin, confirm);
        if (!(await this.unlock(oldPin))) return false;
        save(await record(newPin));
        return true;
      },
      async setup(pin, confirm) {
        validate(pin, confirm);
        if (load()) throw Error("Parent PIN already configured");
        save(await record(pin));
        return true;
      },
      async unlock(pin) {
        const r = load();
        if (!r) throw Error("Set a parent PIN first");
        if (r.lockedUntil > now())
          throw Error("Please wait 30 seconds before trying again");
        if (r.lockedUntil && r.lockedUntil <= now()) {
          r.failures = 0;
          r.lockedUntil = 0;
        }
        const h = /^\d{4,8}$/.test(pin)
          ? await derive(pin, r.salt)
          : "0".repeat(64);
        let diff = 0;
        for (let i = 0; i < h.length; i++)
          diff |= h.charCodeAt(i) ^ r.hash.charCodeAt(i);
        const ok = diff === 0;
        if (ok) {
          r.failures = 0;
          r.lockedUntil = 0;
        } else {
          r.failures = (r.failures || 0) + 1;
          if (r.failures >= 5) r.lockedUntil = now() + 30000;
        }
        save(r);
        return ok;
      },
    };
    let queue=Promise.resolve();
    const serial=fn=>(...args)=>{const run=queue.then(()=>fn(...args));queue=run.catch(()=>{});return run;};
    return {hasPin:vault.hasPin,setup:serial((...a)=>vault.setup(...a)),unlock:serial((...a)=>vault.unlock(...a)),change:serial((...a)=>vault.change(...a))};
  }
  const native = () =>
    globalThis.Android && typeof Android.loadPin === "function";
  const defaultVault = createVault({
    load: () =>
      native()
        ? String(Android.loadPin())
        : localStorage.getItem("pocket-stars-pin"),
    save: (s) => {
      if (native()) return Android.savePin(s);
      localStorage.setItem("pocket-stars-pin", s);
      return true;
    },
  });
  return { ...defaultVault, createVault };
});
