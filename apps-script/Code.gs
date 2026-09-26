/**
 * Ratings pipeline for the "What should I teach next?" form.
 *
 *   form (/next/)  --POST-->  this web app  -->  Google Sheet (one row per phone)
 *   results page (/results/)  --GET-->  this web app  -->  averages + star counts
 *
 * Deploy: Deploy > New deployment > Web app, Execute as: Me, Who has access: Anyone.
 * Paste the /exec URL into apps-script/endpoint.txt and run ./build.sh.
 * The sheet is created on first use; its link is logged by setup().
 */
var TOPICS = ['peptides', 'skincare', 'peds', 'height'];
var HEADER = ['updated', 'client', 'peptides', 'skincare', 'peds', 'height'];

function sheet_() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('SHEET_ID');
  if (id) return SpreadsheetApp.openById(id).getSheets()[0];
  var ss = SpreadsheetApp.create('What should I teach next? (ratings)');
  var sh = ss.getSheets()[0];
  sh.setName('ratings');
  sh.appendRow(HEADER);
  sh.setFrozenRows(1);
  props.setProperty('SHEET_ID', ss.getId());
  return sh;
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

// One row per phone: a resubmission from the same phone ("Change my ratings") overwrites its row.
function doPost(e) {
  var d;
  try { d = JSON.parse(e.postData.contents); } catch (err) { return json_({ ok: false, error: 'bad json' }); }
  var client = String(d.client || '');
  if (!/^[A-Za-z0-9-]{8,48}$/.test(client)) return json_({ ok: false, error: 'bad client' });
  var r = d.ratings || {};
  var vals = TOPICS.map(function (t) {
    var v = Number(r[t]);
    return v >= 1 && v <= 5 && Math.floor(v) === v ? v : '';
  });
  if (vals.every(function (v) { return v === ''; })) return json_({ ok: false, error: 'empty' });

  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var sh = sheet_();
    var row = [new Date(), client].concat(vals);
    var last = sh.getLastRow();
    var ids = last > 1 ? sh.getRange(2, 2, last - 1, 1).getValues().map(function (x) { return x[0]; }) : [];
    var at = ids.indexOf(client);
    if (at >= 0) sh.getRange(at + 2, 1, 1, row.length).setValues([row]);
    else sh.appendRow(row);
    return json_({ ok: true, updated: at >= 0 });
  } finally {
    lock.releaseLock();
  }
}

// Aggregates only: no client ids or timestamps leave the sheet.
function doGet() {
  var sh = sheet_();
  var n = Math.max(0, sh.getLastRow() - 1);
  var out = { ok: true, responses: n, topics: {}, at: new Date().toISOString() };
  TOPICS.forEach(function (t) { out.topics[t] = { count: 0, sum: 0, dist: [0, 0, 0, 0, 0] }; });
  if (n > 0) {
    sh.getRange(2, 3, n, TOPICS.length).getValues().forEach(function (row) {
      row.forEach(function (v, k) {
        if (v === '' || v === null) return;
        var T = out.topics[TOPICS[k]];
        T.count++; T.sum += v; T.dist[v - 1]++;
      });
    });
  }
  return json_(out);
}

// Run once from the editor to create the sheet and approve access.
function setup() {
  var sh = sheet_();
  Logger.log('Sheet: ' + sh.getParent().getUrl());
}
