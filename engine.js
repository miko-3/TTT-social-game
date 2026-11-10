// Game engine, shared by server.js and the in-browser demo. The board wraps like a globe.
(function (root, factory) {
  if (typeof module === 'object') module.exports = factory(); else root.TTEngine = factory();
})(this, function () {
  const CFG = { maxHp: 3, startAp: 1, startRange: 2, cost: { move: 1, shoot: 1, giveAP: 1, range: 3, heal: 3 } }; // house rules
  const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const okPhoto = p => typeof p === 'string' && p.length < 60000 && /^data:image\/jpeg;base64,[A-Za-z0-9+\/=]+$/.test(p);

  function create(o) {
    o = o || {};
    const bytes = o.bytes || (n => Array.from({ length: n }, () => Math.random() * 256 | 0));
    const save = o.save || (() => {}), now = o.now || Date.now;
    const fresh = () => ({ phase: 'lobby', size: 12, interval: 720, players: {}, codes: {}, photos: {}, log: [], next: 0, winner: null, cooldown: 0 });
    let G = o.state || fresh();
    const log = m => { G.log.unshift(m); G.log.length = Math.min(G.log.length, 40); };
    const all = () => Object.values(G.players), live = () => all().filter(p => p.alive);
    const wd = (a, b) => { const d = Math.abs(a - b); return Math.min(d, G.size - d); };
    const dist = (a, b) => Math.max(wd(a.x, b.x), wd(a.y, b.y));
    const mk = n => Array.from(bytes(n), b => ALPHA[b % 32]).join('');

    function tick() {
      for (const p of all()) { if (p.alive) { p.ap += 1 + Math.floor(p.got / 3); p.got = 0; } else p.votes = 1; }
      G.next += G.interval * 60000; log('New round: action points and jury votes handed out.');
    }
    function catchUp() {
      if (G.phase !== 'play') return;
      let t = false; while (now() >= G.next) { tick(); t = true; }
      if (t) save(G);
    }
    function start() {
      const ps = all();
      if (ps.length < 2) return 'Need at least 2 players';
      if (ps.length > G.size * G.size) return 'Board too small for that many players';
      const cells = [];
      for (let x = 0; x < G.size; x++) for (let y = 0; y < G.size; y++) cells.push([x, y]);
      cells.sort(() => Math.random() - 0.5);
      ps.forEach((p, i) => Object.assign(p, { x: cells[i][0], y: cells[i][1], hp: CFG.maxHp, ap: CFG.startAp, range: CFG.startRange, alive: true, votes: 0, got: 0 }));
      G.phase = 'play'; G.next = now() + G.interval * 60000; log('Game started!');
    }
    function act(me, b) { // host-set cooldown: minimum seconds between a player's successful actions
      const cd = (G.cooldown || 0) * 1000, w = me.last ? me.last + cd - now() : 0;
      if (cd && w > 0) return `Slow down - wait ${Math.ceil(w / 1000)}s before your next action`;
      const e = doAct(me, b); if (!e) me.last = now(); return e;
    }
    function doAct(me, b) {
      const t = G.players[b.target], k = b.type, c = CFG.cost;
      if (G.phase !== 'play') return 'Game is not running';
      if (k === 'vote') {
        if (me.alive || me.votes < 1 || !t || !t.alive) return 'Cannot vote';
        me.votes--; t.got++; return null;
      }
      if (!me.alive) return 'You are dead - you can only vote';
      if (k === 'heal') {
        if (me.hp >= CFG.maxHp) return 'Already at full hearts';
        if (me.ap < c.heal) return 'Not enough AP';
        me.ap -= c.heal; me.hp++; return null;
      }
      if (k === 'range') { if (me.ap < c.range) return 'Not enough AP'; me.ap -= c.range; me.range++; return null; }
      if (k === 'move') {
        const q = { x: b.x | 0, y: b.y | 0 }, d = dist(me, q) * c.move;
        if (q.x < 0 || q.y < 0 || q.x >= G.size || q.y >= G.size || d < c.move || d > me.ap ||
            live().some(p => p.x === q.x && p.y === q.y)) return 'Cannot move there (not enough AP, or occupied)';
        me.ap -= d; me.x = q.x; me.y = q.y; return null;
      }
      if (!t || t === me || dist(me, t) > me.range) return 'Target out of range';
      if (k === 'shoot') {
        if (!t.alive || me.ap < c.shoot) return 'Cannot attack';
        me.ap -= c.shoot; t.hp--;
        if (t.hp <= 0) { t.alive = false; me.ap += t.ap; t.ap = 0; t.votes = 1; t.got = 0; log(`${me.name} killed ${t.name}`); }
        else log(`${me.name} shot ${t.name}`);
        if (live().length === 1) { G.phase = 'over'; G.winner = me.name; log(`${me.name} wins!`); }
        return null;
      }
      if (k === 'giveAP') {
        if (!t.alive || me.ap < c.giveAP) return 'Cannot give AP';
        me.ap -= 1; t.ap += 1; log(`${me.name} gave an action point to ${t.name}`); return null;
      }
      if (k === 'giveHP') {
        if (me.hp < 2) return 'You cannot give away your last heart';
        if (t.alive && t.hp >= CFG.maxHp) return 'Target already has full hearts';
        me.hp--; t.hp++;
        if (!t.alive) { t.alive = true; t.got = 0; log(`${me.name} revived ${t.name}`); } else log(`${me.name} gave a heart to ${t.name}`);
        return null;
      }
      return 'Unknown action';
    }
    function join(b) {
      const name = String(b.name || '').trim().slice(0, 20);
      if (G.phase !== 'lobby' || !name) return { error: 'Cannot join right now' };
      if (all().length >= G.size * G.size) return { error: 'Lobby is full' };
      if (all().some(p => p.name.toLowerCase() === name.toLowerCase())) return { error: 'Name taken' };
      if (b.photo && !okPhoto(b.photo)) return { error: 'Bad photo' };
      const id = mk(8).toLowerCase(); let code; do code = mk(6); while (G.codes[code]);
      G.players[id] = { id, name, alive: true, hp: 0, ap: 0, range: 0, x: -1, y: -1, votes: 0, got: 0, pv: 0 };
      G.codes[code] = id;
      if (b.photo) { G.photos[id] = b.photo; G.players[id].pv = 1; }
      save(G); return { token: code };
    }
    function handle(p, b) {
      b = b || {}; catchUp();
      const code = String(b.token || b.code || '').trim().toUpperCase(), me = G.players[G.codes[code]];
      if (p === 'state') return { phase: G.phase, size: G.size, interval: G.interval, next: G.next, winner: G.winner, cooldown: G.cooldown || 0,
        log: G.log, now: now(), cfg: CFG, me: me ? me.id : null, players: all() };
      if (p === 'join') return join(b);
      if (p === 'login') return me ? { token: code } : { error: 'Unknown login code' };
      if (p === 'photo') {
        if (!me || !okPhoto(b.photo)) return { error: 'Bad photo or not logged in' };
        G.photos[me.id] = b.photo; me.pv++; save(G); return { ok: 1 };
      }
      if (p === 'act') { if (!me) return { error: 'Log in first' }; const e = act(me, b); save(G); return e ? { error: e } : { ok: 1 }; }
      if (p === 'admin') {
        if (b.key !== o.adminKey) return { error: 'Wrong host key' };
        if (b.cmd === 'reset') { G = fresh(); G.size = Math.min(30, Math.max(5, b.size | 0 || 12)); G.interval = Math.max(1, b.interval | 0 || 720); G.cooldown = Math.max(0, +b.cooldown || 0); }
        else if (b.cmd === 'config') { G.cooldown = Math.max(0, Math.min(3600, +b.cooldown || 0)); log(G.cooldown ? `Host set a ${G.cooldown}s cooldown between actions.` : 'Host removed the action cooldown.'); }
        else if (b.cmd === 'start') { const e = start(); if (e) return { error: e }; }
        save(G); return { ok: 1 };
      }
      return { error: 'Not found' };
    }
    return {
      handle, photo: id => G.photos[id], state: () => G,
      codeOf: id => Object.keys(G.codes).find(c => G.codes[c] === id),
      skip() { if (G.phase === 'play') { tick(); G.next = now() + G.interval * 60000; save(G); } } // demo helper
    };
  }
  return { create };
});
