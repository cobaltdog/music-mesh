#!/usr/bin/env python3
"""End-to-end checks for Mesh v2 in Chrome (design plan §12), against the generated test library.

Setup:  python3 tests/make_library.py SITE/testlib   (also writes SITE/testlib-files.json)
        link the repo as SITE/app, then serve SITE:  python3 -m http.server 8765 -d SITE
Run:    python3 tests/e2e.py [http://localhost:8765] [screenshot-dir]
"""
import asyncio, json, os, sys
from playwright.async_api import async_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:8765'
SHOTS = sys.argv[2] if len(sys.argv) > 2 else 'shots'
HERE = os.path.dirname(os.path.abspath(__file__))
os.makedirs(SHOTS, exist_ok=True)
passed = 0

def check(cond, name):
    global passed
    if not cond: raise AssertionError(name)
    passed += 1; print('  ✓', name)

async def mesh_json(pg):
    return json.loads(await pg.evaluate("__fs.text('My Sets.mesh')"))

async def open_app(b, theme, w=1440, h=900, mobile=False):
    ctx = await b.new_context(viewport={'width': w, 'height': h}, device_scale_factor=2, color_scheme=theme, is_mobile=mobile, has_touch=mobile)
    pg = await ctx.new_page()
    errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' and '404' not in m.text else None)
    await pg.add_init_script(path=os.path.join(HERE, 'fakefs.js'))
    await pg.goto(BASE + '/app/index.html')
    return ctx, pg, errs

async def pick(pg):
    await pg.click('#btn-pick')
    await pg.wait_for_selector('#v-home .large-title')
    await pg.wait_for_function("document.querySelector('#scanline') && document.querySelector('#scanline').hidden", timeout=30000)
    await pg.wait_for_timeout(900)

async def shot(pg, name):
    await pg.wait_for_timeout(700)
    await pg.screenshot(path=os.path.join(SHOTS, name + '.png'))

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--autoplay-policy=no-user-gesture-required'])

        # ---------------- dark, desktop: full workflow ----------------
        ctx, pg, errs = await open_app(b, 'dark')
        await shot(pg, '01-open-dark')
        await pick(pg)
        m = await mesh_json(pg)
        check(m['version'] == 2 and m['writtenBy'].startswith('Mesh 2'), '.mesh upgraded to v2 on first save')
        check(m['futureField'] == {'kept': True}, 'unknown fields are kept')
        bk = json.loads(await pg.evaluate("__fs.text('My Sets.v1-backup.mesh')"))
        check(bk['version'] == 1 and len(bk['songs']) == len(m['songs']), 'v1 backup written with the original content')
        check([s['id'] for s in bk['songs']] == [s['id'] for s in m['songs']] and sum(len(s['transitions']) for s in m['songs']) == 13, 'every id and transition intact')
        check(all(t['notes'] == u['notes'] for s, o in zip(m['songs'], bk['songs']) for t, u in zip(s['transitions'], o['transitions'])), 'every note intact')
        txt = await pg.inner_text('#v-home')
        check('1 unreadable file' in txt and '26' in txt, 'unreadable file counted, _Serato_ and dot-files skipped')
        check('11' in await pg.inner_text('#nav'), 'Rate badge shows songs to rate')
        await shot(pg, '02-home-dark')

        # search sheet
        await pg.keyboard.press('/')
        await pg.wait_for_selector('#sheet.on')
        await pg.fill('#sheet-q', 'drop the vocal')
        await pg.wait_for_timeout(300)
        check('Raat Ki Rani' in await pg.inner_text('#sheet-list'), 'search matches song comments')
        await pg.fill('#sheet-q', '')
        await pg.click('#sf-toggle'); await pg.click('#sheet-filters [data-lang="hi"]')
        await pg.wait_for_timeout(300)
        res = await pg.inner_text('#sheet-list')
        check('Raat Ki Rani' in res and 'Glass Hours' not in res, 'language filter chip filters results')
        await shot(pg, '03-search-dark')
        await pg.keyboard.press('Escape')

        # ---------------- Rate ----------------
        await pg.click('#nav [data-go="rate"]')
        await pg.wait_for_selector('#rate-page .board')
        await shot(pg, '04-rate-dark')
        first = await pg.get_attribute('#rate-list .row[aria-current="true"]', 'data-path')
        orig = await pg.evaluate("p => __fs.b64(p)", first)
        await pg.click('.stars[data-rk="SINGALONG"] [data-n="4"]')
        await pg.click('.stars[data-rk="ENERGY"] [data-n="5"]')
        await pg.click('.stars[data-rk="GROOVE"] [data-n="3"]')
        await pg.click('.stars[data-rk="ICONIC"] [data-n="2"]')
        await pg.keyboard.press('p')
        await pg.click('#rate-page [data-lang="en"]'); await pg.click('#rate-page [data-lang="hi"]')
        await pg.fill('#rate-comment', 'mix out early')
        await pg.wait_for_timeout(200)
        check(await pg.locator('#rate-list .unsaved-dot').count() == 1, 'unsaved dot on the edited track')
        await pg.click('#rate-page .disclose summary')
        await shot(pg, '05-rate-editing-dark')
        await pg.click('#rate-next')
        await pg.wait_for_timeout(900)
        tags = await pg.evaluate("""async p => { const b = await __fs.bytes(p); const r = await FlacTags.parse(new Blob([b])); return r.tags; }""", first)
        check(tags['GROUPING'][0].endswith('SNG4 NRG5 GRV3 ICN2'), 'GROUPING codes written')
        check(tags['COMMENT'][0] == 'mix out early #peak @en @hi', 'COMMENT = free text + tokens')
        check(tags['DESCRIPTION'][0] == '#peak @en @hi' and tags['ENERGY'][0] == '5' and tags['LANGUAGE'][0] == 'en;hi', 'DESCRIPTION and custom fields written')
        check(tags['SERATO_MARKERS_V2'][0].startswith('AQFD'), 'other tags kept')
        same = await pg.evaluate("""async ([p, o]) => {
          const nb = await __fs.bytes(p), ob = Uint8Array.from(atob(o), c => c.charCodeAt(0));
          const a = await FlacTags.parse(new Blob([ob])), b = await FlacTags.parse(new Blob([nb]));
          const eq = (x, y) => x.length === y.length && x.every((v, i) => v === y[i]);
          const blocks = t => a.blocks.filter(k => k.type === t).every((k, i) => { const j = b.blocks.filter(k => k.type === t)[i]; return eq(ob.subarray(k.offset, k.offset + k.length), nb.subarray(j.offset, j.offset + j.length)); });
          return blocks(0) && blocks(6) && eq(ob.subarray(a.audioOffset), nb.subarray(b.audioOffset)); }""", [first, orig])
        check(same, 'STREAMINFO, pictures and audio bytes unchanged')
        cur = await pg.get_attribute('#rate-list .row[aria-current="true"]', 'data-path')
        check(cur != first, 'Save & next moved on')
        # changed-on-disk check
        await pg.click('.stars[data-rk="SINGALONG"] [data-n="2"]')
        await pg.evaluate("p => __fs.touch(p)", cur)
        await pg.click('#rate-save')
        await pg.wait_for_selector('#dialog.on')
        check('Changed since loaded' in await pg.inner_text('#dialog'), 'file changed after load is refused')
        await pg.click('#dialog .btn.primary'); await pg.wait_for_timeout(500)
        # locked file
        await pg.evaluate("p => __fs.lock(p)", cur)
        await pg.click('#rate-save'); await pg.wait_for_timeout(600)
        check('Close it in Serato' in await pg.inner_text('#toast'), 'locked file gives the Serato message')
        await pg.evaluate("p => __fs.lock(p, false)", cur)
        # leaving with unsaved ratings
        await pg.click('#nav [data-go="home"]')
        await pg.wait_for_selector('#dialog.on')
        check('Save your ratings?' in await pg.inner_text('#dialog'), 'leave prompt: Save / Discard / Stay')
        await pg.click('#dialog [data-i="1"]'); await pg.wait_for_timeout(500)
        # MP3 board greyed
        await pg.click('#nav [data-go="rate"]'); await pg.click('#v-rate [data-v="all"]')
        await pg.click('#rate-list [data-path$="Tape Deck Summer.mp3"]'); await pg.wait_for_timeout(400)
        check('FLAC only' in await pg.inner_text('#rate-page'), 'MP3 rating board greyed out')

        # ---------------- Add music ----------------
        await pg.click('#nav [data-go="add"]')
        await pg.wait_for_selector('#slotA')
        await shot(pg, '06-add-empty-dark')
        await pg.click('#slotA .slot-btn'); await pg.fill('#sheet-q', 'glass hours'); await pg.wait_for_timeout(200); await pg.keyboard.press('Enter')
        await pg.wait_for_selector('.suggest')
        sg = await pg.inner_text('.suggest')
        check('Midnight Circuit' not in sg and 'Low Tide Club' not in sg, 'Suggest never lists a song already linked')
        await shot(pg, '07-add-suggest-dark')
        first_s = await pg.get_attribute('.suggest [data-suggest]', 'data-suggest')
        await pg.click('.suggest [data-suggest]')
        await pg.wait_for_selector('#notes')
        await pg.fill('#notes', 'filter swap on the breakdown')
        await shot(pg, '08-add-both-dark')
        await pg.keyboard.press('Control+Enter')
        await pg.wait_for_timeout(800)
        m = await mesh_json(pg)
        gh = next(s for s in m['songs'] if s['title'] == 'Glass Hours')
        dst = next(s for s in m['songs'] if s['path'] == first_s)
        check(any(t['to'] == dst['id'] and t['notes'] == 'filter swap on the breakdown' for t in gh['transitions']), 'new transition saved to .mesh')

        # ---------------- DJ ----------------
        await pg.click('#nav [data-go="home"]'); await pg.wait_for_timeout(300)
        await pg.keyboard.press('/')
        await pg.fill('#sheet-q', 'midnight circuit'); await pg.wait_for_timeout(200); await pg.keyboard.press('Enter')
        await pg.wait_for_selector('#branches .branch')
        await pg.wait_for_timeout(500)
        await shot(pg, '09-dj-dark')
        check(await pg.locator('#trail, .setpath').count() == 0, '2.1: set path removed')
        check(await pg.locator('.wheel-legend').count() == 0 and await pg.locator('#wheel-info').count() == 1, '2.1: legend moved behind the i button')
        await pg.click('#wheel-info'); await pg.wait_for_selector('#popover.on')
        check('Creative' in await pg.inner_text('#popover'), '2.1: i button shows the legend')
        await pg.keyboard.press('Escape')
        ww = await pg.evaluate("document.querySelector('.miniwheel').getBoundingClientRect().width")
        check(ww >= 300, f'2.1: wheel is larger ({ww:.0f}px)')
        chips = await pg.inner_text('#branches .dest .chips >> nth=0')
        check('Singalong' in chips and 'Energy' in chips, '2.1: Singalong + Energy shown by default')
        check(await pg.locator('#branches .chip.rt b.r4, #branches .chip.rt b.r5').count() > 0, '2.1: rating numbers coloured by value')
        check(await pg.locator('#branches .branch.s-tier').count() == 1 and 'Paper Lanterns' in await pg.inner_text('#branches .branch.s-tier'), '2.1: S-Tier gold border (Paper Lanterns: 5/4/4/4)')
        await pg.click('#dj-sort'); await pg.wait_for_selector('#popover.on')
        menu = await pg.inner_text('#popover')
        check(all(x in menu for x in ['Singalong', 'Groove', 'Iconic']), '2.1: sort offers every rating tag')
        await pg.click('#popover [data-sort="SINGALONG"]'); await pg.wait_for_timeout(400)
        first = await pg.inner_text('#branches .dest .t >> nth=0')
        check(first == 'Paper Lanterns', '2.1: sort by Singalong puts the highest first')
        await pg.click('#fits summary'); await pg.wait_for_timeout(300)
        check('by singalong' in await pg.inner_text('#fits summary'), '2.1: sort applies to Fits, not yet tried')
        await pg.hover('#branches .dest >> nth=0'); await pg.wait_for_timeout(450)
        hc = await pg.inner_text('#hovercard')
        check(all(x in hc for x in ['Singalong', 'Energy', 'Groove', 'Iconic']), '2.1: hover card shows all star ratings')
        await shot(pg, '09b-dj-hover-dark')
        await pg.mouse.move(5, 5)
        await pg.click('#dj-sort'); await pg.click('#popover [data-sort="move"]'); await pg.wait_for_timeout(300)
        await pg.click('#fits summary'); await pg.wait_for_timeout(200)
        await pg.click('#fits summary'); await pg.wait_for_timeout(300)
        await pg.click('#dj-filter'); await pg.wait_for_selector('#popover.on')
        await shot(pg, '10-dj-filter-dark')
        for t in ['harmonic', 'energy', 'creative']: await pg.click(f'#popover [data-tier="{t}"]')
        await pg.wait_for_timeout(300)
        check('All branches are filtered out' in await pg.inner_text('#v-dj'), 'everything filtered → message + reset')
        await pg.keyboard.press('Escape'); await pg.click('#dj-reset'); await pg.wait_for_timeout(300)
        await pg.click('#btn-settings'); await pg.wait_for_selector('#popover.on')
        await pg.click('#popover [data-tag="GROOVE"]'); await pg.wait_for_timeout(300)
        chips = await pg.inner_text('.deck-info .chips')
        check('Groove' in chips and 'Energy' in chips and 'Singalong' not in chips, '2.1: Settings picks the two tags (oldest choice drops off)')
        await pg.click('#popover [data-tag="SINGALONG"]'); await pg.wait_for_timeout(200)
        await pg.click('#popover [data-v="names"]'); await pg.wait_for_timeout(400)
        await shot(pg, '11-settings-dark')
        check('Am' in await pg.inner_text('.deck-info'), 'key-name notation applies')
        await pg.click('#popover [data-v="camelot"]'); await pg.keyboard.press('Escape')
        check(not errs, 'no script errors: ' + '; '.join(errs[:3]))
        await ctx.close()

        # ---------------- light theme ----------------
        ctx, pg, errs = await open_app(b, 'light')
        await shot(pg, '12-open-light'); await pick(pg)
        await shot(pg, '13-home-light')
        await pg.click('#nav [data-go="rate"]'); await pg.wait_for_selector('#rate-page .board'); await shot(pg, '14-rate-light')
        await pg.keyboard.press('/'); await pg.fill('#sheet-q', 'paper lanterns'); await pg.wait_for_timeout(200); await pg.keyboard.press('Enter')
        await pg.click('#nav [data-go="dj"]'); await pg.wait_for_selector('.deck-info'); await shot(pg, '15-dj-light')
        await pg.click('#dj-add'); await pg.wait_for_selector('.suggest'); await shot(pg, '16-add-light')
        check(not errs, 'no script errors (light): ' + '; '.join(errs[:3]))
        await ctx.close()

        # ---------------- phone width ----------------
        ctx, pg, errs = await open_app(b, 'dark', 390, 844, True)
        await pick(pg)
        await shot(pg, '17-phone-home')
        await pg.click('#tabbar [data-search]'); await pg.fill('#sheet-q', 'glass'); await pg.wait_for_timeout(200); await shot(pg, '18-phone-search'); await pg.keyboard.press('Enter')
        await pg.click('#tabbar [data-go="dj"]'); await pg.wait_for_selector('.deck-info'); await shot(pg, '19-phone-dj')
        await pg.screenshot(path=os.path.join(SHOTS, '19b-phone-dj-full.png'), full_page=True)
        await pg.click('#tabbar [data-go="rate"]'); await pg.wait_for_selector('#rate-page .board'); await shot(pg, '20-phone-rate')
        await pg.click('#tabbar [data-go="add"]'); await shot(pg, '21-phone-add')
        sw = await pg.evaluate('document.documentElement.scrollWidth')
        check(sw <= 390, f'no horizontal overflow at 390 px (scrollWidth {sw})')
        check(not errs, 'no script errors (phone): ' + '; '.join(errs[:3]))
        await ctx.close()
        await b.close()
    print(f'\n{passed} checks passed')

asyncio.run(main())
