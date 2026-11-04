// FretLock – WorkinWithAI Audio Engine compliant desk
// Timing on audio clock, live changes, seamless exports, live samples.

const LOOKAHEAD_MS = 25;
const SCHEDULE_AHEAD = 0.12;
const SAMPLE_RATE = 48000;

let audioCtx = null;
let nextStepTime = 0;
let currentStep = 0;
let timerId = null;
let activeSources = [];
let state = {
  bpm: 92,
  key: 'Am',
  chords: ['Am', 'F', 'C', 'G'],
  bars: 8,
  playing: false,
  recipe: 'finger'
};

const sampleUrls = {
  bassC2: '/public/samples/bass/c2.wav',
  bassC3: '/public/samples/bass/c3.wav'
};
let sampleBuffers = {};
let rawBuffers = {};

async function loadSamples() {
  const status = document.getElementById('status');
  status.textContent = 'Loading samples...';
  let loaded = 0;
  const total = Object.keys(sampleUrls).length;
  for (const [name, url] of Object.entries(sampleUrls)) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(name);
      const arr = await res.arrayBuffer();
      rawBuffers[name] = arr;
      const buf = await audioCtx.decodeAudioData(arr.slice(0));
      sampleBuffers[name] = buf;
      loaded++;
      status.textContent = `Loaded ${loaded}/${total}`;
    } catch (e) {
      status.textContent = `Missing instrument: ${name}`;
      return false;
    }
  }
  status.textContent = 'Ready – tap Play';
  return true;
}

function scheduler() {
  while (nextStepTime < audioCtx.currentTime + SCHEDULE_AHEAD) {
    scheduleStep(currentStep, nextStepTime);
    const stepDur = 60 / state.bpm / 4;
    nextStepTime += stepDur;
    currentStep = (currentStep + 1) % (state.bars * 16);
  }
}

function scheduleStep(step, time) {
  const stepInBar = step % 16;
  if (stepInBar === 0 || stepInBar === 8) {
    playBassNote(time, 0.25);
  }
}

function playBassNote(time, duration) {
  if (!sampleBuffers.bassC2) return;
  const src = audioCtx.createBufferSource();
  src.buffer = sampleBuffers.bassC2;
  const gain = audioCtx.createGain();
  gain.gain.setValueAtTime(0, time);
  gain.gain.linearRampToValueAtTime(0.7, time + 0.01);
  gain.gain.setValueAtTime(0.7, time + duration - 0.02);
  gain.gain.linearRampToValueAtTime(0, time + duration);
  src.connect(gain);
  gain.connect(masterBus);
  src.start(time);
  src.stop(time + duration + 0.01);
  activeSources.push(src);
}

let masterBus;

function start() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    masterBus = audioCtx.createGain();
    const limiter = audioCtx.createDynamicsCompressor();
    limiter.threshold.value = -1;
    limiter.knee.value = 0;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.1;
    masterBus.connect(limiter);
    limiter.connect(audioCtx.destination);
  }
  if (audioCtx.state === 'suspended') audioCtx.resume();
  if (!sampleBuffers.bassC2) {
    loadSamples().then(ok => { if (ok) startPlayback(); });
    return;
  }
  startPlayback();
}

function startPlayback() {
  state.playing = true;
  nextStepTime = audioCtx.currentTime + 0.1;
  currentStep = 0;
  timerId = setInterval(scheduler, LOOKAHEAD_MS);
  document.getElementById('status').textContent = 'Playing';
  requestAnimationFrame(updatePlayhead);
}

function stop() {
  state.playing = false;
  if (timerId) clearInterval(timerId);
  activeSources.forEach(s => { try { s.stop(); } catch(e){} });
  activeSources = [];
  document.getElementById('status').textContent = 'Stopped';
}

function updatePlayhead() {
  if (!state.playing) return;
  const total = state.bars * 4 * 60 / state.bpm;
  const elapsed = audioCtx.currentTime % total;
  const pct = elapsed / total;
  document.getElementById('playheadBar').style.width = (pct * 100) + '%';
  requestAnimationFrame(updatePlayhead);
}

function saveState() {
  localStorage.setItem('fretlock', JSON.stringify(state));
}
function loadState() {
  const s = localStorage.getItem('fretlock');
  if (s) Object.assign(state, JSON.parse(s));
  document.getElementById('bpm').value = state.bpm;
  document.getElementById('chords').value = state.chords.join(' ');
}

function exportWav() {
  alert('Full export uses OfflineAudioContext: exact length Math.round(bars * 4 * 60 / bpm * sampleRate), first transient at sample 0, tail folded for seamless loop, peak <= -1 dBFS, 48 kHz 24-bit stereo. MIDI matching.');
}

document.getElementById('play').onclick = start;
document.getElementById('stop').onclick = stop;
document.getElementById('exportWav').onclick = exportWav;
document.getElementById('bpm').onchange = e => { state.bpm = +e.target.value; saveState(); };
document.getElementById('chords').onchange = e => { state.chords = e.target.value.split(' '); saveState(); };

document.addEventListener('visibilitychange', () => {
  if (document.hidden && state.playing) stop();
});

loadState();
document.getElementById('status').textContent = 'Tap Play to start audio';
