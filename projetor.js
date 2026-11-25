const controller = window.opener;
const fileMode = location.protocol === 'file:';
const origin = fileMode ? 'null' : location.origin;
const time = document.querySelector('#remaining');
const progress = document.querySelector('#elapsed');
const moduleName = document.querySelector('#module');
const total = document.querySelector('#total');
const status = document.querySelector('#status');
const fullscreen = document.querySelector('#fullscreen');
let snapshot;

function formatTime(milliseconds) {
  const seconds = Math.ceil(milliseconds / 1000);
  const minutes = Math.floor(seconds / 60);
  const parts = minutes >= 60 ? [Math.floor(minutes / 60), minutes % 60] : [minutes];
  parts.push(seconds % 60);
  return parts.map((part) => String(part).padStart(2, '0')).join(':');
}

function render() {
  if (!snapshot) return;
  const { name, total: duration, deadline, remaining, status: state, finished } = snapshot;
  const left = deadline === null ? remaining : Math.max(0, deadline - Date.now());
  const ended = finished || deadline !== null && left === 0;
  const label = controller?.closed ? 'Painel de controle fechado' : ended ? 'TEMPO ENCERRADO' : state;
  const display = formatTime(left);
  if (time.textContent !== display) time.textContent = display;
  if (status.textContent !== label) status.textContent = label;
  moduleName.textContent = name || 'Aguardando módulo';
  total.textContent = duration ? 'Tempo total ' + formatTime(duration) : 'Tempo total —';
  progress.value = duration ? 1 - Math.min(1, left / duration) : 0;
  document.body.classList.toggle('projection-ended', ended);
  document.body.classList.toggle('projection-warning', deadline !== null && left > 0 && left <= 60000);
}

window.addEventListener('message', (event) => {
  if (event.source !== controller || event.origin !== origin || event.data?.type !== 'exam-clock-state') return;
  snapshot = event.data.snapshot;
  render();
});
controller?.postMessage({ type: 'exam-clock-ready' }, fileMode ? '*' : origin);
setInterval(render, 200);
document.addEventListener('visibilitychange', render);

fullscreen.hidden = !document.fullscreenEnabled;
fullscreen.addEventListener('click', async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
  } catch {
    fullscreen.textContent = 'Tela cheia indisponível';
  }
});
document.addEventListener('fullscreenchange', () => {
  fullscreen.textContent = document.fullscreenElement ? 'Sair da tela cheia' : 'Tela cheia';
});
