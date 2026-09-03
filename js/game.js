import {
  createDefenseState,
  requestDefense,
  advanceDefense,
  enterHurtState,
  makeAttackEvent,
  resolveDefense,
  recordAppliedDamage,
  canScheduleHighThreat,
  auditHighThreatBudget,
  createDefenseTelemetry,
  auditEntitySnapshot,
} from './combat-rules-v15.js';
import {
  DAILY_RULES,
  advanceRunClocks,
  applyDailyRule,
  canGorgonPetrify,
  createDailySeed,
  createEventJournal,
  createFixedStepAccumulator,
  createRunSeed,
  createSeededRng,
  lateThreatProfile,
  normalizeV15Meta,
  scoreDailyRun,
  settleVictoryOnce,
  shouldTriggerGorgon,
  transactPurchase,
} from './run-rules-v15.js';
import { createRichPorts, defenseImpactContext, projectileIntercept, projectileTerminalEvent, resolveSpatialEvade, richEntityAudit } from './rich-integration-v16.js';
import { createAudioAdapter } from './audio-adapter-v16.js';
import { createI18n, normalizeLanguage } from './i18n-v16.js';
import { migrateLegacyStorage } from './save-migration-v16.js';
import {
  adaptBossIntent, applyBossParryResult, applyPoisonHit, bossDamageMultiplier,
  bossPatternProfile, bossRelicDropCount, consumeAmbrosiaHeal, consumeFleeceHeal,
  createBossAdaptation, createRecoveryLedger, enemyAttackTiming,
  normalizeShakeSettings, parryMissPenalty, phaseProjectileMultiplier, tickPoison,
  consumeParryFailure, bossManifestPatternRuntime, advanceParryExposure,
  resolveShakeOffset, consumeAdaptationAfterSpawn,
  createBossMechanicState, stepBossMechanic, memnonCorridorGeometry,
} from './boss-balance.js';

(() => {
  'use strict';
  window.__TROY_BOOT__={status:'loading',errors:[]};addEventListener('error',e=>window.__TROY_BOOT__.errors.push({message:e.message,line:e.lineno,column:e.colno}));

  const $ = s => document.querySelector(s);
  const canvas = $('#canvas');
  const ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });
  const dom = {
    hud: $('#hud'), menu: $('#menuOverlay'), choice: $('#choiceOverlay'), pause: $('#pauseOverlay'), end: $('#endOverlay'),
    hpFill: $('#hpFill'), xpFill: $('#xpFill'), hpText: $('#hpText'), xpText: $('#xpText'), level: $('#levelText'),
    timer: $('#timer'), stage: $('#stageName'), objective: $('#objective'), kills: $('#killText'), coins: $('#coinText'), streak: $('#streakText'),
    build: $('#buildList'), power: $('#powerText'), boss: $('#bossWrap'), bossName: $('#bossName'), bossFill: $('#bossFill'), bossPhase:$('#bossPhaseText'),bossHint:$('#bossHintText'),bossPattern:$('#bossPatternText'),
    banner: $('#eventBanner'), eventTitle: $('#eventTitle'), eventSub: $('#eventSub'), synergies: $('#synergyToast'),
    choiceKicker: $('#choiceKicker'), choiceTitle: $('#choiceTitle'), choiceSub: $('#choiceSub'), choiceCards: $('#choiceCards'),
    laurel: $('#laurelText'), metaCards: $('#metaCards'),
    dashHudText: $('#dashHudText'), dashHudFill: $('#dashHudFill'), dashHudCell: $('#dashHud'), parryHudText: $('#parryHudText'), parryHudFill: $('#parryHudFill'), parryHudCell: $('#parryHud'), dps: $('#dpsText'), heroSelect: $('#heroSelect'),
    difficulty: $('#difficultySelect'), daily: $('#dailyToggle'), curses: $('#curseSelect'), settings: $('#settingsOverlay'), codex: $('#codexOverlay'), ultimateText:$('#ultimateText'),ultimateFill:$('#ultimateFill'),
    globalXpFill:$('#globalXpFill'),globalXpText:$('#globalXpText'),globalLevel:$('#globalLevelText'),
    launchStep:$('#launchStep'),metaStep:$('#metaStep'),loadoutStep:$('#loadoutStep'),loadoutSummary:$('#loadoutSummary')
  };
  let testDailyRuleOverride=null,testRunSeedOverride=null;

  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  let ambientGameRng=createSeededRng(`${Date.now()}:${performance.now()}`),ambientVisualRng=createSeededRng(`${Date.now()}:visual`);
  const gameRandom=()=>game?.gameRng?.()??ambientGameRng();
  const visualRandom=()=>game?.visualRng?.()??ambientVisualRng();
  const rand = (a = 1, b = 0) => b + gameRandom() * (a - b);
  const visualRand = (a = 1, b = 0) => b + visualRandom() * (a - b);
  const fmtTime = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  const dist2 = (a, b) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
  const hash = (x, y, n = 0) => {
    let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(n + 17, 1442695041);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
  };

  const safeStore = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }
  };

  const GROUND_DATA = 'assets/backgrounds/ground.webp';;
  const groundImage = new Image();
  let groundReady = false;
  groundImage.onload = () => { groundReady = true; };
  groundImage.src = GROUND_DATA;
  const SPRITE_DATA = {
    hoplite: 'assets/sprites/hoplite.webp', raider: 'assets/sprites/raider.webp', skirmisher: 'assets/sprites/skirmisher.webp',
    archer: 'assets/sprites/archer.webp', shieldman: 'assets/sprites/shieldman.webp', slinger: 'assets/sprites/slinger.webp', standard: 'assets/sprites/standard.webp',
    cavalry:'assets/sprites/cavalry-v15.png',axeman:'assets/sprites/axeman-v15.png',lancer:'assets/sprites/lancer-v15.png',medic:'assets/sprites/medic-v15.png',
    firearcher:'assets/sprites/firearcher-v15.png',netter:'assets/sprites/netter-v15.png',giant:'assets/sprites/giant-v15.png',horncaller:'assets/sprites/horncaller-v15.png',
    ghost:'assets/sprites/ghost-v15.png',engineer:'assets/sprites/engineer-v15.png',amazonrider:'assets/sprites/amazonrider-v15.png',assassin:'assets/sprites/assassin-v15.png'
  };
  const spriteImages = {};
  for (const [key, src] of Object.entries(SPRITE_DATA)) { const img = new Image(); img.src = src; spriteImages[key] = img; }
  const WALK_DATA = { hoplite: 'assets/sprites/hoplite-walk.webp', trojan: 'assets/sprites/trojan-walk.webp' };
  const walkImages = {};
  for (const [key, src] of Object.entries(WALK_DATA)) { const img = new Image(); img.src = src; walkImages[key] = img; }
  const WEAPON_DATA = {
    spear: 'assets/weapons/greek-spear-v14.png', sword: 'assets/weapons/greek-sword-v14.png', javelin: 'assets/weapons/greek-javelin-v14.png', shield: 'assets/weapons/greek-shield-v14.png',
    discus:'assets/weapons/greek-discus-v14.png',firepot:'assets/weapons/greek-firepot-v14.png',sling:'assets/weapons/greek-sling-v14.png',
    bow:'assets/weapons/bow-v14.png',flail:'assets/weapons/flail-v14.png',thunder:'assets/weapons/thunder-v14.png',caltrops:'assets/weapons/caltrops-v14.png',ram:'assets/weapons/ram-v14.png'
  };
  const weaponImages = {};
  for (const [key, src] of Object.entries(WEAPON_DATA)) { const img = new Image(); img.src = src; weaponImages[key] = img; }
  const BOSS_DATA = {
    chariot: 'assets/bosses/nessos-chariot-v15.png',
    hector: 'assets/bosses/hector-v15.png', paris: 'assets/bosses/paris-v15.png', sarpedon: 'assets/bosses/sarpedon-v15.png',
    aeneas: 'assets/bosses/aeneas-v15.png', penthesilea: 'assets/bosses/penthesilea-v15.png', memnon: 'assets/bosses/memnon-v15.png'
  };
  const bossImages = {};
  for (const [key, src] of Object.entries(BOSS_DATA)) { const img = new Image(); img.decoding = 'async'; img.src = src; bossImages[key] = img; }
  const FX_DATA = { bronzeImpact: 'assets/effects/bronze-impact.png' };
  const fxImages = {};
  for (const [key, src] of Object.entries(FX_DATA)) { const img = new Image(); img.decoding = 'async'; img.src = src; fxImages[key] = img; }
  const ACTION_ICON_DATA={dash:'assets/ui/dodge-roll-v10.png',ultimate:'assets/ui/ultimate-v10.png'};
  const actionIconImages={};for(const [key,src] of Object.entries(ACTION_ICON_DATA)){const img=new Image();img.decoding='async';img.src=src;actionIconImages[key]=img}
  const eliteAtlas=new Image();eliteAtlas.decoding='async';eliteAtlas.src='assets/elites/trojan-elite-atlas-v10.png';

  const META_KEY = 'troy_save_v16', META_BACKUP_KEY='troy_save_v16_backup', LEGACY_META_KEYS=['troy_last_phalanx_v14_meta','troy_last_phalanx_v13_meta','troy_last_phalanx_v12_meta'];
  const defaultSettings = { master:.8, music:.34, sfx:.72, quality:'auto', shake:false, shakeV17Migrated:true, numbers:true,uiScale:1,colorblind:false,targetPriority:'threat',language:'ko' };
  const createDefaultMeta=()=>({ schemaVersion:16,laurels:0, might:0, vigor:0, wisdom:0, haste:0, cadence:0, reach:0, velocity:0, duration:0, amount:0, magnet:0, fortune:0, resolve:0, recovery:0, revival:0, renown:0, bestKills:0, bestLevel:1, victories:0, hero:'hoplite', difficulty:'bronze', curses:[], achievements:{}, seen:{}, defeated:{}, dailyScores:{}, lastVictory:null,lastRunSeed:null,runTimes:{missionTime:0,combatTime:0,bossCombatTime:0},settings:{...defaultSettings} });
  const originalV16Meta=safeStore.get(META_KEY,null),currentMeta=migrateLegacyStorage(localStorage),legacyMeta=LEGACY_META_KEYS.map(k=>safeStore.get(k,null)).find(v=>v&&typeof v==='object');
  const storedMeta=currentMeta||legacyMeta||{};
  let meta = { ...createDefaultMeta(), ...normalizeV15Meta(storedMeta) };
  const settingsSource=originalV16Meta||legacyMeta||{},storedSettings=settingsSource.settings&&typeof settingsSource.settings==='object'?settingsSource.settings:{};
  meta.settings = normalizeShakeSettings({ ...defaultSettings, ...(meta.settings || {}),shake:typeof storedSettings.shake==='boolean'?storedSettings.shake:false,shakeV17Migrated:storedSettings.shakeV17Migrated===true }); meta.curses ||= []; meta.achievements ||= {}; meta.seen ||= {}; meta.defeated ||= {}; meta.dailyScores ||= {};
  const HEROES = {
    hoplite:{icon:'◉',name:'테라몬',desc:'방패병 · 높은 체력과 방어',trait:'최대 체력 +16% · 안정적인 전열',ultimate:'팔랑크스 대충돌 · 광역 기절',weapon:'spear',hp:1.16,speed:.96,damage:1},
    swordsman:{icon:'⚔',name:'아킬레온',desc:'검투사 · 빠른 이동과 치명타',trait:'이동 +12% · 치명타 +9%',ultimate:'아레스의 춤 · 5연속 원형 참격',weapon:'sword',hp:.92,speed:1.12,damage:1.08,crit:.09},
    archer:{icon:'➶',name:'칼카스',desc:'여궁수 · 활과 빠른 투창',trait:'공격 속도 +22% · 낮은 체력',ultimate:'아폴론의 일제사격 · 관통 24발',weapon:'javelin',hp:.86,speed:1.05,damage:.96,rate:1.22}
  };
  const HERO_ART={hoplite:'assets/heroes/telamon.png',swordsman:'assets/heroes/achileon.png',archer:'assets/heroes/calchas-female-v14.png'};
  const heroAtlas=new Image();heroAtlas.decoding='async';heroAtlas.src='assets/animations/greek-heroes-atlas-v14.png';
  const calchasFemaleAtlas=new Image();calchasFemaleAtlas.decoding='async';calchasFemaleAtlas.src='assets/animations/calchas-female-atlas-v14.png';
  const trojanForcesAtlas=new Image();trojanForcesAtlas.decoding='async';trojanForcesAtlas.src='assets/sprites/trojan-forces-atlas-v15.png';
  const obstacleAtlas=new Image();obstacleAtlas.decoding='async';obstacleAtlas.src='assets/obstacles/greek-obstacles-atlas-v15.png';
  const defenseAtlas=new Image();defenseAtlas.decoding='async';defenseAtlas.src='assets/animations/troy-defense-atlas-v16.png';
  const assetManifests={defense:null,enemies:null,obstacles:null,bosses:null};
  const manifestEntries=manifest=>manifest?.entries||manifest?.sprites||manifest?.assets||manifest?.mapping||{};
  const manifestCell=(manifest,key,fallback)=>{const entry=manifestEntries(manifest)[key];if(!entry)return fallback;const grid=manifest.grid||{},cols=grid.columns||grid.cols||manifest.columns||1,index=entry.index??entry.cell??entry.frame??fallback;if(typeof index==='object')return{col:index.col??index.x??0,row:index.row??index.y??0,cols,rows:grid.rows||manifest.rows||1,entry};return{col:index%cols,row:Math.floor(index/cols),cols,rows:grid.rows||manifest.rows||1,entry}};
  const loadManifest=(key,url)=>fetch(url).then(response=>{if(!response.ok)throw new Error(`${url}: ${response.status}`);return response.json()}).then(data=>{assetManifests[key]=data}).catch(error=>window.__TROY_BOOT__.errors.push({message:`manifest ${key}: ${error.message}`}));
  void Promise.all([
    loadManifest('defense','assets/animations/troy-defense-atlas-v16.json'),
    loadManifest('enemies','assets/sprites/trojan-forces-atlas-v15.json'),
    loadManifest('obstacles','assets/obstacles/greek-obstacles-atlas-v15.json'),
    loadManifest('bosses','assets/bosses/troy-boss-fsm-v16.json'),
  ]);
  const phalanxMotionAtlas=new Image();phalanxMotionAtlas.decoding='async';phalanxMotionAtlas.src='assets/redesign/hoplite-motion-concept-v14.png';
  const trojanMotionAtlas=new Image();trojanMotionAtlas.decoding='async';trojanMotionAtlas.src='assets/redesign/trojan-motion-concept-v14.png';
  const combatVfxAtlas=new Image();combatVfxAtlas.decoding='async';combatVfxAtlas.src='assets/redesign/combat-vfx-atlas-v14.png';
  const WEAPON_SLOT_CAP=4;
  const DIFFICULTIES={bronze:{name:'청동',hp:1,damage:.28,spawn:1,reward:1},heroic:{name:'영웅',hp:1.38,damage:1.24,spawn:1.18,reward:1.45},mythic:{name:'신화',hp:1.82,damage:1.52,spawn:1.36,reward:2}};
  const CURSES={haste:{name:'질주의 저주',desc:'적 속도 +16%',reward:.18},frailty:{name:'깨진 흉갑',desc:'최대 체력 -20%',reward:.2},scarcity:{name:'메마른 전공',desc:'경험치 -14%',reward:.22}};
  const STAGES=[['아카이아 해변','상륙 거점을 확보하라'],['스카이아 평원','파리스의 사선을 무너뜨려라'],['트로이 성문','리키아 왕의 충격파를 피하라'],['무너진 성벽','네소스의 전차를 멈춰라'],['왕궁 외곽','아이네이아스의 방진을 깨뜨려라'],['불타는 트로이','여왕과 태양왕을 꺾어라'],['프리아모스 궁정','헥토르와 최후의 결투'],['신화의 평원','끝없는 원군을 버텨라']];
  const ACHIEVEMENTS={first:{name:'첫 번째 피',desc:'적 1명 처치'},century:{name:'백인대 파괴',desc:'한 원정 100킬'},breaker:{name:'일곱 장군',desc:'보스 7종 발견'},survivor:{name:'불멸의 방패',desc:'8분 생존'},evolved:{name:'신의 무기',desc:'무기 진화 달성'}};
  const EVOLUTIONS={spear:[{id:'phalanx',path:'thrust',name:'팔랑크스 지휘창',desc:'찌르기 특화 · 다섯 방향 관통 전열'},{id:'cycloneSpear',path:'spin',name:'트리톤의 회전창',desc:'회전 특화 · 공전 창날과 귀환 파동'}],sword:[{id:'cyclone',path:'melee',name:'에게해 회오리',desc:'근접 특화 · 360도 연속 참격'},{id:'lion',path:'throw',name:'사자의 귀환검',desc:'투검 특화 · 중상 적 처형과 귀환 강화'}],javelin:[{id:'storm',path:'volley',name:'제우스의 폭우',desc:'일제투척 특화 · 다중 투창 세례'},{id:'hunter',path:'hunter',name:'아르테미스의 추적창',desc:'저격 특화 · 고속 유도 투창'}],shield:[{id:'fortress',path:'fortress',name:'움직이는 성벽',desc:'수비 특화 · 방어와 반사 극대화'},{id:'thunder',path:'assault',name:'천둥의 아이기스',desc:'돌격 특화 · 방패 충격에 번개'}],discus:[{id:'solar',path:'swarm',name:'헬리오스의 원반진',desc:'수량 특화 · 공전 원반이 여섯 개로 증가'},{id:'razor',path:'razor',name:'크로노스의 톱니',desc:'접촉 특화 · 느리지만 보스에게 깊은 상처'}],firepot:[{id:'napalm',path:'spread',name:'헤파이스토스의 불바다',desc:'확산 특화 · 화염 지대가 이어짐'},{id:'furnace',path:'furnace',name:'트로이의 용광로',desc:'집중 특화 · 좁고 강한 반복 폭발'}],sling:[{id:'meteor',path:'heavy',name:'다윗의 유성석',desc:'중량 특화 · 폭발 파쇄석'},{id:'ricochet',path:'ricochet',name:'헤르메스 도탄석',desc:'도탄 특화 · 적 사이를 연속 비행'}]};
  Object.assign(EVOLUTIONS,{bow:[{id:'rain',path:'volley',name:'살라미스 화살비',desc:'연사 특화 · 표식 적에게 부채꼴 화살 세례'},{id:'sniper',path:'hunter',name:'아폴론의 황금시위',desc:'저격 특화 · 먼 적을 관통하는 빛의 화살'}],flail:[{id:'maelstrom',path:'orbit',name:'아레스의 쇠사슬폭풍',desc:'회전 특화 · 넓은 궤도로 포위를 해체'},{id:'crusher',path:'impact',name:'키클롭스 파쇄추',desc:'강타 특화 · 정예와 방패를 기절'}],thunder:[{id:'stormcall',path:'chain',name:'제우스의 폭풍명령',desc:'연쇄 특화 · 더 멀리 더 많은 적에게 번개'},{id:'judgment',path:'burst',name:'올림포스의 심판',desc:'집중 특화 · 표식 지점에 반복 낙뢰'}],caltrops:[{id:'field',path:'control',name:'아테나의 거부지대',desc:'제어 특화 · 넓은 감속·출혈 지대'},{id:'mine',path:'trap',name:'헤파이스토스 청동지뢰',desc:'폭발 특화 · 밟으면 파편 연쇄 폭발'}],ram:[{id:'legion',path:'line',name:'아가멤논의 공성열',desc:'관통 특화 · 여러 파성추가 전열을 밀어냄'},{id:'breach',path:'break',name:'트로이 파쇄자',desc:'단일 특화 · 방패와 정예에게 큰 충격'}]});

  const richAudio=createAudioAdapter();
  const audio={
    init:()=>void richAudio.resume(),
    apply:()=>{richAudio.setBus('master',{gain:meta.settings.master,mute:meta.settings.master===0});richAudio.setBus('music',{gain:meta.settings.music,mute:meta.settings.music===0});richAudio.setBus('combat',{gain:meta.settings.sfx,mute:meta.settings.sfx===0})},
    tick:()=>{},pause:()=>void richAudio.pause(),stop:()=>void richAudio.stop(),
    tone:(_frequency=220,_duration=.06,_type='triangle',volume=.08)=>void richAudio.play('ui_confirm',{bus:'ui',gain:volume}),
    sfx:(name,volume=1)=>void richAudio.play(({spear:'weapon_spear',sword:'weapon_sword',shield:'shield_impact',pickup:'pickup_xp',level:'ui_level',evolve:'ui_evolve',bossHorn:'boss_horn',revive:'ui_revive'})[name]||'ui_confirm',{bus:'combat',gain:volume}),
  };
  const metaInfo = {
    might:{group:'공격',icon:'⚔',name:'청동 숫돌',desc:'모든 피해 +5%.',max:5,cost:6,step:7},
    cadence:{group:'공격',icon:'⌁',name:'전투 박자',desc:'무기 재사용 시간 -2.5%.',max:2,cost:14,step:14},
    reach:{group:'공격',icon:'◎',name:'넓은 진형',desc:'공격 범위 +5%.',max:2,cost:12,step:12},
    velocity:{group:'공격',icon:'➶',name:'균형 잡힌 투사체',desc:'투사체 속도 +10%.',max:2,cost:10,step:11},
    duration:{group:'공격',icon:'⌛',name:'지속 전술',desc:'장판·투사체 지속시간 +15%.',max:2,cost:12,step:13},
    amount:{group:'공격',icon:'⋮',name:'복제 주형',desc:'일부 투사체·공전 무기 수 +1.',max:1,cost:38,step:0},
    vigor:{group:'생존',icon:'♥',name:'라케다이몬 체력',desc:'최대 체력 +8%.',max:5,cost:6,step:7},
    resolve:{group:'생존',icon:'▣',name:'청동 흉갑',desc:'받는 피해 -3%.',max:3,cost:10,step:11},
    recovery:{group:'생존',icon:'✚',name:'의무병 훈련',desc:'초당 체력 회복 +0.15.',max:5,cost:8,step:8},
    revival:{group:'생존',icon:'∞',name:'모이라이의 실',desc:'원정당 부활 +1.',max:1,cost:52,step:0},
    haste:{group:'기동',icon:'»',name:'헤르메스 각반',desc:'이동 속도 +5%.',max:2,cost:8,step:9},
    magnet:{group:'성장',icon:'◌',name:'아리아드네의 실',desc:'전공 인장 획득 범위 +25%.',max:2,cost:7,step:8},
    wisdom:{group:'성장',icon:'✦',name:'전쟁 서기관',desc:'경험치 획득량 +3%.',max:5,cost:6,step:7},
    fortune:{group:'성장',icon:'♛',name:'티케의 은총',desc:'행운 +10%: 희귀 보상·회복품 확률 증가.',max:3,cost:10,step:10},
    renown:{group:'성장',icon:'❧',name:'승전보',desc:'원정 종료 월계관 보상 +8%.',max:5,cost:9,step:9}
  };
  function normalizeMeta(raw={}){
    const clean={...createDefaultMeta(),...(raw&&typeof raw==='object'?raw:{})};
    const finite=(value,fallback,min=0,max=999999)=>clamp(Number.isFinite(Number(value))?Number(value):fallback,min,max);
    clean.schemaVersion=16;clean.laurels=Math.floor(finite(clean.laurels,0));clean.bestKills=Math.floor(finite(clean.bestKills,0));clean.bestLevel=Math.floor(finite(clean.bestLevel,1,1));clean.victories=Math.floor(finite(clean.victories,0));
    clean.hero=HEROES[clean.hero]?clean.hero:'hoplite';clean.difficulty=DIFFICULTIES[clean.difficulty]?clean.difficulty:'bronze';clean.curses=Array.isArray(clean.curses)?[...new Set(clean.curses.filter(k=>CURSES[k]))]:[];
    for(const k of ['achievements','seen','defeated','dailyScores'])if(!clean[k]||typeof clean[k]!=='object'||Array.isArray(clean[k]))clean[k]={};clean.lastVictory=clean.lastVictory&&typeof clean.lastVictory==='object'?clean.lastVictory:null;clean.lastRunSeed=typeof clean.lastRunSeed==='string'||Number.isFinite(clean.lastRunSeed)?clean.lastRunSeed:null;clean.runTimes={missionTime:finite(clean.runTimes?.missionTime,0),combatTime:finite(clean.runTimes?.combatTime,0),bossCombatTime:finite(clean.runTimes?.bossCombatTime,0)};
    clean.settings=normalizeShakeSettings({...defaultSettings,...(clean.settings&&typeof clean.settings==='object'?clean.settings:{})});
    clean.settings.master=finite(clean.settings.master,.8,0,1);clean.settings.music=finite(clean.settings.music,.34,0,1);clean.settings.sfx=finite(clean.settings.sfx,.72,0,1);clean.settings.uiScale=finite(clean.settings.uiScale,1,.8,1.35);
    if(!['auto','low','high'].includes(clean.settings.quality))clean.settings.quality='auto';if(!['nearest','threat','elite','lowHp'].includes(clean.settings.targetPriority))clean.settings.targetPriority='threat';clean.settings.language=normalizeLanguage(clean.settings.language);
    for(const k of ['numbers','colorblind'])clean.settings[k]=clean.settings[k]!==false;clean.settings.shake=clean.settings.shake===true;
    for(const [k,v] of Object.entries(metaInfo))clean[k]=Math.floor(finite(clean[k],0,0,v.max));
    return clean;
  }
  meta=normalizeMeta(meta);
  safeStore.set(META_KEY,meta);
  if(!currentMeta){safeStore.set(META_KEY,meta);if(legacyMeta)safeStore.set(META_BACKUP_KEY,legacyMeta)}
  for(const [k,v] of Object.entries(metaInfo)){meta[k]=clamp(Number(meta[k]||0),0,v.max)}
  const metaCost = (k,lv) => metaInfo[k].cost + lv * metaInfo[k].step;
  const metaRefund = () => Object.keys(metaInfo).reduce((sum,k)=>sum+Array.from({length:meta[k]},(_,i)=>metaCost(k,i)).reduce((a,b)=>a+b,0),0);

  function updateMenuStatus(){
    $('#titleLaurelText').textContent=meta.laurels;$('#loadoutLaurelText').textContent=meta.laurels;$('#bestKillsText').textContent=meta.bestKills;$('#victoryText').textContent=meta.victories;
    if(dom.loadoutSummary){const hero=HEROES[meta.hero]||HEROES.hoplite,diff=DIFFICULTIES[meta.difficulty]||DIFFICULTIES.bronze,bonus=(meta.curses||[]).reduce((n,k)=>n+(CURSES[k]?.reward||0),0),seed=createDailySeed({utcDate:new Date().toISOString().slice(0,10),hero:meta.hero,difficulty:meta.difficulty,curses:meta.curses}),dailyRule=DAILY_RULES[testDailyRuleOverride]||Object.values(DAILY_RULES)[seed%Object.keys(DAILY_RULES).length];dom.loadoutSummary.textContent=`${hero.name} · ${diff.name} 난이도${bonus?` · 보상 +${Math.round(bonus*100)}%`:''}${dom.daily.checked?` · ${dailyRule.name}: ${dailyRule.description}`:''}`}
  }
  function saveMeta() { meta=normalizeMeta(meta);safeStore.set(META_KEY, meta); renderMeta();updateMenuStatus(); }
  function renderMeta() {
    dom.laurel.textContent = meta.laurels;
    dom.metaCards.innerHTML = Object.entries(metaInfo).map(([k, v]) => {
      const lv = meta[k], cost = metaCost(k,lv), full = lv >= v.max;
      return `<div class="metaCard" data-group="${v.group}"><div class="metaCardTop"><b>${v.icon} ${v.name}</b><span class="pips">${'●'.repeat(lv)}${'○'.repeat(v.max - lv)}</span></div><small>${v.group}</small><p>${v.desc}</p><button class="metaBuy" data-meta="${k}" ${full || meta.laurels < cost ? 'disabled' : ''}>${full ? '완료' : `월계관 ${cost} 사용`}</button></div>`;
    }).join('')+`<button id="refundMetaBtn" class="metaRefund" ${metaRefund()?'' :'disabled'}>투자 회수 · 월계관 ${metaRefund()} 반환</button>`;
    dom.metaCards.querySelectorAll('[data-meta]').forEach(btn => btn.onclick = () => {
      const k = btn.dataset.meta, cost = metaCost(k,meta[k]);
      if (meta[k] < metaInfo[k].max && meta.laurels >= cost) { meta.laurels -= cost; meta[k]++; saveMeta(); }
    });
    $('#refundMetaBtn').onclick=()=>{const refund=metaRefund();if(!refund)return;meta.laurels+=refund;for(const k of Object.keys(metaInfo))meta[k]=0;saveMeta();banner('전쟁 평의회 재정비',`투자한 월계관 ${refund}개를 전부 회수했습니다`)};
  }
  renderMeta();

  let menuStep='launch';
  function setMenuStep(step){
    menuStep=step;for(const [key,el] of Object.entries({launch:dom.launchStep,meta:dom.metaStep,loadout:dom.loadoutStep}))el.classList.toggle('hidden',key!==step);
    const order=['launch','meta','loadout'],active=order.indexOf(step);document.querySelectorAll('[data-menu-step]').forEach(btn=>{const idx=order.indexOf(btn.dataset.menuStep);btn.classList.toggle('active',idx===active);btn.classList.toggle('complete',idx<active)});updateMenuStatus();
  }
  document.querySelectorAll('[data-menu-step]').forEach(btn=>btn.onclick=()=>setMenuStep(btn.dataset.menuStep));
  $('#prepareBtn').onclick=()=>setMenuStep('loadout');$('#councilBtn').onclick=()=>setMenuStep('meta');$('#metaBackBtn').onclick=()=>setMenuStep('launch');$('#metaNextBtn').onclick=()=>setMenuStep('loadout');$('#loadoutBackBtn').onclick=()=>setMenuStep('launch');

  function renderRunConfig(){
    dom.heroSelect.innerHTML=Object.entries(HEROES).map(([k,h])=>`<button class="heroCard ${meta.hero===k?'active':''}" data-hero="${k}"><img src="${HERO_ART[k]}" alt=""><b>${h.name}</b><small>${h.desc}</small><span class="heroTrait">${h.trait}</span><span class="heroUltimate">Q ${h.ultimate}</span></button>`).join('');
    dom.heroSelect.querySelectorAll('[data-hero]').forEach(b=>b.onclick=()=>{meta.hero=b.dataset.hero;saveMeta();renderRunConfig()});
    dom.difficulty.value=meta.difficulty||'bronze';dom.curses.innerHTML=Object.entries(CURSES).map(([k,c])=>`<label class="curseChip"><input type="checkbox" data-curse="${k}" ${meta.curses.includes(k)?'checked':''}> ${c.name} · +${Math.round(c.reward*100)}%</label>`).join('');
    dom.curses.querySelectorAll('[data-curse]').forEach(x=>x.onchange=()=>{meta.curses=[...dom.curses.querySelectorAll('[data-curse]:checked')].map(q=>q.dataset.curse);saveMeta();updateMenuStatus()});updateMenuStatus();
  }
  dom.difficulty.onchange=()=>{meta.difficulty=dom.difficulty.value;saveMeta()};dom.daily.onchange=updateMenuStatus; renderRunConfig();
  function unlockAchievement(id){if(meta.achievements[id])return;meta.achievements[id]=Date.now();saveMeta();toast('업적 달성',ACHIEVEMENTS[id].name)}
  function renderCodex(){const entries=Object.entries(ENEMY_DEF).map(([k,e])=>`<div class="codexEntry ${meta.seen[k]?'':'locked'}"><b>${meta.seen[k]?e.name:'???'}</b>${e.boss?(meta.defeated[k]?'격파 완료':'보스 · 미격파'):'일반 병력'}</div>`).join('');const ach=Object.entries(ACHIEVEMENTS).map(([k,a])=>`<div class="codexEntry ${meta.achievements[k]?'':'locked'}"><b>${meta.achievements[k]?'✓ ':''}${a.name}</b>${a.desc}</div>`).join('');$('#codexContent').innerHTML=`<h3>업적</h3><div class="codexGrid">${ach}</div><h3>적과 장군</h3><div class="codexGrid">${entries}</div>`}
  const i18n=createI18n({language:meta.settings.language});i18n.apply();
  function applyAccessibility(){document.documentElement.style.setProperty('--ui-scale',meta.settings.uiScale);document.body.classList.toggle('colorblind',meta.settings.colorblind)}applyAccessibility();
  function openSettings(){for(const k of ['master','music','sfx'])$('#'+k+'Volume').value=meta.settings[k];$('#languageSelect').value=meta.settings.language;$('#qualitySelect').value=meta.settings.quality;$('#targetPrioritySelect').value=meta.settings.targetPriority;$('#uiScale').value=meta.settings.uiScale;$('#shakeToggle').checked=meta.settings.shake;$('#numbersToggle').checked=meta.settings.numbers;$('#colorblindToggle').checked=meta.settings.colorblind;dom.settings.classList.remove('hidden')}
  $('#settingsBtn').onclick=openSettings;$('#settingsClose').onclick=()=>dom.settings.classList.add('hidden');$('#codexBtn').onclick=()=>{renderCodex();dom.codex.classList.remove('hidden')};$('#codexClose').onclick=()=>dom.codex.classList.add('hidden');
  for(const k of ['master','music','sfx'])$('#'+k+'Volume').oninput=e=>{meta.settings[k]=+e.target.value;saveMeta();audio.apply()};$('#languageSelect').onchange=e=>{meta.settings.language=normalizeLanguage(e.target.value);saveMeta();i18n.setLanguage(meta.settings.language)};$('#qualitySelect').onchange=e=>{meta.settings.quality=e.target.value;saveMeta();resize()};$('#targetPrioritySelect').onchange=e=>{meta.settings.targetPriority=e.target.value;saveMeta()};$('#shakeToggle').onchange=e=>{meta.settings.shake=e.target.checked;saveMeta()};$('#numbersToggle').onchange=e=>{meta.settings.numbers=e.target.checked;saveMeta()};
  $('#uiScale').oninput=e=>{meta.settings.uiScale=+e.target.value;saveMeta();applyAccessibility()};$('#colorblindToggle').onchange=e=>{meta.settings.colorblind=e.target.checked;saveMeta();applyAccessibility()};
  $('#fullscreenBtn').onclick=()=>document.fullscreenElement?document.exitFullscreen():document.documentElement.requestFullscreen();
  $('#exportBtn').onclick=()=>{const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(meta,null,2)],{type:'application/json'}));a.download='troy-v15-save.json';a.click();URL.revokeObjectURL(a.href)};$('#importBtn').onclick=()=>$('#importFile').click();$('#importFile').onchange=async e=>{try{const parsed=JSON.parse(await e.target.files[0].text());if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))throw new Error('invalid');safeStore.set(META_BACKUP_KEY,meta);meta=normalizeMeta(parsed);saveMeta();renderRunConfig();banner('기록 복원','저장 데이터를 검증한 뒤 불러왔습니다')}catch{alert('올바른 V12–V15 저장 파일이 아닙니다.')}finally{e.target.value=''}};
  $('#restoreSaveBtn').onclick=()=>{const backup=safeStore.get(META_BACKUP_KEY,null);if(!backup){alert('복구할 백업 기록이 없습니다.');return}if(!confirm('현재 기록을 백업 기록으로 교체하시겠습니까?'))return;const current=meta;meta=normalizeMeta(backup);safeStore.set(META_BACKUP_KEY,current);saveMeta();renderRunConfig();banner('기록 복구','이전 기록으로 되돌렸습니다')};
  $('#resetSaveBtn').onclick=()=>{if(!confirm('월계관, 업적, 최고 기록을 모두 초기화하시겠습니까? 백업 복구로 한 번 되돌릴 수 있습니다.'))return;safeStore.set(META_BACKUP_KEY,meta);meta=createDefaultMeta();saveMeta();renderRunConfig();dom.settings.classList.add('hidden');banner('새 전쟁 기록','원정 기록을 초기화했습니다')};setMenuStep('launch');

  let W = innerWidth, H = innerHeight, DPR = 1, last = performance.now(), mode = 'menu', game = null,impactSerial=0;
  const impactSourceIds=new WeakMap();
  let renderQuality = 'high', effectScale = 1, groundTint = null, vignette = null, tintBand = -1;
  const perfStats={frames:[],sorted:[],cursor:0,avgMs:0,p99Ms:0,onePercentLow:0,downgrades:0,lastCheck:0,lastAdjust:0,runStartedAt:0};
  const keys = new Set();
  const TEST_MODE = new URLSearchParams(location.search).has('test');
  let testFrozen=false;
  const simulation=createFixedStepAccumulator({stepSeconds:1/60,maxFrameSeconds:.05,onStep:dt=>update(dt)});
  let runIdentity=0;
  const pendingChoiceTimers=new Set();
  function cancelPendingChoiceTimers(){for(const timer of pendingChoiceTimers)clearTimeout(timer);pendingChoiceTimers.clear()}
  function scheduleRunChoice(callback,delay){const owner=game,token=owner?.runToken,timer=setTimeout(()=>{pendingChoiceTimers.delete(timer);if(!owner||game!==owner||game.runToken!==token||game.ended)return;callback(owner)},delay);pendingChoiceTimers.add(timer);return timer}

  function rebuildScreenPaint(phase = 0) {
    groundTint = ctx.createLinearGradient(0, 0, 0, H);
    groundTint.addColorStop(0, `rgba(12,22,30,${.30 + phase * .16})`);
    groundTint.addColorStop(.55, `rgba(54,36,24,${.12 + phase * .08})`);
    groundTint.addColorStop(1, 'rgba(8,12,16,.34)');
    vignette = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * .24, W / 2, H / 2, Math.max(W, H) * .73);
    vignette.addColorStop(0, 'rgba(0,0,0,0)');
    vignette.addColorStop(1, 'rgba(2,5,9,.58)');
  }

  function resize() {
    W = innerWidth; H = innerHeight;
    const pixelBudget = matchMedia('(pointer: coarse)').matches ? 1450000 : 3000000;
    const budgetDpr = Math.sqrt(pixelBudget / Math.max(1, W * H));
    DPR = Math.min(1.65, devicePixelRatio || 1, Math.max(.6, budgetDpr));
    renderQuality = DPR < .78 || W * H > 5000000 ? 'low' : DPR < 1.08 || W * H > 2600000 ? 'medium' : 'high';
    if(meta.settings.quality==='low')renderQuality='low';if(meta.settings.quality==='high')renderQuality='high';
    effectScale = renderQuality === 'high' ? 1 : renderQuality === 'medium' ? .72 : .48;
    canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.imageSmoothingEnabled = true;
    tintBand = -1; rebuildScreenPaint(0);
  }
  const PERF_WINDOW=600;
  function resetPerfWindow(now){perfStats.frames.length=0;perfStats.cursor=0;perfStats.lastAdjust=now;}
  function applyQuality(next){renderQuality=next;effectScale=next==='high'?1:next==='medium'?.72:.48;xpGemCache.clear();}
  function recordFrame(frameMs,now){
    if(mode!=='play'||frameMs<=0||frameMs>80)return;
    const frames=perfStats.frames;
    if(frames.length<PERF_WINDOW)frames.push(frameMs);else frames[perfStats.cursor]=frameMs;
    perfStats.cursor=(perfStats.cursor+1)%PERF_WINDOW;
    if(frames.length<120||now-perfStats.lastCheck<4000)return;perfStats.lastCheck=now;
    const sorted=perfStats.sorted;sorted.length=0;let sum=0;
    for(let i=0;i<frames.length;i++){sorted.push(frames[i]);sum+=frames[i];}
    sorted.sort((a,b)=>a-b);
    perfStats.avgMs=sum/frames.length;perfStats.p99Ms=sorted[Math.floor((sorted.length-1)*.99)];perfStats.onePercentLow=1000/Math.max(1,perfStats.p99Ms);
    if(meta.settings.quality!=='auto'||now-perfStats.runStartedAt<12000)return;
    if(perfStats.p99Ms>30&&renderQuality!=='low'){applyQuality(renderQuality==='high'?'medium':'low');perfStats.downgrades++;resetPerfWindow(now);toast('전장 최적화',`효과 품질을 ${renderQuality==='medium'?'중간':'낮음'}으로 조절했습니다`)}
    else if(perfStats.downgrades>0&&perfStats.p99Ms<12&&renderQuality!=='high'&&now-perfStats.lastAdjust>20000){applyQuality(renderQuality==='low'?'medium':'high');perfStats.downgrades--;resetPerfWindow(now);toast('전장 최적화',`여유가 생겨 효과 품질을 ${renderQuality==='medium'?'중간':'높음'}으로 되돌렸습니다`)}
  }
  addEventListener('resize', resize); resize();

  const WEAPON_INFO = {
    spear: { icon: '♜', name: '도리 장창', role: '중거리 · 직선 찌르기', color: '#f0c76f' },
    sword: { icon: '⚔', name: '크시포스', role: '단거리 · 부채꼴 베기', color: '#ef7661' },
    javelin: { icon: '➶', name: '아콘 투창', role: '장거리 · 단일 저격', color: '#b9a0ef' },
    shield: { icon: '◉', name: '아스피스 방패', role: '근거리 · 넉백 제어', color: '#76c8d8' },
    discus:{icon:'⊙',name:'청동 원반진',role:'공전 · 지속 접촉 피해',color:'#e7bd62'},
    firepot:{icon:'♨',name:'화염 항아리',role:'지정 지면 · 지속 장판',color:'#ee7548'},
    sling:{icon:'●',name:'아카이아 투석구',role:'벽 반사 · 연쇄 도탄',color:'#b9aa8c'},
    bow:{icon:'⌁',name:'테우크로스 복합궁',role:'원거리 · 자동 추적 연사',color:'#d7a765'},
    flail:{icon:'✣',name:'사자머리 철퇴',role:'중거리 · 회전 후 강타',color:'#d77a58'},
    thunder:{icon:'ϟ',name:'올림포스 뇌전봉',role:'연쇄 · 밀집 병력 감전',color:'#7dbfe9'},
    caltrops:{icon:'✧',name:'아테나의 마름쇠',role:'지면 설치 · 감속 방어선',color:'#9fb7a0'},
    ram:{icon:'▰',name:'아카이아 파성추',role:'직선 돌진 · 방어 파괴',color:'#c69150'}
  };

  const NODES = {
    spear: [
      { id:'spin',icon:'⟳',title:'회전창 자세',desc:'찌르기 사이에 창을 한 바퀴 휘둘러 주변을 공격합니다.' },
      { id:'orbit',icon:'⊚',title:'궤도 창날',desc:'회전창이 두 개의 공전 창날을 1.8초 남깁니다.',req:['spin'] },
      { id:'return',icon:'↶',title:'귀환하는 창끝',desc:'회전창이 끝날 때 안쪽으로 되감기는 두 번째 파동이 발생합니다.',req:['orbit'] },
      { id: 'reach', icon: '↔', title: '긴 자루', desc: '찌르기 사거리 +46. 적보다 먼저 닿습니다.' },
      { id: 'broad', icon: '▰', title: '넓은 창날', desc: '직선 판정 폭 +12. 옆으로 빗나간 적도 꿰뚫습니다.' },
      { id: 'skewer', icon: '⇥', title: '관통 자세', desc: '한 번의 찌르기가 최대 5명을 관통합니다.', req: ['reach'] },
      { id: 'fork', icon: '⋔', title: '삼각 전열', desc: '세 방향으로 찌릅니다. 각 창의 피해는 82%입니다.', req: ['broad'] },
      { id: 'bleed', icon: '♢', title: '갈고리 창날', desc: '관통한 적에게 5초 동안 출혈을 남깁니다.', req: ['skewer'] },
      { id: 'phalanx', icon: '♜', title: '팔랑크스 전개', desc: '다섯 줄의 방사형 창벽이 모든 적을 관통합니다.', req: ['fork', 'bleed'] },
      { id: 'cadence', icon: '»', title: '교대 찌르기', desc: '장창 재사용 시간이 22% 짧아집니다.', req: ['reach'] },
      { id: 'hook', icon: '↩', title: '테살리아 갈고리', desc: '창끝이 적을 밀어내는 대신 전열 안쪽으로 끌어옵니다.', req: ['bleed'] },
      { id: 'brace', icon: '⌂', title: '창대 받치기', desc: '찌르는 동안 받는 피해가 28% 감소합니다.', req: ['skewer'] },
      { id: 'echo', icon: '⇉', title: '메아리 찌르기', desc: '첫 공격 뒤 짧고 약한 두 번째 찌르기가 이어집니다.', req: ['cadence', 'fork'] }
    ],
    sword: [
      { id:'throw',icon:'➶',title:'투검',desc:'세 번째 검격마다 크시포스를 던집니다. 최대 거리에서 되돌아옵니다.' },
      { id:'ricochet',icon:'⌁',title:'청동 도탄',desc:'투검이 적 사이를 두 번 튕긴 뒤 돌아옵니다.',req:['throw'] },
      { id:'catch',icon:'↶',title:'전사의 회수',desc:'돌아온 검을 받으면 다음 근접 검격 피해가 60% 증가합니다.',req:['ricochet'] },
      { id: 'arc', icon: '◔', title: '넓은 궤적', desc: '베기 각도와 사거리가 커집니다.' },
      { id: 'double', icon: '≈', title: '되받아치기', desc: '첫 베기 뒤 반대 방향을 한 번 더 벱니다.' },
      { id: 'bleed', icon: '♢', title: '톱니 날', desc: '검에 맞은 적이 4초 동안 출혈합니다.', req: ['arc'] },
      { id: 'execute', icon: '†', title: '마무리 일격', desc: '체력 25% 이하 적에게 치명타가 확정됩니다.', req: ['double'] },
      { id: 'whirl', icon: '⟳', title: '원형 참격', desc: '부채꼴 공격이 360도 회전 공격으로 바뀝니다.', req: ['arc', 'double'] },
      { id: 'dashcut', icon: '»', title: '돌진 베기', desc: '돌진이 끝날 때 강한 검격을 일으킵니다.', req: ['execute'] },
      { id: 'lunge', icon: '⇢', title: '사자 도약', desc: '검의 탐색 범위가 늘고 공격 직전 짧게 파고듭니다.', req: ['arc'] },
      { id: 'parry', icon: '◇', title: '청동 받아넘기기', desc: '검을 휘두르는 순간 0.18초 동안 피해를 받지 않습니다.', req: ['double'] },
      { id: 'crescent', icon: '☽', title: '세 번째 초승달', desc: '세 번째 검격이 전방으로 날아가는 청동 참격을 만듭니다.', req: ['whirl', 'dashcut'] }
    ],
    javelin: [
      { id: 'eagle', icon: '⌖', title: '독수리의 눈', desc: '탐색 거리와 투사체 속도가 크게 증가합니다.' },
      { id: 'heavy', icon: '◆', title: '무거운 촉', desc: '피해 +55%. 투척 간격은 15% 길어집니다.' },
      { id: 'pierce', icon: '⇥', title: '청동 관통촉', desc: '첫 대상을 뚫고 뒤의 적 하나를 더 공격합니다.', req: ['heavy'] },
      { id: 'pin', icon: '⌁', title: '힘줄 절단', desc: '명중한 적의 이동 속도를 3초 동안 45% 낮춥니다.', req: ['eagle'] },
      { id: 'split', icon: '⋔', title: '쌍두 투창', desc: '처음 명중하면 작은 투창 두 개로 갈라집니다.', req: ['pierce'] },
      { id: 'blast', icon: '✹', title: '화약 항아리', desc: '마지막 명중 지점에서 작은 폭발을 일으킵니다.', req: ['pin', 'heavy'] },
      { id: 'volley', icon: '⋮', title: '세 자루 일제투척', desc: '피해가 낮은 투창 세 자루를 좁은 부채꼴로 던집니다.', req: ['eagle'] },
      { id: 'mark', icon: '⌾', title: '사냥꾼의 표식', desc: '명중한 적은 4초 동안 모든 피해를 18% 더 받습니다.', req: ['pin'] },
      { id: 'hunter', icon: '♞', title: '후열 사냥', desc: '궁수·투석병·자폭병을 먼저 조준하고 탐색 거리가 늘어납니다.', req: ['eagle', 'pierce'] }
    ],
    shield: [
      { id: 'radius', icon: '◎', title: '큰 방패면', desc: '충격파 범위 +35.' },
      { id: 'force', icon: '⇶', title: '밀집 대형', desc: '넉백 힘이 70% 증가합니다.' },
      { id: 'stun', icon: '✦', title: '턱 가격', desc: '밀려난 적이 0.8초 동안 기절합니다.', req: ['force'] },
      { id: 'double', icon: '◉', title: '두 겹 파동', desc: '잠시 뒤 더 큰 두 번째 충격파가 발생합니다.', req: ['radius'] },
      { id: 'reflect', icon: '↶', title: '청동 반사면', desc: '충격파가 범위 안의 적 투사체를 지웁니다.', req: ['radius', 'force'] },
      { id: 'ram', icon: '◆', title: '황소 돌진', desc: '돌진 중 접촉한 적을 방패로 들이받습니다.', req: ['stun'] },
      { id: 'guard', icon: '▣', title: '겹친 가죽 안감', desc: '방패를 든 동안 모든 피해를 추가로 10% 줄입니다.', req: ['radius'] },
      { id: 'bulwark', icon: '◒', title: '반원 방진', desc: '화살 방어 거리와 정면 각도가 크게 넓어집니다.', req: ['reflect'] },
      { id: 'counter', icon: '↯', title: '네 번째 반격', desc: '투사체 네 개를 막을 때마다 방패 충격파가 터집니다.', req: ['stun', 'reflect'] }
    ],
    discus:[
      {id:'count',icon:'⊚',title:'쌍원반',desc:'공전 원반 수 +1.'},{id:'radius',icon:'◎',title:'넓은 궤도',desc:'공전 반지름 +28.'},{id:'speed',icon:'»',title:'올림피아 회전',desc:'회전 속도 +35%.',req:['count']},{id:'edge',icon:'◇',title:'톱니 테두리',desc:'접촉 피해 +45%.',req:['radius']},{id:'guard',icon:'◒',title:'수호 궤도',desc:'원반이 적 투사체를 지웁니다.',req:['count','radius']}
    ],
    firepot:[
      {id:'radius',icon:'◎',title:'큰 항아리',desc:'화염 지대 범위 +38.'},{id:'duration',icon:'⌛',title:'송진 혼합',desc:'화염 지속시간 +2초.'},{id:'cluster',icon:'∴',title:'세 항아리',desc:'주 대상 주변에 작은 항아리 두 개를 더 던집니다.',req:['radius']},{id:'scorch',icon:'♨',title:'청동 용광로',desc:'화염 피해 +55%.',req:['duration']},{id:'trail',icon:'≈',title:'이어지는 불길',desc:'착탄 지점에서 플레이어 쪽으로 불길이 이어집니다.',req:['cluster','scorch']}
    ],
    sling:[
      {id:'bounce',icon:'⌁',title:'첫 도탄',desc:'투석이 다른 적에게 한 번 튕깁니다.'},{id:'heavy',icon:'◆',title:'납탄',desc:'피해 +65%, 속도 -12%.'},{id:'split',icon:'⋔',title:'파쇄석',desc:'마지막 명중에서 세 파편으로 갈라집니다.',req:['bounce']},{id:'stun',icon:'✦',title:'관자놀이',desc:'강한 타격이 짧게 기절시킵니다.',req:['heavy']},{id:'storm',icon:'⋮',title:'돌팔매 폭풍',desc:'두 발을 연속 발사합니다.',req:['split','stun']}
    ]
  };

  Object.assign(NODES,{
    bow:[{id:'double',icon:'⋮',title:'두 겹 시위',desc:'한 번에 화살을 두 발 발사합니다.'},{id:'seek',icon:'⌖',title:'독수리 조준',desc:'화살이 원거리 적을 우선 추적합니다.'},{id:'pierce',icon:'⇥',title:'관통 화살촉',desc:'화살이 적 둘을 추가로 관통합니다.',req:['seek']},{id:'fan',icon:'⋔',title:'반월 일제사격',desc:'세 방향 화살을 발사합니다.',req:['double']},{id:'mark',icon:'⌾',title:'왕가의 표식',desc:'명중한 정예가 받는 피해가 증가합니다.',req:['seek']}],
    flail:[{id:'radius',icon:'◎',title:'긴 쇠사슬',desc:'철퇴의 회전 반경이 커집니다.'},{id:'impact',icon:'◆',title:'무거운 철구',desc:'마지막 강타 피해와 넉백이 증가합니다.'},{id:'orbit',icon:'⟳',title:'연속 회전',desc:'강타 전 두 번 회전합니다.',req:['radius']},{id:'stun',icon:'✦',title:'투구 파쇄',desc:'강타가 적을 기절시킵니다.',req:['impact']},{id:'bleed',icon:'♢',title:'가시 철구',desc:'회전 접촉이 출혈을 남깁니다.',req:['orbit']}],
    thunder:[{id:'jumps',icon:'ϟ',title:'갈라진 번개',desc:'연쇄 대상이 두 명 늘어납니다.'},{id:'focus',icon:'⌾',title:'폭풍 표식',desc:'첫 대상에게 더 큰 피해를 줍니다.'},{id:'range',icon:'↔',title:'먹구름 전도',desc:'연쇄 거리가 증가합니다.',req:['jumps']},{id:'burst',icon:'✹',title:'두 번째 낙뢰',desc:'잠시 뒤 첫 지점에 다시 떨어집니다.',req:['focus']},{id:'shock',icon:'⌁',title:'감전',desc:'적의 이동을 짧게 늦춥니다.',req:['range']}],
    caltrops:[{id:'count',icon:'∴',title:'마름쇠 자루',desc:'설치 지점이 두 곳 늘어납니다.'},{id:'slow',icon:'⌁',title:'힘줄 노리기',desc:'지대 감속 효과가 강해집니다.'},{id:'bleed',icon:'♢',title:'갈고리 가시',desc:'지대가 출혈을 남깁니다.',req:['slow']},{id:'blast',icon:'✹',title:'불씨 매듭',desc:'지대가 사라질 때 폭발합니다.',req:['count']},{id:'wide',icon:'◎',title:'흩뿌리기',desc:'지대 범위가 증가합니다.',req:['count']}],
    ram:[{id:'width',icon:'▰',title:'넓은 충각',desc:'파성추의 판정 폭이 증가합니다.'},{id:'pierce',icon:'⇥',title:'공성열',desc:'모든 일반 적을 관통합니다.'},{id:'break',icon:'◇',title:'방패 파쇄',desc:'방패병·정예에게 추가 피해를 줍니다.',req:['width']},{id:'echo',icon:'⇉',title:'후속 공성추',desc:'잠시 뒤 작은 파성추가 이어집니다.',req:['pierce']},{id:'stun',icon:'✦',title:'성문 충격',desc:'끝 지점에서 적을 기절시킵니다.',req:['break']}]
  });

  const WEAPON_PATHS={
    spear:{
      thrust:{icon:'⇥',name:'아카이아 창벽',desc:'사거리·관통·출혈을 연결해 전방을 꿰뚫습니다.',grant:'reach',nodes:['reach','skewer','bleed','cadence','brace','fork','broad','phalanx','echo']},
      spin:{icon:'⟳',name:'트리톤의 소용돌이',desc:'주변 회전·공전 창날·귀환 파동으로 포위를 풉니다.',grant:'spin',nodes:['spin','orbit','return','broad']}
    },
    sword:{
      melee:{icon:'⚔',name:'미르미돈 검무',desc:'넓은 근접 베기·패링·360도 회오리를 완성합니다.',grant:'arc',nodes:['arc','double','bleed','execute','whirl','dashcut','lunge','parry','crescent']},
      throw:{icon:'↶',name:'헤르메스 귀환검',desc:'검을 던져 도탄시키고 회수해 다음 일격을 강화합니다.',grant:'throw',nodes:['throw','ricochet','catch','double','execute']}
    },
    javelin:{
      volley:{icon:'⋮',name:'제우스의 뇌우진',desc:'여러 창을 부채꼴로 던지고 착탄 지점을 폭파합니다.',grant:'volley',nodes:['volley','heavy','pierce','split','pin','blast']},
      hunter:{icon:'⌖',name:'아르테미스 사냥표식',desc:'후열을 우선 조준하고 감속·표식으로 보스를 추적합니다.',grant:'eagle',nodes:['eagle','pin','mark','hunter','heavy','pierce']}
    },
    shield:{
      fortress:{icon:'▣',name:'아테나의 청동성벽',desc:'범위·반사·방어로 투사체 전열을 버팁니다.',grant:'radius',nodes:['radius','double','reflect','guard','bulwark']},
      assault:{icon:'◆',name:'아레스의 파성추',desc:'넉백·기절·돌진 충돌로 근접 전열을 무너뜨립니다.',grant:'force',nodes:['force','stun','ram','radius','double']}
    },
    discus:{
      swarm:{icon:'⊚',name:'헬리오스 태양환',desc:'원반 수와 회전 속도를 늘려 넓은 영역을 지킵니다.',grant:'count',nodes:['count','speed','radius','guard']},
      razor:{icon:'◇',name:'크로노스 절단륜',desc:'적은 수의 큰 원반으로 접촉 피해를 집중합니다.',grant:'edge',nodes:['edge','radius','count','speed','guard']}
    },
    firepot:{
      spread:{icon:'∴',name:'헤파이스토스 용암길',desc:'여러 항아리와 이어지는 불길로 길목을 봉쇄합니다.',grant:'radius',nodes:['radius','cluster','duration']},
      furnace:{icon:'♨',name:'일리오스 공성화로',desc:'지속시간과 화력을 모아 보스가 머무는 곳을 태웁니다.',grant:'scorch',nodes:['scorch','duration','radius']}
    },
    sling:{
      ricochet:{icon:'⌁',name:'오디세우스 도탄술',desc:'가벼운 돌을 여러 적 사이로 연쇄 도탄시킵니다.',grant:'bounce',nodes:['bounce','split','heavy','stun','storm']},
      heavy:{icon:'◆',name:'키클롭스 파쇄석',desc:'느린 납탄으로 단일 대상과 보스에게 큰 충격을 줍니다.',grant:'heavy',nodes:['heavy','stun','bounce','split','storm']}
    }
  };

  Object.assign(WEAPON_PATHS,{
    bow:{volley:{icon:'⋮',name:'살라미스 일제사격',desc:'화살 수와 부채꼴 범위를 늘려 다수의 적을 정리합니다.',grant:'double',nodes:['double','fan','pierce','mark']},hunter:{icon:'⌖',name:'테우크로스의 명궁',desc:'먼 원거리 적과 정예를 추적해 관통시킵니다.',grant:'seek',nodes:['seek','pierce','mark','double']}},
    flail:{orbit:{icon:'⟳',name:'아레스의 회전진',desc:'긴 쇠사슬과 연속 회전으로 포위망을 걷어냅니다.',grant:'radius',nodes:['radius','orbit','bleed','impact']},impact:{icon:'◆',name:'키클롭스 강타',desc:'무거운 철구로 정예를 기절시키고 전열을 밀어냅니다.',grant:'impact',nodes:['impact','stun','radius','bleed']}},
    thunder:{chain:{icon:'ϟ',name:'이다산 연쇄뇌전',desc:'번개가 더 멀리 더 많은 적에게 이어집니다.',grant:'jumps',nodes:['jumps','range','shock','focus']},burst:{icon:'✹',name:'올림포스 심판',desc:'강한 낙뢰를 한 지점에 반복해 정예를 제거합니다.',grant:'focus',nodes:['focus','burst','shock','range']}},
    caltrops:{control:{icon:'⌁',name:'아테나의 거부선',desc:'넓은 감속·출혈 지대로 접근로를 통제합니다.',grant:'slow',nodes:['slow','bleed','wide','count']},trap:{icon:'✹',name:'헤파이스토스 지뢰진',desc:'여러 지점을 설치하고 종료 폭발을 연쇄시킵니다.',grant:'count',nodes:['count','blast','wide','bleed']}},
    ram:{line:{icon:'⇥',name:'아카이아 공성열',desc:'넓고 긴 파성추가 일반 전열을 연속 관통합니다.',grant:'pierce',nodes:['pierce','width','echo','stun']},break:{icon:'◇',name:'성문 파쇄술',desc:'정예·방패병에게 집중 피해와 기절을 줍니다.',grant:'break',nodes:['break','stun','width','echo']}}
  });

  const BLESSINGS = {
    athena: { icon: '🦉', name: '아테나의 아이기스', desc: '12초마다 다음 피해를 완전히 막고 주변 적을 1초 기절시킵니다.', color: '#77c7dc' },
    ares: { icon: '◆', name: '아레스의 전의', desc: '20명을 처치할 때마다 6초 동안 모든 피해가 두 배가 됩니다.', color: '#e65f4f' },
    zeus: { icon: 'ϟ', name: '제우스의 일곱 번째 벼락', desc: '일곱 번째 무기 적중마다 네 명을 잇는 벼락이 떨어집니다.', color: '#f1d361' },
    hermes: { icon: '☤', name: '헤르메스의 쌍익', desc: '돌진 충전이 두 개가 되고 충전 시간이 25% 짧아집니다.', color: '#78cfad' },
    apollo: { icon: '☀', name: '아폴론의 새벽', desc: '45초마다 치명상을 한 번 견디고 최대 체력의 35%를 회복합니다.', color: '#f0ad56' }
  };

  const RELICS = {
    trojanBow: { icon: '🏹', name: '트로이 왕가의 활', desc: '2.8초마다 가장 먼 적에게 세 발의 화살을 발사합니다.' },
    gorgon: { icon: '◈', name: '고르곤의 파편', desc: '400명을 처치할 때마다 주변 일반·정예 적을 2.5초 동안 석화합니다. 보스에게는 통하지 않습니다.' },
    daedalus: { icon: '⚙', name: '다이달로스의 톱니', desc: '모든 무기의 재사용 시간이 14% 짧아집니다.' },
    fleece: { icon: '♛', name: '황금 양털 조각', desc: '정예 처치 시 3+레벨, 보스 처치 시 5+레벨만큼 회복합니다.' },
    icarus: { icon: '♨', name: '이카로스의 깃', desc: '돌진 경로에 적을 태우는 불길을 남깁니다.' },
    aegis: { icon: '◇', name: '깨진 아이기스', desc: '가까운 적 투사체를 주기적으로 자동 파괴합니다.' },
    hourglass:{icon:'⌛',name:'크로노스의 모래',desc:'공격 속도가 단계마다 7% 증가합니다.'},
    club:{icon:'♣',name:'헤라클레스의 몽둥이 조각',desc:'모든 피해와 넉백이 단계마다 6% 증가합니다.'},
    cup:{icon:'♨',name:'히기에이아의 잔',desc:'최대 체력 +12, 즉시 18 회복합니다.'},
    owl:{icon:'◉',name:'아테나의 청동 부엉이',desc:'치명타 확률이 단계마다 1.5% 증가합니다.'},
    sandals:{icon:'»',name:'헤르메스의 샌들 끈',desc:'이동 속도 +4%, 돌진 충전이 짧아집니다.'},
    laurel:{icon:'❧',name:'델포이의 월계수',desc:'경험치와 획득 범위가 단계마다 증가합니다.'},
    stormAmphora:{icon:'ϟ',name:'폭풍을 담은 암포라',desc:'연쇄·장판 무기의 범위가 커지고 낙뢰가 빨라집니다.'},
    moonstone:{icon:'☾',name:'셀레네의 월석',desc:'공전·귀환 무기의 지속시간과 치명타율이 증가합니다.'},
    warDrum:{icon:'◉',name:'미르미돈 전고',desc:'전술 웨이브를 끝내면 8초 동안 공격 속도가 증가합니다.'},
    bowstring:{icon:'⌁',name:'트로이 왕가의 시위',desc:'화살·투창·투석의 속도와 관통력이 강화됩니다.'},
    forgeHammer:{icon:'◆',name:'헤파이스토스의 망치',desc:'장애물과 방패병에게 주는 피해가 증가합니다.'},
    obsidianEye:{icon:'◈',name:'흑요석 예언안',desc:'정예·자폭·원거리 적에게 치명타 확률이 증가합니다.'},
    seaCharm:{icon:'◌',name:'포세이돈의 조개부적',desc:'피해를 받으면 주변 적을 밀어내는 파도가 발생합니다.'},
    brokenCrown:{icon:'♛',name:'프리아모스의 부서진 관',desc:'보스 피해가 증가하지만 일반 적 접촉 피해도 증가합니다.'}
  };

  const RELIC_ART={trojanBow:'assets/relics/bowstring-v14.png',gorgon:'assets/relics/gorgonshard-v14.png',daedalus:'assets/relics/labyrinthgear-v14.png',fleece:'assets/relics/fleeceknot-v14.png',icarus:'assets/relics/wingclasp-v14.png',aegis:'assets/relics/owlseal-v14.png',hourglass:'assets/relics/moonstone-v14.png',club:'assets/relics/bloodspear-v14.png',cup:'assets/relics/healingcup-v14.png',owl:'assets/relics/owlseal-v14.png',sandals:'assets/relics/wingclasp-v14.png',laurel:'assets/relics/laurelbrooch-v14.png',stormAmphora:'assets/relics/stormamphora-v14.png',moonstone:'assets/relics/moonstone-v14.png',warDrum:'assets/relics/wardrum-v14.png',bowstring:'assets/relics/bowstring-v14.png',forgeHammer:'assets/relics/forgehammer-v14.png',obsidianEye:'assets/relics/obsidianeye-v14.png',seaCharm:'assets/relics/seacharm-v14.png',brokenCrown:'assets/relics/brokencrown-v14.png'};

  const FUSIONS = {
    spear: { relic: 'daedalus', name: '다이달로스 공성창', desc: '네 번째 찌르기가 전방에 청동 충격파를 보내 원거리 전열까지 휩씁니다.' },
    sword: { relic: 'gorgon', name: '고르곤의 크시포스', desc: '검격이 석화 파편을 흩뿌리고 넓은 원형 참격으로 변합니다.' },
    javelin: { relic: 'trojanBow', name: '파리스의 천궁창', desc: '투창이 착탄하면 주변 원거리 적에게 하늘의 투창 세례가 이어집니다.' },
    shield: { relic: 'aegis', name: '완전한 아이기스', desc: '전방 화살을 막고 피해를 줄이며, 막은 투사체를 청동 파편으로 되돌립니다.' },
    discus:{relic:'moonstone',name:'셀레네의 월륜',desc:'원반이 두 궤도를 오가며 적 투사체를 지웁니다.'},
    firepot:{relic:'stormAmphora',name:'천둥불 암포라',desc:'화염 지대 안의 적에게 주기적으로 낙뢰가 떨어집니다.'},
    sling:{relic:'forgeHammer',name:'키클롭스 공성탄',desc:'마지막 도탄이 방어를 깨는 넓은 파쇄 충격을 만듭니다.'},
    bow:{relic:'bowstring',name:'트로이 왕가의 황금궁',desc:'화살이 표식 적을 추적하고 처치 시 다음 화살을 복제합니다.'},
    flail:{relic:'gorgon',name:'고르곤의 사슬철퇴',desc:'강타 지점의 적을 석화하고 파편을 사방으로 흩뿌립니다.'},
    thunder:{relic:'stormAmphora',name:'제우스의 폭풍그릇',desc:'연쇄 마지막 대상에서 넓은 두 번째 낙뢰가 터집니다.'},
    caltrops:{relic:'obsidianEye',name:'예언자의 밤가시',desc:'위협 병종 아래에 마름쇠가 자동 생성됩니다.'},
    ram:{relic:'forgeHammer',name:'헤파이스토스 파성추',desc:'끝 지점에서 합산 폭발이 발생해 방패와 정예를 파괴합니다.'}
  };

  const RARE_REWARDS = {
    lion: { icon: '♞', name: '네메아의 가죽', desc: '받는 피해 -15%, 최대 체력 +24.', apply: g => { g.player.armor += .15; g.player.maxHp += 24; g.player.hp += 24; } },
    myrmidon: { icon: '♜', name: '미르미돈의 군기', desc: '30명을 처치할 때마다 사방에서 창 여덟 개가 날아듭니다.', apply: g => { g.rare.myrmidon = true; } },
    ambrosia: { icon: '✦', name: '암브로시아 한 방울', desc: '최대 체력 +40. 정예 피해 2%, 보스 피해 1%를 회복하며 초당 최대 2 HP입니다.', apply: g => { g.rare.ambrosia = true; g.player.maxHp += 40; g.player.hp += 40; } },
    hephaestus: { icon: '♨', name: '헤파이스토스의 불씨', desc: '모든 무기 적중이 4초 동안 화상을 남깁니다.', apply: g => { g.rare.hephaestus = true; } },
    fate: { icon: '∞', name: '모이라이의 매듭', desc: '이번 원정에서 치명상을 한 번 무시하고 50% 체력으로 돌아옵니다.', apply: g => { g.rare.fate = true; g.rare.fateReady = true; } },
    titan: { icon: '▰', name: '티탄의 힘줄', desc: '넉백과 무기 범위 +25%, 이동 속도 -5%.', apply: g => { g.rare.titan = true; g.player.speed *= .95; } }
  };

  const ENEMY_DEF = {
    raider: { name: '트로이 창병', r: 16, hp: 31, speed: 67, damage: 10, xp: 2.8, color: '#a84937' },
    skirmisher: { name: '리키아 칼잡이', r: 9, hp: 17, speed: 152, damage: 7, xp: 2.7, color: '#80576b' },
    archer: { name: '일리오스 궁수', r: 14, hp: 31, speed: 52, damage: 11, xp: 4.2, color: '#9b7044' },
    shieldman: { name: '트로이 방패병', r: 20, hp: 64, speed: 48, damage: 14, xp: 7.4, color: '#6f3d37' },
    slinger: { name: '프리기아 투석병', r: 13, hp: 29, speed: 66, damage: 9, xp: 4.8, color: '#60705a' },
    standard: { name: '트로이 기수', r: 19, hp: 126, speed: 47, damage: 13, xp: 12, color: '#9e342f' },
    bomber: { name: '불붙은 항아리병', r: 12, hp: 23, speed: 96, damage: 27, xp: 4.1, color: '#a9492e' },
    eliteCaptain:{name:'왕실 도리대장',r:23,hp:300,speed:74,damage:25,xp:23,color:'#9f352f'},
    eliteArcher:{name:'진홍의 신탁궁수',r:20,hp:220,speed:64,damage:20,xp:22,color:'#7f3657'},
    eliteDrummer:{name:'트로이 전고수',r:25,hp:250,speed:55,damage:19,xp:25,color:'#6e3b32'},
    cavalry:{name:'다르다니아 기마척후',r:22,hp:74,speed:185,damage:16,xp:8.2,color:'#4d7891'},
    axeman:{name:'트라키아 도끼광',r:19,hp:104,speed:78,damage:22,xp:9.4,color:'#76503d'},
    lancer:{name:'리키아 장창수',r:20,hp:88,speed:70,damage:19,xp:8.8,color:'#9a503b'},
    medic:{name:'일리오스 약초사',r:16,hp:54,speed:72,damage:7,xp:9.2,color:'#8aa177'},
    firearcher:{name:'스카이아 화궁수',r:15,hp:45,speed:58,damage:13,xp:7.6,color:'#b65d37'},
    netter:{name:'프리기아 그물투사',r:17,hp:62,speed:92,damage:10,xp:7.8,color:'#776655'},
    giant:{name:'이다산 청동거인',r:28,hp:230,speed:43,damage:28,xp:17,color:'#6b5141'},
    horncaller:{name:'프리아모스 나팔수',r:18,hp:96,speed:54,damage:9,xp:13,color:'#694462'},
    ghost:{name:'스틱스 망령검사',r:17,hp:68,speed:118,damage:15,xp:10.5,color:'#557e8e'},
    engineer:{name:'트로이 공성기술자',r:18,hp:78,speed:61,damage:17,xp:11,color:'#8c553a'},
    amazonrider:{name:'테르모돈 기마전사',r:23,hp:128,speed:158,damage:21,xp:14,color:'#9b5b55'},
    assassin:{name:'왕궁의 자색칼날',r:13,hp:49,speed:174,damage:18,xp:9.8,color:'#5c436c'},
    chariot: { name: '네소스의 붉은 전차', r: 42, hp: 6000, speed: 142, damage: 45, xp: 82, color: '#762925', boss: true },
    paris: { name: '트로이의 파리스', r: 35, hp: 2500, speed: 120, damage: 35, xp: 68, color: '#b05445', boss: true },
    sarpedon: { name: '리키아의 사르페돈', r: 38, hp: 4900, speed: 116, damage: 39, xp: 78, color: '#51728d', boss: true },
    aeneas: { name: '다르다니아의 아이네이아스', r: 38, hp: 6900, speed: 94, damage: 42, xp: 96, color: '#56799d', boss: true },
    penthesilea: { name: '아마존의 펜테실레이아', r: 34, hp: 7800, speed: 158, damage: 40, xp: 108, color: '#713b69', boss: true },
    memnon: { name: '에티오피아의 멤논', r: 40, hp: 8800, speed: 105, damage: 47, xp: 124, color: '#b47739', boss: true },
    hector: { name: '트로이의 헥토르', r: 36, hp: 10800, speed: 102, damage: 46, xp: 150, color: '#9c592b', boss: true }
  };
  const RANGED_ENEMY_TYPES=new Set(['archer','slinger','firearcher','netter','engineer','eliteArcher','eliteDrummer','medic','horncaller']);
  const DANGEROUS_LATE_TYPES=new Set(['archer','slinger','bomber','lancer','medic','firearcher','netter','giant','horncaller','engineer','amazonrider','assassin']);

  const xpRequirement = level => {
    const opening = [0, 10, 16, 24, 34, 48, 64, 82, 104, 130, 160];
    if (level < opening.length) return opening[level];
    const late = level - 10;
    return Math.floor(160 + late * 23 + late * late * 1.65);
  };
  const weaponLevel = w => 1 + Object.keys(w.nodes).length;
  const hasNode = (k, id) => !!game.weapons[k]?.nodes[id];
  const weaponPower = k => game.weapons[k]?.power || 1;
  const angleDelta = (to, from) => Math.atan2(Math.sin(to - from), Math.cos(to - from));
  const godColor = k => BLESSINGS[k].color;

  function newGame() {
    const hero=HEROES[meta.hero]||HEROES.hoplite,diff=DIFFICULTIES[meta.difficulty]||DIFFICULTIES.bronze, cursed=meta.curses||[];
    const richPorts=createRichPorts(meta.hero);
    const utcDate=new Date().toISOString().slice(0,10),dailySeed=createDailySeed({utcDate,hero:meta.hero,difficulty:meta.difficulty,curses:cursed}),injectedRunSeed=!dom.daily.checked&&TEST_MODE?testRunSeedOverride:null,runSeed=dom.daily.checked?dailySeed:(injectedRunSeed??createRunSeed()),gameRng=createSeededRng(runSeed),visualRng=createSeededRng(`${runSeed}:visual`),dailyRuleIds=Object.keys(DAILY_RULES),dailyRule=dom.daily.checked?(DAILY_RULES[testDailyRuleOverride]?testDailyRuleOverride:dailyRuleIds[dailySeed%dailyRuleIds.length]):null,eventJournal=createEventJournal();
    if(injectedRunSeed!==null)testRunSeedOverride=null;
    const maxHp = Math.round(108*(1+meta.vigor*.08)*hero.hp*(cursed.includes('frailty')?.8:1));
    const campaign=richPorts.campaign.create({hero:meta.hero,hp:maxHp,drachma:0}),objective=richPorts.objective.create(campaign.stage,{x:420,y:0});
    return {
      runToken:++runIdentity,time: 0, missionTime:0,combatTime:0,bossCombatTime:0, level: 1, xp: 0, xpNeed: xpRequirement(1), kills: 0, coins: 0, streak: 1, streakClock: 0,
      rich:{ports:richPorts,scheduler:new richPorts.intent.Scheduler(),defense:richPorts.defense.create(meta.hero),dodgeTelemetry:null,campaign,objective,wallet:{drachma:0,safeGateTokens:[]},shop:null,shopSelection:0,fixedTick:0,intentSerial:0,consumedImpacts:new Set(),cueHistory:[],combatJournal:[],objectiveHistory:[],pendingStage:null,objectiveWorldInstalled:false},
      bossKills: 0, ended: false, hectorDefeated: false,victorySettled:false,victoryReward:0, victoryMode:false,eventFlags: new Set(), choiceQueue: [],
      player: {
        x: 0, y: 0, vx: 0, vy: 0, moveHeading: 0, r: 15, hp: maxHp, maxHp, speed: 220*hero.speed*(1+meta.haste*.05), damage: (1 + meta.might * .05)*hero.damage, armor: meta.resolve*.03,
        magnet: 82*(1+meta.magnet*.25), xpGain: (1 + meta.wisdom*.03)*(cursed.includes('scarcity')?.86:1), attackRate: (hero.rate||1)/(1-meta.cadence*.025), crit: (hero.crit||.04)+meta.fortune*.01, luck:1+meta.fortune*.1, area:1+meta.reach*.05, projectileSpeed:1+meta.velocity*.1,duration:1+meta.duration*.15,amount:meta.amount,recovery:.45+meta.recovery*.15,revives:meta.revival, aim: 0, invuln: 0,
        flash: 0, slow: 0, exposedTicks:0, handledParryFailures:0, motion: null, moving: false, walkPhase: 0, stepMark: 0, dashTime: 0, dashX: 0, dashY: 0, dashCharges: 1,lastStandCd:0,
        dashMax: 1, dashRecharge: 0, dashBase: 4.4, dashHit: new Set(), ultimate:0,parry:0,parryCd:0,parries:0,ultimateUses:0,
        defense:createDefenseState({},createDefenseTelemetry()),defenseBuild:{parryWindow:0,counterPower:0,parryRecovery:0,dodgeDistance:0,dodgeRecovery:0,dodgeExitGuard:0}
      },
      hero:meta.hero,difficulty:meta.difficulty,diff,curses:cursed,daily:dom.daily.checked,dailySeed,runSeed,gameRng,visualRng,dailyRule,eventJournal,weapons: { [hero.weapon]: { cd: .22, nodes: {}, combo: 0, power: 1 } }, blessings: {}, relics: {}, rare: {}, fusions: {}, training: { hp: 0, step: 0, reach: 0, tempo: 0 }, endless: { might: 0, guard: 0, tempo: 0, fortune: 0 },
      enemies: [], projectiles: [], pickups: [], particles: [], texts: [], attacks: [], hazards: [], zones: [], encounters: [], allies: [], enemyGrid: new Map(),obstacleGrid:new Map(),renderAudit:[],lastRenderShakeOffset:{x:0,y:0},
      camera: { x: 0, y: 0 }, spawnAcc: 0, encircleCd: 24, waveCd: 16, waveIndex: 0, waveBurst: 0, encounterCd: 68+gameRng()*32, arrowRain: 0, arrowTick: 0, surge: 0,
      hitStop: 0, shake: 0, flash: 0, boss: null, arena: null, bossIntro:0, buffs: { fury: 0, beacon: 0,myrmidon:0,warDrum:0 }, beaconCd: 0,supportCd:0,
      godHitCounter: 0, aresKills: 0, aresTime: 0, athenaReady: 0, apolloCd: 0,recoveryLedger:createRecoveryLedger(),poison:null,
      relicTimers: { bow: 2.8, aegis: 0 }, rareKillMark: 30, hostileProjectiles: 0, hudAcc: 0, stageIndex:-1, rerolls:2+Math.floor(meta.fortune/2), banishes:1, currentContext:'level', currentChoices:[], damageStats:{total:0,by:{}}, obstacles:[], worldSectors:new Map(), exploredSectors:new Set(),activeSectorKey:''
    };
  }

  function startRun() {
    cancelPendingChoiceTimers();audio.init();void richAudio.resume();richAudio.startBattlefield('shore'); game = newGame();meta.lastRunSeed=game.runSeed;saveMeta();mode = 'play';simulation.reset();if(TEST_MODE)testFrozen=true;last=performance.now();perfStats.frames.length=0;perfStats.avgMs=perfStats.p99Ms=perfStats.onePercentLow=0;perfStats.lastCheck=perfStats.runStartedAt=performance.now();
    dom.menu.classList.add('hidden'); dom.end.classList.add('hidden'); dom.pause.classList.add('hidden'); dom.choice.classList.add('hidden');
    dom.hud.classList.remove('hidden');
    for (let i = 0; i < 12; i++) spawnEnemy(i % 4 === 0 ? 'skirmisher' : 'raider', false, i * TAU / 12 + .22, rand(300, 220));
    $('.name').textContent=HEROES[game.hero].name;updateBuild(); updateHud(); updateStage(true);installObjectiveWorld(game.rich.campaign.stage);const dailyText=DAILY_RULES[game.dailyRule]?.description;banner(`${HEROES[game.hero].name} 출전`, game.daily?dailyText:'일곱 장군의 전열을 돌파하십시오');audio.tone(196,.22,'sawtooth',.1);if(!meta.tutorialDone&&!TEST_MODE)startTutorial();
  }

  function returnMenu() {
    cancelPendingChoiceTimers();mode = 'menu'; audio.stop();void richAudio.stop();game = null; dom.hud.classList.add('hidden');
    dom.pause.classList.add('hidden'); dom.end.classList.add('hidden'); dom.choice.classList.add('hidden'); dom.menu.classList.remove('hidden'); renderMeta();setMenuStep('launch');
  }

  function stageData(t) {
    return STAGES[Math.min(STAGES.length-1,Math.floor(t/70))];
  }
  const OBSTACLE_DEF={column:{r:40,hp:150,solid:true},barrier:{r:52,hp:190,solid:true},rock:{r:46,hp:220,solid:true},fire:{r:27,hp:Infinity,solid:false}};
  const SECTOR_SIZE=960,SECTOR_RADIUS=2;
  const sectorKey=(x,y)=>`${x},${y}`;
  function makeSector(sx,sy){
    const key=sectorKey(sx,sy),sector={key,sx,sy,props:[],site:null,siteSpawned:false,siteConsumed:false};
    const count=3+Math.floor(hash(sx,sy,17)*3);
    for(let i=0;i<count;i++){
      const x=(sx+.12+hash(sx,sy,30+i*5)*.76)*SECTOR_SIZE,y=(sy+.12+hash(sx,sy,31+i*5)*.76)*SECTOR_SIZE;
      if(sx===0&&sy===0&&Math.hypot(x,y)<310)continue;
      const type=['barrier','rock','column','fire'][Math.floor(hash(sx,sy,32+i*5)*4)],def=OBSTACLE_DEF[type];
      sector.props.push({x,y,r:def.r*(.88+hash(sx,sy,33+i*5)*.24),type,hp:def.hp,maxHp:def.hp,solid:def.solid,flash:0,popCd:0,sector:key});
    }
    if((sx||sy)&&hash(sx,sy,91)>.73){
      const types=Object.keys(ENCOUNTER_INFO),type=types[Math.floor(hash(sx,sy,92)*types.length)];
      sector.site={type,x:(sx+.28+hash(sx,sy,93)*.44)*SECTOR_SIZE,y:(sy+.28+hash(sx,sy,94)*.44)*SECTOR_SIZE,r:type==='well'?34:27};
    }
    game.worldSectors.set(key,sector);return sector;
  }
  function syncWorldSectors(){
    const p=game.player,sx=Math.floor(p.x/SECTOR_SIZE),sy=Math.floor(p.y/SECTOR_SIZE),centerKey=sectorKey(sx,sy);if(game.activeSectorKey===centerKey)return;game.activeSectorKey=centerKey;const wanted=new Set();
    for(let x=sx-SECTOR_RADIUS;x<=sx+SECTOR_RADIUS;x++)for(let y=sy-SECTOR_RADIUS;y<=sy+SECTOR_RADIUS;y++){
      const key=sectorKey(x,y);wanted.add(key);const sector=game.worldSectors.get(key)||makeSector(x,y);
      if(!sector.site||sector.siteConsumed||sector.siteSpawned)continue;
      game.encounters.push({...sector.site,life:Infinity,used:false,pulse:visualRand(TAU),persistent:true,sector:key});sector.siteSpawned=true;
    }
    for(const [key,sector] of game.worldSectors)if(!wanted.has(key)&&(Math.abs(sector.sx-sx)>SECTOR_RADIUS+1||Math.abs(sector.sy-sy)>SECTOR_RADIUS+1))game.worldSectors.delete(key);
    game.encounters=game.encounters.filter(e=>{
      if(!e.persistent)return true;if(wanted.has(e.sector)||e.used)return true;const sector=game.worldSectors.get(e.sector);if(sector)sector.siteSpawned=false;return false;
    });
    const objectiveObstacles=game.obstacles.filter(obstacle=>obstacle.objectiveId&&!obstacle.dead);game.obstacles=[...objectiveObstacles];for(const key of wanted){const sector=game.worldSectors.get(key);if(sector)game.obstacles.push(...sector.props.filter(o=>!o.dead));}rebuildObstacleGrid();
    game.exploredSectors.add(sectorKey(sx,sy));
  }
  function updateStage(force=false){
    const idx=Math.min(7,Math.floor(game.time/70));if(!force&&idx===game.stageIndex)return;game.stageIndex=idx;const s=STAGES[idx],packageId=idx===0?'shore':idx<3?'plain':'city';richAudio.startBattlefield(packageId);banner(s[0],s[1]);syncWorldSectors();
  }

  function banner(title, sub) {
    dom.eventTitle.textContent = title; dom.eventSub.textContent = sub;
    dom.banner.classList.remove('show'); void dom.banner.offsetWidth; dom.banner.classList.add('show');
  }
  const tutorialSteps=[['이동과 자동 공격','WASD 또는 조이스틱으로 움직입니다. 가장 가까운 적은 자동으로 공격합니다.'],['완벽한 패링','Shift 또는 마우스 오른쪽 버튼을 누르면 0.22초 동안 패링합니다. 공격 직전에 맞추면 적을 기절시킵니다.'],['영웅 궁극기','피해를 주면 궁극기 게이지가 찹니다. 100%에서 Q를 누르십시오.'],['전열 돌파','경고선 밖으로 빠지고, 보스가 지친 순간에 집중 공격하십시오.']];let tutorialIndex=0;
  function startTutorial(){mode='tutorial';tutorialIndex=0;showTutorial()};function showTutorial(){const s=tutorialSteps[tutorialIndex];$('#tutorialTitle').textContent=s[0];$('#tutorialCopy').textContent=s[1];$('#tutorialOverlay').classList.remove('hidden')};function finishTutorial(){meta.tutorialDone=true;saveMeta();$('#tutorialOverlay').classList.add('hidden');mode='play'}
  $('#tutorialNext').onclick=()=>{tutorialIndex++;tutorialIndex>=tutorialSteps.length?finishTutorial():showTutorial()};$('#tutorialSkip').onclick=finishTutorial;
  function bossCinematic(e){game.bossIntro=2.25;game.player.invuln=Math.max(game.player.invuln,2.5);audio.sfx('bossHorn',.9);$('#bossIntroName').textContent=e.name;const el=$('#bossIntro');el.classList.remove('hidden');void el.offsetWidth;el.classList.add('bossCinematic');setTimeout(()=>{el.classList.add('hidden');el.classList.remove('bossCinematic')},2200)}
  function doParry(){
    if(!game||mode!=='play')return;
    const p=game.player;
    if(p.parryCd>0)return;
    const requested=game.rich.ports.defense.request(game.rich.defense,'parry',game.rich.fixedTick,{x:Math.cos(p.aim),y:Math.sin(p.aim)});
    if(requested===game.rich.defense)return;
    game.rich.defense=requested;
    requestDefense(p.defense,'parry',game.combatTime*1000);
    p.defense.tuning.parry.activeMs=180+p.defenseBuild.parryWindow*35;
    p.parryCd=Math.max(.55,1.3-p.defenseBuild.parryRecovery*.16);
    void richAudio.play(`sfx_parry_${game.rich.ports.hero.combatKey}`.replace('sfx_parry_bow','sfx_parry_bow'),{bus:'combat'});
    audio.tone(520,.08,'square',.08);
  }
  function applyPendingParryFailure(p){const consumed=consumeParryFailure({handled:p.handledParryFailures},p.defense.telemetry.parryFailures);p.handledParryFailures=consumed.handled;if(!consumed.missed)return false;const miss=parryMissPenalty({baseCooldownTicks:Math.round(p.parryCd*60)});p.exposedTicks=advanceParryExposure(p.exposedTicks,true);p.parryCd=Math.max(p.parryCd,miss.cooldownTicks/60);addAttack({kind:'ring',x:p.x,y:p.y,r:72,color:'#ee5146',life:.42});particle(p.x,p.y,'#d94239',12,145,'shard');audio.tone(110,.18,'sawtooth',.1);banner('패링 실패','0.55초 동안 방어가 무너지고 받는 피해가 35% 증가합니다');return true}
  function useUltimate(){if(!game||mode!=='play'||game.player.ultimate<100)return;const p=game.player;p.ultimate=0;p.ultimateUses++;p.invuln=1.3;game.flash=.45;game.shake=14;if(game.hero==='hoplite'){for(const e of game.enemies)if(!e.dead&&dist2(e,p)<420**2)damageEnemy(e,180,{source:'ultimateSpear',origin:p,unblockable:true,knock:520,stun:1.3})}else if(game.hero==='swordsman'){for(let i=0;i<5;i++)setTimeout(()=>game&&swordSweep(i*TAU/5,85,TAU,240),i*90)}else{for(const e of [...game.enemies].filter(x=>!x.dead).slice(0,24))fireProjectile(p.x,p.y,Math.atan2(e.y-p.y,e.x-p.x),920,95,{life:1.2,pierce:2,type:'ultimateArrow',color:'#8ee8b2'})}banner('영웅 궁극기',game.hero==='hoplite'?'팔랑크스가 전장을 밀어냅니다':game.hero==='swordsman'?'다섯 번의 회오리 참격':'아르테미스의 화살비');audio.tone(740,.4,'sawtooth',.14)}

  function toast(name, desc) {
    const el = document.createElement('div'); el.className = 'synergy'; el.innerHTML = `<b>${name}</b><br>${desc}`;
    dom.synergies.prepend(el); setTimeout(() => el.remove(), 6200);
  }

  const activeWeaponNodes=(k,w)=>{const path=WEAPON_PATHS[k]?.[w.path];return path?NODES[k].filter(n=>path.nodes.includes(n.id)):NODES[k]};
  const isWeaponMastered = k => !!game.weapons[k] && !!game.weapons[k].path && activeWeaponNodes(k,game.weapons[k]).every(n => game.weapons[k].nodes[n.id]);

  function readyFusions() {
    if (!game) return [];
    return Object.entries(FUSIONS).filter(([k,fusion])=>!game.fusions[k]&&isWeaponMastered(k)&&game.relics[fusion.relic]).map(([k])=>k);
  }
  function evolveFusion(k) {
    const fusion=FUSIONS[k];if(!fusion||game.fusions[k])return false;
    const w=game.weapons[k],evolution=!w.evolution&&EVOLUTIONS[k]?.find(e=>!e.path||e.path===w.path);if(evolution){w.evolution=evolution.id;w.power*=1.16;unlockAchievement('evolved')}
    game.fusions[k] = true; game.player.invuln = Math.max(game.player.invuln, 1.25);
    if (k === 'shield') game.player.armor = Math.min(.65, game.player.armor + .18);
    banner(fusion.name, fusion.desc); toast('무기·유물 합성', `${WEAPON_INFO[k].name} + ${RELICS[fusion.relic].name}`);
    particle(game.player.x, game.player.y, WEAPON_INFO[k].color, 26, 210, 'spark'); game.flash = .25;audio.sfx?.('evolve');return true;
  }
  function checkFusions() {
    return readyFusions();
  }
  function openChest() {
    game.coins += 15;game.player.invuln = Math.max(game.player.invuln, 1.1);
    const ready=readyFusions()[0];if(ready){evolveFusion(ready);updateBuild();return}
    if(game.boss)game.choiceQueue.push('relic');else showChoices('relic');
  }

  function weaponSummary(k, w) {
    if (game.fusions[k]) return FUSIONS[k].desc;
    const names = Object.keys(w.nodes).map(id => NODES[k].find(n => n.id === id)?.title).filter(Boolean);
    return names.length ? names.slice(-2).join(' · ') : WEAPON_INFO[k].role;
  }

  function updateBuild() {
    if (!game) return;
    const rows = [];
    for (const [k, w] of Object.entries(game.weapons)) {
      const i = WEAPON_INFO[k], fused = game.fusions[k];
      const evo=w.evolution?EVOLUTIONS[k].find(x=>x.id===w.evolution):null,dps=Math.round((game.damageStats.by[k]||0)/Math.max(1,game.time));rows.push(`<div class="buildItem weaponSlot" data-weapon="${k}" title="${fused?FUSIONS[k].name:evo?.name||i.name} · ${dps} DPS"><span class="buildIcon" style="--weapon-color:${i.color};${fused ? `box-shadow:0 0 18px ${i.color}` : ''}">${weaponSpriteHtml(k,'buildWeaponSprite')}</span><span class="buildCopy"><strong>${fused?FUSIONS[k].name:evo?.name||i.name}</strong><small>${fused?FUSIONS[k].desc:evo?.desc||weaponSummary(k,w)} · ${dps} DPS</small></span><span class="pips">${fused||evo?'★':weaponLevel(w)}</span></div>`);
    }
    for (const k of Object.keys(game.blessings)) {
      const i = BLESSINGS[k]; rows.push(`<div class="buildItem blessingSlot"><span class="buildIcon" style="color:${i.color}">${i.icon}</span><span><strong>${i.name}</strong><small>희귀 축복</small></span><span class="pips">◆</span></div>`);
    }
    for (const k of Object.keys(game.relics)) {
      const i = RELICS[k],lv=Number(game.relics[k]||1),art=RELIC_ART[k]; rows.push(`<div class="buildItem relicSlot"><span class="buildIcon">${art?`<img src="${art}" alt="">`:i.icon}</span><span><strong>${i.name}</strong><small>중첩 유물 · 강화 ${lv}</small></span><span class="pips">+${lv}</span></div>`);
    }
    dom.build.innerHTML = rows.join(''); dom.power.textContent = `위력 ${Math.round(game.player.damage * (game.aresTime > 0 ? 2 : 1) * 100)}%`;
    dom.dps.textContent=`DPS ${Math.round(game.damageStats.total/Math.max(1,game.time))}`;
  }

  function dashStatus() {
    const p = game.player, base = p.dashBase * (game.blessings.hermes ? .75 : 1);
    const pct = p.dashCharges > 0 ? 100 : clamp((1 - p.dashRecharge / base) * 100, 0, 100);
    const txt = p.dashCharges > 0 ? `준비${p.dashMax > 1 ? ` ×${p.dashCharges}` : ''}` : `${p.dashRecharge.toFixed(1)}초`;
    return { pct, txt };
  }

  function defenseStatus(action){
    const state=game.rich.ports.defense.snapshot(game.rich.defense);
    if(state.action===action){const labels={startup:'준비',active:'유효',recovery:'회복'},total=state.phaseDurationMs||1;return{txt:labels[state.phase]||state.phase,pct:clamp((1-state.phaseElapsedMs/total)*100,0,100),phase:state.phase}}
    if(state.action)return{txt:'행동 중',pct:0,phase:'locked'};
    return{txt:'준비',pct:100,phase:'ready'};
  }

  const BOSS_TACTICS={
    paris:['예측 사격 뒤 빈 사선으로 이동','화살 우리와 저격이 겹칩니다','표식 지대를 연속으로 버리십시오','격노 · 사선이 닫히기 전에 돌진'],
    sarpedon:['충격파 사이를 가로지르십시오','원형 탄막의 한 칸이 열립니다','지면 표식을 외곽에 배치하십시오','격노 · 근접 충돌을 피하십시오'],
    chariot:['전차 측면을 따라 회전하십시오','돌진 경로에서 일찍 이탈하십시오','호위병보다 전차를 먼저 견제하십시오','격노 · 벽과 전차 사이를 비우십시오'],
    aeneas:['방진의 측면을 먼저 무너뜨리십시오','창벽 직후가 공격 기회입니다','호위 방패병의 방향을 돌리십시오','격노 · 좁아진 틈을 돌진으로 통과'],
    penthesilea:['연속 돌진의 끝을 노리십시오','회전 참격 바깥을 유지하십시오','표식과 돌진 경로를 분리하십시오','격노 · 멈춰 서지 마십시오'],
    memnon:['태양 장판을 외곽에 놓으십시오','원거리 탄막 사이를 짧게 이동','폭발 예고와 탄막이 겹칩니다','격노 · 중앙을 오래 비우지 마십시오'],
    hector:['방패 반격 뒤에 공격하십시오','창 돌진을 측면으로 흘리십시오','전열과 탄막을 함께 읽으십시오','최후의 격노 · 패링이 핵심입니다']
  };

  function updateHud() {
    if (!game) return; const p = game.player, st = stageData(game.time), ds = dashStatus(),ps=defenseStatus('parry'),rs=defenseStatus('dodge');
    dom.hpFill.style.width = `${clamp(p.hp / p.maxHp * 100, 0, 100)}%`; dom.xpFill.style.width = `${clamp(game.xp / game.xpNeed * 100, 0, 100)}%`;
    dom.hpText.textContent = `${Math.ceil(p.hp)} / ${p.maxHp}`; dom.xpText.textContent = `${Math.floor(game.xp)} / ${game.xpNeed}`; dom.level.textContent = `LV ${game.level}`;
    dom.globalXpFill.style.width=`${clamp(game.xp/game.xpNeed*100,0,100)}%`;dom.globalXpText.textContent=`전공 ${Math.floor(game.xp)} / ${game.xpNeed}`;dom.globalLevel.textContent=`LV ${game.level}`;
    const next = game.time < 180 ? 180 : 300; dom.timer.textContent = game.boss&&!game.boss.dead?'⏸ 장군전':game.time < 300 ? fmtTime(Math.max(0, next - game.time)) : fmtTime(game.time - 300);
    const sx=Math.floor(p.x/SECTOR_SIZE),sy=Math.floor(p.y/SECTOR_SIZE);let site=null,siteDist=Infinity;for(const e of game.encounters){if(e.used)continue;const d=dist2(e,p);if(d<siteDist){siteDist=d;site=e}}
    const compass=a=>['동','남동','남','남서','서','북서','북','북동'][(Math.round(a/(TAU/8))+8)%8];
    dom.stage.textContent = `${st[0]} · 전장 구획 ${sx},${sy}${game.daily?` · ${DAILY_RULES[game.dailyRule].name}`:''}`; dom.objective.textContent = site?`${site.type==='well'?'우물':ENCOUNTER_INFO[site.type].name} · ${Math.round(Math.hypot(site.x-p.x,site.y-p.y))}m ${compass(Math.atan2(site.y-p.y,site.x-p.x))}`:game.daily?DAILY_RULES[game.dailyRule].description:st[1]; dom.kills.textContent = game.kills; dom.coins.textContent = game.coins; dom.streak.textContent = `×${game.streak.toFixed(1)}`;
    dom.dashHudText.textContent = `${rs.txt} · ${ds.txt}`; dom.dashHudFill.style.width = `${Math.min(ds.pct,rs.pct)}%`;dom.dashHudCell?.setAttribute('data-phase',rs.phase);
    if(dom.parryHudText){dom.parryHudText.textContent=ps.txt;dom.parryHudFill.style.width=`${ps.pct}%`;dom.parryHudCell?.setAttribute('data-phase',ps.phase)}
    dom.ultimateText.textContent=`${Math.floor(p.ultimate)}%`;dom.ultimateFill.style.width=`${p.ultimate}%`;
    dom.power.textContent = `위력 ${Math.round(game.player.damage * (game.aresTime > 0 ? 2 : 1) * 100)}%`;
    dom.dps.textContent=`DPS ${Math.round(game.damageStats.total/Math.max(1,game.combatTime))}`;
    if (game.boss && !game.boss.dead) {
      const b=game.boss,phase=clamp(b.bossPhase||0,0,3),phaseNames=['1막 · 탐색','2막 · 압박','3막 · 중첩','최후의 격노'],nextThreshold=[75,50,25,null][phase],patternCd=Math.max(0,b.bossPatternCd||0);
      dom.boss.classList.remove('hidden'); dom.bossName.textContent = b.name; dom.bossFill.style.width = `${clamp(b.hp / b.maxHp * 100, 0, 100)}%`;dom.bossPhase.textContent=phaseNames[phase];dom.bossHint.textContent=(BOSS_TACTICS[b.type]||BOSS_TACTICS.hector)[phase];dom.bossPattern.textContent=nextThreshold?`다음 격화 ${nextThreshold}% · 패턴 ${patternCd.toFixed(1)}초`:`패턴 ${patternCd.toFixed(1)}초`;
    } else dom.boss.classList.add('hidden');
  }

  function availableNodes() {
    const out = [];
    for (const [k, w] of Object.entries(game.weapons)) {
      if(!w.path)continue;
      for (const n of activeWeaponNodes(k,w)) {
        if (w.nodes[n.id]) continue;
        if ((n.req || []).every(req => w.nodes[req])) out.push({
          key: `node-${k}-${n.id}`, icon: n.icon, art: WEAPON_DATA[k], tag: `${WEAPON_INFO[k].name} · 전승 기술`, title: n.title, desc: `${n.desc} 이 무기의 피해가 5% 상승합니다.`,
          color: WEAPON_INFO[k].color, foot: `${WEAPON_INFO[k].name} 피해 +5%`, apply: () => { w.nodes[n.id] = true; w.power = (w.power || 1) * 1.05; }
        });
      }
    }
    return out;
  }

  function weaponPathCards(){const cards=[];for(const [k,w] of Object.entries(game.weapons)){if(w.path||!WEAPON_PATHS[k])continue;for(const [pathId,path] of Object.entries(WEAPON_PATHS[k]))cards.push({key:`path-${k}-${pathId}`,icon:path.icon,art:WEAPON_DATA[k],tag:`${WEAPON_INFO[k].name} · 전승 선택`,title:path.name,desc:path.desc,color:WEAPON_INFO[k].color,foot:'한 전승만 계승할 수 있습니다',apply:()=>{w.path=pathId;w.nodes[path.grant]=true;w.power=(w.power||1)*1.03;banner(path.name,`${WEAPON_INFO[k].name}의 전승 기술이 열렸습니다`)}})}return cards}

  function normalChoicePool() {
    const pool = [...weaponPathCards(),...availableNodes()];
    const defenseBuild=game.player.defenseBuild;
    if(defenseBuild.parryWindow<3)pool.push({key:`defense-parry-window-${defenseBuild.parryWindow}`,icon:'◇',tag:'패링 강화',title:'아테나의 호흡',desc:'패링 유효 시간이 0.035초 늘어납니다.',color:'#f0c76f',foot:'패링 결과를 직접 변경',apply:()=>defenseBuild.parryWindow++});
    if(defenseBuild.counterPower<3)pool.push({key:`defense-counter-${defenseBuild.counterPower}`,icon:'↶',tag:'패링 강화',title:'청동 반격',desc:'성공 패링의 반격 피해가 12 증가합니다.',color:'#f0a95d',foot:'반격 피해 증가',apply:()=>defenseBuild.counterPower++});
    if(defenseBuild.parryRecovery<3)pool.push({key:`defense-parry-recovery-${defenseBuild.parryRecovery}`,icon:'⌛',tag:'패링 강화',title:'방패 회수',desc:'패링 재사용 대기시간이 0.16초 줄어듭니다.',color:'#d4b675',foot:'패링 회전율 증가',apply:()=>defenseBuild.parryRecovery++});
    if(defenseBuild.dodgeDistance<3)pool.push({key:`defense-dodge-distance-${defenseBuild.dodgeDistance}`,icon:'»',tag:'구르기 강화',title:'헤르메스의 보폭',desc:'구르기 이동 거리가 10% 늘어납니다.',color:'#6fd4e4',foot:'회피 위치 변경',apply:()=>defenseBuild.dodgeDistance++});
    if(defenseBuild.dodgeRecovery<3)pool.push({key:`defense-dodge-recovery-${defenseBuild.dodgeRecovery}`,icon:'↻',tag:'구르기 강화',title:'가벼운 착지',desc:'구르기 충전 시간이 0.18초 줄어듭니다.',color:'#7bc7cf',foot:'구르기 회전율 증가',apply:()=>{defenseBuild.dodgeRecovery++;game.player.dashBase=Math.max(2.8,game.player.dashBase-.18)}});
    if(defenseBuild.dodgeExitGuard<3)pool.push({key:`defense-dodge-exit-${defenseBuild.dodgeExitGuard}`,icon:'◌',tag:'구르기 강화',title:'먼지 장막',desc:'구르기 종료 뒤 보호 시간이 0.06초 늘어납니다.',color:'#93b8bd',foot:'종료 직후 피격 감소',apply:()=>defenseBuild.dodgeExitGuard++});
    if(Object.keys(game.weapons).length<WEAPON_SLOT_CAP) for (const k of ['sword','javelin','shield','discus','firepot','sling','bow','flail','thunder','caltrops','ram']) if (!game.weapons[k]) {
      const i = WEAPON_INFO[k]; pool.push({ key: `unlock-${k}`, icon: i.icon, art: WEAPON_DATA[k], tag: '새 무기 해금', title: i.name, desc: `${i.role}. 고유한 기술 트리가 열립니다.`, color: i.color, foot: '새로운 자동 공격을 추가합니다', apply: () => { game.weapons[k] = { cd: .4, nodes: {}, combo: 0, power: 1 }; } });
    }
    if (game.training.hp < 2) pool.push({ key: 'train-hp', icon: '♥', tag: `생존 훈련 · ${game.training.hp + 1}/2`, title: '두꺼운 흉갑', desc: '최대 체력 +14, 즉시 14 회복.', color: '#d56a5f', foot: '두 번까지만 선택 가능', apply: () => { game.training.hp++; game.player.maxHp += 14; game.player.hp += 14; } });
    if (game.training.step < 2) pool.push({ key: 'train-step', icon: '»', tag: `기동 훈련 · ${game.training.step + 1}/2`, title: '가벼운 각반', desc: '이동 속도 +6%, 돌진 충전 시간 -0.2초.', color: '#80c6cf', foot: '두 번까지만 선택 가능', apply: () => { game.training.step++; game.player.speed *= 1.06; game.player.dashBase = Math.max(2.8, game.player.dashBase - .2); } });
    if (game.training.reach < 2) pool.push({ key: 'train-reach', icon: '◎', tag: `보급 훈련 · ${game.training.reach + 1}/2`, title: '전리품 끈', desc: '전공 인장 획득 범위 +38.', color: '#d0a652', foot: '두 번까지만 선택 가능', apply: () => { game.training.reach++; game.player.magnet += 38; } });
    if (game.training.tempo < 2) pool.push({ key: 'train-tempo', icon: '⌁', tag: `전투 훈련 · ${game.training.tempo + 1}/2`, title: '호흡 정돈', desc: '모든 무기 재사용 시간 -7%.', color: '#e0b965', foot: '두 번까지만 선택 가능', apply: () => { game.training.tempo++; game.player.attackRate *= 1.07; } });
    if (pool.length < 3) pool.push(
      { key: `endless-might-${game.endless.might}`, icon: '▲', tag: '숙련 반복', title: '전열 돌파', desc: '모든 피해 +2%. 반복할수록 선택 효과는 작게 유지됩니다.', color: '#d7805d', foot: `현재 ${game.endless.might}회`, apply: () => { game.endless.might++; game.player.damage *= 1.02; } },
      { key: `endless-guard-${game.endless.guard}`, icon: '▣', tag: '숙련 반복', title: '방패 호흡', desc: '최대 체력 +4, 즉시 8 회복.', color: '#8bb9c3', foot: `현재 ${game.endless.guard}회`, apply: () => { game.endless.guard++; game.player.maxHp += 4; game.player.hp = Math.min(game.player.maxHp, game.player.hp + 8); } },
      { key: `endless-tempo-${game.endless.tempo}`, icon: '⌁', tag: '숙련 반복', title: '전투 박자', desc: '공격 속도 +1%.', color: '#dfb65f', foot: `현재 ${game.endless.tempo}회`, apply: () => { game.endless.tempo++; game.player.attackRate *= 1.01; } },
      { key: `endless-fortune-${game.endless.fortune}`, icon: '◌', tag: '숙련 반복', title: '노획 감각', desc: '획득 범위 +8, 드라크마 +5.', color: '#c99a51', foot: `현재 ${game.endless.fortune}회`, apply: () => { game.endless.fortune++; game.player.magnet += 8; game.coins += 5; } }
    );
    return pool;
  }

  function pickUnique(pool, count) {
    const copy = [...pool], out = [];
    while (out.length < count && copy.length) out.push(copy.splice(Math.floor(gameRandom() * copy.length), 1)[0]);
    return out;
  }

  function pickNormalChoices(excluded=new Set()) {
    const pool=normalChoicePool(),fresh=pool.filter(card=>!excluded.has(card.key)),candidates=fresh.length>=3?fresh:pool,out=[];
    const weight=card=>card.key.startsWith('evo-')?5:card.key.startsWith('path-')?3.2:card.key.startsWith('node-')?2.2:card.key.startsWith('unlock-')?1.45:card.key.startsWith('train-')?.9:.45;
    while(out.length<3&&candidates.length){let total=candidates.reduce((n,c)=>n+weight(c),0),roll=gameRandom()*total,index=0;for(;index<candidates.length-1;index++){roll-=weight(candidates[index]);if(roll<=0)break}out.push(candidates.splice(index,1)[0])}
    return out;
  }

  function blessingCard() {
    const keys = Object.keys(BLESSINGS).filter(k => !game.blessings[k]);
    if (!keys.length) return null; const k = keys[Math.floor(gameRandom() * keys.length)], i = BLESSINGS[k];
    return { key: `god-${k}`, icon: i.icon, tag: '신화급 · 출현 확률 0.75%', title: i.name, desc: i.desc, color: i.color, foot: '이번 원정의 규칙을 바꾸는 희귀 축복', apply: () => acquireBlessing(k) };
  }

  function rarePool() {
    const pool = Object.entries(RARE_REWARDS).filter(([k]) => !game.rare[k]).map(([k, i]) => ({ key: `rare-${k}`, icon: i.icon, tag: `레벨 ${game.level} · 영웅 보상`, title: i.name, desc: i.desc, color: '#f0c86c', foot: '10레벨마다 한 번 나타납니다', apply: () => { game.rare[k] = true; i.apply(game); } }));
    const repeats = [
      { key: `hero-might-${game.level}`, icon: '♜', tag: `레벨 ${game.level} · 영웅 숙련`, title: '아카이아의 맹세', desc: '피해 +6%, 치명타 확률 +1%.', color: '#e7b85a', foot: '고유 영웅 보상을 모두 얻었습니다', apply: () => { game.player.damage *= 1.06; game.player.crit += .01; } },
      { key: `hero-guard-${game.level}`, icon: '◉', tag: `레벨 ${game.level} · 영웅 숙련`, title: '청동의 몸', desc: '최대 체력 +12, 즉시 24 회복.', color: '#85bdc7', foot: '고유 영웅 보상을 모두 얻었습니다', apply: () => { game.player.maxHp += 12; game.player.hp = Math.min(game.player.maxHp, game.player.hp + 24); } },
      { key: `hero-supply-${game.level}`, icon: '♛', tag: `레벨 ${game.level} · 영웅 숙련`, title: '왕의 보급', desc: '드라크마 50과 모든 전공 인장 회수.', color: '#d8a64f', foot: '고유 영웅 보상을 모두 얻었습니다', apply: () => { game.coins += 50; for (const q of game.pickups) if (q.kind === 'xp') q.magnet = true; } }
    ];
    return pool.length >= 3 ? pool : [...pool, ...repeats];
  }

  function relicPool() {
    return Object.entries(RELICS).map(([k,i])=>{const lv=Number(game.relics[k]||0);return{key:`relic-${k}-${lv}`,icon:i.icon,art:RELIC_ART[k],tag:lv?`유물 강화 · ${lv}→${lv+1}`:'전리품 상자 · 새 유물',title:i.name,desc:i.desc,color:lv?'#e3b85e':'#b991ef',foot:lv?'중복 획득 시 효과가 누적됩니다':'레벨업과 분리된 독립 장비',apply:()=>acquireRelic(k)}});
  }

  function acquireBlessing(k) {
    game.blessings[k] = true;
    if (k === 'hermes') { game.player.dashMax = 2; game.player.dashCharges = 2; }
    if (k === 'athena') game.athenaReady = 0;
    if (k === 'apollo') game.apolloCd = 0;
    banner(BLESSINGS[k].name, BLESSINGS[k].desc); toast('희귀 축복', BLESSINGS[k].name);
  }

  function acquireRelic(k) {
    const old=Number(game.relics[k]||0);game.relics[k]=old+1;
    if (k === 'daedalus') game.player.attackRate *= old?1.08:1.14;
    if(k==='hourglass')game.player.attackRate*=1.07;if(k==='club')game.player.damage*=1.06;
    if(k==='cup'){game.player.maxHp+=12;game.player.hp=Math.min(game.player.maxHp,game.player.hp+18)}
    if(k==='owl')game.player.crit+=.015;if(k==='sandals'){game.player.speed*=1.04;game.player.dashBase=Math.max(2.5,game.player.dashBase-.12)}
    if(k==='laurel'){game.player.xpGain*=1.05;game.player.magnet+=16}
    if(k==='stormAmphora'){game.player.area*=1.06;game.player.duration*=1.04}
    if(k==='moonstone'){game.player.duration*=1.07;game.player.crit+=.01}
    if(k==='bowstring'){game.player.projectileSpeed*=1.08}
    if(k==='forgeHammer')game.player.damage*=1.055;
    if(k==='obsidianEye')game.player.crit+=.018;
    if(k==='seaCharm')game.player.armor=Math.min(.65,game.player.armor+.025);
    if(k==='brokenCrown'){game.player.damage*=1.08;game.player.armor=Math.max(-.15,game.player.armor-.015)}
    game.player.invuln = Math.max(game.player.invuln, 1.15);
    banner(`${RELICS[k].name} +${game.relics[k]}`,old?'중복 유물이 강화되어 효과가 누적됩니다':RELICS[k].desc); toast(old?'유물 강화':'전리품 유물',`${RELICS[k].name} +${game.relics[k]}`);
    checkFusions();
  }

  function choiceWeaponKey(o){const parts=String(o.key||'').split('-');return ['node','path','evo','unlock'].includes(parts[0])&&WEAPON_INFO[parts[1]]?parts[1]:null}
  function choiceIntel(o){
    const k=choiceWeaponKey(o);if(!k)return `<div class="choiceIntel"><span>${o.tag.includes('유물')?'원정 유물':o.tag.includes('축복')?'신의 개입':'전투 규칙 변화'}</span><b>${o.tag.includes('축복')?'극희귀':'특수 선택'}</b></div>`;
    const dealt=game.damageStats.by[k]||0,dps=game.combatTime>5?`${Math.round(dealt/game.combatTime)} DPS`:'기록 수집 중',fusion=FUSIONS[k];let synergy='전승 확장';
    if(game.fusions[k])synergy='합성 무기 강화';else if(fusion&&game.relics[fusion.relic])synergy=`${RELICS[fusion.relic].name} · 합성 준비`;else if(fusion)synergy=`${RELICS[fusion.relic].name} 연계`;
    return `<div class="choiceIntel"><span>${WEAPON_INFO[k].role}</span><b>${dps}</b><em>${synergy}</em></div>`;
  }
  const RARITY_INFO={common:{name:'일반',icon:'●'},rare:{name:'희귀',icon:'◆'},heroic:{name:'영웅',icon:'✦'},mythic:{name:'신화',icon:'★'}};
  function cardRarity(o){const key=String(o.key||'');if(key.startsWith('god-')||key.startsWith('evo-'))return'mythic';if(key.startsWith('rare-')||key.startsWith('hero-')||key.startsWith('relic-'))return'heroic';if(key.startsWith('path-')||key.startsWith('unlock-'))return'rare';return'common'}
  function weaponSpriteHtml(key,extra=''){return `<img class="weaponSprite ${extra}" src="${WEAPON_DATA[key]||WEAPON_DATA.spear}" alt="">`}
  function choiceCard(o,i){const rarity=cardRarity(o),rank=RARITY_INFO[rarity],weapon=choiceWeaponKey(o),b=document.createElement('button');b.className='choiceCard';b.dataset.rarity=rarity;b.style.setProperty('--glow',o.color);b.innerHTML=`<span class="choiceNum">${i+1}</span><div class="rarityBadge">${rank.icon} ${rank.name}</div><div class="choiceIcon">${weapon?weaponSpriteHtml(weapon,'choiceWeaponSprite'):o.art?`<img src="${o.art}" alt="">`:o.icon}</div><div class="choiceTag">${o.tag}</div><h3>${o.title}</h3><p>${o.desc}</p>${choiceIntel(o)}<div class="choiceFoot">${o.foot}</div>`;b.onclick=()=>choose(o);return b}

  function showChoices(context = 'level') {
    if (mode !== 'play') return; mode = 'choice';
    let pool, picks;
    if (context === 'rare') {
      pool = rarePool(); picks = pickUnique(pool, 3); dom.choiceKicker.textContent = '열 번째 고비'; dom.choiceTitle.textContent = '영웅의 보상을 선택하십시오'; dom.choiceSub.textContent = '10레벨마다 전투 규칙을 바꾸는 희귀 보상이 나타납니다.';
    } else if (context === 'relic') {
      pool = relicPool(); picks = pickUnique(pool, 3); dom.choiceKicker.textContent = '봉인된 전리품'; dom.choiceTitle.textContent = '유물을 선택하십시오'; dom.choiceSub.textContent = '이 유물은 레벨업 선택지에 섞이지 않습니다.';
    } else {
      pool = normalChoicePool(); picks = pickNormalChoices();
      if (gameRandom() < .0075*game.player.luck) { const god = blessingCard(); if (god) picks[Math.floor(gameRandom() * picks.length)] = god; }
      dom.choiceKicker.textContent = '전장에서 익힌 기술'; dom.choiceTitle.textContent = '기술의 방향을 선택하십시오'; dom.choiceSub.textContent = '피해 수치보다 공격 방식과 생존 경로를 먼저 정하십시오.';
    }
    game.currentContext=context;game.currentChoices=picks;game.choiceReadyAt=performance.now()+260;dom.choiceCards.innerHTML = '';
    picks.forEach((o, i) => dom.choiceCards.appendChild(choiceCard(o,i)));
    dom.choice.classList.remove('hidden');
    $('#rerollBtn').textContent=`전부 재굴림 ×${game.rerolls}`;$('#banishBtn').textContent=`첫 카드 추방 ×${game.banishes}`;
  }

  function choose(o) {
    if (mode !== 'choice'||performance.now()<(game.choiceReadyAt||0)) return; o.apply();game.player.invuln = Math.max(game.player.invuln, 1.05); checkFusions(); updateBuild(); dom.choice.classList.add('hidden'); mode = 'play';audio.sfx('level',.55);audio.tone(440,.12,'triangle',.05);
    if (game.choiceQueue.length) { const next = game.choiceQueue.shift(); scheduleRunChoice(() => showChoices(next), 70); }
  }
  function redrawChoices(picks){game.currentChoices=picks;dom.choiceCards.innerHTML='';picks.forEach((o,i)=>dom.choiceCards.appendChild(choiceCard(o,i)))}
  $('#rerollBtn').onclick=()=>{if(mode!=='choice'||game.rerolls<1)return;game.rerolls--;const previous=new Set(game.currentChoices.map(x=>x.key));let pool=game.currentContext==='rare'?rarePool():game.currentContext==='relic'?relicPool():normalChoicePool(),picks=game.currentContext==='level'?pickNormalChoices(previous):pickUnique(pool.filter(x=>!previous.has(x.key)),3);if(picks.length<3)picks.push(...pickUnique(pool.filter(x=>!picks.some(p=>p.key===x.key)),3-picks.length));redrawChoices(picks);$('#rerollBtn').textContent=`전부 재굴림 ×${game.rerolls}`;audio.tone(330,.08)};
  $('#banishBtn').onclick=()=>{if(mode!=='choice'||game.banishes<1)return;game.banishes--;const gone=game.currentChoices.shift();let pool=(game.currentContext==='rare'?rarePool():game.currentContext==='relic'?relicPool():normalChoicePool()).filter(x=>!game.currentChoices.some(c=>c.key===x.key)&&x.key!==gone.key);if(pool.length)game.currentChoices.push(pool[Math.floor(gameRandom()*pool.length)]);redrawChoices(game.currentChoices);$('#banishBtn').textContent=`첫 카드 추방 ×${game.banishes}`};

  function nearestEnemy(x, y, range = 9999, farthest = false) {
    let best = null, bd = farthest ? -1 : Infinity;
    for (const e of game.enemies) if (!e.dead&&!(e.hiddenTicks>0)) {
      const d = (e.x - x) ** 2 + (e.y - y) ** 2;if(d>range*range)continue;
      if(farthest){if(d>bd){bd=d;best=e}continue}
      let score=d;const priority=meta.settings.targetPriority;
      if(priority==='threat'&&(e.type==='bomber'||e.type==='archer'||e.type==='slinger'||e.type==='eliteArcher'))score*=.42;
      else if(priority==='elite'&&(e.elite||e.boss||e.bossEscort))score*=.28;
      else if(priority==='lowHp')score*=clamp(e.hp/e.maxHp,.16,1);
      if(score<bd){bd=score;best=e}
    }
    return best;
  }

  function priorityEnemy(x, y, range) {
    let best = null, score = Infinity;
    for (const e of game.enemies) if (!e.dead&&!(e.hiddenTicks>0)) {
      const d = Math.hypot(e.x - x, e.y - y); if (d > range) continue;
      const priority = e.type === 'bomber' ? .38 : (e.type === 'archer' || e.type === 'slinger') ? .55 : 1;
      const next = d * priority; if (next < score) { score = next; best = e; }
    }
    return best;
  }

  const GRID_SIZE = 128;
  const cellKey = (gx, gy) => gx * 1e7 + gy;
  const gridKey = (x, y) => cellKey(Math.floor(x / GRID_SIZE), Math.floor(y / GRID_SIZE));
  const enemyLimit = () => W < 720 ? 112 : 168;
  const projectileLimit = () => W < 720 ? 58 : 86;
  const survivalSpawnRate=()=>2.4+Math.min(game.time,90)*.035+Math.max(0,game.time-90)*.014+(game.surge>0?3.2:0);
  const screenEdgeSpawnDistance=a=>Math.min((W/2+70)/Math.max(Math.abs(Math.cos(a)),.05),(H/2+70)/Math.max(Math.abs(Math.sin(a)),.05))+rand(80,35);

  function rebuildEnemyGrid() {
    const grid = game.enemyGrid; grid.clear();
    for (const e of game.enemies) if (!e.dead) {
      const key = gridKey(e.x, e.y); let cell = grid.get(key); if (!cell) { cell = []; grid.set(key, cell); } cell.push(e);
    }
  }

  function nearbyEnemies(x, y, radius) {
    const out = [], minX = Math.floor((x - radius) / GRID_SIZE), maxX = Math.floor((x + radius) / GRID_SIZE), minY = Math.floor((y - radius) / GRID_SIZE), maxY = Math.floor((y + radius) / GRID_SIZE);
    for (let gx = minX; gx <= maxX; gx++) for (let gy = minY; gy <= maxY; gy++) {
      const cell = game.enemyGrid.get(cellKey(gx, gy)); if (cell) for (const e of cell) if (!e.dead) out.push(e);
    }
    return out;
  }

  function rebuildObstacleGrid(){
    const grid=game.obstacleGrid;grid.clear();for(const obstacle of game.obstacles){if(obstacle.dead)continue;const key=gridKey(obstacle.x,obstacle.y);let cell=grid.get(key);if(!cell){cell=[];grid.set(key,cell)}cell.push(obstacle)}
  }

  function resolveObstacleCollisions(e){
    const radius=e.r+72,minX=Math.floor((e.x-radius)/GRID_SIZE),maxX=Math.floor((e.x+radius)/GRID_SIZE),minY=Math.floor((e.y-radius)/GRID_SIZE),maxY=Math.floor((e.y+radius)/GRID_SIZE);for(let gx=minX;gx<=maxX;gx++)for(let gy=minY;gy<=maxY;gy++){const cell=game.obstacleGrid.get(cellKey(gx,gy));if(!cell)continue;for(const o of cell){if(!o.solid||o.dead)continue;const ox=e.x-o.x,oy=e.y-o.y,od=Math.hypot(ox,oy)||1,min=e.r+o.r*.82;if(od>=min)continue;if(e.boss){if(e.obstacleHitCd<=0){damageObstacle(o,e.damage*.22);e.obstacleHitCd=.22}e.x+=ox/od*8;e.y+=oy/od*8}else{e.x=o.x+ox/od*min;e.y=o.y+oy/od*min;e.vx+=ox/od*38;e.vy+=oy/od*38}}}
  }

  function dropXp(x, y, value, grade = 1) {
    const list = game.pickups, stop = Math.max(0, list.length - 48);
    for (let i = list.length - 1; i >= stop; i--) { const q = list[i]; if (q.kind === 'xp' && (q.x - x) ** 2 + (q.y - y) ** 2 < 46 ** 2) { q.value += value; q.grade = Math.max(q.grade || 1, grade); q.r = Math.min(11, q.r + .15); q.life = 105; return; } }
    if (game.pickups.length >= 110) {
      const q = game.pickups.find(p => p.kind === 'xp'); if (q) { q.value += value; q.grade = Math.max(q.grade || 1, grade); return; }
    }
    game.pickups.push({ x, y, r: grade > 1 ? 8 : 6, kind: 'xp', grade, value, vx: rand(50, -50), vy: rand(50, -50), life: 105 });
  }

  function spawnEnemy(type, elite = false, angle = null, distance = null, eliteKind = null) {
    const d = ENEMY_DEF[type], p = game.player, a = angle ?? gameRandom() * TAU;
    if (!elite && !d.boss && game.enemies.length >= enemyLimit()) return null;
    if (!elite && (type === 'archer' || type === 'slinger') && game.enemies.reduce((n, e) => n + (!e.dead && (e.type === 'archer' || e.type === 'slinger') ? 1 : 0), 0) >= (W < 720 ? 8 : 13)) return null;
    let x, y;
    if (game.arena) {
      const rr = distance ?? game.arena.r - rand(34, 14); x = game.arena.x + Math.cos(a) * rr; y = game.arena.y + Math.sin(a) * rr;
    } else {
      const rr = distance ?? screenEdgeSpawnDistance(a); x = p.x + Math.cos(a) * rr; y = p.y + Math.sin(a) * rr;
    }
    const opening = clamp(game.time / 60, 0, 1),late=lateThreatProfile(game.time),lateHp=d.boss?1+(late.hp-1)*.45:late.hp,lateDamage=d.boss?1+(late.damage-1)*.55:late.damage,lateSpeed=d.boss?1+(late.speed-1)*.5:late.speed;
    const scale = .82 + opening * .18 + Math.max(0, game.time - 60) / 165;
    const buildThreat=d.boss?Math.max(0,(game.player.damage-1)*1.8+(game.player.attackRate-1)*1.4+Object.keys(game.weapons).length*.18+game.level*.045):0;
    const bossScale = d.boss ? (1.35 + Math.max(0, game.level - 4) * .12) * (1+buildThreat*.34) : scale;
    const eliteScale=elite?(eliteKind==='late'?2.15:3.25):1,maxHp = applyDailyRule(game.dailyRule,'enemyHp',d.hp * bossScale * eliteScale*game.diff.hp*lateHp);
    const spawnEvent=game.eventJournal.record('spawn',{type,elite:elite||!!d.boss,boss:!!d.boss});
    const combatSeed=Number(String(spawnEvent.id).replace(/\D/g,'').slice(-4))||0;
    const e = {
      id: `${game.dailySeed}:${spawnEvent.id}`, type, name: d.name, x, y, r: d.r * (elite ? 1.18 : 1), hp: maxHp, maxHp,
      speed: d.speed * rand(d.boss?1.12:1.12, d.boss?1.02:.9) * (1 + Math.max(0, game.time - 50) / 1050)*(game.curses.includes('haste')?1.16:1)*(d.boss?1+buildThreat*.035:1)*lateSpeed, damage: d.damage * (.72 + opening * .28 + Math.max(0, game.time - 75) / 310)*game.diff.damage*(d.boss?1.18+buildThreat*.075:1)*lateDamage, xp: d.xp*(eliteKind==='late'?1.6:1), color: d.color,
      elite: elite || !!d.boss,lateElite:eliteKind==='late',bossEscort:false,boss: !!d.boss, dead: false, facing: a + Math.PI, vx: 0, vy: 0, attackCd: rand(1.4, .3),threatCadence:late.cadence,combatSeed,attackOrdinal:0,attackTiming:null,
      specialCd: rand(3, 1), windup: 0, hitFlash: 0, stun: 0, slow: 0, bleed: 0, bleedDps: 0, burn: 0, burnDps: 0, mark: 0,
      orbit: gameRandom() < .5 ? -1 : 1, flank: rand(1.05, .35), lead: rand(1.12, .72), pursuitCd: rand(5.2, 2.1), pursuitWindup: 0, pursuitTime: 0,
      guardFacing: a + Math.PI, guardTurnDelay: 0, attackPose: 0, phase: 0, telegraph: 0, fuse: 0, chargeWindup: 0, chargeAngle: a + Math.PI, chargeChain: 0, trailCd: 0, summonStage: 0, walkPhase: visualRand(TAU), stepMark: -1,
      bossThreat:buildThreat,bossPatternCd:d.boss?2.8:0,bossPhase:0,arenaBound:!!d.boss,bossAdaptation:d.boss?createBossAdaptation(type):null,guardBreakTicks:0,invulnerableTicks:0
    };
    game.enemies.push(e);game.eventJournal.record('ai',{entityId:e.id,type:e.type,orbit:e.orbit,attackCd:Number(e.attackCd.toFixed(6)),specialCd:Number(e.specialCd.toFixed(6))});
    meta.seen[type]=true;if(e.boss){saveMeta();game.boss=e;banner(e.name,type==='hector'?'성벽이 닫혔습니다. 결투에서 살아남으십시오.':'고유 전술의 빈틈을 찾아 공격하십시오.');bossCinematic(e);audio.tone(82,.45,'sawtooth',.14)}
    return e;
  }

  function spawnRegular(angle = null) {
    const t=game.time,r=gameRandom(),late=lateThreatProfile(t),pool=[['raider',1.55],['skirmisher',t>24?.92:0],['archer',t>48?.54:0],['slinger',t>70?.44:0],['shieldman',t>82?.46:0],['bomber',t>96?.24:0],['cavalry',t>112?.3:0],['axeman',t>126?.4:0],['lancer',t>142?.42:0],['medic',t>156?.16:0],['firearcher',t>170?.22:0],['netter',t>188?.26:0],['giant',t>215?.12:0],['horncaller',t>230?.11:0],['ghost',t>260?.25:0],['engineer',t>285?.18:0],['amazonrider',t>315?.16:0],['assassin',t>340?.22:0],['standard',t>190?.09:0]].filter(x=>x[1]>0).map(([type,weight])=>[type,weight*(DANGEROUS_LATE_TYPES.has(type)?late.dangerousWeight:1)]);let roll=r*pool.reduce((n,x)=>n+x[1],0),type='raider';for(const [candidate,weight] of pool){roll-=weight;if(roll<=0){type=candidate;break}}
    const elite=gameRandom()<late.eliteChance*applyDailyRule(game.dailyRule,'eliteWeight',1);spawnEnemy(type,elite,angle,null,elite&&late.tier>0?'late':null);
  }

  function spawnEncirclement() {
    const count = 11 + Math.floor(game.time / 42), offset = gameRandom() * TAU;
    for (let i = 0; i < count; i++) spawnRegular(offset + i * TAU / count + rand(.08, -.08));
    banner('포위망 수축', '빈 틈 하나를 정하고 즉시 돌파하십시오');
  }

  function placeFormationUnit(type, angle, forward, lateral = 0) {
    const e = spawnEnemy(type, false, angle, forward); if (!e) return null; const p = game.player;
    e.x = p.x + Math.cos(angle) * forward - Math.sin(angle) * lateral; e.y = p.y + Math.sin(angle) * forward + Math.cos(angle) * lateral; return e;
  }

  function spawnTacticalWave() {
    if (game.arena || game.enemies.length > enemyLimit() - 12) return;
    if(game.relics.warDrum)game.buffs.warDrum=8+game.relics.warDrum;
    const a = gameRandom() * TAU, roll = Math.floor(gameRandom() * (game.time > 260 ? 8 : game.time > 150 ? 6 : 4)); game.waveIndex++; game.waveBurst = 7;
    if (roll === 0) {
      for (let row = 0; row < 4; row++) for (let side = -row; side <= row; side += 2) placeFormationUnit(row > 1 && side === 0 ? 'shieldman' : 'raider', a, 560 + row * 42, side * 34);
      banner(`제 ${game.waveIndex}파 · 청동 쐐기진`, '창병 전열이 한 방향에서 밀고 들어옵니다');
    } else if (roll === 1) {
      for (let i = -3; i <= 3; i++) placeFormationUnit('archer', a + i * .13, 610 + Math.abs(i) * 24, i * 18);
      for (let i = -2; i <= 2; i++) placeFormationUnit('raider', a + i * .11, 500, i * 42);
      banner(`제 ${game.waveIndex}파 · 파리스의 반월진`, '궁수 앞의 창병을 뚫고 사선을 무너뜨리십시오');
    } else if (roll === 2) {
      for (const side of [-1, 1]) for (let i = -2; i <= 2; i++) placeFormationUnit(i % 2 ? 'skirmisher' : 'raider', a + (side < 0 ? -.82 : .82), 500 + Math.abs(i) * 30, i * 38);
      if (game.time > 92) for (const side of [-1, 1]) placeFormationUnit('bomber', a + side * .55, 575, side * 70);
      banner(`제 ${game.waveIndex}파 · 양익 협공`, '양쪽 척후병이 퇴로를 자르려 합니다');
    } else if(roll===3) {
      for (let i = -3; i <= 3; i++) placeFormationUnit(i % 2 ? 'raider' : 'shieldman', a, 520, i * 46);
      placeFormationUnit('standard', a, 610, 0); banner(`제 ${game.waveIndex}파 · 방패 전열`, '기수를 중심으로 방패벽이 전진합니다');
    } else if(roll===4){
      for(let i=-3;i<=3;i++)placeFormationUnit(i%2?'lancer':'axeman',a,530+Math.abs(i)*18,i*48);placeFormationUnit('medic',a,640,0);banner(`제 ${game.waveIndex}파 · 리키아의 갈고리`,`약초사가 버티는 동안 장창수와 도끼광이 전열을 고정합니다`);
    } else if(roll===5){
      for(let i=-3;i<=3;i++)placeFormationUnit(i%2?'firearcher':'netter',a,585+Math.abs(i)*20,i*52);for(const side of[-1,1])placeFormationUnit('cavalry',a+side*.65,520,side*90);banner(`제 ${game.waveIndex}파 · 불화살 사냥망`,`그물을 피하고 양익 기병이 닫히기 전에 화궁수를 끊으십시오`);
    } else if(roll===6){
      placeFormationUnit('giant',a,520,0);for(let i=-2;i<=2;i++)placeFormationUnit(i?'ghost':'horncaller',a,585,i*58);banner(`제 ${game.waveIndex}파 · 이다산의 망령`,`나팔수가 망령을 재촉합니다. 거인의 강타 범위를 비우십시오`);
    } else {
      for(const side of[-1,1]){placeFormationUnit('amazonrider',a+side*.48,535,side*80);for(let i=-1;i<=1;i++)placeFormationUnit('assassin',a+side*.7,610,i*38+side*95)}placeFormationUnit('engineer',a,640,0);banner(`제 ${game.waveIndex}파 · 왕궁의 추격대`,`기마전사가 길을 닫고 자색칼날이 측면으로 파고듭니다`);
    }
  }

  function updateWaveDirector(dt) {
    if (game.arena) return; game.waveCd -= dt; game.waveBurst = Math.max(0, game.waveBurst - dt);
    if (game.waveCd <= 0) { spawnTacticalWave(); game.waveCd = rand(22, 16); }
  }

  function spawnElite(type = 'standard') {
    const e = spawnEnemy(type, true); e.name = type === 'archer' ? '파리스의 명사수' : type === 'standard' ? '트로이 전열 지휘관' : `정예 ${ENEMY_DEF[type]?.name||'청동병'}`;
    banner('정예 전열', `${e.name}이 주변 병사들을 강화합니다`); return e;
  }

  function startArena(kind, boss) {
    const p = game.player;
    const r = kind === 'soldiers' ? (W<720?460:540) : (W<720?340:390);
    game.arena = { x: p.x, y: p.y, r, kind, entryEnemies:0 };
    const existingUnits=game.enemies.filter(e=>e!==boss&&!e.dead),existing=existingUnits.length,activeCap=W<720?12:20;
    existingUnits.sort((a,b)=>dist2(a,p)-dist2(b,p)).forEach((e,i)=>{e.arenaReserve=i>=activeCap;e.arenaBound=false;if(e.arenaReserve){const a=Math.atan2(e.y-p.y,e.x-p.x);e.reserveAngle=a;e.x=p.x+Math.cos(a)*(r+85+rand(80));e.y=p.y+Math.sin(a)*(r+85+rand(80))}});
    game.arena.entryEnemies=existing;game.arena.activeNormals=Math.min(existing,activeCap);game.spawnAcc=0;boss.arenaBound=true;
    boss.x = p.x + r * (kind === 'soldiers' ? .72 : .64); boss.y = p.y;
    const escorts={paris:['eliteArcher','eliteCaptain','eliteArcher'],sarpedon:['eliteCaptain','eliteDrummer','eliteCaptain'],chariot:['eliteCaptain','eliteDrummer','eliteArcher'],aeneas:['eliteCaptain','eliteCaptain','eliteDrummer'],penthesilea:['eliteArcher','eliteCaptain','eliteArcher'],memnon:['eliteDrummer','eliteCaptain','eliteDrummer'],hector:['eliteCaptain','eliteArcher','eliteDrummer','eliteCaptain']}[boss.type]||['eliteCaptain','eliteDrummer'];
    escorts.forEach((type,i)=>{const e=spawnEnemy(type,true,i*TAU/escorts.length,r*.68);if(e){e.bossEscort=true;e.arenaBound=true;e.x=p.x+Math.cos(i*TAU/escorts.length)*r*.68;e.y=p.y+Math.sin(i*TAU/escorts.length)*r*.68}});banner(`${boss.name}와 왕실 친위대`,`기존 병력 ${existing}명 유지 · 근접 ${Math.min(existing,activeCap)}명만 참전 · 정예 ${escorts.length}명 합류`);
  }

  function fireProjectile(x, y, a, speed, damage, opts = {}) {
    const friendly = opts.friendly !== false;
    if (friendly && game.projectiles.length >= Math.floor(projectileLimit() * 1.35)) return null;
    if (game.projectiles.length >= projectileLimit() && !friendly) return null;
    if (!friendly && game.hostileProjectiles >= (W < 720 ? 26 : 42)) return null;
    const impactId=`projectile:${++impactSerial}`,projectile={
      id:impactId,impactId,
      x, y, vx: Math.cos(a) * (friendly?speed*(game.player.projectileSpeed||1):applyDailyRule(game.dailyRule,'hostileProjectileSpeed',speed)), vy: Math.sin(a) * (friendly?speed*(game.player.projectileSpeed||1):applyDailyRule(game.dailyRule,'hostileProjectileSpeed',speed)), r: (opts.r || 5)*(friendly?(game.player.area||1):1), damage, life: (opts.life || 1.4)*(friendly?(game.player.duration||1):1),
      friendly, pierce: opts.pierce || 0, color: opts.color || '#f2ce78', type: opts.type || 'javelin',
      hit: new Set(), trail: opts.trail !== false, split: !!opts.split, blast: opts.blast || 0, slow: opts.slow || 0, mark: opts.mark || 0,
      boomerang:!!opts.boomerang,returnAt:opts.returnAt||0,returned:false,bounces:opts.bounces||0,owner:opts.owner||null
    };if(!friendly)projectile._richPendingIntent={damage,direction:a};game.projectiles.push(projectile);return projectile;
  }

  function reserveAttackIntent(source,damage,{sourceKind='melee',defenseTag='parryable',direction=0,delayTicks=1,threat='low'}={}){
    if(!source||source._richIntent)return source?._richIntent||null;const impactId=source.impactId||`${sourceKind}:${++impactSerial}`;source.impactId=impactId;
    const intent=game.rich.ports.intent.create({sourceKind,defenseTag,origin:{x:source.x??game.player.x,y:source.y??game.player.y},direction,impactAt:game.rich.fixedTick+Math.max(1,Math.trunc(delayTicks)),threat,telegraphId:`rich-telegraph-${++game.rich.intentSerial}`,impactId,damage},{mode:'production'});
    if(!intent)return null;try{game.rich.scheduler.schedule(intent)}catch{return null}source._richIntent=intent;const sourceBearing=Math.atan2((source.y??game.player.y)-game.player.y,(source.x??game.player.x)-game.player.x),angleDelta=Math.atan2(Math.sin(sourceBearing-game.player.aim),Math.cos(sourceBearing-game.player.aim));const cue={tick:game.rich.fixedTick,impactAt:intent.impactAt,defenseTag,sourceKind,impactId,ownerPresent:!!source.owner,ownerHp:source.owner?.hp??null,sourceBearing,playerAim:game.player.aim,angleDelta};game.rich.cueHistory.push(cue);recordCombatJournal({type:'telegraph',...cue});if(game.rich.cueHistory.length>256)game.rich.cueHistory.shift();return intent;
  }
  function recordCombatJournal(entry){game.rich.combatJournal.push(entry);if(game.rich.combatJournal.length>500)game.rich.combatJournal.splice(0,game.rich.combatJournal.length-500)}
  function closeHostileProjectile(q,reason,details={}){if((q.friendly&&reason!=='impact')||q._richTerminal)return;const forecast=projectileIntercept({projectile:q,player:game.player});if(q._richIntent&&reason!=='impact')game.rich.scheduler.cancel(q._richIntent.telegraphId);recordCombatJournal({...projectileTerminalEvent({tick:game.rich.fixedTick,impactId:q.impactId,reason,defensePhase:game.rich.ports.defense.snapshot(game.rich.defense).phase,sourceBearing:forecast.sourceBearing,playerAim:forecast.playerAim,closestApproach:Math.min(q._richClosestApproach??Infinity,forecast.closestApproach)}),...details});q._richTerminal=reason;q._richPendingIntent=null}
  function attachAttackIntent(source,intent){
    if(!source||!intent)return null;try{game.rich.scheduler.schedule(intent)}catch{return null}source.impactId=intent.impactId;source._richIntent=intent;const cue={tick:game.rich.fixedTick,impactAt:intent.impactAt,defenseTag:intent.defenseTag,sourceKind:intent.sourceKind,impactId:intent.impactId,ownerPresent:!!source.owner};game.rich.cueHistory.push(cue);recordCombatJournal({type:'telegraph',...cue});return intent;
  }

  function particle(x, y, color, count = 5, speed = 90, shape = 'dust') {
    const cap = renderQuality === 'high' ? 360 : renderQuality === 'medium' ? 230 : 140;
    if (game.particles.length >= cap) return;
    count = Math.max(1, Math.ceil(count * effectScale));
    if (game.particles.length > cap * .82) count = Math.min(count, 2); else if (game.enemies.length > 90) count = Math.ceil(count * .55);
    for (let i = 0; i < count; i++) {
      const a = visualRandom() * TAU, s = visualRand(speed, 18), life = visualRand(.68, .25);
      game.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life, max: life, r: visualRand(4.2, 1.2), color, shape, spin: visualRand(6, -6) });
    }
  }

  function textPop(x, y, text, color = '#fff0c4', big = false) { game.texts.push({ x, y, text, color, life: .8, max: .8, big }); }
  function addAttack(o) { game.attacks.push({ life: o.life || .25, max: o.life || .25, ...o }); }
  function addZone(x, y, r, life, damage, color = '#dc6547', slow = 0, hostile = false) { const area=hostile?1:(game.player.area||1),duration=hostile?1:(game.player.duration||1);game.zones.push({ x, y, r:r*area, life:life*duration, max:life*duration, damage, color, slow, hostile, tick: 0 }); }

  function lineTargets(x, y, angle, length, width) {
    const dx = Math.cos(angle), dy = Math.sin(angle), out = [];
    for (const e of game.enemies) if (!e.dead) {
      const rx = e.x - x, ry = e.y - y, forward = rx * dx + ry * dy, side = Math.abs(rx * -dy + ry * dx);
      if (forward > -e.r && forward < length + e.r && side < width + e.r) out.push({ e, forward });
    }
    return out.sort((a, b) => a.forward - b.forward);
  }

  function coneTargets(x, y, angle, range, arc) {
    const out = [];
    for (const e of game.enemies) if (!e.dead) {
      const dx = e.x - x, dy = e.y - y, d = Math.hypot(dx, dy); if (d > range + e.r) continue;
      let da = Math.atan2(dy, dx) - angle; da = Math.atan2(Math.sin(da), Math.cos(da)); if (Math.abs(da) <= arc / 2) out.push(e);
    }
    return out;
  }

  function spearSpin(w,strong=false){
    const p=game.player,r=((strong?158:112)+(hasNode('spear','orbit')?28:0))*p.area,damage=(strong?46:24)*weaponPower('spear');
    addAttack({kind:'ring',x:p.x,y:p.y,r,color:strong?'#ffe28b':'#e8bd62',life:.46});
    for(const e of game.enemies)if(!e.dead&&dist2(e,p)<(r+e.r)**2)damageEnemy(e,damage*(e.boss&&w.evolution==='cycloneSpear'?1.32:1),{source:'spearSpin',origin:p,knock:72,unblockable:true});
    if(hasNode('spear','orbit'))for(let pulse=1;pulse<=2;pulse++)setTimeout(()=>{if(!game||mode!=='play')return;const rr=r+Math.sin(pulse)*18;addAttack({kind:'ring',x:p.x,y:p.y,r:rr,color:'#caa34e',life:.24});for(const e of game.enemies)if(!e.dead&&dist2(e,p)<(rr+e.r)**2)damageEnemy(e,damage*.34,{source:'spearOrbit',origin:p,unblockable:true})},pulse*330);
    if(hasNode('spear','return'))setTimeout(()=>{if(!game||mode!=='play')return;addAttack({kind:'ring',x:p.x,y:p.y,r:r*.72,color:'#fff0ac',life:.32});for(const e of game.enemies)if(!e.dead&&dist2(e,p)<(r*.72+e.r)**2)damageEnemy(e,damage*.7,{source:'spearReturn',origin:p,knock:-80,unblockable:true})},420);
  }

  function fireSpear(w, target) {
    audio.sfx('spear',.3);
    if(w.evolution==='cycloneSpear'){pAimTo(target);spearSpin(w,true);w.cd=.72/game.player.attackRate;return}
    const p = game.player, rays = w.evolution==='phalanx'?5:hasNode('spear', 'phalanx') ? 5 : hasNode('spear', 'fork') ? 3 : 1;
    const length = (148 + (hasNode('spear', 'reach') ? 48 : 0)) * (game.rare.titan ? 1.25 : 1)*p.area;
    const width = (12 + (hasNode('spear', 'broad') ? 12 : 0))*p.area, maxTargets = hasNode('spear', 'phalanx') ? 99 : hasNode('spear', 'skewer') ? 5 : 2;
    const baseDamage = 34 * (rays > 1 ? .84 : 1) * weaponPower('spear'), spread = rays > 3 ? .14 : .18;
    const piercesShield = !!w.evolution||hasNode('spear', 'skewer') || hasNode('spear', 'phalanx');
    p.motion = { kind: 'spear', time: .24, max: .24, angle: p.aim, reach: length };
    for (let i = 0; i < rays; i++) {
      const a = p.aim + (i - (rays - 1) / 2) * spread;
      addAttack({ kind: 'thrust', x: p.x, y: p.y, angle: a, length, width, color: '#f4d17e', life: .24 });
      for (const { e } of lineTargets(p.x, p.y, a, length, width).slice(0, maxTargets)) {
        damageEnemy(e, baseDamage*(w.evolution==='achilles'?(e.boss?1.65:1.28):1), { source: 'spear', origin: p, knock: hasNode('spear', 'hook') ? -95 : 55, unblockable: piercesShield,crit:w.evolution==='achilles'&&gameRandom()<.2, bleed: hasNode('spear', 'bleed') ? { time: 5, dps: 6 } : null });
      }
    }
    if (hasNode('spear', 'echo')) {
      const echoAngle = p.aim, echoLength = length * .72, echoWidth = width * .8;
      setTimeout(() => { if (!game || mode !== 'play') return; addAttack({ kind: 'thrust', x: p.x, y: p.y, angle: echoAngle, length: echoLength, width: echoWidth, color: '#c8a457', life: .18 }); for (const { e } of lineTargets(p.x, p.y, echoAngle, echoLength, echoWidth).slice(0, 3)) damageEnemy(e, baseDamage * .48, { source: 'spearEcho', origin: p, knock: -45, unblockable: piercesShield }); }, 170);
    }
    w.combo = (w.combo || 0) + 1;
    if(hasNode('spear','spin')&&w.combo%2===0)spearSpin(w,false);
    if (w.combo % 4 === 0) {
      const waveLength = game.fusions.spear ? 470 : 125, waveWidth = game.fusions.spear ? 86 : 72, waveDamage = (game.fusions.spear ? 40 : 17) * weaponPower('spear');
      addAttack({ kind: 'shockwave', x: p.x, y: p.y, angle: p.aim, length: waveLength, width: waveWidth, color: '#d7a954', life: .38 });
      for (const { e } of lineTargets(p.x, p.y, p.aim, waveLength, waveWidth)) damageEnemy(e, waveDamage, { source: 'spearWave', origin: p, knock: game.fusions.spear ? 210 : 125, unblockable: true });
    }
    damageObstacles(p.x,p.y,length,baseDamage*.42);
    w.cd = .92 / (p.attackRate * (hasNode('spear', 'cadence') ? 1.22 : 1));
  }

  function swordSweep(angle, damage, arc, range) {
    const p = game.player, fused = game.fusions.sword; damage *= weaponPower('sword'); if (fused) { arc = TAU; range *= 1.28; }
    addAttack({ kind: 'slash', x: p.x, y: p.y, angle, arc, r: range, color: fused ? '#cbbf9d' : '#d8c08d', life: .28 });
    const targets = fused || hasNode('sword', 'whirl') ? game.enemies.filter(e => !e.dead && dist2(e, p) < (range + e.r) ** 2) : coneTargets(p.x, p.y, angle, range, arc);
    for (const e of targets) {
      const execute = hasNode('sword', 'execute') && e.hp / e.maxHp <= .25;
      damageEnemy(e, damage, { source: 'sword', origin: p, knock: 90, crit: execute, bleed: hasNode('sword', 'bleed') ? { time: 4, dps: 5 } : null });
      if (fused) e.stun = Math.max(e.stun, .65);
    }
    if (fused) particle(p.x, p.y, '#a9a18c', 10, 150, 'shard');damageObstacles(p.x,p.y,range,damage);
  }

  function fireSword(w) {
    audio.sfx('sword',.32);
    const p = game.player, range = (76 + (hasNode('sword', 'arc') ? 26 : 0)) * (game.rare.titan ? 1.25 : 1)*p.area;
    const arc = w.evolution==='cyclone'||hasNode('sword', 'whirl') ? TAU : hasNode('sword', 'arc') ? 2.35 : 1.65;
    if (hasNode('sword', 'lunge')) { const t = nearestEnemy(p.x, p.y, 178); if (t) { const a = Math.atan2(t.y - p.y, t.x - p.x); p.x += Math.cos(a) * 22; p.y += Math.sin(a) * 22; } }
    if (hasNode('sword', 'parry')) p.invuln = Math.max(p.invuln, .18);
    p.motion = { kind: 'sword', time: .3, max: .3, angle: p.aim };
    const catchPower=game.swordCatchBuff?1.6:1;game.swordCatchBuff=0;
    swordSweep(p.aim, (w.evolution==='lion'?38:27)*catchPower, arc, range*(w.evolution==='cyclone'?1.35:1));
    if (hasNode('sword', 'double')) setTimeout(() => { if (game && mode === 'play') swordSweep(p.aim + Math.PI, 22, arc, range); }, 130);
    w.combo = (w.combo || 0) + 1;
    if(hasNode('sword','throw')&&w.combo%3===0)fireProjectile(p.x,p.y,p.aim,610,(w.evolution==='lion'?58:39)*weaponPower('sword'),{r:9,life:1.35,returnAt:.7,type:'swordThrow',color:'#f0c979',boomerang:true,bounces:hasNode('sword','ricochet')?2:0,trail:true});
    if (hasNode('sword', 'crescent') && w.combo % 3 === 0) fireProjectile(p.x, p.y, p.aim, 470, 38, { r: 13, life: .62, type: 'swordWave', color: '#e5b85f', pierce: 4, trail: false });
    w.cd = 1.15 / p.attackRate;
  }

  function fireJavelin(w, target) {
    const p = game.player, eagle = hasNode('javelin', 'eagle'), heavy = hasNode('javelin', 'heavy');
    p.motion = { kind: 'javelin', time: .34, max: .34, angle: p.aim };
    const volley = hasNode('javelin', 'volley')||w.evolution==='storm';let angles = w.evolution==='storm'?[-.2,-.1,0,.1,.2]:volley ? [-.12, 0, .12] : [0];if(p.amount)for(let i=0;i<p.amount;i++)angles.push((i%2?1:-1)*(.27+Math.floor(i/2)*.09));
    const hunterPower=hasNode('javelin','hunter')?(w.evolution==='hunter'?1.28:1.15):1;
    for (const offset of angles) fireProjectile(p.x + Math.cos(p.aim) * 20, p.y + Math.sin(p.aim) * 20, p.aim + offset, eagle ? 820 : 610, (heavy ? 82 : 53) * (volley ? .58 : 1) * hunterPower * weaponPower('javelin'), {
      r: 7, pierce: hasNode('javelin', 'pierce')||w.evolution==='hunter' ? 2 : 0, life: eagle ? 1.55 : 1.25, type: 'playerJavelin', color: '#c5aeff',
      split: hasNode('javelin', 'split'), blast: game.fusions.javelin ? 82 : hasNode('javelin', 'blast') ? 58 : hasNode('javelin','hunter') ? (w.evolution==='hunter'?42:28) : 0, slow: hasNode('javelin', 'pin') ? .45 : 0, mark: hasNode('javelin', 'mark') ? 4 : 0
    });
    w.cd = (heavy ? 2.35 : 2.02) * (volley ? 1.14 : 1) / p.attackRate;
  }

  function shieldPulse(x, y, damage, second = false) {
    damage *= weaponPower('shield');
    const p = game.player, radius = (82 + (hasNode('shield', 'radius') ? 35 : 0) + (second ? 24 : 0)) * (game.rare.titan ? 1.25 : 1)*p.area;
    const force = 290 * (hasNode('shield', 'force') ? 1.7 : 1) * (game.rare.titan ? 1.25 : 1);
    addAttack({ kind: 'ring', x, y, r: radius, color: second ? '#b4f1f0' : '#76cfdf', life: .42 });
    for (const e of game.enemies) if (!e.dead && (e.x - x) ** 2 + (e.y - y) ** 2 < (e.r + radius) ** 2) {
      damageEnemy(e, damage, { source: 'shield', origin: p, knock: force, stun: hasNode('shield', 'stun') ? .8 : 0, unblockable: true });
      if(game.weapons.shield?.evolution==='thunder')chainLightning(p,e,12,3);
    }
    if (hasNode('shield', 'reflect')) for (const q of game.projectiles) if (!q.friendly && (q.x - x) ** 2 + (q.y - y) ** 2 < radius ** 2) { q.life = 0; particle(q.x, q.y, '#8fe2ed', 5, 80, 'spark'); }damageObstacles(x,y,radius,damage+18);
  }
  function damageObstacle(o,damage){if(!o?.solid||o.dead)return;o.hp-=damage;o.flash=.18;if(o.popCd<=0){textPop(o.x,o.y-o.r*.9,`장애물 -${Math.round(damage)}`,'#f3cf8a');o.popCd=.16}particle(o.x,o.y,'#c6ad82',3,75,'shard');if(o.hp<=0){o.dead=true;const sector=game.worldSectors.get(o.sector);if(sector)sector.props=sector.props.filter(prop=>prop!==o);game.obstacles=game.obstacles.filter(prop=>prop!==o&&!prop.dead);rebuildObstacleGrid();addAttack({kind:'blast',x:o.x,y:o.y,r:o.r*1.2,color:'#bca176',life:.28});particle(o.x,o.y,'#b29a75',16,150,'shard');game.coins+=2;game.rich.wallet={...game.rich.wallet,drachma:game.coins};if(o.objectiveId===game.rich.objective.instanceId&&game.rich.objective.type==='destroy')progressRichObjective(1);game.shake=Math.max(game.shake,3);textPop(o.x,o.y-o.r,'파괴','#ffe19a',true)}}
  function damageObstacles(x,y,r,damage){for(const o of game.obstacles)if(o.solid&&!o.dead&&(o.x-x)**2+(o.y-y)**2<(r+o.r)**2)damageObstacle(o,damage);game.obstacles=game.obstacles.filter(o=>!o.dead)}

  function fireShield(w) {
    audio.sfx('shield',.42);const p = game.player; p.motion = { kind: 'shield', time: .38, max: .38, angle: p.aim }; shieldPulse(p.x, p.y, 13);
    if (hasNode('shield', 'double')) setTimeout(() => { if (game && mode === 'play') shieldPulse(p.x, p.y, 9, true); }, 190);
    w.cd = 3.45 / p.attackRate;
  }

  function pAimTo(target){if(target)game.player.aim=Math.atan2(target.y-game.player.y,target.x-game.player.x)}
  function fireDiscus(w){const p=game.player,razor=w.evolution==='razor',count=(w.evolution==='solar'?6:2+(hasNode('discus','count')?1:0)+p.amount)-(razor&&p.amount<1?1:0),radius=(74+(hasNode('discus','radius')?28:0))*p.area,spin=(hasNode('discus','speed')?1.35:1)*(razor?.78:1);w.angle=(w.angle||0)+.72*spin;for(let i=0;i<count;i++){const a=w.angle+i*TAU/count,x=p.x+Math.cos(a)*radius,y=p.y+Math.sin(a)*radius,hitRadius=(razor?30:18)*p.area;addAttack({kind:'ring',x,y,r:hitRadius,color:razor?'#f2d087':'#e5bd62',life:.18});for(const e of nearbyEnemies(x,y,50*p.area))if(!e.dead&&dist2(e,{x,y})<(e.r+hitRadius)**2)damageEnemy(e,(hasNode('discus','edge')?15:10)*(razor?(e.boss?2.35:2.0):1)*weaponPower('discus'),{source:'discus',origin:{x,y},knock:razor?38:20,slow:razor?.45:0,unblockable:true});if(hasNode('discus','guard'))for(const q of game.projectiles)if(!q.friendly&&dist2(q,{x,y})<(28*p.area)**2)q.life=0}w.cd=.22/game.player.attackRate}
  function fireFirepot(w,target){const p=game.player;if(!target){w.cd=.15;return}const furnace=w.evolution==='furnace',tx=target.x+target.vx*.25,ty=target.y+target.vy*.25,r=(72+(hasNode('firepot','radius')?38:0))*(furnace ? .72 : 1),life=3.1+(hasNode('firepot','duration')?2:0),damage=(hasNode('firepot','scorch')?12:7)*(furnace?1.75:1)*weaponPower('firepot');addAttack({kind:'skySpear',x:tx,y:ty,r:r*p.area,color:'#ef7745',life:.48});addZone(tx,ty,r,life,damage,'#d95b35');if(!furnace&&(hasNode('firepot','cluster')||p.amount))for(let n=0;n<2+p.amount;n++){const a=n*TAU/(2+p.amount);addZone(tx+Math.cos(a)*r*.72,ty+Math.sin(a)*r*.72,r*.56,life*.76,damage*.62,'#e36a3b')}if(hasNode('firepot','trail'))for(let i=1;i<4;i++)addZone(lerp(tx,p.x,i/4),lerp(ty,p.y,i/4),34,life*.7,damage*.55,'#d95b35');if(furnace)for(let i=1;i<=3;i++)setTimeout(()=>game&&mode==='play'&&explode(tx,ty,r*p.area,damage*2.1),i*520);w.cd=(furnace?3.8:3.4)/game.player.attackRate}
  function fireSling(w,target){const p=game.player;pAimTo(target);const heavy=hasNode('sling','heavy'),shots=(hasNode('sling','storm')?2:1)+p.amount;for(let i=0;i<shots;i++)setTimeout(()=>{if(!game||mode!=='play')return;fireProjectile(p.x,p.y,p.aim+(i-(shots-1)/2)*.09,(heavy?560:640),(heavy?54:33)*weaponPower('sling'),{r:heavy?9:7,life:w.evolution==='ricochet'?2.4:1.7,type:'slingStone',color:'#c3b190',bounces:w.evolution==='ricochet'?6:hasNode('sling','bounce')?2:0,split:hasNode('sling','split'),blast:w.evolution==='meteor'?68*p.area:heavy&&hasNode('sling','stun')?26*p.area:0})},i*100);w.cd=(heavy?1.6:1.34)/game.player.attackRate}
  function fireBow(w){const p=game.player,shots=(hasNode('bow','fan')?3:hasNode('bow','double')?2:1)+Math.min(1,p.amount),range=hasNode('bow','seek')?1080:820,targets=game.enemies.filter(e=>!e.dead&&dist2(e,p)<range**2).sort((a,b)=>{const ap=['archer','slinger','firearcher','netter','medic','horncaller'].includes(a.type)?0:1,bp=['archer','slinger','firearcher','netter','medic','horncaller'].includes(b.type)?0:1;return ap-bp||dist2(a,p)-dist2(b,p)});for(let i=0;i<shots;i++){const t=targets[i%Math.max(1,targets.length)];if(!t)break;const a=Math.atan2(t.y-p.y,t.x-p.x)+(i-(shots-1)/2)*.045;fireProjectile(p.x,p.y,a,780,(hasNode('bow','mark')&&t.elite?38:28)*weaponPower('bow'),{life:1.45,pierce:hasNode('bow','pierce')?2:0,type:'relicArrow',color:'#e6b96a',mark:hasNode('bow','mark')?4:0})}w.cd=(w.evolution==='rain'?.72:1.08)/p.attackRate}
  function fireFlail(w){const p=game.player,r=(hasNode('flail','radius')?142:108)*p.area,impactPath=w.path==='impact',damage=(hasNode('flail','impact')?50:30)*weaponPower('flail'),hits=hasNode('flail','orbit')?2:1;for(let pulse=0;pulse<hits;pulse++)setTimeout(()=>{if(!game||mode!=='play')return;addAttack({kind:'ring',x:p.x,y:p.y,r:r-pulse*12,color:'#d78a57',life:.3});for(const e of nearbyEnemies(p.x,p.y,r+35))if(!e.dead&&dist2(e,p)<(r+e.r)**2)damageEnemy(e,damage*(pulse?.64:1)*(impactPath&&e.elite?1.32:1),{source:'flail',origin:p,knock:hasNode('flail','impact')?230:95,stun:hasNode('flail','stun')?.7:0,bleed:hasNode('flail','bleed')?{time:4,dps:6}:null,unblockable:true})},pulse*180);w.cd=(w.evolution==='maelstrom'?1.15:impactPath?1.48:1.68)/p.attackRate}
  function fireThunder(w,target){if(!target){w.cd=.12;return}const p=game.player,jumps=(hasNode('thunder','jumps')?6:4)+p.amount,range=hasNode('thunder','range')?245:185,hit=new Set();let cur=target,origin={x:p.x,y:p.y};for(let i=0;i<jumps&&cur;i++){hit.add(cur.id);addAttack({kind:'lightning',x:origin.x,y:origin.y,x2:cur.x,y2:cur.y,color:'#8ed6ff',life:.22});damageEnemy(cur,(i?20:hasNode('thunder','focus')?43:31)*weaponPower('thunder'),{source:'thunder',origin,unblockable:true,slow:hasNode('thunder','shock')?1.2:0});origin={x:cur.x,y:cur.y};let next=null,bd=range**2;for(const e of nearbyEnemies(cur.x,cur.y,range))if(!e.dead&&!hit.has(e.id)){const dd=dist2(e,cur);if(dd<bd){bd=dd;next=e}}cur=next}if(hasNode('thunder','burst')||game.fusions.thunder)setTimeout(()=>{if(!game||mode!=='play')return;addAttack({kind:'blast',x:target.x,y:target.y,r:game.fusions.thunder?105:72,color:'#a9dcff',life:.42});for(const e of nearbyEnemies(target.x,target.y,120))if(!e.dead&&dist2(e,target)<(game.fusions.thunder?105:72+e.r)**2)damageEnemy(e,18*weaponPower('thunder'),{source:'thunder',origin:target,unblockable:true})},330);w.cd=(w.evolution==='judgment'?1.7:2.15)/p.attackRate}
  function fireCaltrops(w){const p=game.player,count=(hasNode('caltrops','count')?3:1)+Math.min(1,p.amount),radius=(hasNode('caltrops','wide')?58:42)*p.area;for(let i=0;i<count;i++){const a=p.aim+(i-(count-1)/2)*.55,x=p.x+Math.cos(a)*(80+i*18),y=p.y+Math.sin(a)*(80+i*18);addZone(x,y,radius,4.6,(hasNode('caltrops','bleed')?12:8)*weaponPower('caltrops'),'#8e9272',hasNode('caltrops','slow')?.65:.4);addAttack({kind:'ring',x,y,r:radius,color:'#b8b88b',life:.3});if(hasNode('caltrops','blast')||game.fusions.caltrops)setTimeout(()=>game&&mode==='play'&&explode(x,y,radius*(game.fusions.caltrops?1.5:1.05),18*weaponPower('caltrops')),4200)}w.cd=(w.evolution==='field'?2.5:3.15)/p.attackRate}
  function fireRam(w,target){if(!target){w.cd=.12;return}const p=game.player;pAimTo(target);const length=(hasNode('ram','echo')?420:340)*p.area,width=(hasNode('ram','width')?48:32)*p.area,damage=(hasNode('ram','break')?58:39)*weaponPower('ram');addAttack({kind:'thrust',x:p.x,y:p.y,angle:p.aim,length,width,color:'#cf9b50',life:.42});for(const {e} of lineTargets(p.x,p.y,p.aim,length,width)){const breaker=hasNode('ram','break')&&(e.type==='shieldman'||e.elite);damageEnemy(e,damage*(breaker?1.75:1),{source:'ram',origin:p,knock:310,stun:hasNode('ram','stun')?.7:0,unblockable:true});if(!hasNode('ram','pierce')&&!e.elite)break}damageObstacles(p.x,p.y,length*.72,damage*.55);if(hasNode('ram','echo'))setTimeout(()=>{if(game&&mode==='play'){addAttack({kind:'thrust',x:p.x,y:p.y,angle:p.aim,length:length*.78,width:width*.72,color:'#e0b76c',life:.28});for(const {e} of lineTargets(p.x,p.y,p.aim,length*.78,width*.72))damageEnemy(e,damage*.48,{source:'ram',origin:p,knock:120,unblockable:true})}},260);w.cd=(w.evolution==='legion'?1.45:2.05)/p.attackRate}

  function useWeapons(dt) {
    const p = game.player, nearest = nearestEnemy(p.x, p.y, 950); if (nearest&&!p.manualAim) p.aim = Math.atan2(nearest.y - p.y, nearest.x - p.x);
    for (const [k, w] of Object.entries(game.weapons)) {
      w.cd -= dt*(game.buffs.warDrum>0?1.22:1); if (w.cd > 0) continue;
      if (k === 'spear' && nearest && dist2(nearest, p) < 260 ** 2) fireSpear(w, nearest);
      else if (k === 'sword' && nearest && dist2(nearest, p) < (hasNode('sword', 'lunge') ? 178 : 125) ** 2) fireSword(w);
      else if (k === 'javelin') { const range = hasNode('javelin', 'hunter') ? 1220 : hasNode('javelin', 'eagle') ? 1050 : 760, target = hasNode('javelin', 'hunter') ? priorityEnemy(p.x, p.y, range) : nearestEnemy(p.x, p.y, range); if (target) { p.aim = Math.atan2(target.y - p.y, target.x - p.x); fireJavelin(w, target); } }
      else if (k === 'shield' && nearest && dist2(nearest, p) < 155 ** 2) fireShield(w);
      else if(k==='discus')fireDiscus(w);
      else if(k==='firepot')fireFirepot(w,nearestEnemy(p.x,p.y,820));
      else if(k==='sling'){const t=nearestEnemy(p.x,p.y,900);if(t)fireSling(w,t);else w.cd=.12}
      else if(k==='bow'){p.motion={kind:'bow',time:.28,max:.28,angle:p.aim};fireBow(w)}
      else if(k==='flail'){p.motion={kind:'flail',time:.5,max:.5,angle:p.aim};fireFlail(w)}
      else if(k==='thunder'){p.motion={kind:'thunder',time:.36,max:.36,angle:p.aim};fireThunder(w,priorityEnemy(p.x,p.y,760))}
      else if(k==='caltrops'){p.motion={kind:'caltrops',time:.3,max:.3,angle:p.aim};fireCaltrops(w)}
      else if(k==='ram'){p.motion={kind:'ram',time:.42,max:.42,angle:p.aim};fireRam(w,nearestEnemy(p.x,p.y,520))}
      else w.cd = Math.min(w.cd, .12);
    }
  }

  function chainLightning(from, target, damage, jumps = 4) {
    let cur = target, origin = { x: from.x, y: from.y }; const hit = new Set();
    for (let i = 0; i < jumps && cur; i++) {
      hit.add(cur.id); addAttack({ kind: 'lightning', x: origin.x, y: origin.y, x2: cur.x, y2: cur.y, color: '#f4df68', life: .2 });
      damageEnemy(cur, damage, { source: 'lightning', origin, unblockable: true, noGod: true }); origin = { x: cur.x, y: cur.y };
      let next = null, bd = 190 ** 2; for (const e of game.enemies) if (!e.dead && !hit.has(e.id)) { const d = dist2(e, origin); if (d < bd) { bd = d; next = e; } } cur = next;
    }
  }

  function flushEnemyDamage(e){if(!meta.settings.numbers||!e.damagePool)return;textPop(e.x,e.y-e.r,Math.round(e.damagePool),e.damagePoolCrit?'#ffe17a':e.damagePoolGuarded?'#94cbd2':'#f6d4ad',e.damagePoolCrit);e.damagePool=0;e.damagePoolCrit=false;e.damagePoolGuarded=false;e.damagePopCd=.11}

  function damageEnemy(e, raw, opts = {}) {
    if (e.dead) return;const damageEventId=opts.impactId||`${e.id}:${opts.source||'other'}:${game.rich.fixedTick}:${++impactSerial}`; let amount = raw * game.player.damage * (game.aresTime > 0 ? 2 : 1) * (game.buffs.fury > 0 ? 1.35 : 1), guarded = false;
    if(e.boss){const bossMultiplier=bossDamageMultiplier(e.type,{guardBrokenTicks:e.guardBreakTicks,invulnerable:(e.invulnerableTicks||0)>0});if(bossMultiplier===0){if(meta.settings.numbers)textPop(e.x,e.y-36,'무적','#a7dff2');return}amount*=bossMultiplier;if(bossMultiplier<1)guarded=true}
    if(game.relics.brokenCrown&&e.boss)amount*=1.08+game.relics.brokenCrown*.025;
    if(game.relics.forgeHammer&&(e.type==='shieldman'||e.elite))amount*=1.08;
    if (e.mark > 0) amount *= 1.18;
    const spearPierce=opts.unblockable&&/^spear|playerJavelin|skyJavelin/.test(opts.source||'');
    if(e.type==='shieldman'&&opts.ranged&&!spearPierce){amount*=.25;guarded=true;if(meta.settings.numbers)textPop(e.x,e.y-30,'원거리 75% 감소','#8dc8d1')}
    else if (e.type === 'shieldman' && !opts.unblockable && opts.origin) {
      const incoming = Math.atan2(opts.origin.y - e.y, opts.origin.x - e.x), diff = Math.cos(incoming - e.guardFacing);
      if (diff > .25) { amount *= .45; guarded = true; textPop(e.x, e.y - 30, '방패', '#8dc8d1'); }
    } else if (e.type === 'shieldman' && opts.unblockable && /^spear/.test(opts.source || '')) {
      textPop(e.x, e.y - 30, '관통', '#ffe08a');
    }
    if(e.type==='aeneas'&&!e.boss&&!opts.unblockable&&opts.origin){const incoming=Math.atan2(opts.origin.y-e.y,opts.origin.x-e.x);if(Math.cos(incoming-e.facing)>.15){amount*=.32;guarded=true;if(meta.settings.numbers)textPop(e.x,e.y-36,'방진','#8fc7e8')}}
    if(game.relics.obsidianEye&&['bomber','archer','slinger','firearcher','netter','medic','horncaller','assassin'].includes(e.type)&&gameRandom()<.04*game.relics.obsidianEye)opts.crit=true;
    if(game.weapons.sword?.evolution==='lion'&&/^sword/.test(opts.source||'')&&e.hp/e.maxHp<.28)amount*=2.4;const forcedCrit=opts.crit===true,critRoll=forcedCrit?null:gameRandom(),crit=forcedCrit||critRoll<game.player.crit;game.eventJournal.record('crit',{entityId:e.id,source:opts.source||'other',forced:forcedCrit,roll:critRoll==null?null:Number(critRoll.toFixed(8)),critical:crit});if (crit) amount *= 1.75;
    if(e.boss)amount=Math.min(amount,e.maxHp*.028);
    e.hp -= amount;if(e.boss&&e.richBoss&&assetManifests.bosses)e.richBoss=game.rich.ports.boss.reduce(e.richBoss,{type:'damage',id:`${e.id}:damage:${++impactSerial}`,damage:amount},assetManifests.bosses); e.hitFlash = .1;
    game.damageStats.total+=amount;const source=(opts.source||'other').replace(/Echo|Wave|Blast/i,'');game.damageStats.by[source]=(game.damageStats.by[source]||0)+amount;game.player.ultimate=clamp(game.player.ultimate+amount*.035,0,100);
    if (opts.knock&&!e.boss&&e.type!=='shieldman') { const dx = e.x - opts.origin.x, dy = e.y - opts.origin.y, d = Math.hypot(dx, dy) || 1; e.vx += dx / d * opts.knock; e.vy += dy / d * opts.knock; }
    if (opts.stun) e.stun = Math.max(e.stun, opts.stun*(e.boss ? .18 : 1)); if (opts.slow) e.slow = Math.max(e.slow, opts.slow*(e.boss ? .4 : 1));
    if (opts.bleed) { e.bleed = Math.max(e.bleed, opts.bleed.time); e.bleedDps = Math.max(e.bleedDps, opts.bleed.dps); }
    if (game.rare.hephaestus && opts.source !== 'burn') { e.burn = Math.max(e.burn, 4); e.burnDps = Math.max(e.burnDps, 7); }
    if (!guarded) { game.hitStop = Math.max(game.hitStop, crit ? .038 : .017); game.shake = Math.max(game.shake, crit ? 5 : 2.3); }
    particle(e.x, e.y, guarded ? '#7db0ba' : crit ? '#ffe083' : '#b94e3f', crit ? 7 : 3, 85, crit ? 'spark' : 'dust');
    if (!guarded && game.attacks.length < 82 && (crit || visualRandom() < .32 * effectScale)) {
      const impactAngle = opts.origin ? Math.atan2(e.y - opts.origin.y, e.x - opts.origin.x) : 0;
      addAttack({ kind: 'impactFx', x: e.x, y: e.y, angle: impactAngle, r: crit ? 54 : 36, color: '#f2c56b', life: crit ? .28 : .2 });
    }
    if(meta.settings.numbers){e.damagePool=(e.damagePool||0)+amount;e.damagePoolCrit=e.damagePoolCrit||crit;e.damagePoolGuarded=e.damagePoolGuarded||guarded;if((e.damagePopCd||0)<=0)flushEnemyDamage(e)}
    if(!guarded&&visualRandom()<.18)audio.tone(crit?420:180,.035,'square',.025);
    if (game.blessings.zeus && !opts.noGod && opts.source !== 'bleed' && opts.source !== 'burn') {
      game.godHitCounter++; if (game.godHitCounter >= 7) { game.godHitCounter = 0; chainLightning(opts.origin || e, e, 22, 4); }
    }
    if (game.rare.ambrosia && e.elite){const heal=consumeAmbrosiaHeal(game.recoveryLedger,{eventId:damageEventId,tick:game.rich.fixedTick,damage:amount,boss:e.boss,elite:!e.boss});game.player.hp=Math.min(game.player.maxHp,game.player.hp+heal)}
    if (e.hp <= 0) killEnemy(e);
  }

  function killEnemy(e) {
    if (e.dead||game.ended) return; e.dead = true; game.kills++; game.streak = clamp(game.streak + .024, 1, 2.4); game.streakClock = 2.2;
    particle(e.x, e.y, e.color, e.boss ? 34 : e.elite ? 16 : 8, e.boss ? 240 : 130, 'shard');
    const pieces = e.boss ? 6 : e.elite ? 3 : 1;
    for (let i = 0; i < pieces; i++) dropXp(e.x + rand(22, -22), e.y + rand(22, -22), e.xp / pieces, e.boss ? 3 : e.elite ? 2 : 1);
    const healRoll=gameRandom(),healDropped=healRoll<.018*game.player.luck;if(healDropped)game.pickups.push({ x: e.x, y: e.y, r: 10, kind: 'heal', value: 12, life: 65 });
    let magnetRoll=null,magnetDropped=false;if(!e.elite&&!e.boss){magnetRoll=gameRandom();magnetDropped=magnetRoll<.0025*game.player.luck;if(magnetDropped)game.pickups.push({ x: e.x, y: e.y, r: 11, kind: 'magnet', value: 1, life: 65 });}
    game.eventJournal.record('reward',{entityId:e.id,type:e.type,xpPieces:pieces,heal:healDropped,healRoll:Number(healRoll.toFixed(8)),magnet:magnetDropped,magnetRoll:magnetRoll==null?null:Number(magnetRoll.toFixed(8)),chest:e.boss});
    if(e.elite&&game.relics.fleece){const heal=consumeFleeceHeal(game.recoveryLedger,{eventId:`defeat:${e.id}`,boss:e.boss,elite:!e.boss,relicLevel:game.relics.fleece});game.player.hp=Math.min(game.player.maxHp,game.player.hp+heal)}
    if (game.blessings.ares) { game.aresKills++; if (game.aresKills >= 20) { game.aresKills = 0; game.aresTime = 6; banner('아레스의 전의', '6초 동안 모든 피해가 두 배가 됩니다'); } }
    if(shouldTriggerGorgon({kills:game.kills,relicLevel:game.relics.gorgon})){for(const target of game.enemies)if(canGorgonPetrify(target)&&dist2(target,game.player)<(310+game.relics.gorgon*24)**2)target.stun=Math.max(target.stun,2.5);banner('고르곤의 시선','주변 일반·정예 전열이 굳었습니다 · 보스 면역')}
    if (game.rare.myrmidon && game.kills >= game.rareKillMark) { game.rareKillMark += 30; for (let i = 0; i < 8; i++) fireProjectile(game.player.x + Math.cos(i * TAU / 8) * 260, game.player.y + Math.sin(i * TAU / 8) * 260, i * TAU / 8 + Math.PI, 650, 48, { life: .7, pierce: 2, color: '#f3d28a', type: 'myrmidon' }); banner('미르미돈의 군기', '창의 비가 전열을 가릅니다'); }
    if(game.kills===1)unlockAchievement('first');if(game.kills>=100)unlockAchievement('century');
    if(e.boss){for(const guard of game.enemies){if(guard.bossEscort)guard.dead=true;guard.arenaReserve=false;guard.arenaBound=false}meta.defeated[e.type]=(meta.defeated[e.type]||0)+1;game.bossKills++;game.arena=null;game.boss=null;game.bossIntro=0;game.spawnAcc=0;game.player.invuln=Math.max(game.player.invuln,1.8);const chestCount=bossRelicDropCount({boss:true,roll:gameRandom()});for(let i=0;i<chestCount;i++)game.pickups.push({x:e.x+(i?22:0),y:e.y,r:13,kind:'chest',value:1,life:120});saveMeta();if(Object.keys(meta.seen).filter(k=>ENEMY_DEF[k]?.boss).length>=7)unlockAchievement('breaker');banner(`${e.name} 격파`,`유물 상자 ${chestCount}개 · 예비 병력이 복귀합니다.`);audio.tone(620,.35,'triangle',.14);if(game.choiceQueue.length)scheduleRunChoice(owner=>{if(mode==='play'&&owner.choiceQueue.length)showChoices(owner.choiceQueue.shift())},650)}
    if(e.type==='hector'){game.hectorDefeated=true;endRun(true);}
  }

  function damagePlayer(raw, source) {
    const p = game.player;if(mode !== 'play')return;
    const sourceKind=source?.sourceKind||(source?.boss?'boss':source?.vx!==undefined?'projectile':source?.delay!==undefined||source?.hostile?'area':'melee');
    const defenseTag=source?.defenseTag||(source?.type==='fire'?'unavoidable':sourceKind==='projectile'?'reflectable':sourceKind==='area'||sourceKind==='boss'?'dodgeOnly':'parryable');
    let sourceId;if(source&&typeof source==='object'){sourceId=impactSourceIds.get(source);if(!sourceId){sourceId=`source:${++impactSerial}`;impactSourceIds.set(source,sourceId)}}
    const impactId=source?.impactId||`${sourceId||sourceKind}:${Math.floor(game.combatTime*12)}`;
    if(game.rich.consumedImpacts.has(impactId))return;
    const attack=makeAttackEvent({sourceKind,defenseTag,origin:{x:source?.x??p.x,y:source?.y??p.y},impactAt:game.combatTime*1000,threat:source?.boss||source?.windup?'high':'low',impactId,damage:raw});
    const reserved=source?._richIntent||null,intent=reserved?game.rich.scheduler.consume(reserved.impactId,game.rich.fixedTick):null;
    if(reserved&&!intent)return;
    if(intent)game.rich.consumedImpacts.add(impactId);
    const impactContext=intent&&source?.x!==undefined?defenseImpactContext(game.rich.defense,source,p):{facing:p.aim,player:{x:p.x,y:p.y},origin:intent?.origin};
    const impactIntent=intent&&impactContext.origin?{...intent,origin:impactContext.origin}:intent;
    const richResult=intent?game.rich.ports.defense.resolve(game.rich.defense,impactIntent,{tick:game.rich.fixedTick,facing:impactContext.facing,player:impactContext.player}):{outcome:'hit',reflected:false,counterDamage:0};
    const presentationDefense=resolveDefense(p.defense,attack,{player:{x:p.x,y:p.y,facing:p.aim}});
    const defense={outcome:richResult.outcome==='parried'?(richResult.reflected?'reflected':'parried'):richResult.outcome,reflect:!!richResult.reflected,counter:richResult.counterDamage>0,damageMultiplier:presentationDefense.damageMultiplier??1};
    if(defense.outcome==='dodged'){const owner=source?.owner||source;if(owner?.boss&&owner.bossAdaptation)owner.bossAdaptation=applyBossParryResult(owner.bossAdaptation,{type:'dodge',tick:game.rich.fixedTick});if(source?.vx!==undefined)closeHostileProjectile(source,'impact',{outcome:'dodged',playerDamage:0,ownerReflected:false});textPop(p.x,p.y-38,'회피','#82dcea');return defense.outcome}
    if(defense.outcome==='parried'||defense.outcome==='reflected'){
      p.parries++;game.hitStop=.09;game.flash=.18;audio.tone(880,.12,'square',.12);
      const bossOwner=source?.owner||source;if(bossOwner?.boss&&bossOwner.bossAdaptation)bossOwner.bossAdaptation=applyBossParryResult(bossOwner.bossAdaptation,{type:'parry',tick:game.rich.fixedTick});if(bossOwner?.type==='aeneas'&&defense.counter)bossOwner.guardBreakTicks=120;
      if(source?.stun!==undefined)source.stun=Math.max(source.stun||0,1.4);
      let ownerHpBefore=null,ownerHpAfter=null;
      if(defense.reflect&&source?.vx!==undefined){source.friendly=true;source.vx*=-1;source.vy*=-1;source.damage*=1.25;const owner=source.owner;if(owner&&!owner.dead&&owner.hp>0){ownerHpBefore=owner.hp;damageEnemy(owner,Math.max(1,source.damage),{source:'parryReflect',origin:p,unblockable:true,noGod:true});ownerHpAfter=owner.hp}}
      else if(source?.life!==undefined)source.life=0;
      if(defense.counter&&source?.hp>0){const counterDamage=24+p.defenseBuild.counterPower*12;p.defense.telemetry.counterDamage+=counterDamage;damageEnemy(source,counterDamage,{source:'parryCounter',origin:p,unblockable:true,noGod:true,stun:.8})}
      if(source?.vx!==undefined)closeHostileProjectile(source,'impact',{outcome:defense.outcome,playerDamage:0,ownerReflected:!!source?.owner,ownerHpBefore,ownerHpAfter});
      else recordCombatJournal({type:'impact',tick:game.rich.fixedTick,impactId,outcome:defense.outcome,playerDamage:0,ownerReflected:false,ownerHpBefore,ownerHpAfter});
      addAttack({kind:'ring',x:p.x,y:p.y,r:105,color:'#ffe18b',life:.38});textPop(p.x,p.y-42,defense.reflect?'반사':'완벽한 패링','#ffe18b',true);return defense.outcome;
    }
    if(p.invuln>0&&defenseTag!=='unavoidable')return;
    if(game.combatTime*1000-p.defense.lastDodgeEndedAt<=750)p.defense.telemetry.postDodgeHits++;
    if (defenseTag!=='unavoidable'&&game.blessings.athena && game.athenaReady <= 0) {
      game.athenaReady = 12; p.invuln = .35; textPop(p.x, p.y - 40, '아이기스', '#8fe0ec', true); shieldPulse(p.x, p.y, 0);
      for (const e of game.enemies) if (!e.dead && dist2(e, p) < 160 ** 2) e.stun = Math.max(e.stun, 1); return;
    }
    const shieldMitigation = game.weapons.shield ? (game.fusions.shield ? .82 : .92) * (hasNode('shield', 'guard') ? .9 : 1) : 1;
    const spearBrace = p.motion?.kind === 'spear' && hasNode('spear', 'brace') ? .72 : 1;
    const phalanxGuard=game.hero==='hoplite'&&p.hp/p.maxHp<.35?.45:1,damage = Math.max(1, raw * defense.damageMultiplier * shieldMitigation * spearBrace * phalanxGuard * (p.exposedTicks>0?1.35:1) * (1 - clamp(p.armor, 0, .65)));
    if (p.hp - damage <= 0) {
      if(game.hero==='hoplite'&&p.lastStandCd<=0){p.lastStandCd=45;p.hp=p.maxHp*.35;p.invuln=1.5;banner('테라몬의 최후 방진','무너진 방패를 다시 맞대고 전열을 세웠습니다');addAttack({kind:'ring',x:p.x,y:p.y,r:150,color:'#f0c86d',life:.7});return}
      if(p.revives>0){p.revives--;p.hp=p.maxHp*.55;p.invuln=2;banner('모이라이의 실','영웅이 55% 체력으로 다시 일어섰습니다');audio.sfx?.('revive');return}
      if (game.blessings.apollo && game.apolloCd <= 0) { game.apolloCd = 45; p.hp = p.maxHp * .35; p.invuln = 1.3; banner('아폴론의 새벽', '치명상을 견디고 다시 일어섰습니다'); return; }
      if (game.rare.fateReady) { game.rare.fateReady = false; p.hp = p.maxHp * .5; p.invuln = 1.5; banner('모이라이의 매듭', '끊어진 생명의 실이 한 번 이어졌습니다'); return; }
    }
    recordAppliedDamage(p.defense,attack,Math.min(p.hp,damage));applyPendingParryFailure(p);p.hp = Math.max(0, p.hp - damage);if(source?.poison&&source?.owner?.type==='paris')game.poison=applyPoisonHit(game.poison,{tick:game.rich.fixedTick,bossDamage:source.owner.damage,eventId:impactId});if(intent){if(source?.vx!==undefined)closeHostileProjectile(source,'impact',{outcome:'hit',playerDamage:damage,ownerReflected:false});else recordCombatJournal({type:'impact',tick:game.rich.fixedTick,impactId,outcome:'hit',playerDamage:damage,ownerReflected:false})}enterHurtState(p.defense,game.combatTime*1000);p.invuln = .6; p.flash = .2; game.flash = .15; game.shake = 12;
    if(game.relics.seaCharm&&(game.relicTimers.sea||0)<=0){game.relicTimers.sea=Math.max(3.5,7-game.relics.seaCharm*.45);addAttack({kind:'ring',x:p.x,y:p.y,r:145,color:'#77bdd3',life:.45});for(const e of nearbyEnemies(p.x,p.y,165))if(!e.dead)damageEnemy(e,6,{source:'seaCharm',origin:p,knock:340,unblockable:true,noGod:true})}
    if(meta.settings.numbers)textPop(p.x, p.y - 38, `-${Math.round(damage)}`, '#ff7770', true); particle(p.x, p.y, '#e6554b', 10, 155, 'shard');audio.tone(92,.13,'sawtooth',.12);
    if (source?.type === 'stone'||source?.type==='net'||source?.slow) p.slow = Math.max(p.slow,source?.type==='net'?2.8:2);
    if (p.hp <= 0) endRun(false);
  }

  function collectPickup(q) {
    if (q.kind === 'xp') {
      audio.sfx('pickup',.16);
      const earned = q.value * game.player.xpGain * (1+(game.streak-1)*.2);
      game.xp += earned;
      while (game.xp >= game.xpNeed) {
        game.xp -= game.xpNeed; game.level++; game.xpNeed = xpRequirement(game.level); game.choiceQueue.push(game.level % 10 === 0 ? 'rare' : 'level');
      }
      if (game.choiceQueue.length && mode === 'play'&&!game.boss) showChoices(game.choiceQueue.shift());
    } else if (q.kind === 'heal') {
      game.player.hp = Math.min(game.player.maxHp, game.player.hp + q.value); textPop(game.player.x, game.player.y - 32, `+${q.value}`, '#85d58a', true);
    } else if (q.kind === 'magnet') {
      for (const p of game.pickups) if (p.kind === 'xp') p.magnet = true; banner('아리아드네의 실', '흩어진 전공 인장이 한꺼번에 끌려옵니다');
    } else if (q.kind === 'chest') openChest();
  }

  function doDash() {
    if (!game || mode !== 'play') return; const p = game.player; if (p.dashCharges <= 0 || p.dashTime > 0) return;
    let dx = 0, dy = 0; if (keys.has('KeyA') || keys.has('ArrowLeft')) dx--; if (keys.has('KeyD') || keys.has('ArrowRight')) dx++;
    if (keys.has('KeyW') || keys.has('ArrowUp')) dy--; if (keys.has('KeyS') || keys.has('ArrowDown')) dy++;
    const pad=navigator.getGamepads?.()[0];if(pad){dx+=Math.abs(pad.axes[0]||0)>.18?pad.axes[0]:0;dy+=Math.abs(pad.axes[1]||0)>.18?pad.axes[1]:0}
    let l = Math.hypot(dx, dy); if (l < .1) { dx = Math.cos(p.aim); dy = Math.sin(p.aim); } else { dx /= l; dy /= l; }
    const requested=game.rich.ports.defense.request(game.rich.defense,'dodge',game.rich.fixedTick,{x:dx,y:dy});
    if(requested===game.rich.defense)return;
    game.rich.defense=requested;
    game.rich.dodgeTelemetry={tick:game.rich.fixedTick,x:p.x,y:p.y};
    requestDefense(p.defense,'dodge',game.combatTime*1000);
    p.dashX = dx; p.dashY = dy; p.dashTime = .495; p.dashCharges--; p.dashHit.clear();
    if (p.dashRecharge <= 0) p.dashRecharge = p.dashBase * (game.blessings.hermes ? .75 : 1);
    game.shake = 4;audio.tone(145,.09,'sine',.06);
    void richAudio.play('sfx_dodge_start',{bus:'combat'});
  }

  function updatePlayer(dt) {
    const p = game.player, oldX = p.x, oldY = p.y;p.exposedTicks=advanceParryExposure(p.exposedTicks,false);game.rich.defense=game.rich.ports.defense.step(game.rich.defense,game.rich.fixedTick);advanceDefense(p.defense,dt*1000,game.combatTime*1000);applyPendingParryFailure(p);p.parry=game.rich.defense.action==='parry'&&game.rich.defense.phase==='active'?.001:0;p.invuln = Math.max(0, p.invuln - dt); p.flash = Math.max(0, p.flash - dt); p.slow = Math.max(0, p.slow - dt);p.manualAim=Math.max(0,(p.manualAim||0)-dt);p.parryCd=Math.max(0,p.parryCd-dt);p.lastStandCd=Math.max(0,p.lastStandCd-dt);const recovery=p.recovery+(game.hero==='hoplite'&&p.hp/p.maxHp<.35?2.5:0);if(recovery>0&&p.hp>0&&p.hp<p.maxHp)p.hp=Math.min(p.maxHp,p.hp+recovery*dt);
    if(game.poison?.active){const before=p.hp,poison=tickPoison(game.poison,game.rich.fixedTick,p.hp);game.poison=poison.state;p.hp=Math.max(0,poison.hp);if(p.hp<before){textPop(p.x,p.y-42,`독 -${Math.round(before-p.hp)}`,'#8bc65e',true);if(p.hp<=0){endRun(false);return}}}
    if (p.motion) { p.motion.time -= dt; if (p.motion.time <= 0) p.motion = null; }
    if (p.dashCharges < p.dashMax) {
      p.dashRecharge -= dt; if (p.dashRecharge <= 0) { p.dashCharges++; if (p.dashCharges < p.dashMax) p.dashRecharge = p.dashBase * (game.blessings.hermes ? .75 : 1); }
    }
    let dx = 0, dy = 0; if (keys.has('KeyA') || keys.has('ArrowLeft')) dx--; if (keys.has('KeyD') || keys.has('ArrowRight')) dx++;
    if (keys.has('KeyW') || keys.has('ArrowUp')) dy--; if (keys.has('KeyS') || keys.has('ArrowDown')) dy++;
    const pad=navigator.getGamepads?.()[0];if(pad){dx+=Math.abs(pad.axes[0]||0)>.18?pad.axes[0]:0;dy+=Math.abs(pad.axes[1]||0)>.18?pad.axes[1]:0;const ax=pad.axes[2]||0,ay=pad.axes[3]||0;if(Math.hypot(ax,ay)>.28){p.aim=Math.atan2(ay,ax);p.manualAim=.24}if(pad.buttons[0]?.pressed&&!p.padDash){p.padDash=true;doDash()}if(!pad.buttons[0]?.pressed)p.padDash=false;if(pad.buttons[1]?.pressed&&!p.padParry){p.padParry=true;doParry()}if(!pad.buttons[1]?.pressed)p.padParry=false;if(pad.buttons[2]?.pressed&&!p.padUltimate){p.padUltimate=true;useUltimate()}if(!pad.buttons[2]?.pressed)p.padUltimate=false}
    const l = Math.hypot(dx, dy); if (l > 1) { dx /= l; dy /= l; }
    const slow = p.slow > 0 ? .62 : 1;
    if (p.dashTime > 0) {
      p.dashTime -= dt;const dodgeActive=game.rich.defense.action==='dodge'&&game.rich.defense.phase==='active';if(dodgeActive){const dodgeScale=3.9*(1+p.defenseBuild.dodgeDistance*.1);p.x += p.dashX * p.speed * dodgeScale * dt; p.y += p.dashY * p.speed * dodgeScale * dt;}
      particle(p.x, p.y, '#ddb769', 1, 25, 'dust');
      if (game.relics.icarus && gameRandom() < .35) addZone(p.x, p.y, 30, 2.8, 5, '#d7633e');
      if (hasNode('shield', 'ram')) for (const e of game.enemies) if (!e.dead && !p.dashHit.has(e.id) && dist2(e, p) < (e.r + 30) ** 2) { p.dashHit.add(e.id); damageEnemy(e, 18 * weaponPower('shield'), { source: 'shield', origin: p, knock: 460, stun: .5, unblockable: true }); }
      if (hasNode('sword', 'dashcut') && p.dashTime <= 0) swordSweep(Math.atan2(p.dashY, p.dashX), 42, 2.2, 110);
      if(p.dashTime<=0&&p.defenseBuild.dodgeExitGuard)p.invuln=Math.max(p.invuln,p.defenseBuild.dodgeExitGuard*.06);
    } else { p.x += dx * p.speed * slow * dt; p.y += dy * p.speed * slow * dt; }
    if (game.arena) {
      const ax = p.x - game.arena.x, ay = p.y - game.arena.y, ad = Math.hypot(ax, ay), max = game.arena.r - 29;
      if (ad > max) { p.x = game.arena.x + ax / ad * max; p.y = game.arena.y + ay / ad * max; game.shake = Math.max(game.shake, 2); }
    }
    for(const o of game.obstacles){const ox=p.x-o.x,oy=p.y-o.y,od=Math.hypot(ox,oy)||1,min=p.r+o.r*.86;if(od<min&&o.solid){p.x=o.x+ox/od*min;p.y=o.y+oy/od*min}if(od<min&&o.type==='fire')damagePlayer(5,o)}
    p.moving = p.dashTime > 0 || l > .06;
    const measuredVx = (p.x - oldX) / Math.max(dt, .001), measuredVy = (p.y - oldY) / Math.max(dt, .001);
    p.vx = lerp(p.vx, measuredVx, 1 - Math.pow(.02, dt)); p.vy = lerp(p.vy, measuredVy, 1 - Math.pow(.02, dt));
    if (Math.hypot(p.vx, p.vy) > 20) p.moveHeading = Math.atan2(p.vy, p.vx);
    if (p.moving) {
      const stride=clamp(Math.hypot(measuredVx,measuredVy)/Math.max(1,p.speed),.42,1.32);p.walkPhase += dt * (p.dashTime > 0 ? 15 : 7.1 * stride);
      const step = Math.floor(p.walkPhase);
      if (step !== p.stepMark) { p.stepMark = step; if (step % 2 === 0) particle(p.x - Math.cos(p.moveHeading) * 8, p.y - Math.sin(p.moveHeading) * 8, '#9f8053', 2, 24, 'dust'); }
    }
    game.camera.x = lerp(game.camera.x, p.x, 1 - Math.pow(.0007, dt)); game.camera.y = lerp(game.camera.y, p.y, 1 - Math.pow(.0007, dt));
  }

  function updateProjectiles(dt) {
    const p = game.player;
    for (const q of game.projectiles) {
      q.life -= dt;
      if(!q.friendly&&q._richPendingIntent){const forecast=projectileIntercept({projectile:q,player:p});q._richClosestApproach=Math.min(q._richClosestApproach??Infinity,forecast.closestApproach);if(!q._richIntent&&forecast.collisionCourse&&forecast.timeToClosestTicks<=18){reserveAttackIntent(q,q._richPendingIntent.damage,{sourceKind:'projectile',defenseTag:'reflectable',direction:q._richPendingIntent.direction,delayTicks:Math.max(1,forecast.timeToClosestTicks)});q._richPendingIntent=null}}
      if(q.friendly&&q.boomerang&&!q.returned&&q.life<=q.returnAt){q.returned=true;q.hit.clear()}
      if(q.friendly&&q.boomerang&&q.returned){const ax=p.x-q.x,ay=p.y-q.y,ad=Math.hypot(ax,ay)||1,s=Math.max(520,Math.hypot(q.vx,q.vy));q.vx=ax/ad*s;q.vy=ay/ad*s;if(ad<p.r+12){q.life=0;if(hasNode('sword','catch'))game.swordCatchBuff=1;textPop(p.x,p.y-28,'검 회수','#ffe09a');continue}}
      q.x += q.vx * dt; q.y += q.vy * dt;
      for(const o of game.obstacles)if(o.solid&&!o.dead&&dist2(q,o)<(q.r+o.r*.82)**2){if(!q.friendly)closeHostileProjectile(q,'obstacle');q.life=0;if(q.friendly)damageObstacle(o,Math.max(8,q.damage*.42));addAttack({kind:'impactFx',x:q.x,y:q.y,r:18,color:'#d9be86',life:.18,angle:Math.atan2(q.vy,q.vx)});particle(q.x,q.y,'#d7c39b',3,80,'shard');break}
      if(q.life<=0){if(!q.friendly)closeHostileProjectile(q,q._richIntent?'expired':'miss');continue}
      if (q.trail && game.particles.length < (renderQuality === 'high' ? 300 : 150) && visualRandom() < .28 * effectScale) game.particles.push({ x: q.x, y: q.y, vx: -q.vx * .018, vy: -q.vy * .018, life: .13, max: .13, r: q.r * .42, color: q.color, shape: 'spark', spin: 0 });
      if (q.friendly) {
        for (const e of nearbyEnemies(q.x, q.y, q.r + 38)) if (!q.hit.has(e.id) && dist2(q, e) < (q.r + e.r) ** 2) {
          q.hit.add(e.id); damageEnemy(e, q.damage, { source: q.type, origin: q, knock: 105, slow: q.slow, ranged:true, unblockable:(q.type==='playerJavelin'&&q.pierce>0) });if(q.type==='myrmidonSupport')p.defense.telemetry.supportDamage+=q.damage;
          if (q.mark) e.mark = Math.max(e.mark, q.mark);
          if (q.slow) e.slow = Math.max(e.slow, 3);
          if (q.split) { const a = Math.atan2(q.vy, q.vx); fireProjectile(q.x, q.y, a + .58, 520, q.damage * .48, { life: .65, type: 'split', color: q.color }); fireProjectile(q.x, q.y, a - .58, 520, q.damage * .48, { life: .65, type: 'split', color: q.color }); q.split = false; }
          if (q.blast) { explode(q.x, q.y, q.blast, q.damage * .42); q.blast = 0; }
          if (game.fusions.javelin && q.type === 'playerJavelin' && !q.fusionTriggered) { q.fusionTriggered = true; skyJavelinRain(e); }
          if(q.bounces>0){q.bounces--;const t=game.enemies.filter(x=>!x.dead&&!q.hit.has(x.id)).sort((a,b)=>dist2(a,q)-dist2(b,q))[0];if(t&&dist2(t,q)<320**2){const a=Math.atan2(t.y-q.y,t.x-q.x),s=Math.hypot(q.vx,q.vy);q.vx=Math.cos(a)*s;q.vy=Math.sin(a)*s}else if(!q.boomerang){q.life=0;break}}
          else if(q.boomerang){q.returned=true;q.hit.clear()}
          else if (q.pierce > 0) q.pierce--; else { q.life = 0; break; }
        }
      } else {
        const pd = dist2(q, p), shieldRange = hasNode('shield', 'bulwark') ? 108 : game.fusions.shield ? 86 : 58, incomingAngle = Math.atan2(q.y - p.y, q.x - p.x), front = Math.cos(incomingAngle - p.aim) > (hasNode('shield', 'bulwark') ? -.62 : game.fusions.shield ? -.35 : .05);
        const activeParry=game.rich.ports.defense.snapshot(game.rich.defense).phase==='active';
        if (game.weapons.shield && !activeParry && pd < shieldRange ** 2 && front) {
          closeHostileProjectile(q,'shield-block');q.life = 0; addAttack({ kind: 'shieldBlock', x: q.x, y: q.y, angle: p.aim, r: 25, color: '#e2bd68', life: .2 }); particle(q.x, q.y, '#e2bd68', 4, 80, 'spark');
          if (hasNode('shield', 'counter')) { const w = game.weapons.shield; w.blockCount = (w.blockCount || 0) + 1; if (w.blockCount >= 4) { w.blockCount = 0; shieldPulse(p.x, p.y, 22); } }
          if (game.fusions.shield || hasNode('shield', 'reflect')) { const t = nearestEnemy(p.x, p.y, 520); if (t) fireProjectile(q.x, q.y, Math.atan2(t.y - q.y, t.x - q.x), 560, game.fusions.shield ? 32 : 18, { life: .8, type: 'bronzeShard', color: '#e5bd68', trail: false }); }
        } else if (pd < (q.r + p.r) ** 2) { const outcome=damagePlayer(q.damage * (game.weapons.shield ? (game.fusions.shield ? .62 : .84) : 1), q);if(outcome!=='reflected')q.life = 0; }
      }
    }
    game.projectiles = game.projectiles.filter(q => q.life > 0);
    game.hostileProjectiles = game.projectiles.reduce((n, q) => n + (!q.friendly ? 1 : 0), 0);
  }

  function explode(x, y, r, damage) {
    addAttack({ kind: 'blast', x, y, r, color: '#e8874b', life: .36 }); particle(x, y, '#ef9455', 16, 190, 'spark');
    for (const e of game.enemies) if (!e.dead && dist2(e, { x, y }) < (r + e.r) ** 2) damageEnemy(e, damage, { source: 'blast', origin: { x, y }, knock: 160, unblockable: true });
  }

  function skyJavelinRain(target) {
    const candidates = game.enemies.filter(e => !e.dead && (e.type === 'archer' || e.type === 'slinger' || dist2(e, target) < 230 ** 2)).sort((a, b) => dist2(a, target) - dist2(b, target)).slice(0, 7);
    for (const e of candidates) { addAttack({ kind: 'skySpear', x: e.x, y: e.y, r: 34, color: '#e6c070', life: .34 }); damageEnemy(e, 34, { source: 'skyJavelin', origin: target, knock: 80, unblockable: true }); }
  }

  function shootEnemy(e, type, speed, damage) {
    const a = Math.atan2(game.player.y - e.y, game.player.x - e.x);
    fireProjectile(e.x, e.y, a, speed*(e.attackTiming?.projectileSpeedMultiplier||1), damage, { r: type === 'stone' ? 7 : 6, friendly: false, color: type === 'stone' ? '#a4957d' : '#e66f45', type, life: 2.4,owner:e });
  }

  function releaseEnemyWindup(e,p,d){
    const aim=Math.atan2(p.y-e.y,p.x-e.x),hostile={friendly:false,owner:e};
    if(e.type==='eliteArcher')for(const off of[-.1,0,.1])fireProjectile(e.x,e.y,aim+off,390*(e.attackTiming?.projectileSpeedMultiplier||1),e.damage*.72,{...hostile,r:6,color:'#e67261',type:'eliteArrow',life:2.5});
    else if(e.type==='firearcher'){fireProjectile(e.x,e.y,aim,350*(e.attackTiming?.projectileSpeedMultiplier||1),e.damage,{...hostile,r:7,color:'#f27743',type:'fireArrow',life:2.3});game.hazards.push({x:p.x+p.vx*.34,y:p.y+p.vy*.34,r:34,delay:.75,life:1.2,damage:e.damage*.72,fired:false})}
    else if(e.type==='netter')fireProjectile(e.x,e.y,aim,270*(e.attackTiming?.projectileSpeedMultiplier||1),e.damage*.72,{...hostile,r:12,color:'#c9b384',type:'net',life:2.2,slow:1});
    else if(e.type==='engineer')for(const off of[-.09,.09])fireProjectile(e.x,e.y,aim+off,240*(e.attackTiming?.projectileSpeedMultiplier||1),e.damage*.82,{...hostile,r:8,color:'#b78959',type:'stone',life:2.5});
    else if(e.type==='giant'){if(d<155)damagePlayer(e.damage*1.2,e);addAttack({kind:'blast',x:e.x,y:e.y,r:132,color:'#cf8f4f',life:.45})}
    else shootEnemy(e,e.type==='slinger'?'stone':'arrow',e.type==='slinger'?250:335,e.damage);
  }

  function detonateBomber(e) {
    if (e.dead) return; e.dead = true;
    addAttack({ kind: 'blast', x: e.x, y: e.y, r: 88, color: '#ef6d3f', life: .42 }); particle(e.x, e.y, '#ef7a42', 22, 230, 'spark'); game.shake = Math.max(game.shake, 8);
    if (dist2(e, game.player) < (88 + game.player.r) ** 2) damagePlayer(e.damage, e);
    for (const other of nearbyEnemies(e.x, e.y, 112)) if (other !== e && !other.dead && dist2(e, other) < (78 + other.r) ** 2) damageEnemy(other, 24, { source: 'enemyBlast', origin: e, knock: 210, unblockable: true, noGod: true });
  }

  function consumeBossAdaptation(e,intent,created){e.bossAdaptation=consumeAdaptationAfterSpawn(e.bossAdaptation,intent,created)}
  function spawnBossIntent(e,p,raw,{angle=e.bossMechanic?.angle??Math.atan2(p.y-e.y,p.x-e.x),type=`boss:${e.bossMechanic?.patternId||e.type}`,poison=false,speedMultiplier=1}={}){
    const phase=e.bossMechanic?.phase||1,runtime=e.bossMechanic?.runtime||bossManifestPatternRuntime({},phase),damage=raw.damage??e.damage*(.7+phase*.15),baseIntent=raw.impactId?{...raw,origin:{x:e.x,y:e.y},direction:angle,impactAt:game.rich.fixedTick+1}:game.rich.ports.intent.create({sourceKind:'projectile',defenseTag:raw.defenseTag,origin:{x:e.x,y:e.y},direction:angle,impactAt:game.rich.fixedTick+1,threat:'high',telegraphId:`boss-telegraph-${++game.rich.intentSerial}`,impactId:`boss:${e.bossMechanic?.instanceId||e.id}:${++impactSerial}`,damage},{mode:'production'});if(!baseIntent)return null;const intent=adaptBossIntent(e.bossAdaptation,baseIntent,game.rich.fixedTick),projectileSpeed=runtime.projectileSpeed*speedMultiplier,life=clamp(runtime.distance/projectileSpeed,.35,6);let created=null;
    if(intent.defenseTag==='reflectable'||intent.defenseTag==='parryable'){created=fireProjectile(e.x,e.y,angle,projectileSpeed,damage,{r:7,friendly:false,color:poison?'#8bc65e':'#ef8d58',type,life,owner:e,poison});if(created){created._richPendingIntent=null;if(!attachAttackIntent(created,{...intent,damage})){created.dead=true;created=null}}}
    else {const candidate={x:p.x+p.vx*.35,y:p.y+p.vy*.35,r:intent.radius||72,delay:.55,life:1.5,damage,fired:false,owner:e,defenseTag:intent.defenseTag};if(attachAttackIntent(candidate,{...intent,damage})){created=candidate;game.hazards.push(created)}}
    consumeBossAdaptation(e,intent,!!created);return created;
  }
  function releaseBossRawIntents(e,p){for(const intent of e.bossMechanic.rawIntents)spawnBossIntent(e,p,intent);e.bossMechanic.rawIntents=[]}
  function executeBossMechanicAction(e,p,action){const mechanic=e.bossMechanic,profile=mechanic.profile;
    if(action.type==='redirect'){mechanic.angle=Math.atan2(p.y-e.y,p.x-e.x)+e.orbit*.42;mechanic.redirectTick=game.rich.fixedTick;return}
    if(action.type==='paris-emerge'){e.hiddenTicks=e.invulnerableTicks=0;spawnBossIntent(e,p,{defenseTag:'reflectable',damage:e.damage},{angle:mechanic.angle,type:'parisPoison',poison:true,speedMultiplier:1.45});releaseBossRawIntents(e,p);banner('파리스 · 독화살','은신 이동 뒤 드러나는 순간 화살을 반사하십시오');return}
    if(action.type==='sarpedon-slam'){e.airborneTicks=e.invulnerableTicks=0;spawnBossIntent(e,p,{defenseTag:'dodgeOnly',damage:e.damage*1.35,radius:138},{type:'sarpedonSlam'});releaseBossRawIntents(e,p);banner('사르페돈 · 천공 강하','착지 표식은 패링할 수 없습니다. 구르십시오');return}
    if(action.type==='chariot-charge'||action.type==='chariot-reentry'||action.type==='penthesilea-charge'){mechanic.angle=action.type==='chariot-reentry'?mechanic.reentryAngle:mechanic.angle;const created=spawnBossIntent(e,p,{defenseTag:'parryable',damage:e.damage},{angle:mechanic.angle,type:action.type});if(created)e.defenseTag=created._richIntent?.defenseTag||created.defenseTag;releaseBossRawIntents(e,p);return}
    if(action.type==='memnon-attack'){const geometry=memnonCorridorGeometry({x:p.x,y:p.y,angle:mechanic.angle,playerDiameter:p.r*2,phase:mechanic.phase});mechanic.corridor=geometry;for(const boundary of geometry.boundaries)for(let i=-2;i<=2;i++)addZone(boundary.x+Math.cos(boundary.angle)*boundary.length*i/5,boundary.y+Math.sin(boundary.angle)*boundary.length*i/5,boundary.width/2,3.6,e.damage*.08,'#dc5f32',0,true);spawnBossIntent(e,p,{defenseTag:'dodgeOnly',damage:e.damage*.8,radius:52},{type:'memnonCorridor'});releaseBossRawIntents(e,p);banner('멤논 · 태양 회랑','최소 통로는 플레이어보다 12px 넓습니다');return}
    if(action.type==='hector-attack'){const tag=profile.combo[(e.comboIndex||0)%profile.combo.length];e.comboIndex=(e.comboIndex||0)+1;spawnBossIntent(e,p,{defenseTag:tag,damage:e.damage*1.15,radius:88},{type:'hectorCombo'});releaseBossRawIntents(e,p);return}
    releaseBossRawIntents(e,p);
  }
  function updateBossPatterns(e,dt,p){const manifest=assetManifests.bosses;if(!manifest)return;if(!e.richBoss||typeof e.richBoss!=='object')e.richBoss=game.rich.ports.boss.create({bossId:e.type,maxHp:e.maxHp,seed:Number.parseInt(String(e.id).replace(/\D/g,'').slice(-8),10)||1});e.guardBreakTicks=Math.max(0,(e.guardBreakTicks||0)-1);
    if(e.bossMechanic){const result=stepBossMechanic(e.bossMechanic);e.bossMechanic={...e.bossMechanic,...result.state};e.hiddenTicks=e.bossMechanic.stage==='stealth'?e.bossMechanic.remaining:0;e.invulnerableTicks=['stealth','airborne'].includes(e.bossMechanic.stage)?e.bossMechanic.remaining:0;e.airborneTicks=e.bossMechanic.stage==='airborne'?e.bossMechanic.remaining:0;for(const action of result.actions)executeBossMechanicAction(e,p,action);if(e.bossMechanic.complete){e.richBoss=game.rich.ports.boss.reduce(e.richBoss,{type:'step',tick:game.rich.fixedTick},manifest);e.bossMechanic=null;e.bossPatternCd=.1}return}
    e.bossPatternCd-=dt;if(e.bossPatternCd>0||game.bossIntro>0)return;e.richBoss=game.rich.ports.boss.reduce(e.richBoss,{type:'select-pattern',tick:game.rich.fixedTick},manifest);const log=e.richBoss.log.at(-1),patternId=log?.id;if(!patternId)return;const phase=e.richBoss.phase||1,seed=Number.parseInt(String(e.id).replace(/\D/g,'').slice(-8),10)||1,profile=bossPatternProfile(e.type,{seed:seed+e.richBoss.patternInstance,playerDiameter:p.r*2,phase}),instanceId=`${e.type}:${e.richBoss.patternInstance}`,rawIntents=game.rich.ports.boss.intents({bossId:e.type,patternId,instanceId,startTick:game.rich.fixedTick,origin:{x:e.x,y:e.y}},manifest),angle=Math.atan2(p.y-e.y,p.x-e.x),pattern=manifest.bosses.find(b=>b.id===e.type)?.patterns.find(x=>x.id===patternId),runtime=bossManifestPatternRuntime(pattern,phase),recoveryTicks=runtime.recoveryTicks;e.bossMechanic={...createBossMechanicState(e.type,{seed:seed+e.richBoss.patternInstance,recoveryTicks,feint:profile.feint}),profile,runtime,phase,patternId,instanceId,rawIntents,angle,reentryAngle:angle+(profile.reentryAngleOffset||0)};if(e.type==='paris'){e.hiddenTicks=e.invulnerableTicks=48;e.x=p.x-Math.cos(angle)*360;e.y=p.y-Math.sin(angle)*360}else if(e.type==='sarpedon')e.airborneTicks=e.invulnerableTicks=48;recordCombatJournal({type:'boss-pattern',tick:game.rich.fixedTick,bossId:e.type,phase,patternId,instanceId,intentCount:rawIntents.length,signature:profile.state});
  }

  const activeHighThreatEnemies=()=>game.enemies.filter(x=>!x.dead&&(x.windup>0||x.chargeWindup>0||x.pursuitWindup>0));
  const activeHighThreats=()=>activeHighThreatEnemies().map(x=>({boss:!!x.boss}));
  const bossHighIntentPending=()=>game.enemies.some(e=>!e.dead&&e.boss&&e.type==='chariot'&&e.chargeWindup<=0&&((e.phase<=0&&e.specialCd<=0)||(e.phase>0&&e.hp/e.maxHp<.5&&e.chargeChain<1)));
  const canStartHighThreat=candidate=>{const active=activeHighThreats();if(!candidate.boss&&bossHighIntentPending()&&!active.some(threat=>threat.boss)&&active.filter(threat=>!threat.boss).length>=1)return false;return canScheduleHighThreat(active,candidate)};
  const reserveBossHighSlot=()=>{if(!bossHighIntentPending())return;const normals=activeHighThreatEnemies().filter(e=>!e.boss);for(const e of normals.slice(1)){e.windup=0;e.chargeWindup=0;e.pursuitWindup=0;e.telegraph=0}};
  function updateEnemies(dt) {
    const p = game.player;
    reserveBossHighSlot();
    for (const e of game.enemies) {
      if (e.dead) continue;const cadence=e.threatCadence||1;e.attackCd-=dt*cadence;e.specialCd-=dt*cadence;e.pursuitCd-=dt*cadence;e.attackPose = Math.max(0, e.attackPose - dt); e.hitFlash = Math.max(0, e.hitFlash - dt);e.damagePopCd=Math.max(0,(e.damagePopCd||0)-dt);if(e.damagePopCd<=0)flushEnemyDamage(e);
      if(game.bossIntro>0&&e.arenaBound)continue;
      if(game.arena&&e.arenaReserve){const a=e.reserveAngle+(game.time*.035*e.orbit),rr=game.arena.r+105;e.x=game.arena.x+Math.cos(a)*rr;e.y=game.arena.y+Math.sin(a)*rr;e.facing=a+Math.PI;e.vx=e.vy=0;continue}
      if(e.boss){e.bossClock=(e.bossClock||0)+dt;if(e.bossClock>38&&!e.enraged){e.enraged=true;e.speed*=1.3;e.damage*=1.28;e.specialCd=0;banner('보스 격노','장기전으로 공격 속도·피해·패턴 빈도가 증가했습니다');game.flash=.3}if(e.enraged)e.specialCd-=dt*.45;updateBossPatterns(e,dt,p)}
      e.mark = Math.max(0, e.mark - dt);
      if (e.bleed > 0) { e.bleed -= dt; e.hp -= e.bleedDps * dt; if (e.hp <= 0) { killEnemy(e); continue; } }
      if (e.burn > 0) { e.burn -= dt; e.hp -= e.burnDps * dt; if (visualRandom() < .08) particle(e.x, e.y, '#e66f3f', 1, 28, 'spark'); if (e.hp <= 0) { killEnemy(e); continue; } }
      if (e.stun > 0) { e.stun -= dt; continue; }
      e.slow = Math.max(0, e.slow - dt); const dx = p.x - e.x, dy = p.y - e.y, d = Math.hypot(dx, dy) || 1, desiredFacing = Math.atan2(dy, dx);
      if (e.type === 'shieldman') {
        const turn = angleDelta(desiredFacing, e.guardFacing);
        if (Math.abs(turn) > .28) e.guardTurnDelay += dt; else { e.guardTurnDelay = Math.max(0, e.guardTurnDelay - dt * 2.5); e.guardFacing = desiredFacing; }
        if (e.guardTurnDelay >= 1) { e.guardFacing += clamp(turn, -3.8 * dt, 3.8 * dt); if (Math.abs(turn) < .16) e.guardTurnDelay = 0; }
        e.facing = e.guardFacing;
      } else e.facing = desiredFacing;
      const playerSpeed = Math.hypot(p.vx, p.vy), leadTime = clamp(d / Math.max(320, e.speed * 5), .08, .62) * e.lead;
      const flankAmount = playerSpeed > 40 ? Math.min(105, d * .2) * e.flank : 0;
      const targetDx = dx + p.vx * leadTime + Math.cos(p.moveHeading + e.orbit * Math.PI / 2) * flankAmount;
      const targetDy = dy + p.vy * leadTime + Math.sin(p.moveHeading + e.orbit * Math.PI / 2) * flankAmount;
      const targetDist = Math.hypot(targetDx, targetDy) || 1;
      const melee = !RANGED_ENEMY_TYPES.has(e.type) && e.type !== 'bomber'&&!e.boss;
      let mx = targetDx / targetDist, my = targetDy / targetDist, speed = e.speed * (e.slow > 0 ? .55 : 1) * (melee ? 1 + clamp((d - 160) / 820, 0, .78) : 1);
      if(e.bossMechanic){const stage=e.bossMechanic.stage,runtime=e.bossMechanic.runtime;if(stage==='recovery'&&runtime){const movement=runtime.movement;if(['stationary','fixed-aim','facing-lock'].includes(movement)){mx=my=0}else if(/away|retreat|decelerate/.test(movement)){mx=-dx/d;my=-dy/d}else if(/strafe|orbit|clockwise|sweep|semicircle/.test(movement)){mx=-dy/d;my=dx/d}else{mx=dx/d;my=dy/d}speed=runtime.speed;e.telegraph=0}else if(['stealth','airborne','landingTell','windup','reentryWindup','shortTell','feintShort','longTell'].includes(stage)){mx=my=0;e.vx=e.vy=0;e.telegraph=e.bossMechanic.remaining/60}else if(stage==='charge'||stage==='reentryCharge'){mx=my=0;const chargeSpeed=e.bossMechanic.runtime?.speed|| (e.type==='chariot'?820:760),eAngle=stage==='reentryCharge'?e.bossMechanic.reentryAngle:e.bossMechanic.angle;e.vx=Math.cos(eAngle)*chargeSpeed;e.vy=Math.sin(eAngle)*chargeSpeed}else if(stage==='retreat'){mx=-dx/d;my=-dy/d;speed=e.bossMechanic.runtime?.speed||speed*1.8}}
      if (e.type === 'skirmisher') { const desired = 92; mx = dx / d * clamp((d - desired) / 58, -1, 1) + -dy / d * e.orbit * 1.12; my = dy / d * clamp((d - desired) / 58, -1, 1) + dx / d * e.orbit * 1.12; if (e.specialCd <= 0) { e.specialCd = 2.05; e.vx = dx / d * 455; e.vy = dy / d * 455; e.telegraph = .18; } }
      if (e.type === 'bomber') {
        if (e.fuse > 0) { e.fuse -= dt; e.telegraph = e.fuse; mx *= .16; my *= .16; if (visualRandom() < .28) particle(e.x, e.y - 16, '#f18a3f', 1, 34, 'spark'); if (e.fuse <= 0) { detonateBomber(e); continue; } }
        else if (d < 88) { e.fuse = .82; e.telegraph = .82; }
      }
      if (['archer','slinger','firearcher','netter','engineer','eliteArcher'].includes(e.type)) {
        const desired=e.type==='eliteArcher'?405:e.type==='firearcher'?390:e.type==='engineer'?330:e.type==='netter'?255:e.type==='archer'?350:270;if(d<desired-35){mx=-dx/d;my=-dy/d}else if(d<desired+45){mx=-dy/d*e.orbit*.35;my=dx/d*e.orbit*.35}
        if(e.attackCd<=0&&e.windup<=0&&d<650&&canStartHighThreat({boss:!!e.boss})){const profile={eliteArcher:[.58,1.85],firearcher:[.82,2.8],netter:[.7,3.2],engineer:[1.05,3.35],archer:[.72,2.35],slinger:[.9,2.8]}[e.type],timing=enemyAttackTiming({seed:e.combatSeed,attackOrdinal:e.attackOrdinal++,seconds:game.time});e.attackTiming=timing;e.feintPending=timing.feint;e.windup=profile[0];e.attackCd=profile[1]*timing.cadenceMultiplier}
      }
      if(['cavalry','amazonrider','assassin','lancer'].includes(e.type)&&e.specialCd<=0&&d>115&&d<520&&canStartHighThreat({boss:!!e.boss})){e.specialCd=e.type==='assassin'?2.4:e.type==='amazonrider'?3.1:3.7;e.pursuitWindup=e.type==='assassin'?.14:.3;e.pursuitCd=e.specialCd;e.telegraph=e.pursuitWindup}
      if(e.type==='medic'){const desired=230;if(d<desired){mx=-dx/d;my=-dy/d}if(e.specialCd<=0){e.specialCd=5.2;addAttack({kind:'bannerPulse',x:e.x,y:e.y,r:155,color:'#8bc78b',life:.62});for(const ally of nearbyEnemies(e.x,e.y,175))if(ally!==e&&!ally.dead){ally.hp=Math.min(ally.maxHp,ally.hp+Math.max(5,ally.maxHp*.08));ally.stun=Math.max(0,ally.stun-.3)}}}
      if(e.type==='horncaller'){const desired=250;if(d<desired){mx=-dx/d;my=-dy/d}if(e.specialCd<=0){e.specialCd=5.8;addAttack({kind:'bannerPulse',x:e.x,y:e.y,r:205,color:'#a177d1',life:.72});for(const ally of nearbyEnemies(e.x,e.y,220))if(ally!==e&&!ally.dead){const ax=p.x-ally.x,ay=p.y-ally.y,ad=Math.hypot(ax,ay)||1;ally.vx+=ax/ad*145;ally.vy+=ay/ad*145;ally.attackCd-=.4}}}
      if(e.type==='giant'&&e.specialCd<=0&&d<175&&canStartHighThreat({boss:false})){e.specialCd=3.8;e.windup=.82;e.attackCd=2.2;e.telegraph=.82;addAttack({kind:'ring',x:e.x,y:e.y,r:128,color:'#d89a55',life:.82})}
      if(e.type==='eliteDrummer'){const desired=205;if(d<desired-35){mx=-dx/d;my=-dy/d}else if(d<desired+45){mx=-dy/d*e.orbit*.25;my=dx/d*e.orbit*.25}if(e.specialCd<=0){e.specialCd=4.6;addAttack({kind:'bannerPulse',x:e.x,y:e.y,r:175,color:'#c44e43',life:.7});for(const ally of nearbyEnemies(e.x,e.y,240))if(ally!==e&&!ally.dead){const ax=p.x-ally.x,ay=p.y-ally.y,ad=Math.hypot(ax,ay)||1;ally.vx+=ax/ad*115;ally.vy+=ay/ad*115}if(d<175)damagePlayer(e.damage*.62,e)}}
      if ((e.type === 'raider' || e.type === 'shieldman' || e.type === 'standard'||e.type==='eliteCaptain') && e.pursuitWindup <= 0 && e.pursuitTime <= 0 && e.pursuitCd <= 0 && d > 115 && d < 430&&canStartHighThreat({boss:!!e.boss})) {
        e.pursuitWindup = .26; e.pursuitCd = rand(5.8, 3.2); e.telegraph = .26;
      }
      if (e.pursuitWindup > 0) {
        const beforePursuit = e.pursuitWindup; e.pursuitWindup -= dt; e.telegraph = Math.max(0, e.pursuitWindup); mx *= .16; my *= .16;
        if (beforePursuit > 0 && e.pursuitWindup <= 0) { e.pursuitTime = .34; e.attackPose = .36; e.vx += dx / d * (285 + e.speed * 1.25); e.vy += dy / d * (285 + e.speed * 1.25); }
      } else if (e.pursuitTime > 0) { e.pursuitTime -= dt; speed *= 1.18; }
      let separated = 0; for (const other of nearbyEnemies(e.x, e.y, e.r * 2.2)) if (other !== e && separated < 5) { const sx = e.x - other.x, sy = e.y - other.y, sd = Math.hypot(sx, sy) || 1, gap = e.r + other.r; if (sd < gap) { const push = (gap - sd) / gap * .42; mx += sx / sd * push; my += sy / sd * push; separated++; } }
      if(e.windup>0){const before=e.windup;e.windup-=dt;mx*=.2;my*=.2;if(before>0&&e.windup<=0){if(e.feintPending){e.feintPending=false;e.windup=.32;e.telegraph=.32;e.facing+=e.orbit*.48}else releaseEnemyWindup(e,p,d)}}
      if (e.type === 'standard' && e.specialCd <= 0) { e.specialCd = 5.5; addAttack({ kind: 'bannerPulse', x: e.x, y: e.y, r: 145, color: '#b74a38', life: .42 }); e.speed *= 1.03; }
      e.x += (mx * speed + e.vx) * dt; e.y += (my * speed + e.vy) * dt; e.vx *= Math.pow(.025, dt); e.vy *= Math.pow(.025, dt);
      e.obstacleHitCd=Math.max(0,(e.obstacleHitCd||0)-dt);
      if(e.type!=='ghost')resolveObstacleCollisions(e)
      const movingSpeed = Math.hypot(mx * speed + e.vx, my * speed + e.vy);
      if (movingSpeed > 6) {
        e.walkPhase += dt * clamp(movingSpeed / 10, 4.5, 10.5);
        const step = Math.floor(e.walkPhase);
        if (step !== e.stepMark) { e.stepMark = step; if (step % 2 === 0 && visualRandom() < .16) particle(e.x, e.y + e.r * .65, '#8c704e', 1, 16, 'dust'); }
      }
      if (game.arena&&e.arenaBound) {
        const ax = e.x - game.arena.x, ay = e.y - game.arena.y, ad = Math.hypot(ax, ay), max = game.arena.r - 18;
        if (ad > max) { e.x = game.arena.x + ax / ad * max; e.y = game.arena.y + ay / ad * max; }
      }
      if (!(e.hiddenTicks>0)&&!(e.airborneTicks>0)&&d < e.r + p.r + 2) { damagePlayer(e.damage, e); e.vx -= dx / d * 130; e.vy -= dy / d * 130; }
    }
    game.enemies = game.enemies.filter(e => !e.dead && (game.arena || dist2(e, p) < 3400 ** 2));
  }

  function updatePickups(dt) {
    const p = game.player;
    for (const q of game.pickups) {
      if(Number.isFinite(q.life))q.life -= dt;if(q.kind==='xp'&&q.life<24)q.magnet=true;q.x += (q.vx || 0) * dt; q.y += (q.vy || 0) * dt; q.vx = (q.vx || 0) * Math.pow(.05, dt); q.vy = (q.vy || 0) * Math.pow(.05, dt);
      const dx = p.x - q.x, dy = p.y - q.y, d = Math.hypot(dx, dy) || 1;
      if (q.magnet || d < p.magnet) { const s = q.magnet ? 650 : clamp(520 - d * 2, 145, 520); q.x += dx / d * s * dt; q.y += dy / d * s * dt; }
      if (d < p.r + q.r + 7) { q.dead = true; collectPickup(q); }
    }
    game.pickups = game.pickups.filter(q => !q.dead && q.life > 0);
  }

  const ENCOUNTER_INFO = {
    well: { name: '아카이아의 우물', hint: '바람 사이로 물 흐르는 소리가 들립니다', color: '#72a9a5' },
    thunder: { name: '제우스의 봉인 항아리', hint: '멀리서 청동 항아리가 번쩍입니다', color: '#e6c45f' },
    ally: { name: '고립된 미르미돈', hint: '푸른 방패를 든 병사가 신호를 보냅니다', color: '#7098c8' },
    shrine: { name: '아레스의 작은 신전', hint: '붉은 제단의 불꽃이 흔들립니다', color: '#c85d49' },
    beacon: { name: '아카이아 봉화', hint: '꺼져 가는 아군 봉화가 보입니다', color: '#df9954' },
    supply: { name: '버려진 보급 수레', hint: '부서진 수레에 보급품이 남아 있습니다', color: '#b99b63' }
  };
  const SUPPLY_CHOICES=[
    {id:'bronze-aegis',name:'청동 아이기스',description:'최대 체력과 현재 체력 +20',price:40,effect:{stat:'maxHp',amount:20}},
    {id:'keen-whetstone',name:'예리한 숫돌',description:'모든 피해 +15%',price:55,effect:{stat:'damage',amount:.15}},
    {id:'hermes-sandals',name:'헤르메스 각반',description:'이동 속도 +18',price:45,effect:{stat:'speed',amount:18}},
  ];
  const WAR_SHOP_CATALOG=Object.freeze([
    {id:'maxHp',name:'청동 아이기스',description:'최대 체력과 현재 체력 +20',price:40},
    {id:'damage',name:'예리한 숫돌',description:'모든 피해 +15%',price:40},
    {id:'speed',name:'헤르메스 각반',description:'이동 속도 +18',price:40},
    {id:'recovery',name:'아폴론의 약초',description:'초당 회복 +0.15',price:40},
    {id:'area',name:'넓은 청동날',description:'공격 범위 +8%',price:40},
    {id:'cadence',name:'전쟁 북채',description:'공격 속도 +8%',price:40},
  ]);
  const WAR_SHOP_IDS=Object.freeze(WAR_SHOP_CATALOG.map(item=>item.id));

  function applyWarShopEffect(effectId){
    const p=game.player;
    if(effectId==='maxHp'){p.maxHp+=20;p.hp=Math.min(p.maxHp,p.hp+20)}
    else if(effectId==='damage')p.damage*=1.15;
    else if(effectId==='speed')p.speed+=18;
    else if(effectId==='recovery')p.recovery+=.15;
    else if(effectId==='area')p.area*=1.08;
    else if(effectId==='cadence')p.attackRate*=1.08;
  }
  function renderWarShop(){
    const shop=game?.rich.shop,slots=$('#warShopSlots');if(!shop||!slots)return;slots.innerHTML='';
    shop.slots.forEach((slot,index)=>{const item=WAR_SHOP_CATALOG.find(entry=>entry.id===slot?.id),button=document.createElement('button');button.className=`supplyChoice${game.rich.shopSelection===index?' selected':''}`;button.dataset.slot=String(index);button.disabled=!slot;button.innerHTML=slot?`<b>${index+1}. ${item?.name||slot.id}${slot.locked?' · 잠금':''}</b><span>${item?.description||slot.id}</span><small>${slot.price} 드라크마</small>`:`<b>${index+1}. 비어 있음</b><span>구매 또는 추방된 슬롯</span>`;button.onclick=()=>{game.rich.shopSelection=index;renderWarShop()};slots.appendChild(button)});
    $('#warShopReroll').textContent=`재굴림 · ${shop.rerollCost}`;
  }
  function applyWarShopAction(type){
    const before=game?.rich.shop;if(!before)return;const slot=game.rich.shopSelection,selected=before.slots[slot],key=`${before.token}:${type}:${before.processedActions.length}`;
    const action={type,slot,idempotencyKey:key,...(type==='buy'?{effectId:selected?.id}:{})},next=game.rich.ports.shop.apply(before,action);if(next===before)return;
    if(type==='buy'&&selected&&(next.effects[selected.id]||0)>(before.effects[selected.id]||0))applyWarShopEffect(selected.id);
    game.rich.shop=next;game.coins=next.balance;game.rich.wallet={...game.rich.wallet,drachma:next.balance};renderWarShop();updateHud();
  }
  function closeWarShop(){
    if(!game?.rich.shop)return;game.rich.campaign=game.rich.ports.campaign.step(game.rich.campaign,{action:{type:'close-safe-gate',idempotencyKey:`close:${game.rich.shop.token}`},scheduler:game.rich.scheduler});game.rich.shop=null;game.rich.pendingShopToken=null;$('#warShopOpen').classList.add('hidden');$('#warShopOverlay').classList.add('hidden');mode='play';
  }
  function openWarShop(token=game?.rich.pendingShopToken||`safe-${game?.rich.fixedTick||0}`){
    if(!game||game.rich.shop)return false;game.rich.campaign=game.rich.ports.campaign.step(game.rich.campaign,{action:{type:'open-safe-gate',token,idempotencyKey:`open:${token}`},scheduler:game.rich.scheduler});
    game.rich.shop=game.rich.ports.shop.create({token,balance:game.coins,catalog:WAR_SHOP_CATALOG,levelPoolIds:WAR_SHOP_IDS,rngState:game.rich.ports.shop.rngState(game.gameRng.state())});game.rich.shopSelection=0;mode='warShop';$('#warShopOpen').classList.add('hidden');renderWarShop();$('#warShopOverlay').classList.remove('hidden');return true;
  }
  $('#warShopOpen').onclick=()=>openWarShop();$('#warShopLock').onclick=()=>applyWarShopAction('lock');$('#warShopReroll').onclick=()=>applyWarShopAction('reroll');$('#warShopBanish').onclick=()=>applyWarShopAction('banish');$('#warShopPurchase').onclick=()=>applyWarShopAction('buy');$('#warShopClose').onclick=closeWarShop;

  function settleRichObjective(){
    if(!game||game.rich.objective.status!=='complete')return;const settled=game.rich.ports.objective.settle(game.rich.objective,game.rich.wallet);if(settled.objective===game.rich.objective)return;game.rich.objective=settled.objective;game.rich.wallet=settled.wallet;game.coins=settled.wallet.drachma;const token=settled.wallet.safeGateTokens.at(-1);game.rich.objectiveHistory.push({instanceId:game.rich.objective.instanceId,status:game.rich.objective.status,progress:game.rich.objective.progress,reward:game.rich.objective.reward,token,tick:game.rich.fixedTick});game.rich.pendingShopToken=token;$('#warShopOpen').classList.remove('hidden');banner('전장 목표 달성',`${token} · ${game.rich.objective.reward} 드라크마`);
  }
  function progressRichObjective(amount){if(!game||game.rich.objective.status!=='active')return;game.rich.objective=game.rich.ports.objective.progress(game.rich.objective,amount);settleRichObjective()}
  function updateRichCampaign(dt){
    const nextStage=game.rich.ports.campaign.transition(game.rich.campaign,game.missionTime),changed=nextStage.stage.objectiveId!==game.rich.campaign.stage.objectiveId;
    if(changed&&game.rich.objective.status!=='rewarded')game.rich.pendingStage=nextStage;
    else if(changed||game.rich.pendingStage){game.rich.campaign=game.rich.pendingStage||nextStage;game.rich.pendingStage=null;game.rich.objective=game.rich.ports.objective.create(game.rich.campaign.stage,{x:game.player.x+420,y:game.player.y});game.rich.objectiveWorldInstalled=false;installObjectiveWorld(game.rich.campaign.stage)}
    else game.rich.campaign=nextStage;
    if(!game.rich.objectiveWorldInstalled&&game.rich.fixedTick>=1802)installObjectiveWorld(game.rich.campaign.stage);
    const objective=game.rich.objective;if(objective.type==='capture'&&objective.status==='active'&&dist2(game.player,objective.position)<90**2)progressRichObjective(dt);
  }
  function installObjectiveWorld(stage){
    if(game.rich.fixedTick<1802){game.rich.objectiveWorldInstalled=false;return}game.rich.objectiveWorldInstalled=true;game.obstacles=game.obstacles.filter(obstacle=>!obstacle.objectiveId);if(stage.objectiveType!=='destroy')return;
    const p=game.player,directions=stage.packageId==='shore'?[[0,-1],[0,-1],[0,-1]]:[[1,0],[0,1],[-1,0],[0,-1]];
    for(let index=0;index<stage.targets;index++){const [dx,dy]=directions[index%directions.length],distance=210+index*210;game.obstacles.push({x:p.x+dx*distance,y:p.y+dy*distance,r:42,type:stage.packageId==='city'?'column':'barrier',hp:72,maxHp:72,solid:true,flash:0,popCd:0,sector:null,objectiveId:stage.objectiveId})}rebuildObstacleGrid();
  }

  function closeSupplyShop(){const overlay=$('#supplyOverlay');overlay.classList.add('hidden');if(game&&mode==='supply')mode='play'}
  function openSupplyShop(token=`supply-${game?.missionTime||0}`){
    if(!game||!$('#supplyOverlay'))return;mode='supply';const balance=$('#supplyBalance'),choices=$('#supplyChoices');balance.textContent=Math.floor(game.coins);choices.innerHTML='';
    for(const choice of SUPPLY_CHOICES){const button=document.createElement('button');button.className='supplyChoice';button.disabled=game.coins<choice.price;button.innerHTML=`<b>${choice.name}</b><span>${choice.description}</span><small>${choice.price} 드라크마</small>`;button.onclick=()=>{
      const state={drachma:game.coins,purchases:game.shopPurchases||{},stats:{maxHp:game.player.maxHp,damage:game.player.damage,speed:game.player.speed}},result=transactPurchase(state,choice,`${token}:${choice.id}`);if(!result.ok){balance.textContent=Math.floor(game.coins);return}
      const hpGain=result.state.stats.maxHp-game.player.maxHp;game.coins=result.state.drachma;game.shopPurchases=result.state.purchases;game.player.maxHp=result.state.stats.maxHp;game.player.hp=Math.min(game.player.maxHp,game.player.hp+hpGain);game.player.damage=result.state.stats.damage;game.player.speed=result.state.stats.speed;banner('보급 구매 완료',`${choice.name} · ${choice.price} 드라크마`);closeSupplyShop();updateHud();
    };choices.appendChild(button)}
    $('#supplyOverlay').classList.remove('hidden');
  }
  $('#supplyCancelBtn').onclick=closeSupplyShop;

  function spawnEncounter() {
    if (game.arena || game.encounters.filter(e=>!e.persistent).length >= 1) return; const keys = Object.keys(ENCOUNTER_INFO), type = keys[Math.floor(gameRandom() * keys.length)], a = gameRandom() * TAU, d = rand(1760, 1080), info = ENCOUNTER_INFO[type];
    game.encounters.push({ type, x: game.player.x + Math.cos(a) * d, y: game.player.y + Math.sin(a) * d, r: type === 'well' ? 34 : 27, life: 105, used: false, pulse: visualRand(TAU) });
    audio.tone(360,.12,'triangle',.06);
  }

  function activateEncounter(e) {
    if (e.used) return; e.used = true; e.life = 7;if(e.persistent){const sector=game.worldSectors.get(e.sector);if(sector)sector.siteConsumed=true}const p = game.player, info = ENCOUNTER_INFO[e.type]; p.invuln = Math.max(p.invuln, 1.15);
    if (e.type === 'well') { const heal = Math.ceil(p.maxHp * .45); p.hp = Math.min(p.maxHp, p.hp + heal); textPop(p.x, p.y - 34, `+${heal}`, '#8bd49c', true); addAttack({ kind: 'wellRipple', x: e.x, y: e.y, r: 76, color: '#7eb6ad', life: .75 }); }
    else if (e.type === 'thunder') {
      const targets = [...game.enemies].filter(t => !t.dead).sort((a, b) => ((a.type === 'archer' || a.type === 'slinger') ? -1 : 1) - ((b.type === 'archer' || b.type === 'slinger') ? -1 : 1)).slice(0, 22);
      for (const t of targets) { addAttack({ kind: 'lightning', x: p.x, y: p.y, x2: t.x, y2: t.y, color: '#f3d765', life: .32 }); damageEnemy(t, 115, { source: 'encounterThunder', origin: p, unblockable: true }); } game.flash = .32; game.shake = 9;
    } else if (e.type === 'ally') { game.buffs.myrmidon=Math.max(game.buffs.myrmidon,42);game.supportCd=0; }
    else if (e.type === 'shrine') { game.buffs.fury = Math.max(game.buffs.fury, 28); toast('아레스의 격려', '28초 동안 모든 피해가 35% 증가합니다'); }
    else if (e.type === 'beacon') { game.buffs.beacon = Math.max(game.buffs.beacon, 32); game.beaconCd = 0; toast('아카이아 지원 사격', '32초 동안 주기적으로 아군 창 세례가 쏟아집니다'); }
    else if (e.type === 'supply') { p.hp = Math.min(p.maxHp, p.hp + 24); game.coins += 35; game.rich.wallet={...game.rich.wallet,drachma:game.coins};for (const q of game.pickups) if (q.kind === 'xp') q.magnet = true;openWarShop(`encounter-${e.sector||Math.floor(game.missionTime*10)}`); }
    banner(info.name, e.type === 'ally' ? '42초 동안 화면 밖에서 창을 지원합니다' : '희귀 인카운터를 사용했습니다'); particle(e.x, e.y, info.color, 16, 145, 'spark');
  }

  function updateEncounters(dt) {
    game.encounterCd -= dt; if (game.encounterCd <= 0) { if (gameRandom() < .72) spawnEncounter(); game.encounterCd = rand(120, 78); }
    for (const e of game.encounters) { if(!e.persistent||e.used)e.life -= dt; e.pulse += dt; if (!e.used && dist2(e, game.player) < (e.r + game.player.r + 12) ** 2) activateEncounter(e); }
    game.encounters = game.encounters.filter(e => e.life > 0);
  }

  function updateAllies(dt) {
    const p = game.player;game.allies.length=0;
    if(game.buffs.myrmidon>0){game.buffs.myrmidon=Math.max(0,game.buffs.myrmidon-dt);game.supportCd-=dt;const target=nearestEnemy(p.x,p.y,620);if(target&&game.supportCd<=0){game.supportCd=.82;const a=Math.atan2(target.y-p.y,target.x-p.x),sx=p.x-Math.cos(a)*330,sy=p.y-Math.sin(a)*330;fireProjectile(sx,sy,a,720,27,{life:1.15,type:'myrmidonSupport',color:'#93b9dc',pierce:1,trail:false})}}
    if (game.buffs.beacon > 0) { game.beaconCd -= dt; if (game.beaconCd <= 0) { game.beaconCd = 3.4; const a0 = gameRandom() * TAU; for (let i = 0; i < 6; i++) fireProjectile(p.x - Math.cos(a0 + i * TAU / 6) * 230, p.y - Math.sin(a0 + i * TAU / 6) * 230, a0 + i * TAU / 6, 760, 42, { life: .72, type: 'allyVolley', color: '#e5c16f', pierce: 2, trail: false }); } }
  }

  const EFFECT_LISTS = Object.freeze(['particles', 'texts', 'attacks']);
  // Drops expired entries in place and trims to the newest `cap`, so no array is reallocated per frame.
  function compactLive(list, cap) { let write = 0; for (let i = 0; i < list.length; i++) { const q = list[i]; if (q.life > 0) list[write++] = q; } list.length = write; if (write > cap) list.splice(0, write - cap); return list; }
  function updateEffects(dt) {
    const decay = Math.pow(.08, dt);
    for (const a of EFFECT_LISTS) for (const q of game[a]) {
      q.life -= dt; if (q.vx !== undefined) { q.x += q.vx * dt; q.y += q.vy * dt; q.vx *= decay; q.vy *= decay; }
    }
    const particleCap = renderQuality === 'high' ? 360 : renderQuality === 'medium' ? 230 : 140;
    const attackCap = renderQuality === 'high' ? 110 : renderQuality === 'medium' ? 82 : 58;
    compactLive(game.particles, particleCap); compactLive(game.texts, 64); compactLive(game.attacks, attackCap);
    for (const z of game.zones) {
      z.life -= dt; z.tick -= dt; if (z.tick <= 0) {
        z.tick = .28;
        if (z.hostile) { if (dist2(z, game.player) < (z.r + game.player.r) ** 2) { damagePlayer(z.damage, z); if (z.slow) game.player.slow = Math.max(game.player.slow, z.slow); } }
        else for (const e of nearbyEnemies(z.x, z.y, z.r + 35)) if (dist2(e, z) < (e.r + z.r) ** 2) { damageEnemy(e, z.damage, { source: 'burn', origin: z, unblockable: true, noGod: true }); if (z.slow) e.slow = Math.max(e.slow, z.slow); }
      }
    }
    game.zones = game.zones.filter(z => z.life > 0);
    for (const h of game.hazards) { h.delay -= dt; if (h.delay <= 0 && !h.fired) { h.fired = true; particle(h.x, h.y, '#d75d48', 18, 220, 'spark'); const overlap=dist2(h,game.player)<(h.r+game.player.r)**2;if(overlap)damagePlayer(h.damage,h);else if(h._richIntent){const evade=resolveSpatialEvade({intent:h._richIntent,defense:game.rich.defense,dodgeStart:game.rich.dodgeTelemetry,hazard:h,player:game.player,playerRadius:game.player.r,tick:game.rich.fixedTick}),bearing=Math.atan2(h.y-game.player.y,h.x-game.player.x),closest=Math.max(0,Math.hypot(h.x-game.player.x,h.y-game.player.y)-h.r-game.player.r);if(evade.outcome==='dodged'&&game.rich.scheduler.consume(h._richIntent.impactId,game.rich.fixedTick)){game.rich.consumedImpacts.add(h._richIntent.impactId);recordCombatJournal({type:'impact',tick:game.rich.fixedTick,impactId:h._richIntent.impactId,outcome:'dodged',playerDamage:0,evadeKind:'displacement',defensePhase:game.rich.ports.defense.snapshot(game.rich.defense).phase,sourceBearing:bearing,playerAim:game.player.aim,closestApproach:closest})}else{game.rich.scheduler.cancel(h._richIntent.telegraphId);recordCombatJournal({type:'miss',tick:game.rich.fixedTick,impactId:h._richIntent.impactId,outcome:'miss',playerDamage:0,evadeKind:null,defensePhase:game.rich.ports.defense.snapshot(game.rich.defense).phase,sourceBearing:bearing,playerAim:game.player.aim,closestApproach:closest})}} } h.life -= dt; }
    game.hazards = game.hazards.filter(h => h.life > 0);
  }

  function updateRelics(dt) {
    if (game.relics.trojanBow) {
      game.relicTimers.bow -= dt; if (game.relicTimers.bow <= 0) { game.relicTimers.bow = Math.max(1.25,3-game.relics.trojanBow*.28); const t = nearestEnemy(game.player.x, game.player.y, 900, true); if (t) { const a = Math.atan2(t.y - game.player.y, t.x - game.player.x); for (const o of [-.12, 0, .12]) fireProjectile(game.player.x, game.player.y, a + o, 720, 20+game.relics.trojanBow*4, { life: 1.25, type: 'relicArrow', color: '#b991ef' }); } }
    }
    if (game.relics.aegis) {
      game.relicTimers.aegis -= dt; if (game.relicTimers.aegis <= 0) { let q = null, bd = (190+game.relics.aegis*20) ** 2; for (const p of game.projectiles) if (!p.friendly) { const d = dist2(p, game.player); if (d < bd) { bd = d; q = p; } } if (q) { q.life = 0; game.relicTimers.aegis = Math.max(2.8,8-game.relics.aegis*.7); addAttack({ kind: 'ring', x: q.x, y: q.y, r: 28, color: '#9bdbe6', life: .3 }); } }
    }
  }

  function triggerEvents(dt) {
    const t = game.time, fire = (at, fn) => { if (t >= at && !game.eventFlags.has(at)) { game.eventFlags.add(at); fn(); } };
    const bossAt=(at,type,kind='walls')=>fire(at,()=>{if(game.boss){game.eventFlags.delete(at);return}const b=spawnEnemy(type,false,0,100);startArena(kind,b)});
    fire(38,()=>spawnElite('standard'));bossAt(65,'paris');fire(100,()=>spawnElite('giant'));fire(105,()=>{game.arrowRain=12;banner('파리스의 유산','붉은 표식 사이의 틈을 찾으십시오')});bossAt(135,'sarpedon');fire(170,()=>spawnElite('amazonrider'));bossAt(205,'chariot','soldiers');fire(240,()=>spawnElite('horncaller'));bossAt(275,'aeneas');fire(310,()=>spawnElite('assassin'));bossAt(345,'penthesilea');fire(380,()=>spawnElite('engineer'));bossAt(415,'memnon');bossAt(485,'hector');
    if (game.arrowRain > 0) { game.arrowRain -= dt; game.arrowTick -= dt; if (game.arrowTick <= 0) { game.arrowTick = .5; const p = game.player, a = gameRandom() * TAU, d = rand(250, 18); game.hazards.push({ x: p.x + Math.cos(a) * d, y: p.y + Math.sin(a) * d, r: 34, delay: .7, life: 1.05, damage: 19, fired: false }); } }
    game.surge = Math.max(0, game.surge - dt);
  }

  function update(dt) {
    if (!game || mode !== 'play') return;
    game.rich.fixedTick++;
    game.camera.prevX=game.camera.x;game.camera.prevY=game.camera.y;
    const clocks=advanceRunClocks(game,{mode,bossAlive:!!game.boss&&!game.boss.dead,dt});game.missionTime=clocks.missionTime;game.combatTime=clocks.combatTime;game.bossCombatTime=clocks.bossCombatTime;game.time=game.missionTime;
    if(game.endlessGrace>0){game.endlessGrace=Math.max(0,game.endlessGrace-dt);return}
    if (game.hitStop > 0) { game.hitStop -= dt; updateEffects(dt * .3); return; }
    game.bossIntro=Math.max(0,(game.bossIntro||0)-dt); game.flash = Math.max(0, game.flash - dt); game.shake *= Math.pow(.025, dt); game.streakClock -= dt;audio.tick();const audioLevel=game.boss?(game.player.hp/game.player.maxHp<.3?'critical':'boss'):'engaged';if(game.rich.audioLevel!==audioLevel){game.rich.audioLevel=audioLevel;richAudio.setIntensity(audioLevel,game.rich.fixedTick)}updateStage();if(game.time>=480)unlockAchievement('survivor');
    if (game.streakClock <= 0) game.streak = lerp(game.streak, 1, 1 - Math.pow(.04, dt));
    game.aresTime = Math.max(0, game.aresTime - dt); game.athenaReady = Math.max(0, game.athenaReady - dt); game.apolloCd = Math.max(0, game.apolloCd - dt); game.buffs.fury = Math.max(0, game.buffs.fury - dt); game.buffs.beacon = Math.max(0, game.buffs.beacon - dt);game.buffs.warDrum=Math.max(0,game.buffs.warDrum-dt);game.relicTimers.sea=Math.max(0,(game.relicTimers.sea||0)-dt);
    for(const o of game.obstacles){o.flash=Math.max(0,(o.flash||0)-dt);o.popCd=Math.max(0,(o.popCd||0)-dt)}
    updatePlayer(dt);syncWorldSectors();useWeapons(dt);updateRelics(dt);updateProjectiles(dt);updateEnemies(dt);rebuildEnemyGrid();updateAllies(dt);updatePickups(dt);updateEncounters(dt);updateEffects(dt);triggerEvents(dt);updateWaveDirector(dt);updateRichCampaign(dt);
    game.encircleCd -= dt; if (game.encircleCd <= 0 && !game.arena) { game.encircleCd = Math.max(8, 21 - game.time / 38); spawnEncirclement(); }
    if(!game.boss){const rate=survivalSpawnRate()*(game.waveBurst>0?1.45:1)*game.diff.spawn*lateThreatProfile(game.time).spawnRate;game.spawnAcc=Math.min(4,game.spawnAcc+dt*rate);while(game.spawnAcc>=1&&game.enemies.length<enemyLimit()){game.spawnAcc--;spawnRegular()}}else game.spawnAcc=0;
    game.hudAcc += dt; if (game.hudAcc >= .1) { game.hudAcc = 0; updateHud(); }
  }

  let renderCamera=null;
  function w2s(x, y) { const camera=renderCamera||game.camera;return { x: x - camera.x + W / 2, y: y - camera.y + H / 2 }; }
  function onScreen(p, pad = 70) { return p.x >= -pad && p.x <= W + pad && p.y >= -pad && p.y <= H + pad; }

  const GLOW_BUDGET = { high: 120, medium: 64, low: 0 };
  let glowLeft = 0;
  // Per-frame glow budget: ctx.shadowBlur is the most expensive 2D op in the hot loops,
  // so only the first N entities of a frame get a real glow and the rest degrade silently.
  function glow(color, blur) { if (glowLeft <= 0) { ctx.shadowBlur = 0; return false; } glowLeft--; ctx.shadowColor = color; ctx.shadowBlur = blur; return true; }

  const xpGemCache = new Map();
  function xpGemSprite(grade) {
    const key = `${grade}|${DPR.toFixed(2)}`; const cached = xpGemCache.get(key); if (cached) return cached;
    const style = xpPickupStyle(grade), r = style.r, blur = grade >= 3 ? 25 : 17, size = Math.ceil((r + blur + 4) * 2), scale = Math.max(1, DPR);
    const sheet = document.createElement('canvas'); sheet.width = sheet.height = Math.ceil(size * scale);
    const g = sheet.getContext('2d'); g.scale(scale, scale); g.translate(size / 2, size / 2); g.rotate(Math.PI / 4);
    g.shadowColor = style.glow; g.shadowBlur = blur;
    const metal = g.createRadialGradient(-r * .35, -r * .35, 1, 0, 0, r); metal.addColorStop(0, style.inner); metal.addColorStop(.48, style.mid); metal.addColorStop(1, style.outer);
    g.fillStyle = metal; g.strokeStyle = style.inner; g.lineWidth = 2; g.beginPath(); g.rect(-r * .68, -r * .68, r * 1.36, r * 1.36); g.fill(); g.stroke(); g.shadowBlur = 0;
    g.rotate(-Math.PI / 4); g.strokeStyle = style.inner; g.globalAlpha = .88; g.lineWidth = 1.5; g.beginPath(); g.moveTo(-r * .5, 0); g.lineTo(r * .5, 0); g.moveTo(0, -r * .5); g.lineTo(0, r * .5); g.stroke();
    const sprite = { sheet, size, half: size / 2 }; xpGemCache.set(key, sprite); return sprite;
  }

  function drawGround() {
    if (groundReady) {
      const tile = 690, ox = -(((game?.camera.x || 0) % tile) + tile) % tile, oy = -(((game?.camera.y || 0) % tile) + tile) % tile;
      for (let x = ox - tile; x < W + tile; x += tile) for (let y = oy - tile; y < H + tile; y += tile) ctx.drawImage(groundImage, x, y, tile + 1, tile + 1);
    } else { ctx.fillStyle = '#4a3827'; ctx.fillRect(0, 0, W, H); }
    const phase = clamp((game?.time || 0) / 300, 0, 1), nextBand = Math.floor(phase * 20);
    if (nextBand !== tintBand) { tintBand = nextBand; rebuildScreenPaint(nextBand / 20); }
    ctx.fillStyle = groundTint; ctx.fillRect(0, 0, W, H);
  }

  function drawDecor() {
    const size = 420, cx = Math.floor(game.camera.x / size), cy = Math.floor(game.camera.y / size);
    const cellRadiusX = Math.min(6, Math.ceil(W / size / 2) + 1), cellRadiusY = Math.min(5, Math.ceil(H / size / 2) + 1);
    for (let gx = cx - cellRadiusX; gx <= cx + cellRadiusX; gx++) for (let gy = cy - cellRadiusY; gy <= cy + cellRadiusY; gy++) {
      const n = renderQuality === 'low' ? 2 + Math.floor(hash(gx, gy) * 2) : 3 + Math.floor(hash(gx, gy) * 4);
      for (let i = 0; i < n; i++) {
        const x = gx * size + hash(gx, gy, i * 4) * size, y = gy * size + hash(gx, gy, i * 4 + 1) * size, p = w2s(x, y), k = Math.floor(hash(gx, gy, i * 4 + 2) * 6), r = hash(gx, gy, i * 4 + 3) * TAU;
        if (p.x < -70 || p.x > W + 70 || p.y < -70 || p.y > H + 70) continue; ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(r); ctx.globalAlpha = .55;
        if (k === 0) { ctx.fillStyle = '#5d5141'; ctx.strokeStyle = '#97816a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(0, 0, 17, 8, 0, 0, TAU); ctx.fill(); ctx.stroke(); ctx.beginPath(); ctx.moveTo(-8, -2); ctx.lineTo(7, 3); ctx.stroke(); }
        else if (k === 1) { ctx.fillStyle = '#9a6b3f'; ctx.strokeStyle = '#c39355'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, 12, 0, TAU); ctx.fill(); ctx.stroke(); ctx.beginPath(); ctx.moveTo(-8, -8); ctx.lineTo(8, 8); ctx.stroke(); }
        else if (k === 2) { ctx.fillStyle = '#b2a487'; ctx.fillRect(-20, -7, 40, 14); ctx.strokeStyle = '#61594b'; ctx.strokeRect(-20, -7, 40, 14); for (let q = -14; q < 18; q += 8) { ctx.beginPath(); ctx.arc(q, 0, 2, 0, TAU); ctx.stroke(); } }
        else if (k === 3) { ctx.strokeStyle = '#8e7248'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-24, 0); ctx.lineTo(24, 0); ctx.stroke(); ctx.fillStyle = '#b99858'; ctx.beginPath(); ctx.moveTo(29, 0); ctx.lineTo(19, -5); ctx.lineTo(19, 5); ctx.closePath(); ctx.fill(); }
        else if (k === 4) { ctx.fillStyle = '#6e3329'; ctx.beginPath(); ctx.moveTo(-10, 7); ctx.lineTo(-5, -10); ctx.lineTo(6, -8); ctx.lineTo(11, 8); ctx.closePath(); ctx.fill(); ctx.strokeStyle = '#be8056'; ctx.stroke(); }
        else { ctx.strokeStyle = '#79654a'; ctx.lineWidth = 2; for (let q = 0; q < 5; q++) { ctx.beginPath(); ctx.moveTo(0, 4); ctx.quadraticCurveTo((q - 2) * 4, -5, (q - 2) * 7, -15); ctx.stroke(); } }
        ctx.restore();
      }
    }
  }
  function recordRenderDraw(kind,type,cssWidth,cssHeight,expectedWidth,expectedHeight){if(!TEST_MODE||!game)return;game.renderAudit.push({kind,type,cssWidth:Number(cssWidth.toFixed(3)),cssHeight:Number(cssHeight.toFixed(3)),expectedWidth:Number(expectedWidth.toFixed(3)),expectedHeight:Number(expectedHeight.toFixed(3))})}
  function drawObstacles(){for(const o of game.obstacles){if(o.dead)continue;
    const p=w2s(o.x,o.y);if(!onScreen(p,125))continue;ctx.save();ctx.translate(p.x,p.y);
    ctx.fillStyle=o.solid?'rgba(3,7,9,.52)':'rgba(76,28,13,.28)';ctx.beginPath();ctx.ellipse(0,o.r*.58,o.r*1.08,o.r*.48,0,0,TAU);ctx.fill();
    if(o.solid){ctx.strokeStyle='rgba(238,198,119,.28)';ctx.lineWidth=2;ctx.setLineDash([6,5]);ctx.beginPath();ctx.ellipse(0,o.r*.16,o.r*.87,o.r*.62,0,0,TAU);ctx.stroke();ctx.setLineDash([])}
    if(obstacleAtlas.complete&&obstacleAtlas.naturalWidth){const fallback={column:0,barrier:1,rock:2,fire:3}[o.type]??2,cell=manifestCell(assetManifests.obstacles,o.type,fallback),fw=obstacleAtlas.naturalWidth/(cell.cols||4),fh=obstacleAtlas.naturalHeight/(cell.rows||1),scale=cell.entry?.scale??(o.type==='barrier'?3.65:o.type==='fire'?2.75:3.15),dw=o.r*scale,dh=dw*fh/fw;ctx.globalAlpha=o.flash>0?.64:1;ctx.drawImage(obstacleAtlas,cell.col*fw,cell.row*fh,fw,fh,-dw/2,-dh*.72,dw,dh);recordRenderDraw('obstacle',o.type,dw,dh,o.r*scale,o.r*scale*fh/fw);ctx.globalAlpha=1}
    else{ctx.fillStyle=o.type==='fire'?'#d66b32':'#7c6c55';ctx.beginPath();ctx.arc(0,0,o.r,0,TAU);ctx.fill()}
    if(o.solid&&o.hp<o.maxHp){const ratio=clamp(o.hp/o.maxHp,0,1),w=o.r*1.75;ctx.fillStyle='rgba(4,8,11,.82)';ctx.fillRect(-w/2,o.r*.94,w,6);ctx.fillStyle=ratio<.35?'#e9684f':'#d9b45f';ctx.fillRect(-w/2+1,o.r*.94+1,(w-2)*ratio,4);ctx.strokeStyle='rgba(255,231,175,.65)';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(-o.r*.28,-o.r*.15);ctx.lineTo(-o.r*.06,o.r*.18);ctx.lineTo(o.r*.17,o.r*.02);ctx.stroke()}
    ctx.restore();
  }}

  function drawArena() {
    if (!game.arena) return; const a = game.arena, p = w2s(a.x, a.y); ctx.save();
    ctx.fillStyle = 'rgba(20,12,10,.18)'; ctx.beginPath(); ctx.arc(p.x, p.y, a.r, 0, TAU); ctx.fill();
    ctx.strokeStyle = a.kind === 'walls' ? '#9c8566' : '#c1533e'; ctx.lineWidth = a.kind === 'walls' ? 17 : 7; ctx.shadowColor = '#120c09'; ctx.shadowBlur = 15; ctx.beginPath(); ctx.arc(p.x, p.y, a.r, 0, TAU); ctx.stroke(); ctx.shadowBlur = 0;
    const count = a.kind === 'walls' ? 34 : 28;
    for (let i = 0; i < count; i++) {
      const ang = i * TAU / count, x = p.x + Math.cos(ang) * a.r, y = p.y + Math.sin(ang) * a.r; ctx.save(); ctx.translate(x, y); ctx.rotate(ang + Math.PI / 2);
      if (a.kind === 'walls') { ctx.fillStyle = i % 2 ? '#7d6c58' : '#91806a'; ctx.fillRect(-12, -10, 24, 20); ctx.fillStyle = '#b09b7c'; ctx.fillRect(-10, -13, 7, 6); ctx.fillRect(3, -13, 7, 6); ctx.strokeStyle = '#51473d'; ctx.strokeRect(-12, -10, 24, 20); }
      else { ctx.fillStyle = '#7f3029'; ctx.beginPath(); ctx.arc(0, 0, 9, 0, TAU); ctx.fill(); ctx.strokeStyle = '#e0af63'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-15, -2); ctx.lineTo(15, -2); ctx.stroke(); ctx.fillStyle = '#bd9154'; ctx.beginPath(); ctx.moveTo(19, -2); ctx.lineTo(11, -6); ctx.lineTo(11, 2); ctx.closePath(); ctx.fill(); }
      ctx.restore();
    }
    ctx.restore();
  }

  function drawHazardsAndZones() {
    for (const z of game.zones) { const p = w2s(z.x, z.y), a = z.life / z.max; ctx.globalAlpha = .22 * a; ctx.fillStyle = z.color; ctx.beginPath(); ctx.arc(p.x, p.y, z.r, 0, TAU); ctx.fill(); ctx.globalAlpha = .7 * a; ctx.strokeStyle = '#f2a059'; ctx.stroke(); }
    ctx.globalAlpha = 1;
    for (const h of game.hazards) { const p = w2s(h.x, h.y), pulse = .5 + .5 * Math.sin(performance.now() * .024); ctx.fillStyle = h.fired ? 'rgba(210,74,52,.25)' : `rgba(220,70,50,${.07 + pulse * .08})`; ctx.strokeStyle = '#e9654e'; ctx.lineWidth = 2; ctx.setLineDash(h.fired ? [] : [5, 6]); ctx.beginPath(); ctx.arc(p.x, p.y, h.r * (h.fired ? 1 : clamp(1 - h.delay / .7, .2, 1)), 0, TAU); ctx.fill(); ctx.stroke(); ctx.setLineDash([]); }
  }

  const XP_PICKUP_STYLES = Object.freeze({
    1: Object.freeze({ r: 8, inner: '#d9fff6', mid: '#42c9bd', outer: '#176e70', glow: '#5ce9dc' }),
    2: Object.freeze({ r: 10, inner: '#fff0a0', mid: '#d9a83e', outer: '#74501d', glow: '#f5ca59' }),
    3: Object.freeze({ r: 13, inner: '#fff2a5', mid: '#efbd4f', outer: '#8f561c', glow: '#ffd66b' }),
  });
  const xpPickupStyle = grade => XP_PICKUP_STYLES[grade >= 3 ? 3 : grade === 2 ? 2 : 1];
  function absorptionTrail(q,screen,style){if(renderQuality==='low')return;const p=game.player;if(!q.magnet&&dist2(q,p)>(p.magnet*1.6)**2)return;const target=w2s(p.x,p.y);ctx.save();ctx.globalAlpha=.24+Math.sin(performance.now()*.012+q.x)*.07;ctx.strokeStyle=style.glow;ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(screen.x,screen.y);ctx.quadraticCurveTo((screen.x+target.x)/2+Math.sin(q.y)*12,(screen.y+target.y)/2,target.x,target.y);ctx.stroke();ctx.restore()}
  function drawPickups() {
    for (const q of game.pickups) { const p = w2s(q.x, q.y); if (!onScreen(p, 40)) continue;const grade=q.grade||1,style=xpPickupStyle(grade);if(q.kind==='xp')absorptionTrail(q,p,style); const bob = Math.sin(performance.now() * .006 + q.x) * 3; ctx.save(); ctx.translate(p.x, p.y + bob);
      if (q.kind === 'xp') {
        const now=performance.now(),pulse=1+Math.sin(now*.009+q.y)*.08;ctx.scale(pulse,pulse);ctx.rotate(Math.sin(now*.004+q.y)*.12);
        const gem=xpGemSprite(grade);ctx.drawImage(gem.sheet,-gem.half,-gem.half,gem.size,gem.size);
      }
      else if (q.kind === 'heal') { ctx.fillStyle = '#77cf7e'; glow('#8cef93', 15); ctx.fillRect(-3, -11, 6, 22); ctx.fillRect(-11, -3, 22, 6); }
      else if (q.kind === 'magnet') { ctx.strokeStyle = '#f0d773'; ctx.lineWidth = 5; glow('#ffe98a', 18); ctx.beginPath(); ctx.arc(0, 0, 10, .1, Math.PI - .1); ctx.stroke(); }
      else if (q.kind === 'chest') { ctx.fillStyle = '#4c2a68'; ctx.strokeStyle = '#c9a3f2'; ctx.lineWidth = 2; ctx.fillRect(-14, -9, 28, 19); ctx.strokeRect(-14, -9, 28, 19); ctx.fillStyle = '#d6b36c'; ctx.fillRect(-2, -9, 4, 19); ctx.beginPath(); ctx.moveTo(-14, -9); ctx.quadraticCurveTo(0, -20, 14, -9); ctx.stroke(); }
      ctx.restore();
    }
  }

  function drawEncounters() {
    let offscreenGuides=0;const ordered=[...game.encounters].sort((a,b)=>dist2(a,game.player)-dist2(b,game.player));
    for (const e of ordered) {
      const p = w2s(e.x, e.y), info = ENCOUNTER_INFO[e.type], visible = p.x > 30 && p.x < W - 30 && p.y > 40 && p.y < H - 35;
      if (!visible && !e.used) {
        if(offscreenGuides++>=2)continue;
        const a = Math.atan2(p.y - H / 2, p.x - W / 2), x = clamp(W / 2 + Math.cos(a) * Math.min(W, H) * .41, 34, W - 34), y = clamp(H / 2 + Math.sin(a) * Math.min(W, H) * .41, 50, H - 42);
        ctx.save(); ctx.translate(x, y); ctx.rotate(a); ctx.fillStyle = info.color; ctx.shadowColor = info.color; ctx.shadowBlur = 10; ctx.beginPath(); ctx.moveTo(14, 0); ctx.lineTo(-8, -9); ctx.lineTo(-3, 0); ctx.lineTo(-8, 9); ctx.closePath(); ctx.fill(); ctx.restore();ctx.save();ctx.font='800 10px Inter,sans-serif';ctx.textAlign='center';ctx.fillStyle='#fff0c4';ctx.shadowColor='#000';ctx.shadowBlur=4;ctx.fillText(`${info.name} · ${Math.round(Math.hypot(e.x-game.player.x,e.y-game.player.y))}m`,x,y+24);ctx.restore(); continue;
      }
      if (!visible) continue; ctx.save(); ctx.translate(p.x, p.y); ctx.globalAlpha = e.used ? clamp(e.life / 7, 0, .65) : 1; const pulse = 1 + Math.sin(e.pulse * 3) * .04; ctx.scale(pulse, pulse);
      ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.beginPath(); ctx.ellipse(0, 18, 30, 10, 0, 0, TAU); ctx.fill(); ctx.shadowColor = info.color; ctx.shadowBlur = e.used ? 0 : 13;
      if (e.type === 'well') { ctx.fillStyle = '#776a57'; ctx.strokeStyle = '#b6a483'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(0, 4, 28, 0, TAU); ctx.fill(); ctx.stroke(); ctx.fillStyle = e.used ? '#2e3635' : '#4f8e91'; ctx.beginPath(); ctx.ellipse(0, 4, 20, 11, 0, 0, TAU); ctx.fill(); ctx.strokeStyle = '#a99a7b'; for (let i = 0; i < 8; i++) { const a = i * TAU / 8; ctx.strokeRect(Math.cos(a) * 22 - 5, Math.sin(a) * 15 - 4, 10, 8); } }
      else if (e.type === 'thunder') { ctx.fillStyle = '#9f4f32'; ctx.strokeStyle = '#e0aa62'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-13, -18); ctx.quadraticCurveTo(-20, 5, -11, 23); ctx.quadraticCurveTo(0, 30, 11, 23); ctx.quadraticCurveTo(20, 5, 13, -18); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.strokeStyle = '#f4d65d'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(4, -12); ctx.lineTo(-4, 2); ctx.lineTo(4, 1); ctx.lineTo(-4, 17); ctx.stroke(); }
      else if (e.type === 'ally' && walkImages.hoplite?.complete) { ctx.drawImage(walkImages.hoplite, 0, 0, 256, 256, -36, -40, 72, 72); }
      else if (e.type === 'shrine') { ctx.fillStyle = '#8d795f'; ctx.fillRect(-23, 15, 46, 9); ctx.fillRect(-18, -7, 8, 24); ctx.fillRect(10, -7, 8, 24); ctx.fillStyle = '#b64b39'; ctx.beginPath(); ctx.moveTo(-8, -7); ctx.quadraticCurveTo(0, -34, 8, -7); ctx.quadraticCurveTo(0, 3, -8, -7); ctx.fill(); }
      else if (e.type === 'beacon') { ctx.strokeStyle = '#b6935c'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(0, 24); ctx.lineTo(0, -20); ctx.stroke(); ctx.fillStyle = '#d9994b'; ctx.beginPath(); ctx.moveTo(-12, -18); ctx.quadraticCurveTo(0, -42, 12, -18); ctx.quadraticCurveTo(0, -5, -12, -18); ctx.fill(); }
      else { ctx.fillStyle = '#70513a'; ctx.fillRect(-24, -10, 48, 25); ctx.strokeStyle = '#c39a5a'; ctx.lineWidth = 3; ctx.strokeRect(-24, -10, 48, 25); for (const x of [-18, 18]) { ctx.beginPath(); ctx.arc(x, 18, 8, 0, TAU); ctx.stroke(); } }
      ctx.shadowBlur = 0; ctx.fillStyle = '#f2dfae'; ctx.font = '700 11px Inter,sans-serif'; ctx.textAlign = 'center'; ctx.fillText(info.name, 0, 47); ctx.restore();
    }
  }

  function drawAllies() {
    const sprite = walkImages.hoplite; if (!sprite?.complete || !sprite.naturalWidth) return;
    for (const a of game.allies) { const p = w2s(a.x, a.y), frame = Math.floor(a.walkPhase) % 4; if (p.x < -60 || p.x > W + 60 || p.y < -60 || p.y > H + 60) continue; ctx.save(); ctx.translate(p.x, p.y); ctx.fillStyle = 'rgba(52,104,158,.2)'; ctx.strokeStyle = '#82b8de'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, 25, 0, TAU); ctx.fill(); ctx.stroke(); ctx.save(); ctx.scale(Math.cos(a.facing) < 0 ? -1 : 1, 1); ctx.drawImage(sprite, frame * 256, 0, 256, 256, -38, -38, 76, 76); ctx.restore(); ctx.restore(); }
  }

  function drawWeaponArt(kind,x,y,w,h){
    const img=weaponImages[kind]||weaponImages.spear;if(!img?.complete||!img.naturalWidth)return false;ctx.drawImage(img,x,y,w,h);return true
  }
  function drawPlayerWeapon(p) {
    const kind = p.motion?.kind || 'spear';
    const progress = p.motion ? clamp(1 - p.motion.time / p.motion.max, 0, 1) : 0;
    ctx.save(); ctx.rotate(p.aim);
    if (kind === 'sword') {
      const swing = lerp(-1.18, 1.04, 1 - Math.pow(1 - progress, 2)); ctx.rotate(swing);
      ctx.shadowColor = '#d8c59a'; ctx.shadowBlur = 7; drawWeaponArt(kind,2,-22,66,44);
    } else if (kind === 'javelin') {
      const cast = Math.sin(progress * Math.PI) * 25; ctx.rotate(-.16 + progress * .16); ctx.shadowColor = '#d6bf82'; ctx.shadowBlur = 6; drawWeaponArt(kind,5+cast,-25,78,50);
    } else if (kind === 'shield') {
      const bash = Math.sin(progress * Math.PI) * 31; ctx.shadowColor = '#d9bd72'; ctx.shadowBlur = 10; drawWeaponArt(kind,4+bash,-25,50,50);
    } else if(kind==='bow'){
      ctx.rotate(-.12+progress*.18);ctx.shadowColor='#e6b96a';ctx.shadowBlur=7;drawWeaponArt(kind,8,-31,64,64);
    } else if(kind==='flail'){
      ctx.rotate(progress*TAU*1.6);ctx.shadowColor='#d77a58';ctx.shadowBlur=9;drawWeaponArt(kind,5,-28,72,56);
    } else if(kind==='thunder'){
      ctx.rotate(-.38);ctx.shadowColor='#78cfff';ctx.shadowBlur=14;drawWeaponArt(kind,4,-34,72,68);
    } else if(kind==='caltrops'){
      const toss=Math.sin(progress*Math.PI)*24;ctx.shadowColor='#aeb99b';ctx.shadowBlur=5;drawWeaponArt(kind,12+toss,-22,56,44);
    } else if(kind==='ram'){
      const drive=Math.sin(progress*Math.PI)*42;ctx.shadowColor='#d5a15b';ctx.shadowBlur=8;drawWeaponArt(kind,-2+drive,-27,92,54);
    } else {
      const thrust = p.motion ? Math.sin(progress * Math.PI) * 40 : 0; ctx.shadowColor = '#f0c76f'; ctx.shadowBlur = p.motion ? 8 : 2; drawWeaponArt(kind,-5+thrust,-25,84,50);
    }
    ctx.restore();
  }

  function drawDefenseHero(p,s){
    const richDefense=game.rich.ports.defense.snapshot(game.rich.defense),defense={mode:richDefense.mode,phase:richDefense.phase,elapsedMs:richDefense.phaseElapsedMs,tuning:p.defense.tuning};if(defense.mode==='neutral'||!defenseAtlas.complete||!defenseAtlas.naturalWidth)return false;
    const manifest=assetManifests.defense,heroKey={hoplite:'telamon',swordsman:'achileon',archer:'calchas'}[game.hero],hero=manifest?.heroes?.[game.hero]||manifest?.heroes?.[heroKey],clip=hero?.clips?.[defense.mode]||hero?.[defense.mode];
    if(!clip)return false;
    const phaseFrames=clip.phases?.[defense.phase]?.frames||clip.phases?.[defense.phase]||clip.frames;if(!Array.isArray(phaseFrames)||!phaseFrames.length)return false;
    const duration=defense.tuning[defense.mode]?.[`${defense.phase}Ms`]||1,index=Math.min(phaseFrames.length-1,Math.floor(clamp(defense.elapsedMs/duration,0,.999)*phaseFrames.length)),frame=phaseFrames[index],grid=manifest.grid||{},cols=grid.columns||grid.cols||manifest.columns||1,rows=grid.rows||manifest.rows||1,cellWidth=grid.cellWidth||defenseAtlas.naturalWidth/cols,cellHeight=grid.cellHeight||defenseAtlas.naturalHeight/rows,frameIndex=typeof frame==='number'?frame:(frame.index??0),col=typeof frame==='object'&&frame.col!==undefined?frame.col:frameIndex%cols,row=typeof frame==='object'&&frame.row!==undefined?frame.row:Math.floor(frameIndex/cols),size=108;
    ctx.save();ctx.translate(s.x,s.y);ctx.globalCompositeOperation='lighter';ctx.strokeStyle=defense.mode==='parry'?'rgba(255,221,126,.82)':'rgba(105,218,239,.78)';ctx.lineWidth=defense.phase==='active'?5:2;ctx.beginPath();ctx.arc(0,0,defense.phase==='active'?42:34,0,TAU);ctx.stroke();ctx.globalCompositeOperation='source-over';ctx.scale(Math.cos(p.aim)<0?-1:1,1);ctx.drawImage(defenseAtlas,col*cellWidth,row*cellHeight,cellWidth,cellHeight,-size/2,-size*.69,size,size);ctx.restore();
    game.lastDefenseRender={hero:game.hero,action:defense.mode,phase:defense.phase,frame:frameIndex,col,row};return true;
  }
  function drawGeneratedHero(p,s){
    if(drawDefenseHero(p,s))return true;
    const femaleArcher=game.hero==='archer',img=femaleArcher?calchasFemaleAtlas:heroAtlas;if(!img?.complete||!img.naturalWidth)return false;const fw=img.naturalWidth/4,fh=img.naturalHeight/(femaleArcher?1:3),row=femaleArcher?0:({hoplite:0,swordsman:1}[game.hero]||0),sy=row*fh,height=96,width=96,phase=((p.walkPhase%2)+2)%2,step=Math.floor(phase),mix=phase-step,smooth=mix*mix*(3-2*mix),bob=p.moving?-(Math.sin(phase*Math.PI)**2)*1.25:Math.sin(performance.now()*.0035)*.32,sway=p.moving?Math.sin(phase*Math.PI)*.014:0,blink=(p.invuln>0&&Math.floor(p.invuln*18)%2)?.48:1;
    ctx.save();ctx.translate(s.x,s.y);ctx.globalAlpha=blink;ctx.fillStyle='rgba(0,0,0,.38)';ctx.beginPath();ctx.ellipse(0,37,34-bob*1.8,10,0,0,TAU);ctx.fill();ctx.translate(0,bob);ctx.rotate(sway*(Math.cos(p.aim)<0?-1:1));ctx.scale(Math.cos(p.aim)<0?-1:1,1);
    if(p.motion)ctx.drawImage(img,3*fw,sy,fw,fh,-width/2,-height*.72,width,height);
    else if(p.moving){const a=1+step,b=1+((step+1)%2);ctx.globalAlpha=blink*(1-smooth);ctx.drawImage(img,a*fw,sy,fw,fh,-width/2,-height*.72,width,height);ctx.globalAlpha=blink*smooth;ctx.drawImage(img,b*fw,sy,fw,fh,-width/2,-height*.72,width,height)}
    else{const breathe=1+Math.sin(performance.now()*.0028)*.0025;ctx.scale(breathe,1/breathe);ctx.drawImage(img,0,sy,fw,fh,-width/2,-height*.72,width,height)}ctx.restore();return true
  }
  function drawPhalanxUnit(p,x,y,scale=1,phaseOffset=0,captain=false){
    if(!phalanxMotionAtlas.complete||!phalanxMotionAtlas.naturalWidth)return;const fw=phalanxMotionAtlas.naturalWidth/5,fh=phalanxMotionAtlas.naturalHeight/2,motion=p.motion,attack=motion?clamp(1-motion.time/motion.max,0,1):0,row=motion?1:0,frame=motion?Math.min(4,Math.floor(attack*5)):p.moving?(Math.floor(p.walkPhase+phaseOffset)%5+5)%5:0,size=(captain?78:68)*scale,bob=p.moving?-Math.abs(Math.sin((p.walkPhase+phaseOffset)*Math.PI))*2:Math.sin(performance.now()*.003+phaseOffset)*.7,blink=(p.invuln>0&&Math.floor(p.invuln*18)%2)?.45:1;
    ctx.save();ctx.translate(x,y+bob);ctx.globalAlpha=blink*(captain?1:.88);ctx.fillStyle=captain?'rgba(0,0,0,.45)':'rgba(0,0,0,.30)';ctx.beginPath();ctx.ellipse(0,size*.27,size*.25,size*.075,0,0,TAU);ctx.fill();if(captain){ctx.strokeStyle='rgba(255,210,112,.7)';ctx.lineWidth=2;ctx.shadowColor='#f1bd58';ctx.shadowBlur=12;ctx.beginPath();ctx.arc(0,0,31,0,TAU);ctx.stroke();ctx.shadowBlur=0}ctx.scale(Math.cos(p.aim)<0?-1:1,1);ctx.drawImage(phalanxMotionAtlas,frame*fw,row*fh,fw,fh,-size/2,-size*.60,size,size);ctx.restore();
  }
  function drawPhalanxFollowers(p){
    if(game.hero!=='hoplite')return;const s=w2s(p.x,p.y),fx=Math.cos(p.aim),fy=Math.sin(p.aim),sx=-fy,sy=fx,count=Math.min(4,2+Math.floor((game.level-1)/5)),slots=[[-46,-39],[-46,39],[-88,-60],[-88,60]];
    for(let i=count-1;i>=0;i--){const [back,side]=slots[i],x=s.x+fx*back+sx*side,y=s.y+fy*back+sy*side;drawPhalanxUnit(p,x,y,.86,i*.31,false)}
    if(p.dashTime>0){ctx.save();ctx.translate(s.x,s.y);ctx.rotate(Math.atan2(p.dashY,p.dashX));ctx.globalCompositeOperation='lighter';const grad=ctx.createLinearGradient(-150,0,45,0);grad.addColorStop(0,'rgba(226,159,67,0)');grad.addColorStop(1,'rgba(255,224,145,.36)');ctx.fillStyle=grad;ctx.fillRect(-150,-64,190,128);ctx.restore()}
  }
  function drawPlayer() {
    const p = game.player, s = w2s(p.x, p.y), walk = Math.sin(performance.now() * .012) * 3;
    if(drawGeneratedHero(p,s)){if(game.hero!=='hoplite'){ctx.save();ctx.translate(s.x,s.y);drawPlayerWeapon(p);ctx.restore()}return}
    const walkSprite = walkImages.hoplite;
    if (walkSprite?.complete && walkSprite.naturalWidth) {
      const frame = p.moving ? Math.floor(p.walkPhase) % 4 : 0, bodySize = 90, bob = p.moving ? -Math.abs(Math.sin(p.walkPhase * Math.PI)) * 2 : Math.sin(performance.now() * .004) * .7;
      ctx.save(); ctx.translate(s.x, s.y); ctx.globalAlpha = p.invuln > 0 && Math.floor(p.invuln * 18) % 2 ? .48 : 1;ctx.filter=game.hero==='swordsman'?'hue-rotate(-22deg) saturate(1.25)':game.hero==='archer'?'hue-rotate(72deg) saturate(.9)':'none';
      ctx.fillStyle = 'rgba(0,0,0,.42)'; ctx.beginPath(); ctx.ellipse(-2, 19, 26 - Math.abs(bob) * 1.2, 9, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(255,218,128,.44)'; ctx.lineWidth = 2; ctx.shadowColor = '#efbd61'; ctx.shadowBlur = 10; ctx.beginPath(); ctx.arc(0, 0, 27 + Math.sin(performance.now() * .006) * 1.1, 0, TAU); ctx.stroke(); ctx.shadowBlur = 0;
      if (p.dashTime > 0) { ctx.save(); ctx.rotate(Math.atan2(p.dashY, p.dashX)); ctx.strokeStyle = 'rgba(248,214,137,.4)'; ctx.lineWidth = 18; ctx.beginPath(); ctx.moveTo(-86, 0); ctx.lineTo(-22, 0); ctx.stroke(); ctx.restore(); }
      ctx.save(); ctx.translate(0, bob); ctx.scale(Math.cos(p.aim) < 0 ? -1 : 1, 1); ctx.drawImage(walkSprite, frame * 256, 0, 256, 256, -bodySize / 2, -bodySize / 2, bodySize, bodySize); ctx.restore();
      if (p.flash > 0) { ctx.globalAlpha = p.flash * 1.8; ctx.fillStyle = '#fff2c4'; ctx.beginPath(); ctx.arc(0, -3, 23, 0, TAU); ctx.fill(); ctx.globalAlpha = 1; }
      drawPlayerWeapon(p); ctx.restore(); return;
    }
    if (spriteImages.hoplite.complete && spriteImages.hoplite.naturalWidth) {
      ctx.save(); ctx.translate(s.x, s.y); ctx.globalAlpha = p.invuln > 0 && Math.floor(p.invuln * 18) % 2 ? .48 : 1;
      ctx.fillStyle = 'rgba(0,0,0,.4)'; ctx.beginPath(); ctx.ellipse(-3, 16, 28, 12, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(255,218,128,.42)'; ctx.lineWidth = 2; ctx.shadowColor = '#efbd61'; ctx.shadowBlur = 12; ctx.beginPath(); ctx.arc(0, 0, 29 + Math.sin(performance.now() * .006) * 1.5, 0, TAU); ctx.stroke(); ctx.shadowBlur = 0;
      if (p.dashTime > 0) { ctx.save(); ctx.rotate(Math.atan2(p.dashY, p.dashX)); ctx.strokeStyle = 'rgba(248,214,137,.38)'; ctx.lineWidth = 18; ctx.beginPath(); ctx.moveTo(-82, 0); ctx.lineTo(-20, 0); ctx.stroke(); ctx.restore(); }
      const bob = Math.sin(performance.now() * .012) * 1.5; ctx.save(); ctx.scale(Math.cos(p.aim) < 0 ? -1 : 1, 1); ctx.drawImage(spriteImages.hoplite, -43, -43 + bob, 86, 86); ctx.restore();
      ctx.save(); ctx.rotate(p.aim);
      let thrust = 0; if (p.motion?.kind === 'spear') thrust = Math.sin((1 - p.motion.time / p.motion.max) * Math.PI) * 34;
      ctx.strokeStyle = p.motion?.kind === 'javelin' ? '#c7afff' : '#e8c77e'; ctx.lineWidth = p.motion?.kind === 'javelin' ? 4 : 3; ctx.beginPath(); ctx.moveTo(1 + thrust, -7); ctx.lineTo(62 + thrust, -7); ctx.stroke(); ctx.fillStyle = p.motion?.kind === 'javelin' ? '#d9c8ff' : '#f2d28a'; ctx.beginPath(); ctx.moveTo(70 + thrust, -7); ctx.lineTo(58 + thrust, -12); ctx.lineTo(58 + thrust, -2); ctx.closePath(); ctx.fill();
      if (p.motion?.kind === 'sword') { ctx.strokeStyle = '#fff0d0'; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(7, -5); ctx.lineTo(45, -28); ctx.stroke(); ctx.fillStyle = '#d6a84f'; ctx.fillRect(4, -8, 14, 6); }
      if (p.motion?.kind === 'shield') { ctx.strokeStyle = '#8ee4ef'; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(7, 4, 29, -.9, .9); ctx.stroke(); }
      ctx.restore();
      ctx.restore(); return;
    }
    ctx.save(); ctx.translate(s.x, s.y); ctx.rotate(p.aim); ctx.globalAlpha = p.invuln > 0 && Math.floor(p.invuln * 18) % 2 ? .48 : 1;
    ctx.fillStyle = 'rgba(0,0,0,.38)'; ctx.beginPath(); ctx.ellipse(-5, 17, 25, 11, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(255,218,128,.38)'; ctx.lineWidth = 2; ctx.shadowColor = '#efbd61'; ctx.shadowBlur = 12; ctx.beginPath(); ctx.arc(0, 0, 27 + Math.sin(performance.now() * .006) * 1.5, 0, TAU); ctx.stroke(); ctx.shadowBlur = 0;
    if (p.dashTime > 0) { ctx.strokeStyle = 'rgba(248,214,137,.38)'; ctx.lineWidth = 16; ctx.beginPath(); ctx.moveTo(-78, 0); ctx.lineTo(-18, 0); ctx.stroke(); }
    ctx.strokeStyle = '#8b5136'; ctx.lineWidth = 7; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(-7, 10); ctx.lineTo(-12, 25 + walk); ctx.moveTo(6, 10); ctx.lineTo(11, 25 - walk); ctx.stroke();
    ctx.fillStyle = '#ae4d31'; ctx.beginPath(); ctx.moveTo(-14, -6); ctx.lineTo(13, -6); ctx.lineTo(10, 17); ctx.lineTo(-10, 17); ctx.closePath(); ctx.fill();
    ctx.fillStyle = p.flash > 0 ? '#fff5d5' : '#c99645'; ctx.strokeStyle = '#f0c56b'; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(0, -2, 14, 18, 0, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = 'rgba(81,49,31,.65)'; ctx.lineWidth = 1; for (let yy = -11; yy < 9; yy += 5) { ctx.beginPath(); ctx.moveTo(-9, yy); ctx.lineTo(9, yy); ctx.stroke(); }
    ctx.fillStyle = '#d0a24e'; ctx.beginPath(); ctx.arc(0, -19, 11, 0, TAU); ctx.fill(); ctx.fillStyle = '#332729'; ctx.fillRect(-10, -22, 20, 8); ctx.fillStyle = '#bc3f35'; ctx.beginPath(); ctx.moveTo(-4, -28); ctx.quadraticCurveTo(3, -45, 15, -31); ctx.lineTo(7, -26); ctx.closePath(); ctx.fill();
    let thrust = 0; if (p.motion?.kind === 'spear') thrust = Math.sin((1 - p.motion.time / p.motion.max) * Math.PI) * 28;
    ctx.strokeStyle = '#e4c17a'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(2 + thrust, -5); ctx.lineTo(56 + thrust, -5); ctx.stroke(); ctx.fillStyle = '#f2d28a'; ctx.beginPath(); ctx.moveTo(64 + thrust, -5); ctx.lineTo(53 + thrust, -10); ctx.lineTo(53 + thrust, 0); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#713c34'; ctx.strokeStyle = '#f0bd58'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(-9, 9, p.motion?.kind === 'shield' ? 20 : 18, 0, TAU); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#d9a549'; ctx.beginPath(); ctx.arc(-9, 9, 5, 0, TAU); ctx.fill(); ctx.strokeStyle = 'rgba(255,225,154,.65)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(-18, 9); ctx.lineTo(0, 9); ctx.moveTo(-9, 0); ctx.lineTo(-9, 18); ctx.stroke();
    if (p.motion?.kind === 'sword') { ctx.strokeStyle = '#f4e2bc'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(8, -2); ctx.lineTo(43, -22); ctx.stroke(); ctx.fillStyle = '#f3cf75'; ctx.fillRect(5, -5, 12, 5); }
    if (p.motion?.kind === 'javelin') { ctx.strokeStyle = '#c6adf1'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(-5, -14); ctx.lineTo(48, -22); ctx.stroke(); }
    ctx.restore();
  }
  function drawPlayerLocalHud(){const p=game.player,s=w2s(p.x,p.y),w=132,x=s.x-w/2,ds=dashStatus();ctx.save();ctx.textAlign='center';ctx.font='700 9px sans-serif';ctx.fillStyle='rgba(5,9,13,.88)';ctx.fillRect(x,s.y-106,w,14);ctx.fillStyle=p.hp/p.maxHp<.3?'#ee554d':'#df704f';ctx.fillRect(x+2,s.y-104,(w-4)*clamp(p.hp/p.maxHp,0,1),10);ctx.strokeStyle='#f5d493';ctx.strokeRect(x,s.y-106,w,14);ctx.fillStyle='#fff0cf';ctx.fillText(`${Math.ceil(p.hp)} / ${p.maxHp}`,s.x,s.y-95);const actions=[{cx:s.x-27,img:actionIconImages.dash,pct:ds.pct/100,color:'#69d8ed',label:ds.txt},{cx:s.x+27,img:actionIconImages.ultimate,pct:p.ultimate/100,color:'#ffd35f',label:`Q ${Math.floor(p.ultimate)}%`}];for(const action of actions){const cy=s.y+64;ctx.fillStyle='rgba(4,9,14,.88)';ctx.beginPath();ctx.roundRect(action.cx-22,cy-22,44,44,9);ctx.fill();if(action.img.complete&&action.img.naturalWidth)ctx.drawImage(action.img,action.cx-19,cy-19,38,38);ctx.fillStyle='rgba(2,5,8,.62)';ctx.fillRect(action.cx-20,cy-20,40,40*(1-clamp(action.pct,0,1)));ctx.strokeStyle=action.color;ctx.lineWidth=2.5;ctx.beginPath();ctx.arc(action.cx,cy,22,-Math.PI/2,-Math.PI/2+TAU*clamp(action.pct,0,1));ctx.stroke();ctx.font='800 7px sans-serif';ctx.fillStyle=action.color;ctx.fillText(action.label,action.cx,cy+31)}ctx.restore()}

  function drawEliteArt(e,screen){const frames={eliteCaptain:0,eliteArcher:1,eliteDrummer:2},frame=frames[e.type];if(frame===undefined||!eliteAtlas.complete||!eliteAtlas.naturalWidth)return false;const fw=eliteAtlas.naturalWidth/3,fh=eliteAtlas.naturalHeight,size=e.r*5.15,bob=-Math.abs(Math.sin(e.walkPhase*Math.PI))*2;ctx.save();ctx.translate(screen.x,screen.y+bob);ctx.globalAlpha=e.hitFlash>0?.68:1;ctx.fillStyle='rgba(0,0,0,.42)';ctx.beginPath();ctx.ellipse(0,e.r*.82,e.r*1.45,e.r*.5,0,0,TAU);ctx.fill();ctx.strokeStyle=e.bossEscort?'#f1c05c':'#bc7350';ctx.lineWidth=3;ctx.shadowColor='#e6a74f';ctx.shadowBlur=12;ctx.beginPath();ctx.arc(0,0,e.r*1.28,0,TAU);ctx.stroke();ctx.shadowBlur=0;ctx.scale(Math.cos(e.facing)<0?-1:1,1);ctx.drawImage(eliteAtlas,frame*fw,0,fw,fh,-size/2,-size*.66,size,size);recordRenderDraw('enemy',e.type,size,size,size,size);ctx.restore();ctx.fillStyle='rgba(4,8,12,.75)';ctx.fillRect(screen.x-e.r*1.35,screen.y-size*.56,e.r*2.7,6);ctx.fillStyle='#e5b552';ctx.fillRect(screen.x-e.r*1.35,screen.y-size*.56,e.r*2.7*clamp(e.hp/e.maxHp,0,1),6);ctx.font='700 9px sans-serif';ctx.textAlign='center';ctx.fillStyle='#ffe3a2';ctx.fillText(e.name,screen.x,screen.y-size*.56-4);return true}

  function drawBossArt(e, screen) {
    const img = bossImages[e.type];
    if (!img?.complete || !img.naturalWidth) return false;
    const now = performance.now(), hpRatio = e.hp / e.maxHp;
    ctx.save(); ctx.translate(screen.x, screen.y); ctx.globalAlpha = e.hitFlash > 0 ? .72 : 1;
    ctx.fillStyle = 'rgba(0,0,0,.48)'; ctx.beginPath(); ctx.ellipse(0, e.type === 'chariot' ? 30 : 29, e.type === 'chariot' ? 82 : 42, e.type === 'chariot' ? 20 : 13, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = e.type === 'hector' ? 'rgba(255,191,75,.76)' : 'rgba(213,76,48,.68)'; ctx.lineWidth = 4; ctx.shadowColor = e.type === 'hector' ? '#f0a84c' : '#d64c34'; ctx.shadowBlur = renderQuality === 'low' ? 0 : 15; ctx.beginPath(); ctx.arc(0, 0, e.r * 1.3 + Math.sin(now * .006) * 2, 0, TAU); ctx.stroke(); ctx.shadowBlur = 0;
    if (e.stun > 0) ctx.filter = 'grayscale(1) brightness(.82)';
    if (e.type === 'chariot') {
      const direction = Math.cos(e.facing) < 0 ? -1 : 1, charging = e.phase > 0, bob = Math.sin(e.walkPhase * Math.PI) * 3.2, gallop = Math.sin(e.walkPhase * Math.PI * 2) * .018;
      ctx.rotate(Math.sin(e.facing) * .13 + gallop * direction); ctx.scale(direction * (charging ? 1.1 : 1), charging ? .94 : 1); ctx.translate(charging ? 10 : 0, bob);
      const width = e.r * 5.45, height = width * img.naturalHeight / img.naturalWidth;
      ctx.drawImage(img, -width * .53, -height * .52, width, height);recordRenderDraw('enemy',e.type,width,height,width,height);
      if (charging) { ctx.globalAlpha = .7; ctx.strokeStyle = '#f0b15c'; ctx.lineWidth = 3; for (const y of [-24, 24]) { ctx.beginPath(); ctx.arc(-35, y, 14, e.walkPhase * 2, e.walkPhase * 2 + Math.PI * 1.45); ctx.stroke(); } }
    } else {
      const direction = Math.cos(e.facing) < 0 ? -1 : 1, attack = clamp(e.attackPose / .58, 0, 1), thrust = Math.sin((1 - attack) * Math.PI) * 12;
      const bob = -Math.abs(Math.sin(e.walkPhase * Math.PI)) * 2.2 + Math.sin(now * .004) * .8;
      ctx.translate(thrust * direction, bob); ctx.rotate(Math.sin(e.walkPhase * Math.PI) * .024 * direction - attack * .055 * direction); ctx.scale(direction * (1 + attack * .04), 1 - attack * .025);
      const height = e.r * 3.75, width = height * img.naturalWidth / img.naturalHeight;
      ctx.drawImage(img, -width * .49, -height * .54, width, height);recordRenderDraw('enemy',e.type,width,height,width,height);
    }
    ctx.filter = 'none'; ctx.restore();
    ctx.fillStyle = 'rgba(0,0,0,.64)'; ctx.fillRect(screen.x - e.r * 1.4, screen.y - e.r * 1.85, e.r * 2.8, 6);
    ctx.fillStyle = e.type === 'hector' ? '#e4a852' : '#d3533d'; ctx.fillRect(screen.x - e.r * 1.4, screen.y - e.r * 1.85, e.r * 2.8 * clamp(hpRatio, 0, 1), 6);
    return true;
  }

  const ROLE_MARKER_COLORS = Object.freeze({ medic: '#80c98a', horncaller: '#a77bd5', firearcher: '#ef7041', netter: '#d4bd83', giant: '#d39a58', ghost: '#62b8cb', engineer: '#c48952', assassin: '#a876cf' });
  function drawEnemy(e) {
    if(e.hiddenTicks>0)return;
    const p = w2s(e.x, e.y);if(e.airborneTicks>0){const lift=54+Math.sin((48-e.airborneTicks)/48*Math.PI)*38;p.y-=lift;ctx.save();ctx.globalAlpha=.32;ctx.fillStyle='#7ac9e8';ctx.beginPath();ctx.ellipse(p.x,p.y+lift,e.r*1.4,e.r*.55,0,0,TAU);ctx.fill();ctx.restore()} if (p.x < -90 || p.x > W + 90 || p.y < -90 || p.y > H + 90) return;
    if(e.windup>0||e.chargeWindup>0||e.pursuitWindup>0){const ranged=RANGED_ENEMY_TYPES.has(e.type),unavoidable=e.chargeWindup>0,tag=unavoidable?'unavoidable':ranged?'reflectable':'parryable';ctx.save();ctx.translate(p.x,p.y-e.r*2.1);ctx.lineWidth=3;ctx.strokeStyle=unavoidable?'#f06a58':ranged?'#76d9ef':'#f4cf78';ctx.fillStyle='rgba(6,10,14,.84)';ctx.beginPath();if(tag==='reflectable'){ctx.moveTo(0,-10);ctx.lineTo(10,0);ctx.lineTo(0,10);ctx.lineTo(-10,0);ctx.closePath()}else{ctx.arc(0,0,11,0,TAU)}ctx.fill();ctx.stroke();if(tag==='parryable'){ctx.beginPath();ctx.moveTo(-5,-6);ctx.lineTo(4,0);ctx.lineTo(-5,6);ctx.stroke()}else if(tag==='unavoidable'){ctx.beginPath();ctx.moveTo(-6,-6);ctx.lineTo(6,6);ctx.moveTo(6,-6);ctx.lineTo(-6,6);ctx.stroke()}ctx.restore()}
    if (e.type === 'chariot' && e.chargeWindup > 0) {
      const len = Math.min(game.arena?.r * 1.75 || 900, 1380), dx = Math.cos(e.chargeAngle), dy = Math.sin(e.chargeAngle), pulse = .55 + Math.sin(performance.now() * .022) * .2;
      ctx.save(); ctx.lineCap = 'round'; ctx.strokeStyle = `rgba(184,54,35,${.16 + pulse * .16})`; ctx.lineWidth = e.r * 1.7; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + dx * len, p.y + dy * len); ctx.stroke();
      ctx.strokeStyle = `rgba(255,174,82,${.58 + pulse * .25})`; ctx.lineWidth = 3; ctx.setLineDash([12, 11]); ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + dx * len, p.y + dy * len); ctx.stroke(); ctx.setLineDash([]); ctx.restore();
    }
    if (drawBossArt(e, p)) return;
    if (drawEliteArt(e,p)) return;
    if (e.type === 'shieldman') {
      const turnProgress = clamp(e.guardTurnDelay, 0, 1); ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(e.guardFacing);
      ctx.strokeStyle = turnProgress > 0 ? `rgba(255,190,94,${.48 + turnProgress * .35})` : 'rgba(126,198,207,.58)'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(0, 0, e.r * 1.22, -.78, .78); ctx.stroke();
      if (turnProgress > 0) { ctx.strokeStyle = 'rgba(255,224,151,.8)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, e.r * 1.48, -.78, -.78 + 1.56 * turnProgress); ctx.stroke(); } ctx.restore();
    }
    if (e.pursuitWindup > 0) { const pulse = 1 - e.pursuitWindup / .26; ctx.strokeStyle = `rgba(244,129,70,${.25 + pulse * .55})`; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(p.x, p.y, e.r + 9 + pulse * 8, 0, TAU); ctx.stroke(); }
    if(ROLE_MARKER_COLORS[e.type]){ctx.save();ctx.strokeStyle=ROLE_MARKER_COLORS[e.type];ctx.globalAlpha=.42;ctx.lineWidth=2;ctx.setLineDash([5,5]);ctx.beginPath();ctx.arc(p.x,p.y,e.r*1.25+Math.sin(performance.now()*.005)*2,0,TAU);ctx.stroke();ctx.restore()}
    const atlasFrames={raider:0,skirmisher:1,archer:2,shieldman:3,slinger:4,standard:5,bomber:6},fallbackFrame=atlasFrames[e.type],atlasFrame=fallbackFrame===undefined?undefined:manifestCell(assetManifests.enemies,e.type,fallbackFrame),sprite=atlasFrame!==undefined?trojanForcesAtlas:(spriteImages[e.type] || (e.type === 'hector' ? spriteImages.shieldman : null));
    if (sprite?.complete && sprite.naturalWidth && e.type !== 'chariot') {
      const size = e.r * (e.type === 'hector' ? 5.15 : ['cavalry','amazonrider'].includes(e.type)?5.25:e.type==='giant'?4.9:e.type==='assassin'?3.9:e.type === 'standard' ? 4.9 : e.type === 'archer' ? 4.5 : e.type==='skirmisher'?3.85:4.25);
      ctx.save(); ctx.translate(p.x, p.y); ctx.globalAlpha = e.hitFlash > 0 ? .68 : 1;
      ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.beginPath(); ctx.ellipse(-3, e.r * .78, e.r * 1.35, e.r * .52, 0, 0, TAU); ctx.fill();
      if (e.type === 'hector') { ctx.strokeStyle = 'rgba(255,191,75,.72)'; ctx.lineWidth = 5; glow('#f0a84c', 18); ctx.beginPath(); ctx.arc(0, 0, e.r * 1.28, 0, TAU); ctx.stroke(); ctx.shadowBlur = 0; }
      if (e.type === 'standard') { ctx.fillStyle = 'rgba(203,69,48,.12)'; ctx.strokeStyle = 'rgba(229,107,70,.42)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, 178, 0, TAU); ctx.fill(); ctx.stroke(); }
      if (e.stun > 0) { ctx.filter = 'grayscale(1) brightness(.85)'; }
      const direction = Math.cos(e.facing) < 0 ? -1 : 1, bodyBob = -Math.abs(Math.sin(e.walkPhase * Math.PI)) * 1.8, sway = Math.sin(e.walkPhase * Math.PI) * .025;
      ctx.save(); ctx.translate(0, bodyBob); ctx.rotate(sway * direction); ctx.scale(direction, 1);
      if(atlasFrame!==undefined){const fw=sprite.naturalWidth/(atlasFrame.cols||4),fh=sprite.naturalHeight/(atlasFrame.rows||2),scale=atlasFrame.entry?.scale||1.08,dw=size*scale,dh=dw*fh/fw;ctx.drawImage(sprite,atlasFrame.col*fw,atlasFrame.row*fh,fw,fh,-dw/2,-dh*.66,dw,dh);recordRenderDraw('enemy',e.type,dw,dh,size*scale,size*scale*fh/fw)}
      else if (e.type === 'raider' && walkImages.trojan?.complete && walkImages.trojan.naturalWidth) {
        const frame = Math.floor(e.walkPhase) % 4; ctx.drawImage(walkImages.trojan, frame * 256, 0, 256, 256, -size * .56, -size * .56, size * 1.12, size * 1.12);
      } else {ctx.drawImage(sprite, -size / 2, -size / 2, size, size);recordRenderDraw('enemy',e.type,size,size,size,size)}
      ctx.restore(); ctx.filter = 'none';
      if (e.bleed > 0) { ctx.strokeStyle = '#ed4d50'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-7, 12); ctx.lineTo(-12, 25); ctx.stroke(); }
      if (e.burn > 0) { ctx.fillStyle = '#f07c3c'; ctx.beginPath(); ctx.moveTo(-6, 20); ctx.quadraticCurveTo(0, -5, 7, 20); ctx.fill(); }
      if (e.mark > 0) { ctx.strokeStyle = '#d8b4ff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, e.r * 1.28, -.35, Math.PI + .35); ctx.stroke(); }
      if(e.type==='bomber'&&e.fuse>0){const pulse=.5+.5*Math.sin(performance.now()*.035);ctx.strokeStyle=`rgba(255,102,54,${.62+pulse*.34})`;glow('#ff6b35',12);ctx.lineWidth=4;ctx.beginPath();ctx.arc(0,2,e.r+9+pulse*5,0,TAU);ctx.stroke();ctx.shadowBlur=0}
      ctx.restore();
      if (e.elite) { ctx.fillStyle = 'rgba(0,0,0,.58)'; ctx.fillRect(p.x - e.r, p.y - size * .48 - 8, e.r * 2, 5); ctx.fillStyle = e.boss ? '#e05b43' : '#e1ad52'; ctx.fillRect(p.x - e.r, p.y - size * .48 - 8, e.r * 2 * clamp(e.hp / e.maxHp, 0, 1), 5); }
      if (e.windup > 0) { const pulse = .5 + .5 * Math.sin(performance.now() * .02), dx = Math.cos(e.facing), dy = Math.sin(e.facing); ctx.strokeStyle = `rgba(207,65,42,${.12 + pulse * .12})`; ctx.lineWidth = 12; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + dx * 520, p.y + dy * 520); ctx.stroke(); ctx.strokeStyle = `rgba(255,171,82,${.58 + pulse * .3})`; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + dx * 520, p.y + dy * 520); ctx.stroke(); }
      return;
    }
    const walk = Math.sin(performance.now() * .01 + e.x) * 2.5; ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(e.facing); ctx.globalAlpha = e.hitFlash > 0 ? .68 : 1;
    ctx.fillStyle = 'rgba(0,0,0,.32)'; ctx.beginPath(); ctx.ellipse(-3, e.r * .78, e.r * 1.1, e.r * .45, 0, 0, TAU); ctx.fill();
    if (e.type === 'chariot') {
      const hoof = Math.sin(e.walkPhase * Math.PI) * 5;
      ctx.strokeStyle = '#c99752'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-20, -16); ctx.lineTo(34, -19); ctx.moveTo(-20, 16); ctx.lineTo(34, 19); ctx.stroke();
      for (const side of [-1, 1]) {
        ctx.save(); ctx.translate(27, side * 19); ctx.fillStyle = side > 0 ? '#733b2a' : '#864a31'; ctx.strokeStyle = '#d3a15b'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.ellipse(0, 0, 25, 11, 0, 0, TAU); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#995f3a'; ctx.beginPath(); ctx.ellipse(24, -side * 2, 10, 8, 0, 0, TAU); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#35271f'; ctx.beginPath(); ctx.arc(29, -side * 4, 1.8, 0, TAU); ctx.fill();
        ctx.strokeStyle = '#503023'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-9, -7); ctx.lineTo(-14 + hoof, -17); ctx.moveTo(8, 7); ctx.lineTo(13 - hoof, 17); ctx.stroke();
        ctx.strokeStyle = '#e0b668'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(8, -10); ctx.lineTo(8, 10); ctx.moveTo(15, -8); ctx.lineTo(15, 8); ctx.stroke(); ctx.restore();
      }
      ctx.fillStyle = '#592720'; ctx.strokeStyle = '#dfaf5b'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-43, -25); ctx.lineTo(-5, -21); ctx.lineTo(5, -12); ctx.lineTo(5, 12); ctx.lineTo(-5, 21); ctx.lineTo(-43, 25); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#a4442d'; ctx.beginPath(); ctx.moveTo(-37, -18); ctx.lineTo(-8, -15); ctx.lineTo(-8, 15); ctx.lineTo(-37, 18); ctx.closePath(); ctx.fill(); ctx.strokeStyle = '#d9a24f'; ctx.stroke();
      for (const yy of [-28, 28]) { ctx.fillStyle = '#33251f'; ctx.strokeStyle = '#e0af58'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(-25, yy, 13, 0, TAU); ctx.fill(); ctx.stroke(); for (let s = 0; s < 6; s++) { const a = s * TAU / 6; ctx.beginPath(); ctx.moveTo(-25, yy); ctx.lineTo(-25 + Math.cos(a) * 11, yy + Math.sin(a) * 11); ctx.stroke(); } }
      ctx.fillStyle = '#bd7b42'; ctx.beginPath(); ctx.arc(-19, 0, 9, 0, TAU); ctx.fill(); ctx.fillStyle = '#d5a351'; ctx.beginPath(); ctx.moveTo(-28, -5); ctx.lineTo(-20, -19); ctx.lineTo(-10, -5); ctx.closePath(); ctx.fill(); ctx.fillStyle = '#772c27'; ctx.strokeStyle = '#e4b65f'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(-18, 10, 10, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = '#d8b06a'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(-9, -3); ctx.quadraticCurveTo(17, -4, 50, -21); ctx.moveTo(-9, 3); ctx.quadraticCurveTo(17, 4, 50, 21); ctx.stroke();
    } else if (e.type === 'bomber') {
      const pulse = e.fuse > 0 ? .5 + .5 * Math.sin(performance.now() * .035) : 0;
      ctx.fillStyle = '#5f392b'; ctx.strokeStyle = '#d69a58'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-8, -8); ctx.quadraticCurveTo(-16, 8, -7, 18); ctx.quadraticCurveTo(0, 23, 7, 18); ctx.quadraticCurveTo(16, 8, 8, -8); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#a94a30'; ctx.fillRect(-7, -12, 14, 7); ctx.strokeStyle = '#4a3227'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, -12); ctx.quadraticCurveTo(10, -22, 13, -29); ctx.stroke(); ctx.fillStyle = e.fuse > 0 ? '#ffb14e' : '#a65a32'; glow('#ff6b35', e.fuse > 0 ? 13 : 3); ctx.beginPath(); ctx.arc(14, -30, 4 + pulse * 2, 0, TAU); ctx.fill(); ctx.shadowBlur = 0;
      if (e.fuse > 0) { ctx.strokeStyle = `rgba(255,102,54,${.55 + pulse * .4})`; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, 1, 22 + pulse * 4, 0, TAU); ctx.stroke(); }
    } else {
      ctx.strokeStyle = '#633624'; ctx.lineWidth = 6; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(-5, 8); ctx.lineTo(-9, 20 + walk); ctx.moveTo(6, 8); ctx.lineTo(10, 20 - walk); ctx.stroke();
      ctx.fillStyle = e.stun > 0 ? '#898376' : e.hitFlash > 0 ? '#fff0c6' : e.color; ctx.beginPath(); ctx.moveTo(-e.r * .72, -8); ctx.lineTo(e.r * .72, -8); ctx.lineTo(e.r * .58, e.r * .8); ctx.lineTo(-e.r * .58, e.r * .8); ctx.closePath(); ctx.fill(); ctx.strokeStyle = e.elite ? '#f1c360' : 'rgba(242,210,150,.45)'; ctx.lineWidth = e.elite ? 3 : 1.5; ctx.stroke();
      ctx.fillStyle = '#bd8b51'; ctx.beginPath(); ctx.arc(0, -e.r * .72, e.r * .48, 0, TAU); ctx.fill();
      if (e.type === 'archer') { ctx.fillStyle = '#725338'; ctx.beginPath(); ctx.moveTo(-10, -14); ctx.lineTo(0, -25); ctx.lineTo(10, -14); ctx.closePath(); ctx.fill(); ctx.strokeStyle = e.windup > 0 ? '#f1b15d' : '#c99b61'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(5, 0, e.r * .9, -1.15, 1.15); ctx.stroke(); ctx.beginPath(); ctx.moveTo(5 - e.r * .82, -e.r * .76); ctx.lineTo(5 - e.r * .82, e.r * .76); ctx.stroke(); }
      else if (e.type === 'slinger') { ctx.fillStyle = '#4f5d4e'; ctx.beginPath(); ctx.moveTo(-10, -6); ctx.lineTo(10, -16); ctx.lineTo(14, 11); ctx.lineTo(-7, 14); ctx.closePath(); ctx.fill(); ctx.strokeStyle = '#b7a075'; ctx.beginPath(); ctx.arc(12, -3, 12, -1.3, 1.3); ctx.stroke(); }
      else if (e.type === 'shieldman' || e.type === 'hector') { ctx.fillStyle = '#5b302c'; ctx.strokeStyle = '#e0aa55'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.ellipse(5, e.r * .58, e.r * .72, e.r * .86, 0, 0, TAU); ctx.fill(); ctx.stroke(); ctx.beginPath(); ctx.moveTo(-3, e.r * .58); ctx.lineTo(13, e.r * .58); ctx.moveTo(5, e.r * .1); ctx.lineTo(5, e.r * 1.05); ctx.stroke(); }
      else if (e.type === 'standard') { ctx.strokeStyle = '#d1b06e'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(0, -7); ctx.lineTo(0, -55); ctx.stroke(); ctx.fillStyle = '#a92e2d'; ctx.beginPath(); ctx.moveTo(1, -54); ctx.lineTo(29, -46); ctx.lineTo(1, -32); ctx.closePath(); ctx.fill(); ctx.strokeStyle = '#e0b35c'; ctx.stroke(); }
      else { ctx.strokeStyle = '#d7ad6d'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(2, -2); ctx.lineTo(e.r + 17, -2); ctx.stroke(); ctx.fillStyle = '#dcb86f'; ctx.beginPath(); ctx.moveTo(e.r + 23, -2); ctx.lineTo(e.r + 13, -6); ctx.lineTo(e.r + 13, 2); ctx.closePath(); ctx.fill(); }
      if (e.type === 'skirmisher') { ctx.fillStyle = '#60435b'; ctx.beginPath(); ctx.moveTo(-11, -10); ctx.lineTo(0, -28); ctx.lineTo(11, -10); ctx.closePath(); ctx.fill(); }
    }
    if (e.bleed > 0) { ctx.strokeStyle = '#e14648'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-7, 12); ctx.lineTo(-10, 21); ctx.stroke(); }
    if (e.burn > 0) { ctx.fillStyle = '#f07c3c'; ctx.beginPath(); ctx.moveTo(-5, 12); ctx.quadraticCurveTo(0, -6, 5, 12); ctx.fill(); }
    if (e.mark > 0) { ctx.strokeStyle = '#d8b4ff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, e.r * 1.4, -.35, Math.PI + .35); ctx.stroke(); }
    ctx.restore();
    if (e.elite) { ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(p.x - e.r, p.y - e.r - 15, e.r * 2, 5); ctx.fillStyle = e.boss ? '#e05b43' : '#e1ad52'; ctx.fillRect(p.x - e.r, p.y - e.r - 15, e.r * 2 * clamp(e.hp / e.maxHp, 0, 1), 5); }
    if (e.windup > 0) { const pulse = .5 + .5 * Math.sin(performance.now() * .02), dx = Math.cos(e.facing), dy = Math.sin(e.facing); ctx.strokeStyle = `rgba(207,65,42,${.12 + pulse * .12})`; ctx.lineWidth = 12; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + dx * 520, p.y + dy * 520); ctx.stroke(); ctx.strokeStyle = `rgba(255,171,82,${.58 + pulse * .3})`; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + dx * 520, p.y + dy * 520); ctx.stroke(); }
  }

  function drawProjectiles() {
    for (const q of game.projectiles) { const p = w2s(q.x, q.y); if (!onScreen(p, 80)) continue; const a = Math.atan2(q.vy, q.vx); ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(a);
      if (q.type === 'stone') { ctx.fillStyle = '#a89a84'; ctx.beginPath(); ctx.arc(0, 0, 7, 0, TAU); ctx.fill(); ctx.strokeStyle = '#d5c4a6'; ctx.stroke(); }
      else if (q.type === 'playerJavelin' || q.type === 'split') { glow('#d4bd7a', q.type === 'playerJavelin' ? 7 : 3); drawWeaponArt('javelin',-27,-16,55,32); }
      else if (q.type === 'myrmidon' || q.type === 'allySpear' || q.type === 'allyVolley') { glow(q.color, q.type === 'myrmidon' ? 6 : 2); drawWeaponArt('spear',-31,-16,62,32); }
      else if (q.type === 'arrow' || q.type === 'relicArrow') { const enemyArrow = q.type === 'arrow'; ctx.fillStyle = enemyArrow ? 'rgba(235,82,48,.18)' : 'rgba(147,101,191,.16)'; glow(enemyArrow ? '#ff7048' : '#b991ef', enemyArrow ? 10 : 6); ctx.beginPath(); ctx.arc(0, 0, q.r + 3, 0, TAU); ctx.fill(); ctx.strokeStyle = enemyArrow ? 'rgba(239,91,53,.34)' : 'rgba(185,145,239,.28)'; ctx.lineWidth = enemyArrow ? 7 : 5; ctx.beginPath(); ctx.moveTo(-27, 0); ctx.lineTo(15, 0); ctx.stroke(); ctx.shadowBlur = 0; ctx.strokeStyle = '#704729'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-18, 0); ctx.lineTo(11, 0); ctx.stroke(); ctx.fillStyle = enemyArrow ? '#ffad58' : '#c2a46a'; ctx.beginPath(); ctx.moveTo(17, 0); ctx.lineTo(8, -4); ctx.lineTo(9, 4); ctx.closePath(); ctx.fill(); ctx.fillStyle = enemyArrow ? '#d94f37' : '#8763a8'; ctx.beginPath(); ctx.moveTo(-18, 0); ctx.lineTo(-12, -5); ctx.lineTo(-9, 0); ctx.lineTo(-12, 5); ctx.closePath(); ctx.fill(); ctx.strokeStyle = enemyArrow ? 'rgba(255,126,72,.55)' : 'rgba(229,214,183,.28)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(-32, 0); ctx.lineTo(-20, 0); ctx.stroke(); }
      else if (q.type === 'swordWave') { ctx.strokeStyle = '#f0c66b'; glow('#d79b45', 8); ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(0, 0, 18, -1.05, 1.05); ctx.stroke(); ctx.strokeStyle = '#fff0be'; ctx.lineWidth = 1.5; ctx.stroke(); }
      else if (q.type === 'bronzeShard') { ctx.fillStyle = '#e0b75f'; ctx.beginPath(); ctx.moveTo(12, 0); ctx.lineTo(-8, -4); ctx.lineTo(-5, 4); ctx.closePath(); ctx.fill(); }
      else { ctx.strokeStyle = q.color; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(-16, 0); ctx.lineTo(11, 0); ctx.stroke(); ctx.fillStyle = q.color; ctx.beginPath(); ctx.moveTo(17, 0); ctx.lineTo(8, -4); ctx.lineTo(8, 4); ctx.closePath(); ctx.fill(); }
      ctx.restore();
    }
  }

  function drawCombatVfx(cell,x,y,w,h,angle,alpha){if(renderQuality==='low'||!combatVfxAtlas.complete||!combatVfxAtlas.naturalWidth)return;const fw=combatVfxAtlas.naturalWidth/4,fh=combatVfxAtlas.naturalHeight/4,col=cell%4,row=Math.floor(cell/4);ctx.save();ctx.translate(x,y);ctx.rotate(angle||0);ctx.globalAlpha=clamp(alpha,0,.82);ctx.globalCompositeOperation='lighter';ctx.drawImage(combatVfxAtlas,col*fw,row*fh,fw,fh,-w/2,-h/2,w,h);ctx.restore()}
  function drawAttacksAndParticles() {
    for (const a of game.attacks) { const alpha = a.life / a.max;const v=w2s(a.x,a.y);if(a.kind==='thrust')drawCombatVfx(0,v.x+Math.cos(a.angle)*a.length*.47,v.y+Math.sin(a.angle)*a.length*.47,a.length*1.2,Math.max(82,a.width*4.4),a.angle,alpha*.72);else if(a.kind==='slash')drawCombatVfx(1,v.x,v.y,a.r*2.5,a.r*2.5,a.angle,alpha*.72);else if(a.kind==='shieldBlock')drawCombatVfx(2,v.x,v.y,a.r*2.6,a.r*2.6,a.angle,alpha*.82);else if(a.kind==='shockwave')drawCombatVfx(3,v.x+Math.cos(a.angle)*a.length*.35,v.y+Math.sin(a.angle)*a.length*.35,a.length*1.15,Math.max(110,a.width*4),a.angle,alpha*.58);else if(a.kind==='lightning')drawCombatVfx(5,v.x,v.y,130,130,0,alpha*.65);else if(a.kind==='blast')drawCombatVfx(6,v.x,v.y,a.r*2.4,a.r*2.4,0,alpha*.7);else if(a.kind==='ring')drawCombatVfx(7,v.x,v.y,a.r*2.4,a.r*2.4,0,alpha*.48);ctx.save(); ctx.globalAlpha = alpha; ctx.strokeStyle = a.color; glow(a.color, 9);
      if (a.kind === 'impactFx' && fxImages.bronzeImpact?.complete && fxImages.bronzeImpact.naturalWidth) { const p = w2s(a.x, a.y), grow = 1.18 - alpha * .18, size = a.r * 2 * grow; ctx.globalCompositeOperation = 'lighter'; ctx.translate(p.x, p.y); ctx.rotate(a.angle + (1 - alpha) * .34); ctx.drawImage(fxImages.bronzeImpact, -size / 2, -size / 2, size, size); }
      else if (a.kind === 'thrust') { const p = w2s(a.x, a.y), dx = Math.cos(a.angle), dy = Math.sin(a.angle), nx = -dy * a.width, ny = dx * a.width; ctx.fillStyle = `${a.color}33`; ctx.beginPath(); ctx.moveTo(p.x + nx, p.y + ny); ctx.lineTo(p.x + dx * a.length + nx * .28, p.y + dy * a.length + ny * .28); ctx.lineTo(p.x + dx * (a.length + 20), p.y + dy * (a.length + 20)); ctx.lineTo(p.x + dx * a.length - nx * .28, p.y + dy * a.length - ny * .28); ctx.lineTo(p.x - nx, p.y - ny); ctx.closePath(); ctx.fill(); ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + dx * a.length, p.y + dy * a.length); ctx.stroke(); }
      else if (a.kind === 'slash') { const p = w2s(a.x, a.y); ctx.lineCap = 'round'; ctx.shadowBlur = 5; ctx.strokeStyle = '#8e7145'; ctx.lineWidth = 10; ctx.beginPath(); ctx.arc(p.x, p.y, a.r, a.angle - a.arc / 2, a.angle + a.arc / 2); ctx.stroke(); ctx.strokeStyle = '#e8ddc2'; ctx.lineWidth = 3; ctx.stroke(); ctx.globalAlpha = alpha * .45; ctx.strokeStyle = '#c39a55'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(p.x, p.y, a.r - 9, a.angle - a.arc / 2, a.angle + a.arc / 2); ctx.stroke(); }
      else if (a.kind === 'ring' || a.kind === 'blast' || a.kind === 'bannerPulse' || a.kind === 'wellRipple') { const p = w2s(a.x, a.y), r = a.r * (1 - alpha * .35); ctx.lineWidth = a.kind === 'blast' ? 10 : a.kind === 'bannerPulse' ? 4 : 6; ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, TAU); ctx.stroke(); }
      else if (a.kind === 'shockwave') { const p = w2s(a.x, a.y), dx = Math.cos(a.angle), dy = Math.sin(a.angle), nx = -dy * a.width, ny = dx * a.width; ctx.fillStyle = 'rgba(196,151,75,.18)'; ctx.beginPath(); ctx.moveTo(p.x + nx * .35, p.y + ny * .35); ctx.lineTo(p.x + dx * a.length + nx, p.y + dy * a.length + ny); ctx.lineTo(p.x + dx * (a.length + 28), p.y + dy * (a.length + 28)); ctx.lineTo(p.x + dx * a.length - nx, p.y + dy * a.length - ny); ctx.lineTo(p.x - nx * .35, p.y - ny * .35); ctx.closePath(); ctx.fill(); ctx.strokeStyle = '#d8ad5b'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + dx * a.length, p.y + dy * a.length); ctx.stroke(); }
      else if (a.kind === 'shieldBlock') { const p = w2s(a.x, a.y); ctx.strokeStyle = '#e5bd68'; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(p.x, p.y, a.r, a.angle - .8, a.angle + .8); ctx.stroke(); }
      else if (a.kind === 'skySpear') { const p = w2s(a.x, a.y); ctx.strokeStyle = '#d9b25f'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(p.x - 38, p.y - 62); ctx.lineTo(p.x, p.y); ctx.stroke(); ctx.strokeStyle = '#f1d68b'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(p.x, p.y, a.r * (1 - alpha * .4), 0, TAU); ctx.stroke(); }
      else if (a.kind === 'lightning') { const p = w2s(a.x, a.y), q = w2s(a.x2, a.y2); ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(p.x, p.y); for (let i = 1; i < 6; i++) { const t = i / 6; ctx.lineTo(lerp(p.x, q.x, t) + visualRand(9, -9), lerp(p.y, q.y, t) + visualRand(9, -9)); } ctx.lineTo(q.x, q.y); ctx.stroke(); }
      ctx.restore();
    }
    for (const q of game.particles) { const p = w2s(q.x, q.y); if (!onScreen(p, 24)) continue; ctx.save(); ctx.translate(p.x, p.y); ctx.rotate((1 - q.life / q.max) * q.spin); ctx.globalAlpha = clamp(q.life / q.max, 0, 1); ctx.fillStyle = q.color;
      if (q.shape === 'shard') ctx.fillRect(-q.r, -q.r * .4, q.r * 2, q.r * .8); else if (q.shape === 'spark') { ctx.fillRect(-q.r * 1.7, -1, q.r * 3.4, 2); } else { ctx.beginPath(); ctx.arc(0, 0, q.r, 0, TAU); ctx.fill(); } ctx.restore(); }
    ctx.textAlign = 'center'; ctx.shadowColor = '#000'; ctx.shadowBlur = renderQuality === 'low' ? 0 : 4; let textFont = '';
    for (const q of game.texts) { const p = w2s(q.x, q.y - (1 - q.life / q.max) * 32); if (!onScreen(p, 40)) continue; const font = q.big ? '800 16px Inter,sans-serif' : '700 12px Inter,sans-serif'; if (font !== textFont) { textFont = font; ctx.font = font; } ctx.globalAlpha = clamp(q.life / q.max, 0, 1); ctx.fillStyle = q.color; ctx.fillText(q.text, p.x, p.y); }
    ctx.globalAlpha = 1; ctx.shadowBlur = 0;
  }

  let dangerPaint = null, dangerPaintKey = '';
  function dangerVignette(){const key=`${W}x${H}`;if(dangerPaint&&dangerPaintKey===key)return dangerPaint;const paint=ctx.createRadialGradient(W/2,H/2,Math.min(W,H)*.26,W/2,H/2,Math.max(W,H)*.7);paint.addColorStop(0,'rgba(130,16,20,0)');paint.addColorStop(1,'rgba(150,12,18,.26)');dangerPaint=paint;dangerPaintKey=key;return paint;}
  function drawThreatIndicators(){const boss=game.boss;if(boss&&!boss.dead){const raw=w2s(boss.x,boss.y);if(!onScreen(raw,70)){const margin=74,x=clamp(raw.x,margin,W-margin),y=clamp(raw.y,margin,H-margin-46),angle=Math.atan2(raw.y-H/2,raw.x-W/2);ctx.save();ctx.translate(x,y);ctx.rotate(angle);ctx.fillStyle='#f0b85d';ctx.shadowColor='#d84e3e';ctx.shadowBlur=12;ctx.beginPath();ctx.moveTo(18,0);ctx.lineTo(-10,-9);ctx.lineTo(-10,9);ctx.closePath();ctx.fill();ctx.restore();ctx.font='800 9px sans-serif';ctx.textAlign='center';ctx.fillStyle='#ffe1a0';ctx.fillText(boss.name,x,y+22)}}if(game.player.hp/game.player.maxHp<.28){ctx.save();ctx.globalAlpha=clamp(.77+Math.sin(performance.now()*.009)*.23,0,1);ctx.fillStyle=dangerVignette();ctx.fillRect(0,0,W,H);ctx.restore()}}

  function render(interpolation=simulation.alpha()) {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0); glowLeft = GLOW_BUDGET[renderQuality] ?? 64; drawGround(); if (!game) return;renderCamera={x:lerp(game.camera.prevX??game.camera.x,game.camera.x,interpolation),y:lerp(game.camera.prevY??game.camera.y,game.camera.y,interpolation)};game.renderAudit=[]; drawDecor();drawObstacles(); drawArena();
    const shakeOffset=resolveShakeOffset({enabled:meta.settings.shake,magnitude:game.shake,random:visualRandom}),sx=shakeOffset.x,sy=shakeOffset.y;game.lastRenderShakeOffset={x:sx,y:sy};ctx.save(); ctx.translate(sx, sy);
    drawHazardsAndZones(); drawEncounters(); drawPickups(); for (const e of game.enemies) drawEnemy(e); drawAllies(); drawProjectiles(); drawPlayer(); drawAttacksAndParticles(); ctx.restore();drawThreatIndicators();
    if (game.flash > 0) { ctx.fillStyle = `rgba(255,239,200,${Math.min(.34, game.flash * .55)})`; ctx.fillRect(0, 0, W, H); }
    ctx.fillStyle = vignette; ctx.fillRect(0, 0, W, H);renderCamera=null;
  }

  function loop(now) { const frameMs=now-last;recordFrame(frameMs,now);last=now;if(!testFrozen){simulation.advance(frameMs/1000||0);render(simulation.alpha())}requestAnimationFrame(loop); }
  requestAnimationFrame(loop);

  function endRun(victory) {
    if (!game || game.ended) return;cancelPendingChoiceTimers();game.choiceQueue.length=0;game.ended = true; mode = 'end';audio.stop();void richAudio.stop();
    const curseBonus=game.curses.reduce((n,k)=>n+(CURSES[k]?.reward||0),0),reward = Math.max(1,Math.floor((Math.floor(game.kills / 38) + Math.floor(game.level / 2) + game.bossKills * 6 + (victory ? 14 : 0))*game.diff.reward*(1+curseBonus)*(1+meta.renown*.08)));let grantedReward=reward;
    if(victory){const settlement=settleVictoryOnce({victorySettled:game.victorySettled,victoryReward:game.victoryReward,victories:meta.victories,laurels:meta.laurels},{reward});grantedReward=settlement.settled?reward:0;game.victorySettled=settlement.state.victorySettled;game.victoryReward=settlement.state.victoryReward;meta.victories=settlement.state.victories;meta.laurels=settlement.state.laurels;game.victoryMode=true}else meta.laurels+=reward;
    meta.bestKills = Math.max(meta.bestKills, game.kills); meta.bestLevel = Math.max(meta.bestLevel, game.level);meta.runTimes={missionTime:game.missionTime,combatTime:game.combatTime,bossCombatTime:game.bossCombatTime};meta.lastVictory=victory?{utcDate:new Date().toISOString().slice(0,10),hero:game.hero,difficulty:game.difficulty,...meta.runTimes}:meta.lastVictory;if(game.daily){const day=new Date().toISOString().slice(0,10);meta.dailyScores[day]=Math.max(meta.dailyScores[day]||0,scoreDailyRun(game))}saveMeta();
    $('#endKicker').textContent = victory ? '트로이 성벽 아래의 승리' : '원정 기록'; $('#endTitle').textContent = victory ? '헥토르를 꺾었습니다' : '전열이 무너졌습니다';
    const stats=Object.entries(game.damageStats.by).sort((a,b)=>b[1]-a[1]),top=stats[0]?.[1]||1,rows=stats.slice(0,6).map(([k,v])=>`<div class="reportRow"><span>${k}</span><span class="reportBar"><i style="width:${v/top*100}%"></i></span><b>${Math.round(v)}</b></div>`).join('');$('#endCopy').innerHTML = `${victory?'헥토르를 꺾고 끝없는 전장을 열었습니다.':'패배는 다음 원정을 위한 기록을 남겼습니다.'}<div class="battleReport"><b>전투 분석 · 패링 ${game.player.parries}회 · 궁극기 ${game.player.ultimateUses}회 · 보스 ${game.bossKills}명</b>${rows}</div>`;
    $('#resultMissionTime').textContent = fmtTime(game.missionTime);$('#resultCombatTime').textContent=fmtTime(game.combatTime);$('#resultBossTime').textContent=fmtTime(game.bossCombatTime); $('#resultKills').textContent = game.kills; $('#resultLevel').textContent = game.level; $('#resultLaurels').textContent = `+${grantedReward}`;$('#endlessBtn').classList.toggle('hidden',!victory);
    dom.end.classList.remove('hidden');
  }

  function continueEndless(){if(!game||!game.victorySettled||!game.victoryMode)return false;cancelPendingChoiceTimers();game.ended=false;game.victoryMode=false;game.surge=35;game.endlessGrace=.6;game.player.invuln=Math.max(game.player.invuln,.9);mode='play';dom.end.classList.add('hidden');dom.hud.classList.remove('hidden');audio.init();void richAudio.resume();richAudio.startBattlefield('city');banner('신화의 평원','승리 보상은 유지됩니다. 끝없는 원군을 버티십시오.');return true}

  function togglePause() {
    if (!game) return;
    if (mode === 'play') { mode = 'pause'; audio.pause(); void richAudio.pause(); dom.pause.classList.remove('hidden'); }
    else if (mode === 'pause') { mode = 'play'; audio.init(); void richAudio.resume(); dom.pause.classList.add('hidden'); }
  }

  addEventListener('keydown', e => {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault(); keys.add(e.code);
    if (e.code === 'Space'){doDash();if(TEST_MODE&&!e.isTrusted&&game?.rich.defense.action==='dodge'){testFrozen=true;render()}}if(e.code==='KeyQ')useUltimate();if(e.code==='ShiftLeft'||e.code==='ShiftRight')doParry(); if (e.code === 'Escape' && mode !== 'choice') togglePause();
    if (mode === 'choice' && ['Digit1', 'Digit2', 'Digit3'].includes(e.code)) { if(TEST_MODE)game.choiceReadyAt=0;const b = dom.choiceCards.children[Number(e.code.slice(-1)) - 1]; if (b) b.click(); }
  });
  addEventListener('keyup', e => keys.delete(e.code)); addEventListener('blur', () => { if (mode === 'play') togglePause(); });
  canvas.addEventListener('contextmenu',e=>{e.preventDefault();doParry()});
  canvas.addEventListener('pointermove',e=>{if(!game||mode!=='play')return;const r=canvas.getBoundingClientRect(),x=e.clientX-r.left-r.width/2,y=e.clientY-r.top-r.height/2;if(Math.hypot(x,y)>36){game.player.aim=Math.atan2(y,x);game.player.manualAim=.18}});
  $('#startBtn').onclick = startRun; $('#pauseBtn').onclick = togglePause; $('#resumeBtn').onclick = togglePause; $('#restartBtn').onclick = startRun; $('#pauseRestartBtn').onclick = startRun; $('#quitBtn').onclick = returnMenu; $('#endQuitBtn').onclick = returnMenu;$('#endlessBtn').onclick=continueEndless;

  function runtimeAudit(){
    const failures=[];if(!game)return{ok:true,failures,mode,scope:'menu'};
    for(const key of ['enemies','projectiles','pickups','particles','hazards','attacks','encounters','allies'])for(const [i,e] of (game[key]||[]).entries())if(e&&(('x'in e&&!Number.isFinite(e.x))||('y'in e&&!Number.isFinite(e.y))))failures.push(`${key}[${i}] 좌표 오류`);
    failures.push(...auditEntitySnapshot({playerRenderEntities:1,followerEntities:game.allies.length,enemies:game.enemies.length,projectiles:game.projectiles.length,particles:game.particles.length}));if(!Number.isFinite(game.player.hp))failures.push('플레이어 체력 오류');
    failures.push(...auditHighThreatBudget(activeHighThreats(),{bossReady:bossHighIntentPending()}));
    const enemyEntries=manifestEntries(assetManifests.enemies),obstacleEntries=manifestEntries(assetManifests.obstacles);for(const key of Object.keys(ENEMY_DEF))if(!enemyEntries[key])failures.push(`적 manifest 키 누락: ${key}`);for(const key of ['column','barrier','rock','fire'])if(!obstacleEntries[key])failures.push(`장애물 manifest 키 누락: ${key}`);
    return{ok:failures.length===0,failures,mode,scope:'run'};
  }
  const snapshot=()=>game?{mode,time:game.time,combatTime:game.combatTime,bossClockPaused:!!game.boss,level:game.level,xp:game.xp,need:game.xpNeed,hp:game.player.hp,enemies:game.enemies.length,enemyTypes:Object.fromEntries(Object.entries(game.enemies.filter(e=>!e.dead).reduce((counts,e)=>(counts[e.type]=(counts[e.type]||0)+1,counts),{})).sort()),projectiles:game.projectiles.length,pickups:game.pickups.length,particles:game.particles.length,playerRenderEntities:1,followerEntities:game.allies.length,defense:{...game.rich.ports.defense.snapshot(game.rich.defense),telemetry:{...game.player.defense.telemetry},supportSeconds:Number(game.buffs.myrmidon.toFixed(2))},quality:renderQuality,dpr:Number(DPR.toFixed(2)),canvasPixels:canvas.width*canvas.height,performance:{avgMs:Number(perfStats.avgMs.toFixed(2)),p99Ms:Number(perfStats.p99Ms.toFixed(2)),onePercentLow:Number(perfStats.onePercentLow.toFixed(1)),downgrades:perfStats.downgrades,samples:perfStats.frames.length},hero:game.hero,difficulty:game.difficulty,stage:game.stageIndex,dps:Math.round(game.damageStats.total/Math.max(1,game.combatTime)),choices:game.currentChoices.map(x=>({key:x.key,rarity:cardRarity(x)})),weapons:Object.fromEntries(Object.entries(game.weapons).map(([k,w])=>[k,{path:w.path||null,power:Number((w.power||1).toFixed(3)),level:weaponLevel(w)}])),relics:Object.entries(game.relics),fusions:Object.keys(game.fusions),encounters:game.encounters.map(e=>e.type),allies:game.allies.length,obstacles:game.obstacles.filter(o=>!o.dead).map(o=>({type:o.type,solid:!!o.solid,hp:Number.isFinite(o.hp)?Math.round(o.hp):null,maxHp:Number.isFinite(o.maxHp)?Math.round(o.maxHp):null})),shieldmen:game.enemies.filter(e=>!e.dead&&e.type==='shieldman').map(e=>({guardTurnDelay:Number(e.guardTurnDelay.toFixed(2)),guardFacing:Number(e.guardFacing.toFixed(2)),knockImmune:true,rangedReduction:.75})).slice(0,4),arena:game.arena?.kind||null,arenaRadius:Math.round(game.arena?.r||0),arenaEntryEnemies:game.arena?.entryEnemies||0,arenaActiveNormals:game.arena?.activeNormals||0,bossEscorts:game.enemies.filter(e=>!e.dead&&e.bossEscort).map(e=>e.type),boss:game.boss?{type:game.boss.type,hp:Math.round(game.boss.hp),maxHp:Math.round(game.boss.maxHp),phase:game.boss.bossPhase,patternCd:Number((game.boss.bossPatternCd||0).toFixed(2)),signature:game.boss.richBoss?.log?.at(-1)?.id||null,hiddenTicks:game.boss.hiddenTicks||0,invulnerableTicks:game.boss.invulnerableTicks||0,guardBreakTicks:game.boss.guardBreakTicks||0,chargeWindup:Number((game.boss.chargeWindup||0).toFixed(3)),chargeTicks:game.boss.chargeTicks||0,chargePhase:Number((game.boss.phase||0).toFixed(3)),retreatTicks:game.boss.retreatTicks||0,knockImmune:true}:null}:{mode,menuStep,quality:renderQuality,dpr:Number(DPR.toFixed(2)),canvasPixels:canvas.width*canvas.height,performance:{avgMs:Number(perfStats.avgMs.toFixed(2)),p99Ms:Number(perfStats.p99Ms.toFixed(2)),onePercentLow:Number(perfStats.onePercentLow.toFixed(1)),downgrades:perfStats.downgrades,samples:perfStats.frames.length},schemaVersion:meta.schemaVersion};
  const publicSnapshot=()=>{const base=snapshot();if(!game)return base;return{...base,fixedTick:game.rich.fixedTick,kills:game.kills,missionTime:game.missionTime,combatTime:game.combatTime,bossCombatTime:game.bossCombatTime,bossKills:game.bossKills,drachma:game.coins,maxHp:game.player.maxHp,victorySettled:game.victorySettled,victoryReward:game.victoryReward,dailySeed:game.dailySeed,runSeed:game.runSeed,savedRunSeed:meta.lastRunSeed,dailyRule:game.dailyRule,dailyScore:scoreDailyRun(game),dailyMultipliers:{enemyHp:applyDailyRule(game.dailyRule,'enemyHp',1),hostileProjectileSpeed:applyDailyRule(game.dailyRule,'hostileProjectileSpeed',1),eliteWeight:applyDailyRule(game.dailyRule,'eliteWeight',1)},gameRngState:game.gameRng.state(),simulationTicks:simulation.ticks(),renderInterpolation:simulation.alpha(),audio:richAudio.snapshot(),intents:game.rich.scheduler.activeSnapshot(),cues:game.rich.cueHistory.map(cue=>({...cue})),combatJournal:game.rich.combatJournal.slice(-500).map(entry=>({...entry})),objectiveHistory:game.rich.objectiveHistory.map(entry=>({...entry})),wallet:{drachma:game.rich.wallet.drachma,safeGateTokens:[...game.rich.wallet.safeGateTokens]},objective:{...game.rich.objective,position:{...game.rich.objective.position}},shop:game.rich.shop?game.rich.ports.shop.snapshot(game.rich.shop):null,campaign:{mode:game.rich.campaign.mode,stage:{...game.rich.campaign.stage},dueBossEvents:[...game.rich.campaign.dueBossEvents]},eventCounts:game.eventJournal.counts(),eventLog:game.eventJournal.events().slice(0,500)}};
  window.__TROY_V15__={start:startRun,menu:setMenuStep,snapshot:publicSnapshot,audit:runtimeAudit,continueEndless,boot:window.__TROY_BOOT__};window.__TROY_V14__=window.__TROY_V15__;window.__TROY_BOOT__.status='ready';
  if(TEST_MODE){
    const seed=value=>{const valid=typeof value==='string'?value.length>0:Number.isFinite(value);if(!valid)return false;testRunSeedOverride=value;return true};
    const allowedControls=new Set(['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','ShiftLeft','ShiftRight','Space','KeyQ','Escape']);
    const input=({type='tap',control}={})=>{if(!['press','release','tap'].includes(type)||!allowedControls.has(control))return false;const fire=kind=>dispatchEvent(new KeyboardEvent(kind,{code:control,key:control,bubbles:true}));if(type==='press')fire('keydown');else if(type==='release')fire('keyup');else{fire('keydown');fire('keyup')}return true};
    const verificationSnapshot=()=>{const state=publicSnapshot(),boss=game?.boss;if(state?.boss&&boss){state.boss.mechanicStage=boss.bossMechanic?.stage||null;state.boss.mechanicRemaining=boss.bossMechanic?.remaining||0;state.boss.corridorGap=boss.bossMechanic?.corridor?.gap||0;state.boss.corridorCompression=boss.bossMechanic?.corridor?.compression||0;state.boss.redirectTick=boss.bossMechanic?.redirectTick??null}state.lastRenderShakeOffset=Object.freeze({...(game?.lastRenderShakeOffset||{x:0,y:0})});return state};
    const advanceFixedTicks=count=>{if(!Number.isInteger(count)||count<0||count>72000)return null;testFrozen=true;for(let tick=0;tick<count;tick++)update(1/60);updateHud();return verificationSnapshot()};
    window.__TROY_RICH_TEST__=Object.freeze({seed,input,advanceFixedTicks,snapshot:verificationSnapshot});
  }
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) addEventListener('load', () => navigator.serviceWorker.register('service-worker.js').catch(() => {}));
})();
