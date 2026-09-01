import { AttackIntentScheduler, createAttackIntent, telegraphForIntent } from './attack-intent-v16.js';
import { HERO_DOCTRINES, createDefenseState, createPresentationQueue, defenseTransitionCommands, entityAuditSnapshot, requestDefense, resolveDefenseImpact, stepDefense } from './defense-doctrine-v16.js';

const TICK_MS = 1000 / 60;
const OPTIONAL_MODULES = Object.freeze([
  ['campaign', './campaign-adapter-v16.js'], ['siege', './siege-adapter-v16.js'], ['hud', './final-hud-v16.js'],
]);

export function createCompositionShell() {
  const registrations = { combat: null, campaign: null, siege: null, hud: null };
  const register = (name, value) => {
    if (registrations[name]) throw new Error(`${name} already registered`);
    if (!value) throw new TypeError(`${name} registration requires an adapter`);
    registrations[name] = value;
    return value;
  };
  return Object.freeze({
    registerCombat: value => register('combat', value), registerCampaign: value => register('campaign', value),
    registerSiege: value => register('siege', value), registerHudLayer: value => register('hud', value),
    get: name => registrations[name], snapshot: () => Object.freeze(Object.fromEntries(Object.entries(registrations).map(([name, value]) => [name, value ? 'registered' : 'not-installed']))),
  });
}

export function createTutorialProgress() {
  return Object.freeze({ step: 'move', moveDistance: 0, parrySuccess: 0, dodgeSuccess: 0, dodgeDistance: 0 });
}

export function updateTutorialProgress(progress, event) {
  if (event.type !== 'outcome') return progress;
  if (progress.step === 'move' && event.action === 'MOVE') {
    const moveDistance = Math.max(progress.moveDistance, event.distance ?? 0);
    return Object.freeze({ ...progress, moveDistance, step: moveDistance >= 120 ? 'parry' : 'move' });
  }
  if (progress.step === 'parry' && event.action === 'DEFENSE_PARRY' && event.outcome === 'parried') return Object.freeze({ ...progress, parrySuccess: 1, step: 'dodge' });
  if (progress.step === 'dodge' && event.action === 'DEFENSE_DODGE' && event.outcome === 'dodged' && event.damage === 0) {
    const dodgeDistance = Math.max(progress.dodgeDistance, event.distance ?? 0);
    return Object.freeze({ ...progress, dodgeSuccess: 1, dodgeDistance, step: dodgeDistance >= 100 ? 'complete' : 'dodge' });
  }
  return progress;
}

async function installOptionalModule(shell, name, path) {
  const response = await fetch(new URL(path, import.meta.url), { method: 'HEAD', cache: 'no-store' });
  if (response.status === 404) return 'not-installed';
  if (!response.ok) throw new Error(`${name} adapter probe failed: ${response.status}`);
  await import(path);
  if (!shell.get(name)) throw new Error(`${name} adapter loaded without registration`);
  return 'registered';
}

function tutorialCopy(step) {
  return {
    move: ['이동 훈련', 'WASD 또는 왼쪽 스틱으로 120px 이동하십시오.'],
    parry: ['패링 훈련', 'SPACE 또는 LB로 ▲ 예고를 실제로 받아치십시오.'],
    dodge: ['구르기 훈련', 'SHIFT 또는 B로 ≫ 공격을 피하며 100px 이동하십시오.'],
    complete: ['전투 준비 완료', '입력 동작이 아니라 실제 판정 결과로 세 훈련을 통과했습니다.'],
  }[step];
}

function browserCombat(shell) {
  const canvas = document.querySelector('#battlefield'), context = canvas.getContext('2d');
  const atlas = new Image(); atlas.src = 'assets/animations/troy-defense-atlas-v16.png';
  const vfxAtlas = new Image(); vfxAtlas.src = 'assets/effects/troy-defense-vfx-v16.png';
  let manifest = null; fetch('assets/animations/troy-defense-atlas-v16.json').then(response => response.json()).then(value => { manifest = value; });
  let hero = 'hoplite', defense = createDefenseState(hero), tutorial = createTutorialProgress();
  let tick = 0, accumulator = 0, lastTime = performance.now(), movement = 0, dodgeMovement = 0, pendingDodge = null;
  let player = { x: innerWidth / 2, y: innerHeight / 2, facing: 0 }, keys = new Set(), priorButtons = [false, false];
  const scheduler = new AttackIntentScheduler(), activeTelegraphs = new Map();
  const presentation = createPresentationQueue();
  let actionId = null, poseOverride = null, hitStopUntil = 0, effects = [];
  const doctrines = {
    hoplite: '넓은 150° 패링과 전방 180px·450ms 광역 경직. 안정적인 방패 교리.',
    swordsman: '짧은 80° 패링과 1.80× 반격. 회복 40ms를 줄이는 결투 교리.',
    archer: '220px 장거리 구르기와 750ms 공격속도 1.25×. 거리 창출 교리.',
  };

  const resize = () => { canvas.width = Math.round(innerWidth * devicePixelRatio); canvas.height = Math.round(innerHeight * devicePixelRatio); canvas.style.width = `${innerWidth}px`; canvas.style.height = `${innerHeight}px`; context.setTransform(devicePixelRatio,0,0,devicePixelRatio,0,0); };
  resize(); addEventListener('resize', resize);

  const setHero = selected => {
    hero = selected; defense = createDefenseState(hero); movement = 0; dodgeMovement = 0; tutorial = createTutorialProgress();
    document.querySelectorAll('[data-hero]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.hero === hero)));
    document.querySelector('#doctrineText').textContent = doctrines[hero];
  };
  document.querySelectorAll('[data-hero]').forEach(button => button.addEventListener('click', () => setHero(button.dataset.hero)));

  function startAction(action) {
    if (defense.phase !== 'ready') return;
    const previous = defense;
    defense = requestDefense(defense, action, tick, { x: Math.cos(player.facing), y: Math.sin(player.facing) });
    actionId = `${action}-${tick}`;
    handlePresentation(defenseTransitionCommands(previous, defense, actionId));
    const doctrine = HERO_DOCTRINES[hero][action];
    const startupTicks = Math.ceil(doctrine.startupMs / TICK_MS);
    const activeTicks = Math.ceil(doctrine.activeMs / TICK_MS);
    const impactAt = action === 'parry' ? tick + startupTicks + 1 : tick + startupTicks + Math.max(1, activeTicks - 2);
    const id = actionId;
    const attack = createAttackIntent({
      sourceKind: 'melee', defenseTag: action === 'parry' ? 'parryable' : 'dodgeOnly',
      origin: { x: player.x + Math.cos(player.facing) * 92, y: player.y + Math.sin(player.facing) * 92 },
      direction: player.facing + Math.PI, range: 120, radius: 36, impactAt, threat: 'high',
      telegraphId: `telegraph-${id}`, impactId: `impact-${id}`, damage: 18,
    });
    scheduler.schedule(attack); activeTelegraphs.set(attack.telegraphId, telegraphForIntent(attack));
    if (action === 'dodge') { dodgeMovement = 0; pendingDodge = null; }
  }

  function handlePresentation(commands) {
    for (const command of presentation.consume(commands)) {
      if (command.type === 'success-pose') poseOverride = { clip: 'parry', phase: 'success', startTick: tick, untilTick: tick + 10 };
      if (command.type === 'collision-vfx') effects.push({ kind: 'parry', startTick: tick, lifeTicks: 8, x: player.x + Math.cos(player.facing) * 42, y: player.y + Math.sin(player.facing) * 42 });
      if (['dust-vfx', 'afterimage-vfx'].includes(command.type)) effects.push({ kind: 'dodge', startTick: tick, lifeTicks: 8, x: player.x, y: player.y + 20 });
      if (command.type === 'hit-stop') hitStopUntil = tick + 4;
      if (command.type === 'hud-mark') {
        const hud = document.querySelector('#combatHud'); hud.animate([{ boxShadow: '0 0 0 #ffc26700' }, { boxShadow: '0 0 34px #ffc267' }, { boxShadow: '0 12px 42px #000a' }], { duration: 260 });
      }
      window.dispatchEvent(new CustomEvent('troy:v16-presentation', { detail: command }));
    }
  }

  addEventListener('keydown', event => {
    keys.add(event.code);
    if (event.code === 'Space') { event.preventDefault(); startAction('parry'); }
    if (['ShiftLeft','ShiftRight'].includes(event.code)) { event.preventDefault(); startAction('dodge'); }
  });
  addEventListener('keyup', event => keys.delete(event.code));

  function pollGamepad() {
    const pad = navigator.getGamepads?.()[0]; if (!pad) return { x: 0, y: 0 };
    const lb = !!pad.buttons[4]?.pressed, b = !!pad.buttons[1]?.pressed;
    if (lb && !priorButtons[0]) startAction('parry');
    if (b && !priorButtons[1]) startAction('dodge');
    priorButtons = [lb, b];
    return { x: Math.abs(pad.axes[0] ?? 0) > .18 ? pad.axes[0] : 0, y: Math.abs(pad.axes[1] ?? 0) > .18 ? pad.axes[1] : 0 };
  }

  function simulationTick() {
    tick += 1;
    const pad = pollGamepad();
    let dx = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0) + pad.x;
    let dy = (keys.has('KeyS') ? 1 : 0) - (keys.has('KeyW') ? 1 : 0) + pad.y;
    const magnitude = Math.hypot(dx, dy);
    if (magnitude) { dx /= magnitude; dy /= magnitude; player.facing = Math.atan2(dy, dx); }
    const doctrine = defense.action ? HERO_DOCTRINES[hero][defense.action] : null;
    const previousDefense = defense;
    defense = stepDefense(defense, tick);
    handlePresentation(defenseTransitionCommands(previousDefense, defense, actionId));
    let distance = magnitude ? 2.8 : 0;
    if (defense.action === 'dodge' && defense.phase === 'active') distance += doctrine.distance / Math.ceil(doctrine.activeMs / TICK_MS);
    if (distance) {
      player.x = Math.max(50, Math.min(innerWidth - 50, player.x + dx * distance)); player.y = Math.max(50, Math.min(innerHeight - 50, player.y + dy * distance));
      movement += distance; if (defense.action === 'dodge') dodgeMovement += distance;
      tutorial = updateTutorialProgress(tutorial, { type: 'outcome', action: 'MOVE', distance: movement });
    }
    for (const attack of scheduler.advance(tick)) {
      activeTelegraphs.delete(attack.telegraphId);
      const outcome = resolveDefenseImpact(defense, attack, { tick, facing: player.facing });
      handlePresentation(outcome.commands);
      if (outcome.outcome === 'parried') tutorial = updateTutorialProgress(tutorial, { type: 'outcome', action: 'DEFENSE_PARRY', outcome: 'parried' });
      if (outcome.outcome === 'dodged') { pendingDodge = outcome; tutorial = updateTutorialProgress(tutorial, { type: 'outcome', action: 'DEFENSE_DODGE', outcome: 'dodged', damage: 0, distance: dodgeMovement }); }
    }
    if (pendingDodge && tutorial.step === 'dodge' && dodgeMovement >= 100) tutorial = updateTutorialProgress(tutorial, { type: 'outcome', action: 'DEFENSE_DODGE', outcome: pendingDodge.outcome, damage: pendingDodge.damage, distance: dodgeMovement });
    effects = effects.filter(effect => tick - effect.startTick <= effect.lifeTicks);
  }

  function frameForPlayer() {
    if (!manifest) return null;
    const override = poseOverride && tick <= poseOverride.untilTick ? poseOverride : null;
    if (poseOverride && !override) poseOverride = null;
    const clip = manifest.heroes[hero].clips[override?.clip ?? defense.action ?? 'parry'];
    const phase = clip.phases[override?.phase ?? defense.phase] ?? clip.phases.startup;
    const elapsed = Math.max(0, tick - (override?.startTick ?? defense.startTick));
    return phase.frames[elapsed % phase.frames.length];
  }

  function render() {
    context.clearRect(0,0,innerWidth,innerHeight);
    const gradient = context.createRadialGradient(player.x,player.y,20,player.x,player.y,Math.max(innerWidth,innerHeight)); gradient.addColorStop(0,'#5a4026');gradient.addColorStop(1,'#15100c');context.fillStyle=gradient;context.fillRect(0,0,innerWidth,innerHeight);
    context.strokeStyle='#6d4f2f';context.lineWidth=1;for(let x=0;x<innerWidth;x+=64){context.beginPath();context.moveTo(x,0);context.lineTo(x,innerHeight);context.stroke()}for(let y=0;y<innerHeight;y+=64){context.beginPath();context.moveTo(0,y);context.lineTo(innerWidth,y);context.stroke()}
    for (const telegraph of activeTelegraphs.values()) {
      context.save();context.translate(player.x,player.y);context.rotate(player.facing);context.lineWidth=5;context.strokeStyle=telegraph.defenseTag==='parryable'?'#f3c45c':'#ef725d';context.setLineDash(telegraph.shape==='split-chevron'?[12,8]:[]);context.beginPath();context.moveTo(24,-30);context.lineTo(110,0);context.lineTo(24,30);context.stroke();context.restore();
    }
    const frame = frameForPlayer();
    if (frame && atlas.complete) context.drawImage(atlas,frame.col*128,frame.row*128,128,128,player.x-64,player.y-92,128,128); else {context.fillStyle='#e3a84f';context.beginPath();context.arc(player.x,player.y,25,0,Math.PI*2);context.fill()}
    if (vfxAtlas.complete) for (const effect of effects) {
      const progress = Math.min(1, (tick - effect.startTick) / effect.lifeTicks), frameIndex = (effect.kind === 'parry' ? 0 : 4) + Math.min(3, Math.floor(progress * 4));
      context.save(); context.globalAlpha = 1 - progress; context.drawImage(vfxAtlas, frameIndex * 128, 0, 128, 128, effect.x - 64, effect.y - 64, 128, 128); context.restore();
    }
    if (tick < hitStopUntil) { context.fillStyle='#fff2';context.fillRect(0,0,innerWidth,innerHeight); }
    context.strokeStyle='#fff4';context.beginPath();context.arc(player.x,player.y,34,0,Math.PI*2);context.stroke();
    document.querySelector('#parryPhase').textContent = defense.action === 'parry' ? defense.phase : '준비';
    document.querySelector('#dodgePhase').textContent = defense.action === 'dodge' ? defense.phase : '준비';
    document.querySelector('#distanceText').textContent = `${Math.floor(movement)} px`;
    const copy = tutorialCopy(tutorial.step); document.querySelector('#tutorialStep').textContent=copy[0];document.querySelector('#tutorialText').textContent=copy[1];
  }

  function loop(now) { accumulator += Math.min(100, now - lastTime); lastTime = now; while (accumulator >= TICK_MS) { simulationTick(); accumulator -= TICK_MS; } render(); requestAnimationFrame(loop); }
  requestAnimationFrame(loop);
  const adapter = Object.freeze({
    entitySnapshot: () => entityAuditSnapshot({ selectedHero: hero }), tutorialSnapshot: () => tutorial,
    combatSnapshot: () => Object.freeze({ tick, hero, defenseAction: defense.action, defensePhase: defense.phase, movement: Math.floor(movement), dodgeMovement: Math.floor(dodgeMovement), scheduled: scheduler.snapshot() }),
    shellSnapshot: () => shell.snapshot(), startAction, setHero,
  });
  shell.registerCombat(adapter);
  if (new URLSearchParams(location.search).get('test') === '1') window.__TROY_V16_TEST__ = adapter;
  return adapter;
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  const shell = createCompositionShell();
  window.TroyV16 = Object.freeze({
    registerCombat: shell.registerCombat, registerCampaign: shell.registerCampaign,
    registerSiege: shell.registerSiege, registerHudLayer: shell.registerHudLayer, snapshot: shell.snapshot,
  });
  window.__TROY_V16_BOOT__ = { errors: [], optional: {} };
  browserCombat(shell);
  Promise.all(OPTIONAL_MODULES.map(async ([name, path]) => {
    try { window.__TROY_V16_BOOT__.optional[name] = await installOptionalModule(shell, name, path); }
    catch (error) { window.__TROY_V16_BOOT__.errors.push({ module: name, message: error.message }); throw error; }
  })).catch(error => console.error('V16 composition failed', error));
}
