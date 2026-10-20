# Tick Tale Loyalty Card setup

Files:
- `tick-tale-loyalty.html` — the current Tick Tale website with the loyalty card added.
- `Code.gs` — Google Apps Script backend.
- `Customers.csv` and `Purchases.csv` — starter sheet headers.

## 1. Create the private Google Sheet
1. Create a new Google Sheet. Keep its sharing restricted; do not publish it to the web.
2. Extensions → Apps Script. Paste `Code.gs` into the editor, save.
3. Select `initializeLoyaltySheets` and Run. Approve the requested permissions. This creates `Customers` and `Purchases`.
4. The `Customers` columns are `phone`, `name`, `pin_hash`, `active`. The `Purchases` columns are `phone`, `date`, `order_id`, `products`, `total`, `status`. Use status `completed` for a valid purchase; `cancelled` or `refunded` rows are excluded.

## 2. Add a customer and set their 6-digit code
1. In `Customers`, add their phone (preferably Egypt format `01xxxxxxxxx`), name, leave `pin_hash` blank, and set `active` to `active`.
2. In Apps Script, run `setCustomerPin('01012345678','483921')` after replacing both example values. The script stores only a salted/peppered SHA-256 hash, not the PIN itself. Do not put the PIN in a sheet cell. Give the PIN to the customer privately.
3. Add each purchase as a row in `Purchases`, with the same phone format, date, order ID, products, total, and status `completed`. One row = one purchase/stamp.

## 3. Deploy the backend
1. Apps Script → Deploy → New deployment → select type **Web app**.
2. Execute as: **Me**. Who has access: **Anyone** (the web app needs to accept customer requests without Google sign-in).
3. Deploy and copy the Web app URL ending in `/exec`. Do not share the Apps Script editor or Sheet.
4. In `tick-tale-loyalty.html`, find `const LOYALTY_WEB_APP_URL = 'PASTE_YOUR_GOOGLE_APPS_SCRIPT_WEB_APP_URL_HERE';` and replace the placeholder with the deployed URL.
5. Upload this HTML as your GitHub Pages `index.html` (or copy the loyalty section/CSS/JS into your existing `index.html`). Keep your other site files as they are.

## 4. Verify
- Add a test customer and set a test PIN via `setCustomerPin`.
- Add 2–3 purchase rows for that phone.
- Open the published website, go to Loyalty Card, enter phone + PIN. You should see glowing crowns, purchase count and purchase history.
- Check wrong PIN, inactive customer, no purchases, and mobile layout.

## Important security notes
- A six-digit PIN is less secure than SMS OTP. This script hashes it, returns only the matched customer's records, uses generic login errors, and throttles repeated failed attempts by phone for 15 minutes. It is still a lightweight loyalty feature, not a bank-grade authentication system. For stronger protection add CAPTCHA and a proper rate limit / OTP provider.
- Apps Script web apps with public access can be called outside your site; GitHub Pages itself cannot keep secrets. Never put a private API key or the sheet ID/credentials in client-side JavaScript.
- Anyone who knows both a customer's phone and PIN can view their loyalty history. Issue codes privately and support changing/revoking them by running `setCustomerPin` again or setting `active` to `inactive`.
- Each purchase row counts as one stamp. This implementation shows 0–6 stamps on the current card and keeps total purchase count separately. After 6 purchases, the card shows all six stamps and the reward unlocked; if you want subsequent cards to reset to 0 after each reward, decide how rewards/redemptions should be recorded before launch.
- Update the Apps Script deployment after backend code changes (Deploy → Manage deployments → Edit → New version).
