const $ = (id) => document.getElementById(id);
const storageKey = 'tempo-de-prova.exams';
let exams = [];
try {
  exams = JSON.parse(localStorage.getItem(storageKey)) ?? [];
  if (!Array.isArray(exams)) exams = [];
} catch {
  // The timer also works when browser storage is unavailable.
}

const dayKey = (date) => [
  date.getFullYear(),
  String(date.getMonth() + 1).padStart(2, '0'),
  String(date.getDate()).padStart(2, '0'),
].join('-');

let day = dayKey(new Date());
let selected = null;
let remaining = 0;
let deadline = null;
let finished = false;
let soundOn = true;
let audio;
let siren;
let toastTimeout;
let projector;
let lastProjection = '';
const dialog = $('examDialog');

function notify(message, alert = false) {
  clearTimeout(toastTimeout);
  $('toast').textContent = message;
  $('toast').className = alert ? 'toast visible alert' : 'toast visible';
  toastTimeout = setTimeout(() => $('toast').classList.remove('visible'), 4500);
}

function save() {
  try {
    localStorage.setItem(storageKey, JSON.stringify(exams));
  } catch {
    notify('O navegador não conseguiu salvar as provas neste dispositivo.', true);
  }
}

function stopAlarm() {
  siren?.stop();
  siren = null;
  $('stopAlarm').hidden = true;
}

async function unlockAudio() {
  audio ??= new AudioContext();
  await audio.resume();
}

async function playAlarm(seconds) {
  if (!soundOn) return;
  try {
    if (audio?.state !== 'running') await unlockAudio();
    if (!soundOn) return;
    stopAlarm();
    const oscillator = audio.createOscillator();
    const gain = audio.createGain();
    const start = audio.currentTime;
    oscillator.type = 'triangle';
    gain.gain.value = 0;
    for (let offset = 0; offset < seconds; offset += 0.45) {
      const beat = start + offset;
      oscillator.frequency.setValueAtTime(offset % 0.9 < 0.44 ? 980 : 1380, beat);
      gain.gain.setValueAtTime(0, beat);
      gain.gain.linearRampToValueAtTime(0.92, beat + 0.02);
      gain.gain.setValueAtTime(0.92, beat + 0.25);
      gain.gain.linearRampToValueAtTime(0, beat + 0.40);
    }
    oscillator.connect(gain).connect(audio.destination);
    siren = oscillator;
    oscillator.onended = () => {
      oscillator.disconnect();
      gain.disconnect();
      if (siren === oscillator) {
        siren = null;
        $('stopAlarm').hidden = true;
      }
    };
    oscillator.start(start);
    oscillator.stop(start + seconds);
    $('stopAlarm').hidden = false;
  } catch {
    notify('Áudio indisponível. Confira as permissões de som do navegador.', true);
  }
}

function formatTime(milliseconds) {
  const seconds = Math.ceil(milliseconds / 1000);
  const minutes = Math.floor(seconds / 60);
  const pair = (value) => String(value).padStart(2, '0');
  return minutes >= 60
    ? [pair(Math.floor(minutes / 60)), pair(minutes % 60), pair(seconds % 60)].join(':')
    : [pair(minutes), pair(seconds % 60)].join(':');
}

function renderTimer() {
  const running = deadline !== null;
  const ratio = selected ? remaining / (selected.duration * 60000) : 0;
  $('timerDisplay').textContent = formatTime(remaining);
  $('timerDisplay').classList.toggle('with-hours', remaining > 3599000);
  $('timerSub').textContent = selected?.name ?? 'Selecione um módulo';
  $('timerStatus').textContent = finished ? 'ENCERRADO' : running ? 'EM PROVA' : ratio > 0 && ratio < 1 ? 'PAUSADO' : 'PRONTO';
  $('timerStatus').parentElement.classList.toggle('running', running);
  $('timerStatus').parentElement.classList.toggle('done', finished);
  $('timerRing').classList.toggle('warning', running && remaining <= 60000);
  $('timerRing').classList.toggle('finished', finished);
  $('ringProgress').style.strokeDashoffset = finished ? '0' : String(735.13 * (1 - ratio));
  $('progressFill').style.width = selected ? (1 - ratio) * 100 + '%' : '0%';
  $('startBtn').disabled = !selected;
  $('resetBtn').disabled = !selected;
  $('editTimer').disabled = !selected;
  $('startBtn').lastElementChild.textContent = running ? 'Pausar' : ratio > 0 && ratio < 1 ? 'Continuar' : 'Iniciar prova';
  publishProjection();
}

function publishProjection(force = false) {
  if (!projector || projector.closed) return;
  const snapshot = {
    name: selected?.name ?? '',
    total: (selected?.duration ?? 0) * 60000,
    remaining: deadline === null ? remaining : null,
    deadline,
    finished,
    status: $('timerStatus').textContent,
  };
  const serialized = JSON.stringify(snapshot);
  if (!force && lastProjection === serialized) return;
  const origin = location.protocol === 'file:' ? '*' : location.origin;
  projector.postMessage({ type: 'exam-clock-state', snapshot }, origin);
  lastProjection = serialized;
}

function tick() {
  if (deadline === null) return;
  remaining = Math.max(0, deadline - Date.now());
  if (remaining === 0) {
    deadline = null;
    finished = true;
    notify('Tempo encerrado! ' + selected.name, true);
    void playAlarm(12);
  }
  renderTimer();
}

function resetTimer() {
  stopAlarm();
  deadline = null;
  finished = false;
  remaining = (selected?.duration ?? 0) * 60000;
  renderTimer();
}

function canReplaceTimer() {
  if (!selected || finished || remaining === selected.duration * 60000 && deadline === null) return true;
  return window.confirm('Encerrar a contagem atual?');
}

function choose(exam) {
  if (selected?.id === exam.id || !canReplaceTimer()) return;
  selected = exam;
  resetTimer();
  renderSchedule();
}

function openExam(exam) {
  $('dialogTitle').textContent = exam ? 'Editar módulo' : 'Novo módulo';
  $('examId').value = exam?.id ?? '';
  $('examName').value = exam?.name ?? '';
  $('examDuration').value = exam?.duration ?? 60;
  $('examTime').value = exam?.time ?? '';
  $('examNotes').value = exam?.notes ?? '';
  dialog.showModal();
}

function action(label, onClick) {
  const button = document.createElement('button');
  button.className = 'button button-secondary';
  button.type = 'button';
  button.textContent = label;
  button.addEventListener('click', onClick);
  return button;
}

function renderSchedule() {
  $('datePicker').value = day;
  const list = $('examList');
  const daily = exams.filter((exam) => exam.day === day)
    .sort((a, b) => (a.time || '99:99').localeCompare(b.time || '99:99'));
  $('examCount').textContent = daily.length === 1 ? '1 módulo' : daily.length + ' módulos';
  list.replaceChildren();

  if (!daily.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = 'Nenhum módulo nesta data.';
    list.append(empty);
  }

  for (const exam of daily) {
    const item = document.createElement('div');
    item.className = 'exam-item';
    item.classList.toggle('selected', selected?.id === exam.id);
    const accent = document.createElement('span');
    accent.className = 'exam-accent';
    const info = document.createElement('div');
    info.className = 'exam-info';
    const name = document.createElement('strong');
    name.textContent = exam.name;
    const meta = document.createElement('span');
    meta.className = 'exam-meta';
    meta.textContent = [exam.duration + ' min', exam.time, exam.notes].filter(Boolean).join(' · ');
    info.append(name, meta);
    const controls = document.createElement('div');
    controls.className = 'exam-actions';
    const select = action(selected?.id === exam.id ? 'Selecionado' : 'Selecionar', () => choose(exam));
    select.disabled = selected?.id === exam.id;
    controls.append(select, action('Editar', () => openExam(exam)), action('Excluir', () => {
      if (!window.confirm('Excluir o módulo “' + exam.name + '”?')) return;
      exams = exams.filter(({ id }) => id !== exam.id);
      if (selected?.id === exam.id) {
        selected = null;
        resetTimer();
      }
      renderSchedule();
      save();
    }));
    item.append(accent, info, controls);
    list.append(item);
  }
}

function shiftDay(offset) {
  const [year, month, date] = day.split('-').map(Number);
  day = dayKey(new Date(year, month - 1, date + offset, 12));
  renderSchedule();
}

$('examForm').addEventListener('submit', (event) => {
  event.preventDefault();
  const name = $('examName').value.trim();
  if (!name) {
    $('examName').focus();
    return;
  }
  const id = $('examId').value;
  const exam = {
    id: id || globalThis.crypto?.randomUUID?.() || String(Date.now()),
    day: exams.find((entry) => entry.id === id)?.day ?? day,
    name,
    duration: Number($('examDuration').value),
    time: $('examTime').value,
    notes: $('examNotes').value.trim(),
  };
  const editingSelected = selected?.id === id;
  const durationChanged = editingSelected && selected.duration !== exam.duration;
  if (durationChanged) tick();
  const elapsed = durationChanged ? selected.duration * 60000 - remaining : 0;
  exams = id ? exams.map((entry) => entry.id === id ? exam : entry) : [...exams, exam];
  if (editingSelected || !selected) {
    selected = exam;
    if (!editingSelected || durationChanged && finished) resetTimer();
    else if (durationChanged) {
      remaining = Math.max(0, exam.duration * 60000 - elapsed);
      if (deadline !== null || remaining === 0) {
        deadline = Date.now() + remaining;
        tick();
      } else {
        renderTimer();
      }
    }
    else renderTimer();
  }
  dialog.close();
  renderSchedule();
  save();
});

$('startBtn').addEventListener('click', () => {
  if (deadline !== null) {
    tick();
    deadline = null;
  } else {
    stopAlarm();
    if (finished) resetTimer();
    if (soundOn) void unlockAudio().catch(() => notify('Não foi possível ativar o áudio.', true));
    deadline = Date.now() + remaining;
  }
  renderTimer();
});
$('resetBtn').addEventListener('click', () => {
  if (canReplaceTimer()) resetTimer();
});
$('soundToggle').addEventListener('click', () => {
  soundOn = !soundOn;
  if (!soundOn) stopAlarm();
  else void unlockAudio().catch(() => notify('Não foi possível ativar o áudio.', true));
  renderSound();
});
function renderSound() {
  const toggle = $('soundToggle');
  const label = soundOn ? 'Silenciar alarme' : 'Ativar alarme';
  toggle.classList.toggle('is-on', soundOn);
  toggle.setAttribute('aria-pressed', String(soundOn));
  toggle.setAttribute('aria-label', label);
  toggle.title = label;
  $('testAlarm').disabled = !soundOn;
}
$('testAlarm').addEventListener('click', () => void playAlarm(2));
$('stopAlarm').addEventListener('click', stopAlarm);
$('editTimer').addEventListener('click', () => openExam(selected));
$('openProjector').addEventListener('click', () => {
  if (!projector || projector.closed) {
    projector = window.open('projetor.html', 'tempo-de-prova-projetor', 'popup,width=1024,height=700');
  }
  if (!projector) {
    notify('Permita pop-ups para abrir a tela do projetor.', true);
    return;
  }
  projector.focus();
  publishProjection(true);
});
window.addEventListener('message', (event) => {
  const origin = location.protocol === 'file:' ? 'null' : location.origin;
  if (event.source === projector && event.origin === origin && event.data?.type === 'exam-clock-ready') {
    publishProjection(true);
  }
});
$('addExamBtn').addEventListener('click', () => openExam());
$('closeDialog').addEventListener('click', () => dialog.close());
$('cancelDialog').addEventListener('click', () => dialog.close());
$('prevDay').addEventListener('click', () => shiftDay(-1));
$('nextDay').addEventListener('click', () => shiftDay(1));
$('todayBtn').addEventListener('click', () => {
  day = dayKey(new Date());
  renderSchedule();
});
$('datePicker').addEventListener('change', (event) => {
  if (event.target.value) day = event.target.value;
  renderSchedule();
});
document.addEventListener('visibilitychange', tick);
setInterval(tick, 200);
renderSound();
renderSchedule();
renderTimer();
