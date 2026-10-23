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
//   loadAllow(file?)              -> { [path]: kind }
//
// The allowlist only shrinks. Its entries as of the guard's first version
// (BASELINE: the first 16 hex digits of each path's SHA-256, so the paths,
// which contain the names, are not repeated here) may keep their kind as a
// string: "phase2" (code still to rename), "excluded" or "guard". Any other
// entry must be { "kind": "excluded", "reason": "<why>" }, and is added only
// when the maintainers agree in review; "phase2" can never be added.

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ALLOW = path.join(__dirname, 'nameguard-allow.json');
const crypto = require('node:crypto');
const KINDS = new Set(['excluded', 'phase2', 'guard']);
const pathKey = (f) => crypto.createHash('sha256').update(f).digest('hex').slice(0, 16);

const BASELINE = {
	phase2: new Set([
	'06572a96a58dc510',
	'06cef92e5999573a',
	'0abc7dab8f48ddec',
	'21615c40480652d9',
	'2bd0a99b130aa1ca',
	'2c9f6f96138696d0',
	'2e0579d9282fd00b',
	'3742e22a3b939618',
	'37b3dc5937cd2039',
	'3878d57c5e08b2b8',
	'3932035d0c10b0e8',
	'3959b5f3c38791eb',
	'3c637c8ddeee6ea3',
	'4342e7f744c9b59b',
	'47b1cd47e4add21a',
	'55daccdedc2cdfb5',
	'5d49bd9f35765f44',
	'5dfbb07fb70a8223',
	'6128ffb3fc838d5e',
	'6d29483096c65d41',
	'6d96b82d12f10c4b',
	'6f3448e017280b6f',
	'765475c7a9e6354e',
	'7758243b38635cce',
	'781cb0784608d3ce',
	'8f489496ccb6109d',
	'978cc6910c9ab503',
	'99eb2033c9a42645',
	'9cea6a1607559a2e',
	'9e0bd3544a9b0861',
	'a13e9ac0f2ffcd8a',
	'a736bd51e9010736',
	'a758240da6f2e041',
	'a8beec95cac9895b',
	'b32662a69918a88e',
	'b61e6804ec7ee813',
	'c45df7d1fad4e48d',
	'd5d02c19c48b8249',
	'd94461480ef1559e',
	'dc63dd0a1cd3ba9f',
	'dd307a1e94d9a4b9',
	'e4dbc1084a6d2390',
	'eed438cbe5ec013c',
	'f40619b79fdb8146',
	'fc7a627bb884ea02',
	'fc8119945e234ae7',
	'ff21b6b9a3a33e9d',
	]),
	excluded: new Set([
	'24f760f284f7aff3',
	'2a509b722cbd9700',
	'3cd8a9846b693e61',
	'615d27be8cfbea99',
	'6cd765a9d05b7029',
	'817599e36010c225',
	'880ebdec3382573f',
	'a0a4f3aa5e196ac5',
	'a6b8bc32627de735',
	'a8ceb9273adad7aa',
	'b3482da48d457eda',
	'b39f1d47a06821cc',
	'b70104f90ea38882',
	'beddac776885b6fe',
	'c7ce2df9a41557f6',
	'c952409b82bd1105',
	'e59ea7d2c25fa26c',
	'e90bf3e495a3b224',
	'eba283c7379a1755',
	'fba0df8a41e3544a',
	]),
	guard: new Set([
	'06df1c23471941f4',
	]),
};

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
	const name = path.basename(file);
	const out = {};
	for (const [f, v] of Object.entries(doc.files || {})) {
		const key = pathKey(f);
		if (typeof v === 'string') {
			if (!KINDS.has(v)) throw new Error(`${name}: ${f}: kind "${v}" is none of ${[...KINDS].join(', ')}`);
			if (!BASELINE[v].has(key)) {
				throw new Error(`${name}: ${f}: "${v}" is not one of the guard's original entries; the allowlist only shrinks (a new entry must be { "kind": "excluded", "reason": "..." }, agreed by the maintainers in review)`);
			}
			out[f] = v;
			continue;
		}
		if (!v || v.kind !== 'excluded' || typeof v.reason !== 'string' || !v.reason.trim()) {
			throw new Error(`${name}: ${f}: a new entry must be { "kind": "excluded", "reason": "..." } (phase2 cannot be added)`);
		}
		out[f] = 'excluded';
	}
	return out;
}

function checkMentions(found, allow) {
	const seen = new Set(found);
	return {
		unexpected: found.filter((f) => !Object.hasOwn(allow, f)),
		stale: Object.keys(allow).filter((f) => !seen.has(f)).sort(),
	};
}

module.exports = { names, pattern, mentions, loadAllow, checkMentions, pathKey, ALLOW };
