// public/配下の静的ファイルをJS文字列で参照する際に使う共通ヘルパー。
// ViteはHTML/CSSのurl()内の絶対パス（先頭/）はbase（vite.config.jsの
// GitHub Pages用'/chinu-quest2/'）を自動で前置してくれるが、JS文字列
// リテラルは対象外 - 前置し忘れるとGitHub Pages環境でだけ404になる
// （ローカル開発はbaseが'/'なので気づきにくい）。
export function assetUrl(path) {
  // Nodeのヘッドレス検証ではViteのimport.meta.envが存在しない。
  // 本番・開発では従来どおりViteが渡すBASE_URLを使う。
  const baseUrl = import.meta.env?.BASE_URL || '/';
  return `${baseUrl}${path.replace(/^\//, '')}`;
}
