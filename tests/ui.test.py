"""Real-browser integration tests. Run with playwright Python; Chrome required."""
import pathlib, threading, http.server, unittest, json
from playwright.sync_api import sync_playwright
ROOT = pathlib.Path(__file__).resolve().parents[1]
class UI(unittest.TestCase):
 @classmethod
 def setUpClass(cls):
  handler=lambda *a,**k:http.server.SimpleHTTPRequestHandler(*a,directory=str(ROOT/'web'),**k)
  cls.server=http.server.ThreadingHTTPServer(('127.0.0.1',8941),handler)
  threading.Thread(target=cls.server.serve_forever,daemon=True).start()
  cls.pw=sync_playwright().start(); cls.browser=cls.pw.chromium.launch(executable_path='/usr/bin/google-chrome',headless=True,args=['--no-sandbox'])
 @classmethod
 def tearDownClass(cls):
  cls.browser.close();cls.pw.stop();cls.server.shutdown()
 def setUp(self):
  self.context=self.browser.new_context(viewport={'width':800,'height':1100});self.page=self.context.new_page();self.js_errors=[];self.page.on('pageerror',lambda error:self.js_errors.append(str(error)));self.page.clock.install();self.page.goto('http://127.0.0.1:8941')
 def tearDown(self):
  self.context.close();self.assertEqual(self.js_errors,[])
 def setup_pin(self):
  self.page.get_by_label('New PIN',exact=True).fill('8246');self.page.get_by_label('Repeat new PIN',exact=True).fill('8246');self.page.get_by_role('button',name='Save parent PIN',exact=True).click();self.page.wait_for_selector('.kid-card')
 def test_home_has_only_header_controls_and_two_big_child_cards(self):
  self.setup_pin();self.assertEqual(self.page.locator('.kid-card').count(),2)
  self.assertEqual(self.page.locator('.welcome,.home-note,.brand small,footer').count(),0)
  self.assertEqual(self.page.locator('#app > *').count(),1)
 def test_repeat_chore_same_day_and_catalogue_has_no_frequency_choice(self):
  self.setup_pin();self.unlock();self.page.get_by_role('button',name='Jobs',exact=True).click();self.page.locator('[data-action="edit-type"][data-kind="chore"]').first.click()
  self.assertEqual(self.page.locator('select[name="dailyLimit"]').count(),0)
  self.page.get_by_role('button',name='Close dialog').click();self.assertEqual(self.page.locator('[data-kind="fine"]').count(),0)
  self.page.get_by_role('button',name='Lock parents',exact=True).click();self.page.get_by_role('button',name='Pocket Stars home',exact=True).click();self.page.get_by_role('button',name='Open Rosie').click()
  for _ in range(2):
   self.page.locator('.chore-card').first.click();self.page.get_by_role('button',name='Yes, I did it!',exact=True).click();self.page.locator('#modal').wait_for(state='hidden')
  data=self.page.evaluate('JSON.parse(localStorage.getItem("pocket-stars-data"))');self.assertEqual(len(data['entries']),2);self.assertEqual(data['entries'][0]['pence'],data['entries'][1]['pence']);self.assertEqual(self.page.locator('.chore-card:disabled').count(),0)
  self.assertEqual(self.page.get_by_text('Once a day',exact=True).count()+self.page.get_by_text('✓ Done today',exact=True).count(),0)
 def test_starboard_has_only_chores_and_one_fine_button_no_stats_or_activity(self):
  self.setup_pin();self.page.get_by_role('button',name='Open Jake').click();self.page.locator('.chore-card').first.click();self.page.get_by_role('button',name='Yes, I did it!').click()
  self.assertEqual(self.page.locator('.child-page .stats,.child-page .balance,.child-page .weekly,.child-page .activity').count(),0)
  for removed in ['Unpaid balance','This week','Your activity','What did you do?','Tap a job to add it','YOUR STAR BOARD']:
   self.assertEqual(self.page.get_by_text(removed,exact=True).count(),0)
  self.assertEqual(self.page.locator('.child-page .chore-card').count(),9)
  for label in ['Bath Molly','Clean up poo in garden','Tidy room','Unload dishwasher','Load dishwasher','Do schoolwork','Tidy clothes drawer','Buy food from shops','Help with the washing']:
   self.assertTrue(self.page.locator('.chore-grid').get_by_text(label,exact=True).is_visible())
  for old_label in ['Laid the table','Fed the pet','Finished homework']:
   self.assertEqual(self.page.get_by_text(old_label,exact=True).count(),0)
  self.assertEqual(self.page.locator('.child-page [data-action="fine"]').count(),1)
  heading_delta=self.page.evaluate("(()=>{const b=document.querySelector('[data-action=\"everyone\"]').getBoundingClientRect();const h=document.querySelector('.child-page h1').getBoundingClientRect();return Math.abs((b.top+b.height/2)-(h.top+h.height/2));})()")
  self.assertLessEqual(heading_delta,15)
  for w,h in [(1280,720),(800,1200)]:
   self.page.set_viewport_size({'width':w,'height':h})
   overflow=self.page.evaluate("(()=>Array.from(document.querySelectorAll('.child-page .chore-card, .child-page [data-action=\"fine\"]')).filter(e=>e.getBoundingClientRect().bottom>window.innerHeight).length)()")
   self.assertEqual(overflow,0)
 def test_recent_activity_below_fine_is_readonly_newest_first_and_child_specific(self):
  self.child_fine_board()
  self.assertTrue(self.page.get_by_role('heading',name='Recent activity',exact=True).is_visible())
  self.assertTrue(self.page.get_by_text('Nothing logged yet.',exact=True).is_visible())
  self.page.evaluate("(()=>{for(let i=0;i<7;i++)testLedger.credit('jake','tidy-room');testLedger.authorize();testLedger.fine('jake',75);testLedger.voidEntry(testLedger.data.entries[6].id);testLedger.credit('rosie','bath-molly');testLedger.lock();})()")
  self.page.get_by_role('button',name='← Everyone',exact=True).click();self.page.get_by_role('button',name='Open Jake').click()
  rows=self.page.locator('.recent-activity li');self.assertEqual(rows.count(),5)
  self.assertIn('Fine',rows.nth(0).inner_text());self.assertIn('-£0.75',rows.nth(0).inner_text())
  self.assertIn('Tidy room',rows.nth(1).inner_text());self.assertIn('Undone',rows.nth(1).inner_text())
  self.assertEqual(self.page.locator('.recent-activity button').count(),0)
  self.assertEqual(self.page.locator('.recent-activity time[datetime]').count(),5)
  self.assertEqual(self.page.locator('.recent-activity').get_by_text('Bath Molly',exact=True).count(),0)
  self.assertTrue(self.page.evaluate("document.querySelector('.child-fines').compareDocumentPosition(document.querySelector('.recent-activity')) & Node.DOCUMENT_POSITION_FOLLOWING"))
  self.page.reload();self.page.get_by_role('button',name='Open Jake').click();self.assertEqual(self.page.locator('.recent-activity li').count(),5)
  self.page.get_by_role('button',name='← Everyone',exact=True).click();self.page.get_by_role('button',name='Open Rosie').click()
  self.assertEqual(self.page.locator('.recent-activity li').count(),1);self.assertIn('Bath Molly',self.page.locator('.recent-activity').inner_text())
 def child_fine_board(self):
  # Capture the real UI ledger only in this isolated browser context.
  self.page.add_init_script("Object.defineProperty(window,'PocketStars',{configurable:true,set(value){const Base=value.Ledger;Object.defineProperty(window,'PocketStars',{value:{...value,Ledger:class extends Base{constructor(...args){super(...args);window.testLedger=this;}}},configurable:true});}})")
  self.page.reload();self.setup_pin();self.page.get_by_role('button',name='Open Jake').click()
 def enter_action_pin(self,pin='8246'):
  self.page.get_by_label('Parent PIN',exact=True).fill(pin);self.page.get_by_role('button',name='Continue',exact=True).click()
 def test_child_fine_button_always_requires_pin_sets_amount_keeps_board_and_locks_ledger(self):
  self.child_fine_board();self.assertEqual(self.page.locator('.child-page [data-action="fine"]').count(),1)
  self.assertTrue(self.page.evaluate("(()=>{try{testLedger.fine('jake',50);return false}catch{return true}})()"))
  self.page.evaluate('testLedger.authorize()');self.page.locator('[data-action="fine"]').click();self.assertFalse(self.page.evaluate('testLedger.isAdmin'))
  self.enter_action_pin('0000');self.page.get_by_text('Incorrect PIN. Please try again.',exact=True).wait_for();self.assertEqual(self.page.evaluate('testLedger.data.entries.length'),0)
  self.enter_action_pin();self.page.get_by_role('heading',name='Add a fine?',exact=True).wait_for();self.assertEqual(self.page.locator('.parent-page').count(),0);self.assertEqual(self.page.evaluate('testLedger.data.entries.length'),0)
  self.page.get_by_label('Amount (£)',exact=True).fill('0.75');self.page.get_by_role('button',name='Confirm fine',exact=True).click();self.assertFalse(self.page.evaluate('testLedger.isAdmin'));self.assertTrue(self.page.get_by_role('heading',name='Hi, Jake').is_visible())
  self.assertEqual(self.page.evaluate('testLedger.data.entries[0].pence'),-75)
  self.assertTrue(self.page.evaluate("(()=>{try{testLedger.removeChore('jake',testLedger.data.entries[0].id);return false}catch{return true}})()"))
  self.assertTrue(self.page.evaluate("(()=>{try{testLedger.voidEntry(testLedger.data.entries[0].id);return false}catch{return true}})()"))
 def test_child_fine_approval_expires_and_failed_save_requires_fresh_pin(self):
  self.child_fine_board();self.page.locator('[data-action="fine"]').click();self.enter_action_pin();self.page.get_by_role('heading',name='Add a fine?',exact=True).wait_for();self.page.get_by_label('Amount (£)',exact=True).fill('0.50');self.page.clock.fast_forward(121000)
  self.page.get_by_role('button',name='Confirm fine',exact=True).click();self.page.get_by_text('Parent approval expired. Please enter your PIN again.',exact=True).wait_for(timeout=2000);self.assertEqual(self.page.evaluate('testLedger.data.entries.length'),0);self.assertFalse(self.page.evaluate('testLedger.isAdmin'))
  self.page.get_by_role('button',name='Close dialog').click();self.page.locator('[data-action="fine"]').click();self.enter_action_pin();self.page.get_by_role('heading',name='Add a fine?',exact=True).wait_for();self.page.get_by_label('Amount (£)',exact=True).fill('0.50');self.page.evaluate("window.Android={saveData:()=>false}");self.page.get_by_role('button',name='Confirm fine',exact=True).click();self.page.get_by_text('Could not save. Nothing has changed. Please try again.',exact=True).wait_for();self.assertFalse(self.page.evaluate('testLedger.isAdmin'))
  self.page.evaluate('delete window.Android');self.page.get_by_role('button',name='Confirm fine',exact=True).click();self.page.get_by_text('Parent approval expired. Please enter your PIN again.',exact=True).wait_for(timeout=2000);self.assertEqual(self.page.evaluate('testLedger.data.entries.length'),0)
 def test_child_fine_cancel_back_background_and_async_unlock_never_elevate(self):
  self.child_fine_board()
  for cancel in ['close','back','background','confirm-cancel']:
   self.page.evaluate('testLedger.authorize()');self.page.locator('[data-action="fine"]').click();self.assertFalse(self.page.evaluate('testLedger.isAdmin'))
   if cancel=='confirm-cancel':
    self.enter_action_pin();self.page.get_by_role('button',name='Not now',exact=True).click()
   elif cancel=='close':self.page.get_by_role('button',name='Close dialog').click()
   elif cancel=='back':self.page.evaluate("window.dispatchEvent(new Event('pocketstars-back'))")
   else:self.page.evaluate("document.dispatchEvent(new Event('pocketstars-background'))")
   self.assertFalse(self.page.locator('#modal').is_visible());self.assertFalse(self.page.evaluate('testLedger.isAdmin'));self.assertEqual(self.page.evaluate('testLedger.data.entries.length'),0);self.assertTrue(self.page.get_by_role('heading',name='Hi, Jake').is_visible())
  self.page.evaluate("(()=>{const original=PinVault.unlock;window.finishUnlock=null;PinVault.unlock=async(...args)=>{const result=await original(...args);await new Promise(r=>window.finishUnlock=r);return result;};})()")
  self.page.locator('[data-action="fine"]').click();self.enter_action_pin()
  for _ in range(40):
   if self.page.evaluate('typeof window.finishUnlock === "function"'):break
   self.page.wait_for_timeout(50)
  self.assertTrue(self.page.evaluate('typeof window.finishUnlock === "function"'));self.page.evaluate("document.dispatchEvent(new Event('pocketstars-background'));window.finishUnlock()")
  self.page.wait_for_timeout(100);self.assertFalse(self.page.locator('#modal').is_visible());self.assertFalse(self.page.evaluate('testLedger.isAdmin'));self.assertEqual(self.page.evaluate('testLedger.data.entries.length'),0);self.assertEqual(self.page.locator('.parent-page').count(),0)
 def test_settled_entries_have_no_undo_controls_in_parent_view(self):
  self.setup_pin();self.page.get_by_role('button',name='Open Rosie').click();self.page.locator('.chore-card').first.click();self.page.get_by_role('button',name='Yes, I did it!').click();self.unlock();self.page.locator('[data-action="fine"]').click();self.page.get_by_label('Amount (£)',exact=True).fill('0.25');self.page.get_by_role('button',name='Confirm fine',exact=True).click();self.page.get_by_role('button',name='Settle balance…',exact=True).click();self.page.get_by_role('button',name='Yes, record payment',exact=True).click()
  self.assertEqual(self.page.locator('.activity li').count(),2);self.assertEqual(self.page.locator('[data-action="undo"]').count(),0);self.assertEqual(self.page.get_by_text('Settled',exact=False).count(),2)
 def test_first_launch_requires_parent_setup_and_confirmation_before_credit(self):
  self.assertTrue(self.page.get_by_role('heading',name='A little setup for grown-ups').is_visible())
  self.setup_pin();self.page.get_by_role('button',name='Open Rosie').click()
  self.page.locator('.chore-card').first.click()
  self.assertEqual(self.page.evaluate('JSON.parse(localStorage.getItem("pocket-stars-data")).entries.length'),0)
  self.page.get_by_role('button',name='Yes, I did it!').click()
  self.assertEqual(self.page.evaluate('JSON.parse(localStorage.getItem("pocket-stars-data")).entries.length'),1)
  self.page.get_by_role('button',name='Pocket Stars home',exact=True).click();self.assertTrue(self.page.get_by_text('£2.00',exact=True).first.is_visible())
 def unlock(self):
  self.page.get_by_role('button',name='Parents ⌑',exact=True).click();self.page.get_by_label('Parent PIN',exact=True).fill('8246');self.page.get_by_role('button',name='Unlock parent area').click();self.page.get_by_role('heading',name='A little keeping track.').wait_for()
 def test_payday_preserves_other_child_week_and_reload(self):
  self.setup_pin()
  for name in ['Rosie','Jake']:
   self.page.get_by_role('button',name=f'Open {name}',exact=True).click();self.page.locator('.chore-card').first.click();self.page.get_by_role('button',name='Yes, I did it!',exact=True).click();self.page.get_by_role('button',name='Pocket Stars home',exact=True).click()
  self.unlock();self.page.get_by_role('button',name='Settle balance…',exact=True).click();self.page.get_by_role('button',name='Yes, record payment',exact=True).click()
  data=self.page.evaluate('JSON.parse(localStorage.getItem("pocket-stars-data"))');self.assertEqual(len(data['entries']),2);self.assertEqual(len(data['settlements']),1);self.assertEqual(data['settlements'][0]['kidId'],'rosie');self.assertGreater(data['settlements'][0]['paidPence'],0);self.assertEqual(next(e for e in data['entries'] if e['kidId']=='jake')['settlementId'],None)
  folder=pathlib.Path('/home/julia/.hermes/workspace/pocket-stars');self.page.clock.fast_forward(5000);self.page.screenshot(path=str(folder/'ui-parent-portrait.png'),full_page=True)
  for w,h in [(390,844),(1280,800)]:
   self.page.set_viewport_size({'width':w,'height':h});self.assertTrue(self.page.evaluate('document.documentElement.scrollWidth <= innerWidth'));self.assertEqual(self.page.locator('button:visible').evaluate_all('(els)=>els.filter(e=>e.getBoundingClientRect().height<56).map(e=>e.textContent)'),[])
  self.page.reload();self.assertEqual(self.page.evaluate('JSON.parse(localStorage.getItem("pocket-stars-data")).entries.length'),2);self.assertEqual(self.page.locator('.parent-page').count(),0)
 def test_admin_fine_debt_settlement_and_audit(self):
  self.setup_pin();self.unlock();self.page.locator('[data-action="fine"]').click();self.page.get_by_label('Amount (£)',exact=True).fill('0.50');self.page.get_by_role('button',name='Confirm fine').click()
  self.page.get_by_role('button',name='Clear debt…').click();self.assertTrue(self.page.get_by_text('No money is paid.',exact=True).is_visible());self.page.get_by_role('button',name='Yes, clear debt').click()
  data=self.page.evaluate('JSON.parse(localStorage.getItem("pocket-stars-data"))');self.assertEqual(len(data['entries']),1);self.assertEqual(len(data['settlements']),1);self.assertEqual(data['settlements'][0]['forgivenPence'],50);self.assertEqual(data['settlements'][0]['paidPence'],0)
  self.page.locator('[data-action="fine"]').click();self.page.get_by_label('Amount (£)',exact=True).fill('0.35');self.page.get_by_role('button',name='Confirm fine').click();self.page.locator('[data-action="undo"]').first.click();self.page.get_by_role('button',name='Undo entry',exact=True).click()
  data=self.page.evaluate('JSON.parse(localStorage.getItem("pocket-stars-data"))');self.assertEqual(len(data['entries']),2);self.assertTrue(any(e['voidedAt'] for e in data['entries']))
 def test_catalogue_escape_create_edit_disable_and_backup(self):
  self.setup_pin();self.unlock();self.page.get_by_role('button',name='Jobs',exact=True).click();self.page.get_by_role('button',name='+ Add job',exact=True).click()
  self.page.get_by_label('Name',exact=True).fill('<img src=x onerror=alert(1)>');self.page.get_by_label('Amount (£)',exact=True).fill('1.23');self.page.get_by_role('button',name='Save job',exact=True).click()
  row=self.page.locator('.catalogue-row').filter(has_text='<img src=x onerror=alert(1)>');self.assertEqual(row.locator('img').count(),0)
  row.get_by_role('button',name='Edit',exact=True).click();self.page.get_by_label('Name',exact=True).fill('Water the plants');self.page.get_by_role('button',name='Save job',exact=True).click()
  row=self.page.locator('.catalogue-row').filter(has_text='Water the plants');row.get_by_role('button',name='Disable',exact=True).click();self.page.get_by_role('button',name='Disable item',exact=True).click();self.assertTrue(row.get_by_role('button',name='Enable',exact=True).is_visible())
  self.page.get_by_role('button',name='PIN & backup',exact=True).click()
  with self.page.expect_download() as dl:self.page.get_by_role('button',name='Export JSON backup',exact=True).click()
  backup=json.loads(pathlib.Path(dl.value.path()).read_text());self.assertEqual(backup['format'],'pocket-stars-backup');self.assertNotIn('pin',backup)
 def test_wrong_pin_background_lock_and_change_pin(self):
  self.setup_pin();self.page.get_by_role('button',name='Parents ⌑',exact=True).click();self.page.get_by_label('Parent PIN',exact=True).fill('0000');self.page.get_by_role('button',name='Unlock parent area').click();self.page.get_by_text('Incorrect PIN. Please try again.',exact=True).wait_for();self.assertEqual(self.page.locator('.parent-page').count(),0)
  self.page.get_by_label('Parent PIN',exact=True).fill('8246');self.page.get_by_role('button',name='Unlock parent area').click();self.page.locator('.parent-page').wait_for()
  self.page.evaluate("window.dispatchEvent(new Event('blur'))");self.assertEqual(self.page.locator('.parent-page').count(),0)
  self.unlock();self.page.get_by_role('button',name='PIN & backup',exact=True).click();self.page.get_by_role('button',name='Change parent PIN',exact=True).click();self.page.get_by_label('Current PIN',exact=True).fill('8246');self.page.get_by_label('New PIN',exact=True).fill('9628');self.page.get_by_label('Repeat new PIN',exact=True).fill('9628');self.page.get_by_role('button',name='Save new PIN',exact=True).click();self.page.get_by_role('button',name='Parents ⌑',exact=True).wait_for();self.assertEqual(self.page.locator('.parent-page').count(),0)
  self.page.get_by_role('button',name='Parents ⌑',exact=True).click();self.page.get_by_label('Parent PIN',exact=True).fill('9628');self.page.get_by_role('button',name='Unlock parent area').click();self.page.locator('.parent-page').wait_for()
 def test_cancel_chore_and_layouts_and_screenshots(self):
  self.setup_pin()
  folder=pathlib.Path('/home/julia/.hermes/workspace/pocket-stars');self.page.screenshot(path=str(folder/'ui-home-portrait.png'),full_page=True)
  self.page.get_by_role('button',name='Open Jake').click();self.page.locator('.chore-card').first.click();self.page.get_by_role('button',name='Not now',exact=True).click();self.assertFalse(self.page.locator('#modal').is_visible());self.assertEqual(self.page.evaluate('JSON.parse(localStorage.getItem("pocket-stars-data")).entries.length'),0)
  self.page.screenshot(path=str(folder/'ui-child-portrait.png'),full_page=True)
  for w,h in [(1280,800),(390,844),(800,1280)]:
   self.page.set_viewport_size({'width':w,'height':h});self.assertTrue(self.page.evaluate('document.documentElement.scrollWidth <= innerWidth'))
   self.assertEqual(self.page.locator('button:visible').evaluate_all('(els)=>els.filter(e=>e.getBoundingClientRect().height<56).map(e=>e.textContent)'),[])
  self.page.set_viewport_size({'width':1280,'height':800});self.page.screenshot(path=str(folder/'ui-child-landscape.png'),full_page=True)
 def test_session_expiry_closes_parent_dialog_and_blocks_pending_action(self):
  self.setup_pin();self.unlock();self.page.locator('[data-action="fine"]').click();self.page.clock.fast_forward(121000)
  self.assertEqual(self.page.locator('.parent-page').count(),0);self.assertFalse(self.page.locator('#modal').is_visible());self.assertEqual(self.page.evaluate('JSON.parse(localStorage.getItem("pocket-stars-data")).entries.length'),0)
 def test_background_during_unlock_does_not_open_parent_area(self):
  self.setup_pin();self.page.evaluate("(()=>{const original=PinVault.unlock;PinVault.unlock=async(...args)=>{const result=await original(...args);await new Promise(r=>setTimeout(r,300));return result;};})()")
  self.page.get_by_role('button',name='Parents ⌑',exact=True).click();self.page.get_by_label('Parent PIN',exact=True).fill('8246');self.page.get_by_role('button',name='Unlock parent area').click();self.page.evaluate("window.dispatchEvent(new Event('pagehide'))");self.page.wait_for_timeout(550);self.assertEqual(self.page.locator('.parent-page').count(),0)
 def test_native_false_save_blocks_credit(self):
  self.setup_pin();self.page.evaluate("window.Android={saveData:()=> 'false'}");self.page.get_by_role('button',name='Open Rosie').click();self.page.locator('.chore-card').first.click();self.page.get_by_role('button',name='Yes, I did it!').click();self.page.get_by_text('Could not save. Nothing has changed. Please try again.',exact=True).wait_for();self.assertEqual(self.page.evaluate('JSON.parse(localStorage.getItem("pocket-stars-data")).entries.length'),0)
 def test_native_background_event_locks_and_native_back_navigates(self):
  self.setup_pin();self.unlock();self.page.locator('[data-action="fine"]').click();self.page.evaluate("document.dispatchEvent(new Event('pocketstars-background'))");self.assertEqual(self.page.locator('.parent-page').count(),0);self.assertFalse(self.page.locator('#modal').is_visible())
  self.page.get_by_role('button',name='Pocket Stars home',exact=True).click();self.page.get_by_role('button',name='Open Rosie').click();self.page.locator('.chore-card').first.click();self.page.evaluate("window.dispatchEvent(new Event('pocketstars-back'))");self.assertFalse(self.page.locator('#modal').is_visible());self.page.evaluate("window.dispatchEvent(new Event('pocketstars-back'))");self.assertEqual(self.page.locator('.kid-card').count(),2)
 def test_corrupt_pin_recovery_cannot_be_bypassed_via_home(self):
  self.setup_pin();self.page.evaluate("localStorage.setItem('pocket-stars-pin','not valid json')");self.page.reload();self.page.get_by_role('heading',name='Your data needs attention').wait_for();self.page.get_by_role('button',name='Pocket Stars home',exact=True).click();self.assertEqual(self.page.locator('.kid-card').count(),0)
 def test_corrupt_data_recovery_never_resets(self):
  self.page.evaluate("localStorage.setItem('pocket-stars-data','broken ledger')");self.page.reload();self.page.get_by_role('heading',name='Your data needs attention').wait_for();self.assertEqual(self.page.evaluate("localStorage.getItem('pocket-stars-data')"),'broken ledger')
if __name__=='__main__':unittest.main(verbosity=2)
