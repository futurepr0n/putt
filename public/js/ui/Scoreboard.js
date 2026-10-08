import { DomUtils } from '../utils/DomUtils.js';

const escapeHtml = (s) => String(s).replace(/[&<>"'`]/g, (c) => `&#${c.charCodeAt(0)};`);
const hex = (color) => '#' + color.toString(16).padStart(6, '0');
const formatToPar = (n) => (n === 0 ? 'E' : n > 0 ? `+${n}` : `${n}`);

export function scoreName(strokes, par) {
  if (strokes === 1) return { name: 'Hole in One!', color: '#00FFFF' };
  const diff = strokes - par;
  if (diff <= -2) return { name: 'Eagle', color: '#FFD700' };
  if (diff === -1) return { name: 'Birdie', color: '#00FF00' };
  if (diff === 0) return { name: 'Par', color: '#FFFFFF' };
  if (diff === 1) return { name: 'Bogey', color: '#FFA500' };
  if (diff === 2) return { name: 'Double Bogey', color: '#FF8C00' };
  return { name: `+${diff}`, color: '#FF4040' };
}

// Course info, player table and the "whose turn" banner
export class Scoreboard {
  init() {
    this.courseInfo = DomUtils.createElement('div', {
      position: 'absolute',
      bottom: '10px',
      right: '50px',
      color: 'white',
      fontSize: '18px',
      fontWeight: 'bold',
      backgroundColor: 'rgba(0, 0, 0, 0.7)',
      padding: '8px 14px',
      borderRadius: '5px',
      zIndex: '100'
    }, 'Hole 1');

    this.table = DomUtils.createElement('div', {
      position: 'absolute',
      top: '60px',
      right: '10px',
      color: 'white',
      fontSize: '15px',
      backgroundColor: 'rgba(0, 0, 0, 0.7)',
      padding: '10px 12px',
      borderRadius: '8px',
      zIndex: '100',
      minWidth: '220px'
    });

    this.banner = DomUtils.createElement('div', {
      position: 'absolute',
      top: '48px',
      left: '50%',
      transform: 'translateX(-50%)',
      color: 'white',
      fontSize: '22px',
      fontWeight: 'bold',
      backgroundColor: 'rgba(0, 0, 0, 0.7)',
      padding: '8px 20px',
      borderRadius: '24px',
      zIndex: '100',
      whiteSpace: 'nowrap'
    });

    document.body.append(this.courseInfo, this.table, this.banner);
    this.setBanner(null, 'Scan the QR code to join');
  }

  updateCourseInfo(current, total, par) {
    this.courseInfo.textContent = `Hole ${current} of ${total} · Par ${par}`;
  }

  setBanner(player, detail) {
    if (!player) {
      this.banner.innerHTML = escapeHtml(detail || '');
      return;
    }
    this.banner.innerHTML = `
      <span style="display:inline-block;width:14px;height:14px;border-radius:50%;background:${hex(player.color)};margin-right:8px;vertical-align:middle"></span>
      ${escapeHtml(player.name)}'s turn <span style="font-weight:normal;opacity:0.8">· ${escapeHtml(detail || '')}</span>`;
  }

  update(players, activeId, holeIndex, pars) {
    if (players.length === 0) {
      this.table.innerHTML = '<div style="opacity:0.8">No players yet</div>';
      return;
    }
    const rows = players.map((p) => {
      const playedPars = p.scores.reduce((sum, s, i) => (s == null ? sum : sum + (s - pars[i])), 0);
      const thisHole = p.holed ? `✓ ${p.strokes}` : p.pickedUp ? (p.sittingOut ? '–' : `✗ ${p.strokes}`) : p.strokes;
      const style = [
        p.id === activeId ? 'background:rgba(255,255,255,0.15)' : '',
        p.connected ? '' : 'opacity:0.45'
      ].join(';');
      return `<tr style="${style}">
        <td style="padding:3px 6px">${p.id === activeId ? '▶' : ''}</td>
        <td style="padding:3px 6px"><span style="display:inline-block;width:12px;height:12px;border-radius:50%;background:${hex(p.color)}"></span></td>
        <td style="padding:3px 6px;max-width:120px;overflow:hidden;text-overflow:ellipsis">${escapeHtml(p.name)}${p.connected ? '' : ' (away)'}</td>
        <td style="padding:3px 6px;text-align:right">${thisHole}</td>
        <td style="padding:3px 6px;text-align:right">${formatToPar(playedPars)}</td>
      </tr>`;
    }).join('');
    this.table.innerHTML = `
      <table style="border-collapse:collapse;width:100%">
        <tr style="opacity:0.7;font-size:12px"><td></td><td></td><td>Player</td><td style="text-align:right">Hole ${holeIndex + 1}</td><td style="text-align:right">Total</td></tr>
        ${rows}
      </table>`;
  }

  showHoleResults(players, holeIndex, par, duration) {
    const rows = players
      .filter(p => p.scores[holeIndex] != null)
      .sort((a, b) => a.scores[holeIndex] - b.scores[holeIndex])
      .map((p) => {
        const strokes = p.scores[holeIndex];
        const label = p.holed ? scoreName(strokes, par) : { name: 'Picked up', color: '#AAAAAA' };
        return `<tr>
          <td style="padding:4px 10px"><span style="display:inline-block;width:14px;height:14px;border-radius:50%;background:${hex(p.color)}"></span></td>
          <td style="padding:4px 10px;text-align:left">${escapeHtml(p.name)}</td>
          <td style="padding:4px 10px">${strokes}</td>
          <td style="padding:4px 10px;color:${label.color}">${label.name}</td>
        </tr>`;
      }).join('');
    DomUtils.createPopup({
      title: `Hole ${holeIndex + 1} complete · Par ${par}`,
      content: `<table style="margin:16px auto 6px;font-size:22px;border-collapse:collapse">${rows}</table>
        <div style="font-size:16px;font-weight:normal;opacity:0.8">Next hole loading...</div>`,
      duration
    });
  }

  showGameComplete(standings, pars) {
    const totalPar = pars.reduce((a, b) => a + b, 0);
    const header = pars.map((_, i) => `<th style="padding:4px 8px">${i + 1}</th>`).join('');
    const rows = standings.map(({ player, total, toPar }, rank) => `
      <tr>
        <td style="padding:6px 8px">${rank + 1}</td>
        <td style="padding:6px 8px;text-align:left"><span style="display:inline-block;width:14px;height:14px;border-radius:50%;background:${hex(player.color)};margin-right:8px"></span>${escapeHtml(player.name)}</td>
        ${pars.map((_, i) => `<td style="padding:6px 8px">${player.scores[i] ?? '–'}</td>`).join('')}
        <td style="padding:6px 8px;font-weight:bold">${total}</td>
        <td style="padding:6px 8px;font-weight:bold">${formatToPar(toPar)}</td>
      </tr>`).join('');

    const overlay = DomUtils.createElement('div', {
      position: 'absolute',
      inset: '0',
      backgroundColor: 'rgba(0, 0, 0, 0.9)',
      color: 'white',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      alignItems: 'center',
      fontSize: '20px',
      zIndex: '2000'
    });
    const winner = standings[0];
    overlay.innerHTML = `
      <h1 style="font-size:44px;margin-bottom:6px">Round Complete</h1>
      <div style="font-size:26px;margin-bottom:24px">${winner ? `🏆 ${escapeHtml(winner.player.name)} wins` : ''}</div>
      <table style="border-collapse:collapse;text-align:center">
        <tr style="opacity:0.7"><th></th><th style="text-align:left;padding:4px 8px">Player</th>${header}<th style="padding:4px 8px">Total</th><th style="padding:4px 8px">To par</th></tr>
        <tr style="opacity:0.7"><td></td><td style="text-align:left;padding:4px 8px">Par</td>${pars.map(p => `<td>${p}</td>`).join('')}<td>${totalPar}</td><td></td></tr>
        ${rows}
      </table>
      <button id="restartButton" style="margin-top:30px;padding:15px 30px;font-size:20px;background:#4CAF50;color:white;border:none;border-radius:5px;cursor:pointer">Play Again</button>`;
    document.body.appendChild(overlay);
    overlay.querySelector('#restartButton').addEventListener('click', () => window.location.reload());
  }
}
