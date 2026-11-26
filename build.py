#!/usr/bin/env python3
"""Assemble index.html from src/ (template, bird, app, sounds). Run: python3 build.py"""
import json, pathlib
src = pathlib.Path(__file__).parent / 'src'
lib = json.loads((src / 'sounds.json').read_text())
for c in lib['calls']: c.pop('notes', None)
html = (src / 'template.html').read_text()
html = html.replace('/*LIB*/', json.dumps(lib, separators=(',', ':')))
html = html.replace('/*BIRD*/', (src / 'bird.js').read_text()).replace('/*APP*/', (src / 'app.js').read_text())
(src.parent / 'index.html').write_text(html)
print('index.html', len(html) // 1024, 'KB')
