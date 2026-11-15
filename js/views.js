'use strict';
/* Mesh v2 — Rate, Add music, DJ, Settings, keyboard and boot (continues js/app.js). */
(() => {
  const M = window.MeshApp;
  const { A, info, keyChip, bpmChip, energyChip, roleLangChips, pips, moveBadge, moveOf, bpmDiff, artHTML, hydrate, toast, ask, Pop, seg, placeThumbs, bindSeg,
    Player, transportHTML, bindTransport, go, render, renderSoon, persist, bannersHTML, Sheet, filters, isFiltered, filterCount, readOnlyMesh, keyText, toggleIn, defaultBadge, saveSetPath, renderNav } = M;
  const player = $('#player');

  /* =================================================================== RATE (Music Manager inside Mesh) */
  function rateList() {
    const q = normTxt(A.rate.q).split(/\s+/).filter(Boolean), f = A.rate.filter;
    const out = [];
    for (const p of Library.sorted) {
      const e = Library.get(p);
      const draft = A.rate.drafts.has(p);
      if (f === 'todo' && !(Library.isToRate(e) || draft)) continue;
      if (f === 'rated' && !(Library.isRated(e) || draft)) continue;
      if (q.length && !q.every(x => e.hay.includes(x))) continue;
      out.push(p);
    }
    return out;
  }
  function rateSelect(path, { keepPlaying = true } = {}) {
    if (A.view !== 'rate') { go('rate').then(ok => ok && rateSelect(path)); return; }
    if (A.now !== path) Player.load(path, { autoplay: keepPlaying && !player.paused });
    renderRate();
    requestAnimationFrame(() => $('#rate-list .row[aria-current="true"]')?.scrollIntoView({ block: 'nearest' }));
  }
  function currentRating(path) {
    const d = A.rate.drafts.get(path), e = Library.get(path);
    return d ? structuredClone(d) : { rating: structuredClone(e?.rating || Scheme.empty()), comment: e?.comment || '' };
  }
  function setDraft(path, next) {
    const e = Library.get(path);
    const same = JSON.stringify(next.rating) === JSON.stringify(e.rating) && (next.comment || '') === (e.comment || '');
    if (same) A.rate.drafts.delete(path); else A.rate.drafts.set(path, next);
  }
  function tagPreview(path) {
    const { rating: r, comment } = currentRating(path);
    const codes = Scheme.RATINGS.filter(d => r[d.key]).map(d => d.code + r[d.key]).join(' ');
    const toks = [...r.ROLE.map(x => '#' + x), ...r.LANGUAGE.map(x => '@' + x)].join(' ');
    const lines = [
      ['GROUPING', codes], ['COMMENT', [comment, toks].filter(Boolean).join(' ')], ['DESCRIPTION', toks],
      ...Scheme.RATINGS.map(d => [d.key, r[d.key] || '']), ['ROLE', r.ROLE.join(';')], ['LANGUAGE', r.LANGUAGE.join(';')],
    ];
    return lines.map(([k, v]) => `<b>${k}</b>=${esc(v || '—')}`).join('\n');
  }

  function renderRate() {
    const v = $('#v-rate'); if (!MeshStore.mesh) return;
    const list = rateList();
    let path = A.now && Library.get(A.now) ? A.now : null;
    if (!path && list.length) { path = list[0]; Player.load(path, { autoplay: false }); }
    const prevScroll = $('#rate-list')?.scrollTop ?? 0;
    const c = Library.counts();
    v.innerHTML = `<div class="rate">
      <aside class="rail" aria-label="Tracks">
        <div class="rail-head">
          <div class="row1"><h1 class="title-1">Rate</h1><span class="sub num">${fmtN(c.rated)} of ${fmtN(c.flac)} rated</span></div>
          ${seg('rfilter', [['todo', 'To rate'], ['rated', 'Rated'], ['all', 'All']], A.rate.filter, 'full')}
          <label class="field">${ICON.search}<input id="rate-q" type="search" placeholder="Filter by title, artist, comment" value="${esc(A.rate.q)}" aria-label="Filter tracks"></label>
        </div>
        <ul class="rail-list" id="rate-list" role="list">${list.length ? list.map(p => railRow(p, p === path)).join('')
          : `<li class="list-empty">${Library.scan.state !== 'done' ? 'Reading tags…' : A.rate.filter === 'todo' && !A.rate.q ? 'Everything here is rated.' : 'No tracks match.'}</li>`}</ul>
      </aside>
      <div class="rate-main"><div class="rate-page" id="rate-page">${bannersHTML()}${path ? deckRate(path) : `<div class="rate-empty"><div>${ICON.star.replace('<svg', '<svg width="40" height="40" style="margin:0 auto 10px;opacity:.5"')}<p class="title-3" style="color:var(--label)">Nothing to rate here</p><p>Change the filter or pick a song from search.</p></div></div>`}</div></div>
    </div>`;
    $('#rate-list').scrollTop = prevScroll;
    bindSeg(v, 'rfilter', val => { A.rate.filter = val; Prefs.set('rateFilter', val); renderRate(); });
    requestAnimationFrame(() => placeThumbs(v));
    const q = $('#rate-q');
    q.oninput = () => { A.rate.q = q.value; const pos = q.selectionStart; renderRate(); const n = $('#rate-q'); n.focus(); n.setSelectionRange(pos, pos); };
    $('#rate-list').onclick = e => { const b = e.target.closest('[data-path]'); if (b) rateSelect(b.dataset.path); };
    if (path) bindRateDeck(path, list);
    hydrate(v);
  }
  function railRow(p, cur) {
    const i = info(p), e = Library.get(p);
    return `<li><button class="row ${e.flac ? '' : 'mp3'}" data-path="${esc(p)}" ${cur ? 'aria-current="true"' : ''}>${artHTML(p)}
      <span class="meta"><span class="t">${esc(i.title)}</span><span class="a">${esc(i.artist)}</span></span>
      <span class="right">${i.draft ? '<span class="unsaved-dot" title="Unsaved changes"></span>' : ''}${e.flac ? pips(i.rating, i.draft) : '<span class="tag">MP3</span>'}</span></button></li>`;
  }
  function deckRate(path) {
    const i = info(path), e = Library.get(path);
    const { rating: r, comment } = currentRating(path);
    const s = i.song;
    const flac = e.flac && !e.unreadable;
    return `<div class="deck-h">${artHTML(path, 'hero')}
        <div class="info">
          <h2 class="title-1">${esc(i.title)}</h2><span class="artist">${esc(i.artist)}${i.album ? ` · ${esc(i.album)}` : ''}</span>
          <div class="chips" style="margin-top:8px">${bpmChip(i, 'not analysed')}${keyChip(i, { na: 'not analysed' })}</div>
          <div class="mesh-link">${s ? `<span><b>In mesh</b> · id ${s.id} · ${s.transitions.length} ${s.transitions.length === 1 ? 'transition' : 'transitions'} out</span>` : '<span>Not in mesh</span>'}
            ${readOnlyMesh() ? '' : `<button class="btn plain sm" id="rate-add" title="Add a transition from this song (+)">${ICON.plus} Transition</button>`}</div>
        </div>
      </div>
      <div class="rate-transport">${transportHTML({ prevNext: true })}</div>
      <div class="board card ${flac ? '' : 'disabled'}" aria-disabled="${!flac}">
        ${flac ? '' : `<p class="board-note">${e.unreadable ? 'This file could not be read.' : 'Ratings can be saved to FLAC only.'}</p>`}
        ${Scheme.RATINGS.map(d => `<div class="rrow"><span class="lab">${d.label}</span>
          <div class="stars" data-rk="${d.key}" role="radiogroup" aria-label="${d.label}">${[1, 2, 3, 4, 5].map(n => `<button role="radio" aria-checked="${r[d.key] === n}" aria-label="${n} of 5" data-n="${n}" class="${n <= r[d.key] ? 'on' + (i.draft ? ' edit' : '') : ''}">${n <= r[d.key] ? ICON.starFill : ICON.star}</button>`).join('')}</div>
          <span class="hint" data-hint="${d.key}">${r[d.key] ? (r[d.key] <= 2 ? d.low : r[d.key] >= 4 ? d.high : '') : `1 ${d.low.toLowerCase()} · 5 ${d.high.toLowerCase()}`}</span></div>`).join('')}
        <div class="rrow wide"><span class="lab">Role</span><div class="pills">${Scheme.ROLES.map(o => `<button class="pill" data-role="${o.id}" aria-pressed="${r.ROLE.includes(o.id)}">${o.label}<span class="k">${o.id === 'chill' ? 'C' : 'P'}</span></button>`).join('')}</div></div>
        <div class="rrow wide"><span class="lab">Language</span><div class="pills">${Scheme.LANGUAGES.map(o => `<button class="pill" data-lang="${o.id}" aria-pressed="${r.LANGUAGE.includes(o.id)}">${o.label}</button>`).join('')}</div></div>
        <div class="rrow wide"><span class="lab">Comment</span><div class="comment-field"><textarea class="note" id="rate-comment" rows="1" placeholder="e.g. skip the long intro" aria-label="Song comment (shows in Serato)">${esc(comment)}</textarea>
          <p class="foot" style="margin:6px 2px 0">Shows in Serato's Comment column. Role and language tags are kept after it.</p></div></div>
        <div class="board-foot">
          <details class="disclose grow"><summary>${ICON.chevD} Tags to be written</summary><div class="tagprev" id="tagprev">${tagPreview(path)}</div></details>
          <button class="btn" id="rate-save" ${i.draft ? '' : 'disabled'}>Save</button>
          <button class="btn primary" id="rate-next" title="Save & next (Enter)">${i.draft ? 'Save & next' : 'Next'}</button>
        </div>
      </div>`;
  }
  function bindRateDeck(path, list) {
    const root = $('#rate-page');
    bindTransport(root);
    $('.js-prev', root).onclick = () => stepRate(-1);
    $('.js-next', root).onclick = () => stepRate(1);
    $('#rate-add') && ($('#rate-add').onclick = () => go('add', { prefill: path, returnTo: 'rate' }));
    const upd = mut => {
      const cur = currentRating(path); mut(cur); setDraft(path, cur);
      const row = $(`#rate-list [data-path="${CSS.escape(path)}"]`);
      if (row) row.closest('li').outerHTML = railRow(path, true);
      hydrate($('#rate-list'));
      const keepComment = document.activeElement?.id === 'rate-comment';
      const openD = $('.disclose', root)?.open;
      const boardScroll = $('.rate-main').scrollTop;
      const pg = $('#rate-page'); pg.innerHTML = bannersHTML() + deckRate(path); bindRateDeck(path, list);
      $('.rate-main').scrollTop = boardScroll;
      if (openD) $('.disclose', pg).open = true;
      if (keepComment) { const t = $('#rate-comment'); t.focus(); t.setSelectionRange(t.value.length, t.value.length); }
      hydrate(pg); renderNav();
    };
    $$('.stars', root).forEach(s => {
      const key = s.dataset.rk;
      s.onclick = e => { const b = e.target.closest('[data-n]'); if (!b) return; const n = +b.dataset.n; upd(c => { c.rating[key] = c.rating[key] === n ? 0 : n; }); };
      s.onpointerover = e => { const b = e.target.closest('[data-n]'); if (!b) return; $$('button', s).forEach(x => x.classList.toggle('hov', +x.dataset.n <= +b.dataset.n)); };
      s.onpointerleave = () => $$('button', s).forEach(x => x.classList.remove('hov'));
    });
    $$('[data-role]', root).forEach(b => b.onclick = () => upd(c => toggleIn(c.rating.ROLE, b.dataset.role)));
    $$('[data-lang]', root).forEach(b => b.onclick = () => upd(c => toggleIn(c.rating.LANGUAGE, b.dataset.lang)));
    const ta = $('#rate-comment');
    ta.oninput = () => {
      const cur = currentRating(path); cur.comment = ta.value.replace(/[\r\n]+/g, ' '); setDraft(path, cur);
      $('#tagprev').innerHTML = tagPreview(path);
      const d = A.rate.drafts.has(path);
      $('#rate-save').disabled = !d; $('#rate-next').textContent = d ? 'Save & next' : 'Next';
      const row = $(`#rate-list [data-path="${CSS.escape(path)}"]`); if (row) { row.closest('li').outerHTML = railRow(path, true); hydrate($('#rate-list')); }
    };
    ta.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); saveRating(path, true); } };
    $('#rate-save').onclick = () => saveRating(path, false);
    $('#rate-next').onclick = () => A.rate.drafts.has(path) ? saveRating(path, true) : stepRate(1);
  }
  function stepRate(d) {
    const list = rateList(), i = list.indexOf(A.now);
    const n = list[i < 0 ? 0 : i + d];
    if (n) rateSelect(n); else toast(d > 0 ? (A.rate.filter === 'todo' ? 'That was the last song to rate here.' : 'End of the list.') : 'Start of the list.');
  }

  /* Write one rating into its FLAC. Checks the file hasn't changed since it was read, verifies the new header, reads it back. */
  async function writeRating(path) {
    const e = Library.get(path), d = A.rate.drafts.get(path);
    if (!e || !d) return true;
    if (!e.flac) { toast('Ratings can be saved to FLAC only.', { bad: true }); return false; }
    const file = await e.handle.getFile();
    if (file.size !== e.size || file.lastModified !== e.mtime) {
      const v = await ask({ title: 'Changed since loaded — reload?', text: `“${esc(e.title)}” was changed by another app after Mesh read it. Reload it to see the current tags; your unsaved ratings are kept.`, actions: [{ label: 'Reload', value: 'reload', kind: 'primary' }, { label: 'Cancel', value: 'cancel', cancel: true }] });
      if (v === 'reload') { await Library.refresh(path); renderSoon(); }
      return false;
    }
    const resume = A.now === path ? Player.release() : null;
    try {
      const root = Library.root;
      if (root && (await root.queryPermission({ mode: 'readwrite' })) !== 'granted' && (await root.requestPermission({ mode: 'readwrite' })) !== 'granted') throw Object.assign(new Error('Permission to edit files was not granted'), { name: 'NotAllowedError' });
      const parsed = await FlacTags.parse(file);
      const blob = await FlacTags.retag(file, parsed, Scheme.apply(parsed.entries, d.rating, d.comment));
      const w = await e.handle.createWritable({ keepExistingData: false });
      try { await w.write(blob); await w.close(); } catch (err) { try { await w.abort(); } catch {} throw err; }
      const fresh = await Library.refresh(path);
      if (JSON.stringify(fresh.rating) !== JSON.stringify(d.rating) || (fresh.comment || '') !== (d.comment || '').replace(/\s+/g, ' ').trim()) throw new Error('Verification failed: the saved tags read back differently');
      A.rate.drafts.delete(path);
      return true;
    } catch (err) {
      if (err.name === 'NotAllowedError' || err.name === 'SecurityError' || typeof e.handle.createWritable !== 'function') {
        A.ratingsBlocked = true;
        try { const all = JSON.parse(localStorage.getItem('mesh2.pendingRatings') || '{}'); all[path] = d; localStorage.setItem('mesh2.pendingRatings', JSON.stringify(all)); } catch {}
        toast('Saved in this browser — the files could not be written.', { bad: true });
        return false;
      }
      toast('Not saved: ' + (err.name === 'NoModificationAllowedError' ? 'the file is locked by another app. Close it in Serato and try again.' : err.message), { bad: true });
      return false;
    } finally { if (resume) await resume(); }
  }
  async function saveRating(path, advance) {
    if (A.rate.busy) return;
    A.rate.busy = true;
    const list = rateList(), idx = list.indexOf(path);
    const ok = await writeRating(path);
    A.rate.busy = false;
    if (!ok) { renderRate(); return; }
    toast('Saved to file');
    if (advance) {
      const after = rateList();
      const nextP = list.slice(idx + 1).find(p => after.includes(p)) || after.find(p => p !== path);
      if (nextP && nextP !== path) { rateSelect(nextP); return; }
      toast(A.rate.filter === 'todo' ? 'That was the last song to rate here.' : 'End of the list.');
    }
    renderRate(); renderNav();
  }
  async function saveAllDrafts() {
    for (const p of [...A.rate.drafts.keys()]) if (!(await writeRating(p))) return false;
    return true;
  }

  /* =================================================================== ADD MUSIC */
  function startAdd(prefill, returnTo, b) {
    A.add = { a: prefill || null, b: null, notes: '', editingTo: null, del: new Set(), returnTo: returnTo || 'home', more: false };
    if (b) setB(b, { silent: true });
  }
  function slotHTML(which) {
    const S = A.add, path = which === 'A' ? S.a : S.b, locked = which === 'B' && !S.a;
    if (!path) return `<div class="slot empty ${locked ? 'locked' : ''}" id="slot${which}"><button class="slot-btn" ${locked ? 'aria-disabled="true"' : ''} aria-label="${which === 'A' ? 'Choose the starting song' : 'Choose the destination song'}">
      <span class="plus">${ICON.plus}</span><span><span class="slot-lab" style="display:block">${which === 'A' ? 'Starting song' : 'Mixes into'}</span><span class="slot-hint">${locked ? 'Choose the starting song first' : 'Search your folder'}</span></span></button></div>`;
    const i = info(path);
    const tag = which === 'B' && S.editingTo != null ? '<span class="tag slot-tag">Editing existing</span>' : which === 'A' && i.song ? `<span class="tag slot-tag">id ${i.song.id} · ${i.out} out</span>` : '';
    return `<div class="slot filled" id="slot${which}">${tag}<button class="slot-btn" aria-label="Change ${which === 'A' ? 'starting' : 'destination'} song: ${esc(i.title)}">
      ${artHTML(path, 'hero')}
      <div class="slot-meta"><span class="t">${esc(i.title)}</span><span class="a">${esc(i.artist)}</span>
        <div class="chips">${bpmChip(i)}${keyChip(i)}${energyChip(i)}${i.flac ? pips(i.rating) : ''}</div>
        ${roleLangChips(i) ? `<div class="chips">${roleLangChips(i)}</div>` : ''}
        ${i.missing ? '<div class="chips"><span class="tag bad">File not found</span></div>' : ''}</div></button>
      <button class="icon-btn sm slot-x" aria-label="Clear ${which === 'A' ? 'starting' : 'destination'} song">${ICON.x}</button></div>`;
  }
  function renderAdd() {
    const v = $('#v-add'), S = A.add; if (!S) { startAdd(null, 'home'); return renderAdd(); }
    const both = !!(S.a && S.b), fill = S.a ? (S.b ? 2 : 1) : 0;
    const a = S.a && info(S.a), b = S.b && info(S.b), mv = both ? moveOf(a, b) : null;
    const src = S.a && MeshStore.byPath.get(S.a);
    const title = S.editingTo != null ? 'Edit transition' : S.del.size && !S.b ? 'Remove transitions' : 'New transition';
    v.innerHTML = `<div class="page">${bannersHTML()}
      <div class="toolbar"><button class="btn" id="add-back">${ICON.chevL} Back</button><h1 class="title-2 grow">${title}</h1>
        <button class="btn primary" id="add-ok" ${both || S.del.size ? '' : 'disabled'} title="Save (Ctrl+Enter)">${ICON.check} Done</button></div>
      <div class="stage">
        ${slotHTML('A')}
        <div class="connector ${mv ? 'tier-' + mv.tier : ''}">
          <div class="caps"><span>from</span><span>into</span></div>
          <div class="arrow" data-fill="${fill}"><span class="track"><i></i></span><svg class="head" viewBox="0 0 12 12"><path d="M1 1 11 6 1 11z" fill="currentColor"/></svg></div>
          ${both ? `${moveBadge(a, b)}<p class="advice">${esc(mv.desc)}</p><div class="chips" style="justify-content:center">${bpmDiff(a, b)}</div>` : `<p class="advice">${S.a ? 'Choose the song it mixes into.' : 'Choose two songs you know how to mix.'}</p>`}
        </div>
        ${slotHTML('B')}
      </div>
      ${both ? `<div class="notes-wrap"><label for="notes">Notes</label><textarea class="note" id="notes" rows="3" placeholder="How do you mix it? e.g. bass swap on the 2nd drop">${esc(S.notes)}</textarea></div>` : ''}
      ${S.a && !S.b ? suggestHTML(a) : ''}
      ${src && src.transitions.length ? existingHTML(src) : ''}
    </div>`;
    hydrate(v);
    $('#add-back').onclick = () => { const r = A.add?.returnTo || 'home'; A.add = null; go(r === 'add' ? 'home' : r); };
    $('#add-ok').onclick = commitAdd;
    v.querySelector('#slotA').onclick = e => { if (e.target.closest('.slot-x')) clearSlot('A'); else if (e.target.closest('.slot-btn')) pickSlot('A'); };
    v.querySelector('#slotB').onclick = e => { if (e.target.closest('.slot-x')) clearSlot('B'); else if (e.target.closest('.slot-btn')) pickSlot('B'); };
    const n = $('#notes'); if (n) n.oninput = () => { S.notes = n.value; };
    v.querySelectorAll('[data-suggest]').forEach(btn => btn.onclick = () => { setB(btn.dataset.suggest); });
    const more = $('#sg-more'); if (more) more.onclick = () => { S.more = true; renderAdd(); };
    const ex = $('#ex-list');
    if (ex) ex.onclick = e => {
      const ed = e.target.closest('[data-edit]'), dl = e.target.closest('[data-del]');
      if (ed) { const d = MeshStore.byId.get(+ed.dataset.edit); if (d) setB(d.path); }
      else if (dl) {
        const id = +dl.dataset.del;
        if (S.del.has(id)) S.del.delete(id);
        else { S.del.add(id); if (S.editingTo === id) Object.assign(S, { b: null, editingTo: null, notes: '' }); }
        renderAdd(); $(`[data-del="${id}"]`)?.focus();
      }
    };
  }
  function suggestHTML(a) {
    const e = Library.get(a.path);
    if (!e || !e.k || !e.bpm) return `<section class="suggest"><div class="section-h"><h2>Fits after this song</h2></div><p class="sub">Suggestions need a key and BPM. Analyse “${esc(a.title)}” in Serato first.</p></section>`;
    const src = MeshStore.byPath.get(a.path);
    const linked = new Set(src ? src.transitions.map(t => MeshStore.byId.get(t.to)?.path).filter(Boolean) : []);
    const all = Suggest.candidates(e, Library.entries.values(), linked, { tolerance: Prefs.get('tolerance'), filters: filters() });
    const shown = all.slice(0, A.add.more ? 48 : 12);
    if (!shown.length) return `<section class="suggest"><div class="section-h"><h2>Fits after this song</h2></div><p class="sub">No unlinked songs fit within ±${Prefs.get('tolerance')}% BPM${isFiltered() ? ' and the active filters' : ''}.</p></section>`;
    const groups = KeyRules.ORDER.map(t => [t, shown.filter(x => x.mv.tier === t)]).filter(g => g[1].length);
    return `<section class="suggest"><div class="section-h"><h2>Fits after this song</h2><span class="sub">${fmtN(all.length)} songs · ±${Prefs.get('tolerance')}% BPM</span></div>
      ${groups.map(([t, xs]) => `<div class="suggest-group tier-${t}"><h3><i></i>${KeyRules.TIERS[t].label}</h3><ul class="list">${xs.map(({ e: d }) => {
        const di = info(d.path);
        return `<li><button class="row" data-suggest="${esc(d.path)}">${artHTML(d.path)}<span class="meta"><span class="t">${esc(di.title)}</span><span class="a">${esc(di.artist)}</span></span>
          <span class="right">${moveBadge(a, di, { sm: true })}${bpmDiff(a, di)}${energyChip(di)}</span></button></li>`;
      }).join('')}</ul></div>`).join('')}
      ${all.length > shown.length ? `<button class="btn sm" id="sg-more">Show more</button>` : ''}</section>`;
  }
  function existingHTML(src) {
    const S = A.add, a = info(src.path);
    const rows = src.transitions.map(t => {
      const d = MeshStore.byId.get(t.to); if (!d) return '';
      const di = info(d.path), del = S.del.has(t.to), ed = S.editingTo === t.to;
      return `<div class="ex-row ${ed ? 'editing' : ''} ${del ? 'del' : ''}">
        <div class="song">${artHTML(d.path)}<span class="meta" style="min-width:0;display:flex;flex-direction:column"><span class="headline" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(di.title)}</span><span class="sub">${esc(di.artist)}</span></span></div>
        <div style="display:flex;flex-direction:column;gap:6px;min-width:0">${moveBadge(a, di, { sm: true })}<p class="ex-notes ${t.notes ? '' : 'none'}">${esc(t.notes || 'No notes')}</p></div>
        <div class="ex-act">
          <button class="icon-btn sm" data-edit="${t.to}" aria-label="Edit transition into ${esc(di.title)}" title="Edit" ${del ? 'disabled' : ''}>${ICON.edit}</button>
          <button class="icon-btn sm" data-del="${t.to}" aria-label="${del ? 'Undo delete of' : 'Delete'} transition into ${esc(di.title)}" title="${del ? 'Undo' : 'Delete'}">${del ? ICON.undo : ICON.trash}</button>
        </div></div>`;
    }).join('');
    return `<section class="existing"><div class="section-h"><h2>${esc(a.title)} already mixes into</h2><span class="sub">${src.transitions.length}${S.del.size ? ` · ${S.del.size} to delete` : ''}</span></div><div class="card" id="ex-list" style="padding:4px">${rows}</div></section>`;
  }
  function pickSlot(which) {
    const S = A.add;
    if (which === 'A') return Sheet.open({ title: 'Starting song', onPick: p => {
      if (S.a !== p) Object.assign(S, { a: p, b: null, notes: '', editingTo: null, del: new Set(), more: false });
      renderAdd(); setTimeout(() => $('#slotB .slot-btn')?.focus(), 60);
    } });
    if (!S.a) { toast('Choose the starting song first.'); $('#slotA .slot-btn')?.focus(); return; }
    const src = MeshStore.byPath.get(S.a), existing = new Set(src ? src.transitions.map(t => t.to) : []);
    Sheet.open({ title: 'Mixes into…', context: S.a, badge: p => {
      if (p === S.a) return '<span class="tag">Starting song</span>';
      const s = MeshStore.byPath.get(p); return s && existing.has(s.id) ? '<span class="tag">Existing · edit</span>' : defaultBadge(p);
    }, onPick: setB });
  }
  function setB(p, { silent } = {}) {
    const S = A.add;
    if (p === S.a) { toast("A song can't transition into itself."); return; }
    const src = MeshStore.byPath.get(S.a), dst = MeshStore.byPath.get(p);
    const ex = src && dst && src.transitions.find(t => t.to === dst.id);
    if (ex) { S.b = p; S.editingTo = ex.to; S.notes = ex.notes || ''; S.del.delete(ex.to); }
    else { if (S.editingTo != null) S.notes = ''; S.b = p; S.editingTo = null; }
    if (silent) return;
    renderAdd(); setTimeout(() => $('#notes')?.focus(), 380);
  }
  function clearSlot(which) {
    const S = A.add;
    if (which === 'A') Object.assign(S, { a: null, b: null, notes: '', editingTo: null, del: new Set() });
    else Object.assign(S, { b: null, editingTo: null, notes: '' });
    renderAdd(); $(`#slot${which} .slot-btn`)?.focus();
  }
  async function commitAdd() {
    const S = A.add; if (!S || !((S.a && S.b) || S.del.size) || readOnlyMesh()) return;
    let msg = '';
    if (S.a && S.del.size) {
      const s = MeshStore.byPath.get(S.a);
      if (s) { const before = s.transitions.length; s.transitions = s.transitions.filter(t => !S.del.has(t.to)); msg = `Removed ${before - s.transitions.length}`; }
    }
    if (S.a && S.b) {
      const snap = p => { const i = info(p); return { title: i.title, artist: i.artist === 'Unknown artist' ? '' : i.artist, bpm: i.bpm, key: i.k ? i.k.cam : (i.keyRaw || null) }; };
      const sa = MeshStore.ensureSong(S.a, snap(S.a)), sb = MeshStore.ensureSong(S.b, snap(S.b));   // A gets its id before B
      const t = sa.transitions.find(t => t.to === sb.id), now = nowISO();
      if (t) { if (t.notes !== S.notes) { t.notes = S.notes; t.modified = now; } msg = 'Transition updated' + (msg ? ` · ${msg.toLowerCase()}` : ''); }
      else { sa.transitions.push({ to: sb.id, notes: S.notes, created: now, modified: now }); msg = 'Transition added' + (msg ? ` · ${msg.toLowerCase()}` : ''); }
    }
    MeshStore.ver++;
    const ret = S.returnTo === 'add' ? 'home' : S.returnTo; A.add = null;
    await go(ret);
    toast(msg || 'Saved');
    await persist();
    render();
  }

  /* =================================================================== DJ */
  function djGo(path, { record = true } = {}) {
    if (record && A.setPath[A.setPath.length - 1] !== path) { A.setPath.push(path); if (A.setPath.length > 40) A.setPath.shift(); saveSetPath(); }
    A.dj.wheelKey = null; A.dj.fitsMore = false;
    Player.load(path, { autoplay: !player.paused });
    if (A.view === 'dj') renderDJ();
  }
  function djUndo() {
    if (A.setPath.length < 2) return;
    A.setPath.pop(); saveSetPath();
    djGo(A.setPath[A.setPath.length - 1], { record: false });
  }
  function branchesOf(path) {
    const i = info(path), s = i.song; if (!s) return { all: [], shown: [] };
    const f = filters(), tiers = new Set(f.tiers);
    const all = s.transitions.map(t => { const d = MeshStore.byId.get(t.to); if (!d) return null; const di = info(d.path); return { t, d, di, mv: moveOf(i, di), b: KeyRules.bpm(i.bpm, di.bpm) }; }).filter(Boolean);
    const shown = all.filter(x => (!(x.mv.tier in Suggest.TIER_RANK) || tiers.has(x.mv.tier)) && Suggest.passes({ rating: x.di.rating }, f));
    const sort = Prefs.get('sort');
    const rank = x => x.mv.tier in Suggest.TIER_RANK ? Suggest.TIER_RANK[x.mv.tier] : 3;
    shown.sort((x, y) => sort === 'energy' ? (y.di.rating.ENERGY || 0) - (x.di.rating.ENERGY || 0) || rank(x) - rank(y)
      : sort === 'bpm' ? (x.b ? x.b.abs : 99) - (y.b ? y.b.abs : 99)
      : rank(x) - rank(y) || (x.b ? x.b.abs : 99) - (y.b ? y.b.abs : 99));
    return { all, shown };
  }
  function renderDJ() {
    const v = $('#v-dj'); if (!MeshStore.mesh) return;
    const path = A.now;
    if (!path) {
      v.innerHTML = `<div class="page">${bannersHTML()}<div class="deck-empty"><div>${ICON.disc.replace('<svg', '<svg width="44" height="44" style="margin:0 auto 12px;opacity:.5"')}<p class="title-2" style="color:var(--label)">Deck empty</p><p>Jump to a song to start your set.</p><button class="btn primary lg" id="deck-jump" style="margin-top:10px">${ICON.search} Jump to a song</button></div></div></div>`;
      $('#deck-jump').onclick = M.openJump;
      return;
    }
    const i = info(path), s = i.song;
    const { all, shown } = branchesOf(path);
    const keepScroll = v.scrollTop;
    v.innerHTML = `<div class="page">${bannersHTML()}<div class="dj">
      <aside class="deck" aria-label="Deck">
        ${artHTML(path, 'hero')}
        <div class="deck-info">
          <span class="now">${player.paused ? 'CUED' : 'NOW PLAYING'}${s ? ` · id ${s.id}` : ' · not in mesh'}</span>
          <h1 class="title-1">${esc(i.title)}</h1>
          <span class="artist">${esc(i.artist)}</span>
          <div class="chips" style="margin-top:8px">${bpmChip(i)}${keyChip(i)}${energyChip(i)}${i.flac ? pips(i.rating) : ''}${roleLangChips(i)}</div>
          ${i.comment ? `<p class="deck-comment">“${esc(i.comment)}”</p>` : ''}
          ${i.missing ? '<div class="chips"><span class="tag bad">File not found</span></div>' : ''}
        </div>
        <div>${transportHTML()}</div>
        <div class="deck-tools">${miniWheel(i, all)}
          <div class="wheel-legend">${KeyRules.ORDER.map(t => `<span class="tier-${t}"><i></i>${KeyRules.TIERS[t].label}</span>`).join('')}<span><i class="dot"></i>Has a transition</span>
            ${A.dj.wheelKey ? `<span class="on-key">Suggest: ${esc(keyText(KeyRules.parse(A.dj.wheelKey)).main)} only <button class="btn plain sm" id="wk-clear">Clear</button></span>` : '<span class="foot">Tap a key to see songs in it.</span>'}</div>
        </div>
        ${setPathHTML()}
      </aside>
      <section aria-label="Branches">
        <div class="branches-h"><h2 class="title-2">Next</h2><span class="sub">${all.length ? `${shown.length}${shown.length !== all.length ? ` of ${all.length}` : ''}` : ''}</span><span class="grow"></span>
          <button class="btn sm" id="dj-sort">${ICON.sort} ${({ move: 'Move type', energy: 'Energy', bpm: 'Closest BPM' })[Prefs.get('sort')]}</button>
          <button class="btn sm" id="dj-filter" aria-haspopup="dialog">${ICON.filter} Filter${filterCount() ? ` <span class="badge-count">${filterCount()}</span>` : ''}</button>
          <button class="icon-btn filled" id="dj-jump" aria-label="Jump to a song (/)" title="Jump to (/)">${ICON.search}</button></div>
        <ol class="list" id="branches" style="list-style:none">${all.length
          ? (shown.length ? shown.map((x, n) => branchHTML(i, x, n)).join('') : `<li class="card dj-empty"><h3 class="title-3">All branches are filtered out</h3><p>${all.length} ${all.length === 1 ? 'branch is' : 'branches are'} hidden by the filters.</p><button class="btn" id="dj-reset">Reset filters</button></li>`)
          : `<li class="card dj-empty"><h3 class="title-3">No transitions from here yet</h3><p>Know a song that mixes out of “${esc(i.title)}”? Add it and it becomes a branch.</p></li>`}</ol>
        ${fitsHTML(i)}
        ${readOnlyMesh() ? '' : `<button class="btn add-from" id="dj-add"><span class="p">${ICON.plus}</span>Add a transition from this song</button>`}
      </section>
    </div></div>`;
    v.scrollTop = keepScroll;
    bindTransport(v);
    hydrate(v);
    $('#dj-jump').onclick = M.openJump;
    $('#dj-add') && ($('#dj-add').onclick = () => go('add', { prefill: path, returnTo: 'dj' }));
    $('#dj-reset') && ($('#dj-reset').onclick = resetFilters);
    $('#dj-filter').onclick = e => openFilterPop(e.currentTarget);
    $('#dj-sort').onclick = e => openSortPop(e.currentTarget);
    $('#wk-clear') && ($('#wk-clear').onclick = () => { A.dj.wheelKey = null; renderDJ(); });
    v.onclick = e => {
      const g = e.target.closest('[data-go]'); if (g) { djGo(g.dataset.go); return; }
      const tp = e.target.closest('[data-trail]'); if (tp) { const k = +tp.dataset.trail; A.setPath = A.setPath.slice(0, k + 1); saveSetPath(); djGo(A.setPath[k], { record: false }); return; }
      const ad = e.target.closest('[data-addfit]'); if (ad) { go('add', { prefill: path, b: ad.dataset.addfit, returnTo: 'dj' }); return; }
      const seg = e.target.closest('.miniwheel [data-key]'); if (seg) { A.dj.wheelKey = A.dj.wheelKey === seg.dataset.key ? null : seg.dataset.key; A.dj.fitsOpen = true; renderDJ(); return; }
      if (e.target.closest('#sp-undo')) djUndo();
      else if (e.target.closest('#sp-clear')) { A.setPath = [path]; saveSetPath(); renderDJ(); }
      else if (e.target.closest('#fits-more')) { A.dj.fitsMore = true; renderDJ(); }
    };
    $('#fits')?.addEventListener('toggle', e => { A.dj.fitsOpen = e.target.open; });
    $$('#branches .note').forEach(ta => {
      ta.onchange = async () => {
        const src = MeshStore.byId.get(+ta.dataset.from), t = src?.transitions.find(t => t.to === +ta.dataset.to);
        if (!t || t.notes === ta.value) return;
        t.notes = ta.value; t.modified = nowISO(); MeshStore.ver++; await persist();
      };
    });
  }
  function branchHTML(i, x, n) {
    const { t, d, di, mv } = x;
    return `<li class="branch tier-${mv.tier}" style="--i:${n}">
      <span class="idx" aria-hidden="true">${n < 9 ? n + 1 : '·'}</span>
      <div class="branch-body">
        <div class="branch-top">${moveBadge(i, di)}${bpmDiff(i, di)}</div>
        <p class="branch-tip">${esc(mv.desc)}</p>
        <textarea class="note" rows="1" data-from="${i.song.id}" data-to="${t.to}" placeholder="Add notes for this mix…" aria-label="Notes: ${esc(i.title)} into ${esc(di.title)}" ${readOnlyMesh() ? 'readonly' : ''}>${esc(t.notes || '')}</textarea>
        <button class="dest" data-go="${esc(d.path)}" aria-label="Play ${esc(di.title)} by ${esc(di.artist)}${n < 9 ? ` (key ${n + 1})` : ''}">${artHTML(d.path, 'md')}
          <span class="meta"><span class="t">${esc(di.title)}</span><span class="a">${esc(di.artist)}</span><span class="chips">${bpmChip(di)}${keyChip(di)}${energyChip(di)}${roleLangChips(di)}</span></span>
          <span class="go">${ICON.chevR}</span></button>
      </div></li>`;
  }
  function fitsHTML(i) {
    const e = Library.get(i.path);
    if (!e || !e.k || !e.bpm) return '';
    const s = MeshStore.byPath.get(i.path);
    const linked = new Set(s ? s.transitions.map(t => MeshStore.byId.get(t.to)?.path).filter(Boolean) : []);
    const all = Suggest.candidates(e, Library.entries.values(), linked, { tolerance: Prefs.get('tolerance'), filters: filters(), onlyKey: A.dj.wheelKey });
    const shown = all.slice(0, A.dj.fitsMore ? 60 : 12);
    return `<details class="disclose fits" id="fits" ${A.dj.fitsOpen ? 'open' : ''}><summary>${ICON.chevD} Fits, not yet tried <span class="muted">· ${fmtN(all.length)}${A.dj.wheelKey ? ` in ${esc(keyText(KeyRules.parse(A.dj.wheelKey)).main)}` : ''}</span></summary>
      ${shown.length ? `<ul class="list card" style="padding:4px;margin-top:6px">${shown.map(({ e: d }) => {
        const di = info(d.path);
        return `<li><div class="row" style="padding:6px 8px"><button class="row" style="padding:0;flex:1;min-width:0" data-go="${esc(d.path)}">${artHTML(d.path)}<span class="meta"><span class="t">${esc(di.title)}</span><span class="a">${esc(di.artist)}</span></span>
          <span class="right">${moveBadge(i, di, { sm: true })}${bpmDiff(i, di)}${energyChip(di)}</span></button>
          ${readOnlyMesh() ? '' : `<button class="icon-btn sm filled add-it" data-addfit="${esc(d.path)}" aria-label="Add transition into ${esc(di.title)}" title="Add as a transition">${ICON.plus}</button>`}</div></li>`;
      }).join('')}</ul>${all.length > shown.length ? '<button class="btn sm" id="fits-more" style="margin-top:8px">Show more</button>' : ''}`
        : `<p class="sub" style="padding:4px 4px 0">Nothing unlinked fits within ±${Prefs.get('tolerance')}% BPM${isFiltered() || A.dj.wheelKey ? ' and the current filters' : ''}.</p>`}</details>`;
  }
  function setPathHTML() {
    const sp = A.setPath, start = Math.max(0, sp.length - 10);
    if (sp.length < 1) return '';
    return `<div class="setpath"><div class="setpath-h"><span class="sub">Set path · ${sp.length}</span>
        <button class="btn plain sm" id="sp-undo" ${sp.length < 2 ? 'disabled' : ''} title="Back one song (Backspace)">${ICON.undo} Undo</button>
        <button class="btn plain sm" id="sp-clear" ${sp.length < 2 ? 'disabled' : ''}>Clear</button></div>
      <div class="trail" id="trail">${sp.slice(start).map((p, k) => {
        const i = info(p), kt = keyText(i.k), idx = start + k, cur = idx === sp.length - 1;
        return `${k ? `<span class="sep">${ICON.chevR}</span>` : ''}<button class="${cur ? 'cur' : ''}" data-trail="${idx}" title="${esc(i.title)}">${artHTML(p, 'xs')}<span>${esc(i.title)}</span>${kt ? `<small>${esc(kt.main)}</small>` : ''}</button>`;
      }).join('')}</div></div>`;
  }
  /* Mini Key Wheel: current key in the centre, Key Wheel colours and rings, tier outlines on targets, a dot on keys you have a transition into. */
  function miniWheel(i, branches) {
    const C = 100, R = { in0: 33, in1: 62, out0: 63, out1: 97 };
    const pt = (a, r) => [C + r * Math.sin(a), C - r * Math.cos(a)];
    const arc = (n, r0, r1) => {
      const mid = (n % 12) * Math.PI / 6, h = Math.PI / 12 - 0.014, a0 = mid - h, a1 = mid + h;
      const [x0, y0] = pt(a0, r1), [x1, y1] = pt(a1, r1), [x2, y2] = pt(a1, r0), [x3, y3] = pt(a0, r0);
      return `M${x0.toFixed(2)},${y0.toFixed(2)} A${r1},${r1} 0 0 1 ${x1.toFixed(2)},${y1.toFixed(2)} L${x2.toFixed(2)},${y2.toFixed(2)} A${r0},${r0} 0 0 0 ${x3.toFixed(2)},${y3.toFixed(2)} Z`;
    };
    const c = i.k, tiers = new Set(filters().tiers);
    const targets = {};
    if (c) KeyRules.moves(c.n, c.m).forEach(t => { if (tiers.has(t.tier) && !targets[t.n + t.m]) targets[t.n + t.m] = t; });
    const have = new Set(branches.map(x => x.di.k?.cam).filter(Boolean));
    const light = document.documentElement.dataset.theme === 'light';
    let segs = '', dots = '';
    const items = [];
    for (let n = 1; n <= 12; n++) for (const m of ['A', 'B']) { const k = n + m, isCur = c && c.cam === k, t = targets[k]; items.push({ n, m, k, isCur, t, rank: isCur ? 2 : t ? 1 : 0 }); }
    items.sort((a, b) => a.rank - b.rank);
    for (const it of items) {
      const [r0, r1] = it.m === 'A' ? [R.in0, R.in1] : [R.out0, R.out1];
      const sel = A.dj.wheelKey === it.k;
      const op = it.isCur || it.t || sel ? 1 : 0.16;
      const stroke = it.isCur ? (light ? '#111' : '#fff') : sel ? (light ? '#111' : '#fff') : it.t ? KeyRules.TIERS[it.t.tier].hex : 'none';
      const sw = it.isCur ? 3 : sel ? 3 : it.t ? 2.4 : 0;
      const mid = (it.n % 12) * Math.PI / 6, [tx, ty] = pt(mid, (r0 + r1) / 2);
      const kt = keyText(KeyRules.key(it.n, it.m));
      const label = `${kt.main}${it.t ? ' · ' + it.t.word : ''}${have.has(it.k) ? ' · has a transition' : ''}`;
      segs += `<g style="opacity:${op}"><path data-key="${it.k}" d="${arc(it.n, r0, r1)}" fill="${KeyRules.fill(it.n, it.m)}" stroke="${stroke}" stroke-width="${sw}" stroke-linejoin="round" role="button" aria-label="${esc(label)}"><title>${esc(label)}</title></path>
        <text x="${tx.toFixed(1)}" y="${ty.toFixed(1)}" text-anchor="middle" dominant-baseline="central" font-size="${kt.main.length > 2 ? 7.4 : 8.6}" fill="#0b0b10">${esc(kt.main)}</text></g>`;
      if (have.has(it.k)) { const [dx, dy] = pt(mid, it.m === 'A' ? r0 + 5 : r1 - 5); dots += `<circle cx="${dx.toFixed(1)}" cy="${dy.toFixed(1)}" r="2.6" fill="${light ? '#111' : '#fff'}" stroke="rgba(0,0,0,.35)" stroke-width=".6"/>`; }
    }
    const ct = c ? keyText(c) : null;
    return `<svg class="miniwheel" viewBox="0 0 200 200" role="group" aria-label="Key Wheel${c ? ' for ' + esc(c.full) : ''}">${segs}${dots}
      <circle cx="${C}" cy="${C}" r="${R.in0 - 3}" fill="var(--bg-elev)" stroke="var(--sep-strong)"/>
      <text x="${C}" y="${C - 5}" text-anchor="middle" dominant-baseline="central" font-size="17" fill="var(--label)" font-weight="700">${ct ? esc(ct.main) : '?'}</text>
      <text x="${C}" y="${C + 11}" text-anchor="middle" dominant-baseline="central" font-size="7.5" fill="var(--label-2)">${c ? esc(ct.alt) : 'no key'}</text></svg>`;
  }
  function resetFilters() { Prefs.set('tiers', ['harmonic', 'energy', 'creative']); Prefs.set('roles', []); Prefs.set('minEnergy', 0); Prefs.set('langs', []); A.dj.wheelKey = null; Pop.close(true); renderSoon(); }
  function openFilterPop(anchor) {
    const draw = el => {
      const f = filters();
      el.innerHTML = `<h4>Key moves</h4><div class="tier-toggle">${KeyRules.ORDER.map(t => `<button class="pill tier-${t}" data-tier="${t}" aria-pressed="${f.tiers.includes(t)}"><i></i>${KeyRules.TIERS[t].label}</button>`).join('')}</div>
        <h4>Role</h4><div class="pills">${Scheme.ROLES.map(r => `<button class="pill" data-role="${r.id}" aria-pressed="${f.roles.includes(r.id)}">${r.label}</button>`).join('')}</div>
        <h4>Minimum energy</h4>${seg('minE', [['0', 'Any'], ['1', '1'], ['2', '2'], ['3', '3'], ['4', '4'], ['5', '5']], f.minEnergy, 'full')}
        <h4>Language</h4><div class="pills">${Scheme.LANGUAGES.map(l => `<button class="pill" data-lang="${l.id}" aria-pressed="${f.langs.includes(l.id)}">${l.label}</button>`).join('')}</div>
        <div class="row2"><span class="foot">Applies to branches and suggestions</span><button class="btn plain sm" id="f-reset" ${isFiltered() ? '' : 'disabled'}>Reset</button></div>`;
      requestAnimationFrame(() => placeThumbs(el));
      const upd = () => { draw(el); renderDJ(); const b = $('#dj-filter'); if (b) Pop.anchor = b; };
      $$('[data-tier]', el).forEach(b => b.onclick = () => { const t = f.tiers.slice(); toggleIn(t, b.dataset.tier); Prefs.set('tiers', KeyRules.ORDER.filter(x => t.includes(x))); upd(); });
      $$('[data-role]', el).forEach(b => b.onclick = () => { const r = f.roles.slice(); toggleIn(r, b.dataset.role); Prefs.set('roles', r); upd(); });
      $$('[data-lang]', el).forEach(b => b.onclick = () => { const r = f.langs.slice(); toggleIn(r, b.dataset.lang); Prefs.set('langs', r); upd(); });
      bindSeg(el, 'minE', v => { Prefs.set('minEnergy', +v); renderDJ(); const b = $('#dj-filter'); if (b) Pop.anchor = b; });
      $('#f-reset', el).onclick = () => { resetFilters(); };
    };
    Pop.open(anchor, '', draw, { width: 330 });
  }
  function openSortPop(anchor) {
    const cur = Prefs.get('sort');
    Pop.open(anchor, `<div class="menu" role="menu">${[['move', 'Move type'], ['energy', 'Energy'], ['bpm', 'Closest BPM']].map(([v, l]) => `<button role="menuitemradio" aria-checked="${cur === v}" data-sort="${v}">${ICON.check}${l}</button>`).join('')}</div>`, el => {
      $$('[data-sort]', el).forEach(b => b.onclick = () => { Prefs.set('sort', b.dataset.sort); Pop.close(true); renderDJ(); $('#dj-sort')?.focus(); });
    }, { width: 200 });
  }

  /* =================================================================== SETTINGS */
  function applyTheme() {
    const t = Prefs.get('theme');
    const eff = t === 'system' ? (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark') : t;
    document.documentElement.dataset.theme = eff;
    const m = document.querySelector('meta[name="theme-color"]'); if (m) m.content = eff === 'light' ? '#f5f5f7' : '#101014';
  }
  matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => { if (Prefs.get('theme') === 'system') { applyTheme(); renderSoon(); } });
  function openSettings(anchor) {
    Pop.open(anchor, `<h4>Key notation</h4>${seg('not', [['camelot', 'Camelot · 8A'], ['names', 'Key names · Am']], Prefs.get('notation'), 'full')}
      <h4>Appearance</h4>${seg('theme', [['dark', 'Dark'], ['light', 'Light'], ['system', 'Match system']], Prefs.get('theme'), 'full')}
      <h4>BPM tolerance for suggestions</h4>${seg('tol', [['3', '±3%'], ['6', '±6%'], ['8', '±8%']], Prefs.get('tolerance'), 'full')}
      <div class="row2"><span class="foot">Mesh ${APP_VERSION}</span><button class="btn plain sm danger" id="set-reset">Reset this device</button></div>
      <div class="row2" style="margin-top:8px"><button class="btn sm" id="set-switch">${ICON.folder} Switch folder or mesh</button>${MeshStore.memoryOnly ? `<button class="btn sm" data-act="download">${ICON.download} .mesh</button>` : ''}</div>`, el => {
      requestAnimationFrame(() => placeThumbs(el));
      bindSeg(el, 'not', v => { Prefs.set('notation', v); renderSoon(); });
      bindSeg(el, 'theme', v => { Prefs.set('theme', v); applyTheme(); requestAnimationFrame(() => placeThumbs(el)); renderSoon(); });
      bindSeg(el, 'tol', v => { Prefs.set('tolerance', +v); renderSoon(); });
      $('#set-reset', el).onclick = async () => {
        Pop.close(true);
        const ok = await ask({ title: 'Reset this device?', text: 'Notation, theme, filters, BPM tolerance and set paths go back to their defaults. Your files and .mesh are not touched.', actions: [{ label: 'Reset', value: true, kind: 'danger' }, { label: 'Cancel', value: false, cancel: true }] });
        if (ok) { Prefs.reset(); A.setPath = A.now ? [A.now] : []; applyTheme(); renderSoon(); toast('Settings reset.'); }
      };
      $('#set-switch', el).onclick = async () => { Pop.close(true); if (await go('home')) M.backToOpen(); };
    }, { width: 340 });
  }
  $('#btn-settings').innerHTML = ICON.gear;
  $('#btn-settings').onclick = e => openSettings(e.currentTarget);

  /* =================================================================== keyboard (design plan §11) */
  document.addEventListener('keydown', e => {
    if (A.view === 'open' || !$('#dialog').hidden) return;
    const el = document.activeElement, typing = /^(INPUT|TEXTAREA|SELECT)$/.test(el?.tagName) && el.type !== 'range';
    if (Sheet.isOpen) { if (e.key === 'Escape') { e.preventDefault(); Sheet.close(); } return; }
    if (Pop.isOpen && e.key === 'Escape') { e.preventDefault(); Pop.close(); return; }
    const mod = e.ctrlKey || e.metaKey;
    if (A.view === 'add') {
      if (e.key === 'Enter' && mod) { e.preventDefault(); commitAdd(); }
      else if (e.key === 'Escape') { e.preventDefault(); if (typing) el.blur(); else $('#add-back')?.click(); }
      else if (!typing && e.key === '/') { e.preventDefault(); pickSlot(A.add?.a ? 'B' : 'A'); }
      return;
    }
    if (A.view === 'rate' && e.key === 'Enter' && (mod || !typing || el.id === 'rate-comment')) {
      if (el?.tagName === 'BUTTON' && !mod) return;
      e.preventDefault(); if (A.now) (A.rate.drafts.has(A.now) ? saveRating(A.now, true) : stepRate(1)); return;
    }
    if (typing) { if (e.key === 'Escape') el.blur(); return; }
    if (e.altKey || mod) return;
    if (e.key === '/') { e.preventDefault(); M.openSearch(); return; }
    if (e.key === 'Escape') { if (A.view !== 'home') go('home'); return; }
    if (A.view === 'rate' || A.view === 'dj') {
      if (e.key === ' ' && el?.tagName !== 'BUTTON') { e.preventDefault(); Player.toggle(); return; }
      if (e.key === 'ArrowLeft') { e.preventDefault(); Player.skip(-10); return; }
      if (e.key === 'ArrowRight') { e.preventDefault(); Player.skip(10); return; }
      if ((e.key === '+' || e.key === '=') && A.now && !readOnlyMesh()) { go('add', { prefill: A.now, returnTo: A.view }); return; }
    }
    if (A.view === 'rate') {
      if (e.key === '[') stepRate(-1);
      else if (e.key === ']') stepRate(1);
      else if ((e.key === 'c' || e.key === 'C' || e.key === 'p' || e.key === 'P') && A.now && Library.get(A.now)?.flac) $(`#rate-page [data-role="${e.key.toLowerCase() === 'c' ? 'chill' : 'peak'}"]`)?.click();
    }
    if (A.view === 'dj') {
      if (/^[1-9]$/.test(e.key)) { const b = $$('#branches .dest')[+e.key - 1]; if (b) djGo(b.dataset.go); }
      else if (e.key === 'Backspace') { e.preventDefault(); djUndo(); }
    }
  });
  addEventListener('beforeunload', e => { if (A.rate.drafts.size || (MeshStore.memoryOnly && MeshStore.dirty())) { e.preventDefault(); e.returnValue = ''; } });
  addEventListener('resize', () => placeThumbs());

  /* =================================================================== boot */
  Object.assign(M, { startAdd, renderRate, renderAdd, renderDJ, djGo, rateSelect, pickSlot, saveAllDrafts });
  applyTheme();
  (async function boot() {
    if (!('showDirectoryPicker' in window)) { $('#open-unsupported').hidden = false; $('#btn-pick').disabled = true; return; }
    $('#btn-pick').addEventListener('click', M.pickFolder);
    try {
      const last = await idb.get('lastRoot');
      if (last && last.kind === 'directory') {
        const b = $('#btn-reopen'); b.hidden = false; $('b', b).textContent = last.name;
        b.onclick = () => M.openRoot(last).catch(e => toast(e.message, { bad: true }));
      }
    } catch {}
    if ('serviceWorker' in navigator && location.protocol.startsWith('http') && !/^(localhost|127\.)/.test(location.hostname)) navigator.serviceWorker.register('sw.js').catch(() => {});
  })();
})();
