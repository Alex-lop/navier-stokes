# Navier–Stokes: stretch a whirlpool, watch it blow up

A ten-step guide, in the browser, from what a fluid is to the Navier–Stokes blow-up announced in November 2026. It is the companion of [Zeta World](https://alex-lop.github.io/zeta-world/), which does the same for the Riemann hypothesis, and it uses that site's look and step-by-step shell.

**Live: https://alex-lop.github.io/navier-stokes/**

## Status of the math

As of 22 Nov 2026: proofs that solutions of the Navier–Stokes equations can blow up were announced on 8 Sep (with a driving force, [by OpenAI](https://openai.com/index/navier-stokes-solution/)) and on 20 Nov (with no force, [by Alpöge and Buckmaster](https://github.com/tristanbuckmaster/navier-stokes)). Neither has been peer reviewed, and the second paper's key data has not been released. The Clay Mathematics Institute [lists the problem as "Active"](https://www.claymath.org/millennium/navier-stokes-equation/).

This project shows what the claims say. It proves nothing.

## The ten steps

| Steps | What you do | What is on screen |
|---|---|---|
| 1 and 2 | stir the page, then slide from water to honey | the page's own ticks, which are a real two-dimensional flow |
| 3 to 6 | drop in a paddle wheel, stretch a whirlpool, balance it against viscosity, let it run away | a 3D whirlpool. Step 5 is an exact solution (the Burgers vortex). Step 6 is a toy and says so |
| 7 and 8 | drag time toward a blow-up, then follow it with a microscope | this project's own solution of the Luo–Hou flow (below) |
| 9 | drag time toward the blow-up announced on 20 Nov 2026 | a sketch drawn from that paper's description. Its data has not been released |
| 10 | open each line | what is proved, what is announced, and what each rests on, with sources |

## The simulation

Steps 7 and 8 play back a solution of the 3D axisymmetric Euler equations in the setting of [Luo and Hou (2014)](https://arxiv.org/abs/1310.0497), computed by `bake.py` on a 512 × 512 grid squeezed toward the ring where the solution blows up. `python3 bake.py check` compares the baked file with the largest vorticity they published:

| Time | This solution | Luo and Hou | Difference |
|---|---|---|---|
| 0.003 | 9.0854 × 10⁴ | 9.0847 × 10⁴ | +0.01% |
| 0.0034 | 4.3150 × 10⁶ | 4.3127 × 10⁶ | +0.05% |
| 0.0035 | 5.487 × 10⁹ | 5.841 × 10⁹ | −6.1% |

The page stops at t = 0.0035, where the largest vorticity is 1.5 million times its starting value, and says how far to trust it. Luo and Hou went further, on meshes that moved with the collapse.

## Running it

There is no build step. ES modules need a server, not `file://`:

```sh
python3 -m http.server 8000   # then open http://localhost:8000
```

- `index.html`: the page and its styles.
- `guide.js`: the ten steps, the step bar, and the page's fluid of ticks.
- `astral.js`: the first screen's picture, a whirlpool of light in a night sky. The sky is adapted from Zeta World's.
- `scenes.js`: the three.js scenes of the steps (three.js 0.187 from a pinned CDN URL).
- `bake.py`: the solver. `python3 bake.py` solves for about 20 minutes and rewrites `can.bin`; it needs numpy and scipy.
- `can.bin`: the baked solution, about 1 MB. Its layout is documented in `bake.py`.

GitHub Pages serves `main` from the repository root, so a push to `main` is a deploy. Local paths are relative because the site is served under `/navier-stokes/`.
