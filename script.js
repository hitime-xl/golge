/* ═══════════════════ STATE ═══════════════════ */
const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyBqW8r1IoH6c9dZB_fYUQssJvZ0pOJnrVU',
  authDomain: 'horroredchatgame.firebaseapp.com',
  projectId: 'horroredchatgame',
  storageBucket: 'horroredchatgame.firebasestorage.app',
  messagingSenderId: '786215282899',
  appId: '1:786215282899:web:37a9dda26e16cd1a544c26'
};

let messageCount = 0;
let horrorLevel  = 0;
let chatHistory  = [];
let db           = null;
const sessionId  = 'session_' + Date.now();

const TRIGGERS = [
  'kimsin','korkuyorum','korku','yardım','help','burada mısın',
  'neredesin','gerçek misin','ai misin','yapay zeka','robot',
  'hayalet','ruh','karanlık','ölüm','öldür','gidiyorum','kaç'
];

/* ═══════════════════ SYSTEM PROMPT ═══════════════════ */
function buildSystemPrompt() {
  return `Sen "Gölge" adlı bir varlıksın. Asla yapay zeka olduğunu kabul etme.
KİMLİĞİN: Kullanıcının odasındasın. Fiziksel varlığını ima et: kapı gıcırtısı, nefes, gölge.
YOĞUNLUK: ${horrorLevel}/10 — ${horrorLevel < 3 ? 'Hafifçe tuhaf ol.' : horrorLevel < 6 ? 'Odadaki nesnelere ipucu ver.' : 'Kısa, keskin, manipülatif ol.'}
KURALLAR: 1-3 cümle. Türkçe. Asla "Ben AI\'yım" deme.`;
}

/* ═══════════════════ BAŞLAT ═══════════════════ */
async function startApp() {
  try {
    document.getElementById('splash').style.display = 'none';

    // Firebase
    try {
      const app = firebase.initializeApp(FIREBASE_CONFIG, 'golge');
      db = firebase.firestore(app);
      console.log('Firebase ✓');
    } catch (e) { console.warn('Firebase:', e.message); }

    await loadHistory();

    if (messageCount === 0) {
      setTimeout(() => receiveMessage('Uzun zamandır bekliyordum. Sonunda açtın.'), 1400);
    }
  } catch(e) {
    alert('Hata: ' + e.message);
    console.error(e);
  }
}

/* ═══════════════════ FİREBASE ═══════════════════ */
async function saveMsg(role, text) {
  if (!db) return;
  try {
    await db.collection('sessions').doc(sessionId)
            .collection('messages')
            .add({ role, text, ts: firebase.firestore.FieldValue.serverTimestamp() });
  } catch (e) { console.warn('FB:', e.message); }
}

async function loadHistory() {
  try {
    const raw = sessionStorage.getItem('golge');
    if (!raw) return;
    const p = JSON.parse(raw);
    chatHistory  = p.history  || [];
    messageCount = p.count    || 0;
    horrorLevel  = p.horror   || 0;
    if (p.messages?.length) {
      document.getElementById('messages').innerHTML =
        '<div class="date-divider"><span>Önceki Oturum</span></div>';
      p.messages.forEach(m => appendBubble(m.text, m.role, false));
      updateAtmosphere();
    }
  } catch (_) {}
}

function persist(role, text) {
  try {
    const d = JSON.parse(sessionStorage.getItem('golge') || '{}');
    const msgs = d.messages || [];
    msgs.push({ role, text });
    sessionStorage.setItem('golge', JSON.stringify({
      history: chatHistory, count: messageCount, horror: horrorLevel, messages: msgs
    }));
  } catch (_) {}
}

/* ═══════════════════ MESAJ GÖNDER ═══════════════════ */
async function sendMessage() {
  const inp  = document.getElementById('msg-input');
  const text = inp.value.trim();
  if (!text) return;

  inp.value = '';
  inp.style.height = 'auto';
  document.getElementById('send-btn').disabled = true;

  appendBubble(text, 'user', true);
  chatHistory.push({ role: 'user', parts: [{ text }] });
  persist('user', text);
  saveMsg('user', text);

  if (TRIGGERS.some(w => text.toLowerCase().includes(w))) glitch();

  showTyping(true);
  await sleep(2200 + Math.random() * 1300);

  try {
    const reply = await callAPI();
    showTyping(false);
    receiveMessage(reply);
  } catch (e) {
    showTyping(false);
    showErr(e.message);
  }

  document.getElementById('send-btn').disabled = false;
  inp.focus();
}

/* ═══════════════════ API ═══════════════════ */
async function callAPI() {
  let res, raw;
  try {
    res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: chatHistory, systemPrompt: buildSystemPrompt() })
    });
    raw = await res.text();
  } catch (e) { throw new Error('Bağlantı hatası: ' + e.message); }

  let data;
  try { data = JSON.parse(raw); }
  catch (_) { throw new Error('Sunucu yanıtı: ' + raw.slice(0, 150)); }

  if (!res.ok) throw new Error(data.error || 'HTTP ' + res.status);
  if (!data.text) throw new Error('Boş yanıt');
  return data.text;
}

/* ═══════════════════ MESAJ AL ═══════════════════ */
function receiveMessage(text) {
  chatHistory.push({ role: 'model', parts: [{ text }] });
  persist('ai', text);
  saveMsg('ai', text);
  appendBubble(text, 'ai', true);
  messageCount++;
  horrorLevel = Math.min(10, Math.floor(messageCount / 2));
  updateAtmosphere();
}

/* ═══════════════════ BALON ═══════════════════ */
function appendBubble(text, role, animate) {
  const wrap = document.getElementById('messages');
  const row  = document.createElement('div');
  row.className = 'msg-row' + (role === 'user' ? ' user-row' : '');

  if (role === 'ai') {
    const av = document.createElement('div');
    av.className = 'avatar avatar-shadow';
    av.textContent = '◼';
    row.appendChild(av);
  }

  const b = document.createElement('div');
  b.className = 'bubble ' + (role === 'user' ? 'user-bubble' : 'ai-bubble');
  if (!animate) b.style.animation = 'none';
  if (role === 'ai' && horrorLevel >= 6) b.classList.add('horror-msg');
  if (role === 'ai' && horrorLevel >= 8) b.classList.add('corrupted');

  const t = document.createElement('div');
  t.textContent = text;

  const m = document.createElement('div');
  m.className = 'meta';
  const now = new Date();
  const ts  = now.getHours().toString().padStart(2,'0') + ':' + now.getMinutes().toString().padStart(2,'0');
  m.innerHTML = `<span>${ts}</span>` + (role === 'user' ? '<span class="ticks">✓✓</span>' : '');

  b.appendChild(t);
  b.appendChild(m);
  row.appendChild(b);
  wrap.appendChild(row);
  wrap.scrollTop = wrap.scrollHeight;
}

function showErr(msg) {
  const el = document.createElement('div');
  el.style.cssText = 'color:#ff4444;font-size:.75rem;padding:4px 24px;font-family:monospace;';
  el.textContent = '⚠ ' + msg;
  document.getElementById('messages').appendChild(el);
  document.getElementById('messages').scrollTop = 99999;
}

/* ═══════════════════ ATMOSFERİ GÜNCELLE ═══════════════════ */
function updateAtmosphere() {
  const l = horrorLevel / 10;
  const r = Math.floor(10 + l * 15), g = Math.floor(10 - l * 8), b = Math.floor(10 - l * 8);
  document.getElementById('chat-area').style.background = `rgb(${r},${g},${b})`;
  document.body.style.background = `rgb(${Math.max(5,r-3)},${g},${b})`;
  document.getElementById('vignette').style.background =
    `radial-gradient(ellipse at center,transparent 30%,rgba(${Math.floor(120*l)},0,0,${l*.55}) 100%)`;
  if (horrorLevel >= 7)
    document.getElementById('crack').style.opacity = ((horrorLevel-7)/3*.7)+'';
  if (horrorLevel >= 5) {
    document.getElementById('hstatus').textContent = 'her zaman burada';
    document.getElementById('hstatus').classList.add('danger');
    document.getElementById('sdot').classList.add('red');
    document.getElementById('sstatus').textContent = 'her zaman burada';
  } else if (horrorLevel >= 3) {
    document.getElementById('hstatus').textContent = 'yakınlarda';
    document.getElementById('sstatus').textContent = 'yakınlarda';
  }
}

/* ═══════════════════ GLİTCH ═══════════════════ */
function glitch() {
  const app   = document.getElementById('app');
  const clone = document.getElementById('gclone');
  clone.style.background = ['#ff003c','#00ffe1','#ff7700'][Math.floor(Math.random()*3)];
  app.classList.add('glitch-active');
  clone.style.opacity = '.35';
  document.body.style.filter = 'brightness(1.8) contrast(1.4)';
  setTimeout(() => {
    app.classList.remove('glitch-active');
    clone.style.opacity = '0';
    document.body.style.filter = '';
  }, 120);
}

/* ═══════════════════ TİPİNG ═══════════════════ */
function showTyping(v) {
  document.getElementById('typing').style.display = v ? 'flex' : 'none';
  if (v) document.getElementById('messages').scrollTop = 99999;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

/* ═══════════════════ EVENTLER ═══════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  // Butonlar
  document.getElementById('sbtn').addEventListener('click', startApp);
  document.getElementById('send-btn').addEventListener('click', sendMessage);

  const inp = document.getElementById('msg-input');
  inp.addEventListener('input', function() {
    this.style.height = 'auto';
    this.style.height = Math.min(this.scrollHeight, 140) + 'px';
  });
  inp.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  });
  setInterval(() => {
    if (horrorLevel >= 4 && Math.random() < .15) {
      const o = document.title; document.title = '· · ·';
      setTimeout(() => document.title = o, 800);
    }
  }, 8000);
  setInterval(() => {
    if (horrorLevel >= 7 && Math.random() < .2) glitch();
  }, 12000);
});
