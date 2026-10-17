// Imagen para compartir (resultado, previa, prode, trivia…) en 1080×1350, el formato vertical que mejor se ve en
// WhatsApp e Instagram. Se dibuja en el navegador con <canvas>: no hace falta servidor. Los textos salen de
// src/lib/card.js. Si el celular sabe compartir archivos, se abre el menú de compartir; si no, se descarga.
import { useRef, useState } from 'react';
import { sized } from '../lib/core.js';
import { SITE } from '../site.js';

const W = 1080;
const H = 1350;
const BLUE = '#0061A8';
const DEEP = '#004476';
const DISPLAY = '"Barlow Condensed", "Arial Narrow", sans-serif';
const BODY = 'Montserrat, system-ui, sans-serif';

// Escudos de ESPN: si no se pueden leer (sin CORS o sin red) va un círculo con la inicial; el canvas no queda «sucio».
function loadImage(src, ms = 4000) {
  return new Promise((resolve) => {
    if (!src) return resolve(null);
    const img = new Image();
    const timer = setTimeout(() => resolve(null), ms);
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      clearTimeout(timer);
      resolve(img);
    };
    img.onerror = () => {
      clearTimeout(timer);
      resolve(null);
    };
    img.src = src;
  });
}

/** Corta `text` en renglones de hasta `max` px (a lo sumo `maxLines`; el último con «…»). */
function wrap(ctx, text, max, maxLines = 2) {
  const words = String(text).split(/\s+/);
  const lines = [];
  let line = '';
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width <= max || !line) line = test;
    else {
      lines.push(line);
      line = w;
    }
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    let last = kept.at(-1);
    while (ctx.measureText(`${last}…`).width > max && last.length > 1) last = last.slice(0, -1);
    kept[maxLines - 1] = `${last}…`;
    return kept;
  }
  return lines;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawTeam(ctx, team, img, cx, cy) {
  const size = 230;
  ctx.save();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(cx, cy, size / 2 + 18, 0, Math.PI * 2);
  ctx.fill();
  if (img) ctx.drawImage(img, cx - size / 2 + 20, cy - size / 2 + 20, size - 40, size - 40);
  else {
    ctx.fillStyle = BLUE;
    ctx.font = `800 120px ${DISPLAY}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(team.name.charAt(0).toUpperCase(), cx, cy + 6);
  }
  ctx.restore();
  ctx.fillStyle = '#ffffff';
  ctx.font = `700 44px ${BODY}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  wrap(ctx, team.name, 380).forEach((l, i) => ctx.fillText(l, cx, cy + size / 2 + 44 + i * 52));
}

/**
 * Dibuja una tarjeta. `card` = { kicker, headline, home?, away?, center, when?, lines, big? }.
 * Con `big` (prode, trivia) no lleva escudos: el centro es un texto grande.
 */
export async function drawCard(canvas, card) {
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  await Promise.all([
    document.fonts?.load(`800 100px ${DISPLAY}`), document.fonts?.load(`700 40px ${BODY}`), document.fonts?.load(`600 40px ${BODY}`),
  ].filter(Boolean)).catch(() => {});
  const [homeImg, awayImg, logo] = await Promise.all([
    card.home ? loadImage(sized(card.home.logo, 128)) : null,
    card.away ? loadImage(sized(card.away.logo, 128)) : null,
    loadImage('assets/icons/icon-192.png'),
  ]);

  // Fondo: azul con la V de la camiseta.
  ctx.fillStyle = BLUE;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = DEEP;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(200, 0);
  ctx.lineTo(540, 560);
  ctx.lineTo(880, 0);
  ctx.lineTo(W, 0);
  ctx.lineTo(540, 860);
  ctx.closePath();
  ctx.fill();

  // Marca
  if (logo) ctx.drawImage(logo, 64, 56, 84, 84);
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.font = `800 64px ${DISPLAY}`;
  ctx.fillText(SITE.name.toUpperCase(), logo ? 168 : 64, 100);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.font = `700 34px ${BODY}`;
  ctx.globalAlpha = 0.9;
  wrap(ctx, card.kicker ?? '', 940, 1).forEach((l) => ctx.fillText(l, W / 2, 222));
  ctx.globalAlpha = 1;
  ctx.font = `800 128px ${DISPLAY}`;
  ctx.fillText(card.headline.toUpperCase(), W / 2, 350);

  let y = 520;
  if (card.big) {
    ctx.font = `800 ${card.bigSize ?? 230}px ${DISPLAY}`;
    ctx.fillText(card.center, W / 2, 640);
    if (card.sub) {
      ctx.font = `700 44px ${BODY}`;
      wrap(ctx, card.sub, 900, 2).forEach((l, i) => ctx.fillText(l, W / 2, 730 + i * 56));
    }
    y = 900;
  } else {
    drawTeam(ctx, card.home, homeImg, 250, 540);
    drawTeam(ctx, card.away, awayImg, 830, 540);
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    // Entre los dos escudos hay ~300 px: el marcador se achica si no entra («10-2», penales).
    let size = card.center === 'vs' ? 110 : 190;
    do ctx.font = `800 ${size}px ${DISPLAY}`;
    while (ctx.measureText(card.center).width > 290 && (size -= 10) > 60);
    ctx.fillText(card.center.toUpperCase(), W / 2, 540);
    ctx.textBaseline = 'alphabetic';
    if (card.when) {
      ctx.font = `700 40px ${BODY}`;
      ctx.fillText(card.when, W / 2, 860);
      y = 910;
    } else y = 880;
  }

  // Datos en una tarjeta blanca
  const lines = (card.lines ?? []).slice(0, 4);
  if (lines.length) {
    ctx.font = `600 38px ${BODY}`;
    const wrapped = lines.flatMap((l) => wrap(ctx, l, 860, 2).map((t, i) => ({ t, first: i === 0 })));
    const shown = wrapped.slice(0, 6);
    const boxH = 60 + shown.length * 54;
    roundRect(ctx, 70, y, W - 140, boxH, 28);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.fillStyle = '#1b1d21';
    ctx.textAlign = 'left';
    shown.forEach((l, i) => ctx.fillText(l.t, 110, y + 74 + i * 54));
  }

  ctx.fillStyle = '#ffffff';
  ctx.globalAlpha = 0.88;
  ctx.textAlign = 'center';
  ctx.font = `600 30px ${BODY}`;
  ctx.fillText(`${SITE.url.replace(/^https:\/\//, '').replace(/\/$/, '')} · sitio de hinchas`, W / 2, H - 56);
  ctx.globalAlpha = 1;
}

const toBlob = (canvas) => new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));

/**
 * Botón que arma la imagen y abre una vista previa para compartirla o bajarla.
 * `getCard` = () => card (o una promesa), se llama al tocar: así no se piden datos de más.
 */
export function ShareCardButton({ getCard, label = 'Compartir imagen', file = 'el-fortin.png', text, className = 'btn btn-outline' }) {
  const dialog = useRef(null);
  const [img, setImg] = useState(null); // { url, blob }
  const [busy, setBusy] = useState(false);
  const open = async () => {
    setBusy(true);
    try {
      const canvas = document.createElement('canvas');
      await drawCard(canvas, await getCard());
      const blob = await toBlob(canvas);
      if (img) URL.revokeObjectURL(img.url);
      setImg({ url: URL.createObjectURL(blob), blob });
      dialog.current?.showModal();
    } catch (err) {
      console.error('No se pudo armar la imagen:', err);
    } finally {
      setBusy(false);
    }
  };
  const fileObj = img && typeof File !== 'undefined' ? new File([img.blob], file, { type: 'image/png' }) : null;
  const canShare = Boolean(fileObj && navigator.canShare?.({ files: [fileObj] }));
  const share = async () => {
    try {
      await navigator.share({ files: [fileObj], text: text ?? `${SITE.url}` });
    } catch {
      /* canceló */
    }
  };
  return (
    <>
      <button type="button" className={className} onClick={open} disabled={busy} aria-haspopup="dialog">
        {busy ? 'Armando la imagen…' : label}
      </button>
      <dialog className="share-dialog" ref={dialog} aria-label="Imagen para compartir" onClick={(e) => e.target === dialog.current && dialog.current.close()}>
        {img && <img src={img.url} alt="Vista previa de la imagen para compartir" width="1080" height="1350" />}
        <div className="share-actions">
          {canShare && <button type="button" className="btn btn-solid" onClick={share}>Compartir</button>}
          {img && <a className="btn btn-outline" href={img.url} download={file}>Descargar</a>}
          <button type="button" className="btn btn-outline" onClick={() => dialog.current.close()}>Cerrar</button>
        </div>
      </dialog>
    </>
  );
}
