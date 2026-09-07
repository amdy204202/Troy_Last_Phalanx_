// Original 12-minute scores and layered CC0 Kenney material impacts.
export const AUDIO_PATHS=Object.freeze({
 "music_field_base": "assets/v19/audio/score-field.ogg",
 "music_boss_base": "assets/v19/audio/score-boss.ogg",
 "music_menu": "assets/v19/audio/score-menu.ogg",
 "v19_spear_0": "assets/v19/audio/spear-0.ogg",
 "v19_spear_1": "assets/v19/audio/spear-1.ogg",
 "v19_spear_2": "assets/v19/audio/spear-2.ogg",
 "v19_sword_0": "assets/v19/audio/sword-0.ogg",
 "v19_sword_1": "assets/v19/audio/sword-1.ogg",
 "v19_sword_2": "assets/v19/audio/sword-2.ogg",
 "v19_javelin_0": "assets/v19/audio/javelin-0.ogg",
 "v19_javelin_1": "assets/v19/audio/javelin-1.ogg",
 "v19_javelin_2": "assets/v19/audio/javelin-2.ogg",
 "v19_shield_0": "assets/v19/audio/shield-0.ogg",
 "v19_shield_1": "assets/v19/audio/shield-1.ogg",
 "v19_shield_2": "assets/v19/audio/shield-2.ogg",
 "v19_discus_0": "assets/v19/audio/discus-0.ogg",
 "v19_discus_1": "assets/v19/audio/discus-1.ogg",
 "v19_discus_2": "assets/v19/audio/discus-2.ogg",
 "v19_flail_0": "assets/v19/audio/flail-0.ogg",
 "v19_flail_1": "assets/v19/audio/flail-1.ogg",
 "v19_flail_2": "assets/v19/audio/flail-2.ogg",
 "v19_ram_0": "assets/v19/audio/ram-0.ogg",
 "v19_ram_1": "assets/v19/audio/ram-1.ogg",
 "v19_ram_2": "assets/v19/audio/ram-2.ogg",
 "v19_caltrops_0": "assets/v19/audio/caltrops-0.ogg",
 "v19_caltrops_1": "assets/v19/audio/caltrops-1.ogg",
 "v19_caltrops_2": "assets/v19/audio/caltrops-2.ogg",
 "v19_armor_0": "assets/v19/audio/armor-0.ogg",
 "v19_armor_1": "assets/v19/audio/armor-1.ogg",
 "v19_armor_2": "assets/v19/audio/armor-2.ogg",
 "v19_parrySuccess_0": "assets/v19/audio/parrySuccess-0.ogg",
 "v19_parrySuccess_1": "assets/v19/audio/parrySuccess-1.ogg",
 "v19_parrySuccess_2": "assets/v19/audio/parrySuccess-2.ogg",
 "v19_parryReady_0": "assets/v19/audio/parryReady-0.ogg",
 "v19_parryReady_1": "assets/v19/audio/parryReady-1.ogg",
 "v19_parryReady_2": "assets/v19/audio/parryReady-2.ogg",
 "v19_hit_0": "assets/v19/audio/hit-0.ogg",
 "v19_hit_1": "assets/v19/audio/hit-1.ogg",
 "v19_hit_2": "assets/v19/audio/hit-2.ogg",
 "v19_hurt_0": "assets/v19/audio/hurt-0.ogg",
 "v19_hurt_1": "assets/v19/audio/hurt-1.ogg",
 "v19_hurt_2": "assets/v19/audio/hurt-2.ogg",
 "v19_bossWindup_0": "assets/v19/audio/bossWindup-0.ogg",
 "v19_bossWindup_1": "assets/v19/audio/bossWindup-1.ogg",
 "v19_bossWindup_2": "assets/v19/audio/bossWindup-2.ogg",
 "v19_firepot": "assets/v19/audio/firepot.ogg",
 "v19_bow": "assets/v19/audio/bow.ogg",
 "v19_sling": "assets/v19/audio/sling.ogg",
 "v19_thunder": "assets/v19/audio/thunder.ogg",
 "v19_poison": "assets/v19/audio/poison.ogg",
 "v19_boss": "assets/v19/audio/boss.ogg",
 "v19_dodge": "assets/v19/audio/dodge.ogg",
 "v19_ultimate": "assets/v19/audio/ultimate.ogg",
 "v19_heal": "assets/v19/audio/heal.ogg",
 "v19_warning": "assets/v19/audio/warning.ogg",
 "v19_lowHealth": "assets/v19/audio/lowHealth.ogg",
 "v19_ready": "assets/v19/audio/ready.ogg",
 "v19_bossPhase": "assets/v19/audio/bossPhase.ogg",
 "v19_victory": "assets/v19/audio/victory.ogg",
 "v19_defeat": "assets/v19/audio/defeat.ogg",
 "v19_eliteDown": "assets/v19/audio/eliteDown.ogg",
 "v19_uiConfirm": "assets/v19/audio/uiConfirm.ogg",
 "v19_land": "assets/v19/audio/land.ogg",
 "v19_enemyBow": "assets/v19/audio/enemyBow.ogg",
 "v19_enemySlam": "assets/v19/audio/enemySlam.ogg",
 "v19_enemyMine": "assets/v19/audio/enemyMine.ogg",
 "v19_ultimateHoplite": "assets/v19/audio/ultimateHoplite.ogg",
 "v19_ultimateSwordsman": "assets/v19/audio/ultimateSwordsman.ogg",
 "v19_ultimateArcher": "assets/v19/audio/ultimateArcher.ogg",
 "v19_stormGather": "assets/v19/audio/stormGather.ogg"
});
export const AUDIO_CUES=Object.freeze({
 "spear": {
  "id": "v19_spear",
  "gain": 0.46,
  "priority": 1,
  "cooldownMs": 95,
  "rate": 1,
  "variants": [
   "v19_spear_0",
   "v19_spear_1",
   "v19_spear_2"
  ]
 },
 "sword": {
  "id": "v19_sword",
  "gain": 0.46,
  "priority": 1,
  "cooldownMs": 95,
  "rate": 1,
  "variants": [
   "v19_sword_0",
   "v19_sword_1",
   "v19_sword_2"
  ]
 },
 "javelin": {
  "id": "v19_javelin",
  "gain": 0.46,
  "priority": 1,
  "cooldownMs": 95,
  "variants": [
   "v19_javelin_0",
   "v19_javelin_1",
   "v19_javelin_2"
  ],
  "rate": 1
 },
 "shield": {
  "id": "v19_shield",
  "gain": 0.46,
  "priority": 1,
  "cooldownMs": 95,
  "rate": 1,
  "variants": [
   "v19_shield_0",
   "v19_shield_1",
   "v19_shield_2"
  ]
 },
 "discus": {
  "id": "v19_discus",
  "gain": 0.46,
  "priority": 1,
  "cooldownMs": 95,
  "rate": 1,
  "variants": [
   "v19_discus_0",
   "v19_discus_1",
   "v19_discus_2"
  ]
 },
 "firepot": {
  "id": "v19_firepot",
  "gain": 0.38,
  "priority": 1,
  "cooldownMs": 130,
  "rate": 1
 },
 "sling": {
  "id": "v19_sling",
  "gain": 0.3,
  "priority": 1,
  "cooldownMs": 130,
  "rate": 1
 },
 "bow": {
  "id": "v19_bow",
  "gain": 0.38,
  "priority": 1,
  "cooldownMs": 130,
  "rate": 1
 },
 "flail": {
  "id": "v19_flail",
  "gain": 0.46,
  "priority": 1,
  "cooldownMs": 95,
  "rate": 1,
  "variants": [
   "v19_flail_0",
   "v19_flail_1",
   "v19_flail_2"
  ]
 },
 "thunder": {
  "id": "v19_thunder",
  "gain": 0.38,
  "priority": 1,
  "cooldownMs": 130,
  "rate": 1
 },
 "caltrops": {
  "id": "v19_caltrops",
  "gain": 0.46,
  "priority": 1,
  "cooldownMs": 95,
  "rate": 1,
  "variants": [
   "v19_caltrops_0",
   "v19_caltrops_1",
   "v19_caltrops_2"
  ]
 },
 "ram": {
  "id": "v19_ram",
  "gain": 0.46,
  "priority": 1,
  "cooldownMs": 95,
  "rate": 1,
  "variants": [
   "v19_ram_0",
   "v19_ram_1",
   "v19_ram_2"
  ]
 },
 "parryReady": {
  "id": "v19_parryReady",
  "gain": 0.46,
  "priority": 3,
  "cooldownMs": 95,
  "rate": 1,
  "variants": [
   "v19_parryReady_0",
   "v19_parryReady_1",
   "v19_parryReady_2"
  ]
 },
 "parrySuccess": {
  "id": "v19_parrySuccess",
  "gain": 0.78,
  "priority": 5,
  "cooldownMs": 95,
  "duck": true,
  "rate": 1,
  "variants": [
   "v19_parrySuccess_0",
   "v19_parrySuccess_1",
   "v19_parrySuccess_2"
  ]
 },
 "poison": {
  "id": "v19_poison",
  "gain": 0.38,
  "priority": 1,
  "cooldownMs": 130,
  "rate": 1
 },
 "boss": {
  "id": "v19_boss",
  "gain": 0.65,
  "priority": 5,
  "cooldownMs": 130,
  "duck": true,
  "rate": 1
 },
 "dodge": {
  "id": "v19_dodge",
  "gain": 0.4,
  "priority": 3,
  "cooldownMs": 130,
  "rate": 1
 },
 "ultimate": {
  "id": "v19_ultimate",
  "gain": 0.68,
  "priority": 5,
  "cooldownMs": 130,
  "duck": true,
  "rate": 1
 },
 "hit": {
  "id": "v19_hit",
  "gain": 0.3,
  "priority": 1,
  "cooldownMs": 95,
  "rate": 1,
  "variants": [
   "v19_hit_0",
   "v19_hit_1",
   "v19_hit_2"
  ]
 },
 "armor": {
  "id": "v19_armor",
  "gain": 0.46,
  "priority": 1,
  "cooldownMs": 95,
  "rate": 1,
  "variants": [
   "v19_armor_0",
   "v19_armor_1",
   "v19_armor_2"
  ]
 },
 "hurt": {
  "id": "v19_hurt",
  "gain": 0.46,
  "priority": 4,
  "cooldownMs": 95,
  "rate": 1,
  "variants": [
   "v19_hurt_0",
   "v19_hurt_1",
   "v19_hurt_2"
  ]
 },
 "heal": {
  "id": "v19_heal",
  "gain": 0.45,
  "priority": 3,
  "cooldownMs": 400,
  "rate": 1
 },
 "warning": {
  "id": "v19_warning",
  "gain": 0.48,
  "priority": 4,
  "cooldownMs": 1200,
  "duck": true,
  "rate": 1
 },
 "lowHealth": {
  "id": "v19_lowHealth",
  "gain": 0.42,
  "priority": 4,
  "cooldownMs": 6000,
  "rate": 1
 },
 "ready": {
  "id": "v19_ready",
  "gain": 0.34,
  "priority": 3,
  "cooldownMs": 800,
  "rate": 1
 },
 "bossPhase": {
  "id": "v19_bossPhase",
  "gain": 0.6,
  "priority": 4,
  "cooldownMs": 1500,
  "duck": true,
  "rate": 1
 },
 "victory": {
  "id": "v19_victory",
  "gain": 0.65,
  "priority": 5,
  "cooldownMs": 1600,
  "duck": true,
  "rate": 1
 },
 "defeat": {
  "id": "v19_defeat",
  "gain": 0.6,
  "priority": 5,
  "cooldownMs": 1600,
  "duck": true,
  "rate": 1
 },
 "eliteDown": {
  "id": "v19_eliteDown",
  "gain": 0.38,
  "priority": 2,
  "cooldownMs": 400,
  "rate": 1
 },
 "uiConfirm": {
  "id": "v19_uiConfirm",
  "gain": 0.22,
  "priority": 2,
  "cooldownMs": 110,
  "rate": 1
 },
 "land": {
  "id": "v19_land",
  "gain": 0.45,
  "priority": 0,
  "cooldownMs": 300,
  "rate": 1
 },
 "enemyBow": {
  "id": "v19_enemyBow",
  "gain": 0.28,
  "priority": 2,
  "cooldownMs": 200,
  "rate": 1
 },
 "enemySlam": {
  "id": "v19_enemySlam",
  "gain": 0.44,
  "priority": 3,
  "cooldownMs": 250,
  "rate": 1
 },
 "enemyMine": {
  "id": "v19_enemyMine",
  "gain": 0.3,
  "priority": 2,
  "cooldownMs": 350,
  "rate": 1
 },
 "ultimateHoplite": {
  "id": "v19_ultimateHoplite",
  "gain": 0.68,
  "priority": 5,
  "cooldownMs": 300,
  "duck": true,
  "rate": 1
 },
 "ultimateSwordsman": {
  "id": "v19_ultimateSwordsman",
  "gain": 0.68,
  "priority": 5,
  "cooldownMs": 300,
  "duck": true,
  "rate": 1
 },
 "ultimateArcher": {
  "id": "v19_ultimateArcher",
  "gain": 0.68,
  "priority": 5,
  "cooldownMs": 300,
  "duck": true,
  "rate": 1
 },
 "stormGather": {
  "id": "v19_stormGather",
  "gain": 0.8,
  "priority": 5,
  "cooldownMs": 300,
  "duck": true,
  "rate": 1
 },
 "bossWindup": {
  "id": "v19_bossWindup",
  "variants": [
   "v19_bossWindup_0",
   "v19_bossWindup_1",
   "v19_bossWindup_2"
  ],
  "gain": 0.34,
  "rate": 1,
  "priority": 4,
  "cooldownMs": 100
 }
});
