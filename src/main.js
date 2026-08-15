import './style.css';
import './pwa.js';
import { GameScene, PIECE_REST_Y } from './scene.js';
import { createBoard, MAPS, TileType, createMapThumbnailCanvas, getMapBackground } from './board.js';
import { Game } from './game.js';
import { CardType, CARD_COLOR, ELEMENT_LABEL, Element, Rarity, RARITY_COLOR, RARITY_SELL_PRICE, TYPE_ICON } from './cards.js';
import { STARTER_DECKS, buildStarterDeckList, buildThemedDeckList, buildCharacterDeckList, MONSTER_CATALOG, ITEM_CATALOG, SPELL_CATALOG } from './battleCards.js';
import { loginOrRegister, saveCharacter } from './auth.js';
import { getCardCatalog, isLegacyPlaceholderCardName } from './cardCatalog.js';
import { PACKS, drawPack } from './shopPacks.js';
import { CARD_EFFECTS, saveCustomCard, saveCustomCardsBulk, setCloudCustomCardUser, validateCustomCard } from './customCards.js';
import { loadCharacterIconPresets, fileToCharacterIcon, resolveCharacterIcon } from './playerIcons.js';
import {
  BREED_BASE,
  BREED_DEFAULT_IMAGE_URL,
  BREED_MAX_EQUIPPED_PARTS,
  BREED_PARTS,
  CHANGEABLE_BREED_ELEMENTS,
  computeBreedStats,
  canEquipPart,
  breedPartBadges,
  buildBreedCardDef,
  BREED_PART_PACK,
  drawBreedPartPack,
  describeBreedPart,
} from './breedParts.js';
import { STORY_STAGES, isStageUnlocked, isStageCleared } from './story.js';
import { NPC_PORTRAIT_URL, loadNpcTokenImage } from './npcArt.js';
import { defaultCardArtUrl } from './cardArt.js';
import { firebaseReady, db, auth } from './firebase.js';
import { collection, doc as fsDoc, getDoc as fsGetDoc, getDocs as fsGetDocs, getCountFromServer as fsGetCount, addDoc as fsAddDoc, serverTimestamp as fsServerTimestamp, query as fsQuery, orderBy as fsOrderBy } from 'firebase/firestore';
import {
  createPvpRoom,
  joinPvpRoom,
  listenToRoom,
  listenToPrivateHand,
  leavePvpRoom,
  HostGuestRelay,
  GuestHostListener,
  HostParticipantActionListener,
  HostParticipantPresenceMonitor,
  GuestActionSender,
  normalizePvpParticipants,
  publishPublicState,
  publishPrivateHand,
  finishPvpRoom,
  beginPvpMatch,
} from './pvp.js';
import { playMapTheme, playBattleTheme, stopMusic, toggleMuted, isMuted, playSfx } from './audio.js';
import { getSpeedMultiplier, setSpeedMultiplier } from './utils.js';

// 盤面メニューの速度調整（1倍/1.5倍/2倍/3倍）: game.js/scene.jsはtween/delay
// （utils.js）経由で既に倍率がかかるが、main.js自身のメッセージ表示・演出待ちは
// 生のsetTimeout/setIntervalなので、このファイル全体で識別子をシャドウして
// 同じ倍率を一括適用する（各呼び出し箇所を個別に書き換えずに済ませるため）。
// Firestoreフェッチのタイムアウトガードのような「演出ではない」待ちは
// window.setTimeoutを明示して意図的にこの対象から外す（該当箇所参照）。
const setTimeout = (handler, timeoutMs, ...args) => window.setTimeout(handler, (timeoutMs ?? 0) / getSpeedMultiplier(), ...args);
const setInterval = (handler, timeoutMs, ...args) => window.setInterval(handler, (timeoutMs ?? 0) / getSpeedMultiplier(), ...args);

const canvas = document.getElementById('game-canvas');
const fxLayer = document.getElementById('fx-layer');
const turnIndicator = document.getElementById('turn-indicator');
const playerPanelEls = [
  document.getElementById('player-panel-0'),
  document.getElementById('player-panel-1'),
  document.getElementById('player-panel-2'),
  document.getElementById('player-panel-3'),
];
const deckRatioModal = document.getElementById('deck-ratio-modal');
const deckRatioTitle = document.getElementById('deck-ratio-title');
const deckRatioContent = document.getElementById('deck-ratio-content');
const deckRatioClose = document.getElementById('deck-ratio-close');
const logEl = document.getElementById('log');
const handPanel = document.getElementById('hand-panel');
const diceButton = document.getElementById('dice-button');
const directionArrowsOverlay = document.getElementById('direction-arrows-overlay');
const dirArrowUpleft = document.getElementById('dir-arrow-upleft');
const dirArrowUpright = document.getElementById('dir-arrow-upright');
const dirArrowDownleft = document.getElementById('dir-arrow-downleft');
const dirArrowDownright = document.getElementById('dir-arrow-downright');
const branchUndoButton = document.getElementById('branch-undo-button');
const landCommandModal = document.getElementById('land-command-modal');
const landCommandTitle = document.getElementById('land-command-title');
const landCommandSummon = document.getElementById('land-command-summon');
const landCommandLand = document.getElementById('land-command-land');
const landCommandEnd = document.getElementById('land-command-end');
const landSubmenuModal = document.getElementById('land-submenu-modal');
const landSubmenuTitle = document.getElementById('land-submenu-title');
const landSubmenuSwap = document.getElementById('land-submenu-swap');
const landSubmenuLevelup = document.getElementById('land-submenu-levelup');
const landSubmenuElement = document.getElementById('land-submenu-element');
const landSubmenuMove = document.getElementById('land-submenu-move');
const landSubmenuAbility = document.getElementById('land-submenu-ability');
const landSubmenuBack = document.getElementById('land-submenu-back');
const abilityTargetModal = document.getElementById('ability-target-modal');
const abilityTargetChoices = document.getElementById('ability-target-choices');
const abilityTargetCancel = document.getElementById('ability-target-cancel');
const monsterPickerModal = document.getElementById('monster-picker-modal');
const monsterPickerChoices = document.getElementById('monster-picker-choices');
const monsterPickerCancel = document.getElementById('monster-picker-cancel');
const shopTileModal = document.getElementById('shop-tile-modal');
const shopTileChoices = document.getElementById('shop-tile-choices');
const shopTileCancel = document.getElementById('shop-tile-cancel');
const elementPickerModal = document.getElementById('element-picker-modal');
const elementPickerChoices = document.getElementById('element-picker-choices');
const elementPickerCancel = document.getElementById('element-picker-cancel');
const cardTypePickerModal = document.getElementById('card-type-picker-modal');
const cardTypePickerChoices = document.getElementById('card-type-picker-choices');
const cardTypePickerCancel = document.getElementById('card-type-picker-cancel');
const confirmModal = document.getElementById('confirm-modal');
const confirmText = document.getElementById('confirm-text');
const confirmCardPreview = document.getElementById('confirm-card-preview');
const confirmCardFace = document.getElementById('confirm-card-face');
const confirmCardDetail = document.getElementById('confirm-card-detail');
const confirmYes = document.getElementById('confirm-yes');
const confirmNo = document.getElementById('confirm-no');
const levelUpModal = document.getElementById('level-up-modal');
const levelUpTitle = document.getElementById('level-up-title');
const levelUpChoices = document.getElementById('level-up-choices');
const levelUpCancel = document.getElementById('level-up-cancel');
const cameraWorkOverlay = document.getElementById('camera-work-overlay');
const camArrowUp = document.getElementById('cam-arrow-up');
const camArrowDown = document.getElementById('cam-arrow-down');
const camArrowLeft = document.getElementById('cam-arrow-left');
const camArrowRight = document.getElementById('cam-arrow-right');
const camWorkBack = document.getElementById('cam-work-back');
const debtSaleModal = document.getElementById('debt-sale-modal');
const debtSaleTitle = document.getElementById('debt-sale-title');
const debtSaleChoices = document.getElementById('debt-sale-choices');
const tileInfoModal = document.getElementById('tile-info-modal');
const tileInfoText = document.getElementById('tile-info-text');
const tileInfoClose = document.getElementById('tile-info-close');
const cardRevealModal = document.getElementById('card-reveal-modal');
const cardRevealCard = document.getElementById('card-reveal-card');
const discardModal = document.getElementById('discard-modal');
const discardHint = document.getElementById('discard-hint');
const discardChoices = document.getElementById('discard-choices');
const discardConfirm = document.getElementById('discard-confirm');
const discardConfirmCard = document.getElementById('discard-confirm-card');
const discardConfirmDetail = document.getElementById('discard-confirm-detail');
const discardConfirmYes = document.getElementById('discard-confirm-yes');
const discardConfirmNo = document.getElementById('discard-confirm-no');
const cardDetailModal = document.getElementById('card-detail-modal');
const cardDetailCard = document.getElementById('card-detail-card');
const cardDetailText = document.getElementById('card-detail-text');
const cardDetailClose = document.getElementById('card-detail-close');
const cardDetailUse = document.getElementById('card-detail-use');
// カード詳細は盤面外（図鑑・ショップ・デッキ編集）からも開くため、
// hiddenになる#appの外に置く共通オーバーレイとして扱う。
document.body.appendChild(cardDetailModal);
const centerPanel = document.getElementById('center-panel');
const diceTapHint = document.getElementById('dice-tap-hint');
const centerHandEl = document.getElementById('center-hand');
const spellEffectModal = document.getElementById('spell-effect-modal');
const spellEffectText = document.getElementById('spell-effect-text');
const battleSceneModal = document.getElementById('battle-scene-modal');
const battleFade = document.getElementById('battle-fade');
const battleStage = document.getElementById('battle-stage');
const battleSide = {
  attacker: {
    owner: document.getElementById('battle-attacker-owner'),
    hp: document.getElementById('battle-attacker-hp'),
    hpBonus: document.getElementById('battle-attacker-hp-bonus'),
    hpFill: document.getElementById('battle-attacker-hp-fill'),
    atk: document.getElementById('battle-attacker-atk'),
    atkBonus: document.getElementById('battle-attacker-atk-bonus'),
    atkFill: document.getElementById('battle-attacker-atk-fill'),
    card: document.getElementById('battle-attacker-card'),
    item: document.getElementById('battle-attacker-item'),
    matchup: document.getElementById('battle-attacker-matchup'),
    el: document.getElementById('battle-side-attacker'),
  },
  defender: {
    owner: document.getElementById('battle-defender-owner'),
    hp: document.getElementById('battle-defender-hp'),
    hpBonus: document.getElementById('battle-defender-hp-bonus'),
    hpFill: document.getElementById('battle-defender-hp-fill'),
    atk: document.getElementById('battle-defender-atk'),
    atkBonus: document.getElementById('battle-defender-atk-bonus'),
    atkFill: document.getElementById('battle-defender-atk-fill'),
    card: document.getElementById('battle-defender-card'),
    item: document.getElementById('battle-defender-item'),
    matchup: document.getElementById('battle-defender-matchup'),
    el: document.getElementById('battle-side-defender'),
  },
};
const battleItemPickerBox = document.getElementById('battle-item-picker-box');
const battleItemPickerTitle = document.getElementById('battle-item-picker-title');
const battleItemPickerChoices = document.getElementById('battle-item-picker-choices');
const battleOpponentItems = document.getElementById('battle-opponent-items');
const battleOpponentItemsTitle = document.getElementById('battle-opponent-items-title');
const battleOpponentItemsChoices = document.getElementById('battle-opponent-items-choices');
const battleItemPickerSkip = document.getElementById('battle-item-picker-skip');
const battleMessageText = document.getElementById('battle-message-text');

const BLINK_MS = 600;

const TILE_TYPE_LABEL = { start: 'ゴール', land: '土地', event: 'チェックポイント', shop: 'ショップ', shrine: 'ほこら', warp: 'ワープ' };

function tileSummaryText(tile) {
  const lines = [`【${TILE_TYPE_LABEL[tile.type]}】`];
  if (tile.type === 'land') {
    lines.push(`属性: ${ELEMENT_LABEL[tile.element]} / Lv${tile.level}`);
    lines.push(tile.ownerName ? `所有者: ${tile.ownerName}` : '所有者: なし');
    if (tile.unitName) lines.push(`配置モンスター: ${tile.unitName} (ATK${tile.unitAtk}/HP${tile.unitHp})`);
    lines.push(`地価: ${tile.landValue}G / 通行料: ${tile.toll}G`);
    if (tile.cursed) lines.push('呪い: 強制停止中（戦闘が起きると解ける）');
  }
  return lines.join('\n');
}

/**
 * 退出（gameMenuExit）やpagehide時、ユーザーのクリック待ちで永久に止まって
 * いるモーダルPromiseを一括で強制決着させるための登録簿。各promptXxxは
 * モーダルを開く直前にcancelSelf（=通常の「キャンセル」と同じcleanup）を
 * 登録し、閉じる際に必ず自分で解除する。バトルアイテム選択専用の
 * cancelActiveBattleItemPickerとは別枠（あちらは単一スロットのまま維持）。
 */
const activePromptCancellers = new Set();
function registerPromptCanceller(fn) {
  activePromptCancellers.add(fn);
}
function unregisterPromptCanceller(fn) {
  activePromptCancellers.delete(fn);
}
function cancelAllActivePrompts() {
  const fns = [...activePromptCancellers];
  activePromptCancellers.clear();
  for (const fn of fns) {
    try { fn(); } catch { /* 破棄中なので握りつぶす */ }
  }
}

const BRANCH_ARROW_BY_DIR = {
  upleft: dirArrowUpleft,
  upright: dirArrowUpright,
  downleft: dirArrowDownleft,
  downright: dirArrowDownright,
};

/**
 * Shared diagonal-arrow + camera-work-pan chooser. Up to 4 arrows appear,
 * one per option, in whichever screen direction that option actually sits
 * (world +X/-X/+Z/-Z reads as screen ↘/↖/↙/↗ respectively under this
 * board's fixed diagonal camera - see Game._chooseNextTile /
 * Game._humanMoveFlow, both of which compute `screenDir` this same way).
 * `noBack` hides the camera-work "戻る" button (via the .no-back CSS class)
 * for choices that are mandatory rather than cancellable.
 */
// 選択系プロンプトのカメラ操作: 開始時に現在のカメラ（注視点・ズーム）を控えて
// タッチのドラッグ/ピンチによるパン・ズームを有効化し、終了時に元のカメラへ戻す。
// 旧来の画面上下左右のパン矢印は廃止（.cam-arrowはCSSで非表示）。
function beginCameraWork() {
  const snap = scene.snapshotCamera();
  scene.enableTouchPan();
  return snap;
}
function endCameraWork(snap) {
  scene.disableTouchPan();
  scene.restoreCamera(snap);
}

function promptDirectionArrows(options, { noBack = false, confirmOnSecondTap = false } = {}) {
  return new Promise((resolve) => {
    const camSnap = beginCameraWork();
    if (noBack) cameraWorkOverlay.classList.add('no-back');
    cameraWorkOverlay.classList.remove('hidden');
    directionArrowsOverlay.classList.remove('hidden');

    const listeners = [];
    let selectedTileId = null;
    let stopPreviewHighlight = null;
    function onPanUp() {
      scene.panByDirection('up');
    }
    function onPanDown() {
      scene.panByDirection('down');
    }
    function onPanLeft() {
      scene.panByDirection('left');
    }
    function onPanRight() {
      scene.panByDirection('right');
    }
    function onBack() {
      cleanup(null);
    }
    function cleanup(tileId) {
      stopPreviewHighlight?.();
      cameraWorkOverlay.classList.add('hidden');
      cameraWorkOverlay.classList.remove('no-back');
      directionArrowsOverlay.classList.add('hidden');
      Object.values(BRANCH_ARROW_BY_DIR).forEach((el) => el.classList.add('hidden'));
      Object.values(BRANCH_ARROW_BY_DIR).forEach((el) => el.classList.remove('selected'));
      listeners.forEach(([el, fn]) => el.removeEventListener('click', fn));
      camArrowUp.removeEventListener('click', onPanUp);
      camArrowDown.removeEventListener('click', onPanDown);
      camArrowLeft.removeEventListener('click', onPanLeft);
      camArrowRight.removeEventListener('click', onPanRight);
      camWorkBack.removeEventListener('click', onBack);
      endCameraWork(camSnap);
      unregisterPromptCanceller(cancelSelf);
      resolve(tileId);
    }
    function cancelSelf() {
      cleanup(null);
    }
    registerPromptCanceller(cancelSelf);

    for (const option of options) {
      const arrow = BRANCH_ARROW_BY_DIR[option.screenDir];
      arrow.classList.remove('hidden');
      const onClick = () => {
        if (!confirmOnSecondTap) {
          cleanup(option.tileId);
          return;
        }
        if (selectedTileId === option.tileId) {
          cleanup(option.tileId);
          return;
        }
        selectedTileId = option.tileId;
        Object.values(BRANCH_ARROW_BY_DIR).forEach((el) => el.classList.remove('selected'));
        arrow.classList.add('selected');
        stopPreviewHighlight?.();
        stopPreviewHighlight = startTileHighlight(option.previewTileIds?.length ? option.previewTileIds : [option.tileId], 0xffffff);
      };
      listeners.push([arrow, onClick]);
      arrow.addEventListener('click', onClick);
    }
    camArrowUp.addEventListener('click', onPanUp);
    camArrowDown.addEventListener('click', onPanDown);
    camArrowLeft.addEventListener('click', onPanLeft);
    camArrowRight.addEventListener('click', onPanRight);
    camWorkBack.addEventListener('click', onBack);
  });
}

/**
 * マスの分岐: 進める候補マス（分岐の各方向の次マス）を盤面上で白く点滅させ、
 * 直接1回タップして選ぶ（矢印UIは使わない）。選択後の最初の移動中だけ
 * 画面右の「分岐に戻る」で取り消せる。分岐選択そのものは必須なので、
 * 選択前の「戻る」は無い。
 * 盤面が見切れている時はカメラのパン矢印（cam-arrow-*）で寄せられる。
 */
let branchChoiceActive = false;

function promptChooseBranch(options) {
  return new Promise((resolve) => {
    branchChoiceActive = true;
    const camSnap = beginCameraWork();
    const candidateIds = options.map((o) => o.tileId).filter((id) => tiles[id]?.mesh);
    const candidateSet = new Set(candidateIds);

    // 分岐中は移動先ハイライトを一旦消して候補マスだけに集中させる
    // （分岐確定後に_movePlayerが改めてonMoveDestinationで点け直す）。
    stopMoveDestinationHighlight?.();
    stopMoveDestinationHighlight = null;

    cameraWorkOverlay.classList.add('no-back');
    cameraWorkOverlay.classList.remove('hidden');
    // 分岐の方向矢印は廃止したので出さない。
    directionArrowsOverlay.classList.add('hidden');

    const start = performance.now();
    let raf = requestAnimationFrame(function frame(now) {
      const t = (now - start) / 1000;
      const slow = 0.35 + 0.25 * Math.sin(t * 2.4);
      for (const id of candidateIds) {
        const mesh = tiles[id]?.mesh;
        if (!mesh) continue;
        mesh.material.emissive.setHex(0xffffff);
        mesh.material.emissiveIntensity = slow;
      }
      raf = requestAnimationFrame(frame);
    });

    function onCanvasClick(e) {
      const rect = canvas.getBoundingClientRect();
      const ndcX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const ndcY = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      if (scene.panDidMove) return; // 直前がドラッグ/ピンチなら選択しない
      const tile = scene.pickTileAt(ndcX, ndcY, tiles);
      if (!tile || !candidateSet.has(tile.id)) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      finish(tile.id);
    }
    function onUp() { scene.panByDirection('up'); }
    function onDown() { scene.panByDirection('down'); }
    function onLeft() { scene.panByDirection('left'); }
    function onRight() { scene.panByDirection('right'); }
    function finish(result) {
      branchChoiceActive = false;
      cancelAnimationFrame(raf);
      for (const id of candidateIds) {
        const mesh = tiles[id]?.mesh;
        if (mesh) {
          mesh.material.emissive.setHex(0x000000);
          mesh.material.emissiveIntensity = 0;
        }
      }
      cameraWorkOverlay.classList.add('hidden');
      cameraWorkOverlay.classList.remove('no-back');
      canvas.removeEventListener('click', onCanvasClick);
      camArrowUp.removeEventListener('click', onUp);
      camArrowDown.removeEventListener('click', onDown);
      camArrowLeft.removeEventListener('click', onLeft);
      camArrowRight.removeEventListener('click', onRight);
      endCameraWork(camSnap);
      unregisterPromptCanceller(cancelSelf);
      resolve(result);
    }
    function cancelSelf() { finish(null); }
    registerPromptCanceller(cancelSelf);

    canvas.addEventListener('click', onCanvasClick);
    camArrowUp.addEventListener('click', onUp);
    camArrowDown.addEventListener('click', onDown);
    camArrowLeft.addEventListener('click', onLeft);
    camArrowRight.addEventListener('click', onRight);
  });
}

/** 土地コマンドの「移動」: same diagonal-arrow chooser, but cancellable (the player already has a monster placed - trying doesn't have to commit). */
function setBranchUndoControl({ active, playerId, onUndo } = {}) {
  branchUndoButton.onclick = null;
  const localPlayerId = pvpMatch?.localPlayerId ?? game?.players.find((player) => !player.isCPU)?.id;
  if (!active || playerId !== localPlayerId) {
    branchUndoButton.classList.add('hidden');
    return;
  }
  branchUndoButton.classList.remove('hidden');
  branchUndoButton.onclick = () => {
    branchUndoButton.classList.add('hidden');
    branchUndoButton.onclick = null;
    onUndo?.();
  };
}

function promptMoveDirection(options) {
  return promptDirectionArrows(options);
}

/** 3-button top menu: 召喚（敵地なら侵略）/ 土地 / 終了. */
function promptLandCommand(tile, { canSummon }) {
  return new Promise((resolve) => {
    landCommandTitle.textContent = tileSummaryText(tile);
    landCommandSummon.disabled = !canSummon;
    landCommandModal.classList.remove('hidden');

    function cleanup(result) {
      landCommandModal.classList.add('hidden');
      landCommandSummon.removeEventListener('click', onSummon);
      landCommandLand.removeEventListener('click', onLand);
      landCommandEnd.removeEventListener('click', onEnd);
      unregisterPromptCanceller(cancelSelf);
      resolve(result);
    }
    function onSummon() {
      cleanup('summon');
    }
    function onLand() {
      cleanup('land');
    }
    function onEnd() {
      cleanup('end');
    }
    // 'end'を返す: _runLandCommandのfor(;;)ループを1回で確実に抜けるため
    // （null等だと分岐に当たらず同じモーダルを再度開いてしまう）。
    function cancelSelf() {
      cleanup('end');
    }
    landCommandSummon.addEventListener('click', onSummon);
    landCommandLand.addEventListener('click', onLand);
    landCommandEnd.addEventListener('click', onEnd);
    registerPromptCanceller(cancelSelf);
  });
}

/**
 * The 土地-browse tile's vertical submenu (own tile with a garrisoned
 * monster only - see Game._runLandBrowse, which never opens this for a
 * tile that isn't the player's own): 入れ替え/土地Lvアップ/属性変更/移動/
 * もどる. Resolves the chosen action string, or 'back'/null. 「情報」は
 * 2026-08-12にここから廃止し、メニューの「土地情報」に統合した
 * （showLandInfoFromMenu参照 - いつでも見られる形にするため、特定の1マスに
 * 紐づくこのサブメニューからは切り離した）。
 */
function promptLandSubmenu(tile) {
  return new Promise((resolve) => {
    landSubmenuTitle.textContent = tileSummaryText(tile);
    landSubmenuAbility.classList.toggle('hidden', !tile.hasAbility);
    landSubmenuModal.classList.remove('hidden');

    function cleanup(result) {
      landSubmenuModal.classList.add('hidden');
      landSubmenuSwap.removeEventListener('click', onSwap);
      landSubmenuLevelup.removeEventListener('click', onLevelup);
      landSubmenuElement.removeEventListener('click', onElement);
      landSubmenuMove.removeEventListener('click', onMove);
      landSubmenuAbility.removeEventListener('click', onAbility);
      landSubmenuBack.removeEventListener('click', onBack);
      unregisterPromptCanceller(cancelSelf);
      resolve(result);
    }
    function cancelSelf() {
      cleanup('back');
    }
    function onSwap() {
      cleanup('swap');
    }
    function onLevelup() {
      cleanup('levelup');
    }
    function onElement() {
      cleanup('element');
    }
    function onMove() {
      cleanup('move');
    }
    function onAbility() {
      cleanup('ability');
    }
    function onBack() {
      cleanup('back');
    }
    landSubmenuSwap.addEventListener('click', onSwap);
    landSubmenuLevelup.addEventListener('click', onLevelup);
    landSubmenuElement.addEventListener('click', onElement);
    landSubmenuMove.addEventListener('click', onMove);
    landSubmenuAbility.addEventListener('click', onAbility);
    landSubmenuBack.addEventListener('click', onBack);
    registerPromptCanceller(cancelSelf);
  });
}

/** 対象選び。土地・配置モンスターは盤面カメラで選択し、プレイヤーだけ一覧を使う。 */
function promptPickAbilityTarget(targets) {
  if (targets.length > 0 && targets.every((target) => target.type != null)) {
    return promptPickAreaTarget(targets.map((target) => ({
      ...target,
      effectAreaIds: Array.isArray(target.effectAreaIds) ? target.effectAreaIds : [target.id],
    })));
  }
  return new Promise((resolve) => {
    function cleanup(result) {
      abilityTargetModal.classList.add('hidden');
      abilityTargetCancel.removeEventListener('click', onCancel);
      unregisterPromptCanceller(cancelSelf);
      resolve(result);
    }
    function onCancel() {
      cleanup(null);
    }
    function cancelSelf() {
      cleanup(null);
    }

    abilityTargetChoices.replaceChildren();
    for (const target of targets) {
      const el = document.createElement('button');
      el.textContent = target.label ?? `${target.ownerName}の${target.unitName} (ATK${target.unitAtk}/HP${target.unitHp})`;
      el.addEventListener('click', () => cleanup(target.id));
      abilityTargetChoices.appendChild(el);
    }
    abilityTargetModal.classList.remove('hidden');
    abilityTargetCancel.addEventListener('click', onCancel);
    registerPromptCanceller(cancelSelf);
  });
}

/** 範囲土地スペル: 盤面をタップし、白点滅する効果範囲を見てから確定する。 */
function promptPickAreaTarget(targets) {
  return new Promise((resolve) => {
    const camSnap = beginCameraWork();
    const byId = new Map(targets.map((target) => [target.id, target]));
    let stopAreaHighlight = null;
    cameraWorkOverlay.classList.remove('hidden');

    async function onCanvasClick(e) {
      const rect = canvas.getBoundingClientRect();
      const ndcX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const ndcY = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      if (scene.panDidMove) return; // 直前がドラッグ/ピンチなら選択しない
      const tile = scene.pickTileAt(ndcX, ndcY, tiles);
      const target = tile && byId.get(tile.id);
      if (!target) return;
      canvas.removeEventListener('click', onCanvasClick);
      stopAreaHighlight?.();
      stopAreaHighlight = startTileHighlight(target.effectAreaIds, 0xffffff);
      await scene.focusAndZoom(tile.position.x, tile.position.z, 1.1, 260);
      const confirmed = await confirmYesNo('ここでよろしいですか？');
      stopAreaHighlight?.();
      stopAreaHighlight = null;
      if (confirmed) finish(target.id);
      else canvas.addEventListener('click', onCanvasClick);
    }

    const onUp = () => scene.panByDirection('up');
    const onDown = () => scene.panByDirection('down');
    const onLeft = () => scene.panByDirection('left');
    const onRight = () => scene.panByDirection('right');
    const onBack = () => finish(null);

    function finish(result) {
      stopAreaHighlight?.();
      cameraWorkOverlay.classList.add('hidden');
      canvas.removeEventListener('click', onCanvasClick);
      camArrowUp.removeEventListener('click', onUp);
      camArrowDown.removeEventListener('click', onDown);
      camArrowLeft.removeEventListener('click', onLeft);
      camArrowRight.removeEventListener('click', onRight);
      camWorkBack.removeEventListener('click', onBack);
      unregisterPromptCanceller(cancelSelf);
      scene.disableTouchPan();
      scene.focusAndZoom(camSnap.fx, camSnap.fz, camSnap.zoom, 260).then(() => resolve(result));
    }
    function cancelSelf() {
      finish(null);
    }

    canvas.addEventListener('click', onCanvasClick);
    camArrowUp.addEventListener('click', onUp);
    camArrowDown.addEventListener('click', onDown);
    camArrowLeft.addEventListener('click', onLeft);
    camArrowRight.addEventListener('click', onRight);
    camWorkBack.addEventListener('click', onBack);
    registerPromptCanceller(cancelSelf);
  });
}

/** "移動しますか？" はい/いいえ, reusing the generic confirm modal. */
function promptConfirmMove() {
  return confirmYesNo('移動しますか？');
}

/**
 * 手持ちGがマイナスになった直後にだけ出る強制売却リスト（土地コマンドから
 * 能動的に売る手段は無い - game.js _resolveNegativeCurrency参照）。
 * マイナスが解消するまで1件売るたびにまた同じ形で呼ばれる。
 */
function promptPickSellLandForDebt({ tiles, deficit }) {
  return new Promise((resolve) => {
    function cleanup(result) {
      debtSaleModal.classList.add('hidden');
      unregisterPromptCanceller(cancelSelf);
      resolve(result);
    }
    // 強制売却なのでキャンセルボタンは無いが、退出時は_isCancelled側で
    // 処理を打ち切るので、ここでは先頭の候補を返して待機を解くだけでよい。
    function cancelSelf() {
      cleanup(tiles[0]?.id ?? null);
    }

    debtSaleTitle.textContent = `Gがマイナスです（不足額 ${deficit}G）。売却する土地を選んでください`;
    debtSaleChoices.replaceChildren();
    for (const tile of tiles) {
      const el = document.createElement('button');
      el.className = 'debt-sale-choice';
      const unitLine = tile.unitName
        ? `${tile.unitName}（${tile.unitRarity}） ATK${tile.unitAtk} / HP${tile.unitHp}`
        : '（配置モンスターなし）';
      const price = document.createElement('span');
      price.className = 'debt-sale-price';
      price.textContent = `+${tile.salePrice}G`;
      const unit = document.createElement('span');
      unit.className = 'debt-sale-unit';
      unit.textContent = unitLine;
      el.append(price, unit);
      el.addEventListener('click', () => cleanup(tile.id));
      debtSaleChoices.appendChild(el);
    }
    debtSaleModal.classList.remove('hidden');
    registerPromptCanceller(cancelSelf);
  });
}

/** Shows the hand's monster cards; clicking one blinks it twice before resolving. */
function promptPickMonsterCard(options) {
  return new Promise((resolve) => {
    function cleanup(result) {
      monsterPickerModal.classList.add('hidden');
      monsterPickerCancel.removeEventListener('click', onCancel);
      unregisterPromptCanceller(cancelSelf);
      resolve(result);
    }
    function onCancel() {
      cleanup(null);
    }
    function cancelSelf() {
      cleanup(null);
    }

    monsterPickerChoices.replaceChildren();
    for (const card of options) {
      const el = document.createElement('div');
      el.className = 'card';
      renderCardEl(el, card);
      el.addEventListener('click', () => {
        el.classList.add('blinking');
        setTimeout(() => cleanup(card), BLINK_MS);
      });
      monsterPickerChoices.appendChild(el);
    }
    monsterPickerModal.classList.remove('hidden');
    monsterPickerCancel.addEventListener('click', onCancel);
    registerPromptCanceller(cancelSelf);
  });
}

/**
 * ショップマス: 3 random cards, paid for with in-battle G, land straight in
 * hand for this match only (see Game._resolveShopTile - never touches
 * character.ownedCards, the permanent collection). Picking one blinks it,
 * then confirms the cost like every other spend in this game; declining
 * the confirm returns to the 3-card picker rather than closing outright.
 */
function promptShopPurchase(options) {
  return new Promise((resolve) => {
    function cleanup(result) {
      shopTileModal.classList.add('hidden');
      shopTileCancel.removeEventListener('click', onCancel);
      unregisterPromptCanceller(cancelSelf);
      resolve(result);
    }
    function onCancel() {
      cleanup(null);
    }
    function cancelSelf() {
      cleanup(null);
    }

    shopTileChoices.replaceChildren();
    for (const card of options) {
      const el = document.createElement('div');
      el.className = 'card';
      renderCardEl(el, card);
      el.addEventListener('click', () => {
        el.classList.add('blinking');
        setTimeout(async () => {
          el.classList.remove('blinking');
          const confirmed = await confirmYesNo(`「${card.name}」を購入しますか？ コスト${card.cost}G`);
          if (confirmed) cleanup(card);
          // declined: stay on the picker, nothing to reset
        }, BLINK_MS);
      });
      shopTileChoices.appendChild(el);
    }
    shopTileModal.classList.remove('hidden');
    shopTileCancel.addEventListener('click', onCancel);
    registerPromptCanceller(cancelSelf);
  });
}

const ACTION_LABEL = { summon: '召喚', invade: '侵略', swap: '入れ替え', levelup: 'レベルアップ', element: '属性変更', equip: '装備' };

function promptConfirmAction({ actionType, card, cost, tile, targetElement, abilityLabel }) {
  return new Promise((resolve) => {
    let text;
    if (actionType === 'element') {
      text = `属性を${ELEMENT_LABEL[targetElement]}に変更しますか？ コスト${cost}G`;
    } else if (actionType === 'ability') {
      text = `「${abilityLabel}」を使いますか？ コスト${cost}G`;
    } else if (actionType === 'equip') {
      text = `「${card.name}」を装備しますか？`;
    } else {
      const subject = card ? `「${card.name}」で` : '';
      const extra = actionType === 'levelup' && tile ? `（Lv${tile.level}→Lv${tile.level + 1}）` : '';
      text = `${subject}${ACTION_LABEL[actionType]}${extra}しますか？ コスト${cost}G`;
    }
    confirmText.textContent = text;
    // 召喚だけでなく侵略でも、選んだモンスターの立ち絵・能力・ステータスを
    // 最終確認してから「はい／いいえ」を選べるようにする。
    const showCardPreview = (actionType === 'summon' || actionType === 'invade' || actionType === 'equip') && card;
    confirmCardPreview.classList.toggle('hidden', !showCardPreview);
    if (showCardPreview) {
      renderCardEl(confirmCardFace, card);
      confirmCardDetail.textContent = describeCardDetail(card);
    } else {
      confirmCardFace.replaceChildren();
      confirmCardDetail.textContent = '';
    }
    confirmModal.classList.remove('hidden');

    function cleanup(result) {
      confirmModal.classList.add('hidden');
      confirmCardPreview.classList.add('hidden');
      confirmYes.removeEventListener('click', onYes);
      confirmNo.removeEventListener('click', onNo);
      unregisterPromptCanceller(cancelSelf);
      resolve(result);
    }
    function onYes() {
      cleanup(true);
    }
    function onNo() {
      cleanup(false);
    }
    function cancelSelf() {
      cleanup(false);
    }
    confirmYes.addEventListener('click', onYes);
    confirmNo.addEventListener('click', onNo);
    registerPromptCanceller(cancelSelf);
  });
}

/** Picks a target element from the given options (colored swatches); resolves the element, or null if cancelled. */
function promptPickElement(options) {
  return new Promise((resolve) => {
    function cleanup(result) {
      elementPickerModal.classList.add('hidden');
      elementPickerCancel.removeEventListener('click', onCancel);
      unregisterPromptCanceller(cancelSelf);
      resolve(result);
    }
    function onCancel() {
      cleanup(null);
    }
    function cancelSelf() {
      cleanup(null);
    }

    elementPickerChoices.replaceChildren();
    for (const element of options) {
      const el = document.createElement('div');
      el.className = 'card';
      el.style.background = CARD_COLOR[element];
      el.textContent = ELEMENT_LABEL[element];
      el.addEventListener('click', () => cleanup(element));
      elementPickerChoices.appendChild(el);
    }
    elementPickerModal.classList.remove('hidden');
    elementPickerCancel.addEventListener('click', onCancel);
    registerPromptCanceller(cancelSelf);
  });
}

/** あざらしさんの「選んだ種類のカードをランダムに1枚引ける」用: モンスター/武器防具/スペルの3択。resolveはCardType文字列、キャンセルでnull。 */
function promptPickCardType() {
  return new Promise((resolve) => {
    function cleanup(result) {
      cardTypePickerModal.classList.add('hidden');
      cardTypePickerCancel.removeEventListener('click', onCancel);
      unregisterPromptCanceller(cancelSelf);
      resolve(result);
    }
    function onCancel() {
      cleanup(null);
    }
    function cancelSelf() {
      cleanup(null);
    }

    cardTypePickerChoices.replaceChildren();
    for (const type of [CardType.MONSTER, CardType.GEAR, CardType.SPELL]) {
      const el = document.createElement('div');
      el.className = 'card';
      el.style.background = CARD_COLOR[type === CardType.MONSTER ? Element.NEUTRAL : type];
      el.textContent = TYPE_LABEL[type];
      el.addEventListener('click', () => cleanup(type));
      cardTypePickerChoices.appendChild(el);
    }
    cardTypePickerModal.classList.remove('hidden');
    cardTypePickerCancel.addEventListener('click', onCancel);
    registerPromptCanceller(cancelSelf);
  });
}

/** Simple info-only popup, no camera-work of its own - "閉じる" just resolves. */
function promptShowTileInfo(tile) {
  return new Promise((resolve) => {
    function onClose() {
      tileInfoModal.classList.add('hidden');
      tileInfoClose.removeEventListener('click', onClose);
      unregisterPromptCanceller(onClose);
      resolve();
    }
    tileInfoText.textContent = tileSummaryText(tile);
    tileInfoModal.classList.remove('hidden');
    tileInfoClose.addEventListener('click', onClose);
    registerPromptCanceller(onClose);
  });
}

const BROWSE_HIGHLIGHT_COLOR = 0xfff2a8;

/** Slow blink/faint-glow on the given tiles' meshes (via emissive), until the returned stop function is called. */
function startTileHighlight(tileIds, color = BROWSE_HIGHLIGHT_COLOR) {
  const meshes = tileIds.map((id) => tiles[id]?.mesh).filter(Boolean);
  const start = performance.now();
  let raf;
  function frame(now) {
    const t = (now - start) / 1000;
    const intensity = 0.35 + 0.25 * Math.sin(t * 2.4);
    for (const mesh of meshes) {
      mesh.material.emissive.setHex(color);
      mesh.material.emissiveIntensity = intensity;
    }
    raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);
  return () => {
    cancelAnimationFrame(raf);
    for (const mesh of meshes) {
      mesh.material.emissive.setHex(0x000000);
      mesh.material.emissiveIntensity = 0;
    }
  };
}

/**
 * 土地コマンドの「土地」: camera-work over just the given candidate tiles
 * (this turn's traversed path, or every owned tile if landed exactly on
 * START/EVENT - see Game._runLandCommand), which slowly blink/glow.
 * Tapping a candidate that's the player's own garrisoned land resolves
 * with its id, closing this camera-work session so Game._runLandBrowse can
 * open the vertical submenu over it. Tapping anything else just shows its
 * info inline, without closing camera-work, and keeps waiting for another
 * tap. Backing out via 戻る resolves null.
 */
function promptPickBrowseTile(candidates) {
  return new Promise((resolve) => {
    const camSnap = beginCameraWork();
    const byId = new Map(candidates.map((c) => [c.id, c]));
    const stopHighlight = startTileHighlight(candidates.map((c) => c.id));
    cameraWorkOverlay.classList.remove('hidden');

    function onCanvasClick(e) {
      const rect = canvas.getBoundingClientRect();
      const ndcX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const ndcY = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      if (scene.panDidMove) return; // 直前がドラッグ/ピンチなら選択しない
      const tile = scene.pickTileAt(ndcX, ndcY, tiles);
      const candidate = tile && byId.get(tile.id);
      if (!candidate) return;
      if (candidate.isMine) {
        finish(candidate.id);
      } else {
        tileInfoText.textContent = tileSummaryText(candidate);
        tileInfoModal.classList.remove('hidden');
      }
    }
    function onInfoClose() {
      tileInfoModal.classList.add('hidden');
    }
    function onUp() {
      scene.panByDirection('up');
    }
    function onDown() {
      scene.panByDirection('down');
    }
    function onLeft() {
      scene.panByDirection('left');
    }
    function onRight() {
      scene.panByDirection('right');
    }
    function onWorkBack() {
      finish(null);
    }
    function finish(result) {
      stopHighlight();
      cameraWorkOverlay.classList.add('hidden');
      tileInfoModal.classList.add('hidden');
      canvas.removeEventListener('click', onCanvasClick);
      camArrowUp.removeEventListener('click', onUp);
      camArrowDown.removeEventListener('click', onDown);
      camArrowLeft.removeEventListener('click', onLeft);
      camArrowRight.removeEventListener('click', onRight);
      camWorkBack.removeEventListener('click', onWorkBack);
      tileInfoClose.removeEventListener('click', onInfoClose);
      endCameraWork(camSnap);
      unregisterPromptCanceller(cancelSelf);
      resolve(result);
    }
    function cancelSelf() {
      finish(null);
    }

    canvas.addEventListener('click', onCanvasClick);
    camArrowUp.addEventListener('click', onUp);
    camArrowDown.addEventListener('click', onDown);
    camArrowLeft.addEventListener('click', onLeft);
    camArrowRight.addEventListener('click', onRight);
    camWorkBack.addEventListener('click', onWorkBack);
    tileInfoClose.addEventListener('click', onInfoClose);
    registerPromptCanceller(cancelSelf);
  });
}

function cardColor(card) {
  return card.type === CardType.MONSTER ? CARD_COLOR[card.element] : CARD_COLOR[card.type];
}

function hexColor(colorInt) {
  return `#${colorInt.toString(16).padStart(6, '0')}`;
}

/**
 * Maps players to the 4 HUD corner slots [TL, TR, BL, BR].
 * No alliances: turn order fills TL, TR, then wraps to BL (under TL) and
 * BR (under TR). With alliances: the team containing the first-turn player
 * takes the left column (leader TL, teammates stacked under at BL), the
 * next team takes the right column the same way - turn order within a
 * team doesn't matter for placement.
 */
function computePlayerSlots(players) {
  const hasAlliances = players.some((p) => p.allianceId != null);
  if (!hasAlliances) {
    return [players[0], players[1], players[2], players[3]];
  }

  const teams = [];
  const teamIndexByKey = new Map();
  for (const p of players) {
    const key = p.allianceId ?? `solo-${p.id}`;
    if (!teamIndexByKey.has(key)) {
      teamIndexByKey.set(key, teams.length);
      teams.push([]);
    }
    teams[teamIndexByKey.get(key)].push(p);
  }

  const [left = [], right = []] = teams;
  return [left[0], right[0], left[1], right[1]];
}

/** プレイヤー名の下に出すチェックポイント通過状況の番号列（暗い数字→そのチェックポイントを通過すると点灯）。checkpointNumbersが空/未指定（チェックポイントの無いマップ・データが来る前の初期フレーム等）なら何も出さない。 */
function checkpointRowHtml(checkpointNumbers, passedCheckpointNumbers) {
  if (!checkpointNumbers?.length) return '';
  const passed = new Set(passedCheckpointNumbers || []);
  const nums = checkpointNumbers
    .map((n) => `<span class="checkpoint-num${passed.has(n) ? ' lit' : ''}">${n}</span>`)
    .join('');
  return `<div class="player-checkpoints">${nums}</div>`;
}

function renderPlayerPanels(players, checkpointNumbers, goalCurrency = null) {
  const slots = computePlayerSlots(players);
  slots.forEach((player, i) => {
    const el = playerPanelEls[i];
    el.classList.toggle('hidden', !player);
    if (!player) return;

    el.style.setProperty('--player-color', hexColor(player.color));
    el.classList.toggle('player-defeated', !!player.defeated);
    // ゴールに到達していなくても総資産が目標Gに届いていれば、次にラップを
    // 完走した瞬間に即勝利が確定する（周回ボーナスでの目標達成チェックは
    // Game._checkGoalAchievement参照）。その「勝利確定間近」をひと目で
    // 分かるようパネルを点滅させる。
    el.classList.toggle('player-goal-reached', goalCurrency != null && !player.defeated && player.totalAssets >= goalCurrency);
    el.replaceChildren();

    const icon = document.createElement('div');
    icon.className = 'player-icon';

    const lines = document.createElement('div');
    lines.className = 'player-info-lines';
    lines.innerHTML = `
      <div class="player-name">${player.name}${player.defeated ? '（脱落）' : ''}</div>
      <div class="player-stat">所持 ${player.currency}G / 総資産 ${player.totalAssets}G</div>
      ${checkpointRowHtml(checkpointNumbers, player.passedCheckpointNumbers)}
    `;

    el.append(icon, lines);
    el.title = 'タップしてデッキ比率を表示';
    el.setAttribute('role', 'button');
    el.tabIndex = 0;
    const openDeckRatio = () => {
      deckRatioTitle.textContent = `${player.name}のデッキ比率`;
      renderDeckComposition(deckRatioContent, player.deckBreakdown || {});
      deckRatioModal.classList.remove('hidden');
    };
    el.onclick = openDeckRatio;
    el.onkeydown = (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        openDeckRatio();
      }
    };
  });
}

const DECK_RATIO_SEGMENTS = [
  { key: `monster:${Element.FIRE}`, label: '火モンスター', short: '火', color: '#e85d4a' },
  { key: `monster:${Element.WATER}`, label: '水モンスター', short: '水', color: '#388ad7' },
  { key: `monster:${Element.THUNDER}`, label: '雷モンスター', short: '雷', color: '#e7be37' },
  { key: `monster:${Element.FOREST}`, label: '森モンスター', short: '森', color: '#4ba65d' },
  { key: `monster:${Element.NEUTRAL}`, label: '無属性モンスター', short: '無', color: '#9aa0aa' },
  { key: CardType.GEAR, label: 'アイテム', short: 'アイテム', color: '#c67d3b' },
  { key: CardType.SPELL, label: 'スペル', short: 'スペル', color: '#9461d5' },
];

function deckBreakdownFromCards(cards) {
  return cards.reduce((counts, card) => {
    const key = card.type === CardType.MONSTER ? `monster:${card.element ?? Element.NEUTRAL}` : card.type;
    counts[key] = (counts[key] || 0) + 1;
    return counts;
  }, {});
}

function renderDeckComposition(container, breakdown) {
  const entries = DECK_RATIO_SEGMENTS.map((segment) => ({ ...segment, count: breakdown[segment.key] || 0 }));
  const total = entries.reduce((sum, entry) => sum + entry.count, 0);
  let cursor = 0;
  const stops = entries.filter((entry) => entry.count > 0).map((entry) => {
    const start = cursor;
    cursor += total ? (entry.count / total) * 100 : 0;
    return `${entry.color} ${start}% ${cursor}%`;
  });

  const chart = document.createElement('div');
  chart.className = 'deck-ratio-chart';
  chart.style.background = stops.length ? `conic-gradient(${stops.join(',')})` : '#303342';
  const center = document.createElement('span');
  center.innerHTML = `<strong>${total}</strong><small>枚</small>`;
  chart.appendChild(center);

  const legend = document.createElement('div');
  legend.className = 'deck-ratio-legend';
  for (const entry of entries) {
    const row = document.createElement('div');
    row.innerHTML = `<i style="--ratio-color:${entry.color}"></i><span>${entry.short}</span><strong>${entry.count}</strong>`;
    legend.appendChild(row);
  }
  container.replaceChildren(chart, legend);
}

deckRatioClose.addEventListener('click', () => deckRatioModal.classList.add('hidden'));
deckRatioModal.addEventListener('click', (event) => {
  if (event.target === deckRatioModal) deckRatioModal.classList.add('hidden');
});

/** Rarity badge (top-left) + type icon (top-right) + name, over the element/type background color. */
function renderCardEl(el, card, { showMonsterStats = false } = {}) {
  const artUrl = card.imageDataUrl || defaultCardArtUrl(card);
  if (artUrl) {
    el.style.backgroundColor = cardColor(card);
    el.style.backgroundImage = `linear-gradient(rgba(0,0,0,.12), rgba(0,0,0,.72)), url("${artUrl}")`;
    el.style.backgroundPosition = 'center, center';
    el.style.backgroundSize = `cover, ${card.imageFit === 'contain' ? 'contain' : 'cover'}`;
    el.style.backgroundRepeat = 'no-repeat, no-repeat';
  } else {
    el.style.background = cardColor(card);
  }
  el.replaceChildren();

  const rarity = document.createElement('span');
  rarity.className = 'card-rarity';
  rarity.textContent = card.rarity || Rarity.N;
  rarity.style.background = RARITY_COLOR[card.rarity] || RARITY_COLOR[Rarity.N];

  const typeIcon = document.createElement('span');
  typeIcon.className = 'card-type-icon';
  typeIcon.textContent = TYPE_ICON[card.type] || '';

  const name = document.createElement('span');
  name.className = 'card-name-text';
  name.textContent = card.name;

  el.append(rarity, typeIcon, name);
  if (showMonsterStats && card.type === CardType.MONSTER) {
    const stats = document.createElement('span');
    stats.className = 'card-hand-monster-stats';
    stats.innerHTML = `<span>❤️${card.hp ?? 0}</span><span>⚔️${card.atk ?? 0}</span>`;
    el.appendChild(stats);
  }
}

const TYPE_LABEL = {
  [CardType.MONSTER]: 'モンスター',
  [CardType.GEAR]: '武器防具',
  [CardType.SPELL]: 'スペル',
};

function describeCard(card) {
  return card.type === CardType.MONSTER
    ? `モンスター（${ELEMENT_LABEL[card.element]}属性）`
    : TYPE_LABEL[card.type];
}

const BATTLE_ITEM_TRAITS = [
  ['firstStrike', '先制'],
  ['lastStrike', '後攻'],
  ['pierce', '貫通'],
];

function signedItemBonus(value) {
  const amount = Number(value) || 0;
  return amount >= 0 ? `+${amount}` : String(amount);
}

function battleItemBonusText(card) {
  const atk = card.atkBonusRange
    ? `+${card.atkBonusRange[0]}〜${card.atkBonusRange[1]}`
    : signedItemBonus(card.atkBonus);
  return `ATK ${atk}　HP ${signedItemBonus(card.hpBonus)}`;
}

/** Richer, multi-line version for the card detail popup (image + description) - stats, not just the type/element blurb. */
function describeCardDetail(card) {
  const rarityText = `レア度: ${card.rarity || Rarity.N}`;
  const lines = [`${TYPE_LABEL[card.type]} / ${rarityText}`];
  if (card.type === CardType.MONSTER) {
    lines.push(`属性: ${card.element ? ELEMENT_LABEL[card.element] : '無属性'}`);
    lines.push(`ATK ${card.atk} / HP ${card.hp} / コスト ${card.cost}`);
  } else if (card.type === CardType.GEAR) {
    const atkText = card.atkBonusRange
      ? `+${card.atkBonusRange[0]}〜${card.atkBonusRange[1]}（ランダム）`
      : signedItemBonus(card.atkBonus);
    lines.push(`ATK ${atkText} / HP ${signedItemBonus(card.hpBonus)} / コスト ${card.cost}`);
  } else if (card.type === CardType.SPELL) {
    if (card.cost != null) lines.push(`コスト ${card.cost}`);
    if (card.addedAtk != null) lines.push(`ATK+${card.addedAtk} / HP+${card.addedHp}（永続）`);
  }
  const effectLabels = (card.traits || []).map((id) =>
    CARD_EFFECTS.find((effect) => effect.id === id)?.label
      || BATTLE_ITEM_TRAITS.find(([traitId]) => traitId === id)?.[1]
      || id);
  if (effectLabels.length) lines.push(`特殊効果: ${effectLabels.join('・')}`);
  if (card.effectDescription) lines.push(card.effectDescription);
  return lines.join('\n');
}

let cardDetailUseHandler = null;
let cardDetailReturnLayer = null;

function showCardDetail(card, onUse) {
  // 購入結果のような全画面オーバーレイ上から開く場合は、背面側を一時的に
  // 隠す。iOS/PWAでは別スタッキングコンテキストのz-indexが逆転することが
  // あるため、重ねるのではなく詳細を閉じた時に元画面へ戻す。
  const packResultLayer = document.getElementById('shop-pack-result');
  if (packResultLayer && !packResultLayer.classList.contains('hidden')) {
    cardDetailReturnLayer = packResultLayer;
    packResultLayer.classList.add('hidden');
  } else {
    cardDetailReturnLayer = null;
  }
  cardDetailCard.classList.remove('hidden');
  renderCardEl(cardDetailCard, card);
  cardDetailText.textContent = describeCardDetail(card);
  cardDetailUseHandler = onUse ?? null;
  cardDetailUse.classList.toggle('hidden', !onUse);
  cardDetailModal.classList.remove('hidden');
}

function showBreedPartDetail(part, ownedCount = null, equippedCount = null) {
  const packResultLayer = document.getElementById('shop-pack-result');
  if (packResultLayer && !packResultLayer.classList.contains('hidden')) {
    cardDetailReturnLayer = packResultLayer;
    packResultLayer.classList.add('hidden');
  } else {
    cardDetailReturnLayer = null;
  }
  cardDetailCard.classList.add('hidden');
  const counts = ownedCount == null
    ? ''
    : `\n所持: ${ownedCount}個 / 装着: ${equippedCount || 0}個`;
  cardDetailText.textContent = `${part.name}\nレアリティ: ${part.rarity}\n効果: ${describeBreedPart(part)}${counts}`;
  cardDetailUseHandler = null;
  cardDetailUse.classList.add('hidden');
  cardDetailModal.classList.remove('hidden');
}

cardDetailClose.addEventListener('click', () => {
  cardDetailModal.classList.add('hidden');
  cardDetailReturnLayer?.classList.remove('hidden');
  cardDetailReturnLayer = null;
});

cardDetailUse.addEventListener('click', () => {
  cardDetailModal.classList.add('hidden');
  cardDetailReturnLayer = null;
  cardDetailUseHandler?.();
});

function renderHand(hand, spellUsable = false) {
  handPanel.replaceChildren();
  for (const card of hand) {
    const el = document.createElement('div');
    el.className = 'card';
    el.style.pointerEvents = 'auto';
    renderCardEl(el, card, { showMonsterStats: true });
    const canUseThis = card.type === CardType.SPELL && spellUsable;
    el.addEventListener('click', () => {
      // サイコロを振り始めてから確定前に手札（コマンド選択）へ戻った場合は、
      // 回転を止めてリセットする（放置すると裏で回り続けてしまう）。
      if (diceState === 'spinning') resetDice();
      showCardDetail(card, canUseThis ? () => {
        el.classList.add('blinking');
        setTimeout(() => {
          if (pvpMatch && !pvpMatch.isHost) {
            pvpMatch.actionSender.send({ type: 'useSpell', cardId: card.id, playerId: pvpMatch.localPlayerId });
          } else {
            game.useSpell(card);
          }
        }, BLINK_MS);
      } : null);
    });
    handPanel.appendChild(el);
  }
}

/** Opponent hand shown face-up only while they are choosing a roll/spell. */
function renderCenterHand(hand) {
  centerHandEl.replaceChildren();
  for (const card of hand) {
    const el = document.createElement('div');
    el.className = 'card';
    renderCardEl(el, card, { showMonsterStats: true });

    el.setAttribute('aria-disabled', 'true');
    centerHandEl.appendChild(el);
  }
}

// Matches the CSS transition durations on #card-reveal-card.
const REVEAL_GROW_MS = 400;
const REVEAL_HOLD_MS = 2000;
const REVEAL_SHRINK_MS = 400;

/** Auto-advancing draw reveal: grows in from the center, holds, shrinks away. */
function promptCardReveal(card) {
  return new Promise((resolve) => {
    renderCardEl(cardRevealCard, card);
    cardRevealCard.classList.remove('show');
    cardRevealModal.classList.remove('hidden');

    // Force a reflow so the grow-in transition restarts cleanly even if a
    // reveal was still mid-animation from a moment ago.
    void cardRevealCard.offsetWidth;
    requestAnimationFrame(() => cardRevealCard.classList.add('show'));

    setTimeout(() => {
      cardRevealCard.classList.remove('show');
      setTimeout(() => {
        cardRevealModal.classList.add('hidden');
        resolve();
      }, REVEAL_SHRINK_MS);
    }, REVEAL_GROW_MS + REVEAL_HOLD_MS);
  });
}

const SPELL_EFFECT_MS = 1200;
let spellPresentationActive = false;

function setSpellPresentationActive(active) {
  spellPresentationActive = active;
  handPanel.classList.toggle('spell-hidden', active);
  syncCenterVisibility();
}

function promptPickLevelUp({ currentLevel, options }) {
  return new Promise((resolve) => {
    levelUpTitle.textContent = `現在Lv${currentLevel}　上げるレベルを選んでください`;
    levelUpChoices.replaceChildren();
    function cleanup(result) {
      levelUpModal.classList.add('hidden');
      levelUpCancel.removeEventListener('click', onCancel);
      unregisterPromptCanceller(cancelSelf);
      resolve(result);
    }
    const onCancel = () => cleanup(null);
    const cancelSelf = () => cleanup(null);
    for (const option of options) {
      const button = document.createElement('button');
      button.textContent = option.label;
      button.addEventListener('click', () => cleanup(option.targetLevel));
      levelUpChoices.appendChild(button);
    }
    levelUpModal.classList.remove('hidden');
    levelUpCancel.addEventListener('click', onCancel);
    registerPromptCanceller(cancelSelf);
  });
}

/** Placeholder for spell resolution - actual effects land with battle design in phase 2. */
function promptSpellUse(card) {
  return new Promise((resolve) => {
    setSpellPresentationActive(true);
    spellEffectText.textContent = `『${card.name}』発動！`;
    spellEffectModal.classList.remove('hidden');
    setTimeout(() => {
      spellEffectModal.classList.add('hidden');
      resolve();
    }, SPELL_EFFECT_MS);
  });
}

/** ゲスト側のプレイヤー駒スプライトを探す（pvpPieces、ホスト/ローカルではgame.players[].meshを使うのでここは通らない）。 */
function findPvpGuestPieceSprite(playerId) {
  return pvpPieces.get(playerId) ?? null;
}

/**
 * スペル使用時の演出: 「『カード名』発動！」ポップアップ（promptSpellUse）
 * の直後に呼ばれる。①キャスターへカメラをパン+ズームしオーラを出す
 * ②対象（プレイヤーまたはモンスター）があればそこへパン+ズームして
 * 震わせる ③元の見た目（フォーカス位置・ズーム倍率）へ戻す、の3段階。
 * 対象の実体（プレイヤー駒/モンスターアイコンのスプライト）が見つからない
 * 場合（PvPゲスト側はモンスターアイコンを描画していない等）は震わせず
 * 少し間を置くだけに留める。座標はgame.js側（`_buildSpellCastEffectPayload`）
 * が`{x,z}`まで解決済みなので、ホスト・ゲストどちらでも同じ処理で描画できる。
 */
async function showTargetEffectMessage(position, message, holdMs = 1800, variant = '') {
  if (!position || !message) return;
  const screen = scene.worldToScreen(position.x, PIECE_REST_Y + 1.8, position.z);
  const el = document.createElement('div');
  el.className = 'fx-target-effect-message';
  if (variant) el.classList.add(`fx-target-effect-${variant}`);
  el.textContent = message;
  el.style.left = `${screen.x}px`;
  el.style.top = `${screen.y}px`;
  fxLayer.appendChild(el);
  await new Promise((resolve) => setTimeout(resolve, holdMs));
  el.classList.add('fade-out');
  await new Promise((resolve) => setTimeout(resolve, 300));
  el.remove();
}

async function promptSpellCastEffect({ casterPosition, targetPlayerId, targetTileId, targetPosition, effectMessage }) {
  if (!scene || !casterPosition) return;
  const savedFocus = { x: scene.focus.x, z: scene.focus.z };
  const isPvpGuest = pvpMatch && !pvpMatch.isHost;

  await scene.focusAndZoom(casterPosition.x, casterPosition.z);
  await scene.playSpellAura(casterPosition);

  if (targetPosition) {
    await scene.focusAndZoom(targetPosition.x, targetPosition.z);
    await showTargetEffectMessage(targetPosition, effectMessage);
    const targetSprite = targetPlayerId != null
      ? (isPvpGuest ? findPvpGuestPieceSprite(targetPlayerId) : game?.players?.find((p) => p.id === targetPlayerId)?.mesh)
      : targetTileId != null
      ? tiles?.find((t) => t.id === targetTileId)?.unitMesh
      : null;
    if (targetSprite) {
      await scene.shakeSprite(targetSprite);
    } else {
      await new Promise((resolve) => setTimeout(resolve, 350));
    }
  }

  await scene.focusAndZoom(savedFocus.x, savedFocus.z, 1);
}

async function promptSummonEffect({ tileId, unitName }) {
  const tile = tiles.find((entry) => entry.id === tileId);
  if (!tile || !scene) return;
  const savedFocus = { x: scene.focus.x, z: scene.focus.z };
  await scene.focusAndZoom(tile.position.x, tile.position.z, 1.28, 320);
  await Promise.all([
    scene.playSummonBurst(tile.position),
    showTargetEffectMessage(tile.position, `${unitName} 召喚！`),
  ]);
  await scene.focusAndZoom(savedFocus.x, savedFocus.z, 1, 320);
}

async function promptTargetEffect({ tileId = null, playerId = null, position = null, message }) {
  const player = playerId != null ? game?.players?.find((entry) => entry.id === playerId) : null;
  const tile = tileId != null ? tiles.find((entry) => entry.id === tileId) : player ? tiles[player.tileId] : null;
  const targetPosition = position || tile?.position;
  if (!targetPosition || !scene) return;
  const savedFocus = { x: scene.focus.x, z: scene.focus.z };
  await scene.focusAndZoom(targetPosition.x, targetPosition.z, 1.35, 320);
  await showTargetEffectMessage(targetPosition, message);
  await scene.focusAndZoom(savedFocus.x, savedFocus.z, 1, 320);
}

/** ほこら停止時: 対象へ寄り、神秘的な光と効果名・結果を十分な時間表示する。 */
async function promptShrineEffect({ position, title, message }) {
  if (!scene || !position) return;
  const savedFocus = { x: scene.focus.x, z: scene.focus.z };
  await scene.focusAndZoom(position.x, position.z, 1.45, 360);
  const presentation = showTargetEffectMessage(position, `${title}\n${message}`, 2600, 'shrine');
  await Promise.all([
    scene.playSpellAura(position),
    scene.playSummonBurst(position),
    presentation,
  ]);
  await scene.focusAndZoom(savedFocus.x, savedFocus.z, 1, 360);
}

/** ワープ停止時: 発動地点へ寄り、駒を飛ばしながらカメラで追って結果を表示する。 */
async function promptWarpEffect({ playerId, sourcePosition, targetPosition }) {
  if (!scene || !sourcePosition || !targetPosition) return;
  const isPvpGuest = pvpMatch && !pvpMatch.isHost;
  const sprite = isPvpGuest
    ? findPvpGuestPieceSprite(playerId)
    : game?.players?.find((player) => player.id === playerId)?.mesh;
  await scene.focusAndZoom(sourcePosition.x, sourcePosition.z, 1.5, 380);
  await Promise.all([
    scene.playSpellAura(sourcePosition),
    scene.playSummonBurst(sourcePosition),
  ]);
  await scene.flyPieceTo(sprite, targetPosition);
  await Promise.all([
    scene.playSummonBurst(targetPosition),
    showTargetEffectMessage(targetPosition, 'ワープした', 1400),
  ]);
  await scene.focusAndZoom(targetPosition.x, targetPosition.z, 1, 320);
}

async function promptTurnFocus({ position }) {
  if (!scene || !position) return;
  await scene.focusAndZoom(position.x, position.z, 1, 420);
}

/** 「破産」の2文字をキャラの頭上に1.5秒表示する（showTargetEffectMessageと同じscreen座標変換だが、専用スタイル・専用の表示時間を持つので分けている）。 */
async function showBankruptcyText(position) {
  const screen = scene.worldToScreen(position.x, PIECE_REST_Y + 2.0, position.z);
  const el = document.createElement('div');
  el.className = 'fx-bankrupt-message';
  el.textContent = '破産';
  el.style.left = `${screen.x}px`;
  el.style.top = `${screen.y}px`;
  fxLayer.appendChild(el);
  await new Promise((resolve) => setTimeout(resolve, 1500));
  el.remove();
}

/**
 * 破産演出: 対象プレイヤーへカメラをクローズアップし、金色のバースト
 * （お金を放出するイメージ、playSummonBurst流用）+ 駒の振動 + 頭上に
 * 「破産」の2文字を1.5秒、同時に再生する。この後はgame.js側
 * （_triggerBankruptcy）が通常の破産処理（500Gで再スタート/ストーリー
 * 脱落）を続ける。
 */
async function promptBankruptcy({ playerId, playerName, position, startPosition = null, restartCurrency = 500 }) {
  if (!scene) return;
  const isPvpGuest = pvpMatch && !pvpMatch.isHost;
  const mesh = isPvpGuest ? findPvpGuestPieceSprite(playerId) : game?.players?.find((p) => p.id === playerId)?.mesh;
  const pos = position ?? (mesh ? { x: mesh.position.x, z: mesh.position.z } : null);
  if (!pos) return;

  playSfx('block');
  const savedFocus = { x: scene.focus.x, z: scene.focus.z };
  // ① 現在地でクローズアップ＋ゆれ＋大きく「破産」表示。
  await scene.focusAndZoom(pos.x, pos.z, 1.6, 400);
  await Promise.all([
    scene.playSummonBurst(pos),
    mesh ? scene.shakeSprite(mesh, 900) : Promise.resolve(),
    showBankruptcyText(pos),
  ]);
  // ② スタート地点へワープする演出＋「500Gで再スタート」メッセージ（通常戦のみ）。
  if (startPosition) {
    await scene.focusAndZoom(startPosition.x, startPosition.z, 1.5, 500);
    if (mesh) mesh.position.set(startPosition.x, PIECE_REST_Y, startPosition.z);
    await Promise.all([
      scene.playSummonBurst(startPosition),
      showBankruptcyRestartText(startPosition, restartCurrency),
    ]);
  }
  await scene.focusAndZoom(savedFocus.x, savedFocus.z, 1, 400);
}

async function showBankruptcyRestartText(position, amount) {
  const screen = scene.worldToScreen(position.x, PIECE_REST_Y + 2.0, position.z);
  const el = document.createElement('div');
  el.className = 'fx-bankrupt-restart';
  el.textContent = `${amount}Gで再スタート`;
  el.style.left = `${screen.x}px`;
  el.style.top = `${screen.y}px`;
  fxLayer.appendChild(el);
  await new Promise((resolve) => setTimeout(resolve, 1600));
  el.remove();
}

let stopMoveDestinationHighlight = null;
function promptMoveDestination({ tileId = null, tileIds = null, active }) {
  stopMoveDestinationHighlight?.();
  stopMoveDestinationHighlight = null;
  const ids = tileIds || (tileId != null ? [tileId] : []);
  const validIds = ids.filter((id) => tiles[id]);
  if (active && validIds.length) stopMoveDestinationHighlight = startTileHighlight(validIds, 0xffffff);
}

/** 通行料支払い: 支払者へ寄り、金額を飛び出させて2秒読ませる。 */
async function promptTollPayment({ position, amount }) {
  if (!scene || !position || !Number.isFinite(amount)) return;
  const savedFocus = { x: scene.focus.x, z: scene.focus.z };
  await scene.focusAndZoom(position.x, position.z, 1.35, 320);

  const screen = scene.worldToScreen(position.x, PIECE_REST_Y + 1.9, position.z);
  const amountEl = document.createElement('div');
  amountEl.className = 'fx-toll-payment';
  amountEl.textContent = `−${amount}G`;
  amountEl.style.left = `${screen.x}px`;
  amountEl.style.top = `${screen.y}px`;
  fxLayer.appendChild(amountEl);
  requestAnimationFrame(() => amountEl.classList.add('show'));

  await new Promise((resolve) => setTimeout(resolve, 2000));
  amountEl.classList.add('fade-out');
  await new Promise((resolve) => setTimeout(resolve, 250));
  amountEl.remove();
  await scene.focusAndZoom(savedFocus.x, savedFocus.z, 1, 320);
}

/** 土地レベルアップ: 対象土地へ寄り、強化光と通行料のカウントアップを見せる。 */
async function promptLandLevelUp({ position, playerName, element, previousLevel, newLevel, tollBefore, tollAfter }) {
  if (!scene || !position) return;
  const savedFocus = { x: scene.focus.x, z: scene.focus.z };
  await scene.focusAndZoom(position.x, position.z, 1.48, 360);
  const screen = scene.worldToScreen(position.x, PIECE_REST_Y + 1.5, position.z);
  const panel = document.createElement('div');
  panel.className = 'fx-land-level-up';
  panel.style.left = `${screen.x}px`;
  panel.style.top = `${screen.y}px`;
  const heading = document.createElement('strong');
  heading.textContent = 'LEVEL UP!';
  const detail = document.createElement('span');
  detail.textContent = `${playerName}の${ELEMENT_LABEL[element]}属性の土地　Lv${previousLevel} → Lv${newLevel}`;
  const toll = document.createElement('b');
  toll.textContent = `通行料 ${Math.round(tollBefore)}G`;
  panel.append(heading, detail, toll);
  fxLayer.appendChild(panel);
  requestAnimationFrame(() => panel.classList.add('show'));

  const duration = 1200;
  const startedAt = performance.now();
  const countUp = new Promise((resolve) => {
    const frame = (now) => {
      const progress = Math.min(1, (now - startedAt) / duration);
      const eased = 1 - ((1 - progress) ** 3);
      const value = Math.round(tollBefore + (tollAfter - tollBefore) * eased);
      toll.textContent = `通行料 ${value}G`;
      if (progress < 1) requestAnimationFrame(frame);
      else resolve();
    };
    requestAnimationFrame(frame);
  });
  await Promise.all([scene.playSpellAura(position), scene.playSummonBurst(position), countUp]);
  await new Promise((resolve) => setTimeout(resolve, 650));
  panel.classList.add('fade-out');
  await new Promise((resolve) => setTimeout(resolve, 250));
  panel.remove();
  await scene.focusAndZoom(savedFocus.x, savedFocus.z, 1, 320);
}

async function promptLandLoss({ position, landLabel, chainBefore, chainAfter, assetsBefore, assetsAfter }) {
  if (!scene || !position) return;
  const savedFocus = { x: scene.focus.x, z: scene.focus.z };
  await scene.focusAndZoom(position.x, position.z, 1.35, 320);
  const el = document.createElement('div');
  el.className = 'fx-land-loss';
  el.textContent = `${landLabel}：${chainBefore}連鎖→${chainAfter}連鎖\n総資産：${Math.round(assetsBefore)}G→${Math.round(assetsAfter)}G`;
  fxLayer.appendChild(el);
  await new Promise((resolve) => setTimeout(resolve, 2000));
  el.remove();
  await scene.focusAndZoom(savedFocus.x, savedFocus.z, 1, 320);
}

async function promptLandChain({ position, playerName, elementLabel, chainBefore, chainAfter, chainBonus }) {
  if (!scene || !position) return;
  const savedFocus = { x: scene.focus.x, z: scene.focus.z };
  await scene.focusAndZoom(position.x, position.z, 1.35, 320);
  const el = document.createElement('div');
  el.className = 'fx-land-loss fx-land-chain';
  el.textContent = `${playerName}の${elementLabel}属性 ${chainBefore}連鎖→${chainAfter}連鎖\n（連鎖ボーナス+${Math.round(chainBonus)}G）`;
  fxLayer.appendChild(el);
  await new Promise((resolve) => setTimeout(resolve, 1500));
  el.remove();
  await scene.focusAndZoom(savedFocus.x, savedFocus.z, 1, 320);
}

async function promptGoalAchieved({ position, playerName }) {
  if (!scene || !position) return;
  playSfx('fanfare');
  const savedFocus = { x: scene.focus.x, z: scene.focus.z };
  await scene.focusAndZoom(position.x, position.z, 1.45, 420);
  const message = document.createElement('div');
  message.className = 'fx-goal-achieved';
  const heading = document.createElement('strong');
  heading.textContent = 'CONGRATULATIONS!';
  const detail = document.createElement('span');
  detail.textContent = `${playerName}は目標を達成しました。`;
  message.append(heading, detail);
  fxLayer.appendChild(message);
  await Promise.all([scene.playBlessingLight(position), new Promise((resolve) => setTimeout(resolve, 2600))]);
  message.remove();
  await scene.focusAndZoom(savedFocus.x, savedFocus.z, 1, 320);
}

function finishSpellPresentation() {
  spellEffectModal.classList.add('hidden');
  setSpellPresentationActive(false);
}

const MATCHUP_LABEL = {
  advantage: '有利！攻撃1.2倍',
  disadvantage: '不利…被ダメージ1.2倍',
};

const BATTLE_FADE_MS = 450;
const BATTLE_STAGE_REVEAL_MS = 450;
// 2026-08-13: 「文字が進むのが早すぎて読めない」との指摘で1500→2600に延長
// （攻撃メッセージ・決着メッセージ両方がこの1定数を共用している）。
// 戦闘中の数値・能力メッセージを読める時間を確保し、連続行動の間にも
// 一呼吸置く。オンライン対戦でも各クライアントが同じPromiseを待つ。
const BATTLE_MESSAGE_HOLD_MS = 3400;
const BATTLE_ACTION_GAP_MS = 550;
const BATTLE_RETREAT_MS = 600;
const BATTLE_FADE_OUT_MS = 450;

/** Resets one side's panel/card/item-overlay/matchup-label to a fresh state and fills in this battle's base stats + bonuses. */
function renderBattleStat(sideEls, data) {
  sideEls.owner.textContent = data.ownerName;
  sideEls.hp.textContent = data.hp;
  sideEls.hp.dataset.current = String(data.hp + (data.elementHp || 0));
  sideEls.hp.dataset.max = String(data.hp + (data.elementHp || 0));
  sideEls.hpFill.style.width = '100%';
  sideEls.atk.textContent = data.atk;
  sideEls.atk.dataset.built = 'false';
  sideEls.atkFill.style.width = `${Math.min(100, ((data.atk + (data.cheerAtk || 0)) / 150) * 100)}%`;
  sideEls.hpBonus.classList.toggle('hidden', !(data.elementHp > 0));
  if (data.elementHp > 0) sideEls.hpBonus.textContent = `+${data.elementHp}`;
  sideEls.atkBonus.classList.toggle('hidden', !(data.cheerAtk > 0));
  if (data.cheerAtk > 0) sideEls.atkBonus.textContent = `+${data.cheerAtk}`;
  renderCardEl(sideEls.card, data.card);
  sideEls.card.classList.remove('battle-crumble');
  sideEls.item.classList.add('hidden');
  sideEls.item.classList.remove('equip-show');
  sideEls.item.replaceChildren();
  const matchupText = MATCHUP_LABEL[data.matchup];
  sideEls.matchup.classList.add('hidden');
  sideEls.matchup.classList.remove('advantage', 'disadvantage');
  if (matchupText) {
    sideEls.matchup.textContent = matchupText;
    sideEls.matchup.classList.add(data.matchup);
  }
  sideEls.el.classList.remove('battle-attacking', 'battle-hit', 'battle-retreat');
}

/**
 * バトルフェーズ開始: 暗転してから攻撃側(左)・防御側(右)のカードと基礎
 * ステータス（応援/同属性ボーナスは基礎数値の横に＋◯◯で表示、有利/不利
 * 属性はカード下部に表示）を見せる。アイテムはまだこの時点では一切表示
 * しない（選択・使用時に初めて出る）。
 */
function promptBattleSceneEnter({ attacker, defender }) {
  return new Promise((resolve) => {
    playBattleTheme();
    battleSceneModal.classList.remove('hidden');
    battleStage.classList.remove('show');
    battleMessageText.classList.add('hidden');
    battleFade.classList.remove('show');
    renderBattleStat(battleSide.attacker, attacker);
    renderBattleStat(battleSide.defender, defender);

    // Force a reflow so the fade-in transition restarts cleanly even if a
    // battle scene was still mid-animation from a moment ago.
    void battleFade.offsetWidth;
    battleFade.classList.add('show');
    setTimeout(() => {
      battleStage.classList.add('show');
      setTimeout(resolve, BATTLE_STAGE_REVEAL_MS);
    }, BATTLE_FADE_MS);
  });
}

/**
 * 自分側のアイテムは選択可能、相手側の所持アイテムは確認専用で全て表示する。
 * 相手が実際に選んだカードは装備公開まで一切表示せず、後から選ぶ側が結果を
 * 見て決められない既存の秘匿フローを維持する。「使わない」はnullを返す。
 */
let cancelActiveBattleItemPicker = null;

function promptPickBattleItem({ hand, opponentHand = [], side, ownerName, opponentName = '相手', unitName }) {
  return new Promise((resolve) => {
    let settled = false;
    let confirming = false;
    battleItemPickerTitle.textContent =
      hand.length > 0 ? `${ownerName}の${unitName}: 使うアイテムを選んでください` : `${ownerName}の${unitName}: アイテムがありません`;
    battleItemPickerChoices.replaceChildren();
    for (const card of hand) {
      const choice = document.createElement('div');
      choice.className = 'battle-item-choice';
      choice.tabIndex = 0;
      choice.setAttribute('role', 'button');
      choice.setAttribute('aria-label', `${card.name}の詳細を確認して装備する`);
      const el = document.createElement('div');
      el.className = 'card';
      renderCardEl(el, card);
      const bonus = document.createElement('div');
      bonus.className = 'battle-item-bonus';
      bonus.textContent = battleItemBonusText(card);
      const traits = document.createElement('div');
      traits.className = 'battle-item-traits';
      for (const [traitId, label] of BATTLE_ITEM_TRAITS) {
        const trait = document.createElement('span');
        const active = card.traits?.includes(traitId);
        trait.className = active ? 'active' : '';
        trait.textContent = `${label}${active ? '●' : '－'}`;
        traits.appendChild(trait);
      }
      const chooseItem = () => {
        if (confirming) return;
        confirming = true;
        choice.classList.add('blinking');
        setTimeout(async () => {
          choice.classList.remove('blinking');
          const confirmed = await promptConfirmAction({ actionType: 'equip', card });
          confirming = false;
          if (confirmed) cleanup(card);
        }, BLINK_MS);
      };
      choice.addEventListener('click', chooseItem);
      choice.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        chooseItem();
      });
      choice.append(el, bonus, traits);
      battleItemPickerChoices.appendChild(choice);
    }

    // 本家同様、相手が手札に持つアイテムは公開情報として確認できる。
    // ここは閲覧専用で、相手が実際にどれを選んだかを示す状態は一切持たない。
    battleOpponentItemsTitle.textContent = `${opponentName}の所持アイテム（選択内容は非公開）`;
    battleOpponentItemsChoices.replaceChildren();
    for (const card of opponentHand) {
      const preview = document.createElement('div');
      preview.className = 'battle-opponent-item-preview';
      const el = document.createElement('div');
      el.className = 'card';
      renderCardEl(el, card);
      const name = document.createElement('span');
      name.textContent = card.name;
      preview.append(el, name);
      battleOpponentItemsChoices.appendChild(preview);
    }
    if (opponentHand.length === 0) {
      const empty = document.createElement('span');
      empty.className = 'battle-opponent-items-empty';
      empty.textContent = 'アイテムなし';
      battleOpponentItemsChoices.appendChild(empty);
    }
    battleOpponentItems.classList.remove('hidden');
    battleItemPickerBox.classList.remove('hidden');

    function cleanup(result) {
      if (settled) return;
      settled = true;
      battleItemPickerBox.classList.add('hidden');
      battleOpponentItems.classList.add('hidden');
      battleItemPickerSkip.removeEventListener('click', onSkip);
      if (cancelActiveBattleItemPicker === cancelPicker) cancelActiveBattleItemPicker = null;
      resolve(result);
    }
    function cancelPicker() {
      cleanup(null);
    }
    function onSkip() {
      cleanup(null);
    }
    battleItemPickerSkip.addEventListener('click', onSkip);
    cancelActiveBattleItemPicker = cancelPicker;
  });
}

/**
 * One side's strike: its item (if used) appears at 1/4 size over its own
 * card's top-left corner, the target's card flashes/shakes, the damage
 * calculation message shows for BATTLE_MESSAGE_HOLD_MS, and the target's
 * displayed HP updates to match. If the target died, its card crumbles
 * from the bottom during that same hold.
 *
 * `special`（先制発動・毒付与・G略奪・即死・反射等、この一撃で発動した
 * 特殊効果のメッセージ配列、battle.jsのresolveBattleが積む）が1件以上
 * あれば、通常の淡々としたダメージ表示ではなく「特殊効果が発動した瞬間」
 * として目立たせる: メッセージを一回り大きく表示し、発動した側（この一撃
 * を放った側=attackerEls）のカードを一瞬拡大させて光らせる。
 */
async function promptBattleAttack({ side, item, message, damage = 0, element, attackPower = 0, elementMultiplier = 1, targetHp, targetDied, special, targetName }) {
    const attackerEls = battleSide[side];
    const targetEls = battleSide[side === 'attacker' ? 'defender' : 'attacker'];
    const hasSpecial = Array.isArray(special) && special.length > 0;

    if (item) {
      const el = document.createElement('div');
      el.className = 'card';
      renderCardEl(el, item);
      attackerEls.item.replaceChildren(el);
      attackerEls.item.classList.remove('hidden');
    }

    // 攻撃直前に現在値を確定し、得意属性なら120%分を段階的に加算してから
    // 光線・ダメージへ進む。連続攻撃では同じ加算演出を繰り返さない。
    if (attackerEls.atk.dataset.built !== 'true') {
      attackerEls.atk.textContent = String(attackPower);
      attackerEls.atkBonus.classList.add('hidden');
      attackerEls.atkFill.style.width = `${Math.min(100, (attackPower / 150) * 100)}%`;
      await new Promise((resolve) => setTimeout(resolve, 500));
      if (elementMultiplier > 1) {
        const elementBonus = Math.round(attackPower * (elementMultiplier - 1));
        attackerEls.atkBonus.textContent = `+${elementBonus}`;
        attackerEls.atkBonus.classList.remove('hidden');
        attackerEls.matchup.textContent = `得意属性120% +${elementBonus}`;
        attackerEls.matchup.classList.remove('hidden');
        attackerEls.atkFill.style.width = `${Math.min(100, ((attackPower + elementBonus) / 150) * 100)}%`;
        battleMessageText.textContent = `得意属性120%　ATK ${attackPower} + ${elementBonus} = ${attackPower + elementBonus}`;
        battleMessageText.classList.remove('hidden');
        await new Promise((resolve) => setTimeout(resolve, 1300));
        battleMessageText.classList.add('hidden');
      }
      attackerEls.atk.dataset.built = 'true';
    }

    attackerEls.el.classList.add('battle-attacking');
    await playBattleElementBeam(attackerEls.card, targetEls.card, CARD_COLOR[element] || '#ffffff');
    if (damage > 0) await showBattleDamageNumber(targetEls.card, damage);
    targetEls.el.classList.add('battle-hit');
    await animateBattleHp(targetEls, Math.max(targetHp, 0));
    battleMessageText.textContent = hasSpecial ? `${special.join(' / ')}\n${message}` : message;
    battleMessageText.classList.toggle('special', hasSpecial);
    battleMessageText.classList.remove('hidden');
    if (hasSpecial) attackerEls.el.classList.add('battle-special-glow');
    if (targetDied) {
      await new Promise((resolve) => setTimeout(resolve, 1800));
      targetEls.card.classList.add('battle-crumble');
      battleMessageText.textContent = `${targetName || 'モンスター'}は倒された`;
      await new Promise((resolve) => setTimeout(resolve, 1000));
    } else {
      await new Promise((resolve) => setTimeout(resolve, BATTLE_MESSAGE_HOLD_MS));
    }
    attackerEls.el.classList.remove('battle-attacking', 'battle-special-glow');
    targetEls.el.classList.remove('battle-hit');
    battleMessageText.classList.add('hidden');
    battleMessageText.classList.remove('special');
    await new Promise((resolve) => setTimeout(resolve, BATTLE_ACTION_GAP_MS));
}

async function promptBattleEquip({ side, item, unitName, baseAtk, baseHp, existingAtkBonus = 0, existingHpBonus = 0 }) {
  const sideEls = battleSide[side];
  const card = document.createElement('div');
  card.className = 'card';
  renderCardEl(card, item);
  sideEls.item.replaceChildren(card);
  sideEls.item.classList.remove('hidden');
  sideEls.item.classList.add('equip-show');

  const itemAtk = Number(item.atkBonus || 0);
  const itemHp = Number(item.hpBonus || 0);
  const atkBonus = existingAtkBonus + itemAtk;
  const hpBonus = existingHpBonus + itemHp;
  battleMessageText.textContent = `${unitName}は${item.name}を装備した`;
  battleMessageText.classList.remove('hidden');
  sideEls.atkBonus.textContent = atkBonus > 0 ? `+${atkBonus}` : '';
  sideEls.atkBonus.classList.toggle('hidden', atkBonus <= 0);
  sideEls.hpBonus.textContent = hpBonus > 0 ? `+${hpBonus}` : '';
  sideEls.hpBonus.classList.toggle('hidden', hpBonus <= 0);
  sideEls.atk.textContent = String(baseAtk);
  sideEls.hp.textContent = String(baseHp);
  sideEls.atkFill.style.width = `${Math.min(100, ((baseAtk + atkBonus) / 150) * 100)}%`;

  const previousMax = Number(sideEls.hp.dataset.max) || baseHp;
  const nextMax = baseHp + hpBonus;
  sideEls.hp.dataset.current = String(nextMax);
  sideEls.hp.dataset.max = String(nextMax);
  sideEls.hpFill.style.width = `${Math.min(100, (previousMax / Math.max(nextMax, 1)) * 100)}%`;
  requestAnimationFrame(() => { sideEls.hpFill.style.width = '100%'; });
  sideEls.el.classList.add('battle-equip-boost');
  await new Promise((resolve) => setTimeout(resolve, 1800));
  sideEls.el.classList.remove('battle-equip-boost');
  battleMessageText.classList.add('hidden');
}

/** ステゴロ/海賊S: 攻撃開始前に対象の装備画像を砕いて消す。 */
async function promptBattleItemDestroy({ targetSide, sourceName = 'アイテム破壊', items = [] }) {
  const targetEls = battleSide[targetSide];
  if (!targetEls || items.length === 0) return;
  const item = items[items.length - 1];
  const rect = targetEls.item.getBoundingClientRect();

  battleMessageText.textContent = `${sourceName}が発動！\n${item.name}は破壊された`;
  battleMessageText.classList.add('special');
  battleMessageText.classList.remove('hidden');
  targetEls.item.classList.add('battle-item-breaking');

  const shatter = document.createElement('div');
  shatter.className = 'battle-item-shatter';
  shatter.style.left = `${rect.left + rect.width / 2}px`;
  shatter.style.top = `${rect.top + rect.height / 2}px`;
  const pieces = [
    ['piece-tl', '-42px', '-48px', '-24deg'],
    ['piece-tr', '45px', '-42px', '28deg'],
    ['piece-bl', '-38px', '52px', '-18deg'],
    ['piece-br', '43px', '55px', '32deg'],
  ];
  for (const [className, dx, dy, rot] of pieces) {
    const piece = document.createElement('div');
    piece.className = `battle-item-shard ${className}`;
    piece.style.setProperty('--shard-x', dx);
    piece.style.setProperty('--shard-y', dy);
    piece.style.setProperty('--shard-r', rot);
    const card = document.createElement('div');
    card.className = 'card';
    renderCardEl(card, item);
    piece.appendChild(card);
    shatter.appendChild(piece);
  }
  document.body.appendChild(shatter);
  requestAnimationFrame(() => shatter.classList.add('shattering'));
  await new Promise((resolve) => setTimeout(resolve, 850));

  targetEls.item.classList.remove('battle-item-breaking', 'equip-show');
  targetEls.item.classList.add('hidden');
  targetEls.item.replaceChildren();
  shatter.remove();
  await new Promise((resolve) => setTimeout(resolve, 650));
  battleMessageText.classList.add('hidden');
  battleMessageText.classList.remove('special');
}

/** 真剣白刃取り: 奪われた装備カードを相手側から使用者側へ飛ばして移動させる。 */
async function promptBattleItemSteal({ fromSide, toSide, items = [] }) {
  const fromEls = battleSide[fromSide];
  const toEls = battleSide[toSide];
  if (!fromEls || !toEls || items.length === 0) return;

  const item = items[items.length - 1];
  battleMessageText.textContent = `真剣白刃取りが発動！\n${item.name}を奪った`;
  battleMessageText.classList.add('special');
  battleMessageText.classList.remove('hidden');

  const sourceRect = fromEls.item.getBoundingClientRect();
  const targetRect = toEls.card.getBoundingClientRect();
  const flying = document.createElement('div');
  flying.className = 'battle-stolen-item-flying';
  const card = document.createElement('div');
  card.className = 'card';
  renderCardEl(card, item);
  flying.appendChild(card);
  flying.style.left = `${sourceRect.left + sourceRect.width / 2}px`;
  flying.style.top = `${sourceRect.top + sourceRect.height / 2}px`;
  document.body.appendChild(flying);

  await new Promise((resolve) => requestAnimationFrame(() => {
    flying.style.transform = `translate(${targetRect.left + targetRect.width / 2 - sourceRect.left - sourceRect.width / 2}px, ${targetRect.top + targetRect.height / 2 - sourceRect.top - sourceRect.height / 2}px) scale(1.08) rotate(${toSide === 'attacker' ? '-8deg' : '8deg'})`;
    flying.classList.add('moving');
    setTimeout(resolve, 900);
  }));

  fromEls.item.classList.add('hidden');
  fromEls.item.replaceChildren();
  flying.remove();
  const stolenCard = document.createElement('div');
  stolenCard.className = 'card battle-stolen-item';
  renderCardEl(stolenCard, item);
  toEls.item.appendChild(stolenCard);
  toEls.item.classList.remove('hidden');
  toEls.item.classList.add('equip-show');
  await new Promise((resolve) => setTimeout(resolve, 900));
  battleMessageText.classList.add('hidden');
  battleMessageText.classList.remove('special');
}

/** 先制/後攻/貫通の発動演出: 該当カードを一時的に10%拡大しラベルを1.5秒表示してから元に戻す。 */
async function promptBattleTraitReveal({ side, labels }) {
  const sideEls = battleSide[side];
  if (!sideEls || !labels || labels.length === 0) return;
  battleMessageText.textContent = labels.join('\n');
  battleMessageText.classList.remove('hidden');
  battleMessageText.classList.add('special');
  sideEls.card.classList.add('trait-reveal');
  await new Promise((resolve) => setTimeout(resolve, 1500));
  sideEls.card.classList.remove('trait-reveal');
  battleMessageText.classList.add('hidden');
  battleMessageText.classList.remove('special');
}

function playBattleElementBeam(sourceCard, targetCard, color) {
  return new Promise((resolve) => {
    const layerRect = fxLayer.getBoundingClientRect();
    const from = sourceCard.getBoundingClientRect();
    const to = targetCard.getBoundingClientRect();
    const x1 = from.left + from.width / 2 - layerRect.left;
    const y1 = from.top + from.height / 2 - layerRect.top;
    const x2 = to.left + to.width / 2 - layerRect.left;
    const y2 = to.top + to.height / 2 - layerRect.top;
    const beam = document.createElement('div');
    beam.className = 'battle-element-beam';
    beam.style.left = `${x1}px`;
    beam.style.top = `${y1}px`;
    beam.style.width = `${Math.hypot(x2 - x1, y2 - y1)}px`;
    beam.style.setProperty('--beam-color', color);
    beam.style.setProperty('--beam-angle', `${Math.atan2(y2 - y1, x2 - x1)}rad`);
    fxLayer.appendChild(beam);
    requestAnimationFrame(() => beam.classList.add('show'));
    setTimeout(() => {
      beam.classList.add('fade-out');
      setTimeout(() => { beam.remove(); resolve(); }, 180);
    }, 520);
  });
}

function showBattleDamageNumber(targetCard, damage) {
  return new Promise((resolve) => {
    const layerRect = fxLayer.getBoundingClientRect();
    const rect = targetCard.getBoundingClientRect();
    const el = document.createElement('div');
    el.className = 'battle-damage-number';
    el.textContent = `−${damage}`;
    el.style.left = `${rect.left + rect.width / 2 - layerRect.left}px`;
    el.style.top = `${rect.top + rect.height * 0.35 - layerRect.top}px`;
    fxLayer.appendChild(el);
    el.addEventListener('animationend', () => { el.remove(); resolve(); }, { once: true });
  });
}

function animateBattleHp(targetEls, targetHp) {
  const from = Number(targetEls.hp.dataset.current ?? targetEls.hp.textContent) || 0;
  targetEls.hpBonus.classList.add('hidden');
  return new Promise((resolve) => {
    const started = performance.now();
    const duration = 650;
    function frame(now) {
      const t = Math.min(1, (now - started) / duration);
      const value = Math.round(from + (targetHp - from) * t);
      targetEls.hp.textContent = String(value);
      const maxHp = Number(targetEls.hp.dataset.max) || Math.max(from, 1);
      targetEls.hpFill.style.width = `${Math.max(0, Math.min(100, (value / maxHp) * 100))}%`;
      if (t < 1) requestAnimationFrame(frame);
      else {
        targetEls.hp.dataset.current = String(targetHp);
        resolve();
      }
    }
    requestAnimationFrame(frame);
  });
}

/** 直接ダメージ系の土地コマンド（火炎瓶男/センチネル等）用の演出: 対象マスへ火の玉を落としてから、ダメージ数値をぴょんと跳ねさせて約1秒表示する。tileIdはFirestore中継できるようgame.js側で本物のtileオブジェクトの代わりに渡されるので、ここでローカルのtiles配列から引き直す。 */
function promptDamageEffect({ tileId, damage, targetDied = false, targetName = '' }) {
  playSfx(damage > 0 ? 'hit' : 'block');
  const tile = tiles.find((t) => t.id === tileId);
  if (!tile) return Promise.resolve();
  return playDamageEffect(tile, damage, { targetDied, targetName });
}

async function playDamageEffect(tile, damage, { targetDied = false, targetName = '' } = {}) {
  const savedFocus = { x: scene.focus.x, z: scene.focus.z };
  await scene.focusAndZoom(tile.position.x, tile.position.z, 1.35, 320);
  await scene.playFireballImpact(tile.position);
  await showDamageNumber(tile, damage);
  if (targetDied) await showDefeatMessage(tile, `${targetName}は倒された`);
  await scene.focusAndZoom(savedFocus.x, savedFocus.z, 1, 320);
}

async function showDefeatMessage(tile, message) {
  const pos = scene.worldToScreen(tile.position.x, PIECE_REST_Y + 1.8, tile.position.z);
  const el = document.createElement('div');
  el.className = 'fx-defeat-message';
  el.textContent = message;
  el.style.left = `${pos.x}px`;
  el.style.top = `${pos.y}px`;
  fxLayer.appendChild(el);
  await new Promise((resolve) => setTimeout(resolve, 1000));
  el.remove();
}

/** ダメージ数値のポップアップ（DOM）。3D座標をscene.worldToScreenで画面座標に変換し、CSSのfx-damage-popアニメーション（跳ねる→約1秒静止→フェードアウト）が終わったらresolveする。 */
function showDamageNumber(tile, damage) {
  return new Promise((resolve) => {
    const pos = scene.worldToScreen(tile.position.x, PIECE_REST_Y + 1.2, tile.position.z);
    const el = document.createElement('div');
    el.className = 'fx-damage-number';
    el.textContent = `-${damage}`;
    el.style.left = `${pos.x}px`;
    el.style.top = `${pos.y}px`;
    fxLayer.appendChild(el);
    el.addEventListener(
      'animationend',
      () => {
        el.remove();
        resolve();
      },
      { once: true },
    );
  });
}

/** 引き分け（両者生存）専用の演出: 決着メッセージの前に、両陣営のカードをそれぞれ自分の側の画面外へ退避させる。 */
function promptBattleRetreat() {
  return new Promise((resolve) => {
    battleSide.attacker.el.classList.add('battle-retreat');
    battleSide.defender.el.classList.add('battle-retreat');
    setTimeout(resolve, BATTLE_RETREAT_MS);
  });
}

/** "〇〇の□□は土地を奪った/守った" - holds 1.5秒, then fades the whole battle scene back out to the board. */
function promptBattleOutcome({ won, mutualDestruction, ownerName, unitName }) {
  playSfx('hit');
  return new Promise((resolve) => {
    battleMessageText.textContent = mutualDestruction
      ? '誰も生き残らなかった'
      : `${ownerName}の${unitName}は${won ? '土地を奪った' : '土地を守った'}`;
    battleMessageText.classList.remove('hidden');
    setTimeout(() => {
      battleStage.classList.remove('show');
      battleFade.classList.remove('show');
      setTimeout(() => {
        battleMessageText.classList.add('hidden');
        battleSceneModal.classList.add('hidden');
        playMapTheme(currentMapId);
        resolve();
      }, BATTLE_FADE_OUT_MS);
    }, BATTLE_MESSAGE_HOLD_MS);
  });
}

/** "「card.name」を捨てますか？" yes/no, reusing the same confirm modal as land-command actions. */
/** Generic はい/いいえ confirm, reusing the same confirm-modal DOM as land-command actions (never active at the same time as those). */
function confirmYesNo(text) {
  return new Promise((resolve) => {
    // ショップなどpre-game画面から呼ぶ時、confirm-modalの本来の親#appは
    // hiddenなので、そのままでは確認画面も一緒に消える。確認中だけbody直下へ
    // 移し、閉じたら元のDOM位置へ戻す。
    const originalParent = confirmModal.parentNode;
    const originalNextSibling = confirmModal.nextSibling;
    const moveToFront = appEl.classList.contains('hidden') && originalParent === appEl;
    if (moveToFront) {
      document.body.appendChild(confirmModal);
      confirmModal.classList.add('global-confirm');
    }
    confirmText.textContent = text;
    confirmModal.classList.remove('hidden');

    function cleanup(result) {
      confirmModal.classList.add('hidden');
      if (moveToFront) {
        confirmModal.classList.remove('global-confirm');
        originalParent.insertBefore(confirmModal, originalNextSibling);
      }
      confirmYes.removeEventListener('click', onYes);
      confirmNo.removeEventListener('click', onNo);
      unregisterPromptCanceller(cancelSelf);
      resolve(result);
    }
    function onYes() {
      cleanup(true);
    }
    function onNo() {
      cleanup(false);
    }
    function cancelSelf() {
      cleanup(false);
    }
    confirmYes.addEventListener('click', onYes);
    confirmNo.addEventListener('click', onNo);
    registerPromptCanceller(cancelSelf);
  });
}

/** カードを選ぶと画像・効果詳細と捨てる確認を同じモーダル内に表示する。 */
function promptDiscardChoice(hand) {
  return new Promise((resolve) => {
    // キャンセル操作は本来存在しない（手札上限は強制）が、退出時は
    // _isCancelled側で処理を打ち切るので、ここでは先頭のカードを返して
    // 待機を解くだけでよい。
    function cancelSelf() {
      finish(hand[0] ?? null);
    }
    function finish(card) {
      discardConfirmYes.removeEventListener('click', onYes);
      discardConfirmNo.removeEventListener('click', onNo);
      discardModal.classList.add('hidden');
      unregisterPromptCanceller(cancelSelf);
      resolve(card);
    }

    discardHint.textContent = '手札が7枚になりました。捨てるカードを選んでください';
    discardChoices.replaceChildren();
    discardChoices.classList.remove('hidden');
    discardHint.classList.remove('hidden');
    discardConfirm.classList.add('hidden');

    function showPicker() {
      discardConfirm.classList.add('hidden');
      discardChoices.classList.remove('hidden');
      discardHint.classList.remove('hidden');
    }

    let onYes = () => {};
    let onNo = () => {};
    function showConfirmation(card) {
      renderCardEl(discardConfirmCard, card);
      discardConfirmDetail.textContent = describeCardDetail(card);
      discardChoices.classList.add('hidden');
      discardHint.classList.add('hidden');
      discardConfirm.classList.remove('hidden');

      discardConfirmYes.removeEventListener('click', onYes);
      discardConfirmNo.removeEventListener('click', onNo);
      onYes = () => finish(card);
      onNo = () => {
        discardConfirmYes.removeEventListener('click', onYes);
        discardConfirmNo.removeEventListener('click', onNo);
        showPicker();
      };
      discardConfirmYes.addEventListener('click', onYes);
      discardConfirmNo.addEventListener('click', onNo);
    }

    for (const card of hand) {
      const el = document.createElement('button');
      el.className = 'card';
      renderCardEl(el, card);
      el.addEventListener('click', () => showConfirmation(card));
      discardChoices.appendChild(el);
    }
    discardModal.classList.remove('hidden');
    registerPromptCanceller(cancelSelf);
  });
}

const DICE_FACES = {
  1: ['c'],
  2: ['tl', 'br'],
  3: ['tl', 'c', 'br'],
  4: ['tl', 'tr', 'bl', 'br'],
  5: ['tl', 'tr', 'c', 'bl', 'br'],
  6: ['tl', 'tr', 'ml', 'mr', 'bl', 'br'],
};
const dicePips = diceButton.querySelectorAll('.pip');

function setDiceFace(value) {
  const active = new Set(DICE_FACES[value]);
  dicePips.forEach((pip) => {
    pip.style.opacity = active.has(pip.dataset.pos) ? '1' : '0';
  });
}

const DICE_SPIN_INTERVAL_MS = 90;
// Time from the stop trigger (2nd click, or CPU's auto-stop) until the face
// actually locks - the dice keeps spinning through this window, so it's a
// timing/skill stop rather than an instant one.
const DICE_STOP_DELAY_MS = 300;
// How long the locked face sits on screen (hand and dice both unchanged)
// before the move actually starts.
const DICE_RESULT_HOLD_MS = 1500;

// idle -> (click) -> spinning -> (click) -> locking -> settles + holds, then rollDice() fires
let diceState = 'idle';
let diceValue = 1;
let diceSpinTimer = null;
let fixedDiceValue = null;

// The hand hides the moment the roll starts (game's showCenter goes false),
// but the dice itself stays up through the whole move animation and only
// clears once the piece actually reaches its tile.
let showCenterState = false;
let diceMoving = false;
let centerShowsOpponent = false;
let dicePromptDismissed = false;

function syncCenterVisibility() {
  centerPanel.classList.toggle('hidden', spellPresentationActive || !(showCenterState || diceMoving));
  centerPanel.classList.toggle('opponent-turn', centerShowsOpponent);
  centerPanel.classList.toggle('local-turn', !centerShowsOpponent);
  // visibility (not display) so the hand keeps reserving its layout space -
  // hiding it must never shift the dice button's position.
  centerHandEl.style.visibility = showCenterState && centerShowsOpponent ? '' : 'hidden';
  // The faded look means "riding along with the move", not "not your turn"
  // - CPU's dice looks perfectly normal through its own spin/hold, same as
  // the player's, and only dims once the piece is actually moving.
  diceButton.classList.toggle('moving', diceMoving);
  diceTapHint.classList.toggle('hidden',
    dicePromptDismissed
    || spellPresentationActive
    || !showCenterState
    || centerShowsOpponent
    || diceMoving
    || diceButton.disabled,
  );
}

function resetDice() {
  clearInterval(diceSpinTimer);
  diceSpinTimer = null;
  diceState = 'idle';
  diceValue = 1;
  fixedDiceValue = null;
  diceButton.classList.remove('fixed-dice');
  diceMoving = false;
  setDiceFace(diceValue);
}

function showFixedDice(value) {
  clearInterval(diceSpinTimer);
  diceSpinTimer = null;
  fixedDiceValue = value;
  diceValue = value;
  diceState = 'fixed';
  setDiceFace(value);
  diceButton.classList.add('fixed-dice');
}

resetDice();
syncCenterVisibility();

function startDiceSpin() {
  clearInterval(diceSpinTimer);
  diceState = 'spinning';
  diceSpinTimer = setInterval(() => {
    diceValue = (diceValue % 6) + 1;
    setDiceFace(diceValue);
  }, DICE_SPIN_INTERVAL_MS);
}

/**
 * Stops the spin DICE_STOP_DELAY_MS from now, landing on `forcedValue` if
 * given (CPU's predetermined roll) or whatever's currently showing (the
 * player's case). Then holds that result - hand and dice both unchanged -
 * for DICE_RESULT_HOLD_MS before resolving, so there's a beat to actually
 * see the number before the piece starts moving.
 */
function settleDiceSpin(forcedValue) {
  diceState = 'locking';
  return new Promise((resolve) => {
    setTimeout(() => {
      clearInterval(diceSpinTimer);
      diceSpinTimer = null;
      if (forcedValue !== undefined) diceValue = forcedValue;
      setDiceFace(diceValue);
      // 出目確定から移動開始までの表示中も再入力させない。ここをidleへ戻すと、
      // 結果保持時間（倍速時は短縮）に連打して何度でも振り直せてしまう。
      diceState = 'settled';

      setTimeout(() => resolve(diceValue), DICE_RESULT_HOLD_MS);
    }, DICE_STOP_DELAY_MS);
  });
}

/** Marks the dice as "riding along with the move" - kept visible until onMoveComplete fires. */
function beginDiceMove(result) {
  if (diceMoving || diceState === 'moving') return;
  clearInterval(diceSpinTimer);
  diceSpinTimer = null;
  diceState = 'moving';
  diceMoving = true;
  // Game.rollDiceのstate通知を待たず、このクリックと同じイベント内で即ロック。
  diceButton.disabled = true;
  syncCenterVisibility();
  if (pvpMatch && !pvpMatch.isHost) {
    pvpMatch.actionSender.send({ type: 'rollDice', steps: result, playerId: pvpMatch.localPlayerId });
    return;
  }
  game.rollDice(result);
}

diceButton.addEventListener('click', () => {
  if (diceButton.disabled) return;
  dicePromptDismissed = true;
  syncCenterVisibility();

  if (diceState === 'fixed' && fixedDiceValue != null) {
    const result = fixedDiceValue;
    fixedDiceValue = null;
    diceButton.classList.remove('fixed-dice');
    beginDiceMove(result);
    return;
  }

  if (diceState === 'idle') {
    startDiceSpin();
    return;
  }

  if (diceState === 'spinning') {
    settleDiceSpin().then(beginDiceMove);
  }
});

/** CPU's roll: same spin/settle rhythm as the player's, just auto-triggered. */
function cpuRollDice(forcedValue = null) {
  return new Promise((resolve) => {
    if (forcedValue != null) {
      showFixedDice(forcedValue);
      setTimeout(() => {
        fixedDiceValue = null;
        diceButton.classList.remove('fixed-dice');
        diceState = 'idle';
        diceMoving = true;
        syncCenterVisibility();
        resolve(forcedValue);
      }, 500);
      return;
    }
    const finalValue = Math.floor(Math.random() * 6) + 1;
    startDiceSpin();
    settleDiceSpin(finalValue).then((result) => {
      diceMoving = true;
      syncCenterVisibility();
      resolve(result);
    });
  });
}

function onMoveComplete() {
  diceMoving = false;
  syncCenterVisibility();
}

// Populated by startBattle() once the player reaches 対戦→CPU戦 through the
// pre-game flow below - nothing here runs until then.
let scene;
let tiles;
let game;
// 現在の対戦のマップid（CPU戦などmapId無指定なら null）。盤面BGMがマップ
// ごとの専用曲（audio.jsのplayMapTheme）を選ぶ分岐と、#appの背景画像
// （applyMapBackground）に使う（バトルシーン終了後に盤面BGMへ戻る
// 呼び出し元にはmapIdを直接渡せる引数が無いため、こうしてモジュール変数
// で持っておく）。
let currentMapId = null;

/** #appの背景（CSSの静的ルールをインラインstyleで上書き）をそのマップの実素材に合わせる。実素材の無いマップはboard.js側で共通のstage1.pngにフォールバック済み。 */
function applyMapBackground(mapId) {
  appEl.style.backgroundImage = `url('${getMapBackground(mapId)}')`;
}

function animate() {
  // Stops this loop for good once the battle is exited (see
  // gameMenuExit) - startBattle() kicks off a fresh loop next time, so
  // loops never pile up across repeated enter/exit cycles. PvPのゲスト側は
  // gameを持たない（scene/tilesだけをローカルで描画するのでpvpMatchで
  // 続行判定する）。
  if (!game && !pvpMatch) return;
  scene.render();
  requestAnimationFrame(animate);
}

/**
 * `character` is { name, color, deckVariant } from character creation (or
 * null pre-フェーズ0 fallback). `storyOptions` (playerConfigs/storyMode/
 * onStoryBattleEnd) is set only by playStoryStage() below for ストーリー
 * バトル - when omitted this is the plain 2人対戦 path (humanPlayer + 固定
 * CPU, Gameコンストラクタ側のフォールバックが組む)。
 */
function startBattle(character, storyOptions = {}) {
  currentMapId = storyOptions.mapId ?? null;
  applyMapBackground(currentMapId);
  // 目標G表示（2026-08-12実装）: ストーリーの各ステージが持つgoalCurrency
  // を盤面右下に表示するだけ（表示専用、勝敗判定には使わない）。CPU戦・
  // 対人戦などgoalCurrency未指定の対戦では非表示のまま。
  if (storyOptions.goalCurrency != null) {
    stageGoalAmount.textContent = storyOptions.goalCurrency.toLocaleString('ja-JP');
    stageGoalDisplay.classList.remove('hidden');
  } else {
    stageGoalDisplay.classList.add('hidden');
  }
  scene = new GameScene(canvas);
  tiles = createBoard(storyOptions.mapId);
  scene.buildBoard(tiles);

  game = new Game({
    tiles,
    mapId: storyOptions.mapId,
    scene,
    onLog: (message) => {
      logEl.textContent = message;
    },
    onStateChange: ({
      turnText,
      currentPlayerId,
      canRoll,
      players,
      checkpointNumbers,
      hand,
      showCenter,
      centerHand,
      currentPlayerIsCPU,
      spellUsedThisTurn,
      fixedDiceValue: stateFixedDiceValue,
    }) => {
      const localPlayerId = pvpMatch?.localPlayerId ?? game.players.find((p) => !p.isCPU)?.id;
      const isLocalTurn = currentPlayerId === localPlayerId;
      turnIndicator.textContent = turnText;
      diceButton.disabled = !canRoll || !isLocalTurn;
      renderPlayerPanels(players, checkpointNumbers, game?.goalCurrency);
      renderHand(hand, isLocalTurn && showCenter && !spellUsedThisTurn);

      const enteringShowCenter = showCenter && !showCenterState;
      showCenterState = showCenter;
      centerShowsOpponent = !isLocalTurn;
      if (enteringShowCenter) {
        resetDice();
        dicePromptDismissed = false;
      }
      if (showCenter && stateFixedDiceValue != null && diceState !== 'fixed') showFixedDice(stateFixedDiceValue);
      syncCenterVisibility();
      if (showCenter && !isLocalTurn) {
        // 対人戦ホストは自分のGameインスタンスに相手(ゲスト)の本当の手札も
        // 持っているが、対戦相手なのでローカル画面にも表示してはいけない
        // （vs CPUなら手の内が見えても問題ないので今まで通り表示する）。
        renderCenterHand(centerHand);
      } else {
        renderCenterHand([]);
      }
    },
    onCardReveal: relayable('cardReveal', promptCardReveal),
    onDiscardChoice: relayable('discardChoice', promptDiscardChoice),
    onSpellUse: relayable('spellUse', promptSpellUse, { broadcast: true }),
    onSpellCastEffect: relayable('spellCastEffect', promptSpellCastEffect, { broadcast: true }),
    onSpellComplete: relayable('spellComplete', finishSpellPresentation, { broadcast: true }),
    onSummonEffect: relayable('summonEffect', promptSummonEffect, { broadcast: true }),
    onTargetEffect: relayable('targetEffect', promptTargetEffect, { broadcast: true }),
    onShrineEffect: relayable('shrineEffect', promptShrineEffect, { broadcast: true }),
    onWarpEffect: relayable('warpEffect', promptWarpEffect, { broadcast: true }),
    onTurnFocus: relayable('turnFocus', promptTurnFocus, { broadcast: true }),
    onTollPayment: relayable('tollPayment', promptTollPayment, { broadcast: true }),
    onMoveDestination: relayable('moveDestination', promptMoveDestination, { broadcast: true }),
    onLandLoss: relayable('landLoss', promptLandLoss, { broadcast: true }),
    onLandChain: relayable('landChain', promptLandChain, { broadcast: true }),
    onLandLevelUp: relayable('landLevelUp', promptLandLevelUp, { broadcast: true }),
    onCheckpoint: relayable('checkpoint', promptCheckpointSound, { broadcast: true }),
    onGoalBonus: relayable('goalBonus', promptGoalBonusSound, { broadcast: true }),
    onGoalAchieved: relayable('goalAchieved', promptGoalAchieved, { broadcast: true }),
    onCpuRoll: cpuRollDice,
    onMoveComplete,
    onLandCommand: relayable('landCommand', promptLandCommand),
    onPickMonsterCard: relayable('pickMonsterCard', promptPickMonsterCard),
    onConfirmAction: relayable('confirmAction', promptConfirmAction),
    onPickLevelUp: relayable('pickLevelUp', promptPickLevelUp),
    onConfirmMove: relayable('confirmMove', promptConfirmMove),
    onPickSellLandForDebt: relayable('pickSellLandForDebt', promptPickSellLandForDebt),
    onBankruptcy: relayable('bankruptcy', promptBankruptcy, { broadcast: true }),
    onPickBrowseTile: relayable('pickBrowseTile', promptPickBrowseTile),
    onLandSubmenu: relayable('landSubmenu', promptLandSubmenu),
    onPickAbilityTarget: relayable('pickAbilityTarget', promptPickAbilityTarget),
    onPickCardType: relayable('pickCardType', promptPickCardType),
    onShowTileInfo: relayable('showTileInfo', promptShowTileInfo),
    onChooseBranch: relayable('chooseBranch', promptChooseBranch),
    onBranchUndo: setBranchUndoControl,
    onPickMoveDirection: relayable('pickMoveDirection', promptMoveDirection),
    onPickElement: relayable('pickElement', promptPickElement),
    onShopPurchase: relayable('shopPurchase', promptShopPurchase),
    onBattleSceneEnter: relayable('battleSceneEnter', promptBattleSceneEnter, { broadcast: true }),
    onPickBattleItem: relayable('pickBattleItem', promptPickBattleItem),
    onBattleEquip: relayable('battleEquip', promptBattleEquip, { broadcast: true }),
    onBattleItemDestroy: relayable('battleItemDestroy', promptBattleItemDestroy, { broadcast: true }),
    onBattleItemSteal: relayable('battleItemSteal', promptBattleItemSteal, { broadcast: true }),
    onBattleTraitReveal: relayable('battleTraitReveal', promptBattleTraitReveal, { broadcast: true }),
    onBattleAttack: relayable('battleAttack', promptBattleAttack, { broadcast: true }),
    onBattleRetreat: relayable('battleRetreat', promptBattleRetreat, { broadcast: true }),
    onBattleOutcome: relayable('battleOutcome', promptBattleOutcome, { broadcast: true }),
    onDamageEffect: relayable('damageEffect', promptDamageEffect, { broadcast: true }),
    onStoryBattleEnd: storyOptions.onStoryBattleEnd,
    onPvpSync: handlePvpSync,
    storyMode: storyOptions.storyMode ?? false,
    goalCurrency: storyOptions.goalCurrency ?? null,
    playerConfigs: storyOptions.playerConfigs,
    humanPlayer: storyOptions.playerConfigs
      ? undefined
      : character
      ? {
          name: character.name,
          color: character.color,
          deckVariant: character.deckVariant,
          deckList: character.deckList,
          iconImage: character.iconImage,
        }
      : undefined,
  });

  if (!storyOptions.deferInit) game.init(storyOptions.resumeState || null);
  playMapTheme(currentMapId);
  requestAnimationFrame(animate);
}

// ---- Pre-game: login → (first time only) character creation → mode hub ----

const preGame = document.getElementById('pre-game');
const appEl = document.getElementById('app');
const menuButton = document.getElementById('menu-button');
const landInfoButton = document.getElementById('land-info-button');
const gameMenuModal = document.getElementById('game-menu-modal');
const gameMenuMute = document.getElementById('game-menu-mute');
const gameMenuSpeed = document.getElementById('game-menu-speed');
const gameMenuHelp = document.getElementById('game-menu-help');
const gameMenuBan = document.getElementById('game-menu-ban');
const gameMenuExit = document.getElementById('game-menu-exit');
const gameMenuClose = document.getElementById('game-menu-close');
const helpModal = document.getElementById('help-modal');
const helpText = document.getElementById('help-text');
const helpClose = document.getElementById('help-close');

function syncMuteButtonLabel() {
  gameMenuMute.textContent = isMuted() ? '🔇 BGM' : '🔊 BGM';
}
syncMuteButtonLabel();
gameMenuMute.addEventListener('click', () => {
  toggleMuted();
  syncMuteButtonLabel();
});

// 盤面の速度調整: 通常(1倍)→1.5倍→2倍→3倍→通常…と巡回する1ボタン方式。
// キャラの移動・スペル/戦闘演出はscene.js/game.jsのtween・delay（utils.js）
// 経由、メッセージ表示等main.js自身の待ちはこのファイル冒頭のsetTimeout/
// setIntervalシャドウ経由で、どちらも同じgetSpeedMultiplier()を参照する。
const SPEED_CYCLE = [1, 1.5, 2, 3];
const SPEED_LABEL = { 1: '通常', 1.5: '1.5倍', 2: '2倍', 3: '3倍' };
function syncSpeedButtonLabel() {
  gameMenuSpeed.textContent = `⏩ 速度: ${SPEED_LABEL[getSpeedMultiplier()] ?? '通常'}`;
}
syncSpeedButtonLabel();
gameMenuSpeed.addEventListener('click', () => {
  const currentIndex = SPEED_CYCLE.indexOf(getSpeedMultiplier());
  const next = SPEED_CYCLE[(currentIndex + 1) % SPEED_CYCLE.length] ?? SPEED_CYCLE[0];
  setSpeedMultiplier(next);
  syncSpeedButtonLabel();
});

menuButton.addEventListener('click', () => {
  // サイコロ回転中にメニューを開いたら回転を止める（確定前の中断）。
  if (diceState === 'spinning') resetDice();
  gameMenuModal.classList.remove('hidden');
  gameMenuBan.classList.toggle('hidden', !(pvpMatch?.isHost && game));
});

gameMenuBan.addEventListener('click', () => {
  if (!pvpMatch?.isHost || !game) return;
  const candidates = game.players.filter((p) => !p.isCPU && p.id !== 0 && !p.defeated);
  if (!candidates.length) return;
  // 名前の完全一致で選ぶと同名プレイヤーがいた場合に別人をBANしてしまう
  // ため、番号入力に変更（idではなくリスト内の表示順で選ばせる - IDは
  // ユーザーに見せていないため）。
  const listText = candidates.map((p, i) => `${i + 1}: ${p.name}`).join('\n');
  const input = window.prompt(`BANするプレイヤーの番号を入力：\n${listText}`);
  if (input == null) return;
  const index = Number(input) - 1;
  const target = Number.isInteger(index) ? candidates[index] : undefined;
  if (!target) {
    window.alert('番号が正しくありません。BANを中止しました。');
    return;
  }
  if (!window.confirm(`${target.name}をBANしてAIに切り替えますか？`)) return;
  target.isCPU = true;
  target.banned = true;
  game.onLog(`${target.name}はホストにBANされ、AI操作へ切り替わった`);
  game._notifyState();
  gameMenuModal.classList.add('hidden');
});
gameMenuClose.addEventListener('click', () => {
  gameMenuModal.classList.add('hidden');
});

const HELP_TEXT = `【勝敗の目標】
盤面右下の「目標G」が勝利に必要な総資産です。目標総資産に到達した状態でゴールを通過すると勝利します。

【ゲーム開始前】
ストーリーと対戦では、盤面開始前に使用する40枚のデッキを選びます。複数のデッキはデッキ編集画面で作成・編集できます。
ターン順は盤面開始時にランダムで決まり、その盤面が終わるまで同じ順番で進行します。

【サイコロ・移動】
自分のターンになったらサイコロを振って盤面を進みます。分かれ道では進む方向を選べます。

【止まったマスでできること】
・召喚／侵略: 手札のモンスターを空き地に召喚、または敵の土地に攻め込みます
・土地: 自分がこれまでに通った土地（START/イベントマスなら所有地全部）を選んで、入れ替え・土地Lvアップ・属性変更・移動・特殊能力を行えます
・終了: 何もせずターンを終えます

【通行料】
敵の土地に足を踏み入れて奪えなかった場合、地価に応じた通行料を支払います。同盟仲間の土地では発生しません。

【バトルボーナス】
・同属性ボーナス: 自分の土地と同じ属性のモンスターはHPが上がります
・応援ボーナス: 隣接マスに味方がいるとATKが上がります

【特殊能力】
モンスターによっては土地コマンドの「特殊能力」からGを消費して固有の効果を使えます。

【周回ボーナス】
STARTマスを通過・着地すると「基本ボーナス＋領地ボーナス」を獲得します（全チェックポイント制のマップでは、その周でチェックポイントを全て通過していないとボーナスはありません）。
・基本ボーナス: (周回数+1)×100G。周を重ねるほど増えていきます
・領地ボーナス: 所持している土地の数×60G（3人以上の対戦では×80G）。連鎖や土地レベルは影響しません
フリーランサーの効果や「帰巣本能」「宝くじ」等のスペルで金額が変わることもあります。

【土地レベルと連鎖】
・土地レベルアップ: 自分の土地を強化してレベル1〜5にできます。レベルが上がるほど地価が上がり、通行料も高くなります
・連鎖: 同じ属性の自分の土地が隣接して繋がっていると「連鎖」になり、繋がっている数だけ地価・通行料の倍率が上がります（無色の土地は連鎖しません）
・地価 = 基本地価 × レベル倍率 × 連鎖倍率、通行料 = 地価 × 通行料率（レベルが高いほど通行料率も上がります）

【土地コマンド】
自分が通ったことのある土地を選ぶと、以下の操作ができます。
・入れ替え: 配置済みモンスターを手札のモンスターと交換します
・土地Lvアップ: Gを払って土地レベルを1段階上げます
・属性変更: Gを払って土地の属性を変更します
・移動: 配置モンスターを隣接する土地へ移動させます（空き地ならそのまま移動、敵地なら戦闘になります）
・特殊能力: モンスター固有の効果をGを払って発動します（使えるモンスターのみ）
※土地を自分から売ることはできません。通行料やスペル等で所持Gがマイナスになった時だけ、マイナスが解消するまで自動的に売却リストが表示されます（それでも足りなければ破産します）

【呪い】
・プレイヤー呪い: スペル等でかかる呪いで、コマを動かしても効果は本人についてきます（サイコロ操作、通行料減免など）
・モンスター呪い: 配置モンスターにかかる呪いで、そのモンスターが少しでも移動すると消えます。呪いは1体につき1つしか保持できず、新しい呪いをかけると上書きされます

【ショップとカード】
所持Mを使って各パックを購入できます。火・森・水・雷・無属性のモンスターパック、アイテムパック、スペルパックは各100Mで4枚入り、最低1枚はS以上です。
通常抽選はN65%・S25%・R10%で、SとRは合計最大3枚です。最初の抽選がすべてNなら、最後の1枚をS70%・R30%で引き直します。
ブリードパーツパックは150Mで3個入り、N65%・S25%・R10%、最低1個はS以上です。
不要なカードはショップで売却できます。EXカードは売却できません。

【カード図鑑・カードエディット】
図鑑には所有カードの名前と枚数が表示され、未所有カードは空欄になります。カード名を選ぶと画像と詳細を確認できます。
管理者用カードエディットでは、画像・種類・レアリティ・能力値・属性・コスト・特殊効果を設定してカードを作成し、図鑑とゲームへ登録できます。

【ブリード】
入手したブリードパーツを装備してブリードモンスターを強化できます。名前と画像は変更でき、画像をリセットすると初期画像へ戻ります。

【オンライン対戦】
ホストはステージ1〜4、目標G（3000〜12000G、1000G刻み）、参加人数、CPU、同盟の有無を設定します。参加者はデッキを選んでから入室し、揃ったらホストが開始します。
4人同盟戦は紅組・白組に分かれ、ホスト指定またはランダム同盟を選べます。ホストは盤面メニューのBANから参加者を退出させ、AI操作へ切り替えられます。通信が一定時間切断された参加者もAIへ切り替わります。

【対戦報酬】
勝敗にかかわらず終了時の総資産からMを獲得します（最低50M）。ストーリー本編・再戦は「7%＋相手プレイヤー1人につき3%」、対戦モードは1vs1が7%、相手が1人増えるごとに+3%、同盟戦は15%固定です。

【ログイン・クラウドセーブ】
IDとパスワードでログインします。キャラクター、所持M、所持カード、デッキ、ブリード、ストーリー進行、作成カードは端末内に保存され、ログイン中はFirebaseにも同期されます。通信できない場合は端末内のデータで遊べます。`;
helpText.textContent = HELP_TEXT;

gameMenuHelp.addEventListener('click', () => {
  gameMenuModal.classList.add('hidden');
  helpModal.classList.remove('hidden');
});
helpClose.addEventListener('click', () => {
  helpModal.classList.add('hidden');
});

/**
 * HUDの独立「土地情報」ボタン。現在の手番や所有者に関係なく自由カメラへ
 * 切り替え、盤面上の任意の土地を直接タップして何度でも詳細を確認できる。
 */
function showLandInfoCamera() {
  if (branchChoiceActive || !scene || !tiles?.length || !cameraWorkOverlay.classList.contains('hidden')) return;
  const camSnap = beginCameraWork();
  cameraWorkOverlay.classList.remove('hidden');
  landInfoButton.classList.add('active');
  logEl.textContent = '確認したい土地をタップしてください';

  const pan = (direction) => () => scene.panByDirection(direction);
  const onUp = pan('up');
  const onDown = pan('down');
  const onLeft = pan('left');
  const onRight = pan('right');

  function tileSummaryForInfo(tile) {
    if (game) return game.getTileSummary(tile);
    return {
      id: tile.id,
      type: tile.type,
      element: tile.element,
      level: tile.level || 1,
      ownerName: tile.owner == null ? null : `プレイヤー${tile.owner + 1}`,
      unitName: tile.unit?.def?.name || null,
      unitAtk: tile.unit?.def?.atk ?? null,
      unitHp: tile.unit?.currentHp ?? null,
    };
  }

  function onCanvasClick(event) {
    const rect = canvas.getBoundingClientRect();
    const ndcX = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    const ndcY = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    if (scene.panDidMove) return; // 直前がドラッグ/ピンチなら選択しない
    const tile = scene.pickTileAt(ndcX, ndcY, tiles);
    if (!tile || tile.type !== TileType.LAND) return;
    tileInfoText.textContent = tileSummaryText(tileSummaryForInfo(tile));
    tileInfoModal.classList.remove('hidden');
  }

  function onInfoClose() {
    tileInfoModal.classList.add('hidden');
  }

  function finish() {
    cameraWorkOverlay.classList.add('hidden');
    tileInfoModal.classList.add('hidden');
    landInfoButton.classList.remove('active');
    canvas.removeEventListener('click', onCanvasClick);
    camArrowUp.removeEventListener('click', onUp);
    camArrowDown.removeEventListener('click', onDown);
    camArrowLeft.removeEventListener('click', onLeft);
    camArrowRight.removeEventListener('click', onRight);
    camWorkBack.removeEventListener('click', finish);
    tileInfoClose.removeEventListener('click', onInfoClose);
    endCameraWork(camSnap);
  }

  canvas.addEventListener('click', onCanvasClick);
  camArrowUp.addEventListener('click', onUp);
  camArrowDown.addEventListener('click', onDown);
  camArrowLeft.addEventListener('click', onLeft);
  camArrowRight.addEventListener('click', onRight);
  camWorkBack.addEventListener('click', finish);
  tileInfoClose.addEventListener('click', onInfoClose);
}
landInfoButton.addEventListener('click', showLandInfoCamera);
const loginScreen = document.getElementById('login-screen');
const loginId = document.getElementById('login-id');
const loginPassword = document.getElementById('login-password');
const loginError = document.getElementById('login-error');
const loginSubmit = document.getElementById('login-submit');
const charmakeScreen = document.getElementById('charmake-screen');
const charmakeIcons = document.getElementById('charmake-icons');
const charmakeIconUpload = document.getElementById('charmake-icon-upload');
const charmakeIconPreview = document.getElementById('charmake-icon-preview');
const charmakeIconError = document.getElementById('charmake-icon-error');
const charmakeName = document.getElementById('charmake-name');
const charmakeDecks = document.getElementById('charmake-decks');
const charmakeSubmit = document.getElementById('charmake-submit');
const hubScreen = document.getElementById('hub-screen');
const hubWelcome = document.getElementById('hub-welcome');
const hubAdminTile = document.getElementById('hub-admin-tile');
const hubMailButton = document.getElementById('hub-mail-button');
const hubMailBadge = document.getElementById('hub-mail-badge');
const mailModal = document.getElementById('mail-modal');
const mailList = document.getElementById('mail-list');
const mailClose = document.getElementById('mail-close');
const adminScreen = document.getElementById('admin-screen');
const adminContent = document.getElementById('admin-content');
const adminBack = document.getElementById('admin-back');
const adminRefresh = document.getElementById('admin-refresh');
const adminComposeSubject = document.getElementById('admin-compose-subject');
const adminComposeBody = document.getElementById('admin-compose-body');
const adminComposeCard = document.getElementById('admin-compose-card');
const adminComposeCount = document.getElementById('admin-compose-count');
const adminComposeAdd = document.getElementById('admin-compose-add');
const adminComposeAttachments = document.getElementById('admin-compose-attachments');
const adminComposeSend = document.getElementById('admin-compose-send');
const adminComposeStatus = document.getElementById('admin-compose-status');
const catalogScreen = document.getElementById('catalog-screen');
const catalogList = document.getElementById('catalog-list');
const catalogCategoryTabs = document.getElementById('catalog-category-tabs');
const catalogRarityFilters = document.getElementById('catalog-rarity-filters');
const catalogBack = document.getElementById('catalog-back');
const cardEditorScreen = document.getElementById('card-editor-screen');
const editorName = document.getElementById('editor-name');
const editorImage = document.getElementById('editor-image');
const editorImagePreview = document.getElementById('editor-image-preview');
const editorType = document.getElementById('editor-type');
const editorRarity = document.getElementById('editor-rarity');
const editorStatsRow = document.getElementById('editor-stats-row');
const editorAtk = document.getElementById('editor-atk');
const editorHp = document.getElementById('editor-hp');
const editorElementLabel = document.getElementById('editor-element-label');
const editorElement = document.getElementById('editor-element');
const editorCost = document.getElementById('editor-cost');
const editorEffects = document.getElementById('editor-effects');
const editorEffectDescription = document.getElementById('editor-effect-description');
const editorError = document.getElementById('editor-error');
const editorSave = document.getElementById('editor-save');
const editorBack = document.getElementById('editor-back');
const bulkCsvTemplate = document.getElementById('bulk-csv-template');
const bulkCsvFile = document.getElementById('bulk-csv-file');
const bulkImageFiles = document.getElementById('bulk-image-files');
const bulkImageCount = document.getElementById('bulk-image-count');
const bulkCsvSubmit = document.getElementById('bulk-csv-submit');
const bulkCsvError = document.getElementById('bulk-csv-error');
const bulkCsvResult = document.getElementById('bulk-csv-result');
const deckScreen = document.getElementById('deck-screen');
const deckSlotTabs = document.getElementById('deck-slot-tabs');
const deckNameInput = document.getElementById('deck-name-input');
const deckCount = document.getElementById('deck-count');
const deckComposition = document.getElementById('deck-composition');
const deckCatalogList = document.getElementById('deck-catalog-list');
const deckCategoryTabs = document.getElementById('deck-category-tabs');
const deckRarityFilters = document.getElementById('deck-rarity-filters');
const deckCurrentTabs = document.getElementById('deck-current-tabs');
const deckCurrentList = document.getElementById('deck-current-list');
const deckSave = document.getElementById('deck-save');
const deckBack = document.getElementById('deck-back');
const deckSelectScreen = document.getElementById('deck-select-screen');
const deckSelectBack = document.getElementById('deck-select-back');
const deckSelectPicker = document.getElementById('deck-select-picker');
const deckSelectList = document.getElementById('deck-select-list');
const deckSelectConfirm = document.getElementById('deck-select-confirm');
const deckSelectConfirmText = document.getElementById('deck-select-confirm-text');
const deckSelectBreakdown = document.getElementById('deck-select-breakdown');
const deckSelectYes = document.getElementById('deck-select-yes');
const deckSelectNo = document.getElementById('deck-select-no');
const shopScreen = document.getElementById('shop-screen');
const shopCurrency = document.getElementById('shop-currency');
const shopPackList = document.getElementById('shop-pack-list');
const shopPackResult = document.getElementById('shop-pack-result');
const shopPackCards = document.getElementById('shop-pack-cards');
const shopPackResultClose = document.getElementById('shop-pack-result-close');
const shopList = document.getElementById('shop-list');
const shopBulkSell = document.getElementById('shop-bulk-sell');
const shopSellSummary = document.getElementById('shop-sell-summary');
const shopSellConfirm = document.getElementById('shop-sell-confirm');
const shopSellConfirmList = document.getElementById('shop-sell-confirm-list');
const shopSellConfirmTotal = document.getElementById('shop-sell-confirm-total');
const shopSellConfirmYes = document.getElementById('shop-sell-confirm-yes');
const shopSellConfirmNo = document.getElementById('shop-sell-confirm-no');
const shopPartsList = document.getElementById('shop-parts-list');
const shopBackButton = document.getElementById('shop-back');
const shopMainMenu = document.getElementById('shop-main-menu');
const shopMenuCards = document.getElementById('shop-menu-cards');
const shopMenuParts = document.getElementById('shop-menu-parts');
const shopMenuSell = document.getElementById('shop-menu-sell');
const shopCardView = document.getElementById('shop-card-view');
const shopPartsView = document.getElementById('shop-parts-view');
const shopSellView = document.getElementById('shop-sell-view');
const shopSectionBack = document.getElementById('shop-section-back');
const battleMenuScreen = document.getElementById('battle-menu-screen');
const battleCpuButton = document.getElementById('battle-cpu');
const battlePvpButton = document.getElementById('battle-pvp');
const battleMenuBack = document.getElementById('battle-back');
const goalSelectModal = document.getElementById('goal-select-modal');
const goalSelectValue = document.getElementById('goal-select-value');
const goalSelectDec = document.getElementById('goal-select-dec');
const goalSelectInc = document.getElementById('goal-select-inc');
const goalSelectConfirm = document.getElementById('goal-select-confirm');
const goalSelectCancel = document.getElementById('goal-select-cancel');
const battleBackButton = document.getElementById('battle-back');
const pvpMenuScreen = document.getElementById('pvp-menu-screen');
const pvpCreateButton = document.getElementById('pvp-create-button');
const pvpGoalCurrency = document.getElementById('pvp-goal-currency');
const pvpPlayerCount = document.getElementById('pvp-player-count');
const pvpAllianceMode = document.getElementById('pvp-alliance-mode');
const pvpRandomAlliance = document.getElementById('pvp-random-alliance');
const pvpCpuSelects = [1, 2, 3].map((n) => document.getElementById(`pvp-cpu-${n}`));
const pvpJoinCode = document.getElementById('pvp-join-code');
const pvpJoinButton = document.getElementById('pvp-join-button');
const pvpMenuError = document.getElementById('pvp-menu-error');
const pvpMenuBack = document.getElementById('pvp-menu-back');
const pvpRoomScreen = document.getElementById('pvp-room-screen');
const pvpRoomCode = document.getElementById('pvp-room-code');
const pvpRoomStatus = document.getElementById('pvp-room-status');
const pvpRoomSettings = document.getElementById('pvp-room-settings');
const pvpRoomTeams = document.getElementById('pvp-room-teams');
const pvpRoomStart = document.getElementById('pvp-room-start');
const pvpRoomLeave = document.getElementById('pvp-room-leave');
const pvpMapSelectScreen = document.getElementById('pvp-map-select-screen');
const pvpMapList = document.getElementById('pvp-map-list');
const pvpMapSelectBack = document.getElementById('pvp-map-select-back');
const pvpMapConfirmModal = document.getElementById('pvp-map-confirm-modal');
const pvpMapConfirmThumb = document.getElementById('pvp-map-confirm-thumb');
const pvpMapConfirmText = document.getElementById('pvp-map-confirm-text');
const pvpMapConfirmYes = document.getElementById('pvp-map-confirm-yes');
const pvpMapConfirmNo = document.getElementById('pvp-map-confirm-no');
const breedScreen = document.getElementById('breed-screen');
const breedName = document.getElementById('breed-name');
const breedImage = document.getElementById('breed-image');
const breedImageReset = document.getElementById('breed-image-reset');
const breedImagePreview = document.getElementById('breed-image-preview');
const breedStats = document.getElementById('breed-stats');
const breedError = document.getElementById('breed-error');
const breedPartsList = document.getElementById('breed-parts-list');
const breedBackButton = document.getElementById('breed-back');
const breedHelpButton = document.getElementById('breed-help-button');
const breedHelpModal = document.getElementById('breed-help-modal');
const breedHelpClose = document.getElementById('breed-help-close');
const stubScreen = document.getElementById('stub-screen');
const stubText = document.getElementById('stub-text');
const stubBackButton = document.getElementById('stub-back');
const storyScreen = document.getElementById('story-screen');
const storyStageList = document.getElementById('story-stage-list');
const storyBackButton = document.getElementById('story-back');
const storyDialogueScreen = document.getElementById('story-dialogue-screen');
const storyDialoguePortrait = document.getElementById('story-dialogue-portrait');
const storyDialogueSpeaker = document.getElementById('story-dialogue-speaker');
const storyDialogueText = document.getElementById('story-dialogue-text');
const storyDialogueNext = document.getElementById('story-dialogue-next');
const storyDialogueSkip = document.getElementById('story-dialogue-skip');
const stageGoalDisplay = document.getElementById('stage-goal-display');
const stageGoalAmount = document.getElementById('stage-goal-amount');
const storyOverlayDialogue = document.getElementById('story-overlay-dialogue');
const storyOverlayPortraitLeft = document.getElementById('story-overlay-portrait-left');
const storyOverlayPortraitRight = document.getElementById('story-overlay-portrait-right');
const storyOverlayImgLeft = document.getElementById('story-overlay-img-left');
const storyOverlayImgRight = document.getElementById('story-overlay-img-right');
const storyOverlayNameLeft = document.getElementById('story-overlay-name-left');
const storyOverlayNameRight = document.getElementById('story-overlay-name-right');
const storyOverlayBubble = document.getElementById('story-overlay-bubble');
const storyOverlaySpeaker = document.getElementById('story-overlay-speaker');
const storyOverlayText = document.getElementById('story-overlay-text');
const storyOverlaySkip = document.getElementById('story-overlay-skip');

const ALL_PG_SCREENS = [loginScreen, charmakeScreen, hubScreen, adminScreen, catalogScreen, cardEditorScreen, deckScreen, deckSelectScreen, shopScreen, battleMenuScreen, breedScreen, stubScreen, storyScreen, storyDialogueScreen, pvpMenuScreen, pvpRoomScreen, pvpMapSelectScreen];
function showScreen(el) {
  ALL_PG_SCREENS.forEach((s) => s.classList.toggle('hidden', s !== el));
}

// Accent color paired 1:1 with the 6 split icons (panel border / UI chrome
// color) - the icon image itself is the actual selectable "character",
// this is just cosmetic trim to keep player panels distinguishable.
const ICON_COLORS = [0x2ec4b6, 0xe63946, 0xffd166, 0x8e5ce6, 0x4caf6e, 0x3a86e6];
// M is the persistent menu-side currency (character.m) - entirely separate
// from the in-battle G (player.currency, resets to 500 every match). Earned
// by cashing out a battle's ending total assets at the mode-specific rate, min 50.
const STARTING_M = 300;
const M_CONVERSION_MIN = 50;
const CARD_EDITOR_HASH = '#card-editor';

let currentUserId = null;
let currentCharacter = null;
let selectedCharacterIcon = null;
let selectedDeckVariant = null;

function updateCharmakeValidity() {
  charmakeSubmit.disabled = !charmakeName.value.trim() || !selectedCharacterIcon || !selectedDeckVariant;
}

async function showCharmakeScreen() {
  selectedCharacterIcon = null;
  selectedDeckVariant = null;
  charmakeName.value = '';
  charmakeIconUpload.value = '';
  charmakeIconPreview.classList.add('hidden');
  charmakeIconError.classList.add('hidden');

  charmakeIcons.replaceChildren();
  const icons = await loadCharacterIconPresets();
  icons.forEach((icon, index) => {
    const el = document.createElement('img');
    el.className = 'pg-icon-choice';
    el.src = icon.dataUrl;
    el.alt = icon.name;
    el.title = icon.name;
    el.addEventListener('click', () => {
      selectedCharacterIcon = { preset: icon.id, dataUrl: '', colorIndex: index };
      [...charmakeIcons.children].forEach((c) => c.classList.remove('selected'));
      charmakeIconPreview.classList.remove('selected');
      el.classList.add('selected');
      updateCharmakeValidity();
    });
    charmakeIcons.appendChild(el);
  });

  charmakeDecks.replaceChildren();
  for (const deck of Object.values(STARTER_DECKS)) {
    const el = document.createElement('div');
    el.className = 'pg-deck-choice';
    el.textContent = deck.name;
    el.addEventListener('click', () => {
      selectedDeckVariant = deck.id;
      [...charmakeDecks.children].forEach((c) => c.classList.remove('selected'));
      el.classList.add('selected');
      updateCharmakeValidity();
    });
    charmakeDecks.appendChild(el);
  }

  updateCharmakeValidity();
  showScreen(charmakeScreen);
}

charmakeIconUpload.addEventListener('change', async () => {
  const file = charmakeIconUpload.files?.[0];
  if (!file) return;
  try {
    const icon = await fileToCharacterIcon(file);
    selectedCharacterIcon = { preset: '', dataUrl: icon.dataUrl, colorIndex: 0 };
    [...charmakeIcons.children].forEach((child) => child.classList.remove('selected'));
    charmakeIconPreview.src = icon.dataUrl;
    charmakeIconPreview.classList.remove('hidden');
    charmakeIconPreview.classList.add('selected');
    charmakeIconError.classList.add('hidden');
  } catch (error) {
    selectedCharacterIcon = null;
    charmakeIconPreview.classList.add('hidden');
    charmakeIconError.textContent = error.message;
    charmakeIconError.classList.remove('hidden');
  }
  updateCharmakeValidity();
});

function showHubScreen() {
  hubWelcome.textContent = `ようこそ、${currentCharacter.name}（所持M: ${currentCharacter.m}）`;
  if (location.hash === CARD_EDITOR_HASH) {
    showCardEditor();
    return;
  }
  showScreen(hubScreen);
  refreshMailBadge();
}

// ===== 管理ダッシュボード（管理者のみ） =====
// Firestoreの admins/{uid} ドキュメントが存在するuidだけが管理者。
// firestore.rulesで「管理者は全playersを閲覧のみ可」に設定してあるので、
// 非管理者がこのクエリを叩いても permission-denied で弾かれる（データは常に保護）。
let isAdminUser = false;

/** ログイン後に管理者かどうかを判定し、管理者ならハブに「管理」タイルを出す。 */
// 管理者UIDの許可リスト（Firebase Authのランダムな内部ID。ログイン情報を含まず、
// これ単体ではログインもできないためコードに焼き込んで安全）。firestore.rules の
// isAdmin() も同じUIDを許可している。
const ADMIN_UIDS = ['KcKymLgEFmYbN1F4ZYcKvXvfUDo1'];

async function refreshAdminAccess(uid) {
  isAdminUser = false;
  if (hubAdminTile) hubAdminTile.hidden = true;
  if (!firebaseReady || !db || !uid) return;
  // 管理者マーカーの登録に使えるよう、自分のuidをコンソールに出す（予備の設定用）。
  console.info('[chinuquest] ログイン中のUID:', uid);
  if (ADMIN_UIDS.includes(uid)) {
    isAdminUser = true;
  } else {
    try {
      const snap = await fsGetDoc(fsDoc(db, 'admins', uid));
      isAdminUser = snap.exists();
    } catch (error) {
      isAdminUser = false;
    }
  }
  if (hubAdminTile) hubAdminTile.hidden = !isAdminUser;
}

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function fmtInt(n) {
  return Number(n || 0).toLocaleString('ja-JP');
}

function fmtDate(ts) {
  // FirestoreのTimestamp（toDate()を持つ）/ 文字列 / null に対応。
  try {
    if (ts && typeof ts.toDate === 'function') return ts.toDate().toLocaleString('ja-JP');
    if (typeof ts === 'string' && ts) return new Date(ts).toLocaleString('ja-JP');
  } catch (error) { /* noop */ }
  return '—';
}

const STORY_STAGE_LABELS = ['未着手', '①クリア', '②クリア', '③クリア', '④クリア(全)'];

/** players コレクション全件を集計してダッシュボードHTMLを組み立てる。 */
function buildAdminDashboardHtml(players) {
  const total = players.length;
  const withCharacter = players.filter((p) => p.character && p.character.name).length;

  // ストーリー進捗分布（storyProgress 0〜4）。
  const progressCounts = [0, 0, 0, 0, 0];
  let mSum = 0;
  let mMax = 0;
  let mMaxName = '—';
  let customCardTotal = 0;
  const recent = [];

  for (const p of players) {
    const c = p.character || {};
    const prog = Math.max(0, Math.min(4, Number(c.storyProgress || 0)));
    progressCounts[prog] += 1;
    const m = Number(c.m || 0);
    mSum += m;
    if (m > mMax) { mMax = m; mMaxName = c.name || '(無名)'; }
    customCardTotal += Array.isArray(p.customCards) ? p.customCards.length : 0;
    recent.push({
      name: c.name || '(キャラ未作成)',
      progress: prog,
      m,
      ownedKinds: c.ownedCards ? Object.keys(c.ownedCards).length : 0,
      updatedAt: p.updatedAt || null,
      createdAt: p.createdAt || null,
    });
  }

  const clearedAll = progressCounts[4];
  const startedStory = total - progressCounts[0];
  const avgM = withCharacter ? Math.round(mSum / withCharacter) : 0;

  recent.sort((a, b) => {
    const ta = a.updatedAt && a.updatedAt.toDate ? a.updatedAt.toDate().getTime() : 0;
    const tb = b.updatedAt && b.updatedAt.toDate ? b.updatedAt.toDate().getTime() : 0;
    return tb - ta;
  });
  const recentTop = recent.slice(0, 30);

  const progressRows = progressCounts.map((count, i) => {
    const pct = total ? Math.round((count / total) * 100) : 0;
    return `<div class="admin-bar-row">
        <span class="admin-bar-label">${STORY_STAGE_LABELS[i]}</span>
        <span class="admin-bar-track"><span class="admin-bar-fill" style="width:${pct}%"></span></span>
        <span class="admin-bar-value">${fmtInt(count)}人 (${pct}%)</span>
      </div>`;
  }).join('');

  const tableRows = recentTop.map((r) => `<tr>
      <td class="admin-td-name">${escapeHtml(r.name)}</td>
      <td>${STORY_STAGE_LABELS[r.progress]}</td>
      <td class="admin-td-num">${fmtInt(r.m)}</td>
      <td class="admin-td-num">${fmtInt(r.ownedKinds)}</td>
      <td class="admin-td-date">${fmtDate(r.updatedAt)}</td>
    </tr>`).join('');

  return `
    <div class="admin-kpi-grid">
      <div class="admin-kpi"><span>登録者数</span><strong>${fmtInt(total)}</strong></div>
      <div class="admin-kpi"><span>キャラ作成済み</span><strong>${fmtInt(withCharacter)}</strong></div>
      <div class="admin-kpi"><span>ストーリー開始</span><strong>${fmtInt(startedStory)}</strong></div>
      <div class="admin-kpi"><span>全ステージ制覇</span><strong>${fmtInt(clearedAll)}</strong></div>
      <div class="admin-kpi"><span>平均所持M</span><strong>${fmtInt(avgM)}</strong></div>
      <div class="admin-kpi"><span>最大所持M</span><strong>${fmtInt(mMax)}</strong><small>${escapeHtml(mMaxName)}</small></div>
      <div class="admin-kpi"><span>カスタムカード総数</span><strong>${fmtInt(customCardTotal)}</strong></div>
    </div>

    <h3 class="admin-subhead">ストーリー進捗の分布</h3>
    <div class="admin-bars">${progressRows}</div>

    <h3 class="admin-subhead">最近プレイしたプレイヤー（上位30名）</h3>
    <div class="admin-table-wrap">
      <table class="admin-table">
        <thead><tr><th>名前</th><th>進捗</th><th>所持M</th><th>所持種類</th><th>最終更新</th></tr></thead>
        <tbody>${tableRows || '<tr><td colspan="5">データがありません</td></tr>'}</tbody>
      </table>
    </div>
  `;
}

// 直近の集計結果をキャッシュ（再度開いた時は即表示。再読み込みボタンで更新）。
let adminPlayersCache = null;

function adminErrorHtml(error) {
  if (error?.code === 'permission-denied') {
    return `<p class="admin-error">閲覧権限がありません。この機能は管理者専用です。<br>あなたのUID: <code>${escapeHtml(auth?.currentUser?.uid || '不明')}</code></p>`;
  }
  return '<p class="admin-error">集計の読み込みに失敗しました。時間をおいて再度お試しください。</p>';
}

async function showAdminDashboard(forceReload = false) {
  // 多重防御: 管理者以外はそもそもここへ来ないが（タイル非表示）、来ても弾く。
  // 本質的なデータ保護は firestore.rules（管理者UIDのみ全playersを読める）。
  if (!isAdminUser) {
    showHubScreen();
    return;
  }
  showScreen(adminScreen);
  if (!firebaseReady || !db) {
    adminContent.innerHTML = '<p class="admin-error">Firebaseに接続できないため集計できません。</p>';
    return;
  }
  // キャッシュがあれば即描画（明示的な再読み込み時のみ取り直す）。
  if (adminPlayersCache && !forceReload) {
    adminContent.innerHTML = buildAdminDashboardHtml(adminPlayersCache);
    return;
  }

  // ① まず登録者数だけをサーバー集計で一瞬で表示（ドキュメント本体は落とさない）。
  adminContent.innerHTML = '<p class="admin-loading">登録者数を確認中…</p>';
  let total = null;
  try {
    const countSnap = await fsGetCount(collection(db, 'players'));
    total = countSnap.data().count;
    adminContent.innerHTML = `
      <div class="admin-kpi-grid">
        <div class="admin-kpi"><span>登録者数</span><strong>${fmtInt(total)}</strong></div>
      </div>
      <p class="admin-loading">全プレイヤーの詳細を集計中…<br><small>各セーブにアイコン画像等が含まれるため、人数が多いと少し時間がかかります。</small></p>`;
  } catch (error) {
    console.error('登録者数の取得に失敗', error);
    adminContent.innerHTML = adminErrorHtml(error);
    return;
  }

  // ② 続いて全ドキュメントを取得して詳細集計（進捗分布・所持M・最近のプレイヤー）。
  try {
    const snapshot = await fsGetDocs(collection(db, 'players'));
    adminPlayersCache = snapshot.docs.map((d) => d.data());
    adminContent.innerHTML = buildAdminDashboardHtml(adminPlayersCache);
  } catch (error) {
    console.error('管理ダッシュボードの詳細集計に失敗', error);
    // 詳細が取れなくても登録者数だけは残す。
    adminContent.innerHTML = `
      <div class="admin-kpi-grid">
        <div class="admin-kpi"><span>登録者数</span><strong>${fmtInt(total ?? 0)}</strong></div>
      </div>
      ${adminErrorHtml(error)}`;
  }
}

/** Existing characters saved before ブリードモンスター existed won't have these fields yet - fill them in with the default build (no owned parts) rather than crashing on undefined. */
function ensureBreedFields(character) {
  if (!character.breedMonster) character.breedMonster = { name: BREED_BASE.defaultName, equippedPartIds: [] };
  if (!Array.isArray(character.breedMonster.equippedPartIds)) character.breedMonster.equippedPartIds = [];
  character.breedMonster.equippedPartIds = character.breedMonster.equippedPartIds.slice(0, BREED_MAX_EQUIPPED_PARTS);
  if (!character.ownedPartIds) character.ownedPartIds = [];
  if (character.storyProgress == null) character.storyProgress = 0;
  // 複数デッキ対応前のセーブデータ移行: 単一のdeckListを
  // decks[0]として引き継ぐ（旧deckListフィールド自体はもう読まない）。
  if (!character.decks) {
    character.decks = [{ id: `deck-${Date.now()}`, name: 'デッキ1', deckList: character.deckList || [] }];
  }
  for (const deck of character.decks) {
    if (/^ブック\d+$/.test(deck.name || '')) deck.name = deck.name.replace(/^ブック/, 'デッキ');
    deck.deckList = (deck.deckList || []).filter((card) => !isLegacyPlaceholderCardName(card.name));
  }
  if (character.ownedCards) {
    for (const key of Object.keys(character.ownedCards)) {
      if (isLegacyPlaceholderCardName(key)) delete character.ownedCards[key];
    }
  }
  return character;
}

loginSubmit.addEventListener('click', async () => {
  if (loginSubmit.disabled) return;
  loginSubmit.disabled = true;
  const originalLabel = loginSubmit.textContent;
  loginSubmit.textContent = 'ログイン中…';
  const result = await loginOrRegister(loginId.value.trim(), loginPassword.value);
  loginSubmit.disabled = false;
  loginSubmit.textContent = originalLabel;
  if (!result.ok) {
    loginError.textContent = result.error;
    loginError.classList.remove('hidden');
    return;
  }
  loginError.classList.add('hidden');
  currentUserId = result.id;
  setCloudCustomCardUser(currentUserId, result.customCards || []);
  refreshAdminAccess(currentUserId);
  if (result.isNew || !result.character) {
    showCharmakeScreen();
  } else {
    currentCharacter = ensureBreedFields(result.character);
    showHubScreen();
  }
});

charmakeName.addEventListener('input', updateCharmakeValidity);

charmakeSubmit.addEventListener('click', () => {
  if (charmakeSubmit.disabled) return;
  const breedMonster = { name: BREED_BASE.defaultName, equippedPartIds: [] };
  const breedCard = { ...buildBreedCardDef({ breedMonster }), id: `breedMonster-${Date.now()}` };

  // buildStarterDeckListは39枚（STARTER_DECKS側でNモンスター1種を1枚
  // 減らして確保済み）。ブリードモンスター(レアリティEX)を40枚目として足す。
  const deckList = buildStarterDeckList(selectedDeckVariant);
  deckList.push(breedCard);

  const ownedCards = {};
  for (const card of deckList) ownedCards[cardKey(card)] = (ownedCards[cardKey(card)] || 0) + 1;
  currentCharacter = {
    name: charmakeName.value.trim(),
    iconPreset: selectedCharacterIcon.preset || null,
    iconImageDataUrl: selectedCharacterIcon.dataUrl || '',
    color: ICON_COLORS[selectedCharacterIcon.colorIndex] || ICON_COLORS[0],
    deckVariant: selectedDeckVariant,
    decks: [{ id: `deck-${Date.now()}`, name: 'デッキ1', deckList }],
    ownedCards,
    m: STARTING_M,
    breedMonster,
    ownedPartIds: [],
    storyProgress: 0,
  };
  saveCharacter(currentUserId, currentCharacter);
  showHubScreen();
});

const STUB_MODE_LABEL = { story: 'ストーリー' };

// ---- Story mode: stage select → intro dialogue → N人対戦（storyMode）→ outro dialogue ----
// バトル自体は通常のstartBattle()と同じGameクラスを使う - playerConfigs/
// storyMode/onStoryBattleEndを渡すだけで1vs1vs1・2vs2同盟戦も成立する
// （#36で汎用化済み。Game側のターン進行/CPU/同盟集計はプレイヤー人数に
// 依存しない実装のため、ここは「誰を何人渡すか」を組み立てるだけでいい）。

let activeStoryStageIndex = null;
let activeStorySessionMeta = null;
const STORY_RESUME_KEY_PREFIX = 'chinuquest2-story-resume:';

function storyResumeKey() {
  return `${STORY_RESUME_KEY_PREFIX}${currentUserId || 'guest'}`;
}

function promptCheckpointSound() {
  playSfx('checkpoint');
}

function promptGoalBonusSound() {
  playSfx('goal');
}

function loadStoryResume() {
  try { return JSON.parse(localStorage.getItem(storyResumeKey()) || 'null'); } catch { return null; }
}

function clearStoryResume() {
  try { localStorage.removeItem(storyResumeKey()); } catch {}
}

function saveStoryResume() {
  if (!game || activeStoryStageIndex == null || !activeStorySessionMeta) return false;
  try {
    localStorage.setItem(storyResumeKey(), JSON.stringify({
      savedAt: Date.now(),
      stageIndex: activeStoryStageIndex,
      ...activeStorySessionMeta,
      gameState: game.exportState(),
    }));
    return true;
  } catch {
    return false;
  }
}

async function selectStoryStage(index, cleared, stage) {
  const saved = loadStoryResume();
  if (saved?.stageIndex === index && saved.gameState) {
    const resume = await confirmYesNo('途中保存した対戦があります。続きから再開しますか？');
    if (resume) {
      await startStoryBattle(index, saved.heroDeckList, !!saved.isReplay, saved.replayVariant || null, saved.gameState);
      return;
    }
    clearStoryResume();
  }
  if (cleared && stage.replay) await playStoryReplay(index);
  else await playStoryStage(index);
}

function showStoryScreen() {
  storyStageList.replaceChildren();
  STORY_STAGES.forEach((stage, index) => {
    const unlocked = isStageUnlocked(currentCharacter, index);
    const cleared = isStageCleared(currentCharacter, index);

    const row = document.createElement('div');
    row.className = `deck-row${unlocked ? '' : ' story-stage-row-locked'}`;

    const info = document.createElement('div');
    info.className = 'deck-row-info';
    const name = document.createElement('div');
    name.className = 'deck-row-name';
    name.textContent = stage.title;
    if (unlocked) name.addEventListener('click', () => selectStoryStage(index, cleared, stage));
    const meta = document.createElement('div');
    meta.className = 'deck-row-meta';
    const battleInfo = `形式: ${stage.format}　目標: ${stage.goalCurrency.toLocaleString('ja-JP')}G`;
    meta.textContent = !unlocked
      ? `ロック中　${battleInfo}`
      : cleared
        ? `クリア済み（もう一度挑戦できます）　${battleInfo}`
        : battleInfo;
    info.append(name, meta);

    row.append(info);
    storyStageList.appendChild(row);
  });
  showScreen(storyScreen);
}

storyBackButton.addEventListener('click', showHubScreen);

/** Shows `lines` one at a time (speaker + text), advancing on click of storyDialogueNext. Resolves once the last line has been dismissed. */
function playDialogueLines(lines) {
  return new Promise((resolve) => {
    let i = 0;
    let settled = false;
    function finish() {
      if (settled) return;
      settled = true;
      storyDialogueNext.removeEventListener('click', onNext);
      storyDialogueSkip.removeEventListener('click', onSkip);
      resolve();
    }
    function showLine() {
      storyDialogueSpeaker.textContent = lines[i].speaker;
      storyDialogueText.textContent = lines[i].text;
      const portraitUrl = NPC_PORTRAIT_URL[lines[i].speaker];
      storyDialoguePortrait.classList.toggle('hidden', !portraitUrl);
      if (portraitUrl) storyDialoguePortrait.src = portraitUrl;
    }
    function onNext() {
      i += 1;
      if (i >= lines.length) {
        finish();
        return;
      }
      showLine();
    }
    function onSkip() {
      finish();
    }
    storyDialogueNext.addEventListener('click', onNext);
    storyDialogueSkip.addEventListener('click', onSkip);
    showLine();
  });
}

/**
 * 盤面を隠さない会話オーバーレイ（2026-08-12実装、①ヒトデ戦専用）。
 * showScreen()もappEl/preGameの表示切り替えも一切行わない - 呼び出し時点
 * で#appが既に表示されている前提で、その上に重ねるだけ。左右どちらの
 * 立ち絵か（leftName/rightNameとの一致）で吹き出しの位置と立ち絵の
 * ハイライトを切り替える。全面がクリック領域なので、表示中は盤面側の
 * 操作（サイコロ等）を実質ブロックする。
 */
function playOverlayDialogueLines(lines, {
  leftName,
  leftPortraitUrl,
  rightName,
  rightPortraitUrl,
  rightNpcOnSpeaker = null,
  rightNpcPortraitUrl = null,
  speakerSides = null,
  speakerPortraitUrls = null,
  stageKey = null,
}) {
  storyOverlayDialogue.dataset.stage = stageKey || '';
  storyOverlayImgLeft.src = leftPortraitUrl || '';
  storyOverlayNameLeft.textContent = leftName;
  storyOverlayImgRight.src = rightPortraitUrl || '';
  storyOverlayNameRight.textContent = rightName;

  return new Promise((resolve) => {
    let i = 0;
    let settled = false;
    let displayedRightName = rightName;
    function finish() {
      if (settled) return;
      settled = true;
      storyOverlayDialogue.removeEventListener('click', onAdvance);
      storyOverlaySkip.removeEventListener('click', onSkip);
      storyOverlayDialogue.classList.add('hidden');
      delete storyOverlayDialogue.dataset.stage;
      delete storyOverlayPortraitLeft.dataset.character;
      delete storyOverlayPortraitRight.dataset.character;
      resolve();
    }
    function showLine() {
      const line = lines[i];
      if (speakerSides?.[line.speaker]) {
        const dynamicSide = speakerSides[line.speaker];
        const portraitUrl = speakerPortraitUrls?.[line.speaker] || '';
        if (dynamicSide === 'left') {
          storyOverlayImgLeft.src = portraitUrl;
          storyOverlayNameLeft.textContent = line.speaker;
          storyOverlayPortraitLeft.dataset.character = line.speaker;
        } else {
          storyOverlayImgRight.src = portraitUrl;
          storyOverlayNameRight.textContent = line.speaker;
          storyOverlayPortraitRight.dataset.character = line.speaker;
        }
      }
      // ステージ2は右側の立ち絵枠を主人公とお肉で共有する。話者が変わる
      // たびに必ず対応する画像へ戻す（一度お肉へ切り替えたまま固定すると、
      // 後続の主人公／お肉の吹き出し判定と立ち絵が食い違ってしまう）。
      if (rightNpcOnSpeaker && (line.speaker === rightNpcOnSpeaker || line.speaker === rightName)) {
        const showNpc = line.speaker === rightNpcOnSpeaker;
        displayedRightName = showNpc ? rightNpcOnSpeaker : rightName;
        storyOverlayImgRight.src = (showNpc ? rightNpcPortraitUrl : rightPortraitUrl) || '';
        storyOverlayNameRight.textContent = displayedRightName;
      }
      storyOverlaySpeaker.textContent = line.speaker;
      storyOverlayText.textContent = line.text;
      const isRightSpeaker = line.speaker === rightName || line.speaker === rightNpcOnSpeaker;
      const side = speakerSides?.[line.speaker]
        || (line.speaker === leftName ? 'left' : isRightSpeaker ? 'right' : null);
      storyOverlayPortraitLeft.classList.toggle('active', side === 'left');
      storyOverlayPortraitRight.classList.toggle('active', side === 'right');
      storyOverlayBubble.classList.toggle('side-left', side === 'left');
      storyOverlayBubble.classList.toggle('side-right', side === 'right');
    }
    function onAdvance() {
      i += 1;
      if (i >= lines.length) {
        finish();
        return;
      }
      showLine();
    }
    function onSkip(event) {
      event.stopPropagation();
      finish();
    }
    storyOverlayDialogue.addEventListener('click', onAdvance);
    storyOverlaySkip.addEventListener('click', onSkip);
    storyOverlayDialogue.classList.remove('hidden');
    showLine();
  });
}

async function playStoryStage(index) {
  const stage = STORY_STAGES[index];
  // overlayNpc持ちのステージ（①②、2026-08-12実装/2026-08-13②へ拡張）だけ
  // 盤面を隠さない会話演出: 先にデッキだけ選び、盤面表示後にstartStoryBattle
  // 側でオーバーレイ会話を挟む。
  if (stage.overlayNpc || stage.boardDialogue) {
    const chosenDeck = await promptDeckSelection({ onCancel: showStoryScreen });
    if (!chosenDeck) return;
    await startStoryBattle(index, chosenDeck.deckList, false);
    return;
  }
  showScreen(storyDialogueScreen);
  await playDialogueLines(stage.intro);
  const chosenDeck = await promptDeckSelection({ onCancel: showStoryScreen });
  if (!chosenDeck) return;
  await startStoryBattle(index, chosenDeck.deckList, false);
}

/** クリア済みステージの再戦。進行度・固有カード報酬は変えないが、勝敗を問わず終了時総資産に応じたMを獲得する。 */
async function playStoryReplay(index) {
  const stage = STORY_STAGES[index];
  if (!stage.replay) return;
  const replay = stage.secretReplay && (currentCharacter.storyProgress || 0) >= stage.secretReplay.unlockProgress
    ? stage.secretReplay
    : stage.replay;
  showScreen(storyDialogueScreen);
  await playDialogueLines(replay.intro);
  const chosenDeck = await promptDeckSelection({ onCancel: showStoryScreen });
  if (!chosenDeck) return;
  await startStoryBattle(index, chosenDeck.deckList, true, replay);
}

/**
 * hero(+ally(+extraAlly)) vs opponents, in Gameの playerConfigs 形式。
 * 陣営分けはallianceIdだけで表現 - heroAllianceId/enemyAllianceIdがnullなら
 * 同盟なし（FFA）。`variant`は本編ステージ自身（通常戦）か`stage.replay`
 * （おまけ戦）のどちらか - replay側で未指定のフィールドは本編のstageの
 * 値にフォールバックする（例: ダンボール男戦の再戦はopponents/ally/format
 * を一切上書きせず、introだけ差し替えた1vs1のまま）。
 */
async function buildBattlePlayerConfigs(stage, variant, iconImage, heroDeckList) {
  // 再戦データでnullを明示した場合は、本編の同盟設定を引き継がず無効化する。
  const ally = Object.hasOwn(variant, 'ally') ? variant.ally : stage.ally;
  const opponents = variant.opponents ?? stage.opponents;
  const heroAllianceId = Object.hasOwn(variant, 'heroAllianceId') ? variant.heroAllianceId : (stage.heroAllianceId ?? null);
  const enemyAllianceId = Object.hasOwn(variant, 'enemyAllianceId') ? variant.enemyAllianceId : (stage.enemyAllianceId ?? null);

  const configs = [
    {
      name: currentCharacter.name,
      isCPU: false,
      color: currentCharacter.color,
      allianceId: heroAllianceId,
      deckList: heroDeckList,
      iconImage,
    },
  ];
  for (const allyDef of [ally, variant.extraAlly].filter(Boolean)) {
    configs.push({
      name: allyDef.name,
      isCPU: true,
      color: allyDef.color,
      allianceId: heroAllianceId,
      deckList: allyDef.deckKey ? buildCharacterDeckList(allyDef.deckKey) : buildThemedDeckList(allyDef.theme),
      iconImage: await loadNpcTokenImage(allyDef.name),
      elements: allyDef.theme.elements,
    });
  }
  for (const opponent of opponents) {
    configs.push({
      name: opponent.name,
      isCPU: true,
      color: opponent.color,
      allianceId: enemyAllianceId,
      deckList: opponent.deckKey ? buildCharacterDeckList(opponent.deckKey) : buildThemedDeckList(opponent.theme),
      iconImage: await loadNpcTokenImage(opponent.name),
      elements: opponent.theme.elements,
    });
  }
  return configs;
}

async function startStoryBattle(index, heroDeckList, isReplay, replayVariant = null, resumeState = null) {
  const stage = STORY_STAGES[index];
  const variant = isReplay ? (replayVariant || stage.replay) : stage;
  activeStoryStageIndex = index;
  activeStorySessionMeta = { heroDeckList, isReplay, replayVariant };

  const characterIcon = await resolveCharacterIcon(currentCharacter);
  const iconImage = characterIcon?.canvas ?? null;
  const iconDataUrl = characterIcon?.dataUrl ?? null;

  const playerConfigs = await buildBattlePlayerConfigs(stage, variant, iconImage, heroDeckList);

  await confirmLandscapeReady();

  preGame.classList.add('hidden');
  appEl.classList.remove('hidden');
  startBattle(currentCharacter, {
    storyMode: true,
    // ヒトデ初戦だけ短い導入用マップ。再戦は従来の長いhitodeマップを使う。
    mapId: !isReplay && stage.key === 'hitode' ? 'hitode-first' : stage.key,
    goalCurrency: stage.goalCurrency,
    playerConfigs,
    onStoryBattleEnd: (result) => (isReplay ? handleStoryReplayEnd(index, result, variant) : handleStoryBattleEnd(index, result)),
    deferInit: !resumeState && !isReplay && !!(stage.overlayNpc || stage.boardDialogue),
    resumeState,
  });

  // overlayNpc持ちのステージ（①②）だけ: 盤面が表示された直後、その上に
  // 会話をオーバーレイする（盤面は隠さない）。サイコロ等の操作はオーバー
  // レイの全面クリック領域が塞ぐので、会話が終わるまで実質進行できない。
  if (!resumeState && !isReplay && (stage.overlayNpc || stage.boardDialogue)) {
    const speakerPortraitUrls = stage.overlaySpeakerSides
      ? Object.fromEntries(Object.keys(stage.overlaySpeakerSides).map((speaker) => [
          speaker,
          speaker === '主人公' ? iconDataUrl : NPC_PORTRAIT_URL[speaker],
        ]))
      : null;
    await playOverlayDialogueLines(stage.intro, {
      leftName: stage.overlayNpc,
      leftPortraitUrl: NPC_PORTRAIT_URL[stage.overlayNpc],
      rightName: currentCharacter.name,
      rightPortraitUrl: iconDataUrl,
      rightNpcOnSpeaker: stage.overlayRightNpcOnSpeaker,
      rightNpcPortraitUrl: NPC_PORTRAIT_URL[stage.overlayRightNpcOnSpeaker],
      speakerSides: stage.overlaySpeakerSides,
      speakerPortraitUrls,
      stageKey: stage.key,
    });
    // Only now deal the opening hand and start the first turn. This prevents
    // draw/reveal UI and CPU activity from running under the intro dialogue.
    game.init();
  }
}

/** playStoryReplay()の決着後: 進行度・固有カード報酬は変えず、勝敗を問わず総資産報酬Mだけ付与する。 */
async function handleStoryReplayEnd(index, { won }, replayVariant) {
  const stage = STORY_STAGES[index];
  const mReward = grantStoryBattleReward();
  clearStoryResume();
  game = undefined;
  stopMusic();
  appEl.classList.add('hidden');
  preGame.classList.remove('hidden');
  activeStoryStageIndex = null;
  activeStorySessionMeta = null;

  showScreen(storyDialogueScreen);
  if (won) {
    await playDialogueLines(replayVariant.outro || [{ speaker: '???', text: 'また挑みに来てくれ！' }]);
  } else {
    await playDialogueLines([{ speaker: '???', text: '力及ばず、敗れてしまった……もう一度挑もう。' }]);
  }
  showStoryScreen();
  showToast(`再戦報酬として${mReward.earnedM}M獲得しました`, 2400);
}

async function handleStoryBattleEnd(index, { won }) {
  const stage = STORY_STAGES[index];
  clearStoryResume();
  // ストーリー本編・再戦共通の「7%＋相手人数×3%」報酬を勝敗にかかわらず付与。
  const mReward = grantStoryBattleReward();
  // overlayNpc持ちのステージ（①②）の勝利時だけ、盤面をまだ隠さずに決着
  // 直後の会話をオーバーレイで見せる（startStoryBattleのintro演出と対に
  // なる終幕演出）。それ以外（敗北時・他ステージ）は今まで通り即座に
  // 盤面を閉じてからの全画面会話。
  const useBoardOverlay = !!(stage.overlayNpc || stage.boardDialogue) && won;

  if (!useBoardOverlay) {
    game = undefined;
    stopMusic();
    appEl.classList.add('hidden');
    preGame.classList.remove('hidden');
  }
  activeStoryStageIndex = null;

  if (!won) {
    showScreen(storyDialogueScreen);
    await playDialogueLines([{ speaker: '???', text: '力及ばず、敗れてしまった……もう一度挑もう。' }]);
    showStoryScreen();
    showToast(`ストーリー報酬として${mReward.earnedM}M獲得しました`, 2400);
    return;
  }

  if (stage.reward) {
    const rewardDef = ITEM_CATALOG[stage.reward];
    if (rewardDef) {
      const key = cardKey(rewardDef);
      currentCharacter.ownedCards[key] = (currentCharacter.ownedCards[key] || 0) + 1;
    }
  }
  // 段ボール男（ステージ④）を初めて撃破したら、EXスペル「未知との遭遇」をクリア報酬に。
  // 受領フラグで一度きり（再戦では付与しない）。
  if (stage.key === 'danball' && !currentCharacter.receivedEncounterReward) {
    grantEncounterReward();
  }
  if (index + 1 > (currentCharacter.storyProgress || 0)) {
    currentCharacter.storyProgress = index + 1;
  }
  saveCharacter(currentUserId, currentCharacter);

  if (useBoardOverlay) {
    const characterIcon = await resolveCharacterIcon(currentCharacter);
    const speakerPortraitUrls = stage.overlaySpeakerSides
      ? Object.fromEntries(Object.keys(stage.overlaySpeakerSides).map((speaker) => [
          speaker,
          speaker === '主人公' ? characterIcon?.dataUrl ?? null : NPC_PORTRAIT_URL[speaker],
        ]))
      : null;
    await playOverlayDialogueLines(stage.outro, {
      leftName: stage.overlayNpc,
      leftPortraitUrl: NPC_PORTRAIT_URL[stage.overlayNpc],
      rightName: currentCharacter.name,
      rightPortraitUrl: characterIcon?.dataUrl ?? null,
      rightNpcOnSpeaker: stage.overlayRightNpcOnSpeaker,
      rightNpcPortraitUrl: NPC_PORTRAIT_URL[stage.overlayRightNpcOnSpeaker],
      speakerSides: stage.overlaySpeakerSides,
      speakerPortraitUrls,
      stageKey: stage.key,
    });
    game = undefined;
    stopMusic();
    appEl.classList.add('hidden');
    preGame.classList.remove('hidden');
    showStoryScreen();
    showToast(`ストーリー報酬として${mReward.earnedM}M獲得しました`, 2400);
    return;
  }

  showScreen(storyDialogueScreen);
  await playDialogueLines(stage.outro);
  showStoryScreen();
  showToast(`ストーリー報酬として${mReward.earnedM}M獲得しました`, 2400);
}

/** スマートフォンでは盤面生成前に横持ちを促し、完了操作まで開始しない。 */
function confirmLandscapeReady() {
  const isPhone = window.matchMedia('(pointer: coarse)').matches && Math.min(screen.width, screen.height) <= 600;
  if (!isPhone) return Promise.resolve();
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'landscape-ready-overlay';
    const box = document.createElement('div');
    box.className = 'landscape-ready-box';
    const message = document.createElement('p');
    message.textContent = 'スマートフォンを横持ちしてください、画像が乱れます';
    const button = document.createElement('button');
    button.textContent = '完了';
    button.addEventListener('click', () => { overlay.remove(); resolve(); }, { once: true });
    box.append(message, button);
    overlay.appendChild(box);
    document.body.appendChild(overlay);
  });
}

document.querySelectorAll('.hub-tile').forEach((tile) => {
  tile.addEventListener('click', () => {
    const mode = tile.dataset.mode;
    if (mode === 'story') {
      showStoryScreen();
    } else if (mode === 'battle') {
      showScreen(battleMenuScreen);
    } else if (mode === 'deck') {
      showDeckScreen();
    } else if (mode === 'catalog') {
      showCatalogScreen();
    } else if (mode === 'shop') {
      showShopScreen();
    } else if (mode === 'breed') {
      showBreedScreen();
    } else if (mode === 'admin') {
      showAdminDashboard();
    } else {
      stubText.textContent = `${STUB_MODE_LABEL[mode]}は準備中です`;
      showScreen(stubScreen);
    }
  });
});

battleBackButton.addEventListener('click', showHubScreen);
stubBackButton.addEventListener('click', showHubScreen);
if (adminBack) adminBack.addEventListener('click', showHubScreen);
if (adminRefresh) adminRefresh.addEventListener('click', () => showAdminDashboard(true));

// ---- Card catalog: unowned entries stay blank; owned entries reveal name/count/detail. ----

const RARITY_ORDER = { [Rarity.N]: 0, [Rarity.S]: 1, [Rarity.R]: 2, [Rarity.EX]: 3 };

function hasCardAbility(def) {
  return Boolean(
    (def.traits && def.traits.length)
    || def.effect
    || def.ability
    || def.effectDescription
    || def.commandCost
  );
}

/** デッキ編集・図鑑共通の2行概要。通常能力値は符号なし、アイテム補正だけ+/-を表示する。 */
function cardListPresentation(def, owned) {
  const category = def.type === CardType.MONSTER
    ? (ELEMENT_LABEL[def.element] || '無')
    : def.type === CardType.GEAR ? 'アイテム' : 'スペル';
  const heading = `${def.name}　${def.rarity}${category}　${def.cost ?? 0}G　枚数${owned}`;
  const stats = [];
  if (def.type === CardType.MONSTER) {
    stats.push(`HP${def.hp ?? 0}`, `ATK${def.atk ?? 0}`);
  } else if (def.type === CardType.GEAR) {
    const signed = (value) => `${Number(value) > 0 ? '+' : ''}${Number(value) || 0}`;
    const atk = def.atkBonusRange
      ? `${signed(def.atkBonusRange[0])}〜${signed(def.atkBonusRange[1])}`
      : signed(def.atkBonus ?? 0);
    stats.push(`HP${signed(def.hpBonus ?? 0)}`, `ATK${atk}`);
  }
  stats.push(`能力${hasCardAbility(def) ? '有' : '無'}`);
  return { heading, stats: stats.join('　') };
}

let catalogActiveCategory = 'fire';
const catalogHiddenRarities = new Set();

function sortedCatalog() {
  return effectiveCatalog().slice().sort((a, b) =>
    (RARITY_ORDER[a.rarity] ?? 99) - (RARITY_ORDER[b.rarity] ?? 99)
      || a.name.localeCompare(b.name, 'ja'));
}

function showCatalogScreen() {
  catalogCategoryTabs.replaceChildren();
  for (const category of DECK_CATEGORY_TABS) {
    const button = document.createElement('button');
    button.className = `deck-category-tab${category.id === catalogActiveCategory ? ' selected' : ''}`;
    button.textContent = category.label;
    button.addEventListener('click', () => {
      catalogActiveCategory = category.id;
      showCatalogScreen();
    });
    catalogCategoryTabs.appendChild(button);
  }

  catalogRarityFilters.replaceChildren();
  for (const rarity of [Rarity.N, Rarity.S, Rarity.R, Rarity.EX]) {
    const button = document.createElement('button');
    button.className = `deck-rarity-filter${catalogHiddenRarities.has(rarity) ? ' disabled' : ''}`;
    button.textContent = rarity;
    button.addEventListener('click', () => {
      if (catalogHiddenRarities.has(rarity)) catalogHiddenRarities.delete(rarity);
      else catalogHiddenRarities.add(rarity);
      showCatalogScreen();
    });
    catalogRarityFilters.appendChild(button);
  }

  const category = DECK_CATEGORY_TABS.find((item) => item.id === catalogActiveCategory) || DECK_CATEGORY_TABS[0];
  catalogList.replaceChildren();
  for (const card of sortedCatalog().filter((def) => category.test(def) && !catalogHiddenRarities.has(def.rarity))) {
    const owned = ownedCountOf(cardKey(card));
    const row = document.createElement('div');
    row.className = `catalog-row${owned ? '' : ' catalog-row-unknown'}`;
    const info = document.createElement('div');
    info.className = 'catalog-card-info';
    if (owned) {
      const presentation = cardListPresentation(card, owned);
      const name = document.createElement('button');
      name.className = 'catalog-card-name card-summary-heading';
      name.textContent = presentation.heading;
      name.addEventListener('click', () => showCardDetail(card));
      const meta = document.createElement('div');
      meta.className = 'deck-row-meta';
      meta.textContent = presentation.stats;
      info.append(name, meta);
    }
    row.append(info);
    catalogList.appendChild(row);
  }
  showScreen(catalogScreen);
}

catalogBack.addEventListener('click', showHubScreen);

// ---- Secret URL card editor (#card-editor). Definitions persist in localStorage. ----

let editorImageDataUrl = '';

function updateEditorFields() {
  const isMonster = editorType.value === CardType.MONSTER;
  const hasStats = editorType.value !== CardType.SPELL;
  editorStatsRow.classList.toggle('hidden', !hasStats);
  editorElementLabel.classList.toggle('hidden', !isMonster);
  for (const label of editorEffects.querySelectorAll('label')) {
    label.classList.toggle('hidden', !label.dataset.types.split(',').includes(editorType.value));
  }
}

function showCardEditor() {
  if (!currentCharacter) return;
  editorEffects.replaceChildren();
  for (const effect of CARD_EFFECTS) {
    const label = document.createElement('label');
    label.dataset.types = effect.types.join(',');
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.value = effect.id;
    label.append(input, document.createTextNode(effect.label));
    editorEffects.appendChild(label);
  }
  updateEditorFields();
  showScreen(cardEditorScreen);
}

editorType.addEventListener('change', updateEditorFields);

/** Shared by the single-card editor and the CSV bulk-import: downscales to maxSide and re-encodes as webp so custom-card images stay small in localStorage. */
function resizeImageFileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('load', () => {
      const image = new Image();
      image.addEventListener('load', () => {
        const maxSide = 768;
        const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
        canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/webp', 0.82));
      });
      image.addEventListener('error', () => reject(new Error('image decode failed')));
      image.src = String(reader.result);
    });
    reader.addEventListener('error', () => reject(new Error('file read failed')));
    reader.readAsDataURL(file);
  });
}

editorImage.addEventListener('change', () => {
  const file = editorImage.files?.[0];
  if (!file) return;
  if (!file.type.startsWith('image/')) {
    editorError.textContent = '画像ファイルを選択してください';
    editorError.classList.remove('hidden');
    return;
  }
  resizeImageFileToDataUrl(file).then((dataUrl) => {
    editorImageDataUrl = dataUrl;
    editorImagePreview.src = dataUrl;
    editorImagePreview.classList.remove('hidden');
    editorError.classList.add('hidden');
  });
});

editorSave.addEventListener('click', () => {
  const input = {
    name: editorName.value,
    imageDataUrl: editorImageDataUrl,
    type: editorType.value,
    rarity: editorRarity.value,
    atk: editorAtk.value,
    hp: editorHp.value,
    element: editorElement.value,
    cost: editorCost.value,
    traits: [...editorEffects.querySelectorAll('input:checked')].map((el) => el.value),
    effectDescription: editorEffectDescription.value,
  };
  const error = validateCustomCard(currentUserId, input);
  if (error) {
    editorError.textContent = error;
    editorError.classList.remove('hidden');
    return;
  }
  if (getCardCatalog(currentUserId).some((card) => card.name === input.name.trim())) {
    editorError.textContent = '同じ名前のカードが図鑑に既にあります';
    editorError.classList.remove('hidden');
    return;
  }
  let card;
  try {
    card = saveCustomCard(currentUserId, input);
  } catch {
    editorError.textContent = '画像またはカードデータを保存できませんでした。画像サイズを小さくしてください';
    editorError.classList.remove('hidden');
    return;
  }
  editorError.classList.add('hidden');
  // 作っただけでは誰の持ち物にもならず、デッキに一切入れられなかった
  // バグ（所持枚数0のまま固定）の修正: 作成者に1枚付与する。
  const key = cardKey(card);
  currentCharacter.ownedCards[key] = (currentCharacter.ownedCards[key] || 0) + 1;
  saveCharacter(currentUserId, currentCharacter);
  showCardDetail(card);
  editorName.value = '';
  editorImage.value = '';
  editorImageDataUrl = '';
  editorImagePreview.classList.add('hidden');
  editorEffectDescription.value = '';
  editorEffects.querySelectorAll('input').forEach((el) => { el.checked = false; });
});

editorBack.addEventListener('click', () => {
  history.replaceState(null, '', `${location.pathname}${location.search}`);
  showHubScreen();
});

// ---- カードエディタのCSV一括登録: 画像以外の項目をCSVから、画像は別途
// 複数選択したファイルとCSVの「画像ファイル名」列を突き合わせて紐付ける
// （200種近くを1枚ずつ手動アップロードするのは非現実的なため）。1行=1枚、
// バリデーションは既存のvalidateCustomCard()を流用し、行ごとに独立して
// 成否を出す（1行の失敗が他の行を止めない）。 ----

const BULK_TYPE_LABELS = { モンスター: CardType.MONSTER, アイテム: CardType.GEAR, スペル: CardType.SPELL };
const BULK_ELEMENT_LABELS = Object.fromEntries(Object.entries(ELEMENT_LABEL).map(([value, label]) => [label, value]));
const BULK_EFFECT_LABELS = Object.fromEntries(CARD_EFFECTS.map((effect) => [effect.label, effect.id]));
const BULK_CSV_HEADERS = ['カード名', '種類', 'レアリティ', '属性', 'コスト', 'ATK', 'HP', '特殊効果', '特殊効果の説明', '画像ファイル名'];
const BULK_REQUIRED_HEADERS = ['カード名', '種類', 'レアリティ'];

let bulkImageFileList = [];

function csvEscape(value) {
  const str = String(value ?? '');
  return /["\r\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

/** Minimal RFC4180-ish parser: quoted fields (with "" for a literal quote) and \n/\r\n/\r line endings, no external library. */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  const clean = text.replace(/^﻿/, '');
  for (let i = 0; i < clean.length; i++) {
    const c = clean[i];
    if (inQuotes) {
      if (c === '"') {
        if (clean[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && clean[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      rows.push(row);
      row = [];
    } else {
      field += c;
    }
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function csvValue(v) {
  return (v ?? '').trim();
}

/** Accepts either the Japanese label shown in the manual editor's dropdowns, or the raw enum value (case-insensitive) - forgiving of however the spreadsheet was filled in. */
function resolveBulkEnum(raw, labelMap, validValues) {
  const trimmed = csvValue(raw);
  if (labelMap[trimmed]) return labelMap[trimmed];
  const lower = trimmed.toLowerCase();
  return validValues.find((v) => v.toLowerCase() === lower) || null;
}

function parseBulkTraits(raw) {
  return csvValue(raw)
    .split(/[;,、]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((label) => BULK_EFFECT_LABELS[label] || (CARD_EFFECTS.some((effect) => effect.id === label) ? label : null))
    .filter(Boolean);
}

function buildHeaderIndex(headerRow) {
  const map = {};
  headerRow.forEach((h, i) => {
    map[csvValue(h)] = i;
  });
  return map;
}

function csvRowToBulkInput(row, headerIndex) {
  const get = (name) => (name in headerIndex ? csvValue(row[headerIndex[name]]) : '');
  const type = resolveBulkEnum(get('種類'), BULK_TYPE_LABELS, Object.values(CardType));
  return {
    name: get('カード名'),
    type,
    rarity: resolveBulkEnum(get('レアリティ'), {}, Object.values(Rarity)),
    element: type === CardType.MONSTER ? resolveBulkEnum(get('属性'), BULK_ELEMENT_LABELS, Object.values(Element)) : Element.NEUTRAL,
    cost: get('コスト') || '0',
    atk: get('ATK') || '0',
    hp: get('HP') || '1',
    traits: parseBulkTraits(get('特殊効果')),
    effectDescription: get('特殊効果の説明'),
    imageFileName: get('画像ファイル名'),
    imageDataUrl: '',
  };
}

function renderBulkCsvResult(results, savedCount) {
  bulkCsvResult.replaceChildren();
  const summary = document.createElement('div');
  summary.className = 'bulk-row bulk-row-ok';
  summary.textContent = `${savedCount}件登録しました（全${results.length}件中）`;
  bulkCsvResult.appendChild(summary);
  for (const r of results) {
    const row = document.createElement('div');
    row.className = `bulk-row ${r.ok ? 'bulk-row-ok' : 'bulk-row-error'}`;
    row.textContent = `${r.rowNumber}行目 ${r.name}: ${r.message}`;
    bulkCsvResult.appendChild(row);
  }
  bulkCsvResult.classList.remove('hidden');
}

async function processBulkCsv(text) {
  const rows = parseCsv(text).filter((r) => r.some((cell) => cell.trim() !== ''));
  if (rows.length < 2) {
    bulkCsvError.textContent = 'CSVにデータ行がありません';
    bulkCsvError.classList.remove('hidden');
    return;
  }
  const headerIndex = buildHeaderIndex(rows[0]);
  const missingHeaders = BULK_REQUIRED_HEADERS.filter((h) => !(h in headerIndex));
  if (missingHeaders.length) {
    bulkCsvError.textContent = `見出し行に必要な列がありません: ${missingHeaders.join('、')}`;
    bulkCsvError.classList.remove('hidden');
    return;
  }

  const imageByName = new Map(bulkImageFileList.map((f) => [f.name.toLowerCase(), f]));
  const catalogNames = new Set(getCardCatalog(currentUserId).map((c) => c.name));
  const seenNames = new Set();
  const results = [];
  const toSave = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const rowNumber = i + 1;
    const input = csvRowToBulkInput(row, headerIndex);
    const name = input.name.trim();
    let error = validateCustomCard(currentUserId, input);
    if (!error && seenNames.has(name)) error = 'CSV内で名前が重複しています';
    if (!error && catalogNames.has(name)) error = '同じ名前のカードが図鑑に既にあります';
    if (error) {
      results.push({ rowNumber, name: name || '(名前なし)', ok: false, message: error });
      continue;
    }

    let imageNote = '';
    if (input.imageFileName) {
      const matched = imageByName.get(input.imageFileName.toLowerCase());
      if (matched) {
        try {
          input.imageDataUrl = await resizeImageFileToDataUrl(matched);
        } catch {
          imageNote = '（画像の読み込みに失敗したため画像なしで登録）';
        }
      } else {
        imageNote = '（一致する画像が見つからなかったため画像なしで登録）';
      }
    }

    seenNames.add(name);
    toSave.push(input);
    results.push({ rowNumber, name, ok: true, message: `登録しました${imageNote}` });
  }

  if (toSave.length) {
    const saved = saveCustomCardsBulk(currentUserId, toSave);
    for (const card of saved) {
      const key = cardKey(card);
      currentCharacter.ownedCards[key] = (currentCharacter.ownedCards[key] || 0) + 1;
    }
    saveCharacter(currentUserId, currentCharacter);
  }

  renderBulkCsvResult(results, toSave.length);
  bulkCsvFile.value = '';
  bulkImageFiles.value = '';
  bulkImageFileList = [];
  bulkImageCount.textContent = '';
  bulkCsvSubmit.disabled = true;
}

bulkCsvTemplate.addEventListener('click', () => {
  const example = ['火の戦士', 'モンスター', 'N', '火', '20', '15', '20', '', '', 'hinosenshi.png'];
  const csv = [BULK_CSV_HEADERS, example].map((r) => r.map(csvEscape).join(',')).join('\r\n');
  const blob = new Blob([`﻿${csv}`], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'card_template.csv';
  a.click();
  URL.revokeObjectURL(url);
});

bulkCsvFile.addEventListener('change', () => {
  bulkCsvSubmit.disabled = !bulkCsvFile.files?.[0];
  bulkCsvError.classList.add('hidden');
  bulkCsvResult.classList.add('hidden');
  bulkCsvResult.replaceChildren();
});

bulkImageFiles.addEventListener('change', () => {
  bulkImageFileList = Array.from(bulkImageFiles.files || []);
  bulkImageCount.textContent = bulkImageFileList.length ? `${bulkImageFileList.length}枚選択中` : '';
});

bulkCsvSubmit.addEventListener('click', async () => {
  const file = bulkCsvFile.files?.[0];
  if (!file) return;
  bulkCsvSubmit.disabled = true;
  bulkCsvError.classList.add('hidden');
  try {
    const text = await file.text();
    await processBulkCsv(text);
  } catch {
    bulkCsvError.textContent = 'CSVの読み込みに失敗しました';
    bulkCsvError.classList.remove('hidden');
    bulkCsvSubmit.disabled = false;
  }
});

// ---- Deck editor: browse the card catalog, +/- copies (max 4 each) until exactly 40, then save ----

const MAX_COPIES_PER_CARD = 4;
const MAX_DECKS = 3;
const DECK_SIZE = 40;

/**
 * Every card's `name` is unique across the catalog (named flavor cards and
 * formulaic generic names never collide), so it's the simplest stable key
 * for grouping deck copies against catalog entries - `catalogId` doesn't
 * help here since raw catalog entries don't carry one (only deck-
 * instantiated copies do), and `id` isn't stable across separate
 * buildCardPool() calls for generic cards. The one exception is the
 * ブリードモンスター, which the player can rename anytime in the ブリード
 * screen - it keys on its stable catalogId instead so a rename can't
 * desync ownedCards/deck tracking from what's actually equipped.
 */
function cardKey(card) {
  return card.catalogId === 'breedMonster' ? 'breedMonster' : card.name;
}

/**
 * 保存済みdeckListのブリードモンスター枠は、ブリード画面でパーツを装着した
 * 時点では更新されない（デッキ編集画面で「保存」を押した時にだけ
 * effectiveCatalog()経由で書き直される - deckSave参照）。そのため装着直後に
 * 対戦へ入ると古いステータスのまま戦ってしまう。対戦に使う直前（デッキ選択）
 * でこの関数を通し、breedMonster枠だけ常に現在の装着状況からライブに
 * 再計算したものへ差し替える（保存データ自体は書き換えない）。
 */
function resolveDeckCardsForBattle(deckList) {
  if (!Array.isArray(deckList)) return deckList;
  const catalog = getCardCatalog(currentUserId);
  const byId = new Map(catalog.map((def) => [def.id, def]));
  const byName = new Map(catalog.map((def) => [def.name, def]));
  return deckList.map((card) => {
    if (card?.catalogId === 'breedMonster') {
      return { ...buildBreedCardDef(currentCharacter), catalogId: 'breedMonster' };
    }
    // 旧セーブはカード定義一式（画像URLを含む）をデッキ内へコピーしている。
    // 最新カタログを安定ID/名前で引き直し、画像・能力・数値の更新を盤面にも反映する。
    const def = byId.get(card?.catalogId) || byId.get(card?.id) || byName.get(card?.name);
    if (!def) return card;
    return { ...def, catalogId: def.id };
  });
}

/** 段ボール男クリア報酬「未知との遭遇」を所持カードへ一度だけ付与する（受領フラグ付き）。 */
function grantEncounterReward() {
  if (!currentCharacter || currentCharacter.receivedEncounterReward) return;
  const def = SPELL_CATALOG.encounterUnknown;
  const key = cardKey(def);
  currentCharacter.ownedCards = currentCharacter.ownedCards || {};
  currentCharacter.ownedCards[key] = (currentCharacter.ownedCards[key] || 0) + 1;
  currentCharacter.receivedEncounterReward = true;
  saveCharacter(currentUserId, currentCharacter);
  showToast('クリア報酬「未知との遭遇」を入手しました！', 2600);
}


// ===== 運営からのお知らせ（メール） =====
// Firestore announcements/{id}: { subject, body, cards:[{name,count}], createdAt }
//   read: 全ログインユーザー / create: 管理者のみ（firestore.rules参照）。
// 既読・カード受領はプレイヤーの character.inboxSeenIds（配列）で管理する。
// characterはsaveCharacterでFirestoreにミラーされるので端末間でも整合する。
// MONSTER_CATALOG（battleCards.js）は既にNEUTRAL_MONSTER_CATALOGを内包
// しているため、ここで別途スプレッドすると無属性モンスターが重複していた。
const BASE_CARD_CATALOG = [
  ...Object.values(MONSTER_CATALOG),
  ...Object.values(ITEM_CATALOG),
  ...Object.values(SPELL_CATALOG),
];
let cachedAnnouncements = null;

async function loadAnnouncements(force = false) {
  if (!firebaseReady || !db) return [];
  if (cachedAnnouncements && !force) return cachedAnnouncements;
  try {
    // オフライン等でserver取得がハングしてもUIを固めないよう、8秒でタイムアウト。
    // 演出ではないネットワークタイムアウトなので、盤面の速度調整の対象外
    // (window.setTimeoutを明示して倍率シャドウを迂回する)。
    const fetchPromise = fsGetDocs(fsQuery(collection(db, 'announcements'), fsOrderBy('createdAt', 'desc')));
    const timeout = new Promise((_, reject) => window.setTimeout(() => reject(new Error('timeout')), 8000));
    const snap = await Promise.race([fetchPromise, timeout]);
    cachedAnnouncements = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (error) {
    console.warn('お知らせの読み込みに失敗', error);
    cachedAnnouncements = cachedAnnouncements || [];
  }
  return cachedAnnouncements;
}

function seenAnnouncementIds() {
  const ids = currentCharacter?.inboxSeenIds;
  return Array.isArray(ids) ? ids : [];
}

function unseenAnnouncementIds(list) {
  const seen = new Set(seenAnnouncementIds());
  return list.filter((a) => !seen.has(a.id)).map((a) => a.id);
}

/** ハブのメールバッジ（NEW）を、まだ開封していないお知らせがあるかで出し分ける。 */
async function refreshMailBadge() {
  if (!hubMailBadge) return;
  hubMailBadge.hidden = true;
  const list = await loadAnnouncements();
  hubMailBadge.hidden = unseenAnnouncementIds(list).length === 0;
}

/** 未開封お知らせの添付カードを所持カードへ加算し、既読化する。付与したカード名一覧を返す。 */
function claimAnnouncementCards(list) {
  const seen = new Set(seenAnnouncementIds());
  const granted = [];
  let changed = false;
  for (const a of list) {
    if (seen.has(a.id)) continue;
    seen.add(a.id);
    changed = true;
    if (!Array.isArray(a.cards)) continue;
    for (const c of a.cards) {
      const name = c?.name;
      const count = Math.max(0, Math.min(99, Number(c?.count) || 0));
      if (!name || count <= 0) continue;
      currentCharacter.ownedCards = currentCharacter.ownedCards || {};
      currentCharacter.ownedCards[name] = (currentCharacter.ownedCards[name] || 0) + count;
      for (let i = 0; i < count; i++) granted.push(name);
    }
  }
  if (changed) {
    currentCharacter.inboxSeenIds = [...seen];
    saveCharacter(currentUserId, currentCharacter);
  }
  return granted;
}

function renderMailList(list, newIds) {
  mailList.replaceChildren();
  if (list.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'mail-empty';
    empty.textContent = 'お知らせはまだありません';
    mailList.appendChild(empty);
    return;
  }
  for (const a of list) {
    const isNew = newIds.has(a.id);
    const item = document.createElement('div');
    item.className = 'mail-item' + (isNew ? ' is-new' : '');

    const head = document.createElement('div');
    head.className = 'mail-item-head';
    if (isNew) {
      const tag = document.createElement('span');
      tag.className = 'mail-item-new-tag';
      tag.textContent = 'NEW';
      head.appendChild(tag);
    }
    const subject = document.createElement('span');
    subject.className = 'mail-item-subject';
    subject.textContent = a.subject || '(無題)';
    head.appendChild(subject);
    const date = document.createElement('span');
    date.className = 'mail-item-date';
    date.textContent = fmtDate(a.createdAt);
    head.appendChild(date);
    item.appendChild(head);

    if (a.body) {
      const body = document.createElement('div');
      body.className = 'mail-item-body';
      body.textContent = a.body;
      item.appendChild(body);
    }

    if (Array.isArray(a.cards) && a.cards.length > 0) {
      const cardsBox = document.createElement('div');
      cardsBox.className = 'mail-item-cards';
      const label = document.createElement('div');
      label.className = 'mail-item-cards-label';
      label.textContent = isNew ? '🎁 カードを受け取りました' : '🎁 配布カード';
      cardsBox.appendChild(label);
      const chips = document.createElement('div');
      chips.className = 'mail-card-chips';
      for (const c of a.cards) {
        const chip = document.createElement('span');
        chip.className = 'mail-card-chip';
        chip.textContent = `${c.name} ×${c.count}`;
        chips.appendChild(chip);
      }
      cardsBox.appendChild(chips);
      item.appendChild(cardsBox);
    }
    mailList.appendChild(item);
  }
}

async function openMailModal() {
  // まずモーダルを即座に開いて「読み込み中」を出す。ネットワークが遅くても
  // タップに必ず反応し、閉じるボタンも常に効く（ハング＝フリーズを防ぐ）。
  mailList.replaceChildren();
  const loading = document.createElement('div');
  loading.className = 'mail-empty';
  loading.textContent = '読み込み中…';
  mailList.appendChild(loading);
  mailModal.classList.remove('hidden');

  const list = await loadAnnouncements(true);
  if (mailModal.classList.contains('hidden')) return; // 読み込み中に閉じられたら何もしない
  // 開封前に「未読」を確定させ、NEW表示とカード受領演出に使う。
  const newIds = new Set(unseenAnnouncementIds(list));
  renderMailList(list, newIds);
  // 開封＝受領: 未読の添付カードを付与し、既読化してバッジを消す。
  const granted = claimAnnouncementCards(list);
  if (hubMailBadge) hubMailBadge.hidden = true;
  if (granted.length > 0) {
    const summary = granted.length <= 3 ? granted.join('・') : `${granted.slice(0, 3).join('・')} 他${granted.length - 3}枚`;
    showToast(`カードを受け取りました: ${summary}`, 3000);
  }
}

hubMailButton?.addEventListener('click', openMailModal);
mailClose?.addEventListener('click', () => mailModal.classList.add('hidden'));
mailModal?.addEventListener('click', (event) => { if (event.target === mailModal) mailModal.classList.add('hidden'); });

// ===== 管理: お知らせ配信フォーム（管理者専用画面内） =====
let composeAttachments = [];

function populateComposeCardSelect() {
  if (!adminComposeCard || adminComposeCard.options.length > 0) return;
  const sorted = [...BASE_CARD_CATALOG].sort((a, b) => String(a.name).localeCompare(String(b.name), 'ja'));
  for (const card of sorted) {
    const opt = document.createElement('option');
    opt.value = card.name;
    opt.textContent = `${card.name}（${card.rarity}）`;
    adminComposeCard.appendChild(opt);
  }
}

function renderComposeAttachments() {
  if (!adminComposeAttachments) return;
  adminComposeAttachments.replaceChildren();
  composeAttachments.forEach((att, idx) => {
    const li = document.createElement('li');
    const label = document.createElement('span');
    label.textContent = `${att.name} ×${att.count}`;
    li.appendChild(label);
    const rm = document.createElement('button');
    rm.type = 'button';
    rm.textContent = '削除';
    rm.addEventListener('click', () => { composeAttachments.splice(idx, 1); renderComposeAttachments(); });
    li.appendChild(rm);
    adminComposeAttachments.appendChild(li);
  });
}

adminComposeAdd?.addEventListener('click', () => {
  const name = adminComposeCard?.value;
  const count = Math.max(1, Math.min(9, Number(adminComposeCount?.value) || 1));
  if (!name) return;
  const existing = composeAttachments.find((a) => a.name === name);
  if (existing) existing.count = Math.min(9, existing.count + count);
  else composeAttachments.push({ name, count });
  renderComposeAttachments();
});

adminComposeSend?.addEventListener('click', async () => {
  if (!isAdminUser || !firebaseReady || !db) {
    adminComposeStatus.textContent = '配信できる環境ではありません';
    adminComposeStatus.className = 'admin-compose-status err';
    return;
  }
  const subject = (adminComposeSubject?.value || '').trim();
  const body = (adminComposeBody?.value || '').trim();
  if (!subject && !body && composeAttachments.length === 0) {
    adminComposeStatus.textContent = '件名・本文・カードのいずれかを入力してください';
    adminComposeStatus.className = 'admin-compose-status err';
    return;
  }
  adminComposeSend.disabled = true;
  adminComposeStatus.textContent = '配信中…';
  adminComposeStatus.className = 'admin-compose-status';
  try {
    await fsAddDoc(collection(db, 'announcements'), {
      subject: subject || '(無題)',
      body,
      cards: composeAttachments.map((a) => ({ name: a.name, count: a.count })),
      createdAt: fsServerTimestamp(),
    });
    adminComposeSubject.value = '';
    adminComposeBody.value = '';
    composeAttachments = [];
    renderComposeAttachments();
    cachedAnnouncements = null; // 次回開封で最新を取得
    adminComposeStatus.textContent = '配信しました！';
    adminComposeStatus.className = 'admin-compose-status ok';
  } catch (error) {
    console.error('お知らせ配信に失敗', error);
    adminComposeStatus.textContent = '配信に失敗しました（権限またはネットワークをご確認ください）';
    adminComposeStatus.className = 'admin-compose-status err';
  } finally {
    adminComposeSend.disabled = false;
  }
});

populateComposeCardSelect();

/** getCardCatalog() plus this character's live breed-monster card (not cached globally - it's per-character and its stats change as parts are equipped). */
function effectiveCatalog() {
  return [...getCardCatalog(currentUserId), buildBreedCardDef(currentCharacter)];
}

let deckWorkingCounts = null;
let editingDeckIndex = 0;
let deckActiveCategory = 'fire';
let deckCurrentCategory = 'monster';
const deckHiddenRarities = new Set();

const DECK_CATEGORY_TABS = [
  { id: 'fire', label: '火モン', test: (card) => card.type === CardType.MONSTER && card.element === Element.FIRE },
  { id: 'water', label: '水モン', test: (card) => card.type === CardType.MONSTER && card.element === Element.WATER },
  { id: 'forest', label: '森モン', test: (card) => card.type === CardType.MONSTER && card.element === Element.FOREST },
  { id: 'thunder', label: '雷モン', test: (card) => card.type === CardType.MONSTER && card.element === Element.THUNDER },
  { id: 'neutral', label: '無モン', test: (card) => card.type === CardType.MONSTER && card.element === Element.NEUTRAL },
  { id: 'gear', label: 'アイテム', test: (card) => card.type === CardType.GEAR },
  { id: 'spell', label: 'スペル', test: (card) => card.type === CardType.SPELL },
];

function currentDeckCategoryRank(card) {
  if (card.type === CardType.MONSTER) {
    return {
      [Element.NEUTRAL]: 0,
      [Element.FIRE]: 1,
      [Element.WATER]: 2,
      [Element.FOREST]: 3,
      [Element.THUNDER]: 4,
    }[card.element] ?? 4;
  }
  if (card.type === CardType.GEAR) return 5;
  if (card.type === CardType.SPELL) return 6;
  return 7;
}

const DECK_CURRENT_TABS = [
  { id: 'monster', label: 'モンスター', test: (card) => card.type === CardType.MONSTER },
  { id: 'gear', label: 'アイテム', test: (card) => card.type === CardType.GEAR },
  { id: 'spell', label: 'スペル', test: (card) => card.type === CardType.SPELL },
];

function deckTotal() {
  let total = 0;
  for (const count of deckWorkingCounts.values()) total += count;
  return total;
}

function updateDeckTotalDisplay() {
  const total = deckTotal();
  deckCount.textContent = `${total} / ${DECK_SIZE}`;
  deckSave.disabled = total !== DECK_SIZE;
  const catalogByKey = new Map(effectiveCatalog().map((card) => [cardKey(card), card]));
  const cards = [];
  for (const [key, count] of deckWorkingCounts.entries()) {
    const card = catalogByKey.get(key);
    if (card) for (let i = 0; i < count; i++) cards.push(card);
  }
  renderDeckComposition(deckComposition, deckBreakdownFromCards(cards));
}

function ownedCountOf(key) {
  return (currentCharacter.ownedCards || {})[key] || 0;
}

/** Up to MAX_DECKS tabs (existing deck names) plus a trailing "＋ 新規作成" tab while under the cap. Clicking a tab (re-)opens the deck editor on that slot. */
function renderDeckSlotTabs() {
  deckSlotTabs.replaceChildren();
  currentCharacter.decks.forEach((deck, index) => {
    const tab = document.createElement('button');
    tab.className = `deck-slot-tab${index === editingDeckIndex ? ' selected' : ''}`;
    tab.textContent = deck.name;
    tab.addEventListener('click', () => {
      editingDeckIndex = index;
      showDeckScreen();
    });
    deckSlotTabs.appendChild(tab);
  });
  if (currentCharacter.decks.length < MAX_DECKS) {
    const addTab = document.createElement('button');
    addTab.className = 'deck-slot-tab';
    addTab.textContent = '＋ 新規作成';
    addTab.addEventListener('click', () => {
      currentCharacter.decks.push({
        id: `deck-${Date.now()}`,
        name: `デッキ${currentCharacter.decks.length + 1}`,
        deckList: [],
      });
      editingDeckIndex = currentCharacter.decks.length - 1;
      showDeckScreen();
    });
    deckSlotTabs.appendChild(addTab);
  }
}

function showDeckScreen() {
  // 既に段ボール男をクリア済み（storyProgress>=4）で未受領なら、デッキ画面を開いた
  // タイミングでクリア報酬「未知との遭遇」を一度だけ付与する（過去クリア勢の救済）。
  if ((currentCharacter.storyProgress || 0) >= 4 && !currentCharacter.receivedEncounterReward) {
    grantEncounterReward();
  }
  if (editingDeckIndex >= currentCharacter.decks.length) editingDeckIndex = 0;
  const editingDeck = currentCharacter.decks[editingDeckIndex];
  renderDeckSlotTabs();
  deckNameInput.value = editingDeck.name;

  const catalog = effectiveCatalog();
  const catalogByKey = new Map(catalog.map((def) => [cardKey(def), def]));
  deckWorkingCounts = new Map();
  for (const card of editingDeck.deckList || []) {
    const key = cardKey(card);
    // カタログに存在しないキー（壊れた保存データ等）は数えない - 総数表示が
    // 実際の有効枚数を正しく反映し、保存し直すと自然に取り除かれる。
    if (!catalogByKey.has(key)) continue;
    deckWorkingCounts.set(key, (deckWorkingCounts.get(key) || 0) + 1);
  }

  const makeInfo = (def) => {
    const presentation = cardListPresentation(def, ownedCountOf(cardKey(def)));
    const info = document.createElement('div');
    info.className = 'deck-row-info';
    const nameEl = document.createElement('button');
    nameEl.className = 'deck-row-name deck-card-detail-link card-summary-heading';
    nameEl.textContent = presentation.heading;
    nameEl.addEventListener('click', () => showCardDetail(def));
    const meta = document.createElement('div');
    meta.className = 'deck-row-meta';
    meta.textContent = presentation.stats;
    info.append(nameEl, meta);
    return info;
  };

  function renderEditor() {
    updateDeckTotalDisplay();
    deckCategoryTabs.replaceChildren();
    for (const category of DECK_CATEGORY_TABS) {
      const button = document.createElement('button');
      button.className = `deck-category-tab${category.id === deckActiveCategory ? ' selected' : ''}`;
      button.textContent = category.label;
      button.addEventListener('click', () => {
        deckActiveCategory = category.id;
        renderEditor();
      });
      deckCategoryTabs.appendChild(button);
    }

    deckRarityFilters.replaceChildren();
    for (const rarity of [Rarity.N, Rarity.S, Rarity.R, Rarity.EX]) {
      const button = document.createElement('button');
      button.className = `deck-rarity-filter${deckHiddenRarities.has(rarity) ? ' disabled' : ''}`;
      button.textContent = rarity;
      button.addEventListener('click', () => {
        if (deckHiddenRarities.has(rarity)) deckHiddenRarities.delete(rarity);
        else deckHiddenRarities.add(rarity);
        renderEditor();
      });
      deckRarityFilters.appendChild(button);
    }

    const category = DECK_CATEGORY_TABS.find((item) => item.id === deckActiveCategory) || DECK_CATEGORY_TABS[0];
    deckCatalogList.replaceChildren();
    for (const def of catalog.filter((card) =>
      category.test(card)
      && !deckHiddenRarities.has(card.rarity)
      && ownedCountOf(cardKey(card)) > 0
    )) {
      const key = cardKey(def);
      const owned = ownedCountOf(key);
      const count = deckWorkingCounts.get(key) || 0;
      const copyCap = Math.min(MAX_COPIES_PER_CARD, owned);
      const row = document.createElement('div');
      row.className = 'deck-row deck-add-row';
      const minusBtn = document.createElement('button');
      minusBtn.className = 'deck-add-button deck-add-minus';
      minusBtn.textContent = '−';
      minusBtn.disabled = count <= 0;
      minusBtn.addEventListener('click', () => {
        const next = Math.max(0, count - 1);
        if (next) deckWorkingCounts.set(key, next);
        else deckWorkingCounts.delete(key);
        renderEditor();
      });
      const plusBtn = document.createElement('button');
      plusBtn.className = 'deck-add-button';
      plusBtn.textContent = '＋';
      plusBtn.disabled = count >= copyCap || deckTotal() >= DECK_SIZE;
      plusBtn.addEventListener('click', () => {
        deckWorkingCounts.set(key, count + 1);
        renderEditor();
      });
      const addedCount = document.createElement('strong');
      addedCount.className = 'deck-add-count';
      addedCount.textContent = `×${count}`;
      row.append(makeInfo(def), minusBtn, addedCount, plusBtn);
      deckCatalogList.appendChild(row);
    }

    deckCurrentTabs.replaceChildren();
    for (const tabDef of DECK_CURRENT_TABS) {
      const tab = document.createElement('button');
      tab.type = 'button';
      tab.className = `deck-current-tab${tabDef.id === deckCurrentCategory ? ' selected' : ''}`;
      tab.textContent = tabDef.label;
      tab.addEventListener('click', () => {
        deckCurrentCategory = tabDef.id;
        renderEditor();
      });
      deckCurrentTabs.appendChild(tab);
    }

    deckCurrentList.replaceChildren();
    const currentCategory = DECK_CURRENT_TABS.find((item) => item.id === deckCurrentCategory) || DECK_CURRENT_TABS[0];
    const currentEntries = [...deckWorkingCounts.entries()]
      .map(([key, count]) => ({ key, count, def: catalogByKey.get(key) }))
      .filter(({ count, def }) => count > 0 && def && currentCategory.test(def))
      .sort((a, b) => currentDeckCategoryRank(a.def) - currentDeckCategoryRank(b.def)
        || a.def.name.localeCompare(b.def.name, 'ja'));
    for (const { key, count, def } of currentEntries) {
      const row = document.createElement('div');
      row.className = 'deck-current-row';
      const info = makeInfo(def);
      const countEl = document.createElement('strong');
      countEl.textContent = `×${count}`;
      const minusBtn = document.createElement('button');
      minusBtn.className = 'deck-current-minus';
      minusBtn.textContent = '−';
      minusBtn.addEventListener('click', () => {
        deckWorkingCounts.set(key, count - 1);
        renderEditor();
      });
      const plusBtn = document.createElement('button');
      plusBtn.className = 'deck-current-plus';
      plusBtn.textContent = '＋';
      plusBtn.disabled = count >= Math.min(MAX_COPIES_PER_CARD, ownedCountOf(key)) || deckTotal() >= DECK_SIZE;
      plusBtn.addEventListener('click', () => {
        deckWorkingCounts.set(key, count + 1);
        renderEditor();
      });
      row.append(info, minusBtn, countEl, plusBtn);
      deckCurrentList.appendChild(row);
    }
  }

  renderEditor();
  showScreen(deckScreen);
}

deckSave.addEventListener('click', () => {
  if (deckSave.disabled) return;
  const catalog = effectiveCatalog();
  const byKey = new Map(catalog.map((def) => [cardKey(def), def]));
  const newList = [];
  for (const [key, count] of deckWorkingCounts.entries()) {
    const def = byKey.get(key);
    if (!def) continue; // 保険: 解決できないキーは書き込まない
    for (let i = 0; i < count; i++) newList.push({ ...def });
  }
  const name = deckNameInput.value.trim() || currentCharacter.decks[editingDeckIndex].name;
  currentCharacter.decks[editingDeckIndex] = { ...currentCharacter.decks[editingDeckIndex], name, deckList: newList };
  saveCharacter(currentUserId, currentCharacter);
  showHubScreen();
});

deckBack.addEventListener('click', showHubScreen);

// ---- Shop: buy permanent card packs with M, or sell spare cards. EX never sells. ----

/** Summed across every one of the character's books - a card still committed to any of them can't be sold. */
function inDeckCountOf(key) {
  let count = 0;
  for (const deck of currentCharacter.decks || []) {
    for (const card of deck.deckList || []) {
      if (cardKey(card) === key) count += 1;
    }
  }
  return count;
}

// ---- デッキ選択（対戦・ストーリー共通）: 盤面に入る直前に毎回どのデッキを使うか選ばせる ----

/** 最大3件を並べ、選んだデッキを内訳付きで確認してから確定する。resolveされるのは確定した{id,name,deckList}。 */
function promptDeckSelection({ onCancel = null } = {}) {
  return new Promise((resolve) => {
    let pendingDeck = null;

    function showPicker() {
      deckSelectConfirm.classList.add('hidden');
      deckSelectPicker.classList.remove('hidden');
      deckSelectList.replaceChildren();
      for (const deck of currentCharacter.decks) {
        const card = document.createElement('div');
        card.className = 'deck-select-card';
        const icon = document.createElement('div');
        icon.className = 'deck-select-book-icon';
        icon.textContent = '📖';
        const name = document.createElement('div');
        name.className = 'deck-select-name';
        name.textContent = deck.name;
        const meta = document.createElement('div');
        meta.className = 'deck-select-meta';
        meta.textContent = `${deck.deckList.length}枚`;
        card.append(icon, name, meta);
        card.addEventListener('click', () => showConfirm(deck));
        deckSelectList.appendChild(card);
      }
    }

    function showConfirm(deck) {
      // 保存済みの古いカードコピーではなく最新カタログを使い、画像・能力・
      // 数値とブリードの現在状態を盤面開始直前に必ず反映する。
      pendingDeck = { ...deck, deckList: resolveDeckCardsForBattle(deck.deckList) };
      deckSelectConfirmText.textContent = `「${deck.name}」にしますか？`;

      const counts = new Map(); // key -> { def, count }
      for (const card of pendingDeck.deckList) {
        if (!card?.name) continue; // 壊れた保存データ（デッキ編成画面を開けば自動で除去される）は表示しない
        const key = cardKey(card);
        if (!counts.has(key)) counts.set(key, { def: card, count: 0 });
        counts.get(key).count += 1;
      }
      deckSelectBreakdown.replaceChildren();
      for (const { def, count } of counts.values()) {
        const row = document.createElement('div');
        row.className = 'deck-row deck-select-detail-row';
        row.role = 'button';
        row.tabIndex = 0;
        row.setAttribute('aria-label', `${def.name}の詳細を表示`);
        const openDetail = () => showCardDetail(def);
        row.addEventListener('click', openDetail);
        row.addEventListener('keydown', (event) => {
          if (event.key !== 'Enter' && event.key !== ' ') return;
          event.preventDefault();
          openDetail();
        });
        const swatch = document.createElement('div');
        swatch.className = 'deck-row-swatch';
        swatch.style.background = cardColor(def);
        const info = document.createElement('div');
        info.className = 'deck-row-info';
        const nameEl = document.createElement('div');
        nameEl.className = 'deck-row-name deck-card-detail-link';
        nameEl.textContent = def.name;
        const meta = document.createElement('div');
        meta.className = 'deck-row-meta';
        meta.textContent = `${describeCard(def)} / ${count}枚`;
        info.append(nameEl, meta);
        row.append(swatch, info);
        deckSelectBreakdown.appendChild(row);
      }

      deckSelectPicker.classList.add('hidden');
      deckSelectConfirm.classList.remove('hidden');
    }

    function onYes() {
      cleanup();
      resolve(pendingDeck);
    }
    function onNo() {
      showPicker();
    }
    function onBack() {
      cleanup();
      onCancel?.();
      resolve(null);
    }
    function cleanup() {
      deckSelectYes.removeEventListener('click', onYes);
      deckSelectNo.removeEventListener('click', onNo);
      deckSelectBack.removeEventListener('click', onBack);
    }

    deckSelectYes.addEventListener('click', onYes);
    deckSelectNo.addEventListener('click', onNo);
    deckSelectBack.classList.toggle('hidden', !onCancel);
    if (onCancel) deckSelectBack.addEventListener('click', onBack);
    showScreen(deckSelectScreen);
    showPicker();
  });
}

let shopActiveMode = null;
const shopSellSelections = new Map();

function getShopSellEntries() {
  const catalog = getCardCatalog(currentUserId);
  const byKey = new Map(catalog.map((def) => [cardKey(def), def]));
  const entries = [];
  for (const [key, requested] of shopSellSelections) {
    const def = byKey.get(key);
    const price = def ? RARITY_SELL_PRICE[def.rarity] : null;
    const owned = currentCharacter.ownedCards?.[key] || 0;
    const surplus = Math.max(0, owned - inDeckCountOf(key));
    const count = Math.min(Math.max(0, requested), surplus);
    if (def && price != null && count > 0) entries.push({ key, def, count, price });
  }
  return entries;
}

function closeShopSellConfirm() {
  shopSellConfirm.classList.add('hidden');
}

function openShopSellConfirm() {
  const entries = getShopSellEntries();
  if (!entries.length) return;
  shopSellConfirmList.replaceChildren();
  let totalCount = 0;
  let totalPrice = 0;
  for (const entry of entries) {
    totalCount += entry.count;
    totalPrice += entry.count * entry.price;
    const row = document.createElement('div');
    row.className = 'shop-sell-confirm-row';
    const name = document.createElement('span');
    name.textContent = `${entry.def.name} ×${entry.count}`;
    const value = document.createElement('strong');
    value.textContent = `${entry.count * entry.price}M`;
    row.append(name, value);
    shopSellConfirmList.appendChild(row);
  }
  shopSellConfirmTotal.textContent = `合計 ${totalCount}枚 ／ ${totalPrice}M`;
  shopSellConfirm.classList.remove('hidden');
}

const SHOP_PACK_ICONS = Object.freeze({
  fire: '🔥',
  forest: '🌿',
  water: '💧',
  thunder: '⚡',
  neutral: '⚪',
  item: '⚔️',
  spell: '📖',
});

function setShopMode(mode) {
  if (mode !== 'sell') closeShopSellConfirm();
  shopActiveMode = mode;
  shopMainMenu.classList.toggle('hidden', mode != null);
  shopCardView.classList.toggle('hidden', mode !== 'cards');
  shopPartsView.classList.toggle('hidden', mode !== 'parts');
  shopSellView.classList.toggle('hidden', mode !== 'sell');
  shopSectionBack.classList.toggle('hidden', mode == null);
  shopBackButton.classList.toggle('hidden', mode != null);
}

function showShopScreen(mode = null) {
  const catalog = getCardCatalog(currentUserId);
  const byKey = new Map(catalog.map((def) => [cardKey(def), def]));
  shopCurrency.textContent = `所持M: ${currentCharacter.m}`;
  shopPackResult.classList.add('hidden');
  shopPackList.replaceChildren();
  shopList.replaceChildren();
  shopPartsList.replaceChildren();
  setShopMode(mode);

  for (const pack of PACKS) {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'shop-pack-icon-button';
    row.dataset.price = String(pack.cost);
    row.setAttribute('aria-label', `${pack.name}を${pack.cost}Mで購入`);

    const icon = document.createElement('span');
    icon.className = 'shop-pack-icon';
    icon.textContent = SHOP_PACK_ICONS[pack.id] || '🎴';
    const name = document.createElement('div');
    name.className = 'shop-pack-name';
    name.textContent = pack.name;
    const meta = document.createElement('div');
    meta.className = 'shop-pack-icon-meta';
    meta.textContent = `${pack.description}\n最低1枚S以上`;
    const price = document.createElement('strong');
    price.className = 'shop-pack-price';
    price.textContent = `${pack.cost}M`;
    row.append(icon, name, meta, price);
    row.disabled = currentCharacter.m < pack.cost;
    row.addEventListener('click', async () => {
      if (currentCharacter.m < pack.cost) return;
      const confirmed = await confirmYesNo(`「${pack.name}」を買いますか？\n${pack.cost}Mを使用します。`);
      if (!confirmed || currentCharacter.m < pack.cost) return;
      const cards = drawPack(pack, catalog);
      const newFlags = cards.map((card) => (currentCharacter.ownedCards[cardKey(card)] || 0) === 0);
      currentCharacter.m -= pack.cost;
      for (const card of cards) {
        const key = cardKey(card);
        currentCharacter.ownedCards[key] = (currentCharacter.ownedCards[key] || 0) + 1;
      }
      saveCharacter(currentUserId, currentCharacter);
      showPackResult(cards, { newFlags, onDetail: showCardDetail });
      shopCurrency.textContent = `所持M: ${currentCharacter.m}`;
      renderPackButtons();
    });
    shopPackList.appendChild(row);
  }

  if (!currentCharacter.ownedPartIds) currentCharacter.ownedPartIds = [];
  const partPackRow = document.createElement('div');
  partPackRow.className = 'shop-pack-row';
  const partPackInfo = document.createElement('div');
  partPackInfo.className = 'deck-row-info';
  const partPackName = document.createElement('div');
  partPackName.className = 'shop-pack-name';
  partPackName.textContent = 'ブリードパーツパック';
  const partPackMeta = document.createElement('div');
  partPackMeta.className = 'deck-row-meta';
  partPackMeta.textContent = `${BREED_PART_PACK.count}個 / N65%・S25%・R10% / 最低1個S以上 / ${BREED_PART_PACK.cost}M`;
  partPackInfo.append(partPackName, partPackMeta);
  const partPackButton = document.createElement('button');
  partPackButton.className = 'deck-row-sell';
  partPackButton.textContent = `${BREED_PART_PACK.cost}Mで引く`;
  partPackButton.disabled = currentCharacter.m < BREED_PART_PACK.cost;
  partPackButton.addEventListener('click', () => {
    if (currentCharacter.m < BREED_PART_PACK.cost) return;
    const parts = drawBreedPartPack();
    const previouslyOwned = new Set(currentCharacter.ownedPartIds);
    const newFlags = parts.map((part) => !previouslyOwned.has(part.id));
    currentCharacter.m -= BREED_PART_PACK.cost;
    currentCharacter.ownedPartIds.push(...parts.map((part) => part.id));
    saveCharacter(currentUserId, currentCharacter);
    showPackResult(parts, {
      newFlags,
      onDetail: (part) => showBreedPartDetail(part),
      isPart: true,
    });
    shopCurrency.textContent = `所持M: ${currentCharacter.m}`;
    partPackButton.disabled = currentCharacter.m < BREED_PART_PACK.cost;
    renderPackButtons();
  });
  partPackRow.append(partPackInfo, partPackButton);
  shopPartsList.appendChild(partPackRow);

  for (const [key, owned] of Object.entries(currentCharacter.ownedCards || {})) {
    if (owned <= 0) continue;
    const def = byKey.get(key);
    if (!def) continue;
    const surplus = owned - inDeckCountOf(key);
    const price = RARITY_SELL_PRICE[def.rarity];

    const row = document.createElement('div');
    row.className = 'deck-row';

    const swatch = document.createElement('div');
    swatch.className = 'deck-row-swatch';
    swatch.style.background = cardColor(def);

    const info = document.createElement('div');
    info.className = 'deck-row-info';
    const nameEl = document.createElement('div');
    nameEl.className = 'deck-row-name';
    nameEl.textContent = def.name;
    nameEl.addEventListener('click', () => showCardDetail(def));
    const meta = document.createElement('div');
    meta.className = 'deck-row-meta';
    meta.textContent = price != null
      ? `所持${owned} / 余り${Math.max(surplus, 0)} / 売却${price}M`
      : `所持${owned} / ${def.rarity}は売却不可`;
    info.append(nameEl, meta);

    const selected = Math.min(shopSellSelections.get(key) || 0, Math.max(surplus, 0));
    if (selected > 0) shopSellSelections.set(key, selected);
    else shopSellSelections.delete(key);
    const controls = document.createElement('div');
    controls.className = 'shop-sell-controls';
    const minus = document.createElement('button');
    minus.type = 'button';
    minus.className = 'shop-sell-step';
    minus.textContent = '−';
    minus.setAttribute('aria-label', `${def.name}の売却枚数を減らす`);
    minus.disabled = selected <= 0;
    const quantity = document.createElement('span');
    quantity.className = 'shop-sell-quantity';
    quantity.textContent = `×${selected}`;
    const plus = document.createElement('button');
    plus.type = 'button';
    plus.className = 'shop-sell-step';
    plus.textContent = '＋';
    plus.setAttribute('aria-label', `${def.name}の売却枚数を増やす`);
    plus.disabled = price == null || selected >= surplus;
    minus.addEventListener('click', () => {
      const next = Math.max(0, (shopSellSelections.get(key) || 0) - 1);
      if (next) shopSellSelections.set(key, next);
      else shopSellSelections.delete(key);
      showShopScreen('sell');
    });
    plus.addEventListener('click', () => {
      const next = Math.min(surplus, (shopSellSelections.get(key) || 0) + 1);
      if (next > 0) shopSellSelections.set(key, next);
      showShopScreen('sell');
    });
    controls.append(minus, quantity, plus);
    if (selected > 0) row.classList.add('shop-sell-selected');

    row.append(swatch, info, controls);
    shopList.appendChild(row);
  }
  const sellEntries = getShopSellEntries();
  const sellCount = sellEntries.reduce((sum, entry) => sum + entry.count, 0);
  const sellTotal = sellEntries.reduce((sum, entry) => sum + entry.count * entry.price, 0);
  shopBulkSell.disabled = sellCount === 0;
  shopBulkSell.textContent = sellCount ? `一括売却（${sellCount}枚）` : '一括売却';
  shopSellSummary.textContent = sellCount
    ? `選択中：${sellCount}枚 ／ 売却額 ${sellTotal}M`
    : '売却するカードを選択してください';
  showScreen(shopScreen);
}

function renderPackButtons() {
  for (const button of shopPackList.querySelectorAll('button')) {
    const price = Number(button.dataset.price);
    button.disabled = currentCharacter.m < price;
  }
}

function showPackResult(cards, { newFlags = [], onDetail = showCardDetail, isPart = false } = {}) {
  shopPackCards.replaceChildren();
  cards.forEach((card, index) => {
    const el = document.createElement('button');
    el.className = 'shop-result-card';
    el.style.borderColor = RARITY_COLOR[card.rarity];
    if (newFlags[index]) {
      const badge = document.createElement('span');
      badge.className = 'shop-new-badge';
      badge.textContent = 'NEW';
      el.appendChild(badge);
    }
    if (isPart) {
      const rarity = document.createElement('strong');
      rarity.style.color = RARITY_COLOR[card.rarity];
      rarity.textContent = card.rarity;
      const name = document.createElement('span');
      name.textContent = card.name;
      el.append(rarity, name);
    } else {
      const cardFace = document.createElement('div');
      cardFace.className = 'card shop-result-card-face';
      renderCardEl(cardFace, card);
      el.appendChild(cardFace);
    }
    if (onDetail) el.addEventListener('click', () => onDetail(card));
    shopPackCards.appendChild(el);
  });
  shopPackResult.classList.remove('hidden');
}

shopPackResultClose.addEventListener('click', () => {
  shopPackResult.classList.add('hidden');
  showShopScreen(shopActiveMode);
});

shopMenuCards.addEventListener('click', () => setShopMode('cards'));
shopMenuParts.addEventListener('click', () => setShopMode('parts'));
shopMenuSell.addEventListener('click', () => {
  shopSellSelections.clear();
  showShopScreen('sell');
});
shopSectionBack.addEventListener('click', () => setShopMode(null));

shopBulkSell.addEventListener('click', openShopSellConfirm);
shopSellConfirmNo.addEventListener('click', closeShopSellConfirm);
shopSellConfirmYes.addEventListener('click', () => {
  const entries = getShopSellEntries();
  if (!entries.length) {
    closeShopSellConfirm();
    showShopScreen('sell');
    return;
  }
  let totalPrice = 0;
  for (const entry of entries) {
    currentCharacter.ownedCards[entry.key] -= entry.count;
    totalPrice += entry.count * entry.price;
  }
  currentCharacter.m += totalPrice;
  saveCharacter(currentUserId, currentCharacter);
  shopSellSelections.clear();
  closeShopSellConfirm();
  showShopScreen('sell');
});

shopBackButton.addEventListener('click', showHubScreen);

// ---- ブリード: rename + view computed stats + equip/unequip owned parts ----

function showBreedScreen() {
  breedName.value = currentCharacter.breedMonster.name;
  breedImage.value = '';
  breedImagePreview.src = currentCharacter.breedMonster.imageDataUrl || BREED_DEFAULT_IMAGE_URL;
  breedImagePreview.classList.remove('hidden');
  breedImageReset.disabled = !currentCharacter.breedMonster.imageDataUrl;
  breedError.classList.add('hidden');
  renderBreedScreen();
  showScreen(breedScreen);
}

function renderBreedScreen() {
  const stats = computeBreedStats(currentCharacter.breedMonster);
  const equippedTotal = currentCharacter.breedMonster.equippedPartIds.length;
  breedStats.textContent = `属性: ${ELEMENT_LABEL[stats.element]} / ATK ${stats.atk} / HP ${stats.hp} / 召喚コスト ${stats.cost}G / パーツ ${equippedTotal}/${BREED_MAX_EQUIPPED_PARTS}個`;

  breedPartsList.replaceChildren();
  const ownedPartCounts = new Map();
  for (const partId of currentCharacter.ownedPartIds || []) {
    ownedPartCounts.set(partId, (ownedPartCounts.get(partId) || 0) + 1);
  }
  for (const [partId, ownedCount] of ownedPartCounts) {
    const def = BREED_PARTS.find((p) => p.id === partId);
    if (!def) continue;
    const equippedCount = currentCharacter.breedMonster.equippedPartIds.filter((id) => id === def.id).length;
    const canAddCopy = equippedCount < ownedCount;

    const row = document.createElement('div');
    row.className = 'deck-row';

    const info = document.createElement('div');
    info.className = 'deck-row-info breed-part-detail-link';
    info.tabIndex = 0;
    info.setAttribute('role', 'button');
    info.setAttribute('aria-label', `${def.name}の詳細を表示`);
    const openPartDetail = () => showBreedPartDetail(def, ownedCount, equippedCount);
    info.addEventListener('click', openPartDetail);
    info.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      openPartDetail();
    });
    const nameEl = document.createElement('div');
    nameEl.className = 'deck-row-name';
    nameEl.textContent = `${def.name}（所持${ownedCount} / 装着${equippedCount}）`;
    if (equippedCount > 0 && def.chooseElement && currentCharacter.breedMonster.elementPatchChoice) {
      const meta = document.createElement('div');
      meta.className = 'deck-row-meta';
      meta.textContent = `属性→${ELEMENT_LABEL[currentCharacter.breedMonster.elementPatchChoice]}に上書き中`;
      info.append(nameEl, meta);
    } else {
      const badges = document.createElement('div');
      badges.className = 'breed-part-badges';
      for (const badge of breedPartBadges(def)) {
        const badgeEl = document.createElement('span');
        badgeEl.className = 'breed-part-badge';
        badgeEl.textContent = `${badge.icon}${badge.text}`;
        badges.appendChild(badgeEl);
      }
      info.append(nameEl, badges);
    }

    function equip() {
      currentCharacter.breedMonster.equippedPartIds.push(def.id);
      saveCharacter(currentUserId, currentCharacter);
      renderBreedScreen();
    }

    const equipCheck = canAddCopy ? canEquipPart(currentCharacter.breedMonster, def) : { ok: false };
    const actions = document.createElement('div');
    actions.className = 'breed-element-choices';

    if (equippedCount > 0) {
      const removeBtn = document.createElement('button');
      removeBtn.className = 'deck-row-sell';
      removeBtn.textContent = '1個外す';
      removeBtn.addEventListener('click', () => {
        breedError.classList.add('hidden');
        const removeIndex = currentCharacter.breedMonster.equippedPartIds.lastIndexOf(def.id);
        if (removeIndex >= 0) currentCharacter.breedMonster.equippedPartIds.splice(removeIndex, 1);
        saveCharacter(currentUserId, currentCharacter);
        renderBreedScreen();
      });
      actions.appendChild(removeBtn);
    }

    if (canAddCopy && def.chooseElement && equipCheck.ok) {
      const choices = document.createElement('div');
      choices.className = 'breed-element-choices';
      for (const element of CHANGEABLE_BREED_ELEMENTS) {
        const swatch = document.createElement('button');
        swatch.className = 'breed-element-choice';
        swatch.style.background = CARD_COLOR[element];
        swatch.textContent = ELEMENT_LABEL[element];
        swatch.addEventListener('click', () => {
          breedError.classList.add('hidden');
          currentCharacter.breedMonster.elementPatchChoice = element;
          equip();
        });
        choices.appendChild(swatch);
      }
      actions.appendChild(choices);
    } else if (canAddCopy) {
      const equipBtn = document.createElement('button');
      equipBtn.className = 'deck-row-sell';
      equipBtn.textContent = '装着';
      equipBtn.disabled = !equipCheck.ok;
      equipBtn.title = equipCheck.ok ? '' : equipCheck.error;
      equipBtn.addEventListener('click', () => {
        breedError.classList.add('hidden');
        const check = canEquipPart(currentCharacter.breedMonster, def);
        if (!check.ok) {
          breedError.textContent = check.error;
          breedError.classList.remove('hidden');
          return;
        }
        equip();
      });
      actions.appendChild(equipBtn);
    }

    row.append(info, actions);
    breedPartsList.appendChild(row);
  }
}

breedName.addEventListener('change', () => {
  const trimmed = breedName.value.trim();
  currentCharacter.breedMonster.name = trimmed || BREED_BASE.defaultName;
  breedName.value = currentCharacter.breedMonster.name;
  saveCharacter(currentUserId, currentCharacter);
});

breedImage.addEventListener('change', () => {
  const file = breedImage.files?.[0];
  if (!file) return;
  if (!file.type.startsWith('image/')) {
    breedError.textContent = '画像ファイルを選択してください';
    breedError.classList.remove('hidden');
    return;
  }
  const reader = new FileReader();
  reader.addEventListener('load', () => {
    const dataUrl = String(reader.result);
    try {
      currentCharacter.breedMonster.imageDataUrl = dataUrl;
      saveCharacter(currentUserId, currentCharacter);
    } catch {
      breedError.textContent = '画像を保存できませんでした。画像サイズを小さくしてください';
      breedError.classList.remove('hidden');
      return;
    }
    breedImagePreview.src = dataUrl;
    breedImagePreview.classList.remove('hidden');
    breedError.classList.add('hidden');
  });
  reader.readAsDataURL(file);
});

breedImageReset.addEventListener('click', () => {
  if (!currentCharacter.breedMonster.imageDataUrl) return;
  delete currentCharacter.breedMonster.imageDataUrl;
  breedImage.value = '';
  breedImagePreview.src = BREED_DEFAULT_IMAGE_URL;
  breedImageReset.disabled = true;
  breedError.classList.add('hidden');
  saveCharacter(currentUserId, currentCharacter);
});

breedBackButton.addEventListener('click', showHubScreen);

breedHelpButton.addEventListener('click', () => {
  breedHelpModal.classList.remove('hidden');
});
breedHelpClose.addEventListener('click', () => {
  breedHelpModal.classList.add('hidden');
});

battleMenuBack.addEventListener('click', showHubScreen);

// CPU戦の目標総資産は「先頭の数字（3〜15）×1000G」から選ぶ（下2桁は,000固定）。
// これを超えてゴールに止まると勝利。開始時の所持500Gでは即達成にならない。
const GOAL_LEAD_MIN = 3;
const GOAL_LEAD_MAX = 15;
const GOAL_LEAD_DEFAULT = 5;

/** 目標総資産の選択（先頭3〜15を◀▶で選ぶ）。選んだ値(3000〜15000)を返す。
 *  「戻る」でnullを返す。 */
function promptGoalSelection() {
  return new Promise((resolve) => {
    let lead = GOAL_LEAD_DEFAULT;
    const render = () => {
      goalSelectValue.innerHTML = `${lead},000<small>G</small>`;
      goalSelectDec.disabled = lead <= GOAL_LEAD_MIN;
      goalSelectInc.disabled = lead >= GOAL_LEAD_MAX;
    };
    const onDec = () => { if (lead > GOAL_LEAD_MIN) { lead -= 1; render(); } };
    const onInc = () => { if (lead < GOAL_LEAD_MAX) { lead += 1; render(); } };
    const cleanup = (result) => {
      goalSelectModal.classList.add('hidden');
      goalSelectDec.removeEventListener('click', onDec);
      goalSelectInc.removeEventListener('click', onInc);
      goalSelectConfirm.removeEventListener('click', onConfirm);
      goalSelectCancel.removeEventListener('click', onCancel);
      resolve(result);
    };
    const onConfirm = () => cleanup(lead * 1000);
    const onCancel = () => cleanup(null);
    goalSelectDec.addEventListener('click', onDec);
    goalSelectInc.addEventListener('click', onInc);
    goalSelectConfirm.addEventListener('click', onConfirm);
    goalSelectCancel.addEventListener('click', onCancel);
    render();
    goalSelectModal.classList.remove('hidden');
  });
}

// 退出報酬を得るのに必要な最低経過ターン数。開始直後に退出して下限50Mを
// 得る無限金策を防ぐ（これ未満で退出した場合は報酬なし）。
const MIN_REWARD_TURNS = 10;

/** CPU戦の決着（どちらかが目標達成 or 破産脱落）。勝敗を出し、対戦報酬Mを
 *  付与して対戦メニューに戻る。CPUが先にゴールしてもフリーズせずここで終わる。 */
async function handleCasualBattleEnd({ won }) {
  const humanPlayer = game?.players?.find((p) => !p.isCPU);
  const endingAssets = humanPlayer && game ? game._totalAssetsOf(humanPlayer) : 0;
  const mReward = grantExitReward(endingAssets);
  game = undefined;
  stopMusic();
  appEl.classList.add('hidden');
  preGame.classList.remove('hidden');
  showScreen(battleMenuScreen);
  showToast(`${won ? '勝利！🎉' : '敗北…'}　対戦報酬として${mReward.earnedM}M獲得しました`, 3200);
}

battleCpuButton.addEventListener('click', async () => {
  const chosenDeck = await promptDeckSelection({ onCancel: () => showScreen(battleMenuScreen) });
  if (!chosenDeck) return; // 「戻る」で対戦メニューへ
  const goalCurrency = await promptGoalSelection();
  if (goalCurrency == null) { showScreen(battleMenuScreen); return; } // 目標選択で「戻る」
  await confirmLandscapeReady();
  preGame.classList.add('hidden');
  appEl.classList.remove('hidden');
  const iconImage = (await resolveCharacterIcon(currentCharacter))?.canvas ?? null;
  startBattle(
    { ...currentCharacter, iconImage, deckList: chosenDeck.deckList },
    {
      // 目標総資産を設けて「勝敗のつく1本の対戦」にする（storyMode相当の
      // 決着処理を使うが、ストーリーの筋書きは絡まない＝退出報酬の対象）。
      storyMode: true,
      goalCurrency,
      onStoryBattleEnd: handleCasualBattleEnd,
    },
  );
});

// ---- 対人戦(PvP): 部屋コードでの招待・参加ロビー ----
// 部屋を作った側（ホスト）だけが本物のGameインスタンスを持つホスト権威
// モデル（pvp.js参照）。ここではロビー（部屋作成/参加/相手待ち）まで。

let pvpUnsubscribe = null;
let pvpMatch = null;
let pvpSession = null; // { roomCode, uid, isHost }

function stopPvpRoomListener() {
  if (pvpUnsubscribe) {
    pvpUnsubscribe();
    pvpUnsubscribe = null;
  }
}

function showPvpMenuScreen() {
  pvpJoinCode.value = '';
  pvpMenuError.classList.add('hidden');
  pvpCreateButton.disabled = !firebaseReady;
  pvpJoinButton.disabled = !firebaseReady;
  if (!firebaseReady) {
    pvpMenuError.textContent = '対人戦は準備中です（サーバー未設定）';
    pvpMenuError.classList.remove('hidden');
  }
  showScreen(pvpMenuScreen);
}

battlePvpButton.addEventListener('click', showPvpMenuScreen);
pvpMenuBack.addEventListener('click', () => showScreen(battleMenuScreen));

let pvpLastRoom = null;
let pvpGuestBattleStarted = false; // enterPvpRoomScreenのたびリセット。status:'battling'を二重に処理して盤面を2回作らないようにするガード。

function enterPvpRoomScreen(session) {
  pvpSession = session;
  pvpRoomCode.textContent = `部屋コード: ${session.roomCode}`;
  pvpRoomStatus.textContent = session.isHost ? '対戦相手を待っています…' : 'ホストの開始を待っています…';
  pvpRoomSettings.textContent = session.goalCurrency ? `目標G: ${Number(session.goalCurrency).toLocaleString('ja-JP')}G` : '';
  pvpRoomStart.classList.add('hidden');
  pvpGuestBattleStarted = false;
  showScreen(pvpRoomScreen);

  // ゲスト側は入室した瞬間から「ホストからの質問」を受け取れるようにして
  // おく（デッキは入室と同時に選び終えている - pvpJoinButton参照。対戦
  // 開始そのものはroom.statusが'battling'になったことを下のリスナーで
  // 検知して始める）。
  if (!session.isHost) {
    pvpMatch = {
      isHost: false,
      roomCode: session.roomCode,
      uid: session.uid,
      localPlayerId: 1,
      myHand: [],
      listener: new GuestHostListener(session.roomCode, session.uid, pvpGuestHandlers),
      actionSender: new GuestActionSender(session.roomCode, session.uid),
    };
  }

  stopPvpRoomListener();
  pvpUnsubscribe = listenToRoom(session.roomCode, (room) => {
    pvpLastRoom = room;
    if (!room) {
      pvpRoomStatus.textContent = '部屋が削除されました';
      pvpRoomStart.classList.add('hidden');
      return;
    }
    if (!session.isHost && pvpMatch) {
      const me = normalizePvpParticipants(room).find((participant) => participant.uid === session.uid);
      if (me) pvpMatch.localPlayerId = me.playerId;
    }
    if (room.status === 'finished') {
      pvpRoomStatus.textContent = '対戦は終了しました';
      pvpRoomStart.classList.add('hidden');
      return;
    }
    if (room.status === 'battling') {
      if (!session.isHost && !pvpGuestBattleStarted) {
        pvpGuestBattleStarted = true;
        startPvpGuestBattle();
      }
      return;
    }
    pvpRoomSettings.textContent = `ステージ: ${MAPS.find((map) => map.id === room.mapId)?.name || room.mapId} / 目標G: ${Number(room.goalCurrency || 5000).toLocaleString('ja-JP')}G`;
    if (room.allianceMode) {
      const names = normalizePvpParticipants(room).map((p) => p.name).filter(Boolean);
      if (room.randomAlliance) {
        pvpRoomTeams.textContent = `🔀 ランダム同盟（開始時に決定）　参加者: ${names.join('・') || '待機中'}`;
      } else {
        pvpRoomTeams.textContent = `🔴 紅組: ${names.filter((_, i) => i % 2 === 0).join('・') || '待機中'}　⚪ 白組: ${names.filter((_, i) => i % 2 === 1).join('・') || '待機中'}`;
      }
    } else {
      pvpRoomTeams.textContent = '同盟なし（個人戦）';
    }
    const participantCount = normalizePvpParticipants(room).length + (session.isHost ? (room.cpuNames?.length || 0) : 0);
    if (participantCount > 1) {
      const opponentName = session.isHost ? room.guestName : room.hostName;
      const requiredCount = Math.max(2, Math.min(4, Number(room.playerCount) || 2));
      pvpRoomStatus.textContent = session.isHost
        ? `参加者 ${participantCount}/${requiredCount}人（${opponentName}）`
        : `ホスト: ${opponentName} / 参加者 ${participantCount}/${requiredCount}人`;
      const rosterReady = normalizePvpParticipants(room).every((p) => p.ready === true && (p.uid === room.hostUid || Array.isArray(p.deckList)));
      pvpRoomStart.classList.toggle('hidden', !session.isHost || participantCount < requiredCount || !rosterReady);
    } else {
      pvpRoomStatus.textContent = session.isHost ? '対戦相手を待っています…' : 'ホストの開始を待っています…';
      pvpRoomStart.classList.add('hidden');
    }
  });
}

// ---- マップ選択（ホストが部屋を作る前に選ぶ） ----
// ストーリーモードの各マップ（board.jsのMAPS）をそのまま対人戦でも使える
// ようにする。ホストが部屋を作る前にマップを1つ選び、縮小プレビュー付き
// の確認ポップアップで確定する。参加者側はマップを選ばない（部屋に入った
// 時点でホストが選んだマップに合わせる）。

function showPvpMapSelectScreen() {
  pvpMapList.replaceChildren();
  for (const map of MAPS) {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'pvp-map-card';
    card.appendChild(createMapThumbnailCanvas(map.id));
    const label = document.createElement('p');
    label.textContent = map.name;
    card.appendChild(label);
    card.addEventListener('click', () => showPvpMapConfirm(map));
    pvpMapList.appendChild(card);
  }
  showScreen(pvpMapSelectScreen);
}

function showPvpMapConfirm(map) {
  pvpMapConfirmThumb.replaceChildren(createMapThumbnailCanvas(map.id, 16));
  pvpMapConfirmText.textContent = `「${map.name}」で遊びますか？`;
  pvpMapConfirmModal.classList.remove('hidden');

  function cleanup() {
    pvpMapConfirmModal.classList.add('hidden');
    pvpMapConfirmYes.removeEventListener('click', onYes);
    pvpMapConfirmNo.removeEventListener('click', onNo);
  }
  async function onYes() {
    cleanup();
    pvpMenuError.classList.add('hidden');
    try {
      const goalCurrency = Number(pvpGoalCurrency.value);
      const allianceMode = pvpAllianceMode.checked;
      const randomAlliance = allianceMode && pvpRandomAlliance.checked;
      const playerCount = allianceMode ? 4 : Number(pvpPlayerCount.value);
      const cpuNames = pvpCpuSelects.map((select) => select.value).filter(Boolean).slice(0, playerCount - 1);
      const session = await createPvpRoom({ name: currentCharacter.name, color: currentCharacter.color, mapId: map.id, goalCurrency, playerCount, allianceMode, randomAlliance, cpuNames });
      enterPvpRoomScreen(session);
    } catch {
      pvpMenuError.textContent = '部屋を作成できませんでした';
      pvpMenuError.classList.remove('hidden');
      showScreen(pvpMenuScreen);
    }
  }
  function onNo() {
    cleanup();
  }
  pvpMapConfirmYes.addEventListener('click', onYes);
  pvpMapConfirmNo.addEventListener('click', onNo);
}

pvpMapSelectBack.addEventListener('click', () => showScreen(pvpMenuScreen));
pvpCreateButton.addEventListener('click', showPvpMapSelectScreen);

pvpJoinButton.addEventListener('click', async () => {
  const code = pvpJoinCode.value.trim();
  if (!code) return;
  pvpMenuError.classList.add('hidden');
  pvpJoinButton.disabled = true;
  try {
    // 招待コード制の合言葉どおり: コードを入れたら先にデッキを選んでから
    // 入室する（入室後は部屋の相手待ち画面に直行、デッキ選択で止まらない）。
    const chosenDeck = await promptDeckSelection();
    const session = await joinPvpRoom(code, { name: currentCharacter.name, color: currentCharacter.color, deckList: chosenDeck.deckList });
    enterPvpRoomScreen(session);
  } catch (error) {
    pvpMenuError.textContent = error.message || '入室できませんでした';
    pvpMenuError.classList.remove('hidden');
    showScreen(pvpMenuScreen);
  } finally {
    pvpJoinButton.disabled = false;
  }
});

pvpRoomLeave.addEventListener('click', async () => {
  stopPvpRoomListener();
  if (pvpMatch && !pvpMatch.isHost) {
    pvpMatch.listener.destroy();
    pvpMatch.actionSender?.destroy();
    pvpMatch = null;
  }
  if (pvpSession) {
    await leavePvpRoom(pvpSession.roomCode, { isHost: pvpSession.isHost });
    pvpSession = null;
  }
  showScreen(battleMenuScreen);
});

// ---- 対人戦(PvP)本編: ホスト権威モデルのリレー配線 ----
// pvpMatchは対戦ロビーに入った瞬間（ゲスト側）または対戦開始した瞬間
// （ホスト側）にセットされる実行時状態。
//   ホスト: { isHost:true, roomCode, uid, localPlayerId:0, relay, participantActionListener, uidByPlayerId }
//   ゲスト: { isHost:false, roomCode, uid, localPlayerId:1, myHand, listener, actionSender }

/**
 * ホスト側専用: Gameの各onXxxをローカルUIかFirestoreリレーかに振り分ける
 * ラッパー。PvP中でなければ（pvpMatchがnull、またはゲスト側main.jsの場合
 * は別経路なのでそもそもこの関数を通らない）常にローカルprompt関数を
 * そのまま呼ぶ - 既存の対戦・ストーリーの動作は完全に無変更。
 * broadcast:trueは両者が見る演出（バトルシーン等）用 - ホストはローカル
 * 描画を待ちつつ、ゲストへは投げっぱなし（返事を待たない）で同じ演出を
 * 再生させる。
 */
/**
 * game.jsのonXxxコールバックは型によって引数の数が違う（大半はpayload+
 * player.idの2つだが、onLandCommand/onShopPurchaseだけはpayloadとplayer.id
 * の間に追加の引数を挟む）。forPlayerIdは常に「最後の引数」として届くので
 * 可変長で受け取り、末尾を分離してから残りをそのままlocalPromptに渡す -
 * 追加引数があってもforPlayerId判定を誤らない。中継用payloadは残り引数が
 * 1個ならその値そのまま、2個以上なら`{a0: ..., a1: ...}`という「配列を
 * 使わないオブジェクト」にまとめる（pvpGuestHandlers側でその型ごとに
 * 展開する）。ここを`{args: [a, b]}`のように配列のまま1段オブジェクトで
 * くるんだだけでは不十分 - Firestoreが拒否する「ネストした配列」は
 * 配列の要素が配列であること自体を指すので、オブジェクトの外側の階層は
 * 関係ない（`args`プロパティの値が`[optionsArray, currency]`という、
 * 要素にoptionsArrayという配列を持つ配列である時点でアウト）。なので
 * 引数ごとに別々のプロパティへ展開し、配列を配列の要素として一切
 * 持たせない。
 *
 * broadcast型（onBattleSceneEnter等）はそもそもplayer.idを引数に持たない
 * （両者へ同じ内容を流すだけなので「誰の手番か」という概念自体がない）ため、
 * 末尾を切り落とす処理を一切せず引数をそのまま使う。ここを他の型と同列に
 * 扱うと、broadcast型の唯一の引数（payloadそのもの）が誤ってforPlayerId
 * 扱いされて消え、ゲスト側でundefinedを渡してしまうバグになる。
 */
function relayable(type, localPrompt, { broadcast = false } = {}) {
  return (...args) => {
    if (broadcast) {
      const payload = args.length === 1 ? args[0] : args;
      if (pvpMatch?.isHost) pvpMatch.relay.ask(type, payload);
      return localPrompt(...args);
    }
    const forPlayerId = args[args.length - 1];
    const localArgs = args.slice(0, -1);
    const payload =
      localArgs.length === 1 ? localArgs[0] : Object.fromEntries(localArgs.map((v, i) => [`a${i}`, v]));
    if (!pvpMatch || !pvpMatch.isHost) return localPrompt(...localArgs);
    if (forPlayerId == null || forPlayerId === pvpMatch.localPlayerId) return localPrompt(...localArgs);
    // The legacy room relay has one request/response lane. Never route a
    // question for player 2+ through player 1's lane; until a dedicated
    // prompt channel is available, resolve it locally instead of mixing turns.
    const remoteUid = pvpMatch.uidByPlayerId?.[forPlayerId];
    if (!remoteUid) return localPrompt(...localArgs);
    const legacyGuestOnly = Number(forPlayerId) === Number(pvpMatch.guestPlayerId);
    const relayPromise = legacyGuestOnly
      ? pvpMatch.relay.ask(type, payload)
      : pvpMatch.relay.askParticipant(remoteUid, type, payload);
    // 質問を投げた直後に相手が切断すると、応答は45秒後にreject
    // （HostGuestRelay参照）される。ここをcatchしないとgame.js側の
    // await this.onXxx(...)が未捕捉の例外で止まり、盤面がフリーズしたまま
    // 二度と動かなくなる（30秒無応答でCPU化するpresenceMonitorは「次の
    // ターンから」しか効かず、既に発行済みのこの質問は救済しない）。
    // タイムアウトした場合はnull（「未選択」相当、他のprompt*関数の既定の
    // キャンセル応答と同じ扱い）にフォールバックしつつ、以後の質問が
    // 同じ相手で毎回45秒止まらないよう即座にCPUへ切り替える。
    return relayPromise.catch((error) => {
      console.warn(`PvP relay timed out for type=${type}, forPlayerId=${forPlayerId}`, error);
      const player = game?.players?.find((p) => p.id === forPlayerId);
      if (player && !player.isCPU) {
        player.isCPU = true;
        game.onLog(`${player.name}の応答がタイムアウトしたためAI操作へ切り替えました`);
        game._notifyState();
      }
      return null;
    });
  };
}

/** ホスト側専用: Game._notifyStateのたびに呼ばれる。公開状態(手札を除く)をpublicStateへ、各プレイヤーの手札は本人のprivateドキュメントへ、別々にpublishする。 */
function handlePvpSync(snapshot) {
  if (!pvpMatch || !pvpMatch.isHost) return;
  const { hands, ...publicPart } = snapshot;
  publishPublicState(pvpMatch.roomCode, publicPart);
  for (const [playerIdStr, hand] of Object.entries(hands || {})) {
    const uid = pvpMatch.uidByPlayerId[playerIdStr];
    if (uid && uid !== pvpMatch.uid) publishPrivateHand(pvpMatch.roomCode, uid, hand);
  }
}

/** ホスト側専用: ゲスト発の自発的アクション（本人の手番のダイス/スペル使用）を受けてローカルのGameインスタンスに反映する。 */
function handlePvpGuestAction(action) {
  if (!game) return;
  // Ignore stale/replayed actions and actions sent outside the guest's turn.
  // This prevents delayed Firestore events from consuming a later turn.
  const playerId = Number(action?.playerId);
  const knownRemoteIds = Object.keys(pvpMatch?.uidByPlayerId || {})
    .map(Number)
    .filter((id) => Number.isInteger(id) && id > 0);
  if (!knownRemoteIds.includes(playerId) || game.currentPlayer?.id !== playerId) return;
  if (action.type === 'rollDice') {
    const steps = Number(action.steps);
    if (Number.isInteger(steps) && steps >= 1 && steps <= 6 && game.awaitingRoll && !game.isBusy) game.rollDice(steps);
  } else if (action.type === 'useSpell') {
    if (!game.awaitingRoll || game.isBusy) return;
    const card = game.currentPlayer.hand.find((c) => c.id === action.cardId);
    if (card) game.useSpell(card);
  }
}

/**
 * ゲスト側で使う「ホストからの質問」ハンドラ一覧。中身はローカル対戦と
 * 全く同じprompt*関数（同じ画面・同じ操作感をそのまま再利用できる -
 * ゲスト専用のUIは一切作っていない）。デッキは入室と同時に選び終えて
 * いる（pvpJoinButton参照）ので、対戦開始そのものの合図はroom.statusの
 * 'battling'遷移を見て検知する（enterPvpRoomScreenのリスナー参照）。
 */
const pvpGuestHandlers = {
  cardReveal: promptCardReveal,
  discardChoice: promptDiscardChoice,
  spellUse: promptSpellUse,
  spellCastEffect: promptSpellCastEffect,
  shrineEffect: promptShrineEffect,
  warpEffect: promptWarpEffect,
  spellComplete: finishSpellPresentation,
  // landCommand/shopPurchaseはgame.js側でpayloadとplayer.idの間に追加引数を
  // 挟む型なので、relayable()が[複数引数]の配列としてまとめて送ってくる -
  // ここで展開してローカルのprompt関数へ渡す（他の型は単一値のまま素通し）。
  landCommand: ({ a0: tile, a1: options }) => promptLandCommand(tile, options),
  pickMonsterCard: promptPickMonsterCard,
  confirmAction: promptConfirmAction,
  pickLevelUp: promptPickLevelUp,
  confirmMove: promptConfirmMove,
  pickSellLandForDebt: promptPickSellLandForDebt,
  bankruptcy: promptBankruptcy,
  pickBrowseTile: promptPickBrowseTile,
  landSubmenu: promptLandSubmenu,
  pickAbilityTarget: promptPickAbilityTarget,
  pickCardType: promptPickCardType,
  showTileInfo: promptShowTileInfo,
  chooseBranch: promptChooseBranch,
  pickMoveDirection: promptMoveDirection,
  pickElement: promptPickElement,
  shopPurchase: ({ a0: options }) => promptShopPurchase(options),
  battleSceneEnter: promptBattleSceneEnter,
  pickBattleItem: promptPickBattleItem,
  battleEquip: promptBattleEquip,
  battleItemDestroy: promptBattleItemDestroy,
  battleItemSteal: promptBattleItemSteal,
  battleTraitReveal: promptBattleTraitReveal,
  battleAttack: promptBattleAttack,
  battleRetreat: promptBattleRetreat,
  battleOutcome: promptBattleOutcome,
  damageEffect: promptDamageEffect,
  tollPayment: promptTollPayment,
  moveDestination: promptMoveDestination,
  landLoss: promptLandLoss,
  landChain: promptLandChain,
  landLevelUp: promptLandLevelUp,
  checkpoint: promptCheckpointSound,
  goalBonus: promptGoalBonusSound,
  goalAchieved: promptGoalAchieved,
};

const pvpPieces = new Map(); // playerId -> billboard sprite (ゲスト側のローカル駒キャッシュ)

/** ゲスト側専用: publicStateの土地(所有者/レベル/属性/配置モンスター)と各プレイヤーの駒位置をローカルのtiles/sceneへそのまま反映する。ホストのように1マスずつアニメーションはしない（毎回のsync時点の最終状態へスナップするだけ）。 */
function applyPvpBoardState(publicState) {
  if (!publicState || !tiles) return;
  for (const tileState of publicState.tiles) {
    const tile = tiles[tileState.id];
    if (!tile) continue;
    tile.owner = tileState.owner;
    tile.level = tileState.level;
    tile.element = tileState.element;
    tile.unit = tileState.unit
      ? { def: { name: tileState.unit.name, atk: tileState.unit.atk }, currentHp: tileState.unit.hp }
      : null;
    const ownerPlayer = tile.owner != null ? publicState.players.find((p) => p.id === tile.owner) : null;
    if (tile.mesh) {
      tile.mesh.material.color.set(CARD_COLOR[tile.element]);
    }
    scene.updateTileLevelBorder(tile);
  }

  for (const p of publicState.players) {
    const tile = tiles[p.tileId];
    if (!tile) continue;
    let piece = pvpPieces.get(p.id);
    if (!piece) {
      piece = scene.createPiece(p.color, tile.position);
      pvpPieces.set(p.id, piece);
    }
    piece.position.set(tile.position.x, PIECE_REST_Y, tile.position.z);
  }
}

/** ゲスト側専用: publicStateをGameのonStateChangeと同じ見た目になるようUIへ反映する。相手(ホスト)の本当の手札は届かない（別チャンネルで配られるのは自分の分だけ）ので、自分の番以外はcenterHandを伏せる。 */
function applyPvpPublicState(publicState) {
  if (!publicState || !pvpMatch) return;
  pvpMatch.latestPublicState = publicState;
  const isMyTurn = publicState.currentPlayerId === pvpMatch.localPlayerId;
  const showCenter = publicState.awaitingRoll && !publicState.isBusy;

  turnIndicator.textContent = publicState.turnText;
  diceButton.disabled = !(showCenter && isMyTurn);
  renderPlayerPanels(publicState.players, publicState.checkpointNumbers, pvpLastRoom?.goalCurrency);
  renderHand(pvpMatch.myHand, isMyTurn && showCenter && !publicState.spellUsedThisTurn);
  const me = publicState.players.find((p) => p.id === pvpMatch.localPlayerId);
  if (me) {
    pvpMatch.lastCurrency = me.currency;
    pvpMatch.lastAssets = me.totalAssets;
    pvpMatch.lastAllianceSize = me.allianceSize || 1;
    if (me.banned && !pvpMatch.isHost && !pvpMatch.banned) {
      pvpMatch.banned = true;
      window.alert('ホストにBANされました。盤面から退出します。');
      pvpMatch.stopPublicListener?.();
      pvpMatch.stopHandListener?.();
      pvpMatch.listener?.destroy();
      pvpMatch.actionSender?.destroy();
      pvpMatch = null;
      game = undefined;
      appEl.classList.add('hidden');
      preGame.classList.remove('hidden');
      showPvpMenuScreen();
      return;
    }
  }

  const enteringShowCenter = showCenter && !showCenterState;
  showCenterState = showCenter;
  centerShowsOpponent = !isMyTurn;
  if (enteringShowCenter) {
    resetDice();
    dicePromptDismissed = false;
  }
  if (showCenter && publicState.fixedDiceValue != null && diceState !== 'fixed') showFixedDice(publicState.fixedDiceValue);
  syncCenterVisibility();
  renderCenterHand(showCenter && !isMyTurn ? (publicState.turnHand || []) : []);

  applyPvpBoardState(publicState);

  const activeIndex = publicState.players.findIndex((player) => player.id === publicState.currentPlayerId);
  if (activeIndex >= 0) {
    const playersByTile = new Map();
    for (const player of publicState.players) {
      if (!playersByTile.has(player.tileId)) playersByTile.set(player.tileId, []);
      playersByTile.get(player.tileId).push(player);
    }
    for (let offset = 0; offset < publicState.players.length; offset++) {
      const player = publicState.players[(activeIndex + offset) % publicState.players.length];
      const overlapsAnotherPlayer = (playersByTile.get(player.tileId)?.length || 0) > 1;
      scene?.setPieceRenderOrder?.(
        pvpPieces.get(player.id),
        100 + publicState.players.length - offset,
        offset === 0 || !overlapsAnotherPlayer ? 1 : 0.45,
      );
    }
    for (const tile of tiles) {
      const coveredByPlayer = (playersByTile.get(tile.id)?.length || 0) > 0;
      scene?.setBoardObjectOpacity?.(tile.unitMesh, coveredByPlayer ? 0.4 : 1);
      scene?.setBoardObjectOpacity?.(tile.markerSprite, coveredByPlayer ? 0.4 : 1);
    }
  }

}

/** ゲスト側専用: room.statusが'battling'になった合図で呼ばれる（enterPvpRoomScreen参照）。ホストと同じcreateBoard(mapId)で作った盤面をローカルに構築し、以後はpublicState/自分の手札の購読だけで描画し続ける（Gameインスタンスは持たない）。 */
async function startPvpGuestBattle() {
  await confirmLandscapeReady();
  preGame.classList.add('hidden');
  appEl.classList.remove('hidden');

  currentMapId = pvpLastRoom?.mapId ?? null;
  applyMapBackground(currentMapId);
  scene = new GameScene(canvas);
  tiles = createBoard(pvpLastRoom?.mapId);
  scene.buildBoard(tiles);
  requestAnimationFrame(animate);
  playMapTheme(currentMapId);

  pvpMatch.stopPublicListener = listenToRoom(pvpMatch.roomCode, (room) => {
    if (!room || room.status === 'finished') {
      // ホストが退出した（部屋を消した/finishedにした） - こちらも対戦を終える。
      // ホストの退出はgameMenuExit経由の報酬確認を通らないため、ここで
      // 代わりに直近のpublicStateから自分の取り分を換算して付与する
      // （でなければゲストは無報酬のまま追い出されてしまう）。
      const endingAssetsShare = (pvpMatch?.lastAssets ?? pvpMatch?.lastCurrency ?? 0) / (pvpMatch?.lastAllianceSize || 1);
      const { earnedM } = grantExitReward(endingAssetsShare);
      pvpMatch?.stopPublicListener?.();
      pvpMatch?.stopHandListener?.();
      pvpMatch?.listener?.destroy();
      pvpMatch?.actionSender?.destroy();
      pvpMatch = null;
      stopMusic();
      appEl.classList.add('hidden');
      preGame.classList.remove('hidden');
      window.alert(`ホストが対戦を終了しました。獲得報酬：${earnedM}M`);
      showHubScreen();
      return;
    }
    if (room.publicState) applyPvpPublicState(room.publicState);
  });
  pvpMatch.stopHandListener = listenToPrivateHand(pvpMatch.roomCode, pvpMatch.uid, (hand) => {
    pvpMatch.myHand = hand || [];
    if (pvpMatch.latestPublicState) applyPvpPublicState(pvpMatch.latestPublicState);
  });
}

pvpRoomStart.addEventListener('click', async () => {
  if (!pvpSession?.isHost || (!pvpLastRoom?.guestUid && !(pvpLastRoom?.cpuNames?.length))) return;
  pvpRoomStart.disabled = true;
  const hostDeck = await promptDeckSelection();
  await confirmLandscapeReady();

  // ゲストのデッキは入室と同時にguestDeckListとしてもう届いている
  // （joinPvpRoom参照）ので、ここで改めて尋ねる必要はない。
  const relay = new HostGuestRelay(pvpSession.roomCode);
  const guestDeckList = pvpLastRoom.guestDeckList;

  const iconImage = (await resolveCharacterIcon(currentCharacter))?.canvas ?? null;

  const roster = normalizePvpParticipants(pvpLastRoom);
  pvpMatch = {
    isHost: true,
    roomCode: pvpSession.roomCode,
    uid: pvpSession.uid,
    localPlayerId: 0,
    guestPlayerId: 1,
    relay,
    uidByPlayerId: Object.fromEntries(roster.map((participant) => [participant.playerId, participant.uid])),
  };
  pvpMatch.participantActionListener = new HostParticipantActionListener(
    pvpSession.roomCode,
    (pvpLastRoom.participants || []).map((participant) => participant.uid).filter((uid) => uid !== pvpSession.uid),
    handlePvpGuestAction,
  );
  pvpMatch.presenceMonitor = new HostParticipantPresenceMonitor(
    pvpSession.roomCode,
    (pvpLastRoom.participants || []).map((participant) => participant.uid).filter((uid) => uid !== pvpSession.uid),
    (uid) => {
      const playerId = Object.entries(pvpMatch.uidByPlayerId).find(([, participantUid]) => participantUid === uid)?.[0];
      const player = game?.players?.find((entry) => entry.id === Number(playerId));
      if (player && !player.isCPU) { player.isCPU = true; game.onLog(`${player.name}の通信が切断されたためAIへ切り替え`); game._notifyState(); }
    },
  );

  // status:'battling'への更新がゲスト側のroomリスナーに届き、それを合図に
  // ゲストもstartPvpGuestBattle()で盤面構築を始める（enterPvpRoomScreen参照）。
  await beginPvpMatch(pvpSession.roomCode);

  stopPvpRoomListener();
  preGame.classList.add('hidden');
  appEl.classList.remove('hidden');
  const playerConfigs = [
    { name: currentCharacter.name, isCPU: false, color: currentCharacter.color, deckList: hostDeck.deckList, iconImage },
  ];
  for (const participant of roster.filter((entry) => entry.uid !== pvpSession.uid)) {
    if (Array.isArray(participant.deckList) && participant.deckList.length === 40) {
      playerConfigs.push({ name: participant.name, isCPU: false, color: participant.color, deckList: participant.deckList });
    }
  }
  const cpuNames = Array.isArray(pvpLastRoom.cpuNames) ? pvpLastRoom.cpuNames : [];
  // cpuNames自体に同じCPUが重複指定されていた場合の二重追加だけを防ぐ
  // ためのSet。人間参加者の表示名（自由入力・重複しうる）と混同すると、
  // 偶然の名前衝突でCPU枠が丸ごとスキップされ、playerConfigsが
  // playerCount未満のまま静かに進行してしまう（同盟モードなら下のalliance
  // 割り当てが素通りし、UIは「同盟」と表示されたままFFA化する）。
  const usedCpuNames = new Set();
  for (const cpuName of cpuNames) {
    if (usedCpuNames.has(cpuName) || playerConfigs.length >= (pvpLastRoom.playerCount || 2)) continue;
    const npc = STORY_STAGES.flatMap((stage) => [stage.ally, ...(stage.opponents || [])]).find((entry) => entry?.name === cpuName);
    if (!npc) continue;
    usedCpuNames.add(cpuName);
    playerConfigs.push({
      name: cpuName,
      isCPU: true,
      color: npc.color,
      deckList: npc.deckKey ? buildCharacterDeckList(npc.deckKey) : buildThemedDeckList(npc.theme),
      elements: npc.theme?.elements,
      iconImage: await loadNpcTokenImage(cpuName),
    });
  }
  if (pvpLastRoom.allianceMode) {
    if (playerConfigs.length === 4) {
      const teams = pvpLastRoom.randomAlliance ? [0, 1, 0, 1].sort(() => Math.random() - 0.5) : [0, 1, 0, 1];
      playerConfigs.forEach((config, index) => { config.allianceId = teams[index]; });
    } else {
      // 本来は部屋作成時にplayerCount=4へ固定され、開始ボタンも定員未満
      // では出せないので通常は起きないはずだが、万一ズレた場合に「同盟
      // モード表示のままFFA化する」のを黙って見過ごさないよう記録する。
      console.warn(`PvP同盟モードだが参加者が${playerConfigs.length}人（4人ではない）のため同盟を割り当てられません`);
    }
  }
  startBattle(currentCharacter, {
    mapId: pvpLastRoom.mapId,
    goalCurrency: pvpLastRoom.goalCurrency || 5000,
    playerConfigs,
  });
  pvpRoomStart.disabled = false;
});

// ---- Leaving a battle: cash out ending total assets into persistent M (7%/10%/13%, alliance 15%; minimum 50) ----
//
// 同盟(2vs2)ではtotalAssetsがチーム合算値のため、そのまま使うとチーム全員が
// 満額を個別に受け取れてしまう（実質的な二重取り）。呼び出し側は必ず
// 自分の取り分（totalAssets ÷ allianceSize）に割ってから渡すこと。

/**
 * 総資産(自分の取り分換算後)からPvP/ストーリー共通のM報酬額を計算する
 * （副作用なし・表示プレビューと実際の付与の両方がこれを経由することで
 * 数値がズレないようにする）。
 *
 * 注意: このM計算はクライアント側の値をそのまま信用しており、サーバー側
 * （Cloud Functions等）での検証は現状存在しない - `saveCharacter`は
 * `character`をそのままFirestoreへ書き込み、セキュリティルールもuid一致
 * しか見ていないため、理論上は改造クライアントで任意の値を書き込むことが
 * できてしまう。特にPvPではホストがpublishする相手の資産表示を信用する
 * 構造なので、ここに常識的な上限（部屋の目標Gの3倍、最低でも5000G相当）を
 * 掛けて被害を抑える簡易対策のみ行っている。根本対策にはサーバー側の検証
 * （Cloud Functions等）が別途必要。
 */
function computeExitRewardM(endingAssetsShare, rewardRateOverride = null) {
  const playerCount = Number(game?.players?.length || pvpLastRoom?.playerCount || 2);
  const allianceMode = game
    ? Boolean(game.players.some((player) => player.allianceId != null))
    : pvpLastRoom?.allianceMode === true;
  const rewardRate = rewardRateOverride ?? (allianceMode ? 0.15 : 0.07 + Math.max(0, playerCount - 2) * 0.03);
  const assetCap = Math.max((game?.goalCurrency || pvpLastRoom?.goalCurrency || 5000) * 3, 5000);
  const cappedAssets = Math.min(Math.max(endingAssetsShare, 0), assetCap);
  const earnedM = Math.max(Math.round(cappedAssets * rewardRate), M_CONVERSION_MIN);
  return { earnedM, rewardRate };
}

/** 実際にcurrentCharacter.mへ加算・保存する。呼び出しごとに一度だけ加算されるよう、必ずここを経由すること。 */
function grantExitReward(endingAssetsShare, rewardRateOverride = null) {
  const result = computeExitRewardM(endingAssetsShare, rewardRateOverride);
  currentCharacter.m += result.earnedM;
  saveCharacter(currentUserId, currentCharacter);
  return result;
}

/**
 * ストーリー本編・再戦共通報酬。終了時総資産の本人取り分に対し、
 * 「7% + 相手プレイヤー数×3%」を勝敗にかかわらず付与する。
 */
function grantStoryBattleReward() {
  const humanPlayer = game?.players?.find((player) => !player.isCPU);
  if (!humanPlayer) return grantExitReward(0, 0.07);
  const allies = humanPlayer.allianceId != null
    ? game.players.filter((player) => player.allianceId === humanPlayer.allianceId)
    : [humanPlayer];
  const opponentCount = game.players.filter((player) =>
    player.id !== humanPlayer.id
      && (humanPlayer.allianceId == null || player.allianceId !== humanPlayer.allianceId)).length;
  const endingAssetsShare = game._totalAssetsOf(humanPlayer) / Math.max(allies.length, 1);
  return grantExitReward(endingAssetsShare, 0.07 + opponentCount * 0.03);
}

/** 画面のどこでも使える簡易トースト（#app配下ではなくdocument.bodyに直接足すので、盤面を閉じた後のメニュー画面上でも問題なく出せる）。durationミリ秒後に自動で消える。 */
function showToast(text, duration = 2000) {
  const el = document.createElement('div');
  el.className = 'toast-message';
  el.textContent = text;
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 300);
  }, duration);
}

gameMenuExit.addEventListener('click', async () => {
  gameMenuModal.classList.add('hidden');
  const isPvpGuest = pvpMatch && !pvpMatch.isHost;
  if (!game && !isPvpGuest) return;

  // ストーリーモードは通常の対戦(CPU戦/対人戦)と違い、M報酬の対象外
  // （ユーザー指定 - ストーリーの報酬はステージクリア時のカード報酬のみで、
  // 総資産に応じた通貨変換は「対戦をやめた」実績に対するものなので
  // ストーリーの筋書きにはそぐわない）。
  const wasStoryBattle = activeStoryStageIndex != null;

  let confirmed;
  let endingAssetsShare = 0;
  // 開始直後の退出で報酬を得る無限金策の防止: 一定ターン未満は報酬なし
  // （ゲストは手元にturnCountが無いので従来どおり対象）。
  let rewardEligible = false;
  if (wasStoryBattle) {
    confirmed = await confirmYesNo('対戦をやめますか？\n進行状況を保存し、次回このステージを選ぶと続きから再開できます。');
  } else {
    // ゲスト側はGameを持たないので、直近のpublicStateから自分のGを読む
    // （publicStateがまだ届いていない対戦開始直後は0扱い）。同盟時は
    // allianceSizeで割って「自分の取り分」だけを対象にする（同盟報酬の
    // 二重取り防止 - grantExitReward参照）。
    const hostPlayer = !isPvpGuest && game ? game.players[0] : null;
    const hostAllianceSize =
      hostPlayer?.allianceId != null ? game.players.filter((p) => p.allianceId === hostPlayer.allianceId).length : 1;
    endingAssetsShare = isPvpGuest
      ? (pvpMatch.lastAssets ?? pvpMatch.lastCurrency ?? 0) / (pvpMatch.lastAllianceSize || 1)
      : game._totalAssetsOf(hostPlayer) / hostAllianceSize;
    const isPvp = Boolean(pvpMatch);
    rewardEligible = isPvpGuest || (game?.turnCount ?? 0) >= MIN_REWARD_TURNS;
    const { earnedM: previewM, rewardRate } = computeExitRewardM(endingAssetsShare);
    let rewardMessage;
    if (!rewardEligible) {
      rewardMessage = `対戦開始から${MIN_REWARD_TURNS}ターン未満のため、報酬はありません。`;
    } else if (isPvp) {
      rewardMessage = `対戦終了報酬：総資産(自分の取り分)${Math.round(endingAssetsShare)}Gの${Math.round(rewardRate * 100)}%（${previewM}M、下限50M）を獲得します。`;
    } else {
      rewardMessage = `総資産${Math.round(endingAssetsShare)}Gの${Math.round(rewardRate * 100)}%（${previewM}M、下限50M）を獲得します。`;
    }
    confirmed = await confirmYesNo(`対戦をやめますか？\n${rewardMessage}`);
  }
  if (!confirmed) return;

  if (wasStoryBattle) saveStoryResume();
  const rewardResult = wasStoryBattle || !rewardEligible ? null : grantExitReward(endingAssetsShare);

  // 退出時、もし戦闘シーン演出の途中（onBattleSceneEnter等のPromiseが
  // 未解決のまま）だった場合、そのGameインスタンスの続きが後から勝手に
  // 進んで次のセッションのUIを巻き込むのを防ぐ（cancel()参照）。加えて
  // battle-scene-modal自体もここで確実に閉じておく - 開いたままだと
  // 次に#appを表示した瞬間、古い対戦内容がそのまま一瞬見えてしまう。
  game?.cancel?.();
  cancelActiveBattleItemPicker?.();
  cancelActiveBattleItemPicker = null;
  battleSceneModal.classList.add('hidden');
  battleItemPickerBox.classList.add('hidden');
  battleMessageText.classList.add('hidden');

  if (pvpMatch?.isHost) {
    pvpMatch.relay.destroy();
    pvpMatch.participantActionListener?.destroy();
    pvpMatch.presenceMonitor?.destroy();
    finishPvpRoom(pvpMatch.roomCode);
  } else if (isPvpGuest) {
    pvpMatch.stopPublicListener?.();
    pvpMatch.stopHandListener?.();
    pvpMatch.listener.destroy();
    pvpMatch.actionSender?.destroy();
  }
  pvpMatch = null;
  game = undefined;
  stopMusic();
  appEl.classList.add('hidden');
  preGame.classList.remove('hidden');
  activeStoryStageIndex = null;
  if (wasStoryBattle) {
    showStoryScreen();
  } else {
    showHubScreen();
  }
  if (rewardResult) showToast(`報酬として${rewardResult.earnedM}M獲得しました`, 2000);
});

/**
 * ブラウザを閉じる・再読込・iOSの履歴移動では対戦を継続保存せず、その場で
 * 強制終了する。特にbfcache復帰では古いGameの非同期処理と戦闘BGMが再開
 * し得るため、UI・購読・音声をまとめて破棄する。
 */
function forceTerminateBoardSession() {
  // ストーリーのみ端末へ保存してから破棄する。オンライン対戦は共有状態を
  // ローカル単独で復元すると混線するため、従来どおり終了扱いにする。
  if (activeStoryStageIndex != null) saveStoryResume();
  game?.cancel?.();
  cancelActiveBattleItemPicker?.();
  cancelActiveBattleItemPicker = null;
  cancelAllActivePrompts();
  battleSceneModal?.classList.add('hidden');
  battleItemPickerBox?.classList.add('hidden');
  battleMessageText?.classList.add('hidden');
  if (pvpMatch?.isHost) {
    pvpMatch.relay?.destroy?.();
    pvpMatch.participantActionListener?.destroy?.();
    pvpMatch.presenceMonitor?.destroy?.();
    Promise.resolve(finishPvpRoom(pvpMatch.roomCode)).catch(() => {});
  } else if (pvpMatch) {
    pvpMatch.stopPublicListener?.();
    pvpMatch.stopHandListener?.();
    pvpMatch.listener?.destroy?.();
    pvpMatch.actionSender?.destroy?.();
  }
  pvpMatch = null;
  game = undefined;
  scene = undefined;
  tiles = undefined;
  currentMapId = null;
  activeStoryStageIndex = null;
  activeStorySessionMeta = null;
  stopMusic();
  appEl?.classList.add('hidden');
  preGame?.classList.remove('hidden');
}

window.addEventListener('pagehide', forceTerminateBoardSession);
window.addEventListener('beforeunload', forceTerminateBoardSession);
window.addEventListener('pageshow', (event) => {
  // iOS Safariがページをbfcacheから復元した場合も、盤面を再開させない。
  if (!event.persisted) return;
  forceTerminateBoardSession();
  showScreen(loginScreen);
});

// 初期表示時点で、前ページのAudio状態が残っていても必ず無音から始める。
stopMusic();
