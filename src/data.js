// ---------------------------------------------------------------------------
// Static game data. Everything here is pure data: the simulation (world.js)
// and the renderer (render.js) both import it, so host and clients agree on
// every number without sending it over the wire.
// ---------------------------------------------------------------------------

export const ARENA = { w: 1600, h: 900 };

export const MAX_WAVE = 20;
export const MAX_WEAPONS = 6;

// Every stat a player can have. Percent-based unless noted.
export const BASE_STATS = {
  maxHp: 12,      // flat
  hpRegen: 0,     // hp per second
  lifesteal: 0,   // % of damage dealt healed (chance-based)
  armor: 0,       // flat, feeds a diminishing-returns curve
  dodge: 0,       // % chance to ignore a hit, capped
  speed: 0,       // % move speed
  damage: 0,      // % all damage
  melee: 0,       // flat, scaled per-weapon
  ranged: 0,      // flat, scaled per-weapon
  elem: 0,        // flat, scaled per-weapon
  atkSpeed: 0,    // % attack speed
  crit: 5,        // % crit chance
  critMult: 200,  // % damage on crit
  range: 0,       // % weapon range
  luck: 0,        // % better shop / drop rolls
  harvest: 0,     // % extra materials
  pickup: 0,      // % pickup radius
};

export const STAT_LABEL = {
  maxHp: 'Max HP', hpRegen: 'HP Regen', lifesteal: 'Lifesteal', armor: 'Armor',
  dodge: 'Dodge', speed: 'Speed', damage: 'Damage', melee: 'Melee Damage',
  ranged: 'Ranged Damage', elem: 'Elemental Damage', atkSpeed: 'Attack Speed',
  crit: 'Crit Chance', critMult: 'Crit Damage', range: 'Range', luck: 'Luck',
  harvest: 'Harvesting', pickup: 'Pickup Range',
};

// Which stats read as percentages in the UI.
export const STAT_PCT = new Set(['lifesteal', 'dodge', 'speed', 'damage',
  'atkSpeed', 'crit', 'critMult', 'range', 'luck', 'harvest', 'pickup']);

// --------------------------------------------------------------------------
// Characters
// --------------------------------------------------------------------------
export const CHARACTERS = [
  { id: 0, name: 'Wanderer',  color: '#7ec8ff', weapon: 'pistol',
    desc: 'Nothing special. Everything works.',
    mods: { damage: 5, maxHp: 2, speed: 5 } },
  { id: 1, name: 'Brawler',   color: '#ff8a5c', weapon: 'knife',
    desc: 'Melee damage way up, guns feel wrong in your hands.',
    mods: { melee: 6, maxHp: 5, ranged: -8, speed: -5 } },
  { id: 2, name: 'Ranger',    color: '#8dffb0', weapon: 'smg',
    desc: 'Reach out and touch them. Fragile though.',
    mods: { ranged: 5, range: 25, atkSpeed: 10, maxHp: -3 } },
  { id: 3, name: 'Bulwark',   color: '#c9a86a', weapon: 'hammer',
    desc: 'Slow, armoured, extremely hard to remove.',
    mods: { armor: 8, maxHp: 15, speed: -18, atkSpeed: -10 } },
  { id: 4, name: 'Streaker',  color: '#ffe66d', weapon: 'knife',
    desc: 'Blindingly fast, made of paper.',
    mods: { speed: 45, dodge: 15, maxHp: -3 } },
  { id: 5, name: 'Gambler',   color: '#d59bff', weapon: 'shotgun',
    desc: 'Crits, loot, and a great deal of hope.',
    mods: { luck: 50, crit: 12, harvest: 25, maxHp: -3 } },
  { id: 6, name: 'Pyro',      color: '#ff6b6b', weapon: 'flamer',
    desc: 'Elemental damage specialist. Burns the front row.',
    mods: { elem: 8, atkSpeed: 15, maxHp: -2, armor: -2 } },
  { id: 7, name: 'Leech',     color: '#9be7d8', weapon: 'sword',
    desc: 'Heals off everything it hits, hits softly.',
    mods: { lifesteal: 12, maxHp: -4, damage: -10, hpRegen: 1 } },
];

// --------------------------------------------------------------------------
// Weapons
//   cls    : 'melee' swings an arc, 'ranged' fires projectiles
//   dmg    : base damage before stats
//   cd     : seconds between attacks at 0% attack speed
//   range  : targeting + projectile reach in world units
//   scale  : how much melee/ranged/elem stats add as flat damage
// --------------------------------------------------------------------------
export const WEAPONS = {
  knife:    { name: 'Knife',        cls: 'melee',  tier: 1, price: 12, dmg: 7,  cd: 0.45, range: 115, arc: 1.3, scale: { m: 1.0, r: 0, e: 0 }, crit: 5,  color: '#dfe9f5' },
  sword:    { name: 'Sword',        cls: 'melee',  tier: 2, price: 26, dmg: 13, cd: 0.85, range: 145, arc: 2.1, scale: { m: 1.2, r: 0, e: 0 }, color: '#b8c6d9' },
  spear:    { name: 'Spear',        cls: 'melee',  tier: 2, price: 24, dmg: 15, cd: 0.7,  range: 210, arc: 0.55, scale: { m: 1.1, r: 0, e: 0 }, color: '#cbb88f' },
  hammer:   { name: 'Hammer',       cls: 'melee',  tier: 2, price: 28, dmg: 24, cd: 1.35, range: 135, arc: 2.6, knock: 420, scale: { m: 1.5, r: 0, e: 0 }, color: '#a08b6b' },
  scythe:   { name: 'Scythe',       cls: 'melee',  tier: 3, price: 46, dmg: 17, cd: 0.75, range: 175, arc: 3.4, scale: { m: 1.3, r: 0, e: 0.3 }, lifesteal: 8, color: '#a6f0c6' },
  pistol:   { name: 'Pistol',       cls: 'ranged', tier: 1, price: 12, dmg: 8,  cd: 0.5,  range: 500, spd: 760, scale: { m: 0, r: 1.0, e: 0 }, color: '#ffe9a8' },
  smg:      { name: 'SMG',          cls: 'ranged', tier: 1, price: 16, dmg: 4,  cd: 0.15, range: 420, spd: 800, spread: 0.13, scale: { m: 0, r: 0.5, e: 0 }, color: '#ffd166' },
  shotgun:  { name: 'Shotgun',      cls: 'ranged', tier: 2, price: 30, dmg: 5,  cd: 0.9,  range: 340, spd: 680, count: 6, spread: 0.42, scale: { m: 0, r: 0.6, e: 0 }, color: '#ffb37a' },
  shuriken: { name: 'Shuriken',     cls: 'ranged', tier: 2, price: 26, dmg: 8,  cd: 0.5,  range: 460, spd: 620, pierce: 2, scale: { m: 0.4, r: 0.6, e: 0 }, color: '#c8e6ff' },
  wand:     { name: 'Magic Wand',   cls: 'ranged', tier: 2, price: 32, dmg: 11, cd: 0.7,  range: 540, spd: 430, homing: 4.5, scale: { m: 0, r: 0.3, e: 0.9 }, color: '#c39bff' },
  flamer:   { name: 'Flamethrower', cls: 'ranged', tier: 2, price: 34, dmg: 3,  cd: 0.085, range: 230, spd: 330, life: 0.7, pierce: 99, scale: { m: 0, r: 0.1, e: 0.5 }, color: '#ff7a45' },
  laser:    { name: 'Laser Rifle',  cls: 'ranged', tier: 3, price: 48, dmg: 9,  cd: 0.38, range: 620, spd: 1250, pierce: 5, scale: { m: 0, r: 0.5, e: 0.8 }, color: '#66f0ff' },
  sniper:   { name: 'Sniper',       cls: 'ranged', tier: 3, price: 52, dmg: 32, cd: 1.55, range: 950, spd: 1600, pierce: 3, crit: 15, scale: { m: 0, r: 1.7, e: 0 }, color: '#a8ffd0' },
  rocket:   { name: 'Rocket Tube',  cls: 'ranged', tier: 3, price: 54, dmg: 26, cd: 1.7,  range: 620, spd: 470, aoe: 115, scale: { m: 0, r: 1.0, e: 0.6 }, color: '#ff9f6b' },
  minigun:  { name: 'Minigun',      cls: 'ranged', tier: 4, price: 76, dmg: 6,  cd: 0.075, range: 450, spd: 880, spread: 0.2, scale: { m: 0, r: 0.4, e: 0 }, color: '#ffcf5c' },
  tesla:    { name: 'Tesla Coil',   cls: 'ranged', tier: 4, price: 80, dmg: 16, cd: 0.95, range: 430, chain: 4, scale: { m: 0, r: 0.2, e: 1.5 }, color: '#7fd7ff' },
};

export const WEAPON_IDS = Object.keys(WEAPONS);

// --------------------------------------------------------------------------
// Items (passive stat sticks bought in the shop)
// --------------------------------------------------------------------------
export const ITEMS = [
  { id: 'boots',     name: 'Running Shoes',   tier: 1, price: 14, mods: { speed: 8 } },
  { id: 'vest',      name: 'Padded Vest',     tier: 1, price: 15, mods: { armor: 2, speed: -2 } },
  { id: 'meal',      name: 'Hot Meal',        tier: 1, price: 13, mods: { maxHp: 4 } },
  { id: 'glove',     name: 'Weighted Glove',  tier: 1, price: 14, mods: { melee: 2 } },
  { id: 'scope',     name: 'Cheap Scope',     tier: 1, price: 14, mods: { ranged: 2 } },
  { id: 'ember',     name: 'Ember',           tier: 1, price: 14, mods: { elem: 2 } },
  { id: 'magnet',    name: 'Magnet',          tier: 1, price: 12, mods: { pickup: 30 } },
  { id: 'coffee',    name: 'Cold Brew',       tier: 1, price: 16, mods: { atkSpeed: 7, maxHp: -1 } },
  { id: 'charm',     name: 'Lucky Charm',     tier: 1, price: 15, mods: { luck: 15 } },
  { id: 'sickle',    name: 'Sickle',          tier: 1, price: 15, mods: { harvest: 18 } },

  { id: 'plate',     name: 'Steel Plate',     tier: 2, price: 30, mods: { armor: 4, maxHp: 4, speed: -4 } },
  { id: 'scarf',     name: 'Silk Scarf',      tier: 2, price: 28, mods: { dodge: 6, speed: 5 } },
  { id: 'whetstone', name: 'Whetstone',       tier: 2, price: 30, mods: { melee: 4, damage: 3 } },
  { id: 'laserdot',  name: 'Laser Dot',       tier: 2, price: 30, mods: { ranged: 4, crit: 3 } },
  { id: 'core',      name: 'Reactor Core',    tier: 2, price: 32, mods: { elem: 4, atkSpeed: 4 } },
  { id: 'bandage',   name: 'Field Bandage',   tier: 2, price: 28, mods: { hpRegen: 1.2 } },
  { id: 'fang',      name: 'Vampire Fang',    tier: 2, price: 32, mods: { lifesteal: 6, maxHp: -2 } },
  { id: 'barrel',    name: 'Long Barrel',     tier: 2, price: 29, mods: { range: 18 } },
  { id: 'dice',      name: 'Loaded Dice',     tier: 2, price: 31, mods: { crit: 7, luck: 12 } },
  { id: 'battery',   name: 'Overclock Cell',  tier: 2, price: 33, mods: { atkSpeed: 12, armor: -2 } },

  { id: 'engine',    name: 'Turbo Engine',    tier: 3, price: 54, mods: { speed: 18, dodge: 5, maxHp: -4 } },
  { id: 'aegis',     name: 'Aegis',           tier: 3, price: 58, mods: { armor: 8, maxHp: 10, speed: -8 } },
  { id: 'gauntlet',  name: 'War Gauntlet',    tier: 3, price: 58, mods: { melee: 8, damage: 8, ranged: -4 } },
  { id: 'railkit',   name: 'Rail Kit',        tier: 3, price: 58, mods: { ranged: 8, range: 15, atkSpeed: -5 } },
  { id: 'prism',     name: 'Storm Prism',     tier: 3, price: 60, mods: { elem: 8, crit: 5 } },
  { id: 'heart',     name: 'Second Heart',    tier: 3, price: 56, mods: { maxHp: 14, hpRegen: 1.5, speed: -5 } },

  { id: 'crown',     name: 'Bloody Crown',    tier: 4, price: 92, mods: { damage: 20, lifesteal: 8, maxHp: -8, armor: -4 } },
  { id: 'nucleus',   name: 'Nucleus',         tier: 4, price: 95, mods: { melee: 6, ranged: 6, elem: 6, atkSpeed: 8 } },
  { id: 'phantom',   name: 'Phantom Cloak',   tier: 4, price: 90, mods: { dodge: 16, speed: 12, maxHp: -6 } },
  { id: 'jackpot',   name: 'Jackpot',         tier: 4, price: 94, mods: { crit: 18, critMult: 60, luck: 40 } },
];

export const TIER_COLOR = ['#8c93a1', '#6ec1ff', '#c084fc', '#ffc857'];
export const TIER_NAME = ['Common', 'Uncommon', 'Rare', 'Legendary'];

// --------------------------------------------------------------------------
// Level-up upgrade pool. Each pick applies `mods` directly to the player.
// --------------------------------------------------------------------------
export const UPGRADES = [
  { key: 'maxHp',     tier: 0, mods: { maxHp: 3 } },
  { key: 'maxHp',     tier: 1, mods: { maxHp: 6 } },
  { key: 'maxHp',     tier: 2, mods: { maxHp: 10 } },
  { key: 'damage',    tier: 0, mods: { damage: 5 } },
  { key: 'damage',    tier: 1, mods: { damage: 10 } },
  { key: 'damage',    tier: 2, mods: { damage: 18 } },
  { key: 'melee',     tier: 0, mods: { melee: 2 } },
  { key: 'melee',     tier: 1, mods: { melee: 4 } },
  { key: 'ranged',    tier: 0, mods: { ranged: 2 } },
  { key: 'ranged',    tier: 1, mods: { ranged: 4 } },
  { key: 'elem',      tier: 0, mods: { elem: 2 } },
  { key: 'elem',      tier: 1, mods: { elem: 4 } },
  { key: 'atkSpeed',  tier: 0, mods: { atkSpeed: 6 } },
  { key: 'atkSpeed',  tier: 1, mods: { atkSpeed: 12 } },
  { key: 'speed',     tier: 0, mods: { speed: 6 } },
  { key: 'speed',     tier: 1, mods: { speed: 12 } },
  { key: 'armor',     tier: 0, mods: { armor: 2 } },
  { key: 'armor',     tier: 1, mods: { armor: 4 } },
  { key: 'dodge',     tier: 0, mods: { dodge: 4 } },
  { key: 'dodge',     tier: 1, mods: { dodge: 8 } },
  { key: 'crit',      tier: 0, mods: { crit: 4 } },
  { key: 'crit',      tier: 1, mods: { crit: 8 } },
  { key: 'critMult',  tier: 1, mods: { critMult: 25 } },
  { key: 'hpRegen',   tier: 0, mods: { hpRegen: 0.8 } },
  { key: 'hpRegen',   tier: 1, mods: { hpRegen: 1.6 } },
  { key: 'lifesteal', tier: 1, mods: { lifesteal: 5 } },
  { key: 'range',     tier: 0, mods: { range: 10 } },
  { key: 'range',     tier: 1, mods: { range: 20 } },
  { key: 'harvest',   tier: 0, mods: { harvest: 12 } },
  { key: 'luck',      tier: 0, mods: { luck: 15 } },
  { key: 'pickup',    tier: 0, mods: { pickup: 25 } },
];

// --------------------------------------------------------------------------
// Enemies. Array index IS the network id, so never reorder this list.
// --------------------------------------------------------------------------
export const ENEMIES = [
  { name: 'Grunt',    ai: 'chase',   hp: 12,  spd: 78,  dmg: 2,  r: 15, color: '#e05f5f', mats: 1, minWave: 1 },
  { name: 'Runner',   ai: 'chase',   hp: 7,   spd: 145, dmg: 2,  r: 12, color: '#f0a35e', mats: 1, minWave: 2 },
  { name: 'Tank',     ai: 'chase',   hp: 46,  spd: 48,  dmg: 5,  r: 25, color: '#8c6bb1', mats: 2, minWave: 3 },
  { name: 'Shooter',  ai: 'shoot',   hp: 16,  spd: 62,  dmg: 3,  r: 15, color: '#5ea8e0', mats: 2, minWave: 4, keep: 330, fireCd: 3.0, shotSpd: 215 },
  { name: 'Charger',  ai: 'charge',  hp: 26,  spd: 70,  dmg: 5,  r: 18, color: '#d94f8c', mats: 2, minWave: 5 },
  { name: 'Exploder', ai: 'explode', hp: 14,  spd: 118, dmg: 9, r: 16, color: '#ff5c2e', mats: 2, minWave: 6, aoe: 95 },
  { name: 'Spitter',  ai: 'shoot',   hp: 22,  spd: 55,  dmg: 3,  r: 17, color: '#7ed957', mats: 3, minWave: 8, keep: 400, fireCd: 2.6, shotSpd: 205, shots: 3, spread: 0.3 },
  { name: 'Swarmer',  ai: 'chase',   hp: 5,   spd: 160, dmg: 1,  r: 9,  color: '#ffd166', mats: 1, minWave: 4, pack: 6 },
  { name: 'Warden',   ai: 'boss',    hp: 620, spd: 58,  dmg: 9, r: 46, color: '#ff3b6b', mats: 40, minWave: 5,  boss: true, ringCd: 3.2, ringN: 16, shotSpd: 185 },
  { name: 'Devourer', ai: 'boss',    hp: 1500, spd: 72, dmg: 13, r: 56, color: '#b026ff', mats: 80, minWave: 15, boss: true, ringCd: 2.4, ringN: 24, shotSpd: 210, summon: true },
];

// Which enemy type spawns on which wave, and the boss for boss waves.
export function bossForWave(w) { return w >= 15 ? 9 : 8; }

export const SIGNAL_PREFIX = 'brtoi-';   // PeerJS ids are namespaced to avoid clashes
export const PROTO_VERSION = 3;
