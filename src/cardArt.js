import { CardType, Element } from './cards.js';
import { assetUrl } from './assetUrl.js';

// カード種別・属性ごとの共通プレースホルダー画像（2026-08-12反映）。1枚
// ずつ個別に画像を用意するのは時間がかかるため、当面は「モンスターは
// 属性ごとに1種類、武器防具・スペルはそれぞれ1種類」の実素材を全カード
// 共通で使う（named/汎用プレースホルダーの区別なく、imageDataUrlを持たない
// カード全てに適用される - renderCardEl参照）。将来カードごとの専用素材が
// 揃ったら、そのカードにimageDataUrlを持たせるだけでこのフォールバックは
// 自然と上書きされる。
const MONSTER_ART_URL = {
  [Element.FIRE]: assetUrl('/images/card-art/fire.png'),
  [Element.WATER]: assetUrl('/images/card-art/water.png'),
  [Element.THUNDER]: assetUrl('/images/card-art/thunder.png'),
  [Element.FOREST]: assetUrl('/images/card-art/forest.png'),
  [Element.NEUTRAL]: assetUrl('/images/card-art/neutral.png'),
};

const TYPE_ART_URL = {
  [CardType.GEAR]: assetUrl('/images/card-art/gear.png'),
  [CardType.SPELL]: assetUrl('/images/card-art/spell.png'),
};

/** カード個別のimageDataUrlが無い時に使う既定の見た目。該当が無ければnull（呼び出し元は今まで通り属性色のベタ塗りにフォールバックする）。 */
export function defaultCardArtUrl(card) {
  if (card.type === CardType.MONSTER) return MONSTER_ART_URL[card.element] ?? null;
  return TYPE_ART_URL[card.type] ?? null;
}
