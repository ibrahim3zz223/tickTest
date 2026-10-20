/** Tick Tale Watches — Loyalty Card backend.
 * Deploy as Web app: Execute as Me; access Anyone.
 * Do not store PINs in plain text. Run initializeLoyaltySheets() once,
 * then setCustomerPin(phone, sixDigitPin) from the Apps Script editor for each customer.
 */
const CUSTOMER_SHEET = 'Customers';
const PURCHASE_SHEET = 'Purchases';
const STAMPS_PER_REWARD = 6;

function initializeLoyaltySheets() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let customers = ss.getSheetByName(CUSTOMER_SHEET) || ss.insertSheet(CUSTOMER_SHEET);
  let purchases = ss.getSheetByName(PURCHASE_SHEET) || ss.insertSheet(PURCHASE_SHEET);
  if (customers.getLastRow() === 0) customers.appendRow(['phone', 'name', 'pin_hash', 'active']);
  if (purchases.getLastRow() === 0) purchases.appendRow(['phone', 'date', 'order_id', 'products', 'total', 'status']);
  customers.setFrozenRows(1); purchases.setFrozenRows(1);
  customers.getRange(1,1,1,4).setFontWeight('bold'); purchases.getRange(1,1,1,6).setFontWeight('bold');
  customers.setColumnWidths(1,4,160); purchases.setColumnWidths(1,6,150);
  SpreadsheetApp.getUi().alert('Loyalty sheets are ready. Keep this spreadsheet private.');
}

function doPost(e) {
  const p = (e && e.parameter) || {};
  const requestId = String(p.requestId || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0,100);
  let response;
  try {
    if (String(p.action || '') !== 'lookup') throw new Error('Invalid request.');
    response = lookupCustomer_(String(p.phone || ''), String(p.pin || ''));
  } catch (err) {
    // Keep messages generic so the endpoint does not reveal whether a phone exists.
    response = {ok:false, message: err && err.publicMessage ? err.publicMessage : 'Could not verify those details. Check your phone and code.'};
  }
  const payload = JSON.stringify(Object.assign({requestId:requestId}, response)).replace(/</g,'\\u003c');
  const html = '<!doctype html><meta charset="utf-8"><script>parent.postMessage(' + payload + ', "*");<\/script>';
  return HtmlService.createHtmlOutput(html).setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function lookupCustomer_(phoneInput, pin) {
  const phone = normalizePhone_(phoneInput);
  if (!phone || !/^\d{6}$/.test(pin)) throw new Error('Invalid details');
  const cache = CacheService.getScriptCache();
  const key = 'fail_' + digest_(phone);
  const failures = Number(cache.get(key) || 0);
  if (failures >= 8) throw new Error('Too many attempts');
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(CUSTOMER_SHEET);
  const purchasesSheet = ss.getSheetByName(PURCHASE_SHEET);
  if (!sheet || !purchasesSheet) throw new Error('Setup incomplete');
  const rows = sheet.getDataRange().getDisplayValues();
  const idx = rows.findIndex((r,i)=>i>0 && normalizePhone_(r[0])===phone);
  if (idx < 1) { cache.put(key, String(failures+1), 900); throw new Error('Invalid details'); }
  const row = rows[idx];
  if (String(row[3] || 'active').toLowerCase() === 'false' || String(row[3] || 'active').toLowerCase() === 'inactive') throw new Error('Invalid details');
  const expected = String(row[2] || '').trim();
  const actual = pinHash_(phone, pin);
  if (!expected || !constantTimeEqual_(expected, actual)) { cache.put(key, String(failures+1), 900); throw new Error('Invalid details'); }
  cache.remove(key);

  const purchaseRows = purchasesSheet.getDataRange().getValues();
  const matches = purchaseRows.slice(1).filter(r => normalizePhone_(r[0]) === phone && String(r[5] || 'completed').toLowerCase() !== 'cancelled' && String(r[5] || 'completed').toLowerCase() !== 'refunded');
  matches.sort((a,b)=>new Date(b[1]).getTime()-new Date(a[1]).getTime());
  const purchases = matches.slice(0,30).map(r=>({date:formatDate_(r[1]),orderId:String(r[2]||''),products:String(r[3]||'Purchase'),total:String(r[4]||'')}));
  return {ok:true, data:{name:String(row[1]||'Tick Tale Customer'),purchaseCount:matches.length,stampCount:matches.length % STAMPS_PER_REWARD || (matches.length>0 && matches.length % STAMPS_PER_REWARD===0 ? STAMPS_PER_REWARD : 0),purchases:purchases}};
}

/** Run manually from Apps Script editor. Example: setCustomerPin('01012345678','483921') */
function setCustomerPin(phoneInput, sixDigitPin) {
  const phone = normalizePhone_(phoneInput);
  const pin = String(sixDigitPin || '').trim();
  if (!phone || !/^\d{6}$/.test(pin)) throw new Error('Provide a valid phone and exactly 6 digits.');
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CUSTOMER_SHEET);
  if (!sheet) throw new Error('Run initializeLoyaltySheets() first.');
  const rows = sheet.getDataRange().getDisplayValues();
  let rowIndex = rows.findIndex((r,i)=>i>0 && normalizePhone_(r[0])===phone);
  if (rowIndex < 1) { sheet.appendRow([phone,'',pinHash_(phone,pin),'active']); }
  else { sheet.getRange(rowIndex+1,3).setValue(pinHash_(phone,pin)); if (!rows[rowIndex][3]) sheet.getRange(rowIndex+1,4).setValue('active'); }
  return 'PIN hash saved for ' + phone;
}

/** Optional helper for testing without exposing customer data. */
function testLoyaltySetup() {
  const ss=SpreadsheetApp.getActiveSpreadsheet();
  if (!ss.getSheetByName(CUSTOMER_SHEET) || !ss.getSheetByName(PURCHASE_SHEET)) throw new Error('Run initializeLoyaltySheets() first.');
  Logger.log('Both required sheets exist.');
}
function pinHash_(phone,pin) {
  const props=PropertiesService.getScriptProperties();
  let pepper=props.getProperty('LOYALTY_PEPPER');
  if (!pepper) { pepper=Utilities.getUuid()+Utilities.getUuid()+Utilities.getUuid(); props.setProperty('LOYALTY_PEPPER',pepper); }
  const bytes=Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, phone+':'+pin+':'+pepper, Utilities.Charset.UTF_8);
  return bytes.map(b=>('0'+((b+256)%256).toString(16)).slice(-2)).join('');
}
function normalizePhone_(value) { return String(value||'').replace(/[^0-9]/g,'').replace(/^002/,'').replace(/^20(?=1[0125]\d{8}$)/,'0'); }
function digest_(value) { const b=Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,String(value),Utilities.Charset.UTF_8); return b.map(x=>('0'+((x+256)%256).toString(16)).slice(-2)).join(''); }
function constantTimeEqual_(a,b) { if (a.length!==b.length) return false; let x=0; for(let i=0;i<a.length;i++) x |= a.charCodeAt(i)^b.charCodeAt(i); return x===0; }
function formatDate_(value) { if (!value) return ''; const d = value instanceof Date ? value : new Date(value); return isNaN(d.getTime()) ? String(value) : Utilities.formatDate(d, Session.getScriptTimeZone() || 'Africa/Cairo', 'yyyy-MM-dd'); }
