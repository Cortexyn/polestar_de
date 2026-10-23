'use strict';
// The built Codex pack (addon/Polestar_Codex, local: `node tools/polestar.js
// codex build`) end to end: searching a mount's name finds it, it has ranked
// sources, the curated guide that collects it is the one Lookup opens, and the
// guide Lookup builds from its best source plays to the end in the real engine
// (tools/lib/playtest.js). Skips when the pack has not been built.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { runAddon, ROOT } = require('./helpers/lua');
const { SIMULATE, luaValue } = require('../tools/lib/playtest');

const PACK = path.join(ROOT, 'addon', 'Polestar_Codex');
const TOC = path.join(PACK, 'Polestar_Codex.toc');
const FRAMES = path.join(ROOT, 'data', 'forever', 'map-frames.json');
const skip = !fs.existsSync(TOC) || !fs.existsSync(FRAMES) ? 'Codex pack not built (node tools/polestar.js codex build)' : false;

function packLua() {
	const files = fs
		.readFileSync(TOC, 'utf8')
		.split(/\r?\n/)
		.map((l) => l.trim())
		.filter((l) => l && !l.startsWith('#'))
		.map((f) => path.join(PACK, f));
	const list = `{ ${files.map((f) => JSON.stringify(f)).join(', ')} }`;
	return `do
  local __files, __load = ${list}, C_AddOns.LoadAddOn
  function C_AddOns.LoadAddOn(name)
    if name ~= "Polestar_Codex" then return __load(name) end
    if not stub.addonsLoaded[name] then
      for _, f in ipairs(__files) do dofile(f) end
      stub.addonsLoaded[name] = true
    end
    return true, nil
  end
end`;
}

// Every map the client knows, in its live frame (Forever's own bounds where
// they differ from Era's); Era-frame coordinates convert through the frames
// the pack registers.
function mapsLua() {
	const { era, forever = {} } = JSON.parse(fs.readFileSync(FRAMES, 'utf8'));
	const ids = new Set([...Object.keys(era), ...Object.keys(forever)]);
	return [...ids]
		.map((id) => {
			const f = forever[id] || era[id];
			return `w.addMap(${id}, { name = "", c = ${f.c}, left = ${f.left}, right = ${f.right}, top = ${f.top}, bottom = ${f.bottom} })`;
		})
		.join('\n');
}

// query: the search text; pick: Lua predicate over a result; who: the character.
function lookUp({ query, kindOf, race, faction, cls, level, at }) {
	const [found, built, out] = runAddon({
		stubs: ['stub_world.lua'],
		before: `${packLua()}
local w = stub.world
${mapsLua()}
w.race, w.raceName, w.class, w.className, w.faction = ${luaValue(race)}, ${luaValue(race)}, ${luaValue(cls)}, ${luaValue(cls)}, ${luaValue(faction)}
w.level = ${level}
w.moveTo(${at.join(', ')})`,
		addons: ['Polestar', 'Polestar_Guides'],
		script: `
stub.login()
Polestar.Set("behavior.autoNextGuide", false)
local results = Polestar.Search.Query(${luaValue(query)})
local hit
for _, r in ipairs(results) do
	if r.kind == ${luaValue(kindOf)} then hit = r; break end
end
local rows = hit and Polestar.Lookup.Sources(hit.kind, hit.id) or {}
local types = {}
for i, r in ipairs(rows) do types[i] = r.type .. (r.available and "" or ("!" .. tostring(r.why))) end
local mounts = {}
for _, r in ipairs(results) do
	if r.kind == "mount" then mounts[#mounts + 1] = { id = r.id, status = r.status or false, curated = r.curated or false } end
end
emit({ id = hit and hit.id or false, title = hit and hit.title or false, kinds = #results, types = types, mounts = mounts,
	curated = hit and Polestar.Lookup.CuratedGuide(hit.kind, hit.id) or false })
local best
for i, r in ipairs(rows) do if r.available and r.guideable then best = i; break end end
local gid, why = Polestar.Lookup.Guide(hit.kind, hit.id, best or 1)
local g = gid and Polestar.Guides.Get(gid)
emit({ id = gid or false, why = why or false, steps = g and #g.steps or 0 })
stub.advance(0.6)
${SIMULATE}`,
	}).emitted;
	return { found, built, out };
}

function assertPlays({ found, built, out }) {
	assert.ok(built.id, `a guide was built (${built.why})`);
	assert.ok(built.steps > 0);
	assert.ok(!out.stuck, `stuck: ${JSON.stringify(out.stuck)}`);
	assert.equal(out.done, true);
	assert.deepEqual(out.missing, {}, 'every accept and turn-in has a location');
	return found;
}

test('"Striped Frostsaber" finds the Night Elf saber sold in Darnassus, its curated guide, and the built guide plays', { skip }, () => {
	const found = assertPlays(
		lookUp({ query: 'Striped Frostsaber', kindOf: 'mount', race: 'NightElf', faction: 'Alliance', cls: 'HUNTER', level: 40, at: [1438, 55.5, 50.1] }),
	);
	assert.equal(found.id, 8631);
	assert.ok(found.types.some((t) => t === 'vendor'), `an available vendor source: ${found.types}`);
	assert.match(String(found.curated), /^forever\/collectibles\/mounts\//);
});

test('"Deathcharger" finds the Deathcharger\'s Reins with its Stratholme drop, and the built guide plays', { skip }, () => {
	const found = assertPlays(
		lookUp({ query: 'Deathcharger', kindOf: 'mount', race: 'Scourge', faction: 'Horde', cls: 'WARRIOR', level: 60, at: [1423, 50, 50] }),
	);
	assert.equal(found.id, 13335);
	assert.ok(found.types.some((t) => t === 'drop'), `an available drop source: ${found.types}`);
	assert.match(String(found.curated), /^forever\/collectibles\/mounts\/neutral\/deathcharger/);
});

test('"Frostsaber": the sabers on sale and covered by a guide come first, the retired Reins of the Frostsaber last', { skip }, () => {
	const found = assertPlays(
		lookUp({ query: 'Frostsaber', kindOf: 'mount', race: 'NightElf', faction: 'Alliance', cls: 'HUNTER', level: 60, at: [1438, 55.5, 50.1] }),
	);
	assert.notEqual(found.id, 12302);
	assert.equal(found.mounts[0].curated, true, `first mount is guide-backed: ${JSON.stringify(found.mounts)}`);
	const retired = found.mounts.findIndex((m) => m.id === 12302);
	assert.ok(retired >= 0, 'still listed, for reference');
	assert.equal(found.mounts[retired].status, 'retired');
	assert.ok(found.mounts.slice(retired).every((m) => m.status), 'nothing obtainable ranks below it');
});

test('the built Codex is release-safe, and in game Lookup finds items, mounts and NPCs, Dungeons lists dungeons with bosses and quests, Rares lists rares', { skip }, () => {
	const { releaseRefusal } = require('../tools/lib/codex/pack');
	assert.equal(releaseRefusal(PACK), null, 'pack would ship it');
	const [out] = runAddon({
		stubs: ['stub_world.lua'],
		before: packLua(),
		addons: ['Polestar'],
		script: `
stub.login()
local C = Polestar.Codex
local loaded = C.Load()
local function first(q, kind)
	for _, r in ipairs(Polestar.Search.Query(q)) do if r.kind == kind then return r.id end end
	return false
end
local D = Polestar.Dungeons
D.Load()
local list, bossed, quested = 0, 0, 0
for _, d in ipairs(D.List()) do
	list = list + 1
	if d.bosses > 0 then bossed = bossed + 1 end
	if d.quests.A + d.quests.H > 0 then quested = quested + 1 end
end
local wc = {}
for _, b in ipairs(D.Bosses("wailing-caverns")) do wc[#wc + 1] = b.name end
local rares = 0
C.Each("rare", function() rares = rares + 1 end)
local thuros = C.Npc(61)
local dm = C.Instance("deadmines")
emit({ loaded = loaded, item = first("Linen Cloth", "item"), mount = first("Deathcharger", "mount"), npc = first("Lelanai", "npc"),
	list = list, bossed = bossed, quested = quested, wc = wc, wcQuests = #D.Quests("wailing-caverns"),
	rares = rares, thuros = { thuros.rare and true or false, #thuros.spawns > 0 },
	dm = { #dm.bosses, dm.entrance and dm.entrance.map or false, #dm.bosses[#dm.bosses].items } })`,
	}).emitted;
	assert.equal(out.loaded, true);
	assert.equal(out.item, 2589);
	assert.equal(out.mount, 13335);
	assert.equal(out.npc, 4730);
	assert.ok(out.list >= 25, `dungeons listed: ${out.list}`);
	assert.ok(out.bossed >= 25 && out.quested >= 25, `with bosses ${out.bossed}, with quests ${out.quested}`);
	assert.ok(out.wc.includes('Mutanus the Devourer'), out.wc.join(', '));
	assert.ok(out.wcQuests > 0);
	assert.ok(out.rares >= 300, `rares: ${out.rares}`);
	assert.deepEqual(out.thuros, [true, true]);
	assert.ok(out.dm[0] >= 8, `Deadmines bosses: ${out.dm[0]}`);
	assert.equal(out.dm[1], 1436, 'the Deadmines entrance is in Westfall');
	assert.ok(out.dm[2] > 0, "VanCleef's loot");
});

test("kp's report: the Deadmines pick-up guide of a level 21 Gnome Rogue in Lakeshire has no Darkmoon Faire quest, and no dungeon page carries one or a quest tied by a stray drop", { skip }, () => {
	const [out] = runAddon({
		stubs: ['stub_world.lua'],
		before: `${packLua()}
local w = stub.world
${mapsLua()}
w.race, w.raceName, w.class, w.className, w.faction = "Gnome", "Gnome", "ROGUE", "ROGUE", "Alliance"
w.level = 21
w.moveTo(1433, 26.5, 45.0)`,
		addons: ['Polestar'],
		script: `
stub.login()
local D = Polestar.Dungeons
D.Load()
local plan = D.PickupPlan("deadmines")
local take = {}
for i, t in ipairs(plan and plan.take or {}) do take[i] = t.quest.id end
local pages = {}
for _, d in ipairs(D.List()) do
	for _, q in ipairs(D.Quests(d.key)) do pages[#pages + 1] = d.key .. ":" .. q.id end
end
emit({ take = take, pages = pages })`,
	}).emitted;
	assert.ok(out.take.length > 0, 'the Deadmines quests are offered');
	assert.ok(!out.take.includes(7894), `no Copper Modulator (Rinling, the Faire): ${out.take}`);
	// The Faire's quests: pfQuest's game events 4 and 5 (Chronos, Rinling, Yebb Neblegear, Kerri Hicks, Morja, Gelvas Grimegate).
	const quests = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'forever', 'quests.json'), 'utf8'));
	const faire = out.pages.filter((p) => [4, 5].includes((quests[p.split(':')[1]] || {}).event));
	assert.deepEqual(faire, [], 'no Darkmoon Faire quest on a dungeon page');
	const stray = ['naxxramas:8921', 'zulgurub:8921', 'blackwing-lair:9121', 'blackwing-lair:9122'];
	assert.deepEqual(out.pages.filter((p) => stray.includes(p)), [], "The Ectoplasmic Distiller (Mux, Tanaris) and The Dread Citadel (Dosantos, Light's Hope) are on no raid page through a boss's stray essence or crystal");
});

// Tabetha's Task (2861) for Zul'Farrak: the mage trainers of both sides give
// it; the page names the first, Anastasia Hartwell in the Undercity.
function tabetha(race, faction, at) {
	return runAddon({
		stubs: ['stub_world.lua'],
		before: `${packLua()}
local w = stub.world
${mapsLua()}
w.race, w.raceName, w.class, w.className, w.faction = ${luaValue(race)}, ${luaValue(race)}, "MAGE", "MAGE", ${luaValue(faction)}
w.level = 44
w.moveTo(${at.join(', ')})`,
		addons: ['Polestar'],
		script: `
stub.login()
local D = Polestar.Dungeons
D.Load()
local giver
for _, t in ipairs(D.PickupPlan("zulfarrak").take) do
	if t.quest.id == 2861 then giver = t.giver end
end
local target = D.GiverTarget("zulfarrak", 2861)
local npc = giver and Polestar.Codex.Npc(giver.id)
emit({ giver = giver and giver.name or false, map = giver and giver.map or false, side = npc and npc.faction or false, target = target and target.name or false })`,
	}).emitted[0];
}

test("Tabetha's Task: a level 44 Alliance mage in Stormwind is sent to an Alliance mage trainer in Stormwind, a Horde one in the Undercity to Anastasia Hartwell", { skip }, () => {
	const human = tabetha('Human', 'Alliance', [1453, 50, 60]);
	assert.equal(human.side, 'A', `an Alliance giver: ${JSON.stringify(human)}`);
	assert.equal(human.map, 1453, 'in Stormwind');
	assert.equal(human.target, human.giver, "the quest card's link goes there too");
	const undead = tabetha('Scourge', 'Horde', [1458, 66, 44]);
	assert.deepEqual({ ...undead, map: [1420, 1458].includes(undead.map) }, { giver: 'Anastasia Hartwell', map: true, side: 'H', target: 'Anastasia Hartwell' }, 'in the Undercity (the Codex also places her on its Tirisfal Glades map)');
});

// "Guide me through it" for an attunement or key: the guide (Dungeons.AttuneGuide)
// as a character of `faction` at `level` in their capital, and SIMULATE playing it.
function attuneGuide(ref, { race, faction, level, at, script = SIMULATE }) {
	const [key, id] = ref.split(':');
	return runAddon({
		stubs: ['stub_world.lua'],
		before: `${packLua()}
local w = stub.world
${mapsLua()}
w.race, w.raceName, w.class, w.className, w.faction = ${luaValue(race)}, ${luaValue(race)}, "WARRIOR", "WARRIOR", ${luaValue(faction)}
w.level = ${level}
w.moveTo(${at.join(', ')})`,
		addons: ['Polestar'],
		script: `
stub.login()
Polestar.Set("behavior.autoNextGuide", false)
local D = Polestar.Dungeons
D.Load()
local a
for _, x in ipairs(D.Attunements(${luaValue(key)})) do if x.id == ${luaValue(id)} then a = x end end
local st = D.AttunementState(a)
local quests = 0
for _, e in ipairs(st.steps) do
	if e.step.kind == "quest" and e.state ~= "na" and e.state ~= "skip" and e.state ~= "done" then quests = quests + 1 end
end
local def, why = D.AttuneGuide(${luaValue(key)}, ${luaValue(id)})
local accepts, bare = 0, {}
for _, s in ipairs(def and def.steps or {}) do
	local quest = false
	for _, g in ipairs(s.goals) do if g.t == "accept" then accepts = accepts + 1; quest = true end end
	if not quest and #s.goals == 1 and s.goals[1].t == "note" then bare[#bare + 1] = s.title end
end
emit({ quests = quests, accepts = accepts, bare = table.concat(bare, ", "), why = why or false })
if def then
	D.Attune(${luaValue(key)}, ${luaValue(id)})
	stub.advance(0.6)
	SIM_GUIDE = Polestar.Engine.GetGuide()
	${script}
end`,
	}).emitted;
}

const ORGRIMMAR = { race: 'Orc', faction: 'Horde', at: [1454, 50, 50] };
const STORMWIND = { race: 'Human', faction: 'Alliance', at: [1453, 50, 60] };

test('every attunement and key: the guide has a step per quest still to do, none a bare note, and plays to the end for both sides', { skip }, () => {
	const refs = {
		'molten-core:core': [ORGRIMMAR, STORMWIND],
		'molten-core:aqual': [ORGRIMMAR, STORMWIND],
		'onyxias-lair:drakefire-h': [ORGRIMMAR],
		'onyxias-lair:drakefire-a': [STORMWIND],
		'blackwing-lair:blackhand': [ORGRIMMAR, STORMWIND],
		'naxxramas:dread-citadel': [ORGRIMMAR, STORMWIND],
		'scholomance:skeleton-key-h': [ORGRIMMAR],
		'scholomance:skeleton-key-a': [STORMWIND],
		'blackrock-depths:shadowforge-key': [ORGRIMMAR, STORMWIND],
		'city-of-dalaran:sewer-key': [ORGRIMMAR],
		'scarlet-monastery:scarlet-key': [ORGRIMMAR, STORMWIND],
	};
	for (const [ref, who] of Object.entries(refs)) {
		for (const p of who) {
			const [count, out] = attuneGuide(ref, { ...p, level: 60 });
			const as = `${ref} (${p.faction})`;
			assert.equal(count.why, false, `${as}: a guide`);
			assert.equal(count.accepts, count.quests, `${as}: one accept per quest left`);
			assert.equal(count.bare, '', `${as}: no quest is a bare "First do the quest" note`);
			assert.ok(!out.stuck, `${as} stuck: ${JSON.stringify(out.stuck)}`);
			assert.equal(out.done, true, as);
			assert.equal(out.visited, out.steps, `${as}: the engine stops at every step, none passed as done`);
		}
	}
	const [other] = attuneGuide('onyxias-lair:drakefire-a', { ...ORGRIMMAR, level: 60 });
	assert.deepEqual(other, { quests: 0, accepts: 0, bare: '', why: 'nothing' }, "the Alliance amulet's guide is not a Horde character's");
});

test("the maintainer's level 20 Undead in the Undercity: Molten Core's guide sends him to the Core Fragment inside Blackrock Depths, and its accept says from level 55", { skip }, () => {
	const [count, view] = attuneGuide('molten-core:core', {
		race: 'Scourge',
		faction: 'Horde',
		level: 20,
		at: [1458, 66, 44],
		script: `
local E = Polestar.Engine
local v = E.GetStepView(1)
local goals = {}
for i, g in ipairs(v.goals) do goals[i] = { t = g.t, text = g.text, detail = g.detail or false, at = g.map and { g.map, g.x, g.y } or false } end
local brd = D.Get("blackrock-depths").entrance
emit({ step = E.GetStepIndex(), count = E.GetStepCount(), title = v.title, note = v.note or false, goals = goals, brd = { brd.map, brd.x, brd.y } })`,
	});
	assert.deepEqual([count.quests, count.accepts], [1, 1], 'one quest: Attunement to the Core (7848, the Forever id)');
	assert.equal(view.step, 1);
	assert.equal(view.count, 2, 'the quest, then the way in');
	assert.deepEqual(view.goals.map((g) => g.t), ['accept', 'collect', 'turnin']);
	assert.equal(view.goals[0].detail, 'from Lothos Riftwaker, from level 55');
	assert.equal(view.goals[1].text, 'Collect Core Fragment');
	assert.deepEqual(view.goals[1].at, view.brd, 'at the Blackrock Depths entrance');
	assert.equal(view.note, 'Core Fragment: inside Blackrock Depths.');
});

// A dungeon's pick-up plan and guide (the quests taken, the accepts) and its
// hand-in plan with the follow-ups those turn-ins open, for a character of
// `race`/`faction`/`cls` at `level`, standing `at`, carrying `ready` (done, in the log).
function dungeonQuests(key, { race, faction, cls, level, at, ready = [] }) {
	return runAddon({
		stubs: ['stub_world.lua'],
		before: `${packLua()}
local w = stub.world
${mapsLua()}
w.race, w.raceName, w.class, w.className, w.faction = ${luaValue(race)}, ${luaValue(race)}, ${luaValue(cls)}, ${luaValue(cls)}, ${luaValue(faction)}
w.level = ${level}
w.moveTo(${at.join(', ')})
for _, q in ipairs(${luaValue(ready)}) do w.onQuest(q, {}) end`,
		addons: ['Polestar'],
		script: `
stub.login()
local D = Polestar.Dungeons
D.Load()
local ids = function(list, f) local o = {} for i, x in ipairs(list or {}) do o[i] = f(x) end return o end
local plan = D.PickupPlan(${luaValue(key)})
local def = D.PickupGuide(${luaValue(key)})
local accepts = {}
for _, s in ipairs(def and def.steps or {}) do
	for _, g in ipairs(s.goals) do if g.t == "accept" then accepts[#accepts + 1] = g.quest end end
end
local hand = D.HandinPlan(${luaValue(key)})
emit({ take = ids(plan and plan.take, function(t) return t.quest.id end), accepts = accepts,
	hand = ids(hand and hand.hand, function(h) return h.quest.id end),
	follow = hand and ids(D.HandinFollowUps(hand), function(f) return f.rec.id end) or {} })`,
	}).emitted[0];
}

// Issue #50 (Arachnit): Unending Torment (97288-97292, Horde) starts from the
// Abominable Head The Baron drops in the Ruins of Lordaeron; Master
// Apothecary Faranell gives the rest of it in the Undercity once the head is
// hers (Forever's Series box and quest texts; tools/lib/data/corrections.json).
test("Arachnit's report: the Ruins of Lordaeron pick-up guide of a level 23 Orc Warrior takes no Unending Torment before the run; after it, the Abominable Head goes to Faranell, who gives the next one", { skip }, () => {
	const TORMENT = [97288, 97289, 97290, 97291, 97292];
	const orc = { race: 'Orc', faction: 'Horde', cls: 'WARRIOR', level: 23, at: [1458, 66, 44] };
	const before = dungeonQuests('ruins-of-lordaeron', orc);
	assert.ok(before.take.length > 0, 'the Horde quests of the Ruins of Lordaeron are offered');
	assert.deepEqual(before.take.filter((id) => TORMENT.includes(id)), [], `no Unending Torment to pick up: ${before.take}`);
	assert.deepEqual(before.accepts.filter((id) => TORMENT.includes(id)), [], `no Unending Torment accept in the guide: ${before.accepts}`);
	const after = dungeonQuests('ruins-of-lordaeron', { ...orc, ready: [97288] });
	assert.deepEqual(after.hand, [97288], 'the Abominable Head is handed in after the run');
	assert.deepEqual(after.follow, [97289], 'Faranell then gives the next Unending Torment');
});

// The same shape in the Excavation Site (Wetlands): each side's Titan Relic
// drops inside and its quest's ender gives the next one (Earthen Echo 98823
// after Elder Knowledge 95664, Prehistoric Prism 98824 after Lost Relic Carry 95810).
test('the Excavation Site pick-up guide takes neither Titan Relic follow-up before the run; after it, each relic\'s ender gives it', { skip }, () => {
	const tauren = { race: 'Tauren', faction: 'Horde', cls: 'WARRIOR', level: 26, at: [1456, 50, 50] };
	const dwarf = { race: 'Dwarf', faction: 'Alliance', cls: 'WARRIOR', level: 26, at: [1455, 50, 50] };
	for (const [who, item, next] of [[tauren, 95664, 98823], [dwarf, 95810, 98824]]) {
		const before = dungeonQuests('excavation-site-wetlands', who);
		assert.ok(before.take.length > 0, `the ${who.faction} quests of the Excavation Site are offered`);
		assert.ok(!before.take.includes(next) && !before.accepts.includes(next), `${next} is not picked up before the run: ${before.take}`);
		const after = dungeonQuests('excavation-site-wetlands', { ...who, ready: [item] });
		assert.deepEqual(after.hand, [item]);
		assert.deepEqual(after.follow, [next]);
	}
});
