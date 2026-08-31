/**
 * Maps players to the 4 HUD corner slots [TL, TR, BL, BR].
 * No alliances: turn order fills TL, TR, then wraps to BL (under TL) and
 * BR (under TR). With alliances: the team containing the first-turn player
 * takes the left column (leader TL, teammates stacked under at BL), the
 * next team takes the right column the same way - turn order within a
 * team doesn't matter for placement.
 *
 * 盤面四隅のプレイヤーパネル（#player-panel-0〜3）へ、誰をどの隅に出すかを決める。
 *
 * 枠は4つしかないので、同盟戦では「左列＝自陣営／右列＝敵陣営」に読めるよう
 * 陣営ごとに列を分ける（0=左上, 1=右上, 2=左下, 3=右下）。
 *
 * ⚠️ **3人以上の陣営がある盤面で、はみ出た人を捨てないこと。**
 * ⑯「魚群の王チヌ」は主人公1人 vs 下僕3人の同盟という編成で、
 * 素朴に[左0, 右0, 左1, 右1]と並べると3人目の敵（邪神ヒトデマソ）が
 * どの枠にも入らず、所持G・総資産・CP通過が一切表示されなくなる
 * （2026-09-01のユーザー報告）。陣営が3人以上でも、また陣営が3つ以上に
 * 分かれても、空いている枠へ詰めて**必ず全員を出す**。
 */
export function computePlayerSlots(players) {
  const list = Array.isArray(players) ? players.filter(Boolean) : [];
  const hasAlliances = list.some((p) => p.allianceId != null);
  if (!hasAlliances) return [list[0], list[1], list[2], list[3]];

  const teams = [];
  const teamIndexByKey = new Map();
  for (const p of list) {
    const key = p.allianceId ?? `solo-${p.id}`;
    if (!teamIndexByKey.has(key)) {
      teamIndexByKey.set(key, teams.length);
      teams.push([]);
    }
    teams[teamIndexByKey.get(key)].push(p);
  }

  const [left = [], right = []] = teams;
  const slots = [left[0], right[0], left[1], right[1]];

  // 陣営の列分けに収まらなかった人（3人目以降・3陣営目以降）を空き枠へ詰める。
  const placed = new Set(slots.filter(Boolean));
  for (const p of list) {
    if (placed.has(p)) continue;
    const emptyIndex = slots.findIndex((slot) => !slot);
    if (emptyIndex === -1) break; // 5人以上は枠が無い（現状の最大は4人）
    slots[emptyIndex] = p;
    placed.add(p);
  }
  return slots;
}
