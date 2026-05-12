#!/usr/bin/env node
'use strict';

// Build doctor index from CSV.
// Usage: node scripts/build-index.js

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const CSV_PATH = path.join(DATA_DIR, 'doctors.csv');
const DEPT_TAGS_PATH = path.join(DATA_DIR, 'dept-tags.json');
const DOCTORS_OUT = path.join(DATA_DIR, 'doctors.json');
const INDEX_OUT = path.join(DATA_DIR, 'index.json');

// ── Tag rules (applied in order, first match wins for category assignment) ──
const TAG_RULES = [
  // { name: '标签', test: dept => boolean }
  // Order matters: more specific rules first

  // ── 口腔科 ──
  { name: '口腔科', test: d => /口腔|牙(?!龈)|正畸|唇腭裂|早矫|颌面外科|颅颌面/.test(d) },

  // ── 眼科 ──
  { name: '眼科', test: d => /眼(?!镜)/.test(d) || /近视|远视|弱视/.test(d) },

  // ── 耳鼻喉科 ──
  { name: '耳鼻喉科', test: d => /耳鼻喉|听力|鼾症|腺样体|扁桃体|耳廓|助听/.test(d) && !/眼/.test(d) },

  // ── 皮肤科 ──
  { name: '皮肤科', test: d => /皮肤(?!科 Dermat)/.test(d) || /痤疮|瘢痕|脱发|湿疹|银屑|黄褐斑|带状疱疹|黑痣|腋臭|特应性皮炎/.test(d) },

  // ── 骨科 ──
  { name: '骨科', test: d => /骨科(?!质疏松)/.test(d) || /足踝|脊柱弯曲|颈肩腰腿|生长痛|骨关节/.test(d) },

  // ── 中医科 ──
  { name: '中医科', test: d => /中医|针灸|推拿|正骨/.test(d) },

  // ── 精神心理科 ──
  { name: '精神心理科', test: d => /心理|精神|多动|抽动|孤独症|厌学|学习困难|注意缺陷|ADHD|亲子关系/.test(d) },

  // ── 康复科 ──
  { name: '康复科', test: d => /康复(?!科 D)/.test(d) || /言语训练|语言训练|物理治疗|作业治疗|感统/.test(d) },

  // ── 妇产科 ──
  { name: '妇产科', test: d => /妇[科产]|产科|乳腺|产后|围产|更年期|月经|宫颈|盆底|母乳|VBAC|臀位|葆宫/.test(d) },

  // ── 泌尿外科 ──
  { name: '泌尿外科', test: d => /泌尿|包皮|遗尿/.test(d) && !/小儿|儿童/.test(d) },

  // ── 神经科 ──
  { name: '神经科', test: d => /神经|癫痫|帕金森/.test(d) },

  // ── 内分泌科 ──
  { name: '内分泌科', test: d => /内分泌|糖尿病|甲状腺|高尿酸|痛风|代谢(?!减重)/.test(d) && !/甲状腺外科/.test(d) },

  // ── 呼吸科 ──
  { name: '呼吸科', test: d => /呼吸|哮喘|RSV|反复呼吸道/.test(d) && !/小儿|儿童/.test(d) },

  // ── 消化科 ──
  { name: '消化科', test: d => /消化(?!科 D)/.test(d) || /幽门螺杆菌/.test(d) && !/小儿|儿童/.test(d) },

  // ── 心血管科 ──
  { name: '心血管科', test: d => /心血管|心内|心律|高血压|川崎病|胸闷胸痛/.test(d) },

  // ── 整形美容科 ──
  { name: '整形美容科', test: d => /整形|美容(?!皮肤科)|医美|颜面/.test(d) },

  // ── 肿瘤科 ──
  { name: '肿瘤科', test: d => /肿瘤|癌(?!症)/.test(d) || /血液.*肿瘤|血友病/.test(d) },

  // ── 风湿免疫科 ──
  { name: '风湿免疫科', test: d => /风湿|类风湿/.test(d) },

  // ── 过敏科 ──
  { name: '过敏科', test: d => /过敏|食物过敏|过敏性/.test(d) && !/皮肤/.test(d) && !/小儿|儿童/.test(d) },

  // ── 麻醉科 ──
  { name: '麻醉科', test: d => /麻醉/.test(d) },

  // ── 外科 ──
  { name: '外科', test: d => /外科(?!科 General)/.test(d) || /肛肠|血管外科|甲状腺外科|修复重建|手指再造|手足|体表肿物/.test(d) && !/小儿|儿童/.test(d) },

  // ── 内科 ──
  { name: '内科', test: d => /内科(?!科 I)/.test(d) && !/小儿|儿童|儿内/.test(d) },

  // ── 儿童保健科 ──
  { name: '儿童保健科', test: d => /保健|预防接种|身高|矮小|性早熟|发育|喂养|营养与喂养/.test(d) && !/成人/.test(d) },

  // ── 新生儿科 ──
  { name: '新生儿科', test: d => /新生儿|早产儿/.test(d) && !/内科/.test(d) },

  // ── 营养科 ──
  { name: '营养科', test: d => /营养(?!与喂养)/.test(d) || /体重管理|减重|饮食指导|肥胖.*饮食/.test(d) },

  // ── 疼痛科 ──
  { name: '疼痛科', test: d => /疼痛/.test(d) },

  // ── 全科 ──
  { name: '全科', test: d => /全科|内科全科/.test(d) && !/小儿|儿童/.test(d) },

  // ── 儿科 (catch-all for anything with 儿/小儿/儿童/婴幼儿/学龄/青少年/青春期) ──
  { name: '儿科', test: d => /儿(?!科 Derm)|小儿|儿童|婴幼儿|学龄|青少年|青春期/.test(d) || /儿内|儿外/.test(d) },

  // ── 消化科 catch-all（二次）──
  { name: '消化科', test: d => /消化|胃|肠|便秘|幽门|萎缩|反酸|反流/.test(d) },

  // ── 血液科 → 肿瘤科 ──
  { name: '肿瘤科', test: d => /血液/.test(d) },

  // ── 细分类门诊 ──
  { name: '外科', test: d => /动物致伤/.test(d) },
  { name: '泌尿外科', test: d => /HPV/.test(d) },
  { name: '全科', test: d => /健康管理|功能医学|戒烟/.test(d) },
  { name: '儿童保健科', test: d => /体检科|体检预约/.test(d) },
  { name: '骨科', test: d => /骨质疏松|指.*趾|运动|体姿体态/.test(d) },
  { name: '神经科', test: d => /记忆力|眩晕|颅形/.test(d) },
  { name: '皮肤科', test: d => /特异性皮炎/.test(d) },
  { name: '精神心理科', test: d => /学习门诊/.test(d) },
  { name: '康复科', test: d => /语言评估/.test(d) },

  // ── 外科(成人) catch-all ──
  { name: '外科', test: d => /外[科伤]/.test(d) && !/小儿|儿童/.test(d) },
];

// ── Load CSV ──
function parseCSV(content) {
  const lines = content.trim().split('\n');
  const headers = parseCSVLine(lines[0]);
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCSVLine(lines[i]);
    if (cols.length < 7) continue;
    const row = {};
    headers.forEach((h, j) => row[h] = (cols[j] || '').trim());
    rows.push(row);
  }
  return rows;
}

function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') { current += '"'; i++; }
        else { inQuotes = false; }
      } else { current += ch; }
    } else {
      if (ch === '"') { inQuotes = true; }
      else if (ch === ',') { result.push(current); current = ''; }
      else { current += ch; }
    }
  }
  result.push(current);
  return result;
}

// ── Clean ──
function cleanCity(raw) {
  const r = raw.replace(/：.*$/, '').replace(/:.*$/, '').trim();
  const map = {
    '青岛新世纪妇儿医院': '青岛市',
  };
  return map[r] || r;
}

function cleanDept(raw) {
  let d = raw
    .replace(/\s*TCM\s*/i, '')
    .replace(/\s*Internal Medicine\s*/i, '')
    .replace(/\s*Dental\s*/i, '')
    .replace(/\s*Dermatology\s*/i, '')
    .replace(/\s*Gynecology\s*/i, '')
    .replace(/\s*General surgery\s*/i, '')
    .replace(/\s*ENT\s*/i, '')
    .replace(/\s*Ophthalmology\s*/i, '')
    .replace(/\s*Psychiatry\s*/i, '')
    .replace(/\s*Acne clinic\s*/i, '')
    .replace(/\s*Mole clinic\s*/i, '')
    .replace(/\s*\+\s*$/, '')
    .replace(/\s*-\s*$/, '')

  // Truncate overly long dept names with parenthetical descriptions
  // e.g. "妇科肿瘤 （卵巢癌、宫颈癌）手术，放疗" → "妇科肿瘤"
  const parenIdx = d.indexOf('（');
  if (parenIdx > 0) d = d.substring(0, parenIdx);

  // Truncate at first comma/semicolon if still too long (>20 chars)
  if (d.length > 20) {
    const commaIdx = Math.min(
      d.indexOf('，') > 0 ? d.indexOf('，') : Infinity,
      d.indexOf(',') > 0 ? d.indexOf(',') : Infinity
    );
    if (commaIdx < Infinity) d = d.substring(0, commaIdx);
  }

  // Truncate at "手术"/"治疗" if still too long
  if (d.length > 20) {
    d = d.replace(/[，,]\s*(手术|放疗|化疗|综合治疗|微创|诊断|诊治).*$/, '');
  }

  return d.trim();
}

function parseFee(raw) {
  if (!raw) return { low: 0, high: 0 };

  // Handle text-based fees: "首诊1600，复诊1000" / "首诊 ¥1,600 / 复诊 ¥1,000"
  const textMatch = raw.match(/[\d,]+/g);
  if (textMatch && raw.match(/首诊|复诊|初诊/)) {
    const nums = textMatch.map(s => parseInt(s.replace(/,/g, ''))).filter(n => n > 0);
    if (nums.length >= 2) return { low: Math.min(...nums), high: Math.max(...nums) };
    if (nums.length === 1) return { low: nums[0], high: nums[0] };
  }

  const cleaned = raw.replace(/[¥,\s]/g, '');
  if (cleaned.includes('-')) {
    const parts = cleaned.split('-');
    return { low: parseInt(parts[0]) || 0, high: parseInt(parts[1]) || 0 };
  }
  const n = parseInt(cleaned) || 0;
  return { low: n, high: n };
}

function parseTitle(raw) {
  if (!raw) return { title: '', bilingual: false };
  const bilingual = /双语/.test(raw);
  let title = raw.replace(/\s*·\s*双语\s*/, '').replace(/\s*bilingual\s*/i, '').trim();

  // Normalize shortened titles from experts.json merge
  const titleMap = {
    '主任': '主任医师', '副主任': '副主任医师', '主治': '主治医师',
    '资深': '资深医师', '执业': '执业医师', '住院': '住院医师',
  };
  if (titleMap[title]) title = titleMap[title];

  return { title, bilingual };
}

function extractSkillShort(skill) {
  if (!skill) return '';
  return skill.replace(/\n/g, ' ').substring(0, 120).trim();
}

// ── Tag assignment ──
function assignTags(deptRaw) {
  const tags = [];
  for (const rule of TAG_RULES) {
    if (rule.test(deptRaw)) {
      if (!tags.includes(rule.name)) tags.push(rule.name);
      if (tags.length >= 3) break; // max 3 tags per dept
    }
  }
  return tags.length > 0 ? tags : ['其他'];
}

// ── Title rank (for sorting) ──
const TITLE_RANK = {
  '主任医师': 1, '副主任医师': 2, '主治医师': 3, '资深医师': 4,
  '教授': 5, '副教授': 6, '执业医师': 7, '住院医师': 8,
};
function titleRank(title) {
  for (const [k, v] of Object.entries(TITLE_RANK)) {
    if (title.startsWith(k)) return v;
  }
  return 9;
}

// ── Main ──
function main() {
  console.log('Reading CSV...');
  let csv = fs.readFileSync(CSV_PATH, 'utf-8');
  // Strip BOM if present
  if (csv.charCodeAt(0) === 0xFEFF) csv = csv.slice(1);
  const rows = parseCSV(csv);
  console.log(`Parsed ${rows.length} rows`);

  // Build dept → tags map
  const deptTagMap = {};
  const deptSet = new Set();

  const doctors = [];
  for (const row of rows) {
    const deptRaw = cleanDept(row['科室'] || '');
    deptSet.add(deptRaw);

    const city = cleanCity(row['城市'] || '');
    const { title, bilingual } = parseTitle(row['职称'] || '');
    const fee = parseFee(row['挂号费'] || '');
    const doctor = {
      name: (row['姓名'] || '').trim(),
      city,
      dept: deptRaw,
      title,
      bilingual,
      main_hospital: (row['主执业医院'] || '').trim(),
      hospital: (row['出诊医院'] || row['主执业医院'] || '').trim(),
      fee_low: fee.low,
      fee_high: fee.high,
      schedule: (row['出诊时间'] || '').trim(),
      skill_short: extractSkillShort(row['专业特长'] || ''),
      source_url: (row['信息来源网址'] || '').trim(),
    };
    if (!doctor.name || !doctor.city) continue;

    // Assign tags
    const tags = assignTags(deptRaw);
    doctor.tags = tags;
    for (const t of tags) {
      if (!deptTagMap[deptRaw]) deptTagMap[deptRaw] = [];
      if (!deptTagMap[deptRaw].includes(t)) deptTagMap[deptRaw].push(t);
    }
    doctors.push(doctor);
  }

  // Write dept-tags.json
  const sortedDeptTags = {};
  for (const dept of [...deptSet].sort()) {
    sortedDeptTags[dept] = deptTagMap[dept] || ['其他'];
  }
  fs.writeFileSync(DEPT_TAGS_PATH, JSON.stringify(sortedDeptTags, null, 2));
  console.log(`Wrote dept-tags.json (${Object.keys(sortedDeptTags).length} departments)`);

  // Check for untagged
  const untagged = Object.entries(sortedDeptTags).filter(([, t]) => t[0] === '其他');
  if (untagged.length > 0) {
    console.log(`⚠ ${untagged.length} untagged departments:`);
    untagged.forEach(([d]) => console.log('  -', d));
  }

  // Write doctors.json
  fs.writeFileSync(DOCTORS_OUT, JSON.stringify(doctors, null, 2));
  console.log(`Wrote doctors.json (${doctors.length} doctors)`);

  // Build city+tag index
  const index = {};
  for (const d of doctors) {
    const key = d.city;
    if (!index[key]) index[key] = {};
    for (const t of d.tags) {
      if (!index[key][t]) index[key][t] = [];
      index[key][t].push(d);
    }
  }
  fs.writeFileSync(INDEX_OUT, JSON.stringify(index, null, 2));
  console.log('Wrote index.json');

  // Stats
  const allTags = new Set();
  doctors.forEach(d => d.tags.forEach(t => allTags.add(t)));
  console.log(`\nStats:`);
  console.log(`  Doctors: ${doctors.length}`);
  console.log(`  Cities: ${Object.keys(index).join(', ')}`);
  console.log(`  Tags: ${[...allTags].sort().join(', ')}`);
  console.log(`  Departments: ${deptSet.size}`);
}

main();
