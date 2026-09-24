const { io } = require('socket.io-client');
const URL = process.env.URL || 'http://localhost:3000';

const watchdog = setTimeout(() => { console.error('FATAL: timeout del test de fases'); process.exit(1); }, 90000);

function wait(ms) { return new Promise(r => setTimeout(r, ms)); }
function once(sock, ev) { return new Promise(r => sock.once(ev, r)); }

function makeCollector(sock, ev) {
  const q = [];
  const w = [];
  sock.on(ev, d => { if (w.length) w.shift()(d); else q.push(d); });
  return () => (q.length ? Promise.resolve(q.shift()) : new Promise(r => w.push(r)));
}

let lastPhase = 0;
function waitForPhase(target, ms) {
  const t0 = Date.now();
  return new Promise((resolve) => {
    (function poll() {
      if (lastPhase >= target) return resolve(true);
      if (Date.now() - t0 > ms) return resolve(false);
      setTimeout(poll, 120);
    })();
  });
}

(async () => {
  let failed = 0;
  const ok = (n, c) => { console.log((c ? 'PASS' : 'FAIL') + ' - ' + n); if (!c) failed++; };

  const host = io(URL);
  await once(host, 'connect');

  const code = await new Promise((r) => host.emit('createRoom', 'Ana', (res) => r(res.code)));
  const guest = io(URL);
  await once(guest, 'connect');
  await new Promise((r) => guest.emit('joinRoom', { code, name: 'Luis' }, (res) => { ok('joinRoom ok', res.ok === true); r(); }));

  // Colas de eventos para no perder datos que llegan antes de ser esperados
  host.on('phase', d => { lastPhase = d.phase; });
  const p2CardQ = makeCollector(guest, 'p2Card');
  const p3SceneQ = makeCollector(guest, 'p3Scene');
  const p4InitQ = makeCollector(guest, 'p4Init');
  const p4NotifyQ = makeCollector(guest, 'p4Notify');
  const p5StatementQ = makeCollector(guest, 'p5Statement');

  host.emit('start');
  await once(host, 'started');

  // ---- Fase 1: responder las 8 preguntas correctamente (todas tienen a:0) ----
  let lastQuestion = null;
  for (let i = 0; i < 8; i++) {
    host.emit('spin');
    const q = await once(host, 'question');
    lastQuestion = q;
    if (i === 0) ok('la Fase 1 anuncia pregunta 1/8', q.round === 1 && q.total === 8);
    guest.emit('answer', { qId: q.qId, index: 0 });
    await once(guest, 'questionEnded');
  }
  ok('se jugaron 8 preguntas de la Fase 1', lastQuestion.round === 8);

  ok('la partida avanza a la Fase 2', await waitForPhase(2, 8000));

  // ---- Fase 2: clasificar 8 tarjetas ----
  let p2Reveals = 0;
  let earnedOk = false;
  for (let i = 0; i < 8; i++) {
    const card = await p2CardQ();
    if (i === 0) ok('Fase 2 muestra una tarjeta con 4 categorías', Array.isArray(card.options) && card.options.length === 4);
    const guestP2 = once(guest, 'p2Answer');
    const reveal = once(guest, 'p2Reveal');
    guest.emit('p2Classify', { cid: card.cid, catId: card.options[0].id });
    const ans = await guestP2;
    if (ans.earned === 50 || ans.earned === -30) earnedOk = true;
    await reveal;
    p2Reveals++;
  }
  ok('clasificar suma o resta puntos', earnedOk === true);
  ok('se revelaron 8 tarjetas de la Fase 2', p2Reveals === 8);

  ok('la partida avanza a la Fase 3', await waitForPhase(3, 8000));

  // ---- Fase 3: 2 casos, confirmando en cada uno ----
  const scene1 = await p3SceneQ();
  ok('Fase 3 muestra un caso con 10 controles', Array.isArray(scene1.controls) && scene1.controls.length === 10);
  let curSid = scene1.sid;
  let p3Reveals = 0;
  for (let i = 0; i < 2; i++) {
    const submit = once(guest, 'p3Submit');
    const reveal = once(guest, 'p3Reveal');
    guest.emit('p3Submit', { sid: curSid, picks: [] });
    const s = await submit;
    if (i === 0) ok('confirmar omitiendo controles resta puntos', s.earned < 0);
    await reveal;
    p3Reveals++;
    if (i === 0) {
      const nextScene = await p3SceneQ();
      curSid = nextScene.sid;
    }
  }
  ok('se resolvieron 2 casos de la Fase 3', p3Reveals === 2);

  ok('la partida avanza a la Fase 4', await waitForPhase(4, 8000));

  // ---- Fase 4: comprar el control requerido y mitigar los 3 ataques ----
  const p4Init = await p4InitQ();
  ok('Fase 4 entrega tienda con presupuesto $10.000', p4Init.shop.length > 0 && p4Init.budget === 10000);

  let mitigados = 0;
  for (let i = 0; i < 3; i++) {
    const notify = await p4NotifyQ();
    guest.emit('p4Buy', { cid: notify.required[0] });
    guest.emit('p4Ready');
    const result = await once(guest, 'p4Result');
    const me = result.results.find(r => r.name === 'Luis');
    if (me && me.mitigated) mitigados++;
    if (i === 0) ok('con el control comprado se mitiga el ataque', me && me.mitigated === true && me.delta === 150);
  }
  ok('los 3 ataques se mitigan', mitigados === 3);

  ok('la partida avanza a la Fase 5', await waitForPhase(5, 8000));

  // ---- Fase 5: votar hasta que termine la partida ----
  let stmts = 0;
  let pendingEnd = null;
  let stProm = null;
  const nextEnd = () => { if (!pendingEnd) pendingEnd = once(guest, 'gameEnd'); return pendingEnd; };
  const nextS = () => { if (!stProm) stProm = p5StatementQ(); return stProm; };

  const firstEv = await Promise.race([nextS().then(() => 'st'), nextEnd().then(() => 'end'), wait(9000).then(() => 'timeout')]);
  ok('Fase 5 inicia con una afirmación', firstEv === 'st');

  let gameEnded = false;
  for (;;) {
    const ev = await Promise.race([nextS().then(() => 'st'), nextEnd().then(() => 'end'), wait(9000).then(() => 'timeout')]);
    if (ev === 'end') { gameEnded = true; break; }
    if (ev === 'timeout') break;
    const st = await stProm; stProm = null;
    const reveal = once(guest, 'p5Reveal');
    guest.emit('p5Vote', { sid: st.sid, vote: 'ventaja' });
    await reveal;
    stmts++;
  }
  ok('se votaron afirmaciones de la Fase 5', stmts >= 2);
  const endCheck = await Promise.race([nextEnd().then(() => true), wait(5000).then(() => false)]);
  ok('la partida termina tras la Fase 5', gameEnded || endCheck === true);

  host.disconnect();
  guest.disconnect();
  clearTimeout(watchdog);
  console.log(failed === 0 ? '\nTODOS LOS TEST DE FASES PASARON 🎉' : `\n${failed} test(s) fallaron`);
  process.exit(failed === 0 ? 0 : 1);
})();