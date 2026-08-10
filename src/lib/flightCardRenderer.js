// src/lib/flightCardRenderer.js
//
// Draws the shareable flight card onto a canvas using plain Canvas 2D APIs
// — no new dependency (no html2canvas/etc.), consistent with the rest of
// this app's "don't add a library for something ~150 lines of native APIs
// already do" approach (see RouteMap/SceneryMap's hand-rolled tile math).
//
// Deliberately always rendered in the app's dark brand colors regardless of
// the user's current theme setting — a share card is a fixed artifact
// other people will see out of context, not a themed in-app view.

const WIDTH = 1200;
const HEIGHT = 630;

const COLORS = {
  bgTop: '#0C0E14',
  bgBottom: '#08090D',
  green: '#00E5A0',
  cyan: '#4FD8FF',
  amber: '#FFB000',
  text: '#F5F7FA',
  textMuted: '#9BA3B5',
  textFaint: '#6E7890',
  border: 'rgba(255,255,255,0.08)',
};

/**
 * @param {HTMLCanvasElement} canvas  a 1200x630 canvas, sized by the caller
 * @param {ReturnType<typeof import('./flightCardData.js').buildFlightCardData>} data
 */
export function drawFlightCard(canvas, data) {
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext('2d');

  const bg = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
  bg.addColorStop(0, COLORS.bgTop);
  bg.addColorStop(1, COLORS.bgBottom);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // Soft glow accents in the corners, echoing the app's animated mesh
  // background without trying to reproduce the full blur/animation.
  drawGlow(ctx, WIDTH * 0.08, HEIGHT * 0.05, 420, COLORS.green, 0.16);
  drawGlow(ctx, WIDTH * 0.95, HEIGHT * 0.95, 380, COLORS.cyan, 0.12);

  ctx.strokeStyle = COLORS.border;
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, WIDTH - 2, HEIGHT - 2);

  const padX = 80;

  // Brand mark, top-left.
  ctx.fillStyle = COLORS.textFaint;
  ctx.font = '600 22px "Segoe UI", sans-serif';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText('FLIGHTSYNC', padX, 76);

  if (data.liveVatsim) {
    const label = 'LIVE ON VATSIM';
    ctx.font = '700 18px "Segoe UI", sans-serif';
    const w = ctx.measureText(label).width + 34;
    const x = WIDTH - padX - w;
    const y = 44;
    roundRect(ctx, x, y, w, 34, 17);
    ctx.fillStyle = 'rgba(0, 229, 160, 0.14)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(0, 229, 160, 0.4)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = COLORS.green;
    ctx.beginPath();
    ctx.arc(x + 18, y + 17, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillText(label, x + 30, y + 23);
  }

  // Callsign — the hero element, matching the in-app FlightStrip.
  ctx.fillStyle = COLORS.text;
  ctx.font = '700 84px "Segoe UI", sans-serif';
  ctx.fillText(data.callsign, padX, 250);

  // Route.
  ctx.font = '600 56px "Consolas", monospace';
  ctx.fillStyle = COLORS.textMuted;
  const originText = data.route.split(' → ')[0] ?? '????';
  ctx.fillText(originText, padX, 340);
  const originWidth = ctx.measureText(originText).width;
  ctx.fillStyle = COLORS.green;
  ctx.fillText(' → ', padX + originWidth, 340);
  const arrowWidth = ctx.measureText(' → ').width;
  ctx.fillStyle = COLORS.textMuted;
  ctx.fillText(data.route.split(' → ')[1] ?? '????', padX + originWidth + arrowWidth, 340);

  // Tag row.
  let tagX = padX;
  const tagY = 390;
  if (data.airlineIcao) tagX = drawTag(ctx, tagX, tagY, data.airlineIcao, COLORS.amber, 'rgba(255,176,0,0.12)');
  tagX = drawTag(ctx, tagX, tagY, data.aircraftIcao, COLORS.text, 'rgba(255,255,255,0.06)');
  if (data.alternates.length > 0) {
    drawTag(ctx, tagX, tagY, `ALTN ${data.alternates.join(' / ')}`, COLORS.textFaint, 'rgba(255,255,255,0.04)');
  }

  // Footer stats.
  const footerY = HEIGHT - 90;
  ctx.font = '400 20px "Segoe UI", sans-serif';
  ctx.fillStyle = COLORS.textFaint;
  const stats = [
    data.distanceLabel ? `${data.distanceLabel} great circle` : null,
    data.addonCount > 0 ? `${data.addonCount} addon${data.addonCount === 1 ? '' : 's'} synced for this route` : null,
    data.generatedAt,
  ].filter(Boolean);
  ctx.fillText(stats.join('   ·   '), padX, footerY);

  ctx.strokeStyle = COLORS.border;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(padX, footerY + 24);
  ctx.lineTo(WIDTH - padX, footerY + 24);
  ctx.stroke();
}

function drawTag(ctx, x, y, label, color, bg) {
  ctx.font = '600 24px "Consolas", monospace';
  const w = ctx.measureText(label).width + 32;
  roundRect(ctx, x, y, w, 44, 8);
  ctx.fillStyle = bg;
  ctx.fill();
  ctx.fillStyle = color;
  ctx.fillText(label, x + 16, y + 29);
  return x + w + 14;
}

function drawGlow(ctx, x, y, radius, color, alpha) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, radius);
  g.addColorStop(0, hexToRgba(color, alpha));
  g.addColorStop(1, hexToRgba(color, 0));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
}

function hexToRgba(hex, alpha) {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
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
