import { assetUrl } from './assetUrl.js';
import { loadPlayerIcons } from './iconSheet.js';

export const CHARACTER_ICON_PRESETS = [
  { id: 'chinu', name: 'チヌ', url: assetUrl('/images/player/chinu.png') },
  { id: 'ankou', name: 'アンコウ', url: assetUrl('/images/player/ankou.png') },
  { id: 'ika', name: 'イカ', url: assetUrl('/images/player/ika.png') },
];

const presetCache = new Map();

function imageSourceToIcon(source, size = 512) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  const sourceWidth = source.naturalWidth || source.width;
  const sourceHeight = source.naturalHeight || source.height;
  // Keep the original proportions. Cropping/stretching portraits into a
  // square made tall characters look crushed on the board.
  const scale = Math.min(size / sourceWidth, size / sourceHeight) * 0.94;
  const drawWidth = sourceWidth * scale;
  const drawHeight = sourceHeight * scale;
  context.drawImage(source, (size - drawWidth) / 2, (size - drawHeight) / 2, drawWidth, drawHeight);

  // Some supplied character PNGs contain an opaque white canvas. Remove only
  // near-white pixels connected to the outer edge, preserving white details
  // enclosed inside the character artwork.
  const imageData = context.getImageData(0, 0, size, size);
  const { data } = imageData;
  const visited = new Uint8Array(size * size);
  const queue = [];
  const enqueue = (x, y) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    const index = y * size + x;
    if (visited[index]) return;
    visited[index] = 1;
    const offset = index * 4;
    if (data[offset + 3] === 0 || (data[offset] >= 245 && data[offset + 1] >= 245 && data[offset + 2] >= 245)) queue.push(index);
  };
  for (let i = 0; i < size; i += 1) {
    enqueue(i, 0); enqueue(i, size - 1); enqueue(0, i); enqueue(size - 1, i);
  }
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const index = queue[cursor];
    data[index * 4 + 3] = 0;
    const x = index % size;
    const y = Math.floor(index / size);
    enqueue(x - 1, y); enqueue(x + 1, y); enqueue(x, y - 1); enqueue(x, y + 1);
  }
  context.putImageData(imageData, 0, 0);
  return { canvas, dataUrl: canvas.toDataURL('image/webp', 0.88) };
}

function loadImageUrl(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(imageSourceToIcon(image));
    image.onerror = () => reject(new Error(`キャラクター画像を読み込めません: ${url}`));
    image.src = url;
  });
}

export function loadCharacterIconPresets() {
  return Promise.all(CHARACTER_ICON_PRESETS.map(async (preset) => {
    if (!presetCache.has(preset.id)) presetCache.set(preset.id, loadImageUrl(preset.url));
    return { ...preset, ...(await presetCache.get(preset.id)) };
  }));
}

export function fileToCharacterIcon(file) {
  return new Promise((resolve, reject) => {
    if (!file?.type.startsWith('image/')) {
      reject(new Error('画像ファイルを選択してください'));
      return;
    }
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(imageSourceToIcon(image));
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('画像を読み込めませんでした'));
    };
    image.src = objectUrl;
  });
}

export function iconFromDataUrl(dataUrl) {
  return loadImageUrl(dataUrl);
}

/** Firestoreのルーム文書へ載せる軽量版。元画像の縦横比と透過は維持する。 */
export function compactCharacterIconDataUrl(icon, size = 160) {
  if (!icon?.canvas) return '';
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  canvas.getContext('2d').drawImage(icon.canvas, 0, 0, size, size);
  return canvas.toDataURL('image/webp', 0.76);
}

/** 新形式（アップロード→プリセット）を優先し、旧iconIndexも互換表示する。 */
export async function resolveCharacterIcon(character) {
  if (character.iconImageDataUrl) return iconFromDataUrl(character.iconImageDataUrl);
  if (character.iconPreset) {
    const presets = await loadCharacterIconPresets();
    return presets.find((preset) => preset.id === character.iconPreset) || null;
  }
  if (character.iconIndex != null) {
    const legacyIcons = await loadPlayerIcons();
    return legacyIcons[character.iconIndex] || null;
  }
  return null;
}
