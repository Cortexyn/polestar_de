'use strict';
// node tools/polestar.js gear build | fetch

const path = require('node:path');
const { parseArgs } = require('node:util');
const { SOURCES } = require('../lib/paths');

const usage = `usage: node tools/polestar.js gear build [--addons <dir>]
       node tools/polestar.js gear fetch

build: the data behind Polestar's upgrade advice:
  addon/Polestar_ItemDB/Forever.lua   ForeverLevelingBiS (MIT): Forever item stats over
                                      the Era table, and quest reward choices
  addon/Polestar/Gear/SpecData.lua    stat weight bands per spec and level (Polestar's
                                      weights blended with wowsims, MIT), racial traits
Reads the installed ForeverLevelingBiS and the wowsims cache under
data/sources/wowsims (no network). Run \`itemdb build\` first. Only builds
from MIT-licensed ForeverLevelingBiS versions: any other copy is refused and
nothing is written.

fetch: refresh the wowsims cache (pinned commits).

  --addons <dir>   the client's Interface/AddOns (default: detected)`;

function fail(msg) {
	console.error(`${msg}\n\n${usage}`);
	return 2;
}

async function runBuild(rest) {
	let values;
	try {
		({ values } = parseArgs({ args: rest, options: { addons: { type: 'string' } }, strict: true }));
	} catch (err) {
		return fail(err.message);
	}
	const { buildGear } = require('../lib/gear/build');
	const r = await buildGear({ addons: values.addons && path.resolve(values.addons), log: (m) => console.error(m) });
	const f = r.foreverLevelingBiS;
	const p = f.pack;
	console.log(`ForeverLevelingBiS ${f.version} (data ${f.generated}): ${p.items} items (${p.newItems} Forever-only, ${p.retuned} retuned from Era, ${p.unchanged} as in Era), ${p.quests} quests; Forever.lua ${(f.bytes / 1024).toFixed(0)} KiB`);
	if (r.wowsims) {
		const b = r.wowsims.bands;
		console.log(`wowsims: ${b.specs} specs, ${b.simBands} level bands blended with a sim, ${b.authoredOnly} authored only; ${r.wowsims.rejected} sim sets rejected`);
	}
	console.log(`SpecData.lua ${(r.specDataBytes / 1024).toFixed(0)} KiB`);
	for (const g of r.gaps) console.log(`gap: ${g}`);
	return 0;
}

async function runFetch() {
	await require('../lib/consume/wowsims').readWowsims({ cacheDir: path.join(SOURCES, 'wowsims'), fetch: true, log: (m) => console.error(m) });
	return 0;
}

async function run(argv) {
	const [sub, ...rest] = argv;
	if (sub === 'build') return runBuild(rest);
	if (sub === 'fetch') return runFetch();
	return fail(sub ? `unknown subcommand "${sub}"` : 'missing subcommand');
}

module.exports = { name: 'gear', summary: 'Build the upgrade-advice data (Forever item stats, reward choices, stat weights) from installed addons and sims', usage, run };
