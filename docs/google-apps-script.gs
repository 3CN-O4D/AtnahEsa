/**
 * AseHanta → Google Sheet web app (doPost).
 *
 * Paste this into Extensions → Apps Script in the spreadsheet, save, then
 * Deploy → Manage deployments → Edit → Version "New version".
 *
 * Set the Script Property SHEET_WEBHOOK_KEY to the same key the website uses
 * (Apps Script editor → Project Settings → Script properties). This replaces
 * the old doPost that returned "duplicate"; existing rows are now updated.
 */

var SHEET_NAME = 'Sheet1'; // change to your tab name, or leave blank for the active tab
var KEY_PROPERTY = 'SHEET_WEBHOOK_KEY';

// The original payload columns first, then the lifecycle fields.
var COLUMNS = [
  'websiteListingId', 'websiteLink', 'areaName', 'propertyName', 'location',
  'mapsLink', 'landlordName', 'phone', 'email', 'unitType', 'rent', 'deposit',
  'dateAvailable',
  'event', 'status', 'releaseStatus', 'bookingStatus', 'bookingId',
  'amountPaid', 'paymentReceipt', 'payoutAmount', 'payoutReceipt', 'payoutDate',
  'refundAmount', 'refundReceipt', 'refundDate', 'heldUntil', 'paidAt', 'notes',
  'createdAt', 'updatedAt'
];

function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
    var data = JSON.parse(e && e.postData && e.postData.contents || '{}');
    var expected = PropertiesService.getScriptProperties().getProperty(KEY_PROPERTY);
    if (!expected || String(data.key || '') !== expected) {
      return respond({ ok: false, error: 'invalid key' });
    }
    var id = String(data.websiteListingId || '').trim();
    if (!id) return respond({ ok: false, error: 'websiteListingId is required' });

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = SHEET_NAME ? ss.getSheetByName(SHEET_NAME) : ss.getActiveSheet();
    if (!sheet) sheet = ss.insertSheet(SHEET_NAME || 'Listings');

    ensureHeaders(sheet);
    var headers = getHeaders(sheet);
    var col = {};
    headers.forEach(function (name, i) { if (name) col[name] = i + 1; });

    var lastRow = Math.max(sheet.getLastRow(), 1);
    var row = 0;
    if (lastRow > 1) {
      var ids = sheet.getRange(2, col['websiteListingId'], lastRow - 1, 1).getDisplayValues();
      for (var i = 0; i < ids.length; i++) {
        if (String(ids[i][0]).trim() === id) { row = i + 2; break; }
      }
    }

    if (row) {
      // Present fields only: an event post should not blank older columns.
      Object.keys(col).forEach(function (name) {
        if (name === 'websiteListingId' || name === 'key') return;
        if (Object.prototype.hasOwnProperty.call(data, name)) {
          sheet.getRange(row, col[name]).setValue(cellValue(data[name]));
        }
      });
      if (col['updatedAt']) sheet.getRange(row, col['updatedAt']).setValue(new Date());
      return respond({ ok: true, status: 'updated' });
    }

    var values = new Array(sheet.getLastColumn()).fill('');
    Object.keys(col).forEach(function (name) {
      if (name === 'websiteListingId') values[col[name] - 1] = id;
      else if (name === 'createdAt' || name === 'updatedAt') values[col[name] - 1] = new Date();
      else if (Object.prototype.hasOwnProperty.call(data, name)) values[col[name] - 1] = cellValue(data[name]);
    });
    sheet.appendRow(values);
    return respond({ ok: true, status: 'added' });
  } catch (err) {
    return respond({ ok: false, error: String(err && err.message || err) });
  } finally {
    lock.releaseLock();
  }
}

function respond(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function getHeaders(sheet) {
  if (sheet.getLastRow() < 1) return [];
  return sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), 1))
    .getDisplayValues()[0]
    .map(function (value) { return String(value || '').trim(); });
}

function ensureHeaders(sheet) {
  var headers = getHeaders(sheet);
  if (!headers.length) {
    sheet.getRange(1, 1, 1, COLUMNS.length).setValues([COLUMNS]);
    return;
  }
  var missing = COLUMNS.filter(function (name) { return headers.indexOf(name) === -1; });
  if (missing.length) {
    sheet.getRange(1, headers.length + 1, 1, missing.length).setValues([missing]);
  }
}

function cellValue(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value).slice(0, 50000);
}
