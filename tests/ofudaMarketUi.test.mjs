import test from 'node:test';
import assert from 'node:assert/strict';
import { mountOfudaMarket } from '../src/ofudaMarketUi.js';

class Element {
  constructor(tag, doc) { this.tag = tag; this.ownerDocument = doc; this.children = []; this.listeners = {}; this.attrs = {}; this.dataset = {}; }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = children; }
  setAttribute(name, value) { this.attrs[name] = value; }
  addEventListener(name, fn) { this.listeners[name] = fn; }
  click() { if (!this.disabled) this.listeners.click?.(); }
  focus() {}
  all() { return [this, ...this.children.flatMap((child) => child.all())]; }
}
function setup(overrides = {}) {
  const doc = { createElement: (tag) => new Element(tag, doc) };
  const root = new Element('div', doc);
  const results = [];
  const dispose = mountOfudaMarket(root, {
    market: [{ element: 'fire', label: '火', price: 12, basePrice: 12,
      quoteModel: { pressure: 0, min: 3, max: 120, unitG: 150 } }],
    holdings: { fire: 23 }, currency: 1000, interactive: true,
    resolve: (value) => results.push(value), ...overrides,
  });
  const btn = (label) => root.all().find((el) => el.tag === 'button' && el.textContent === label);
  const input = () => root.all().find((el) => el.tag === 'input');
  return { root, results, dispose, btn, input };
}
test('部分売却は指定した枚数だけ送り、確認前には送らない', () => {
  const s = setup();
  s.btn('売る').click(); s.btn('10枚').click();
  s.btn('内容を確認').click();
  assert.equal(s.results.length, 0);
  s.btn('枚数を変更').click();
  assert.equal(s.input().value, '10');
  s.btn('内容を確認').click();
  const submit = s.btn('売却を確定');
  submit.click(); submit.click();
  assert.deepEqual(s.results, [{ action: 'sell', element: 'fire', count: 10 }]);
});
test('半分・最大・5枚刻み・枚数入力を使え、端数や上限超過は送らない', () => {
  const s = setup();
  s.btn('売る').click(); s.btn('半分').click(); assert.equal(s.input().value, '10');
  s.btn('+5').click(); assert.equal(s.input().value, '15');
  s.btn('−5').click(); assert.equal(s.input().value, '10');
  s.btn('売却可能な全枚数').click(); assert.equal(s.input().value, '20');
  s.input().value = '17'; s.input().listeners.change(); assert.equal(s.input().value, '15');
  s.input().value = '999'; s.input().listeners.change(); assert.equal(s.input().value, '20');
});
test('購入は見積額を予算として送り、保有なし・G不足・相場のみでは発注不可', () => {
  const s = setup();
  s.btn('10枚').click(); s.btn('内容を確認').click(); s.btn('購入を確定').click();
  assert.equal(s.results[0].sheets, 10);
  assert.ok(s.results[0].amountG < 1000);
  const poor = setup({ currency: 0, holdings: {} });
  assert.equal(poor.btn('内容を確認').disabled, true);
  poor.btn('売る').click(); assert.equal(poor.btn('内容を確認').disabled, true);
  assert.equal(setup({ interactive: false }).btn('内容を確認'), undefined);
});
test('閉じた画面に残った確定イベントは売買しない', () => {
  const s = setup();
  s.btn('内容を確認').click();
  const submit = s.btn('購入を確定');
  s.dispose(); submit.click();
  assert.equal(s.results.length, 0);
  assert.equal(s.root.children.length, 0);
});
