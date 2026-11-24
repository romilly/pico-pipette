# Installation

[Pico Pipette documentation](index.md) · [Pico Pipette on GitHub](https://github.com/romilly/pico-pipette)

## Using the editor

There's nothing to install. Open **<https://romilly.github.io/pico-pipette/>** in Chrome, Edge, or Firefox 151
or later, on a desktop or laptop computer.

You'll need a Raspberry Pi Pico or Pico 2, or a board built around the same chip, such as the Pimoroni Explorer
or Presto, with MicroPython on it: see [Putting MicroPython on your board](../help/micropython.html).

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
