/* Test-library helper: ffmpeg stores COMMENT as DESCRIPTION in FLAC, so set COMMENT/DESCRIPTION exactly with FlacTags.
   node tests/set_comments.js LIBRARY_DIR wanted.json   (wanted = { "rel/path.flac": { "COMMENT": "...", "DESCRIPTION": "..." } }) */
const fs = require('fs'), path = require('path');
const FlacTags = require(path.join(__dirname, '../js/flactags.js'));
const [dir, wantFile] = process.argv.slice(2);
const want = JSON.parse(fs.readFileSync(wantFile, 'utf8'));
(async () => {
  for (const [rel, tags] of Object.entries(want)) {
    const p = path.join(dir, rel), blob = new Blob([fs.readFileSync(p)]);
    const parsed = await FlacTags.parse(blob);
    const entries = parsed.entries.filter(e => !/^(COMMENT|DESCRIPTION)=/i.test(e));
    for (const [k, v] of Object.entries(tags)) if (v) entries.push(k + '=' + v);
    const out = await FlacTags.retag(blob, parsed, entries);
    fs.writeFileSync(p, Buffer.from(await out.arrayBuffer()));
  }
})().catch(e => { console.error(e); process.exit(1); });
