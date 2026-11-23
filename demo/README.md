# Scripted demos

A demo is a YAML file listing what happens, step by step. `demo.mjs` plays it in your own Chrome,
with captions and a visible mouse pointer, so you can record it.

```
npm install
node demo/demo.mjs                        # plays intro.yaml on the live site
node demo/demo.mjs demo/mine.yaml         # plays your own demo
node demo/demo.mjs demo/mine.yaml http://localhost:8000/   # ...on a local copy of Pipette
```

The first time, pick your Pico when the port chooser appears. Chrome remembers it, so later runs need no clicks.

Included demos:

- `intro.yaml`: Pico Pipette in a minute (connect, run, an error, Stop, main.py, a package).
  It saves its program as `main.py` on the Pico and installs `ssd1306`.
- `repl-and-input.yaml`: a program using `input()`, then the REPL exploring what it left behind.
- `tabs.yaml`: a program split across two tabs, the warning when a module's changes aren't on the Pico,
  and an error in the module taking you to its tab. It saves `helpers.py` to the Pico.
- `go-to-definition.yaml`: the hint on a name, Ctrl-click within a file, and Ctrl-click opening a module
  from the Pico at the definition. It saves `helpers.py` to the Pico.

## Editing demos in VS Code

Install Red Hat's **YAML** extension. Start each demo file with

```yaml
# yaml-language-server: $schema=./demo.schema.json
```

and VS Code will complete action names and values, show what each one does when you hover,
and underline mistakes. `demo.mjs` checks the file against the same schema before it opens the browser,
and tells you the line of any mistake.

## A demo file

```yaml
# yaml-language-server: $schema=./demo.schema.json
title: Blink                          # optional: shown in the terminal
url: http://localhost:8000/           # optional: defaults to the live site
pace: 1.2                             # optional: 1.5 is slower, 0.8 quicker
viewport: { width: 1280, height: 900 } # optional

steps:
  - caption: Connect to the Pico
  - click: connect
  - wait: connected
  - type: |
      from machine import Pin
      Pin("LED", Pin.OUT).on()
  - run:
  - pause: 2
```

## Steps

Each step has exactly one action.

| Step | What it does |
|---|---|
| `caption: text` | Shows a caption at the bottom of the page. `caption: ""` hides it. |
| `pause: 2` | Waits this many seconds (scaled by pace). |
| `click: run` | Glides the pointer to a button and clicks it. Buttons: `connect`, `run`, `stop`, `open`, `save-local`, `save-pico`, `save-main`, `new-folder`, `refresh`, `install`, `send`, `clear-repl`, `new-tab`. Or `click: { selector: "#editor", x: 0.2, y: 0.5 }` for anything else. |
| `wait: connected` | Waits until connected, until the program has `finished` (or stopped), or until the page is `idle`. |
| `type: \|` | Replaces the program in the editor, typing it in. |
| `tab: helpers.py` | Clicks the tab of an open file, by its name. `click: new-tab` starts a new, empty tab. |
| `rename: helpers.py` | Types a new name for the tab showing into the file name box. |
| `edit: { find: led, replace: leed, in: led.toggle }` | Points at some text in the editor, selects it and types over it. `in` is optional: it picks which occurrence. |
| `definition: { name: double, in: double(2) }` | Points at a name in the editor, rests there so its "defined on line N" hint shows, then Ctrl-clicks it to go to its definition, opening its file from the Pico if need be. A "Ctrl" badge by the pointer shows the key is held. `definition: double` uses the first `double`. |
| `run:` | Clicks Run and waits for the program to finish. `run: { wait: false }` carries straight on, for example to `input` or `stop`. |
| `stop:` | Clicks Stop and waits until the program has stopped. |
| `input: Romilly` | Types a line to the running program's `input()`. |
| `repl: count * 2` | Types into the REPL and runs it. Several lines are entered as one block. |
| `install: ssd1306` | Installs a package. |
| `save-main:` | Clicks Save as main.py and waits until it's saved. |
| `scroll: repl` | Scrolls to the `top`, the `bottom`, or the `editor`, `output`, `repl` or `variables`. |

`run:`, `stop:` and `save-main:` take no value: write the action followed by a colon.

## Timing and recording

- `DEMO_PACE=1.5` slows the whole demo down (or `0.8` speeds it up), overriding `pace` in the file.
- `DEMO_VIDEO=intro.mp4` records the page and saves `demo/intro.mp4`, converted with your own ffmpeg.
  Playwright needs its own copy of ffmpeg for the recording: `npx playwright-core install ffmpeg`, once.
- `CHROME=/usr/bin/chromium` uses another Chromium-based browser instead of Google Chrome.
