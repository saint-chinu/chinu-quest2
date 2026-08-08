// Local mock auth - stands in for Firebase Authentication until a real
// Firebase project is wired up. Users (id/password/character) live in
// localStorage only; nothing here is secure and nothing leaves the browser.
const STORAGE_KEY = 'chinuquest2_users';

function loadUsers() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
  } catch {
    return {};
  }
}

function saveUsers(users) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(users));
}

/** Registers a brand-new id, or logs into an existing one if the password matches. */
export function loginOrRegister(id, password) {
  if (!id || !password) return { ok: false, error: 'IDとパスワードを入力してください' };

  const users = loadUsers();
  const existing = users[id];
  if (existing) {
    if (existing.password !== password) return { ok: false, error: 'パスワードが違います' };
    return { ok: true, id, character: existing.character, isNew: false };
  }

  users[id] = { password, character: null };
  saveUsers(users);
  return { ok: true, id, character: null, isNew: true };
}

/** Saves the character created on first login (icon color, name, chosen starter deck). */
export function saveCharacter(id, character) {
  const users = loadUsers();
  if (!users[id]) return;
  users[id].character = character;
  saveUsers(users);
}
