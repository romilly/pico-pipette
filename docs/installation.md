# Installation

[Pico Pipette documentation](index.md) · [Pico Pipette on GitHub](https://github.com/romilly/pico-pipette)

## Using the editor

There's nothing to install. Open **<https://romilly.github.io/pico-pipette/>** in Chrome, Edge, or Firefox 151
or later, on a desktop or laptop computer.

Your Pico needs MicroPython on it: see [Putting MicroPython on a Pico](../help.html#micropython).

## Running your own copy

To run Pipette from your own computer, for example to work offline or try a change:

```
git clone https://github.com/romilly/pico-pipette.git
cd pico-pipette
python3 -m http.server 8000
```

Then open <http://localhost:8000/>. Opening `index.html` directly from disk won't work: browsers only allow
Web Serial and module scripts on `https://` or `localhost` pages.

## Using Pipette in your own pages

Load it from a CDN with one script tag, or install it from npm:

```
npm install pico-pipette
```

See [How to add Pipette to your own web page](embedding.md).
