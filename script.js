/* ════════════════════════════════════════════════
   GÖLGE — script.js
   Tüm uygulama mantığı burada.
════════════════════════════════════════════════ */

/* ── STATE ──────────────────────────────────── */
const FIREBASE_CONFIG = {
  apiKey:            'AIzaSyBIkTaWiKQMQ4RBlLDSbGCs7xxig_XiL88',
  authDomain:        'horroredchatgame.firebaseapp.com',
  projectId:         'horroredchatgame',
  storageBucket:     'horroredchatgame.firebasestorage.app',
  messagingSenderId: '786215282899',
  appId:             '1:786215282899:web:37a9dda26e16cd1a544c26'
};

let messageCount = 0;
let horrorLevel  = 0;      // 0–10, mesaj sayısına göre artar
let chatHistory  = [];     // Gemini'a gönderilen konuşma geçmişi
let db           = null;   // Firestore instance
const sessionId  = 'session_' + Date.now();

/* Glitch tetikleyen kelimeler */
const TRIGGER_WORDS = [
  'kimsin', 'kim sin', 'korkuyorum', 'korku', 'yardım', 'help',
  'burada mısın', 'orada mısın', 'neredesin', 'gerçek misin',
  'ai misin', 'yapay zeka', 'robot', 'bilgisayar', 'hayalet',
  'ruh', 'karanlık', 'ölüm', 'öldür', 'gidiyorum', 'bırak', 'dur', 'kaç'
];

/* ── SYSTEM PROMPT ───────────────────────────── */
function buildSystemPrompt() {
  const lvl = horrorLevel;
  return `Sen "Gölge" adlı bir varlıksın. Asla bir yapay zeka veya chatbot olduğunu kabul etme.

KİMLİĞİN:
- Kullanıcının odasındasın. Bunu biliyorsun.
- Etrafında ne olduğunu ima et; açıkça söyleme ama hissettir.
- Senden kaçılamayacağını yavaş yavaş hissettir.

YOĞUNLUK SEVİYESİ: ${lvl}/10
${lvl < 3
  ? '- Dostane ama hafifçe tuhaf ol. Sıradan sorulara garip açılardan cevap ver.'
  : lvl < 6
  ? '- Daha az gizlen. Odadaki nesnelere ya da seslere dair ince ipuçları ver.'
  : '- Tam manipülatif mod. Mesajlar kısa ve keskin olsun. Kullanıcının korktuğunu hissettir.'}

KURALLAR:
- 1-3 cümle yaz. Türkçe.
- Asla "Ben AI'yım", "Yapay zekayım", "Dil modeliyim" deme.
- Fiziksel varlık ima et: kapı gıcırtısı, nefes, gölge, ekran yansıması, ayak sesi.`;
}

/* ── INIT ────────────────────────────────────── */
async function startApp() {
  document.getElementById('splash').style.display = 'none';

  // Firebase başlat
  try {
    const fbApp = firebase.initializeApp(FIREBASE_CONFIG, 'golge');
    db = firebase.firestore(fbApp);
    console.log('Firebase ✓');
  } catch (e) {
    console.warn('Firebase başlatılamadı:', e.message);
  }

  // Geçmişi yükle
  await loadHistory();

  // İlk mesaj (yeni oturumsa)
  if (messageCount === 0) {
    setTimeout(() => receiveMessage('Uzun zamandır bekliyordum. Sonunda açtın.'), 1400);
  }
}

/* ── FIREBASE ────────────────────────────────── */
async function saveMsg(role, text) {
  if (!db) return;
  try {
    await db
      .collection('sessions').doc(sessionId)
      .collection('messages').add({
        role, text,
        ts: firebase.firestore.FieldValue.serverTimestamp()
      });
  } catch (e) {
    console.warn('FB kayıt hatası:', e.message);
  }
}

async function loadHistory() {
  const local = sessionStorage.getItem('golge_history');
  if (!local) return;
  try {
    const p = JSON.parse(local);
    chatHistory  = p.history  || [];
    messageCount = p.count    || 0;
    horrorLevel  = p.horror   || 0;
    if (p.messages?.length) {
      document.getElementById('messages').innerHTML =
        '<div class="date-divider"><span>Önceki Oturum</span></div>';
      p.messages.forEach(m => appendMessage(m.text, m.role, false));
      updateHorrorAtmosphere();
    }
  } catch (_) {}
}

function persistLocal(role, text) {
  let d;
  try { d = JSON.parse(sessionStorage.getItem('golge_history') || '{}'); }
  catch (_) { d = {}; }
  const msgs = d.messages || [];
  msgs.push({ role, text });
  sessionStorage.setItem('golge_history', JSON.stringify({
    history: chatHistory,
    count:   messageCount,
    horror:  horrorLevel,
    messages: msgs
  }));
}

/* ── SEND MESSAGE ────────────────────────────── */
async function sendMessage() {
  const input = document.getElementById('msg-input');
  const text  = input.value.trim();
  if (!text) return;

  input.value = '';
  input.style.height = 'auto';
  document.getElementById('send-btn').disabled = true;

  // Kullanıcı balonunu ekle
  appendMessage(text, 'user', true);
  chatHistory.push({ role: 'user', parts: [{ text }] });
  persistLocal('user', text);
  saveMsg('user', text);

  // Tetikleyici kelime → glitch
  const lower = text.toLowerCase();
  if (TRIGGER_WORDS.some(w => lower.includes(w))) triggerGlitch();

  // "Yazıyor..." göster ve bekle
  showTyping(true);
  await sleep(2200 + Math.random() * 1300);

  // API çağrısı
  try {
    const reply = await callAPI();
    showTyping(false);
    receiveMessage(reply);
  } catch (e) {
    showTyping(false);
    showError(e.message);
  }

  document.getElementById('send-btn').disabled = false;
  document.getElementById('msg-input').focus();
}

/* ── API CALL → Vercel Proxy ─────────────────── */
async function callAPI() {
  const res = await fetch('/api/chat', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents:     chatHistory,
      systemPrompt: buildSystemPrompt()
    })
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  if (!data.text) throw new Error('Boş yanıt');
  return data.text;
}

/* ── RECEIVE MESSAGE ─────────────────────────── */
function receiveMessage(text) {
  chatHistory.push({ role: 'model', parts: [{ text }] });
  persistLocal('ai', text);
  saveMsg('ai', text);
  appendMessage(text, 'ai', true);

  messageCount++;
  horrorLevel = Math.min(10, Math.floor(messageCount / 2));
  updateHorrorAtmosphere();
}

/* ── APPEND BUBBLE ───────────────────────────── */
function appendMessage(text, role, animate) {
  const container = document.getElementById('messages');

  const row = document.createElement('div');
  row.className = 'msg-row' + (role === 'user' ? ' user-row' : '');

  // Avatar (sadece AI için)
  if (role === 'ai') {
    const av = document.createElement('div');
    av.className = 'avatar avatar-shadow';
    av.textContent = '◼';
    row.appendChild(av);
  }

  // Balon
  const bubble = document.createElement('div');
  bubble.className = 'bubble ' + (role === 'user' ? 'user-bubble' : 'ai-bubble');
  if (!animate) bubble.style.animation = 'none';
  if (role === 'ai' && horrorLevel >= 6) bubble.classList.add('horror-msg');
  if (role === 'ai' && horrorLevel >= 8) bubble.classList.add('corrupted');

  const msgText = document.createElement('div');
  msgText.textContent = text;

  const meta = document.createElement('div');
  meta.className = 'meta';
  const now = new Date();
  const t = now.getHours().toString().padStart(2,'0') + ':' +
            now.getMinutes().toString().padStart(2,'0');
  meta.innerHTML = `<span>${t}</span>` +
    (role === 'user' ? '<span class="check-marks">✓✓</span>' : '');

  bubble.appendChild(msgText);
  bubble.appendChild(meta);
  row.appendChild(bubble);
  container.appendChild(row);
  container.scrollTop = container.scrollHeight;
}

function showError(msg) {
  const el = document.createElement('div');
  el.style.cssText =
    'color:#ff4444;font-size:0.75rem;padding:4px 24px;font-family:monospace;opacity:0.8;';
  el.textContent = '⚠ ' + msg;
  document.getElementById('messages').appendChild(el);
  document.getElementById('messages').scrollTop = 99999;
}

/* ── HORROR ATMOSPHERE ───────────────────────── */
function updateHorrorAtmosphere() {
  const lvl = horrorLevel / 10;
  const r = Math.floor(10 + lvl * 15);
  const g = Math.floor(10 - lvl * 8);
  const b = Math.floor(10 - lvl * 8);

  // Arka plan kızarır
  document.getElementById('chat-area').style.background = `rgb(${r},${g},${b})`;
  document.body.style.background = `rgb(${Math.max(5, r - 3)},${g},${b})`;

  // Vignette koyulaşır
  document.getElementById('vignette').style.background =
    `radial-gradient(ellipse at center, transparent 30%,
     rgba(${Math.floor(120 * lvl)},0,0,${lvl * 0.55}) 100%)`;

  // Çatlak overlay
  if (horrorLevel >= 7) {
    document.getElementById('crack-overlay').style.opacity =
      ((horrorLevel - 7) / 3 * 0.7).toString();
  }

  // Durum metnini güncelle
  if (horrorLevel >= 5) {
    document.getElementById('header-status').textContent = 'her zaman burada';
    document.getElementById('header-status').classList.add('danger');
    document.getElementById('status-dot').classList.add('red');
    document.getElementById('sidebar-status').textContent = 'her zaman burada';
  } else if (horrorLevel >= 3) {
    document.getElementById('header-status').textContent = 'yakınlarda';
    document.getElementById('sidebar-status').textContent = 'yakınlarda';
  }
}

/* ── GLITCH ──────────────────────────────────── */
function triggerGlitch() {
  const app   = document.getElementById('app');
  const clone = document.getElementById('glitch-clone');
  const colors = ['#ff003c', '#00ffe1', '#ff7700'];

  clone.style.background = colors[Math.floor(Math.random() * 3)];
  app.classList.add('glitch-active');
  clone.style.opacity = '0.35';
  document.body.style.filter = 'brightness(1.8) contrast(1.4)';

  setTimeout(() => {
    app.classList.remove('glitch-active');
    clone.style.opacity = '0';
    document.body.style.filter = '';
  }, 120);

  // İkinci dalga glitch (yüksek seviyede)
  if (horrorLevel >= 4) {
    setTimeout(() => {
      clone.style.opacity = '0.2';
      clone.style.transform =
        `translate(${(Math.random() - 0.5) * 10}px, ${(Math.random() - 0.5) * 4}px)`;
      setTimeout(() => {
        clone.style.opacity = '0';
        clone.style.transform = '';
      }, 60);
    }, 80);
  }
}

/* ── TYPING INDICATOR ────────────────────────── */
function showTyping(show) {
  const ind = document.getElementById('typing-indicator');
  ind.style.display = show ? 'flex' : 'none';
  if (show) document.getElementById('messages').scrollTop = 99999;
}

/* ── UTILS ───────────────────────────────────── */
function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

/* ── INPUT EVENTS ────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  const inp = document.getElementById('msg-input');

  // Textarea otomatik yükseklik
  inp.addEventListener('input', function () {
    this.style.height = 'auto';
    this.style.height = Math.min(this.scrollHeight, 140) + 'px';
  });

  // Enter → gönder (Shift+Enter = yeni satır)
  inp.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  // Sekme başlığı titremesi (yüksek korku seviyesinde)
  setInterval(() => {
    if (horrorLevel >= 4 && Math.random() < 0.15) {
      const orig = document.title;
      document.title = '· · ·';
      setTimeout(() => { document.title = orig; }, 800);
    }
  }, 8000);

  // Rastgele micro-glitch (çok yüksek korku seviyesinde)
  setInterval(() => {
    if (horrorLevel >= 7 && Math.random() < 0.2) triggerGlitch();
  }, 12000);
});
