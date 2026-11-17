// Piezas que comparten los juegos de la página Juegos: lo guardado en el navegador, el buscador de jugadores, las
// fotos, los efectos (festejo, sacudida, contador) y el cierre con el resultado para compartir.
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { load, save } from '../../lib/storage.js';
import { fmtWait, recordResult, searchPlayers, untilNext } from '../../lib/daily.js';
import { useNow } from '../../hooks/data.js';
import { ShareCardButton } from '../../components/ShareCard.jsx';
import { ExtLink } from '../../components/ui.jsx';

/** Estado guardado en el navegador: arranca vacío (igual que el HTML del deploy) y se lee al montar. */
export function useStored(key, fallback) {
  const [value, setValue] = useState(fallback);
  useEffect(() => setValue(load(key, fallback)), [key]);
  const update = (next) => {
    setValue((prev) => {
      const v = typeof next === 'function' ? next(prev) : next;
      save(key, v);
      return v;
    });
  };
  return [value, update];
}

/**
 * La partida de hoy de un juego: lo guardado vale solo para `day` (el día, o la semana en el Once de Liniers); al
 * cambiar, arranca de `empty`. Devuelve [partida, cambiar] (cambiar recibe los campos nuevos o una función).
 */
export function useDaily(key, day, empty) {
  const [stored, setStored] = useStored(key, { day: null });
  const current = (s) => (s.day === day ? s : { day, ...empty });
  const update = (patch) => setStored((prev) => ({ ...current(prev), ...(typeof patch === 'function' ? patch(current(prev)) : patch) }));
  return [current(stored), update];
}

// ---------- Efectos ----------

const calm = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Vibración corta en el celular: un toque si acertó, dos si erró (donde el navegador la tiene). */
export function buzz(ok) {
  try {
    if (!calm()) navigator.vibrate?.(ok ? 18 : [30, 50, 30]);
  } catch {
    /* sin vibración */
  }
}

/**
 * Una marca que dura un instante, para animar lo que acaba de pasar (y no lo que ya estaba al abrir la página):
 * [marca, marcar]. `marcar('miss')` deja `marca === 'miss'` durante `ms`.
 */
export function useFlash(ms = 700) {
  const [flash, setFlash] = useState(null);
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  const fire = (name) => {
    clearTimeout(timer.current);
    setFlash(name);
    timer.current = setTimeout(() => setFlash(null), ms);
  };
  return [flash, fire];
}

/** Un número que sube de 0 a `value` en medio segundo cuando `run` pasa a true (con «reducir movimiento», de una). */
export function useCountUp(value, run) {
  const [shown, setShown] = useState(run ? value : 0);
  useEffect(() => {
    if (!run) return setShown(0);
    if (calm()) return setShown(value);
    let step = 0;
    const steps = 14;
    // Con temporizador y no con requestAnimationFrame: en una pestaña oculta el cuadro no llega y el número quedaría en 0.
    const t = setInterval(() => {
      step += 1;
      setShown(Math.round((value * step) / steps));
      if (step >= steps) clearInterval(t);
    }, 36);
    return () => clearInterval(t);
  }, [value, run]);
  return shown;
}

const PIECES = Array.from({ length: 18 }, (_, i) => i);

/** Papelitos azules y blancos que caen una vez (solo adorno: no se anuncia ni tapa los toques). */
export function Confetti() {
  return (
    <span className="confetti" aria-hidden="true">
      {PIECES.map((i) => <i key={i} style={{ '--i': i, '--x': `${(i * 37) % 100}%`, '--r': `${(i * 53) % 360}deg`, '--d': `${(i % 6) * 0.07}s` }} />)}
    </span>
  );
}

// ---------- Fotos ----------

const initials = (name) => String(name ?? '').split(' ').filter(Boolean).map((w) => w[0]).slice(0, 2).join('').toUpperCase();

/**
 * Foto redonda de un jugador. Sin foto (o si no carga): el dorsal si se pasa `num`, o las iniciales.
 * `photo` = { src } (lib/players.js › photoOf).
 */
export function Avatar({ photo, name, num, size = 40, className = '' }) {
  const [failed, setFailed] = useState(false);
  const style = { width: size, height: size, fontSize: Math.round(size * 0.4) };
  if (!photo?.src || failed) return <span className={`avatar avatar-none ${className}`} style={style} aria-hidden="true">{num ?? initials(name)}</span>;
  return <img className={`avatar ${className}`} style={style} src={photo.src} alt="" width={size} height={size} loading="lazy" decoding="async" onError={() => setFailed(true)} />;
}

/** La foto grande del jugador revelado, con el crédito que piden las licencias (autor, licencia y link). */
export function PlayerReveal({ player, sub }) {
  const [failed, setFailed] = useState(false);
  const photo = player.photo;
  return (
    <figure className="reveal">
      {photo && !failed
        ? <img className="reveal-photo" src={photo.big} alt={`Foto de ${player.n}`} width={132} height={132} decoding="async" onError={() => setFailed(true)} />
        : <span className="reveal-photo avatar-none" aria-hidden="true">{player.jersey ?? initials(player.n)}</span>}
      <figcaption>
        <strong>{player.n}</strong>
        {sub && <span className="muted">{sub}</span>}
        {photo && !failed && <small className="muted">{photo.href ? <ExtLink href={photo.href}>{photo.credit}</ExtLink> : photo.credit}</small>}
      </figcaption>
    </figure>
  );
}

// ---------- Buscador ----------

/**
 * Buscador de jugadores con sugerencias (sin tildes, desde 2 letras). `list` = [{ id, n, rank, photo?, jersey? }];
 * `exclude` = ids que ya no se pueden elegir. Patrón combobox de ARIA: el campo (role=combobox) se queda con el foco,
 * la lista es un listbox con opciones que se tocan (sin botones adentro) y la marcada va en aria-activedescendant;
 * flechas, Enter y Escape. `label` dice qué escribir; `detail` (el intento, la casilla) va como descripción.
 */
export function PlayerSearch({ list, onPick, exclude, disabled, label = 'Escribí el nombre de un jugador', detail, hint, shake }) {
  const [text, setText] = useState('');
  const [active, setActive] = useState(0);
  const id = useId();
  const input = useRef(null);
  const options = useMemo(() => searchPlayers(list, text, 8).filter((p) => !exclude?.has(p.id)).slice(0, 6), [list, text, exclude]);
  const open = options.length > 0;
  const described = [detail && `${id}-detail`, hint && `${id}-hint`, `${id}-count`].filter(Boolean).join(' ');
  const pick = (p) => {
    setText('');
    setActive(0);
    onPick(p);
    input.current?.focus();
  };
  const onKey = (e) => {
    if (!open) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => (a + (e.key === 'ArrowDown' ? 1 : options.length - 1)) % options.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      pick(options[Math.min(active, options.length - 1)]);
    } else if (e.key === 'Escape') setText('');
  };
  const typed = text.trim().length >= 2;
  return (
    <div className={`psearch${shake ? ' is-shake' : ''}`}>
      <label className="psearch-label" htmlFor={id}>{label}</label>
      {detail && <p className="muted small" id={`${id}-detail`}>{detail}</p>}
      <input
        ref={input} id={id} className="psearch-input" type="text" value={text} disabled={disabled} placeholder="Apellido o nombre"
        role="combobox" aria-expanded={open} aria-controls={`${id}-list`} aria-autocomplete="list" aria-activedescendant={open ? `${id}-${Math.min(active, options.length - 1)}` : undefined}
        aria-describedby={described}
        autoComplete="off" autoCapitalize="words" autoCorrect="off" spellCheck={false} enterKeyHint="done"
        onChange={(e) => { setText(e.target.value); setActive(0); }} onKeyDown={onKey}
      />
      <ul className="psearch-list" id={`${id}-list`} role="listbox" aria-label="Jugadores que coinciden" hidden={!open}>
        {options.map((p, i) => (
          // mousedown: antes de que el campo pierda el foco. La opción se toca entera (fila de 44 px), sin botón adentro.
          <li key={p.id} id={`${id}-${i}`} role="option" aria-selected={i === active} className="psearch-opt" onMouseDown={(e) => e.preventDefault()} onClick={() => pick(p)}>
            <Avatar photo={p.photo} name={p.n} num={p.jersey} size={32} />
            <span>{p.n}</span>
          </li>
        ))}
      </ul>
      {/* Cuántas sugerencias hay: región fija, así el lector la anuncia al cambiar. */}
      <p className="sr-only" id={`${id}-count`} aria-live="polite">{!typed ? 'Escribí al menos 2 letras.' : open ? `${options.length} ${options.length === 1 ? 'sugerencia' : 'sugerencias'}: flechas para elegir, Enter para confirmar.` : 'Ningún jugador coincide.'}</p>
      {typed && !open && <p className="muted small psearch-none" aria-hidden="true">No hay ningún jugador con ese nombre en los datos del juego.</p>}
      {hint && <p className="muted small" id={`${id}-hint`}>{hint}</p>}
    </div>
  );
}

// ---------- Cierre ----------

/** Botones para compartir el resultado: el texto con cuadraditos (WhatsApp, X) y, si se pasa `card`, la imagen. */
export function ShareResult({ text, anchor, card, file }) {
  const [copied, setCopied] = useState(false);
  const share = async () => {
    const full = `${text}\n${location.href.split('#')[0]}#${anchor}`;
    try {
      if (navigator.share) await navigator.share({ text: full });
      else {
        await navigator.clipboard.writeText(full);
        setCopied(true);
      }
    } catch {
      /* canceló */
    }
  };
  return (
    <div className="cal-links">
      <button type="button" className="btn btn-solid" onClick={share}>{copied ? 'Copiado: pegalo en WhatsApp' : 'Compartir el resultado'}</button>
      {card && <ShareCardButton label="Compartir como imagen" file={file} getCard={card} />}
    </div>
  );
}

/**
 * Tarjeta de cierre de una partida: el puntaje grande, una frase, los cuadraditos y los botones. `fresh` = se terminó
 * recién (entra con animación y se lleva el foco: el control que se usó para jugar desaparece o queda deshabilitado,
 * y sin esto el foco del teclado se iría al <body>); con `win` además caen papelitos. `player` = el jugador que había
 * que adivinar. `stats` = la racha, los números del historial y cuándo sale el próximo (<DailyStats>).
 */
export function GameEnd({ kicker, score, phrase, marks, children, fresh, win, player, sub, stats }) {
  const ref = useRef(null);
  useEffect(() => {
    if (fresh) ref.current?.focus();
  }, [fresh]);
  return (
    <div ref={ref} tabIndex={-1} className={`card trivia-end game-end${fresh ? ' is-fresh' : ''}${win ? ' is-win' : ''}`} role="group" aria-label={`${kicker}: ${score}. ${phrase}`}>
      {fresh && win && <Confetti />}
      <p className="kicker">{kicker}</p>
      {player && <PlayerReveal player={player} sub={sub} />}
      <p className="trivia-score"><b className="num">{score}</b> {phrase}</p>
      {marks && <p className="trivia-squares game-squares" aria-hidden="true">{marks}</p>}
      {stats}
      {children}
    </div>
  );
}

// ---------- Anuncios ----------

/**
 * Región viva fija para los lectores de pantalla: se monta vacía con el juego y después se le cambia el texto (una
 * región que aparece ya con su texto no siempre se lee). `[texto, anunciar]`; `anunciar` repite aunque el texto sea
 * el mismo (lo vacía un instante).
 */
export function useAnnounce() {
  const [text, setText] = useState('');
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  const say = (msg) => {
    clearTimeout(timer.current);
    setText('');
    timer.current = setTimeout(() => setText(msg), 60);
  };
  return [text, say];
}

/** La región: invisible, siempre montada. */
export function Announcer({ text }) {
  return <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">{text}</p>;
}

// ---------- Historial y próximo juego ----------

/** El historial de un juego del día (`fortin:stats-<juego>`): [historial, guardar(día, valor)]. */
export function useResults(game) {
  const [hist, setHist] = useStored(`stats-${game}`, {});
  return [hist, (day, value) => setHist((h) => recordResult(h, day, value))];
}

/**
 * Lo que va al pie de la pantalla final de los juegos del día: la racha, los números del historial y cuánto falta para
 * el próximo (00:00 de la Argentina, o el domingo con `weekly`). `stats` = [[nombre, valor]].
 */
export function DailyStats({ streak, stats = [], weekly = false }) {
  const now = useNow(60_000);
  const wait = fmtWait(untilNext(now, weekly));
  const items = [...(streak > 0 ? [['Racha', `${streak} ${streak === 1 ? 'día' : 'días'}`]] : []), ...stats.filter(([, v]) => v != null)];
  return (
    <div className="ge-stats">
      {items.length > 0 && (
        <dl className="ge-nums">
          {items.map(([k, v]) => <div key={k}><dt>{k}</dt><dd className="num">{v}</dd></div>)}
        </dl>
      )}
      <p className="muted small">
        {weekly ? 'El próximo once sale el domingo a las 00:00' : 'El próximo sale mañana a las 00:00'} (hora de la Argentina): faltan {wait}.
      </p>
    </div>
  );
}
