import { test } from 'node:test';
import assert from 'node:assert/strict';
import { score, danger, exposure, ageInDays, totals, tierFor } from '../src/score.js';
import type { Approval } from '../src/types.js';

const NOW = Date.UTC(2026, 8, 8);
const DAY = 86_400_000;

function mk(over: Partial<Approval> = {}): Approval {
  return {
    id: 'x', chainId: '56', chainName: 'BSC',
    tokenSymbol: 'USDT', tokenContract: '0xtok', spender: '0xspend',
    spenderName: null, type: 'approve',
    isUnlimited: false, approvedAmount: '100',
    riskyLevel: 'low', riskyMsg: null, noInteractive: null,
    approveTime: NOW - 10 * DAY, expireTime: 0,
    balanceUsd: 0, exposureUsd: 0, danger: 1, priority: 0, tier: 'OK', reasons: [],
    ...over,
  };
}

test('exposure is capped by what is actually held', () => {
  assert.equal(exposure({ isUnlimited: true, approvedAmount: 'unlimited', balanceUsd: 1240 }, 1), 1240);
  assert.equal(exposure({ isUnlimited: false, approvedAmount: '500', balanceUsd: 100 }, 1), 100);
  assert.equal(exposure({ isUnlimited: false, approvedAmount: '50', balanceUsd: 100 }, 1), 50);
});

test('an unlimited over a zero balance reaches nothing', () => {
  assert.equal(exposure({ isUnlimited: true, approvedAmount: 'unlimited', balanceUsd: 0 }, 1), 0);
});

test('age is computed in whole days and never negative', () => {
  assert.equal(ageInDays(NOW - 241 * DAY, NOW), 241);
  assert.equal(ageInDays(NOW + 5 * DAY, NOW), 0);
  assert.equal(ageInDays(0, NOW), 0);
});

test('each signal raises danger and contributes a stated reason', () => {
  const base = danger(mk(), NOW);
  const unl = danger(mk({ isUnlimited: true }), NOW);
  const risky = danger(mk({ riskyLevel: 'high', riskyMsg: 'Spender contract is unverified' }), NOW);
  const unused = danger(mk({ noInteractive: true }), NOW);
  const forever = danger(mk({ expireTime: null }), NOW);

  assert.equal(base.danger, 1);
  assert.ok(unl.danger > base.danger && unl.reasons.includes('unlimited'));
  assert.ok(risky.danger > base.danger && risky.reasons.includes('Spender contract is unverified'));
  assert.ok(unused.danger > base.danger && unused.reasons.includes('never used'));
  assert.ok(forever.danger > base.danger && forever.reasons.includes('never expires'));
});

test('a null riskyMsg still yields a readable reason', () => {
  const { reasons } = danger(mk({ riskyLevel: 'high', riskyMsg: null }), NOW);
  assert.ok(reasons.some((r) => r.includes('high risk')));
});

test('the composite is what makes something critical, not any single flag', () => {
  const material = 100;
  // unlimited alone, on a normal spender, is not critical — it is the common case
  assert.notEqual(tierFor(500, 1.8, { riskyLevel: 'low', isUnlimited: true, noInteractive: null }, material), 'CRITICAL');
  // unlimited AND never used is
  assert.equal(tierFor(500, 2.9, { riskyLevel: 'low', isUnlimited: true, noInteractive: true }, material), 'CRITICAL');
  // so is a high-risk spender
  assert.equal(tierFor(500, 2.5, { riskyLevel: 'high', isUnlimited: false, noInteractive: null }, material), 'CRITICAL');
  // but nothing immaterial is, however bad it looks
  assert.equal(tierFor(3, 9.9, { riskyLevel: 'high', isUnlimited: true, noInteractive: true }, material), 'REVIEW');
});

test('ranking is worst-first and stable across runs', () => {
  const prices = new Map([['56:0xtok', 1]]);
  const input = [
    mk({ id: 'small', balanceUsd: 40, isUnlimited: true }),
    mk({ id: 'worst', balanceUsd: 1240, isUnlimited: true, riskyLevel: 'high', noInteractive: true, expireTime: null, approveTime: NOW - 241 * DAY }),
    mk({ id: 'mid', balanceUsd: 180, isUnlimited: true, expireTime: null, approveTime: NOW - 96 * DAY }),
  ];
  const a = score(input, prices, { now: NOW });
  const b = score([...input].reverse(), prices, { now: NOW });
  assert.deepEqual(a.map((x) => x.id), ['worst', 'mid', 'small']);
  assert.deepEqual(a.map((x) => x.id), b.map((x) => x.id), 'input order must not change the ranking');
});

test('totals count only open doors and surface the worst one', () => {
  const prices = new Map([['56:0xtok', 1]]);
  const ranked = score([
    mk({ id: 'worst', balanceUsd: 1240, isUnlimited: true, riskyLevel: 'high', noInteractive: true, expireTime: null }),
    mk({ id: 'quiet', balanceUsd: 0 }),
  ], prices, { now: NOW });
  const t = totals(ranked);
  assert.equal(t.critical, 1);
  assert.equal(t.reachableUsd, 1240);
  assert.equal(t.worst?.id, 'worst');
  assert.equal(t.hidden, 1);
});

test('an empty result and an unreadable wallet are not the same thing', () => {
  // Guards the failure this tool cannot afford: reporting "nothing can spend
  // your tokens" when the wallet was never actually read. collect() throws
  // BawSignedOut before scoring, so a clean headline can only ever come from a
  // scan that genuinely returned zero open doors.
  const t = totals([]);
  assert.equal(t.openDoors, 0);
  assert.equal(t.worst, null);
  assert.equal(t.reachableUsd, 0);
});

test('balance rows are read from the field names the CLI actually uses', async () => {
  // wallet balance returns address/balance/value, not tokenContract/amount/usdValue.
  // Reading the documented names alone silently zeroes every exposure.
  const { normaliseBalance } = await import('../src/normalise.js');
  const live = normaliseBalance({
    symbol: 'USDT', address: '0x55d3', binanceChainId: '56',
    balance: '42', price: '0.9996', value: '41.985872155020914',
  });
  assert.equal(live?.tokenContract, '0x55d3');
  assert.equal(live?.amount, 42);
  assert.ok(live && Math.abs(live.usdValue - 41.99) < 0.01);
});

test('the materiality floor scales to the wallet instead of a fixed number', async () => {
  const { materialityFor } = await import('../src/score.js');
  // A $41 wallet should surface its $40 approval without anyone passing a flag.
  assert.ok(materialityFor(41) < 40, 'a $40 approval must clear the floor on a $41 wallet');
  assert.equal(materialityFor(410), 41);
  // Bounded at both ends: dust does not raise alarms, whales are not buried.
  assert.equal(materialityFor(40000), 100);
  assert.equal(materialityFor(2), 1);
  assert.equal(materialityFor(0), 1);
});

test('a $40 approval on a $41 wallet ranks above the fold with no flags', () => {
  const prices = new Map([['56:0xtok', 1]]);
  const ranked = score(
    [mk({ id: 'usdt', balanceUsd: 39.99, isUnlimited: true, expireTime: null }),
     mk({ id: 'dust', balanceUsd: 0.5, isUnlimited: true, expireTime: null })],
    prices,
    { now: NOW, portfolioUsd: 40.99 },
  );
  assert.equal(ranked[0]?.id, 'usdt');
  assert.equal(ranked[0]?.tier, 'HIGH');
  assert.equal(ranked[1]?.tier, 'REVIEW');
});
