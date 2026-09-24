const { io } = require('socket.io-client');
const { QUESTIONS } = require('./questions');
const URL = process.env.URL || 'http://localhost:3000';

const watchdog = setTimeout(() => { console.error('FATAL: timeout del test'); process.exit(1); }, 25000);

function wait(ms) { return new Promise(r => setTimeout(r, ms)); }
function once(sock, ev) { return new Promise(r => sock.once(ev, r)); }

// Con el orden de opciones mezclado, calcula la posición de la respuesta correcta en el payload recibido
function correctIdx(qPayload) {
  const dash = qPayload.qId.lastIndexOf('-');
  const catId = qPayload.qId.slice(0, dash);
  const qIndex = Number(qPayload.qId.slice(dash + 1));
  const q = QUESTIONS[catId][qIndex];
  return qPayload.options.indexOf(q.opts[q.a]);
}

(async () => {
  let failed = 0;
  const ok = (n, c) => { console.log((c ? 'PASS' : 'FAIL') + ' - ' + n); if (!c) failed++; };

  const host = io(URL);
  await once(host, 'connect');

  const code = await new Promise((r) => host.emit('createRoom', 'Ana', (res) => r(res.code)));

  // no se puede iniciar con solo el anfitrión (antes de que entre algún jugador)
  await wait(200);
  const noStart = await new Promise((r) => {
    host.emit('start');
    host.once('started', () => r(false));
    setTimeout(() => r(true), 600);
  });
  ok('no se inicia sin al menos 1 jugador', noStart === true);

  const guest = io(URL);
  await once(guest, 'connect');
  await new Promise((r) => guest.emit('joinRoom', { code, name: 'Luis' }, (res) => { ok('joinRoom ok', res.ok === true); r(); }));

  const playersEvents = [];
  host.on('players', d => playersEvents.push(d));

  // ahora sí con 1 invitado
  host.emit('start');
  await once(host, 'started');
  await wait(200);

  // invitado intenta girar -> el servidor debe ignorarlo
  let gotQuestion = false;
  guest.on('question', () => { gotQuestion = true; });
  guest.emit('spin');
  await wait(500);
  ok('el invitado NO puede girar la rueda', gotQuestion === false);
  guest.off('question');

  host.emit('spin');
  const qGuest = once(guest, 'question');
  const qHost = once(host, 'question');
  const q1 = await qHost;
  const q2 = await qGuest;
  ok('question llega a host y guest con mismo qId', q1.qId === q2.qId);
  ok('la pregunta trae tiempo de respuesta (20 s con endsAt)', q1.time === 20 && q1.endsAt > Date.now());

  // el invitado responde primero y correcto (+100) -> es la PRIMERA respuesta válida
  const a1Correct = correctIdx(q1);
  const hostAnswered = once(host, 'answered');
  const guestAnswered1 = once(guest, 'answered');
  guest.emit('answer', { qId: q1.qId, index: a1Correct });
  const a1 = await guestAnswered1;
  await hostAnswered;
  ok('invitado primero en acertar -> first + earned 100', a1.correct === true && a1.first === true && a1.earned === 100);

  // el anfitrión intenta responder -> el servidor debe ignorarlo (no llega evento 'answered')
  const endedP = once(host, 'questionEnded');
  const hostSilent = await Promise.race([
    once(host, 'answered').then(() => 'EVENT'),
    wait(700).then(() => 'NONE')
  ]);
  ok('el anfitrión NO juega (su respuesta se ignora)', hostSilent === 'NONE');

  const ended = await endedP;
  ok('questionEnded solo incluye jugadores (sin anfitrión)', ended.results.length === 1 && ended.rightIndex === a1Correct);

  // el anfitrión puede girar de NUEVO directamente (sin botón 'siguiente')
  host.emit('spin');
  const q3 = await once(host, 'question');
  ok('el anfitrión puede seguir girando la ruleta', q3.qId !== q1.qId);

  // respuesta mala del invitado -> -20 puntos
  const playersAfterWrong = new Promise((r) => host.once('players', d => r(d)));
  const guestAnswered2 = once(guest, 'answered');
  const q3Correct = correctIdx(q3);
  const q3Wrong = (q3Correct + 1) % q3.options.length;
  guest.emit('answer', { qId: q3.qId, index: q3Wrong });
  const answeredMsg = await guestAnswered2;
  ok('respuesta mala -> -20 pts', answeredMsg.earned === -20);
  const lifePlayers = await playersAfterWrong;
  ok('el marcador de juego excluye al anfitrión', lifePlayers.players.every(p => p.name !== 'Ana'));

  const luis = lifePlayers.players.find(p => p.name === 'Luis');
  ok('invitado Luis 100 - 20 = 80 pts', luis && luis.points === 80);

  host.disconnect();
  guest.disconnect();
  clearTimeout(watchdog);
  console.log(failed === 0 ? '\nTODOS LOS TEST PASARON 🎉' : `\n${failed} test(s) fallaron`);
  process.exit(failed === 0 ? 0 : 1);
})();