# neural-brain

Audience companion site for the talk "Our Tests Will Be Drug Tested".
A glowing, spinnable neural brain; each step lights one brain-enhancing drug's
pathway in its chemical's colour, with a Natural / Enhanced toggle.

Live: https://dayvonmp4.github.io/neural-brain/

## Edit and publish

- Source: `src/`
  - `steps.js`   the talk content: one step per drug, copy, colours, camera view, glows
  - `pathways.js` fibre bundles between anatomical anchors (dopamine, acetylcholine, ...)
  - `geometry.js` procedural brain (points, neuron network, tracts, deep nuclei)
  - `main.js`    renderer, step engine, UI wiring, adaptive quality
  - `index.html` page shell + styles (tokens shared with the slide deck)
- `./build.sh` inlines everything into one file and writes:
  - `docs/index.html` (published by GitHub Pages)
  - `~/Desktop/Web-Files/neural-brain.html` (offline copy for the projector)
  - `~/Desktop/Web-Files/neural-brain-qr.png` (QR code for a slide)
- Publish: `./build.sh && git commit -am "..." && git push`

## Controls

Phone: drag to spin, arrows to step, Natural / Enhanced toggle.
Laptop: `←` `→` step, `E` toggle, `Q` shows a full-screen QR code for the room.
`#3` in the URL opens step 3.
