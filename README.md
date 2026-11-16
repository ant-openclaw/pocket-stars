# Pocket Stars

An offline Android pocket-money tracker built for Rosie and Jake.

## On the tablet

Open **Pocket Stars** (not the temporary QA copy). A parent chooses a private **4–8 digit PIN** on first launch. There is no default code and no code needs to be shared with the developer.

- Choose Rosie or Jake, tap a finished job, then confirm. “Tidied room” starts at **50p**.
- The home screen cards show each child’s **Unpaid balance** (everything still owed, including older weeks) and **This week** (Monday–Sunday net in Europe/London). Monday does not erase unpaid money.
- Each child’s star board keeps compact repeatable chore buttons and a single **Add a fine** button, followed by a read-only **Recent activity** list of the latest five chores/fines for that child (newest first, with date/time, amount and any undone/settled status). Full history and corrections stay in the parent area. No balance or weekly summary is shown on the star board.
- Chores can be recorded as many times as needed, including several times on the same day.
- Fines are not separate categories: tapping **Add a fine** asks for the parent PIN and lets the parent enter the exact fine amount in pounds.
- The starter chores are examples; edit or disable those that do not suit your family.

## Parent controls

Tap **Parents** and enter the PIN.

- **Balances & activity:** select the child, view their unpaid balance and weekly breakdown, add a fine (parent sets the amount), undo any unpaid mistaken entry (keeping an audit record), or settle the balance.
- **Jobs:** create and edit chore names and amounts, and disable unwanted items. All chores are repeatable. Historical transactions keep the original name and amount.
- **Settle balance:** record that you paid the child. The outstanding total becomes zero; history is retained. This does not transfer actual money. Each child is settled separately.
- Negative balances are allowed. **Clear debt** explicitly forgives a negative balance and records a £0 payment; it never creates a negative payout.
- **PIN & backup:** change the PIN or export the ledger as a JSON document using Android’s save picker. The backup does not contain the PIN. In-app restore is not included in v1.
- Parent access locks when the app is backgrounded or after the session expires (up to two minutes). Five incorrect PIN guesses cause a 30-second lockout.

## Data and safety

No account, subscription, network connection or server is required. The app has **no Internet permission**. Data lives in private app storage and is saved atomically. PINs are stored only as salted PBKDF2-SHA256 verifiers, not plaintext. The release app disables WebView debugging and blocks external navigation.

Do not clear Android app storage or uninstall if you want to keep records. Updating with the same signing key preserves app data. Export backups regularly. There is no in-app forgotten-PIN reset in v1. This is a household PIN gate, not a tamper-proof kiosk; a person with privileged access to the unlocked tablet can bypass ordinary app security.

## Project and build

Source: `/home/julia/workspace/pocket-stars/`

Signed APK: `dist/pocket-stars.apk`

Build (portable JDK/SDK included locally; no Gradle or system package installation):

```sh
./tools/build-apk.sh
```

Keep `tools/signing/pocket-stars.jks` safe: it is needed to install updates without uninstalling the existing app. It uses a local-development signing identity, separate from the parent PIN.

Install/update over authorised USB:

```sh
/home/julia/workspace/lenovo-tb328fu-lineageos/tools/platform-tools/adb -s HGT7CR29 install --no-incremental -r dist/pocket-stars.apk
```

Unit tests:

```sh
node --test tests/core.test.js tests/pin.test.js tests/edge.test.js
```

Browser interaction tests (existing local Chrome and project test venv):

```sh
/home/julia/.hermes/workspace/pocket-stars/ui-venv/bin/python tests/ui.test.py
```

Connected-device installation smoke test:

```sh
node --test tests/device.test.js
```

The `web/` directory is bundled into a small native Java WebView shell. Android native file persistence and PIN derivation are exposed only to bundled local assets. All GBP calculations use integer pence.
