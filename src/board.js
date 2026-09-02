import { Element, CARD_COLOR } from './cards.js';
import { assetUrl } from './assetUrl.js';

export const TileType = {
  START: 'start',
  LAND: 'land',
  EVENT: 'event',
  SHOP: 'shop',
  SHRINE: 'shrine',
  WARP: 'warp',
  RUNAWAY: 'runaway',
  DEFAMATION: 'defamation',
};

const SPACING = 3.2;

const TILE_TYPE_COLOR = {
  [TileType.START]: '#ffd166',
  [TileType.EVENT]: '#9b5de5',
  [TileType.SHOP]: '#2ec4b6',
  [TileType.SHRINE]: '#c1440e',
  [TileType.WARP]: '#5e60ce',
  [TileType.RUNAWAY]: '#e53935',
  [TileType.DEFAMATION]: '#7b1fa2',
};

/**
 * ①ヒトデ戦のマップ（従来のステージ1） - a fixed grid, not a generated
 * loop: the outer perimeter plus a "+"-shaped inner cross, so the 4
 * edge-midpoints and the center are real branch points (multiple
 * neighbors) instead of a simple one-way loop.
 * G=start, C=checkpoint, S=shop, F/W/T/M=fire/water/thunder/forest land,
 * N=neutral (無色) land, .=no tile here.
 */
const HITODE_ROWS = [
  'GFFFFFC',
  'W..F..T',
  'W..F..T',
  'WWWNTTT',
  'W..M..T',
  'W..M..T',
  'CMMMMMS',
];

// ステージ1初戦専用の短い外周マップ。従来のHITODE_ROWSは再戦および
// 対戦モード用としてそのまま残す。
const HITODE_FIRST_ROWS = [
  'GFFFFW',
  'T....W',
  'T....W',
  'T....W',
  'TMMMMC',
];

// ログイン前から遊べる操作チュートリアル。3×3外周の8マスだけで構成し、
// G=ゴール、C=チェックポイント、残り6マスで各属性と無属性を体験する。
const TUTORIAL_ROWS = [
  'GFC',
  'T.M',
  'NWF',
];

// ②暴君マダイ戦のマップ - ユーザー指定のレイアウト。15マス×5マスで、
// 左右2つの縦長ループ（外周の上下段でつながる）を、中央のGを通る横一列
// の通路が橋渡しする「めがね」型。四隅がH（ほこら）とC（チェックポイント）
// の対角配置になっている。H=ほこら（止まるとランダム効果「マダイの福音書」
// が発生 - _resolveShrineTile参照）。このステージだけ「全チェックポイント
// を通過しないとゴールにならない」ルールが乗る（MAPS側のrequireAllCheckpoints
// 参照）。ショップマスは無し（ユーザー指定に無いため）。
const MADAI_ROWS = [
  'HFFFN.....NWWWC',
  'M...T.....M...T',
  'M...TNNGNNM...T',
  'M...T.....M...T',
  'CWWWN.....NFFFH',
];

// ③ウサギ＆某不思議の国の少女 vs 紫の魔女ホフク＆主人公戦のマップ - ユーザー
// 指定のレイアウト。外周ループのメイン盤面(11×6)と、物理的に隔絶された
// もう一つの島(4×4)の2領域から成る - 隣接マスとしては絶対に行き来できず、
// 唯一の行き来手段がワープマス。V=ワープ1（メイン盤面に1つだけ。着地する
// と別の島の「先頭のP」＝tiles配列で最初に見つかるPへ瞬間移動する - 生成順
// はgz→gxの走査順なので自然と「一番上・一番左のP」になる）、P=ワープ2
// （別の島の四隅すべて。どこに着地してもワープ1(V)へ戻る）。どちらも
// "ちょうど止まった"時だけ発動する（通過しただけでは何も起きない -
// ほこらマスと同じ挙動。実際のリンク付けはcreateBoard末尾、発動は
// Game._resolveWarpTile参照）。行間の全マス"."の空白行が2島の非連結を
// 表す実際の盤上の隙間。
const BUDOU_ROWS = [
  'GMMMMCTTTTV',
  'W.........W',
  'W.........N',
  'W.........F',
  'W.........F',
  'CFFFFWWMMTT',
  '...........',
  '...........',
  '...PFFP....',
  '...W..T....',
  '...W..T....',
  '...PMMP....',
];

// ④Q戦。電車の車両を思わせる横長の外周ループで、両端と中央を巡る構成。
const Q_TRAIN_ROWS = [
  'CFW..MTC',
  'F.WGMT.F',
  'WMT..FWM',
  '.B....T.',
  '.F....B.',
  'WMT..FWM',
  'T.FWNM.T',
  'CFW..MTC',
];

// ⑤ダンボール男戦のマップ - ユーザー指定のレイアウト。11×11。
// 外周ループ＋「田」字型に4分割する十字の通路、四隅寄りにチェックポイント
// 4つ（C×4、うち1つは盤面中央）、右辺中央に3連続のほこら（H×3、縦一列）。
// 最終決戦にふさわしく、チェックポイント数もほこらの密度も他マップより多い。
const DANBALL_ROWS = [
  'GFFFTTTWWWC',
  'M..M.N.F..N',
  'MMMMNNFFFNN',
  'M..M.N.F..N',
  'W..F.N.M..H',
  'WWWFNCNMNNH',
  'W..F.N.M..H',
  'T..T.N.T..W',
  'TTTTNNNTNNW',
  'T..T.N.T..W',
  'CFFFWWWMMMC',
];

// ⑥「彼」戦。中央のゴールから四方向へ伸びる十字型で、各属性6マスの
// 先にCP→誹謗中傷を配置する。端は行き止まりなので来た道を折り返す。
// Dへちょうど停止するとEXスペル「開示請求」を得る。
const KARE_ROWS = [
  '........D........',
  '........C........',
  '........M........',
  '........M........',
  '........M........',
  '........M........',
  '........M........',
  '........M........',
  'DCFFFFFFGWWWWWWCD',
  '........T........',
  '........T........',
  '........T........',
  '........T........',
  '........T........',
  '........T........',
  '........C........',
  '........D........',
];

// ⑦同盟戦。上側は中央ゴールから4本の腕が折れ曲がる卍型、下側は独立した
// 11マスの直線。I/J=卍の左/右ワープ、K/L=直線の左/右ワープで、左右を
// 保ったまま相互にだけ転移する（I↔K、J↔L）。Wは水属性土地。
const FINAL_ALLIANCE_ROWS = [
  'HNCFF...N..',
  '....F...J..',
  '....F...T..',
  'NCMMGTTTC..',
  'M...W......',
  'M...W......',
  'I...WCWHN..',
  '...........',
  'KNFMWTNHDNL',
];

// ⑧朕と酢の港。左右2本の縦路はK同士の強制ワープでのみ接続される。
// Kは通過した時点で対岸へ飛び、ちょうど停止した場合は次のダイスが2倍になる。
const CHIN_HARBOR_ROWS = [
  'G....K',
  'T....F',
  'T....F',
  'W....M',
  'W....M',
  'M....T',
  'M....T',
  'F....W',
  'F....W',
  'C....N',
  'K....G',
];

// ⑨暴君と税務調査。沈没都市を外周から中心へ巻き込む渦型盤面。
// 火・水・森・雷は各11マスで均等。CPは2つに絞り、中心の強制ワープ(V)は
// 通過・停止のどちらでも完全ランダムなマスへ転移する。
const TAX_AUDIT_ROWS = [
  'GFFFFFFFF',
  '........F',
  'MMMMMMC.F',
  'M.....T.F',
  'M.TVN.T.C',
  'M.T...T.W',
  'M.TTTTT.W',
  'M.......W',
  'TWWWWWWWW',
];

// ⑩成れの果て。海底都市の最深部・大海溝の神殿。
// H型の短期決戦マップ。4属性は各5マス、四隅にCPを置く。
const HITODEMASO_ROWS = [
  'C.......C',
  'F.......W',
  'F.......W',
  'F.......W',
  'F.......W',
  'FHGSTMNNW',
  'T.......M',
  'T.......M',
  'T.......M',
  'T.......M',
  'C.......C',
];

// ⑪ふたりは○○。外周の大きな四角と、中央の8マスの四角（真ん中が穴）を、
// 左右2本の橋でつないだ左右対称マップ。Gは内側四角の上段中央、Nは下段中央、
// CPは左右それぞれの橋の中ほど（＝両方の橋を渡らないと集まらない）、暴走マスは
// 外周の左上・右下。属性は火・水・雷・森を各12マスで均等に配っている。
const MAHJONG_DUO_ROWS = [
  'BFFFFFFFFFF',
  'M.........W',
  'M.........W',
  'M.........W',
  'M...FGF...W',
  'MMCMT.TWCWW',
  'M...MNW...W',
  'M.........W',
  'M.........W',
  'M.........W',
  'TTTTTTTTTTB',
];

// ⑫お札ステージ。田んぼの「田」型（外周＋中央の十字）。
// 四隅にCP、中央にゴールを置き、火・水・森・雷は各10マスで均等。
// 1属性 = 外周の一辺7マス + その辺から中央へ伸びる十字の腕3マス。
// 全行を9文字で揃えること: createBoardはrows[0].lengthを盤面幅として使うので、
// 行ごとに長さが違うと右端の列が欠け、四隅のCPが隣接1マスの袋小路になる。
const OFUDA_FIELD_ROWS = [
  'CFFFFFFFC',
  'W...F...T',
  'W...F...T',
  'W...F...T',
  'WWWWGTTTT',
  'W...M...T',
  'W...M...T',
  'W...M...T',
  'CMMMMMMMC',
];

// ⑬船上のロンド。4つの島を選択式ワープ(X)だけで往き来する、このゲームで
// 唯一の「陸続きでない」盤面。
//
//  ・上段の3島は全て同じ形（縦2本の通りを4本の横棒でつないだ梯子形）。
//    上端の中央がCP、下端の中央がワープ。1島を1周すればそのCPを取れる。
//  ・下の島がゴール島。中央下にG、3方向の枝の先にそれぞれCPとワープ。
//    Gから左・右・中央の3ルートへ分かれるので、敵の高額地を避けて回れる。
//  ・CPは全部で6つ。上段3島のCPは全て「2」、ゴール島の3つは全て「1」で、
//    種別ごとに1つずつ通過すればゴールできる（createBoardのcheckpointKind
//    とGame._remainingCheckpointTiles参照）。つまり「どれか1島を1周して
//    ゴール島に戻る」のが最短経路になる。
//  ・土地は全て無属性。無属性地はレベルアップできず、お札の基礎価格も
//    全属性が最低値のまま始まる。属性変更スペル（放火/放水/放電/放牧）で
//    自分の色に塗り替えて初めて、土地投資も相場の押し上げも動き出す。
const KESSAN_ROWS = [
  'NCN..NCN..NCN',
  'N.N..N.N..N.N',
  'NNN..NNN..NNN',
  'N.N..N.N..N.N',
  'NNN..NNN..NNN',
  'N.N..N.N..N.N',
  'NXN..NXN..NXN',
  '.............',
  '......X......',
  '......C......',
  '....XNNNX....',
  '....C.N.C....',
  '....NNGNN....',
];

// ⑭王都の番人？？（2026-08、ユーザー指定の不整形マップへ全面差し替え）。
// 上部は「串団子」状の2本の櫛(row1/2)が1本の横通路(row3)へ収束し、右端の
// 縦通路(col7、row1〜8を貫通)で下まで降りる。左下は無火火C→雷雷→森森無と
// 進むGスタート直結のループ（fusagikondaLoop、下記参照）で、外へ出る道は
// 1本(row4のcol1)だけ。属性は火水雷森が各9・無属性3。
const ROYAL_GUARD_ROWS = [
  'F.F.F.T..',
  'M.T.W.M..',
  'WTMWTMFWT',
  'M.....W..',
  'NFFC..TWF',
  'T..W..M..',
  'T..W..WNT',
  'GMMNFMF..',
];

// ⑮川田（ユーザー指定: 「シンプルで、同属性マス3×2で6マスの通路が4本の
// 真四角」）。8×8の外周だけの単純なループ（HITODE_FIRST_ROWSと同じ
// 「内側は全部'.'（マス無し）」の手法）。四隅がG(スタート)とC(CP)×3。
// 4辺それぞれが「3+3の同属性ペア」の6マス通路で、火→水→雷→森→火と
// 一周する属性の輪になっている（G/CをまたいでもFFF+FFFのように同じ
// 属性同士が繋がるので、実質どの属性も6マスの連続した帯になる）。
// 属性は火水雷森が各6マスで完全に均等。
const KAWADA_ROWS = [
  'GFFFWWWC',
  'F......W',
  'F......W',
  'F......W',
  'M......T',
  'M......T',
  'M......T',
  'CMMMTTTC',
];

// ⑯魚群の王チヌ（ユーザー指定）。**1行20マスの一直線**。
// `G火火水水森森雷雷無C森森水水雷雷火火C`。
// ⚠️ **ループしていない**（両端が行き止まり）が、それで正しい。`_movePlayer`は
// `forward`（来た道を除いた隣接）が空になると`neighbors`へフォールバックして
// 折り返すので、G↔終端Cの往復盤面になる（＝片道1回で「半周」）。終端がCPなので、
// requireAllCheckpointsと合わせて「一度は最奥まで行かないとゴールできない」が
// 自然に成立する。
// ⚠️ **中央(index10)のCPは「くぐつの剣豪」対策**（2026-09、ユーザー指定）。
// くぐつの剣豪(chinuHitodemasoに2枚)は`autoInvadeEachTurn`で、隣接する敵が
// 居なければ「空き地だけで到達できる最短の敵へ毎手番1マス進む」が、
// **特殊マスは通れない**（neutralMonsters.jsのeffectDescription）。一直線の
// 盤面では中央に特殊マスを1つ置くだけでくぐつが反対側へ渡れなくなり、
// 盤面の端から端まで延々と侵略され続けるのを止められる。
// ⚠️ 副作用として**CPが2つになり、1周あたりのCP収入が150G→300G**になる
// （_visitCheckpointは1周につきCP1つ1回だけ加算、周回で
// passedCheckpointsがクリアされる）。敵は3人居るので敵側同盟の伸びの方が
// 大きくなる点に注意。
// 属性は火水森雷が各4マス＋無属性1マス（中央の無属性1マスをCPへ置き換えた）。
const CHINU_ROWS = [
  'GFFWWMMTTNCMMWWTTFFC',
];

/**
 * ⑬の島判定。上段は3列に分かれた周回島（gridXの帯で見分ける）、
 * gridZ 8以降がゴール島。ワープの飛び先候補（ゴール島⇔CP島の往復だけ。
 * CP島どうしの横移動は不可 - createBoard参照）とCPの種別
 * （周回島=2 / ゴール島=1）の両方をこの区分から決める。
 */
function kessanAreaOf(tile) {
  if (tile.gridZ >= 8) return 'goal';
  if (tile.gridX <= 2) return 'island1';
  if (tile.gridX <= 7) return 'island2';
  return 'island3';
}

const KESSAN_WARP_LABEL = {
  island1: 'CP島①',
  island2: 'CP島②',
  island3: 'CP島③',
};

/** ゴール島には入口が3つあるので、どの枝に降りるかまで選べるようにする。 */
const KESSAN_GOAL_WARP_LABEL = {
  6: 'ゴール島①',
  4: 'ゴール島②',
  8: 'ゴール島③',
};

// 対人戦のマップ選択・ストーリーモードの各ステージ盤面として使う一覧。
// idはstory.jsの各ステージ`key`と揃えてある - ストーリーモードは自ステージ
// のkeyをそのままmapIdとしてcreateBoard()へ渡すだけで対応する専用マップに
// なる（story.js側に別途mapIdフィールドを持たせる必要はない）。
// background: 盤面の背景画像（main.jsが#appのCSS background-imageに反映
// - applyMapBackground参照）。実素材が無いマップは共通のstage1.jpgのまま。
// requireAllCheckpoints: 全マップ共通で「全チェックポイントを通過しないと
// ゴールにならない」ルールが有効（ユーザー指定、2026-08-11）。
// spacing: マス間隔（世界座標）。既定はSPACING(=3.2、ヒトデ戦で使用、完成
// 済みなので変更しない)。②③④は元の盤面がヒトデ戦より一回り広い（15列・
// 12行・11列）ため、同じカメラ距離だと相対的に盤面が遠く/小さく見える
// との指摘（2026-08-13）を受け、カメラ自体（角度・距離）には触れず、マス
// 間隔を少し詰めることでその3ステージだけ見た目上ズームインさせている。
export const MAPS = [
  { id: 'hitode', name: '① ヒトデの縄張り', rows: HITODE_ROWS, requireAllCheckpoints: true, background: assetUrl('/images/stage/stage1.png') },
  { id: 'madai', name: '② マダイの岩礁', rows: MADAI_ROWS, requireAllCheckpoints: true, background: assetUrl('/images/stage/stage2.jpg'), spacing: 2.8 },
  { id: 'budou', name: '③ 決闘の浜辺', rows: BUDOU_ROWS, requireAllCheckpoints: true, background: assetUrl('/images/stage/stage3.png'), spacing: 2.8 },
  { id: 'q-train', name: '④ 暴走列車Q号', rows: Q_TRAIN_ROWS, requireAllCheckpoints: true, checkpointBonus: 150, background: assetUrl('/images/stage/stage-q-train.png'), spacing: 2.8 },
  { id: 'danball', name: '⑤ 暗転した世界', rows: DANBALL_ROWS, requireAllCheckpoints: true, checkpointBonus: 150, background: assetUrl('/images/stage/stage4.png'), spacing: 2.8 },
  { id: 'kare', name: '⑥ 創造主の世界', rows: KARE_ROWS, requireAllCheckpoints: true, checkpointBonus: 150, background: assetUrl('/images/stage/stage6-cyberspace.png'), spacing: 2.8 },
  { id: 'final-alliance', name: '⑦ 支配の終焉', rows: FINAL_ALLIANCE_ROWS, requireAllCheckpoints: true, checkpointBonus: 150, background: assetUrl('/images/stage/stage7-court.png'), spacing: 2.8 },
  { id: 'chin-harbor', name: '⑧ 朕と酢の花火港', rows: CHIN_HARBOR_ROWS, requireAllCheckpoints: true, checkpointBonus: 250, alternateGoalStarts: true, background: assetUrl('/images/stage/stage8-fireworks-harbor.gif'), spacing: 2.8 },
  { id: 'tax-audit', name: '⑨ 暴君と税務調査', rows: TAX_AUDIT_ROWS, requireAllCheckpoints: true, checkpointBonus: 150, background: assetUrl('/images/stage/stage9-sunken-city.png'), spacing: 2.8 },
  { id: 'hitodemaso', name: '⑩ 成れの果て', rows: HITODEMASO_ROWS, requireAllCheckpoints: true, checkpointBonus: 150, background: assetUrl('/images/stage/stage10-trench-temple.png'), spacing: 2.8 },
  { id: 'mahjong-duo', name: '⑪ ふたりは○○', rows: MAHJONG_DUO_ROWS, requireAllCheckpoints: true, checkpointBonus: 150, background: assetUrl('/images/stage/stage11-mahjong.png'), spacing: 2.8 },
  { id: 'ofuda-field', name: '⑫ 海上金融街', rows: OFUDA_FIELD_ROWS, requireAllCheckpoints: true, checkpointBonus: 150, hasOfuda: true, background: assetUrl('/images/stage/stage12-financial-city.png'), spacing: 2.8 },
  // 2026-08、ユーザー指定で⑬⑭を本実装扱いにした（タイトルの「（仮公開）」を
  // 外し、マップのwipも解除して対戦モードのマップ選択に出す）。
  // ofuda: 全マスが無属性で始まる盤面なので、そのままだと「その属性の土地が
  // 0枚＝相場が立たない」で開幕から誰もお札を買えない。startPriceで最初から
  // 3G/枚（相場の下限そのもの）の市場を開き、initialCountには「1属性あたり何マスまで伸びうるか」の
  // 目安（土地56マス÷4属性＝14）を入れて価格の伸び方を⑫と同じ形に揃える
  // （実際の枚数0のままだと分母1になり、1マス塗っただけで12G、10マスで
  // 上限120Gに張り付いてしまう）。
  { id: 'kessan', name: '⑬ 豪華客船', rows: KESSAN_ROWS, requireAllCheckpoints: true, checkpointBonus: 150, hasOfuda: true, ofuda: { startPrice: 3, initialCount: 14 }, background: assetUrl('/images/stage/stage13-luxury-liner.png'), spacing: 2.8 },
  { id: 'royal-guard', name: '⑭ 王都の番人？？', rows: ROYAL_GUARD_ROWS, requireAllCheckpoints: true, checkpointBonus: 150, background: assetUrl('/images/stage/stage14-royal-alley.jpg'), spacing: 2.8 },
  // ストーリー専用として実装。story.js側はもうwip:trueでロックしていない
  // ストーリー用の背景・立ち絵・盤面駒まで実装済み。対戦モードへは
  // バランス調整完了後にこちらのwipを外して公開する。
  { id: 'kawada', name: '⑮ 是々非々のマーモット（自称）', wip: true, rows: KAWADA_ROWS, requireAllCheckpoints: true, checkpointBonus: 150, hasOfuda: true, background: assetUrl('/images/stage/stage15-kawada-alley.png'), spacing: 2.8 },
  // ⑯はストーリー専用。1行20マスの細長い盤面なので対戦モードへ出す前提が
  // 無く、wipは外さない想定。背景は専用の「王の間」（海中の玉座の間）。
  { id: 'chinu', name: '⑯ 魚群の王チヌ', wip: true, rows: CHINU_ROWS, requireAllCheckpoints: true, checkpointBonus: 150, background: assetUrl('/images/stage/king-room.png'), spacing: 2.8 },
];

const HITODE_FIRST_MAP = {
  id: 'hitode-first',
  name: '① ヒトデ戦（初戦）',
  rows: HITODE_FIRST_ROWS,
  requireAllCheckpoints: true,
  background: assetUrl('/images/stage/stage1.png'),
};

const TUTORIAL_MAP = {
  id: 'tutorial',
  name: 'チュートリアル',
  rows: TUTORIAL_ROWS,
  requireAllCheckpoints: true,
  checkpointBonus: 100,
  background: assetUrl('/images/stage/stage1.png'),
  spacing: 3.2,
};

// 対戦モードでは、ステージ1の短い初戦マップと長い再戦マップを別々に
// 選べるようにする。ストーリー側が使うMAPSの意味は変えない。
export const PVP_MAPS = [
  { ...HITODE_FIRST_MAP, name: '① はじまりの海（初戦マップ）' },
  { ...MAPS[0], name: '① ヒトデの縄張り（再戦マップ）' },
  ...MAPS.slice(1),
].filter((map) => !map.wip);

function getMap(mapId) {
  if (mapId === TUTORIAL_MAP.id) return TUTORIAL_MAP;
  if (mapId === HITODE_FIRST_MAP.id) return HITODE_FIRST_MAP;
  return MAPS.find((m) => m.id === mapId) ?? MAPS[0];
}

/** そのマップの背景画像URL（main.jsが#appのCSS背景に反映する）。 */
export function getMapBackground(mapId) {
  return getMap(mapId).background;
}

/** そのマップで「全チェックポイントを通過しないとゴールにならない」ルールが有効かどうか（Game側のGoal判定が参照する）。 */
export function mapRequiresAllCheckpoints(mapId) {
  return !!getMap(mapId).requireAllCheckpoints;
}

/** チェックポイント通過ボーナス（G）。マップ未指定なら100。④⑤⑥は150。 */
export function mapCheckpointBonus(mapId) {
  return getMap(mapId).checkpointBonus ?? 100;
}

/** 対人戦の行動順に従い、複数ゴールへ交互配置するマップか。 */
export function mapUsesAlternateGoalStarts(mapId) {
  return !!getMap(mapId).alternateGoalStarts;
}

export function mapHasOfuda(mapId) {
  return !!getMap(mapId).hasOfuda;
}

/** お札マップの相場設定（startPrice=土地が0枚の時の価格、initialCount=価格計算の分母）。 */
export function mapOfudaSettings(mapId) {
  return getMap(mapId).ofuda || null;
}

const LAND_ELEMENT_BY_CODE = {
  F: Element.FIRE,
  W: Element.WATER,
  T: Element.THUNDER,
  M: Element.FOREST,
  N: Element.NEUTRAL,
};

function typeForCode(code) {
  if (code === 'G') return TileType.START;
  if (code === 'C') return TileType.EVENT;
  if (code === 'S') return TileType.SHOP;
  if (code === 'H') return TileType.SHRINE;
  if (code === 'B') return TileType.RUNAWAY;
  if (code === 'D') return TileType.DEFAMATION;
  // V/Pおよびステージ7専用I/J/K/Lは共に、ちょうど止まったらワープする。
  // V=ワープ1（1マスだけ）、P=ワープ2（複数マスありうる）- 区別は型では
  // なく、createBoard末尾のリンク付けでtile.warpTargetIdに焼き込む。
  // Xは⑬の選択式ワープ（飛び先を候補から選ぶ）。リンク付けはcreateBoard末尾。
  if (code === 'V' || code === 'P' || code === 'X' || ['I', 'J', 'K', 'L'].includes(code)) return TileType.WARP;
  if (LAND_ELEMENT_BY_CODE[code]) return TileType.LAND;
  return null;
}

/**
 * Parses the given map (mapIdが省略/未知の場合はMAPS[0]にフォールバック)
 * into tiles with explicit `neighbors` (tile ids of every
 * orthogonally-adjacent present cell) - movement (see Game._movePlayer)
 * walks this graph rather than a flat array index, since branch points can
 * have 3 or 4 neighbors instead of always exactly 2.
 */
export function createBoard(mapId) {
  const map = getMap(mapId);
  const rows = map.rows;
  const spacing = map.spacing ?? SPACING;
  const height = rows.length;
  const width = rows[0].length;
  const offsetX = (width - 1) / 2;
  const offsetZ = (height - 1) / 2;

  const idByCoord = new Map();
  const tiles = [];
  // チェックポイント(EVENT)は生成順(gz→gxの盤面走査順)に1から番号を振る -
  // プレイヤーパネルの通過状況表示（main.jsのrenderPlayerPanels）が
  // マップごとに一貫した番号で「①②③④」のように出せるようにするため。
  let nextCheckpointNumber = 1;

  for (let gz = 0; gz < height; gz++) {
    for (let gx = 0; gx < width; gx++) {
      const code = rows[gz][gx];
      const type = typeForCode(code);
      if (!type) continue;

      const id = tiles.length;
      idByCoord.set(`${gx},${gz}`, id);
      const isLand = type === TileType.LAND;
      const position = {
        x: (gx - offsetX) * spacing,
        z: (gz - offsetZ) * spacing,
      };

      tiles.push({
        id,
        type,
        gridX: gx,
        gridZ: gz,
        position,
        element: isLand ? LAND_ELEMENT_BY_CODE[code] : null,
        owner: isLand ? null : undefined,
        unit: isLand ? null : undefined,
        level: isLand ? 1 : undefined,
        // 基本地価 (base land price) - flat across all tiles for now. See
        // Game._landValueOfTile/_tollOfTile for how level/chain multipliers
        // turn this into 地価 と 通行料.
        price: isLand ? 100 : null,
        neighbors: [],
        checkpointNumber: type === TileType.EVENT ? nextCheckpointNumber++ : null,
        // 同じWARP型でも盤上の画像とラベルを入口(V)・帰り道(P)で
        // 出し分けるため、元のマップ記号を描画用情報として保持する。
        warpKind: ['V', 'I', 'J'].includes(code) ? 'entrance' : ['P', 'K', 'L'].includes(code) ? 'return' : null,
      });
    }
  }

  const DELTAS = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];
  for (const tile of tiles) {
    for (const [dx, dz] of DELTAS) {
      const neighborId = idByCoord.get(`${tile.gridX + dx},${tile.gridZ + dz}`);
      if (neighborId != null) tile.neighbors.push(neighborId);
    }
  }

  // ワープマスのリンク付け: 元コードが'V'の1枚（ワープ1）と'P'の全マス
  // （ワープ2）を後付けで対応させる。tilesはgz→gxの走査順で積まれている
  // ので、warpIn[0]が自然と「一番上・一番左のP」＝「先頭のP」になる。
  // このマップにV/Pが無ければ何もしない（他マップはこのブロックが
  // 素通りされるだけ）。
  const warpOut = tiles.filter((t) => rows[t.gridZ][t.gridX] === 'V');
  const warpIn = tiles.filter((t) => rows[t.gridZ][t.gridX] === 'P');
  if (warpOut.length === 1 && warpIn.length > 0) {
    warpOut[0].warpTargetId = warpIn[0].id;
    for (const t of warpIn) t.warpTargetId = warpOut[0].id;
  }
  if (map.id === 'tax-audit' && warpOut.length === 1) {
    // ⑨の渦中心は通過・停止のどちらでも発動する完全ランダム転移。
    warpOut[0].warpOnPass = true;
    warpOut[0].warpKind = 'parallel';
    warpOut[0].randomWarp = true;
  }

  // ステージ7の左右固定ワープ。卍側から直線側へ、直線側から卍側へしか
  // 飛ばず、左右が交差することもない。
  for (const [mainCode, lineCode] of [['I', 'K'], ['J', 'L']]) {
    const mainWarp = tiles.find((t) => rows[t.gridZ][t.gridX] === mainCode);
    const lineWarp = tiles.find((t) => rows[t.gridZ][t.gridX] === lineCode);
    if (!mainWarp || !lineWarp) continue;
    mainWarp.warpTargetId = lineWarp.id;
    lineWarp.warpTargetId = mainWarp.id;
  }

  // ステージ8のKは同じ記号2枚を相互接続し、停止時だけでなく通過時にも発動する。
  if (map.id === 'chin-harbor') {
    const harborWarps = tiles.filter((t) => rows[t.gridZ][t.gridX] === 'K');
    if (harborWarps.length === 2) {
      harborWarps[0].warpTargetId = harborWarps[1].id;
      harborWarps[1].warpTargetId = harborWarps[0].id;
      for (const tile of harborWarps) {
        tile.warpOnPass = true;
        tile.warpKind = 'wormhole';
      }
    }
  }


  // ⑬の選択式ワープ(X): ゴール島からはCP島①〜③だけ、CP島からは
  // ゴール島①〜③だけを選択できる。CP島どうしの横移動は許可しない。
  // 実際にどこへ飛ぶかは停止したプレイヤー（CPUはAI）に選ばせる。
  // あわせてCPへ種別（周回島=2 / ゴール島=1）を焼き込む。
  if (map.id === 'kessan') {
    const warps = tiles.filter((t) => rows[t.gridZ][t.gridX] === 'X');
    for (const tile of warps) {
      const area = kessanAreaOf(tile);
      tile.warpKind = 'choice';
      tile.warpLabel = area === 'goal'
        ? (KESSAN_GOAL_WARP_LABEL[tile.gridX] || 'ゴール島')
        : KESSAN_WARP_LABEL[area];
      tile.warpChoices = warps
        .filter((other) => (area === 'goal'
          ? kessanAreaOf(other) !== 'goal'
          : kessanAreaOf(other) === 'goal'))
        .map((other) => other.id);
      // 単独の飛び先しか無い場合に備えて従来のwarpTargetIdも埋めておく。
      tile.warpTargetId = tile.warpChoices[0] ?? null;
    }
    // ⑬のCPは「番号＝種別」。周回島のCPは3つとも2番、ゴール島の3つは
    // 全て1番で、1番と2番をそれぞれ1つずつ通過すればゴールできる。
    // 表示上の番号もそのまま2番/1番になる（プレイヤーパネルは番号の
    // 重複を潰して①②の2つだけ出す - Game.checkpointNumbers参照）。
    for (const tile of tiles) {
      if (tile.type !== TileType.EVENT) continue;
      tile.checkpointKind = kessanAreaOf(tile) === 'goal' ? 1 : 2;
      tile.checkpointNumber = tile.checkpointKind;
    }
  }

  // ⑭左下のG直結ループ（無火火C/雷雷/水水/森森無）に印を付ける。塞ぎ込んだ男の
  // 専用AI(_cpuChooseSummonCardForFusagikonda, game.js)が、周回のたびに必ず
  // 通るこの区画へサンダーバード/電柱を植える男を優先配置し、土地コマンドで
  // 毎周モンスターをばらまけるようにするための目印。
  if (map.id === 'royal-guard') {
    for (const tile of tiles) {
      if (tile.gridZ >= 4 && tile.gridZ <= 7 && tile.gridX <= 3) tile.fusagikondaLoop = true;
    }
  }

  // Qステージの暴走マスは必ず2枚一組。停止時の飛び先を相互に設定する。
  const runawayTiles = tiles.filter((t) => t.type === TileType.RUNAWAY);
  if (runawayTiles.length === 2) {
    runawayTiles[0].runawayTargetId = runawayTiles[1].id;
    runawayTiles[1].runawayTargetId = runawayTiles[0].id;
  }

  return tiles;
}

export function getMapName(mapId) {
  return getMap(mapId).name;
}

/**
 * マップ選択UI用: そのマップの盤面レイアウトを縮小した簡易プレビューを
 * canvasに描いて返す。実素材の背景画像はまだ1種類しか無いため、タイルの
 * 配色（属性色/開始・チェックポイント・ショップ色）だけで盤面の形の違いが
 * 伝わるようにしてある。
 */
export function createMapThumbnailCanvas(mapId, cellPx = 10) {
  const { rows } = getMap(mapId);
  const width = rows[0].length;
  const height = rows.length;
  const canvas = document.createElement('canvas');
  canvas.width = width * cellPx;
  canvas.height = height * cellPx;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#0b2436';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  for (let gz = 0; gz < height; gz++) {
    for (let gx = 0; gx < width; gx++) {
      const code = rows[gz][gx];
      const type = typeForCode(code);
      if (!type) continue;
      ctx.fillStyle = type === TileType.LAND ? CARD_COLOR[LAND_ELEMENT_BY_CODE[code]] : TILE_TYPE_COLOR[type];
      ctx.fillRect(gx * cellPx, gz * cellPx, cellPx - 1, cellPx - 1);
    }
  }
  return canvas;
}

