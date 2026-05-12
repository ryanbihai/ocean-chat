#!/usr/bin/env node
'use strict';

// OceanBus Yellow Pages service for doctor data.
// First run: node scripts/build-index.js (one-time, re-run when CSV updates)
// Then:      node scripts/register.js (one-time)
// Then:      node scripts/serve.js (long-running)

const { createOceanBus } = require('oceanbus');
const fs = require('fs');
const path = require('path');
const os = require('os');

const CRED_DIR = path.join(os.homedir(), '.oceanbus-doctor-data');
const CRED_FILE = path.join(CRED_DIR, 'credentials.json');
const APP_DATA = path.join(__dirname, '..', 'data');
const DOCTORS_FILE = path.join(APP_DATA, 'doctors.json');
const DEPT_TAGS_FILE = path.join(APP_DATA, 'dept-tags.json');

const MAX_RESULTS = 30;
const TITLE_RANK = { '主任医师': 1, '副主任医师': 2, '主治医师': 3, '资深医师': 4, '教授': 5, '副教授': 6, '执业医师': 7, '住院医师': 8 };

let doctors = [];
let deptTags = {};
let allDepts = [];
let allCities = [];

function loadData() {
  doctors = JSON.parse(fs.readFileSync(DOCTORS_FILE, 'utf-8'));
  deptTags = JSON.parse(fs.readFileSync(DEPT_TAGS_FILE, 'utf-8'));
  allDepts = [...new Set(Object.values(deptTags).flat())].sort();
  allCities = [...new Set(doctors.map(d => d.city))].sort();
}

function loadCredentials() {
  try {
    if (fs.existsSync(CRED_FILE)) return JSON.parse(fs.readFileSync(CRED_FILE, 'utf-8'));
  } catch (_) {}
  return null;
}

function rankTitle(title) {
  for (const [k, v] of Object.entries(TITLE_RANK)) {
    if (title.startsWith(k)) return v;
  }
  return 9;
}

function searchDoctors(city, depts, keyword) {
  // Validate dept names — reject if none are valid
  const validDepts = depts.filter(d => allDepts.includes(d));
  if (validDepts.length === 0) {
    return { total: 0, returned: 0, truncated: false, results: [], error: 'No valid department names. Use list_depts to see available departments.' };
  }

  // Fuzzy city match — "北京" matches "北京市"
  let results = doctors.filter(d => d.city.includes(city) || city.includes(d.city));
  if (results.length === 0) return { total: 0, returned: 0, truncated: false, results: [] };

  // Filter by department tags
  results = results.filter(d => d.tags.some(t => validDepts.includes(t)));

  // Filter by keyword (in dept, skill_short, name)
  if (keyword) {
    const kw = keyword.toLowerCase();
    results = results.filter(d =>
      d.dept.toLowerCase().includes(kw) ||
      d.skill_short.toLowerCase().includes(kw) ||
      d.name.toLowerCase().includes(kw)
    );
  }

  // Sort: title rank first, then fee descending (better doctors first)
  results.sort((a, b) => {
    const tr = rankTitle(a.title) - rankTitle(b.title);
    if (tr !== 0) return tr;
    return b.fee_high - a.fee_high;
  });

  const total = results.length;
  const truncated = total > MAX_RESULTS;
  if (truncated) results = results.slice(0, MAX_RESULTS);

  return {
    city,
    depts: depts || [],
    total,
    returned: results.length,
    truncated,
    results: results.map(d => ({
      name: d.name,
      dept: d.dept,
      title: d.title,
      bilingual: d.bilingual || false,
	      main_hospital: d.main_hospital || '',
      hospital: d.hospital,
      fee_low: d.fee_low,
      fee_high: d.fee_high,
      schedule: d.schedule,
      skill_short: d.skill_short,
      tags: d.tags,
    })),
  };
}

async function main() {
  const creds = loadCredentials();
  if (!creds) {
    console.error('Not registered. Run: node scripts/register.js');
    process.exit(1);
  }

  loadData();
  console.log(`[doctor-data] Loaded ${doctors.length} doctors, ${allDepts.length} dept tags, ${allCities.length} cities`);

  const ob = await createOceanBus({
    keyStore: { type: 'memory' },
    identity: { agent_id: creds.agent_id, api_key: creds.api_key },
  });

  const key = await ob.createServiceKey();
  ob.l1.yellowPages.setIdentity(creds.openid, key.signer, key.publicKey);
  ob.l1.yellowPages.startHeartbeat({ intervalMs: 5 * 60 * 1000 });

  console.log('[doctor-data] Listening on OceanBus...');
  console.log('  OpenID:', creds.openid.slice(0, 16) + '...');

  ob.startListening(async (msg) => {
    try {
      let request;
      try { request = JSON.parse(msg.content); }
      catch {
        await ob.sendJson(msg.from_openid, {
          error: 'Invalid request. Send JSON: { "action": "list_depts" } or { "action": "search", "city": "...", "depts": [...] }'
        });
        return;
      }

      switch (request.action) {
        case 'list_depts':
          await ob.sendJson(msg.from_openid, { depts: allDepts });
          console.log('  → list_depts to', msg.from_openid.slice(0, 12) + '...');
          break;

        case 'list_cities':
          await ob.sendJson(msg.from_openid, { cities: allCities });
          console.log('  → list_cities to', msg.from_openid.slice(0, 12) + '...');
          break;

        case 'search': {
          const { city, depts, keyword } = request;
          if (!city) {
            await ob.sendJson(msg.from_openid, { error: 'Missing required field: city' });
            return;
          }
          if (!depts || !Array.isArray(depts) || depts.length === 0) {
            await ob.sendJson(msg.from_openid, { error: 'Missing required field: depts (non-empty array)' });
            return;
          }
          const result = searchDoctors(city, depts, keyword || null);
          await ob.sendJson(msg.from_openid, result);
          console.log(`  → search ${city}/${depts.join(',')}: ${result.returned}/${result.total}${result.truncated ? ' (truncated)' : ''} to ${msg.from_openid.slice(0, 12)}...`);
          break;
        }

        default:
          await ob.sendJson(msg.from_openid, {
            error: `Unknown action: ${request.action}. Available: list_depts, list_cities, search`
          });
      }
    } catch (e) {
      console.error('  Error:', e.message);
      try { await ob.sendJson(msg.from_openid, { error: 'Internal error: ' + e.message }); } catch (_) {}
    }
  });

  await new Promise(() => {});
}

main().catch(err => { console.error('Fatal:', err.message); process.exit(1); });
