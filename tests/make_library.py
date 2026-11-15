#!/usr/bin/env python3
"""Generate the Mesh v2 test library (design plan §12): fictional songs, never real files.

Usage: python3 tests/make_library.py OUT_DIR
Needs ffmpeg and Pillow. Creates FLACs with Serato-style tags, Music Manager ratings on some,
hand-typed Grouping codes on one, an MP3, an unreadable file, a _Serato_ folder, a cover.jpg
fallback, and a v1 .mesh file with transitions and notes.
"""
import json, math, os, random, subprocess, sys
from PIL import Image, ImageDraw, ImageFilter

OUT = sys.argv[1] if len(sys.argv) > 1 else 'testlib'
random.seed(7)

# folder, title, artist, bpm, key, rating(SNG,NRG,GRV,ICN,roles,langs) or None, comment, hue
SONGS = [
    ('House', 'Glass Hours', 'Kairo', 125, '9A', (4, 3, 4, 3, ['chill'], ['en']), 'skip the long intro', 262),
    ('House', 'Midnight Circuit', 'Nova Lane', 124, '8A', (3, 4, 5, 2, ['peak'], ['en']), '', 200),
    ('House', 'Paper Lanterns', 'Ilse Varga', 126, '10A', (5, 4, 4, 4, ['peak'], ['en', 'fr']), 'big singalong at 2:10', 18),
    ('House', 'Low Tide Club', 'Marrow & Finch', 123, '9B', None, '', 168),
    ('House', 'Satellite Hearts', 'Kairo', 127, '11B', (2, 5, 4, 3, ['peak'], ['inst']), '', 300),
    ('House', 'Saltwater', 'Odessa Gray', 122, '7A', None, 'great for warm-up', 190),
    ('House', 'Velvet Static', 'Nova Lane', 125, '8B', (3, 3, 4, 2, ['chill'], ['en']), '', 330),
    ('House', 'Orbit Lines', 'The Quiet Arcade', 128, '3A', None, '', 45),
    ('Bollywood', 'Raat Ki Rani', 'Meera Sol', 128, '6A', (5, 5, 4, 5, ['peak'], ['hi']), 'drop the vocal at chorus 2', 12),
    ('Bollywood', 'Sajna Neon', 'DJ Avi Rao', 126, '8A', (4, 4, 3, 4, ['peak'], ['hi', 'pa']), '', 330),
    ('Bollywood', 'Dil Ki Dhadkan', 'Meera Sol', 100, '5A', None, '', 28),
    ('Bollywood', 'Monsoon Mehfil', 'The Kites', 124, '9A', None, '', 205),
    ('Punjabi', 'Bhangra Engine', 'Harjit Vale', 102, '4A', (4, 5, 5, 4, ['peak'], ['pa']), '', 52),
    ('Punjabi', 'Gidha Lights', 'Harjit Vale', 104, '5B', None, '', 80),
    ('Latin', 'Calor de Noche', 'Lumen Ruiz', 98, '7A', (4, 4, 5, 3, ['peak'], ['es']), '', 8),
    ('Latin', 'Bossa Satellite', 'Rio Marquês', 96, '12B', (2, 2, 4, 2, ['chill'], ['pt']), '', 150),
    ('Latin', 'Perreo Lunar', 'Lumen Ruiz', 95, '8A', None, '', 285),
    ('Disco', 'Mirrorball Saints', 'Kitty Marlowe', 118, '10B', None, '', 320),
    ('Disco', 'Roller Rink', 'The Quiet Arcade', 120, '9A', (5, 3, 5, 4, ['chill'], ['en']), '', 175),
    ('Disco', 'Sunday Funk Club', 'Kitty Marlowe', 115, '11A', None, '', 38),
    ('Afro', 'Jo’burg Glow', 'Thandi K', 120, '8A', (3, 4, 5, 3, ['peak'], ['af', 'en']), '', 140),
    ('Afro', 'Amapiano Sun', 'Thandi K', 113, '9A', None, '', 60),
    ('Unsorted', 'Untitled Demo', 'Nobody Yet', None, None, None, '', 230),     # not analysed
    ('Unsorted', 'Hand Typed', 'Serato Fan', 125, '10A', 'manual', '', 100),     # codes typed in Serato only
]

def artwork(path, hue, seed):
    rnd = random.Random(seed)
    W = 600
    def hsl(h, s, l):
        import colorsys
        r, g, b = colorsys.hls_to_rgb((h % 360) / 360, l, s)
        return int(r * 255), int(g * 255), int(b * 255)
    img = Image.new('RGB', (W, W), hsl(hue, .55, .16))
    d = ImageDraw.Draw(img)
    for i in range(W):  # vertical gradient
        d.line([(0, i), (W, i)], fill=hsl(hue + i / W * 40, .6, .14 + .22 * i / W))
    layer = Image.new('RGBA', (W, W), (0, 0, 0, 0))
    ld = ImageDraw.Draw(layer)
    style = seed % 4
    for k in range(rnd.randint(3, 6)):
        r = rnd.randint(90, 260); x = rnd.randint(-40, W + 40); y = rnd.randint(-40, W + 40)
        c = hsl(hue + rnd.choice([0, 25, -30, 160]), .75, rnd.uniform(.45, .7)) + (rnd.randint(120, 220),)
        if style == 0: ld.ellipse([x - r, y - r, x + r, y + r], fill=c)
        elif style == 1: ld.rectangle([x - r, y - r // 3, x + r, y + r // 3], fill=c)
        elif style == 2: ld.ellipse([x - r, y - r, x + r, y + r], outline=c, width=rnd.randint(8, 30))
        else: ld.polygon([(x, y - r), (x + r, y + r), (x - r, y + r)], fill=c)
    layer = layer.filter(ImageFilter.GaussianBlur(rnd.choice([0, 0, 6, 18])))
    img.paste(layer, (0, 0), layer)
    img = img.filter(ImageFilter.GaussianBlur(.6))
    img.save(path, quality=88)

def ff(args):
    subprocess.run(['ffmpeg', '-loglevel', 'error', '-y'] + args, check=True)

def main():
    os.makedirs(OUT, exist_ok=True)
    tmp = os.path.join(OUT, '.tmp'); os.makedirs(tmp, exist_ok=True)
    paths = []
    want = {}
    for n, (folder, title, artist, bpm, key, rating, comment, hue) in enumerate(SONGS):
        d = os.path.join(OUT, folder); os.makedirs(d, exist_ok=True)
        rel = f'{folder}/{artist} - {title}.flac'
        paths.append(rel)
        art = os.path.join(tmp, f'{n}.jpg'); artwork(art, hue, n)
        freq = 220 * 2 ** ((n % 12) / 12)
        md = ['-metadata', f'TITLE={title}', '-metadata', f'ARTIST={artist}', '-metadata', f'ALBUM={folder} Selections']
        if bpm: md += ['-metadata', f'BPM={bpm}']
        if key: md += ['-metadata', f'INITIALKEY={key}']
        grouping, cmt = '', comment
        if rating == 'manual':
            grouping = 'SNG3 NRG4 GRV3 ICN2'; cmt = 'typed in serato #peak @en'
        elif rating:
            s, e, g, i, roles, langs = rating
            grouping = f'SNG{s} NRG{e} GRV{g} ICN{i}'
            toks = ' '.join(['#' + r for r in roles] + ['@' + l for l in langs])
            cmt = (comment + ' ' + toks).strip()
            md += ['-metadata', f'SINGALONG={s}', '-metadata', f'ENERGY={e}',
                   '-metadata', f'GROOVE={g}', '-metadata', f'ICONIC={i}', '-metadata', f'ROLE={";".join(roles)}', '-metadata', f'LANGUAGE={";".join(langs)}']
        if grouping: md += ['-metadata', f'GROUPING={grouping}']
        desc = ' '.join(['#' + r for r in rating[4]] + ['@' + l for l in rating[5]]) if rating and rating != 'manual' else ''
        if cmt or desc: want[rel] = {'COMMENT': cmt, 'DESCRIPTION': desc}
        md += ['-metadata', 'SERATO_MARKERS_V2=AQFDT0xPUgAAAAAEAP///0JQTUxPQ0sAAAAAAQAA']  # stands in for Serato's own blocks
        dur = 75 + (n * 7) % 60
        src = ['-f', 'lavfi', '-i', f'sine=frequency={freq:.1f}:duration={dur}:sample_rate=44100']
        vol = ['-af', 'volume=0.25']
        if folder == 'Disco' and title == 'Sunday Funk Club':
            ff(src + vol + md + [os.path.join(OUT, rel)])         # no embedded art → uses cover.jpg in folder
            artwork(os.path.join(d, 'cover.jpg'), hue, 99)
        else:
            ff(src + ['-i', art, '-map', '0:a', '-map', '1', '-c:v', 'mjpeg', '-disposition:v', 'attached_pic'] + vol + md + [os.path.join(OUT, rel)])
    wf = os.path.join(tmp, 'want.json')
    with open(wf, 'w') as f: json.dump(want, f)
    subprocess.run(['node', os.path.join(os.path.dirname(os.path.abspath(__file__)), 'set_comments.js'), OUT, wf], check=True)
    # MP3 (read-only for ratings)
    art = os.path.join(tmp, 'mp3.jpg'); artwork(art, 50, 77)
    ff(['-f', 'lavfi', '-i', 'sine=frequency=330:duration=80', '-i', art, '-map', '0', '-map', '1', '-c:a', 'libmp3lame', '-q:a', '6', '-c:v', 'mjpeg',
        '-id3v2_version', '3', '-metadata', 'title=Tape Deck Summer', '-metadata', 'artist=Odessa Gray', '-metadata', 'TBPM=124', '-metadata', 'TKEY=Am',
        '-metadata:s:v', 'comment=Cover (front)', os.path.join(OUT, 'House', 'Odessa Gray - Tape Deck Summer.mp3')])
    paths.append('House/Odessa Gray - Tape Deck Summer.mp3')
    # unreadable
    with open(os.path.join(OUT, 'Unsorted', 'Broken Download.flac'), 'wb') as f: f.write(b'fLaC\x00\x00\x00\x22' + b'\x00' * 20)
    # _Serato_ folder must be skipped
    os.makedirs(os.path.join(OUT, '_Serato_', 'Subcrates'), exist_ok=True)
    with open(os.path.join(OUT, '_Serato_', 'ghost.flac'), 'wb') as f: f.write(b'not audio')
    with open(os.path.join(OUT, '.hidden.flac'), 'wb') as f: f.write(b'not audio')
    # v1 mesh: ids in order of addition, only outgoing transitions
    idx = {p: i for i, p in enumerate(paths)}
    edges = [
        (0, 1, 'bass swap on the 2nd drop'), (1, 9, 'loop the last 8 bars, bring vocals in'), (1, 2, ''), (9, 8, 'cut on the breakdown'),
        (0, 3, 'long blend, ride the filter'), (2, 4, 'echo out'), (8, 12, 'BPM jump — cut on the one'), (5, 0, 'warm-up into the room'),
        (6, 1, ''), (18, 0, 'disco → house, swap the hats'), (20, 1, 'Afro into the circuit'), (14, 16, ''), (3, 5, 'take it down'),
    ]
    order, songs = [], {}
    def ensure(i):
        if i not in songs:
            folder, title, artist, bpm, key, *_ = SONGS[i]
            songs[i] = {'id': len(order) + 1, 'path': paths[i], 'title': title, 'artist': artist, 'bpm': bpm,
                        'key': {'8A': 'Am', '9A': 'Em'}.get(key, key), 'added': '2026-10-%02dT20:00:00.000Z' % (len(order) + 1), 'transitions': []}
            order.append(i)
        return songs[i]
    for k, (a, b, notes) in enumerate(edges):
        sa = ensure(a); sb = ensure(b)
        t = '2026-10-%02dT21:%02d:00.000Z' % (min(28, k + 2), k)
        sa['transitions'].append({'to': sb['id'], 'notes': notes, 'created': t, 'modified': t})
    mesh = {'format': 'mesh', 'version': 1, 'name': 'My Sets', 'created': '2026-10-01T20:00:00.000Z', 'modified': '2026-10-31T22:00:00.000Z',
            'songCount': len(order), 'songs': [songs[i] for i in order], 'futureField': {'kept': True}}
    with open(os.path.join(OUT, 'My Sets.mesh'), 'w', encoding='utf-8') as f: json.dump(mesh, f, indent=2, ensure_ascii=False)
    subprocess.run(['rm', '-rf', tmp])
    listing = []
    for dp, dn, fn in os.walk(OUT):
        for f in fn:
            listing.append(os.path.relpath(os.path.join(dp, f), OUT).replace(os.sep, '/'))
    with open(os.path.join(OUT, '..', 'testlib-files.json'), 'w') as f: json.dump(sorted(listing), f)
    print(len(listing), 'files')

main()
