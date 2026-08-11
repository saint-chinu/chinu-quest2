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
  const cropSize = Math.min(sourceWidth, sourceHeight);
  const sourceX = (sourceWidth - cropSize) / 2;
  const sourceY = (sourceHeight - cropSize) / 2;
  context.drawImage(source, sourceX, sourceY, cropSize, cropSize, 0, 0, size, size);
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
