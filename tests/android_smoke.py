#!/usr/bin/env python3
"""On-device smoke checks in an isolated QA package. Never clears production data.
Run only when the authorised USB tablet is connected. Uses a temporary random test
PIN, never logged; removes the QA app and ADB forward on completion.
"""
import json
import os
from pathlib import Path
import secrets
import shutil
import subprocess
import time
import urllib.request
import xml.etree.ElementTree as ET
import websocket
from PIL import Image
import io

ROOT = Path('/home/julia/workspace/pocket-stars')
WORK = Path('/home/julia/.hermes/workspace/pocket-stars/native-qa')
ADB = '/home/julia/workspace/lenovo-tb328fu-lineageos/tools/platform-tools/adb'
SERIAL = 'HGT7CR29'
PACKAGE = 'app.pocketstars.qa'
PORT = 9334
NS = '{http://schemas.android.com/apk/res/android}'
checks = []

def adb(*args, **kw):
    r = subprocess.run([ADB, '-s', SERIAL, *args], capture_output=True, timeout=kw.pop('timeout', 40), **kw)
    if r.returncode:
        raise RuntimeError((r.stdout + r.stderr).decode(errors='replace'))
    return r.stdout

class Page:
    def __init__(self):
        pid = adb('shell', 'pidof', PACKAGE).decode().strip().split()[0]
        adb('forward', 'tcp:' + str(PORT), 'localabstract:webview_devtools_remote_' + pid)
        deadline = time.monotonic() + 20
        while True:
            try:
                tabs = json.load(urllib.request.urlopen('http://127.0.0.1:%s/json' % PORT, timeout=3))
                tab = next(t for t in tabs if t.get('type') == 'page' and 'index.html' in t.get('url', ''))
                break
            except Exception:
                if time.monotonic() > deadline:
                    raise
                time.sleep(.3)
        self.ws = websocket.create_connection(tab['webSocketDebuggerUrl'], timeout=30, suppress_origin=True)
        self.seq = 0
    def evaluate(self, expression):
        self.seq += 1
        self.ws.send(json.dumps({'id': self.seq, 'method': 'Runtime.evaluate', 'params': {'expression': expression, 'returnByValue': True, 'awaitPromise': True}}))
        while True:
            r = json.loads(self.ws.recv())
            if r.get('id') == self.seq:
                break
        if r.get('error') or r.get('result', {}).get('exceptionDetails'):
            # Do not echo expressions containing the ephemeral test PIN.
            raise RuntimeError('QA WebView evaluation failed')
        return r.get('result', {}).get('result', {}).get('value')
    def wait(self, expr, seconds=15):
        deadline = time.monotonic() + seconds
        while time.monotonic() < deadline:
            if self.evaluate(expr):
                return
            time.sleep(.15)
        raise AssertionError('Timed out waiting for QA state')
    def click(self, selector):
        self.evaluate('document.querySelector(%s).click()' % json.dumps(selector))
        time.sleep(.2)
    def view(self, kid='jake'):
        return self.evaluate('new PocketStars.Ledger(JSON.parse(Android.loadData())).view(%s)' % json.dumps(kid))
    def close(self):
        self.ws.close()


def check(name, passed):
    if not passed:
        raise AssertionError(name)
    checks.append(name)
    print('PASS ' + name, flush=True)


def fill_pin(page, pin, setup=False):
    values = {'pin': pin}
    if setup:
        values['confirm'] = pin
    page.evaluate('(()=>{const f=document.querySelector("#pin-form");const values=%s;for(const [k,v] of Object.entries(values))f.elements[k].value=v;f.dispatchEvent(new Event("submit",{bubbles:true,cancelable:true}));})()' % json.dumps(values))


def main():
    WORK.mkdir(parents=True, exist_ok=True)
    # Independent package: never reuse the production application's private data.
    android = WORK / 'android'
    if android.exists():
        shutil.rmtree(android)
    shutil.copytree(ROOT / 'android', android)
    manifest = ET.parse(android / 'AndroidManifest.xml')
    manifest.getroot().set('package', PACKAGE)
    app = manifest.getroot().find('application')
    app.set(NS + 'label', 'Pocket Stars QA')
    app.set(NS + 'debuggable', 'true')
    activity = app.find('activity')
    activity.set(NS + 'name', 'app.pocketstars.MainActivity')
    for f in list(activity.findall('intent-filter')):
        if any(c.get(NS + 'name') == 'android.intent.category.HOME' for c in f.findall('category')):
            activity.remove(f)
    ET.register_namespace('android', NS[1:-1])
    manifest.write(android / 'AndroidManifest.xml', encoding='utf-8', xml_declaration=True)
    java = android / 'src/app/pocketstars/MainActivity.java'
    source = java.read_text()
    assert 'setWebContentsDebuggingEnabled(false)' in source
    java.write_text(source.replace('setWebContentsDebuggingEnabled(false)', 'setWebContentsDebuggingEnabled(true)'))
    # Native tests use a stable fixture, not concurrently edited production UI.
    # Only this QA build shortens the timeout; production remains exactly 300000ms.
    policy=android/'src/app/pocketstars/IdlePolicy.java'
    source=policy.read_text()
    assert 'TIMEOUT_MS = 300000L' in source
    policy.write_text(source.replace('TIMEOUT_MS = 300000L','TIMEOUT_MS = 1500L'))
    assets=WORK/'fixture'
    assets.mkdir(exist_ok=True)
    for name in ('core.js','pin.js'):
        shutil.copy2(ROOT/'web'/name,assets/name)
    (assets/'index.html').write_text('<!doctype html><meta name="viewport" content="width=device-width"><title>Pocket Stars native QA</title><body style="background:#faf5e9"><h1>Temporary device checks</h1><button id="touch" style="position:fixed;inset:0;width:100%;height:100%;background:#faf5e9;color:#183e43;font-size:40px">Device checks</button><script src="core.js"></script><script src="pin.js"></script><script src="fixture.js"></script>')
    (assets/'fixture.js').write_text("const raw=Android.loadData();window.L=new PocketStars.Ledger(raw?JSON.parse(raw):undefined,{persist:s=>Android.saveData(JSON.stringify(s))});window.QA={touches:0};window.PocketStarsApp={lock:()=>L.lock()};document.querySelector('#touch').onclick=()=>{QA.touches++};window.ready=true;")
    env = dict(os.environ, PS_ANDROID_DIR=str(android), PS_WEB_DIR=str(assets), PS_APK_OUT=str(WORK / 'pocket-stars-qa.apk'))
    with (WORK / 'build.log').open('w') as log:
        subprocess.run([str(ROOT / 'tools/build-apk.sh')], env=env, cwd=ROOT, stdout=log, stderr=subprocess.STDOUT, check=True, timeout=120)
    adb('install', '--no-incremental', '-r', str(WORK / 'pocket-stars-qa.apk'))
    adb('shell', 'pm', 'clear', PACKAGE)
    adb('shell', 'am', 'start', '-W', '-n', PACKAGE + '/app.pocketstars.MainActivity')
    page = Page()
    pin = str(secrets.randbelow(900000) + 100000)
    try:
        page.wait('window.ready===true')
        check('Native salted PIN setup and verification', page.evaluate('(async()=>{await PinVault.setup(%s,%s);return PinVault.unlock(%s);})()' % (json.dumps(pin),json.dumps(pin),json.dumps(pin))) is True)
        page.evaluate("L.credit('jake','tidy-room')")
        check('Native private-file chore save records exactly 50p', page.view()['balancePence'] == 50)
        page.close()
        adb('shell', 'am', 'force-stop', PACKAGE)
        adb('shell', 'am', 'start', '-W', '-n', PACKAGE + '/app.pocketstars.MainActivity')
        page = Page()
        page.wait('window.ready===true')
        check('Balance and parent PIN survive a killed app process', page.view()['balancePence'] == 50 and page.evaluate('PinVault.hasPin()') is True)
        page.evaluate("L.credit('jake','tidy-room')")
        check('Same chore can be credited repeatedly on the tablet', page.view()['balancePence'] == 100)
        check('Native malformed save is rejected without losing data', page.evaluate("(()=>{const before=Android.loadData();return Android.saveData('not-json')===false && Android.loadData()===before;})()") is True)
        # Wake/reset the native idle deadline, then deliberately leave it untouched.
        adb('shell','input','tap','600','900')
        page.evaluate('QA.touches=0;L.authorize()')
        time.sleep(2.1)
        black=adb('exec-out','screencap','-p')
        (WORK/'idle-black.png').write_bytes(black)
        image=Image.open(io.BytesIO(black)).convert('RGB')
        check('Actual tablet displays a black idle screen',image.getpixel((image.width//2,image.height//2))==(0,0,0))
        check('Native idle locks the parent session',page.evaluate('L.isAdmin') is False)
        adb('shell','input','tap','600','900')
        time.sleep(.2)
        wake=adb('exec-out','screencap','-p')
        (WORK/'idle-wake.png').write_bytes(wake)
        image=Image.open(io.BytesIO(wake)).convert('RGB')
        check('One tap restores the app without activating its button',image.getpixel((image.width//2,image.height//2))!=(0,0,0) and page.evaluate('QA.touches')==0)
        adb('shell','input','tap','600','900')
        check('The next intentional tap works normally',page.evaluate('QA.touches')==1)
        with (WORK / 'results.json').open('w') as f:
            json.dump({'package': PACKAGE, 'checks': checks, 'passed': True,'idle_timeout_in_QA_ms':1500,'production_idle_timeout_ms':300000}, f, indent=2)
    finally:
        try:
            page.close()
        except Exception:
            pass
        adb('uninstall', PACKAGE)
        adb('forward', '--remove', 'tcp:' + str(PORT))
        adb('shell', 'am', 'start', '-W', '-n', 'app.pocketstars/.MainActivity')
    print('QA completed; production data was never cleared or modified.', flush=True)

if __name__ == '__main__':
    main()
