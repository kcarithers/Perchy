#!/usr/bin/env python3
"""Assemble index.html from src/ (template, bird, app, sounds, media). Run: python3 build.py"""
import base64, json, pathlib
src = pathlib.Path(__file__).parent / 'src'
lib = json.loads((src / 'sounds.json').read_text())
for c in lib['calls']: c.pop('notes', None)
html = (src / 'template.html').read_text()
html = html.replace('/*LIB*/', json.dumps(lib, separators=(',', ':')))
html = html.replace('/*BIRD*/', (src / 'bird.js').read_text()).replace('/*APP*/', (src / 'app.js').read_text())
def uri(p): return 'data:image/' + ('jpeg' if p.suffix == '.jpg' else 'webp') + ';base64,' + base64.b64encode(p.read_bytes()).decode()
media = {p.stem: uri(p) for p in sorted((src / 'media').iterdir())}
html = html.replace('/*MEDIA*/', json.dumps(media)).replace('/*PHOTO*/', (src / 'photo.js').read_text())
(src.parent / 'index.html').write_text(html)
print('index.html', len(html) // 1024, 'KB')
