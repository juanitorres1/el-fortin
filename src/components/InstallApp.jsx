// «Llevá El Fortín en el celular»: botón para instalar la app (Android, Chrome y Edge avisan con beforeinstallprompt)
// o los pasos en iPhone (Safari no tiene botón: se agrega desde Compartir). No se muestra si ya está instalada.
// Todo se decide en un efecto: el HTML prerenderizado no sabe en qué navegador se abre.
import { useEffect, useState } from 'react';
import { load, save } from '../lib/storage.js';

const DISMISS_KEY = 'install-dismissed';

export function InstallApp() {
  const [mode, setMode] = useState(null); // null | 'prompt' | 'ios'
  const [prompt, setPrompt] = useState(null);
  useEffect(() => {
    const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
    if (standalone || load(DISMISS_KEY)) return undefined;
    const ua = navigator.userAgent;
    if (/iPhone|iPad|iPod/.test(ua) && /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua)) setMode('ios');
    const onPrompt = (e) => {
      e.preventDefault();
      setPrompt(e);
      setMode('prompt');
    };
    const onInstalled = () => setMode(null);
    addEventListener('beforeinstallprompt', onPrompt);
    addEventListener('appinstalled', onInstalled);
    return () => {
      removeEventListener('beforeinstallprompt', onPrompt);
      removeEventListener('appinstalled', onInstalled);
    };
  }, []);
  if (!mode) return null;
  const dismiss = () => {
    save(DISMISS_KEY, true);
    setMode(null);
  };
  const install = async () => {
    prompt.prompt();
    const { outcome } = await prompt.userChoice;
    if (outcome === 'accepted') setMode(null);
  };
  return (
    <aside className="install" aria-labelledby="t-install">
      <div className="wrap install-in">
        <img src="assets/icons/icon-192.png" alt="" width="56" height="56" />
        <div className="install-text">
          <h2 className="install-title" id="t-install">Llevá El Fortín en el celular</h2>
          {mode === 'prompt'
            ? <p>Se abre como una app, desde la pantalla de inicio, y muestra lo último aunque no tengas señal en la cancha.</p>
            : <p>En Safari tocá <b>Compartir</b> <span aria-hidden="true">(□↑)</span> y después <b>Agregar a inicio</b>. Se abre como una app y funciona sin señal.</p>}
        </div>
        <div className="install-actions">
          {mode === 'prompt' && <button type="button" className="btn btn-on-accent" onClick={install}>Instalar</button>}
          <button type="button" className="btn btn-ghost" onClick={dismiss}>Ahora no</button>
        </div>
      </div>
    </aside>
  );
}
