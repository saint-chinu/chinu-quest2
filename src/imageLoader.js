/** Bound image requests; conversions belong in .then so canvas errors reject too. */
export function loadImage(url, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const finish = (error) => {
      clearTimeout(timer);
      image.onload = null;
      image.onerror = null;
      if (error) { image.src = ''; reject(error); }
      else resolve(image);
    };
    const timer = setTimeout(() => finish(new Error('画像の読み込みがタイムアウトしました')), timeoutMs);
    image.onload = () => finish(null);
    image.onerror = () => finish(new Error('画像を読み込めませんでした'));
    image.src = url;
  });
}
