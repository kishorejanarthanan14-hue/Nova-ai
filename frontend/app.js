(() => {
  if (window.__NOVA_APP_LOADED && document.readyState === 'complete') {
    console.warn('NOVA app already initialized; re-binding UI handlers for this page instance.');
  }
  window.__NOVA_APP_LOADED = true;

const API_BASE = 'http://127.0.0.1:8000';

const state = {
  token: localStorage.getItem('nova_token') || '',
  user: null,
  activeSessionId: null,
  sessionList: [],
  selectedModel: localStorage.getItem('nova_model') || 'mock-local',
  speakOn: localStorage.getItem('nova_speak') === '1',
  busy: false,
  mode: '',
  tasks: [],
};

const $ = (id) => document.getElementById(id);

function setAuthVisibility() {
  const loggedIn = Boolean(state.token);
  const authView = $('#auth-view');
  const dashboardView = $('#dashboard-view');

  if (!authView || !dashboardView) return;

  authView.classList.toggle('hidden', loggedIn);
  dashboardView.classList.toggle('hidden', !loggedIn);
}

function showAlert(message, isError = false) {
  const toast = document.createElement('div');
  toast.textContent = message;
  toast.style.position = 'fixed';
  toast.style.bottom = '24px';
  toast.style.right = '24px';
  toast.style.background = isError ? '#7a1f1f' : '#0f3d70';
  toast.style.color = '#fff';
  toast.style.padding = '12px 18px';
  toast.style.borderRadius = '12px';
  toast.style.zIndex = '9999';
  toast.style.border = '1px solid rgba(255,255,255,0.2)';
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 2500);
}

async function apiFetch(path, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };

  if (state.token) {
    headers.Authorization = `Bearer ${state.token}`;
  }

  const response = await fetch(`${API_BASE}${path}`, { ...options, headers });
  const contentType = response.headers.get('content-type') || '';
  const payload = contentType.includes('application/json') ? await response.json() : await response.text();

  if (!response.ok) {
    const errorMessage = typeof payload === 'string' ? payload : payload.detail || 'Request failed';
    throw new Error(errorMessage);
  }

  return payload;
}

function nameUI() {
  const name = state.user?.name || 'NOVA';
  ['nm', 'nm2'].forEach((id) => {
    const el = $(id);
    if (el) el.textContent = name.toUpperCase();
  });
  const inputEl = $('in');
  if (inputEl) inputEl.placeholder = `Give ${name} a command...`;
}

function esc(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function fmt(s) {
  return esc(s)
    .replace(/\*\*(.+?)\*\*/g, "<b style='display:inline;color:#fff;font-size:inherit;letter-spacing:0'>$1</b>")
    .replace(/`(.+?)`/g, '<code>$1</code>')
    .replace(/\n/g, '<br>');
}

function tm() {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function addMessage(role, text) {
  const msgs = $('msgs');
  if (!msgs) return null;

  const d = document.createElement('div');
  d.className = 'm ' + (role === 'user' ? 'u' : '');
  d.innerHTML = (role === 'user' ? '' : "<div class='orb'></div>") + "<div class='bub'><b>" + (role === 'user' ? 'YOU' : (state.user?.name || 'NOVA').toUpperCase()) + "</b><div class='tx'>" + fmt(text) + "</div><small>" + tm() + "</small></div>";
  msgs.appendChild(d);
  msgs.scrollTop = 1e9;
  return d;
}

function stateText(s) {
  const map = {
    ready: ['READY.', 'STANDBY'],
    listen: ['LISTENING...', 'LISTENING'],
    think: ['ANALYZING...', 'PROCESSING'],
    speak: ['RESPONDING...', 'SPEAKING'],
  };
  const st = $('st');
  const wl = $('wl');
  const wv = $('wv');
  if (st) st.textContent = map[s][0];
  if (wl) wl.textContent = map[s][1];
  if (wv) wv.className = 'wv' + (s === 'ready' ? '' : ' go');
}

function status() {
  const s1 = $('s1');
  const onl = $('onl');
  const s2 = $('s2');
  const s3 = $('s3');
  const spk = $('spk');

  if (s1) {
    s1.textContent = 'ONLINE';
    s1.className = 'ok';
  }
  if (onl) {
    onl.textContent = 'ONLINE';
    onl.className = 'on';
  }

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (s2) {
    s2.textContent = SpeechRecognition ? 'READY' : 'UNSUPPORTED';
    s2.className = SpeechRecognition ? 'ok' : 'bad';
  }
  if (s3) {
    s3.textContent = state.speakOn ? 'ON' : 'OFF';
    s3.className = state.speakOn ? 'ok' : 'sb';
  }
  if (spk) spk.className = 'sp' + (state.speakOn ? ' on2' : '');
}

function mem() {
  const p = Math.min(100, 20 + Math.round((state.sessionList.length || 0) * 12));
  const mp = $('mp');
  const mb = $('mb');
  if (mp) mp.textContent = p + '%';
  if (mb) mb.style.width = p + '%';
}

function show(p, t) {
  document.querySelectorAll('.pn').forEach((x) => {
    x.className = 'pn' + (x.id === 'p-' + p ? ' show' : '');
  });
  document.querySelectorAll('.nav').forEach((n) => {
    n.classList.toggle('act', n.dataset.p === p && (p !== 'soon' || n.dataset.t === t));
  });
  const sn = $('sn');
  if (p === 'soon' && sn) sn.textContent = t;
}

function drawTasks() {
  const tasks = state.tasks || [];
  const tasksList = $('tl');
  if (!tasksList) return;
  tasksList.innerHTML = tasks.length ? tasks.map((t) => `
    <div class='task${t.completed ? ' d' : ''}'>
      <button data-c='${t.id}'>${t.completed ? '☑' : '☐'}</button>
      <span>${esc(t.title)}</span>
      <button data-x='${t.id}'>✕</button>
    </div>
  `).join('') : "<p style='color:var(--m);padding:14px'>No tasks yet.</p>";
}

async function loadCurrentUser() {
  try {
    state.user = await apiFetch('/me');
    nameUI();
    await loadPreferences();
    await loadSessions();
    await loadTasks();
  } catch (err) {
    console.error(err);
    logout();
  }
}

async function loadPreferences() {
  try {
    const prefs = await apiFetch('/preferences');
    if (prefs.preferred_model) {
      state.selectedModel = prefs.preferred_model;
      $('model-select').value = prefs.preferred_model;
    }
    if (prefs.theme) {
      document.body.dataset.theme = prefs.theme;
    }
    if (prefs.voice_enabled !== undefined) {
      state.speakOn = prefs.voice_enabled;
      localStorage.setItem('nova_speak', state.speakOn ? '1' : '0');
    }
    status();
  } catch (err) {
    console.warn('preferences unavailable', err);
  }
}

async function loadSessions() {
  try {
    const sessions = await apiFetch('/sessions');
    state.sessionList = sessions;
    if (!state.activeSessionId && sessions.length) {
      state.activeSessionId = sessions[0].id;
      await loadMessagesForSession(state.activeSessionId);
    }
    mem();
  } catch (err) {
    console.error('loadSessions err', err);
  }
}

async function loadMessagesForSession(sessionId) {
  try {
    const messages = await apiFetch(`/sessions/${sessionId}/messages`);
    $('msgs').innerHTML = '';
    for (const m of messages) {
      addMessage(m.role, m.content);
    }
    if (!messages.length) {
      addMessage('assistant', 'Systems online. Ask me anything.');
    }
  } catch (err) {
    console.error('loadMessagesForSession err', err);
  }
}

async function createSessionIfNeeded() {
  if (!state.activeSessionId) {
    const created = await apiFetch('/sessions', {
      method: 'POST',
      body: JSON.stringify({ title: 'New conversation' }),
    });
    state.activeSessionId = created.id;
    state.sessionList.unshift(created);
    addMessage('assistant', 'A new conversation is ready.');
  }
}

async function loadTasks() {
  try {
    const tasks = await apiFetch('/tasks');
    state.tasks = tasks;
    drawTasks();
  } catch (err) {
    console.error('loadTasks err', err);
  }
}

async function send(text) {
  const cleaned = (text || '').trim();
  if (!cleaned || state.busy) return;
  await createSessionIfNeeded();
  state.busy = true;
  $('in').value = '';
  addMessage('user', cleaned);
  stateText('think');

  const thinking = addMessage('assistant', '');
  thinking.querySelector('.tx').innerHTML = "<span class='dots'><span></span><span></span><span></span></span>";

  try {
    const payload = await apiFetch('/chat/complete', {
      method: 'POST',
      body: JSON.stringify({
        message: cleaned,
        session_id: state.activeSessionId,
        model: state.selectedModel,
      }),
    });

    thinking.querySelector('.tx').innerHTML = fmt(payload.reply);
    if (state.speakOn && 'speechSynthesis' in window) {
      const utterance = new SpeechSynthesisUtterance(payload.reply.replace(/[*`#]/g, ''));
      speechSynthesis.cancel();
      speechSynthesis.speak(utterance);
    }
    await loadSessions();
    stateText('ready');
  } catch (err) {
    thinking.querySelector('.tx').innerHTML = fmt('Connection problem: ' + err.message);
    stateText('ready');
    showAlert(err.message, true);
  } finally {
    state.busy = false;
  }
}

async function registerUser(event) {
  event.preventDefault();
  const payload = {
    name: $('#register-name').value.trim(),
    email: $('#register-email').value.trim(),
    password: $('#register-password').value,
  };

  try {
    const result = await apiFetch('/auth/register', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    showAlert('Account created. Please log in.');
    $('#register-form').reset();
    document.querySelectorAll('.tab').forEach((tab) => tab.classList.toggle('active', tab.dataset.authTab === 'login'));
    document.querySelectorAll('.auth-form').forEach((form) => form.classList.toggle('active', form.id === 'login-form'));
  } catch (err) {
    showAlert(err.message, true);
  }
}

async function loginUser(event) {
  event.preventDefault();
  const email = $('#login-email').value.trim();
  const password = $('#login-password').value;

  try {
    const form = new URLSearchParams();
    form.append('username', email);
    form.append('password', password);

    const tokenData = await apiFetch('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
    });

    state.token = tokenData.access_token;
    localStorage.setItem('nova_token', state.token);
    setAuthVisibility();
    await loadCurrentUser();
    $('#login-form').reset();
    stateText('ready');
    showAlert('Logged in successfully');
  } catch (err) {
    showAlert(err.message, true);
  }
}

function logout() {
  state.token = '';
  localStorage.removeItem('nova_token');
  state.user = null;
  state.activeSessionId = null;
  state.sessionList = [];
  state.tasks = [];
  $('msgs').innerHTML = '';
  setAuthVisibility();
}

async function saveSettings() {
  try {
    const name = $('#nmi').value.trim() || 'NOVA';
    const model = $('model-select').value || 'mock-local';
    state.selectedModel = model;
    localStorage.setItem('nova_model', model);

    await apiFetch('/preferences', {
      method: 'PATCH',
      body: JSON.stringify({ preferred_model: model, voice_enabled: state.speakOn }),
    });

    if (state.user) {
      const updatedName = state.user.name;
      if (updatedName !== name) {
        // handled at backend only via profile if needed; not required now
      }
    }

    showAlert('Settings saved');
    show('chat');
  } catch (err) {
    showAlert(err.message, true);
  }
}

async function clearMemory() {
  try {
    $('msgs').innerHTML = '';
    if (state.activeSessionId) {
      const session = await apiFetch(`/sessions/${state.activeSessionId}/messages`);
      // no backend delete endpoint yet; UI only clears current display
      if (session.length) {
        addMessage('assistant', 'Conversation cleared on this device. Start a fresh session.');
      }
    }
    show('chat');
  } catch (err) {
    showAlert(err.message, true);
  }
}

async function addTask(title) {
  const taskTitle = (title || '').trim();
  if (!taskTitle) return;
  try {
    const task = await apiFetch('/tasks', {
      method: 'POST',
      body: JSON.stringify({ title: taskTitle }),
    });
    state.tasks.unshift(task);
    drawTasks();
  } catch (err) {
    showAlert(err.message, true);
  }
}

async function toggleTask(taskId) {
  const task = state.tasks.find((item) => item.id === Number(taskId));
  if (!task) return;
  try {
    const updated = await apiFetch(`/tasks/${taskId}`, {
      method: 'PATCH',
      body: JSON.stringify({ completed: !task.completed }),
    });
    const index = state.tasks.findIndex((item) => item.id === Number(taskId));
    state.tasks[index] = updated;
    drawTasks();
  } catch (err) {
    showAlert(err.message, true);
  }
}

async function removeTask(taskId) {
  try {
    await apiFetch(`/tasks/${taskId}`, { method: 'DELETE' });
    state.tasks = state.tasks.filter((item) => item.id !== Number(taskId));
    drawTasks();
  } catch (err) {
    showAlert(err.message, true);
  }
}

function bindUi() {
  const loginForm = $('#login-form');
  const registerForm = $('#register-form');
  const sendBtn = $('#snd');
  const inputEl = $('#in');
  const speakerBtn = $('#spk');
  const gearBtn = $('gear');
  const logoutBtn = $('#logout-btn');
  const saveBtn = $('#save');
  const clearBtn = $('#clr');
  const tasksInput = $('#ti');
  const tasksList = $('#tl');

  if (loginForm) {
    loginForm.addEventListener('submit', loginUser);
    loginForm.onsubmit = loginUser;
    window.novaLogin = loginUser;
  }
  if (registerForm) {
    registerForm.addEventListener('submit', registerUser);
    registerForm.onsubmit = registerUser;
    window.novaRegister = registerUser;
  }
  if (sendBtn && inputEl) sendBtn.addEventListener('click', () => send(inputEl.value));
  if (inputEl) inputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') send(inputEl.value);
  });

  document.querySelectorAll('.tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      const target = tab.dataset.authTab;
      document.querySelectorAll('.tab').forEach((item) => item.classList.toggle('active', item === tab));
      document.querySelectorAll('.auth-form').forEach((form) => {
        form.classList.toggle('active', form.id === `${target}-form`);
      });
    });
  });

  document.querySelectorAll('.qc').forEach((button) => {
    button.addEventListener('click', () => {
      show('chat');
      send(button.dataset.q);
    });
  });

  if (speakerBtn) speakerBtn.addEventListener('click', () => {
    state.speakOn = !state.speakOn;
    localStorage.setItem('nova_speak', state.speakOn ? '1' : '0');
    status();
  });

  if (gearBtn) gearBtn.addEventListener('click', () => show('settings'));
  if (logoutBtn) logoutBtn.addEventListener('click', logout);
  if (saveBtn) saveBtn.addEventListener('click', saveSettings);
  if (clearBtn) clearBtn.addEventListener('click', clearMemory);

  if (tasksInput) tasksInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && tasksInput.value.trim()) {
      addTask(tasksInput.value);
      tasksInput.value = '';
    }
  });

  if (tasksList) tasksList.addEventListener('click', (e) => {
    const target = e.target;
    if (!target.dataset) return;
    if (target.dataset.c) toggleTask(target.dataset.c);
    if (target.dataset.x) removeTask(target.dataset.x);
  });

  document.querySelectorAll('.nav').forEach((n) => {
    n.addEventListener('click', () => show(n.dataset.p, n.dataset.t));
  });

  const chipSet = $('chips');
  if (chipSet) {
    ['Productivity', 'Coding', 'Research', 'Creative', 'Web', 'System'].forEach((c) => {
      const b = document.createElement('button');
      b.className = 'chip';
      b.textContent = c;
      b.addEventListener('click', () => {
        const active = b.classList.contains('act');
        document.querySelectorAll('.chip').forEach((x) => x.classList.remove('act'));
        state.mode = active ? '' : c.toLowerCase();
        if (!active) b.classList.add('act');
      });
      chipSet.appendChild(b);
    });
  }

  const visualizer = $('wv');
  if (visualizer && visualizer.firstChild) {
    for (let i = 0; i < 26; i++) {
      const w = document.createElement('i');
      w.style.animationDelay = (i * 0.07) + 's';
      visualizer.firstChild.appendChild(w);
    }
  }

  function clock() {
    const n = new Date();
    const clockEl = $('clk');
    const dateEl = $('dt');
    if (clockEl) clockEl.textContent = n.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
    if (dateEl) dateEl.textContent = n.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  }
  clock();
  setInterval(clock, 10000);

  const cv = $('globe');
  if (cv) {
    const cx = cv.getContext('2d');
    const pts = [];
    const N = 700;
    let rot = 0;
    for (let k = 0; k < N; k++) {
      const y = 1 - 2 * (k + 0.5) / N;
      const r = Math.sqrt(1 - y * y);
      const a = k * 2.399963;
      pts.push([Math.cos(a) * r, y, Math.sin(a) * r]);
    }
    function globe() {
      cx.clearRect(0, 0, 420, 420);
      rot += 0.004;
      const R = 150;
      const c = 210;
      cx.strokeStyle = '#27a8ff55';
      cx.lineWidth = 1.2;
      cx.beginPath();
      cx.ellipse(c, c, R + 30, R * 0.35, -0.4, 0, 7);
      cx.stroke();
      pts.forEach((p) => {
        const x = p[0] * Math.cos(rot) + p[2] * Math.sin(rot);
        const z = -p[0] * Math.sin(rot) + p[2] * Math.cos(rot);
        cx.fillStyle = 'rgba(86,212,255,' + (0.15 + 0.7 * (z + 1) / 2) + ')';
        cx.fillRect(c + x * R, c + p[1] * R, 1.8, 1.8);
      });
      requestAnimationFrame(globe);
    }
    globe();
  }
}

async function init() {
  bindUi();
  setAuthVisibility();
  status();
  mem();
  if (state.token) {
    await loadCurrentUser();
  } else {
    setAuthVisibility();
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

})();
