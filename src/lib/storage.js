// Lo que el sitio recuerda en el navegador de cada hincha (prode, once, trivia, aviso de instalar). Solo en ese
// navegador: no se comparte ni llega al repo. Puede no estar (modo privado, datos borrados): todo funciona sin esto.
const PREFIX = 'fortin:';

export function load(key, fallback = null) {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw == null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function save(key, value) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}
