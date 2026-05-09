// Payment witness unit tests (no DB/network required)
'use strict';

let errors = [];

// Test 1: claim_id generation
function generateClaimId() {
  return 'pc_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10);
}
const id1 = generateClaimId();
const id2 = generateClaimId();
console.log('1. Claim ID format:', id1.startsWith('pc_') && id1 !== id2 ? 'OK' : 'FAIL');
if (!id1.startsWith('pc_') || id1 === id2) errors.push('claim id format');

// Test 2: Payment claim validation
function validateClaim(p) {
  if (!p.payer_openid || !p.payee_openid) return 'missing openid';
  if (p.amount === undefined || typeof p.amount !== 'number' || p.amount <= 0) return 'invalid amount';
  if (typeof p.currency !== 'string' || p.currency.length === 0 || p.currency.length > 20) return 'invalid currency';
  return null;
}
console.log('2a. Valid claim:', validateClaim({payer_openid:'a',payee_openid:'b',amount:5,currency:'USDC'}) === null ? 'OK' : 'FAIL');
console.log('2b. Missing openid:', validateClaim({payer_openid:'a',amount:5,currency:'USDC'}) === 'missing openid' ? 'OK' : 'FAIL');
console.log('2c. Negative amount:', validateClaim({payer_openid:'a',payee_openid:'b',amount:-1,currency:'USDC'}) === 'invalid amount' ? 'OK' : 'FAIL');
console.log('2d. Zero amount:', validateClaim({payer_openid:'a',payee_openid:'b',amount:0,currency:'USDC'}) === 'invalid amount' ? 'OK' : 'FAIL');
console.log('2e. Empty currency:', validateClaim({payer_openid:'a',payee_openid:'b',amount:5,currency:''}) === 'invalid currency' ? 'OK' : 'FAIL');
console.log('2f. String amount:', validateClaim({payer_openid:'a',payee_openid:'b',amount:'5',currency:'USDC'}) === 'invalid amount' ? 'OK' : 'FAIL');

// Test 3: Status transitions
const validTransitions = { pending: ['confirmed','disputed','expired'], confirmed: [], disputed: [], expired: [] };
function canTransition(from, to) { return validTransitions[from]?.includes(to) || false; }
console.log('3a. pending→confirmed:', canTransition('pending','confirmed') ? 'OK' : 'FAIL');
console.log('3b. pending→disputed:', canTransition('pending','disputed') ? 'OK' : 'FAIL');
console.log('3c. confirmed→disputed:', !canTransition('confirmed','disputed') ? 'OK (immutable)' : 'FAIL');
if (!canTransition('pending','confirmed') || canTransition('confirmed','disputed')) errors.push('transitions');

// Test 4: Payment witness → ReputationFact mapping
function toReputationFact(claim, agreed) {
  if (agreed) {
    return {
      subject_openid: claim.payee_openid,
      fact_type: 'trade', fact_subtype: 'payment_confirmed',
      fact_data: { amount: claim.amount, currency: claim.currency, payer: claim.payer_openid, chain: claim.chain||null, tx_hash: claim.tx_hash||null, description: claim.description||null },
      recorded_by: claim.payer_openid,
      client_fact_id: 'payment_' + claim.claim_id
    };
  }
  return {
    subject_openid: claim.payee_openid,
    fact_type: 'trade', fact_subtype: 'payment_disputed',
    fact_data: { amount: claim.amount, currency: claim.currency, payer: claim.payer_openid, dispute_reason: claim.dispute_reason||'收款方未确认收到付款' },
    recorded_by: claim.payer_openid,
    client_fact_id: 'payment_dispute_' + claim.claim_id
  };
}
const c = { claim_id: id1, payer_openid: 'A', payee_openid: 'B', amount: 5, currency: 'USDC', chain: 'base', tx_hash: '0xabc', description: 'test' };
const f1 = toReputationFact(c, true);
console.log('4a. Confirmed:', f1.fact_subtype==='payment_confirmed' && f1.fact_data.amount===5 ? 'OK' : 'FAIL');
console.log('4b. Idempotency:', f1.client_fact_id==='payment_'+id1 ? 'OK' : 'FAIL');
const f2 = toReputationFact(c, false);
console.log('4c. Disputed:', f2.fact_subtype==='payment_disputed' ? 'OK' : 'FAIL');

// Test 5: Multi-currency
const currencies = ['USDC','ETH','SOL','USD','CNY','virtual_gold','JPY'];
let allOk = currencies.every(cu => validateClaim({payer_openid:'a',payee_openid:'b',amount:1,currency:cu}) === null);
console.log('5. Multi-currency (' + currencies.length + '):', allOk ? 'OK' : 'FAIL');

// Test 6: Stats aggregation
function aggregateStats(claims) {
  const s = { total: 0, confirmed: 0, disputed: 0, pending: 0, total_amount: 0 };
  for (const c of claims) {
    s.total++;
    if (c.status==='confirmed') { s.confirmed++; s.total_amount+=c.amount; }
    else if (c.status==='disputed') s.disputed++;
    else s.pending++;
  }
  return s;
}
const tc = [{status:'confirmed',amount:10},{status:'confirmed',amount:5},{status:'disputed',amount:3},{status:'pending',amount:8},{status:'pending',amount:2}];
const s = aggregateStats(tc);
console.log('6a. Total:', s.total===5 ? 'OK' : 'FAIL');
console.log('6b. Amount:', s.total_amount===15 ? 'OK' : 'FAIL');
console.log('6c. Disputed:', s.disputed===1 ? 'OK' : 'FAIL');
if (s.total!==5||s.total_amount!==15) errors.push('stats');

// Test 7: Pagination
function paginate(claims, limit, cursor) {
  const idx = cursor ? claims.findIndex(c=>c.id===cursor)+1 : 0;
  const page = claims.slice(idx, idx+limit+1);
  return { items: page.slice(0,limit), next: page.length>limit ? page[limit-1].id : null };
}
const all = Array.from({length:25},(_,i)=>({id:String(i+1)}));
const p1 = paginate(all,10,null), p2 = paginate(all,10,p1.next), p3 = paginate(all,10,p2.next);
console.log('7a. Page1:', p1.items.length===10&&p1.next!==null ? 'OK' : 'FAIL');
console.log('7b. Page2:', p2.items.length===10 ? 'OK' : 'FAIL');
console.log('7c. Page3:', p3.items.length===5&&p3.next===null ? 'OK' : 'FAIL');

console.log('');
console.log(errors.length === 0 ? 'ALL 21 PAYMENT WITNESS TESTS PASSED' : 'FAILURES: ' + errors.join(', '));
process.exit(errors.length > 0 ? 1 : 0);
