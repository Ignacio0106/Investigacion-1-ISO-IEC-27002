const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const { CATS, QUESTIONS } = require('./questions');
const { PHASE_INFO, P2_OPTIONS, P2_CARDS, P3_SCENARIOS, P4_SHOP, P4_ATTACKS, P5_STATEMENTS } = require('./phases');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(express.static(path.join(__dirname, 'public')));

const rooms = new Map();

// ---------- Constantes de juego ----------
const ANSWER_TIME = 20000;      // Fase 1: tiempo para responder cada pregunta (ms)
const CORRECT_FIRST = 100;      // Fase 1: puntos del primer acertado
const CORRECT_LATER = 50;       // Fase 1: puntos de los demás acertados
const WRONG_PENALTY = 20;       // Fase 1: puntos que se descuentan al fallar
const P1_QUESTION_COUNT = 8;    // Fase 1: número de preguntas por partida

const P2_CARDS_PER_ROUND = 8;   // Fase 2: tarjetas por partida
const P2_TIME = 30000;          // Fase 2: tiempo por tarjeta (ms)
const P2_GOOD = 50;             // Fase 2: acierto
const P2_BAD = 30;              // Fase 2: penalización por errar

const P3_ROUNDS = 2;            // Fase 3: casos por partida
const P3_TIME = 120000;         // Fase 3: tiempo por caso (ms)
const P3_GOOD = 30;             // Fase 3: control correcto elegido
const P3_MISS = 20;             // Fase 3: control necesario omitido
const P3_EXTRA = 20;            // Fase 3: control innecesario elegido
const P3_CLEAN = 50;            // Fase 3: bono por dejar el caso "limpio"

const P4_BUDGET = 10000;        // Fase 4: presupuesto inicial
const P4_TIME = 90000;          // Fase 4: tiempo de compra (ms)
const P4_MITIGATE = 150;        // Fase 4: puntos por mitigar
const P4_BREACH = 100;          // Fase 4: puntos que se pierden por brecha

const P5_TIME = 30000;          // Fase 5: tiempo por voto (ms)
const P5_GOOD = 40;             // Fase 5: voto correcto
const P5_BAD = 15;              // Fase 5: voto incorrecto

// ---------- Utilidades ----------
function genCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code;
  do {
    code = Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  } while (rooms.has(code));
  return code;
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function createRoom(hostSocketId, hostName) {
  const code = genCode();
  const room = {
    code,
    host: hostSocketId,
    players: new Map(), // socketId -> { id, name, points }
    used: {},           // Fase 1: catId -> Set de índices usados
    current: null,      // Fase 1: pregunta actual
    phase: 1,
    p1: { count: 0 },
    p2: null,           // Fase 2: { cards, idx, cid, answers }
    p3: null,           // Fase 3: { scenes, idx, sid, submitted }
    p4: null,           // Fase 4: { attacks, round, buyOpen, players }
    p5: null,           // Fase 5: { items, idx, sid, votes }
    timer: null,        // temporizador de la fase activa
    started: false,
    ended: false
  };
  CATS.forEach(c => { room.used[c.id] = new Set(); });
  addPlayer(room, hostSocketId, hostName);
  rooms.set(code, room);
  return room;
}

function addPlayer(room, socketId, name) {
  room.players.set(socketId, { id: socketId, name, points: 0 });
}

function allPlayers(room) {
  return Array.from(room.players.values()).sort((a, b) => a.name.localeCompare(b.name));
}

function playerList(room) {
  return Array.from(room.players.values())
    .filter(p => p.id !== room.host)
    .sort((a, b) => b.points - a.points);
}

function guestCount(room) {
  return room.host ? room.players.size - 1 : room.players.size;
}

function guestIds(room) {
  return Array.from(room.players.keys()).filter(id => id !== room.host);
}

function broadcastRoom(room) {
  io.to(room.code).emit('players', { players: playerList(room), hostId: room.host });
}

function findRoomBySocket(socketId) {
  for (const room of rooms.values()) {
    if (room.players.has(socketId)) return room;
  }
  return null;
}

function cleanName(name) {
  const n = String(name || '').trim().slice(0, 18);
  return n || 'Jugador';
}

// ---------- Fase 1: Preguntados ----------
function remainingCount(room) {
  return CATS.reduce((acc, c) => acc + (QUESTIONS[c.id].length - room.used[c.id].size), 0);
}

function pickQuestion(room) {
  const pendingCats = CATS.filter(c => room.used[c.id].size < QUESTIONS[c.id].length);
  if (pendingCats.length === 0) return null;
  const cat = pendingCats[Math.floor(Math.random() * pendingCats.length)];
  const unused = [];
  QUESTIONS[cat.id].forEach((q, i) => { if (!room.used[cat.id].has(i)) unused.push(i); });
  const qIndex = unused[Math.floor(Math.random() * unused.length)];
  return { catId: cat.id, qIndex };
}

function endGame(room, won) {
  room.ended = true;
  room.current = null;
  clearPhaseTimer(room);
  const sorted = playerList(room);
  io.to(room.code).emit('gameEnd', { players: sorted, won });
}

// ---------- Cambio de fase ----------
function emitPhase(room, n) {
  const info = PHASE_INFO[n] || { name: `Fase ${n}`, icon: '🎮', color: '#2c3d66', desc: '' };
  io.to(room.code).emit('phase', { phase: n, name: info.name, icon: info.icon, color: info.color, desc: info.desc });
}

function clearPhaseTimer(room) {
  if (room.timer) { clearTimeout(room.timer); room.timer = null; }
}

function startPhase(room, n) {
  clearPhaseTimer(room);
  room.phase = n;
  emitPhase(room, n);
  if (n === 2) startP2(room);
  else if (n === 3) startP3(room);
  else if (n === 4) startP4(room);
  else if (n === 5) startP5(room);
}

// ---------- Fase 2: Sorting Express ----------
function startP2(room) {
  const cards = shuffle(P2_CARDS.map((c, i) => ({ ...c, cid: 'c' + i }))).slice(0, P2_CARDS_PER_ROUND);
  room.p2 = { cards, idx: 0, cid: null, answers: new Map() };
  p2Send(room);
}

function p2Send(room) {
  if (!room.p2 || room.p2.idx >= room.p2.cards.length) { scheduleNext(room, 3); return; }
  const card = room.p2.cards[room.p2.idx];
  room.p2.cid = card.cid;
  room.p2.answers = new Map();
  io.to(room.code).emit('p2Card', {
    cid: card.cid,
    text: card.text,
    options: P2_OPTIONS.map(o => ({ id: o.id, name: o.name, tip: o.tip })),
    time: P2_TIME / 1000,
    endsAt: Date.now() + P2_TIME
  });
  room.timer = setTimeout(() => p2Reveal(room), P2_TIME);
}

function p2Reveal(room) {
  clearPhaseTimer(room);
  if (!room.p2 || room.p2.cid === null) return;
  const card = room.p2.cards[room.p2.idx];
  room.p2.cid = null;
  const results = [];
  for (const id of guestIds(room)) {
    const p = room.players.get(id);
    const a = room.p2.answers.get(id);
    results.push({ id, name: p.name, catId: a ? a.catId : null, correct: !!(a && a.correct), earned: a ? a.earned : 0 });
  }
  io.to(room.code).emit('p2Reveal', { catId: card.cat, options: P2_OPTIONS.map(o => ({ id: o.id, name: o.name, color: o.color })), results });
  broadcastRoom(room);
  room.p2.idx++;
  if (room.p2.idx < room.p2.cards.length) later(room, () => { if (room.phase === 2 && room.p2) p2Send(room); }, 1800);
  else startPhase(room, 3);
}

function scheduleNext(room, phase, ms) {
  clearPhaseTimer(room);
  room.timer = setTimeout(() => startPhase(room, phase), ms || 2500);
}

function later(room, fn, ms) {
  clearPhaseTimer(room);
  room.timer = setTimeout(fn, ms || 2500);
}

// ---------- Fase 3: Caza de Vulnerabilidades ----------
function startP3(room) {
  const scenes = shuffle(P3_SCENARIOS.map((s, i) => ({ ...s, sid: 's' + i }))).slice(0, P3_ROUNDS);
  room.p3 = { scenes, idx: 0, sid: null, submitted: new Map() };
  p3Send(room);
}

function p3Send(room) {
  if (!room.p3 || room.p3.idx >= room.p3.scenes.length) { scheduleNext(room, 4); return; }
  const scene = room.p3.scenes[room.p3.idx];
  room.p3.sid = scene.sid;
  room.p3.submitted = new Map();
  io.to(room.code).emit('p3Scene', {
    sid: scene.sid,
    title: scene.title,
    text: scene.text,
    controls: scene.controls.map(c => ({ id: c.id, text: c.text })),
    time: P3_TIME / 1000,
    endsAt: Date.now() + P3_TIME
  });
  room.timer = setTimeout(() => p3Reveal(room), P3_TIME);
}

function p3Reveal(room) {
  clearPhaseTimer(room);
  if (!room.p3 || room.p3.sid === null) return;
  const scene = room.p3.scenes[room.p3.idx];
  room.p3.sid = null;
  const needed = scene.controls.filter(c => c.needed).map(c => c.id);
  const results = [];
  for (const id of guestIds(room)) {
    const p = room.players.get(id);
    const sub = room.p3.submitted.get(id);
    results.push({ id, name: p.name, earned: sub ? sub.earned : 0 });
  }
  io.to(room.code).emit('p3Reveal', { needed, results });
  broadcastRoom(room);
  room.p3.idx++;
  if (room.p3.idx < room.p3.scenes.length) later(room, () => { if (room.phase === 3 && room.p3) p3Send(room); }, 2000);
  else startPhase(room, 4);
}

// ---------- Fase 4: SOC Manager ----------
function startP4(room) {
  const attacks = shuffle(P4_ATTACKS.map((a, i) => ({ ...a, id: 'atk' + i })));
  const players = new Map();
  for (const id of guestIds(room)) {
    players.set(id, { budget: P4_BUDGET, purchased: new Set() });
  }
  room.p4 = { attacks, round: 0, buyOpen: false, players };
  io.to(room.code).emit('p4Init', {
    shop: P4_SHOP.map(s => ({ id: s.id, name: s.name, desc: s.desc, price: s.price })),
    budget: P4_BUDGET,
    state: p4StateList(room)
  });
  p4Next(room);
}

function p4StateList(room) {
  const arr = [];
  for (const [id, d] of room.p4.players) {
    arr.push({ id, budget: d.budget, purchased: Array.from(d.purchased) });
  }
  return arr;
}

function p4Next(room) {
  clearPhaseTimer(room);
  if (!room.p4 || room.p4.round >= room.p4.attacks.length) { scheduleNext(room, 5); return; }
  const atk = room.p4.attacks[room.p4.round];
  room.p4.buyOpen = true;
  room.p4.ready = new Map();
  io.to(room.code).emit('p4Notify', {
    attackId: atk.id,
    name: atk.name,
    desc: atk.desc,
    required: atk.required,
    time: P4_TIME / 1000,
    endsAt: Date.now() + P4_TIME
  });
  room.timer = setTimeout(() => p4Resolve(room), P4_TIME);
}

function p4Resolve(room) {
  clearPhaseTimer(room);
  if (!room.p4 || !room.p4.buyOpen) return;
  room.p4.buyOpen = false;
  room.p4.ready = new Map();
  const atk = room.p4.attacks[room.p4.round];
  const results = [];
  for (const id of guestIds(room)) {
    const p = room.players.get(id);
    const data = room.p4.players.get(id);
    const mitigated = atk.required.some(cid => data.purchased.has(cid));
    if (mitigated) {
      p.points += P4_MITIGATE;
      results.push({ id, name: p.name, mitigated: true, delta: P4_MITIGATE, damage: 0, budgetLeft: data.budget });
    } else {
      p.points -= P4_BREACH;
      data.budget = Math.max(0, data.budget - atk.damage);
      results.push({ id, name: p.name, mitigated: false, delta: -P4_BREACH, damage: atk.damage, budgetLeft: data.budget });
    }
  }
  io.to(room.code).emit('p4Result', { attackId: atk.id, name: atk.name, mitigatedBy: atk.required, results });
  io.to(room.code).emit('p4State', { players: p4StateList(room) });
  broadcastRoom(room);
  room.p4.round++;
  later(room, () => p4Next(room), 2500);
}

// ---------- Fase 5: Debate Express ----------
function startP5(room) {
  const items = shuffle(P5_STATEMENTS.map((s, i) => ({ ...s, sid: 'b' + i })));
  room.p5 = { items, idx: 0, sid: null, votes: new Map() };
  p5Send(room);
}

function p5Send(room) {
  if (!room.p5 || room.p5.idx >= room.p5.items.length) { endGame(room, true); return; }
  const item = room.p5.items[room.p5.idx];
  room.p5.sid = item.sid;
  room.p5.votes = new Map();
  io.to(room.code).emit('p5Statement', {
    sid: item.sid,
    text: item.text,
    time: P5_TIME / 1000,
    endsAt: Date.now() + P5_TIME
  });
  room.timer = setTimeout(() => p5Reveal(room), P5_TIME);
}

function p5Reveal(room) {
  clearPhaseTimer(room);
  if (!room.p5 || room.p5.sid === null) return;
  const item = room.p5.items[room.p5.idx];
  room.p5.sid = null;
  const results = [];
  for (const id of guestIds(room)) {
    const p = room.players.get(id);
    const v = room.p5.votes.get(id);
    const correct = !!(v && v.vote === item.answer);
    const earned = v ? (correct ? P5_GOOD : -P5_BAD) : 0;
    if (v) p.points += earned;
    results.push({ id, name: p.name, vote: v ? v.vote : null, correct, earned });
  }
  io.to(room.code).emit('p5Reveal', { sid: item.sid, answer: item.answer, explanation: item.explanation, results });
  broadcastRoom(room);
  room.p5.idx++;
  if (room.p5.idx < room.p5.items.length) later(room, () => { if (room.phase === 5 && room.p5) p5Send(room); }, 1500);
  else {
    later(room, () => endGame(room, true), 2200);
  }
}

function closeQuestion(room) {
  if (!room.current || room.current.closed) return;
  const cur = room.current;
  cur.closed = true;
  clearTimeout(cur.closeTimer);
  const rightIndex = QUESTIONS[cur.catId][cur.qIndex].a;
  const results = [];
  for (const [id, p] of room.players) {
    if (id === room.host) continue; // el anfitrión no juega
    const info = cur.answered.get(id);
    results.push({ id, name: p.name, correct: !!(info && info.correct), earned: info ? info.earned : 0 });
  }
  io.to(room.code).emit('questionEnded', { rightIndex, results });

  if (remainingCount(room) === 0) { endGame(room, true); return; }
  if (room.phase === 1 && room.p1.count >= P1_QUESTION_COUNT) {
    scheduleNext(room, 2, 2500);
  }
}

function scheduleClose(room, ms) {
  clearTimeout(room.current.closeTimer);
  room.current.closeTimer = setTimeout(() => closeQuestion(room), ms);
}

io.on('connection', (socket) => {
  socket.on('createRoom', (name, cb) => {
    const room = createRoom(socket.id, cleanName(name));
    socket.join(room.code);
    const players = allPlayers(room);
    cb({ ok: true, code: room.code, hostId: room.host, players });
    io.to(room.code).emit('lobbyUpdate', { players, hostId: room.host, code: room.code });
    console.log(`Room ${room.code} created by ${name}`);
  });

  socket.on('joinRoom', ({ code, name }, cb) => {
    const room = rooms.get(String(code || '').toUpperCase().trim());
    if (!room) return cb({ ok: false, msg: 'No existe una sala con ese código.' });
    if (room.started) return cb({ ok: false, msg: 'La partida ya comenzó en esa sala.' });
    if (room.players.has(socket.id)) return cb({ ok: false, msg: 'Ya estás en esa sala.' });
    room.players.set(socket.id, { id: socket.id, name: cleanName(name), points: 0 });
    socket.join(room.code);
    const players = allPlayers(room);
    cb({ ok: true, code: room.code, hostId: room.host, players });
    io.to(room.code).emit('lobbyUpdate', { players, hostId: room.host, code: room.code });
    console.log(`${name} joined room ${room.code}`);
  });

  socket.on('start', () => {
    const room = findRoomBySocket(socket.id);
    if (!room || room.host !== socket.id) return;
    if (room.players.size < 2) return; // se necesita al menos 1 jugador además del anfitrión
    room.started = true;
    room.ended = false;
    room.current = null;
    room.phase = 1;
    room.p1 = { count: 0 };
    room.p2 = null;
    room.p3 = null;
    room.p4 = null;
    room.p5 = null;
    clearPhaseTimer(room);
    CATS.forEach(c => { room.used[c.id] = new Set(); });
    emitPhase(room, 1);
    io.to(room.code).emit('started');
    broadcastRoom(room);
  });

  socket.on('spin', () => {
    const room = findRoomBySocket(socket.id);
    if (!room || !room.started || room.ended) return;
    if (room.phase !== 1) return;
    if (room.p1.count >= P1_QUESTION_COUNT) return;
    if (room.host !== socket.id) return; // solo el anfitrión puede girar la rueda
    if (room.current) {
      if (!room.current.closed) return;
      room.current = null; // sigue girando a la siguiente pregunta
    }
    const picked = pickQuestion(room);
    if (!picked) { endGame(room, true); return; }
    const q = QUESTIONS[picked.catId][picked.qIndex];
    const cat = CATS.find(c => c.id === picked.catId);
    room.current = {
      catId: picked.catId,
      qIndex: picked.qIndex,
      q,
      answered: new Map(),
      firstCorrect: null,
      closed: false,
      closeTimer: null
    };
    const endsAt = Date.now() + ANSWER_TIME;
    io.to(room.code).emit('question', {
      qId: picked.catId + '-' + picked.qIndex,
      catName: cat.name,
      catColor: cat.color,
      q: q.q,
      options: q.opts,
      time: ANSWER_TIME / 1000,
      endsAt,
      round: room.p1.count + 1,
      total: P1_QUESTION_COUNT
    });
    scheduleClose(room, ANSWER_TIME);
    room.p1.count++;
  });

  socket.on('answer', ({ qId, index }) => {
    const room = findRoomBySocket(socket.id);
    if (!room || !room.current || room.current.closed) return;
    if (socket.id === room.host) return; // el anfitrión no juega, solo modera
    const cur = room.current;
    const questionKey = cur.catId + '-' + cur.qIndex;
    if (qId !== questionKey) return;
    if (cur.answered.has(socket.id)) return;

    const player = room.players.get(socket.id);
    if (!player) return;
    const correct = index === cur.q.a;
    let earned = 0;
    if (correct) {
      if (!cur.firstCorrect) { cur.firstCorrect = socket.id; earned = CORRECT_FIRST; }
      else earned = CORRECT_LATER;
      player.points += earned;
      room.used[cur.catId].add(cur.qIndex);
    } else {
      earned = -WRONG_PENALTY;
      player.points += earned;
    }
    cur.answered.set(socket.id, { correct, earned });

    io.to(room.code).emit('answered', { id: socket.id, name: player.name, correct, first: cur.firstCorrect === socket.id, earned });
    broadcastRoom(room);

    const answeredAll = guestIds(room).every(id => cur.answered.has(id));
    if (answeredAll) scheduleClose(room, 250);
  });

  // ---------- Fase 2 ----------
  socket.on('p2Classify', ({ cid, catId }) => {
    const room = findRoomBySocket(socket.id);
    if (!room || room.phase !== 2 || !room.p2 || room.p2.cid === null) return;
    if (socket.id === room.host) return;
    if (room.p2.cid !== cid) return;
    if (room.p2.answers.has(socket.id)) return;
    const card = room.p2.cards[room.p2.idx];
    const player = room.players.get(socket.id);
    if (!player) return;
    const correct = card.cat === catId;
    const earned = correct ? P2_GOOD : -P2_BAD;
    player.points += earned;
    room.p2.answers.set(socket.id, { catId, correct, earned });
    io.to(room.code).emit('p2Answer', { id: socket.id, name: player.name, correct, earned });
    broadcastRoom(room);
    if (guestIds(room).every(id => room.p2.answers.has(id))) p2Reveal(room);
  });

  // ---------- Fase 3 ----------
  socket.on('p3Submit', ({ sid, picks }) => {
    const room = findRoomBySocket(socket.id);
    if (!room || room.phase !== 3 || !room.p3 || room.p3.sid === null) return;
    if (socket.id === room.host) return;
    if (room.p3.sid !== sid) return;
    if (room.p3.submitted.has(socket.id)) return;
    const scene = room.p3.scenes[room.p3.idx];
    const player = room.players.get(socket.id);
    if (!player) return;
    const chosen = new Set(Array.isArray(picks) ? picks : []);
    let ok = 0, miss = 0, extra = 0;
    for (const c of scene.controls) {
      const picked = chosen.has(c.id);
      if (c.needed && picked) ok++;
      else if (c.needed && !picked) miss++;
      else if (!c.needed && picked) extra++;
    }
    let earned = ok * P3_GOOD - miss * P3_MISS - extra * P3_EXTRA;
    if (miss === 0 && extra === 0) earned += P3_CLEAN;
    player.points += earned;
    room.p3.submitted.set(socket.id, { picks: chosen, earned });
    io.to(room.code).emit('p3Submit', { id: socket.id, name: player.name, earned });
    broadcastRoom(room);
    if (guestIds(room).every(id => room.p3.submitted.has(id))) p3Reveal(room);
  });

  // ---------- Fase 4 ----------
  socket.on('p4Ready', () => {
    const room = findRoomBySocket(socket.id);
    if (!room || room.phase !== 4 || !room.p4 || !room.p4.buyOpen) return;
    if (socket.id === room.host) return;
    if (room.p4.ready.has(socket.id)) return;
    room.p4.ready.set(socket.id, true);
    const player = room.players.get(socket.id);
    io.to(room.code).emit('p4Ready', { id: socket.id, name: player.name });
    if (guestIds(room).every(id => room.p4.ready.has(id))) {
      clearPhaseTimer(room);
      room.timer = setTimeout(() => p4Resolve(room), 400);
    }
  });

  socket.on('p4Buy', ({ cid }) => {
    const room = findRoomBySocket(socket.id);
    if (!room || room.phase !== 4 || !room.p4 || !room.p4.buyOpen) return;
    if (socket.id === room.host) return;
    const item = P4_SHOP.find(s => s.id === cid);
    const data = room.p4.players.get(socket.id);
    if (!item || !data) return;
    if (data.purchased.has(cid)) return;
    if (item.price > data.budget) return;
    data.budget -= item.price;
    data.purchased.add(cid);
    const player = room.players.get(socket.id);
    io.to(room.code).emit('p4Buy', { id: socket.id, name: player.name, cid, budget: data.budget });
    io.to(room.code).emit('p4State', { players: p4StateList(room) });
  });

  // ---------- Fase 5 ----------
  socket.on('p5Vote', ({ sid, vote }) => {
    const room = findRoomBySocket(socket.id);
    if (!room || room.phase !== 5 || !room.p5 || room.p5.sid === null) return;
    if (socket.id === room.host) return;
    if (room.p5.sid !== sid) return;
    if (room.p5.votes.has(socket.id)) return;
    if (!['ventaja', 'limitacion', 'mito'].includes(vote)) return;
    room.p5.votes.set(socket.id, { vote });
    if (guestIds(room).every(id => room.p5.votes.has(id))) p5Reveal(room);
  });

  socket.on('next', () => {
    const room = findRoomBySocket(socket.id);
    if (!room || !room.current) return;
    if (!room.current.closed) closeQuestion(room);
    room.current = null;
    if (room.ended) return;
    io.to(room.code).emit('wheelReady');
  });

  socket.on('disconnect', () => {
    for (const [code, room] of rooms) {
      if (room.players.has(socket.id)) {
        room.players.delete(socket.id);
        if (room.host === socket.id) {
          const next = Array.from(room.players.keys())[0];
          room.host = next || null;
        }
        if (room.players.size === 0) {
          room.ended = true;
          clearPhaseTimer(room);
          if (room.current) clearTimeout(room.current.closeTimer);
          rooms.delete(code);
          break;
        }
        if (room.started && guestCount(room) === 0) {
          endGame(room, false);
          break;
        }
        io.to(room.code).emit('lobbyUpdate', { players: allPlayers(room), hostId: room.host, code: room.code });
        broadcastRoom(room);
        socket.leave(room.code);
        break;
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Servidor listo en http://localhost:${PORT}`));