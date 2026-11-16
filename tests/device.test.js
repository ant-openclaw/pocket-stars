'use strict';
const test=require('node:test');const assert=require('node:assert/strict');const {spawnSync}=require('node:child_process');
const adb='/home/julia/workspace/lenovo-tb328fu-lineageos/tools/platform-tools/adb';
test('The actual tablet has a launchable offline Pocket Stars app',()=>{
 const run=(...args)=>spawnSync(adb,['-s','HGT7CR29',...args],{encoding:'utf8',timeout:30000});
 const installed=run('shell','pm','path','app.pocketstars');assert.match(installed.stdout,/package:/,'Pocket Stars APK installed');
 const launch=run('shell','am','start','-W','-n','app.pocketstars/.MainActivity');assert.match(launch.stdout,/Status: ok/);
 const permissions=run('shell','dumpsys','package','app.pocketstars');assert.ok(!permissions.stdout.includes('android.permission.INTERNET'),'No network permission');
});
