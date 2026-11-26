// The only thing Calmly keeps on this device: first name and explanation language.
const KEY = 'calmly.profile.v1';

export function loadProfile() {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (parsed && typeof parsed === 'object') {
      return {
        name: typeof parsed.name === 'string' ? parsed.name.slice(0, 40) : '',
        lang: parsed.lang === 'ru' ? 'ru' : 'en',
      };
    }
  } catch {
    // storage blocked or corrupted: start fresh
  }
  return { name: '', lang: 'en' };
}

export function saveProfile(profile) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ name: profile.name, lang: profile.lang }));
  } catch {
    // private mode: nothing to do
  }
}

export function forgetProfile() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
