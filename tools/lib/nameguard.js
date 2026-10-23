'use strict';
// The name guard: tracked files must not name the web quest databases the
// project no longer cites (a web quest database, its quest-chain mirror and a
// talents site's quest cache), except the files listed in
// tools/lib/nameguard-allow.json with why. The names are built from parts
// here, so this file does not name them itself.
//
//   names()                       -> the guarded names, lower case
//   pattern()                     -> a case-insensitive extended regex for git grep
//   mentions(cwd)                 -> tracked text files that name one (git grep), sorted
//   checkMentions(found, allow)   -> { unexpected: files not allowed, stale: allowed files that no longer name one }
//   loadAllow(file?)              -> { [path]: reason }

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ALLOW = path.join(__dirname, 'nameguard-allow.json');
const REASONS = new Set(['excluded', 'phase2', 'guard']);

function names() {
	return [['wow', 'head'], ['forever', 'changes'], ['wowforever', 'talents']].map((p) => p.join(''));
}

function pattern() {
	return names().join('|');
}

function mentions(cwd) {
	let out;
	try {
		out = execFileSync('git', ['grep', '-l', '-I', '-i', '-E', pattern()], { cwd, encoding: 'utf8', maxBuffer: 64 << 20 });
	} catch (err) {
		// git grep exits 1 when nothing matches.
		if (err.status === 1) return [];
		throw err;
	}
	return out.split('\n').filter(Boolean).sort();
}

function loadAllow(file = ALLOW) {
	const doc = JSON.parse(fs.readFileSync(file, 'utf8'));
	const files = doc.files || {};
	for (const [f, why] of Object.entries(files)) {
		if (!REASONS.has(why)) throw new Error(`${path.basename(file)}: ${f}: reason "${why}" is none of ${[...REASONS].join(', ')}`);
	}
	return files;
}

function checkMentions(found, allow) {
	const seen = new Set(found);
	return {
		unexpected: found.filter((f) => !Object.hasOwn(allow, f)),
		stale: Object.keys(allow).filter((f) => !seen.has(f)).sort(),
	};
}

module.exports = { names, pattern, mentions, loadAllow, checkMentions, ALLOW };
