# Perchy

A flockmate for a lone budgie. Perchy shows a budgie on a branch, listens for your bird through the microphone, and answers with real wild budgie calls: a quick chirp for a contact call, and a soft warble stitched from single real notes when your bird warbles. When it's quiet it calls out now and then, more softly when it's drowsy or grooming and sometimes warbling to itself when it's in a sociable mood, and every few minutes a real flock chatters in the distance.

**Your phrases.** Type a phrase you often say, tap Record, say it and tap again (or hold the button while you speak). Perchy keeps your plain recording and says it slowly in a budgie voice: a vocoder lets your slowed recording shape a low, buzzy, wandering budgie tone mixed with your own bird's warble and a little breath, with a trace of your plain voice for the consonants. A "deeper to higher" slider remakes every phrase. Perchy slips phrases into its warble now and then, sometimes says one in a chatty mood, and in full screen the speech-bubble button says a random one with one tap. Recordings stay on the device (IndexedDB).

## How it tells your bird from other sounds

Budgies make two sounds worth answering: contact calls (about 0.1 to 0.3 s, sweeping quickly between about 2 and 4 kHz) and warble, the long rambling song of a sociable budgie, which mixes call-like notes, buzzy notes and clicks and reaches down to about 1 kHz (Tu, Osmanski & Dooling 2011). Perchy listens between 1.15 and 6.5 kHz and accepts both. It ignores a sound when a human voice is underneath it (energy below about 480 Hz that jumps well above the room's usual rumble), when it holds or glides one pitch for a long time (a whistle), when it is noisy from start to end with no notes in it (a hiss), or when it is over in a moment (a knock or click).

Open the GitHub Pages link on a phone or tablet by the cage, tap **Wake Perchy** and allow the microphone. Everything runs in the browser; nothing is recorded or uploaded.

## Editing

`index.html` is built from the files in `src/` (page template, the bird, app logic, and the sounds). The bird in `src/bird.js` uses no pictures: it is a small 3D model of a few thousand painted feathers generated from a short list of settings (colours, markings, size, build, fluffiness, tail length), posed by springs so every movement is continuous. After changing anything there, run `python3 build.py`.

## Sound credits

Perchy's warble partly uses Kyle's own budgie, cut from his phone videos (switch off with "Warble in your bird's own voice"). Every sound is a short excerpt of a recording by Marc Anderson from [xeno-canto](https://xeno-canto.org/species/Melopsittacus-undulatus), used under its Creative Commons license: XC134241, XC172266, XC335524, XC593111, XC594060, XC594061, XC594062, XC597623, XC609245. The excerpts were filtered and lightly noise-reduced, keeping the faint air of the place between notes so they sound like a bird in a room rather than cut-outs. Perchy's warble plays unbroken runs of several real notes, and the flock in the distance is a different 8 to 14 second stretch of a longer flock recording each time.
