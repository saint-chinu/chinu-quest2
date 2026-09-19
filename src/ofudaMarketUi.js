// 表示専用。実売買はGame/対戦サーバーが検証・実行する。
export const TRADE_LOT = 5;
const ICONS = { fire: '🔥', water: '💧', forest: '🌳', thunder: '⚡' };
const fmt = (n) => Math.floor(n).toLocaleString('ja-JP');

export function quoteOfuda(entry, action, sheets) {
  if (entry.price <= 0) return { amount: 0, afterPrice: 0, estimated: false };
  const model = entry.quoteModel;
  if (!model) return { amount: entry.price * sheets, afterPrice: entry.price, estimated: true };
  let pressure = model.pressure;
  let amount = 0;
  const price = () => Math.max(model.min, Math.min(model.max, entry.basePrice + Math.trunc(pressure)));
  const step = (delta) => {
    pressure = Math.max(model.min - entry.basePrice,
      Math.min(model.max - entry.basePrice, pressure + delta / model.unitG));
  };
  for (let i = 0; i < sheets; i++) {
    const before = price();
    if (action === 'buy') { amount += before; step(before); }
    else { step(-before); amount += price(); }
  }
  return { amount, afterPrice: price(), estimated: false };
}

export function ofudaLimit(entry, action, owned, currency) {
  if (entry.price <= 0) return 0;
  if (action === 'sell') return Math.floor(Math.max(0, owned) / TRADE_LOT) * TRADE_LOT;
  let limit = 0;
  for (let n = TRADE_LOT; n <= 50; n += TRADE_LOT) {
    if (quoteOfuda(entry, 'buy', n).amount > currency) break;
    limit = n;
  }
  return limit;
}

export function mountOfudaMarket(root, { market = [], holdings = {}, currency = 0, interactive = false, resolve } = {}) {
  let active = true;
  let selected = market[0];
  let action = 'buy';
  let sheets = TRADE_LOT;
  let confirming = false;
  const doc = root.ownerDocument;
  const node = (tag, cls, text) => {
    const el = doc.createElement(tag);
    el.className = cls;
    if (text != null) el.textContent = text;
    return el;
  };
  const button = (label, fn, cls = '') => {
    const el = node('button', cls, label);
    el.type = 'button';
    el.addEventListener('click', () => { if (active) fn(); });
    return el;
  };
  function render(focusInput = false) {
    root.replaceChildren();
    const portfolio = node('div', 'ofuda-portfolio');
    portfolio.append(node('span', '', '所持G'), node('strong', '', `${fmt(currency)} G`));
    const list = node('div', 'ofuda-quotes');
    for (const entry of market) {
      const tile = button('', () => { selected = entry; confirming = false; sheets = TRADE_LOT; render(); }, 'ofuda-quote');
      tile.dataset.element = entry.element;
      tile.setAttribute('aria-pressed', String(entry === selected));
      tile.append(node('span', 'ofuda-quote-name', `${ICONS[entry.element] || ''} ${entry.label}`),
        node('strong', 'ofuda-quote-price', `${fmt(entry.price)} G`),
        node('small', '', `1枚 / 保有 ${fmt(holdings[entry.element] || 0)}枚`));
      list.append(tile);
    }
    const left = node('section', 'ofuda-overview');
    left.append(portfolio, list);
    root.append(left);
    if (!selected) return;
    const ticket = node('section', 'ofuda-ticket');
    root.append(ticket);
    const owned = holdings[selected.element] || 0;
    ticket.append(node('h3', '', `${ICONS[selected.element] || ''} ${selected.label}のお札`));
    if (!interactive) {
      ticket.append(node('p', '', `保有 ${fmt(owned)}枚`),
        node('strong', 'ofuda-valuation', `評価額 ${fmt(owned * selected.price)} G`),
        node('p', 'ofuda-hint', '売買はゴール・CPの取引画面で行えます。'));
      return;
    }
    const tabs = node('div', 'ofuda-segments');
    for (const [value, label] of [['buy', '買う'], ['sell', '売る']]) {
      const tab = button(label, () => { action = value; sheets = TRADE_LOT; confirming = false; render(); });
      tab.setAttribute('aria-pressed', String(action === value));
      tabs.append(tab);
    }
    ticket.append(tabs);
    const limit = ofudaLimit(selected, action, owned, currency);
    sheets = Math.max(0, Math.min(limit, Math.floor(sheets / TRADE_LOT) * TRADE_LOT));
    const quote = quoteOfuda(selected, action, sheets);
    const afterG = currency + (action === 'buy' ? -quote.amount : quote.amount);
    const afterOwned = owned + (action === 'buy' ? sheets : -sheets);
    if (!confirming) {
      const controls = node('div', 'ofuda-quantity');
      const minus = button('−5', () => { sheets -= TRADE_LOT; render(); });
      minus.disabled = sheets <= TRADE_LOT;
      const input = node('input', 'ofuda-quantity-input');
      input.type = 'number'; input.inputMode = 'numeric'; input.min = limit ? '5' : '0';
      input.max = String(limit); input.step = String(TRADE_LOT); input.value = String(sheets);
      input.setAttribute('aria-label', '売買する枚数（5枚単位）');
      input.disabled = !limit;
      input.addEventListener('change', () => {
        if (!active) return;
        sheets = Math.max(TRADE_LOT, Number(input.value) || TRADE_LOT); render(true);
      });
      const plus = button('+5', () => { sheets += TRADE_LOT; render(); });
      plus.disabled = sheets >= limit;
      controls.append(minus, input, node('span', '', '枚'), plus);
      ticket.append(controls);
      const quick = node('div', 'ofuda-quick');
      for (const [label, count] of [['5枚', 5], ['10枚', 10], ['20枚', 20],
        ['半分', Math.max(5, Math.floor(limit / 10) * 5)], [action === 'buy' ? '購入可能な最大' : '売却可能な全枚数', limit]]) {
        const btn = button(label, () => { sheets = count; render(); });
        btn.disabled = count <= 0 || count > limit;
        quick.append(btn);
      }
      ticket.append(quick);
      if (focusInput) input.focus();
    } else {
      ticket.append(node('p', 'ofuda-confirm-title', `${sheets}枚を${action === 'buy' ? '購入' : '売却'}しますか？`));
    }
    const summary = node('dl', 'ofuda-summary');
    for (const [label, value] of [
      [action === 'buy' ? '支払額' : '受取額', `${quote.estimated ? '約 ' : ''}${fmt(quote.amount)} G`],
      ['所持G', `${fmt(currency)} → ${quote.estimated ? '約 ' : ''}${fmt(afterG)} G`],
      ['保有枚数', `${fmt(owned)} → ${fmt(afterOwned)} 枚`],
      ['取引後の単価', `${fmt(selected.price)} → ${fmt(quote.afterPrice)} G`],
    ]) summary.append(node('dt', '', label), node('dd', '', value));
    ticket.append(summary);
    ticket.append(node('p', 'ofuda-hint', selected.price <= 0 ? 'この属性の土地がないため取引できません。' : !limit
      ? (action === 'buy' ? '5枚購入するための所持Gが足りません。' : '売却できるお札がありません（5枚単位）。')
      : '相場の変動を含む表示です。5枚単位／購入は最大50枚／売買は1ターン1回。'));
    const footer = node('div', 'ofuda-actions');
    if (confirming) footer.append(button('枚数を変更', () => { confirming = false; render(); }));
    const submit = button(confirming ? (action === 'buy' ? '購入を確定' : '売却を確定') : '内容を確認', () => {
      if (!sheets || !active) return;
      if (!confirming) { confirming = true; render(); return; }
      active = false; // 連打・遅れて届くイベントから二重送信しない。
      resolve?.(action === 'buy'
        ? { action, element: selected.element, sheets, amountG: quote.estimated ? currency : quote.amount }
        : { action, element: selected.element, count: sheets });
    }, 'ofuda-submit');
    submit.disabled = !sheets;
    footer.append(submit); ticket.append(footer);
  }
  render();
  return () => { active = false; root.replaceChildren(); };
}
