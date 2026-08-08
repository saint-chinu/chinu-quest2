// Splits the single player-icon sheet (3 cols x 2 rows, public/images/player/icons6.png)
// into 6 individually usable icons at load time - no server-side image
// processing needed. Each entry's `canvas` can be handed straight to
// THREE.CanvasTexture (board piece) and `dataUrl` to an <img src> (charmake
// picker / player panel avatar).
const ICON_SHEET_URL = '/images/player/icons6.png';
const ICON_COLS = 3;
const ICON_ROWS = 2;

let cached = null;

export function loadPlayerIcons() {
  if (cached) return cached;
  cached = new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const cellW = img.naturalWidth / ICON_COLS;
      const cellH = img.naturalHeight / ICON_ROWS;
      const icons = [];
      for (let row = 0; row < ICON_ROWS; row++) {
        for (let col = 0; col < ICON_COLS; col++) {
          const canvas = document.createElement('canvas');
          canvas.width = cellW;
          canvas.height = cellH;
          canvas.getContext('2d').drawImage(img, col * cellW, row * cellH, cellW, cellH, 0, 0, cellW, cellH);
          icons.push({ canvas, dataUrl: canvas.toDataURL('image/png') });
        }
      }
      resolve(icons);
    };
    img.onerror = () => reject(new Error(`Failed to load ${ICON_SHEET_URL}`));
    img.src = ICON_SHEET_URL;
  });
  return cached;
}
