# Perchy

A flockmate for a lone budgie. Perchy shows a budgie on a branch, listens for your bird through the microphone, and answers with real wild budgie calls: a quick chirp for a contact call, and a soft warble stitched from single real notes when your bird warbles. When it's quiet it calls out now and then, more softly when it's drowsy or grooming and sometimes warbling to itself when it's in a sociable mood, and every few minutes a real flock chatters in the distance.

**One bird, one voice.** Perchy never plays two of its own sounds at once; everything is queued on one voice. Near calls come from the clean, close recordings (XC609245, XC597623, XC593111); longer calls and chatter are often strings of those single notes. A warble comes from one recording only, never mixing your bird's voice with a wild one. Wild calls were re-cut with stronger cleanup so the flock behind each call is gone. The own-voice warble is off by default (it carries the room's echo).

**Songs for Perchy and singing.** You can add a recording (an mp3, m4a or a phone screen recording of a budgie video your bird loves). It is kept on the device (IndexedDB, 32 kHz, up to 4 minutes, 4 recordings) and split into song stretches and single notes in the 1.2 to 7 kHz range. Sing (a button, and a music-note button in full screen) plays a long stretch from it, or without one, 30 to 60 s woven from one wild bird's warble and clean notes. Perchy also sings now and then in a sociable mood, and sometimes sings along after a long warble. With "Answer in its voice too", its calls and warbles come from the recording as well.

**Your phrases.** Type a phrase you often say, tap Record, say it and tap again (or hold the button while you speak). Perchy keeps your plain recording and says it slowly in a budgie voice: a vocoder lets your slowed recording shape a low, buzzy, wandering budgie tone mixed with your own bird's warble and a little breath, with a trace of your plain voice for the consonants. A "deeper to higher" slider remakes every phrase. Perchy slips phrases into its warble now and then, sometimes says one in a chatty mood, and in full screen the speech-bubble button says a random one with one tap. Recordings stay on the device (IndexedDB).

## How it tells your bird from other sounds

Budgies make two sounds worth answering: contact calls (about 0.1 to 0.3 s, sweeping quickly between about 2 and 4 kHz) and warble, the long rambling song of a sociable budgie, which mixes call-like notes, buzzy notes and clicks and reaches down to about 1 kHz (Tu, Osmanski & Dooling 2011). Perchy listens between 1.15 and 6.5 kHz and accepts both. It ignores a sound when a human voice is underneath it (energy below about 480 Hz that jumps well above the room's usual rumble), when it holds or glides one pitch for a long time (a whistle), when it is noisy from start to end with no notes in it (a hiss), or when it is over in a moment (a knock or click).

Open the GitHub Pages link on a phone or tablet by the cage, tap **Wake Perchy** and allow the microphone. Everything runs in the browser; nothing is recorded or uploaded.

## Editing

`index.html` is built from the files in `src/` (page template, the bird, app logic, and the sounds). The bird in `src/bird.js` uses no pictures: it is a small 3D model of a few thousand painted feathers generated from a short list of settings (colours, markings, size, build, fluffiness, tail length), posed by springs so every movement is continuous. After changing anything there, run `python3 build.py`.

## Sound credits

Perchy's warble partly uses Kyle's own budgie, cut from his phone videos (switch off with "Warble in your bird's own voice"). Every sound is a short excerpt of a recording by Marc Anderson from [xeno-canto](https://xeno-canto.org/species/Melopsittacus-undulatus), used under its Creative Commons license: XC134241, XC172266, XC335524, XC593111, XC594060, XC594061, XC594062, XC597623, XC609245. The excerpts were filtered and lightly noise-reduced, keeping the faint air of the place between notes so they sound like a bird in a room rather than cut-outs. Perchy's warble plays unbroken runs of several real notes, and the flock in the distance is a different 8 to 14 second stretch of a longer flock recording each time.
