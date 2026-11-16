"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
let Pin = {};
try {
  Pin = require("../web/pin.js");
} catch (e) {
  if (e.code !== "MODULE_NOT_FOUND") throw e;
}
test("Five failed attempts lock the PIN across reloads for thirty seconds", async () => {
  let data = "",
    time = 1000;
  const storage = {
    load: () => data,
    save: (s) => {
      data = s;
      return true;
    },
  };
  let v = Pin.createVault(storage, { now: () => time });
  await v.setup("123456", "123456");
  for (let i = 0; i < 5; i++) assert.equal(await v.unlock("654321"), false);
  v = Pin.createVault(storage, { now: () => time });
  await assert.rejects(v.unlock("123456"), /wait/i);
  time += 30001;
  assert.equal(await v.unlock("123456"), true);
});
test("Changing a PIN requires the old PIN and replaces the salted verifier", async () => {
  let data = "";
  const v = Pin.createVault({
    load: () => data,
    save: (s) => {
      data = s;
      return true;
    },
  });
  await v.setup("123456", "123456");
  const first = JSON.parse(data).salt;
  assert.equal(await v.change("111111", "222222", "222222"), false);
  assert.equal(await v.change("123456", "222222", "222222"), true);
  assert.notEqual(JSON.parse(data).salt, first);
  assert.equal(await v.unlock("123456"), false);
  assert.equal(await v.unlock("222222"), true);
});
test('Rapid concurrent PIN attempts cannot bypass the failure limit', async () => {
 let data='';const v=Pin.createVault({load:()=>data,save:s=>{data=s;return true;}});await v.setup('123456','123456');
 await Promise.all(Array.from({length:5},()=>v.unlock('654321')));await assert.rejects(v.unlock('123456'),/wait/i);
});
test("Parents create their own salted PIN; plaintext is never persisted", async () => {
  assert.equal(typeof Pin.createVault, "function", "PIN vault exists");
  let data = "";
  const v = Pin.createVault({
    load: () => data,
    save: (x) => {
      data = x;
      return true;
    },
  });
  assert.equal(v.hasPin(), false);
  await assert.rejects(v.setup("12", "12"));
  await v.setup("482631", "482631");
  assert.equal(v.hasPin(), true);
  assert.ok(!data.includes("482631"));
  assert.equal(await v.unlock("482631"), true);
  assert.equal(await v.unlock("111111"), false);
  await assert.rejects(v.setup("1234", "1234"), /already/i);
});
