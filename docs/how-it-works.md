# How Pipette works

[Pico Pipette documentation](index.md) · [Pico Pipette on GitHub](https://github.com/romilly/pico-pipette)

## The browser talks straight to the Pico

A Pico running MicroPython shows up on the computer as a USB serial port. The browser's
[Web Serial API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Serial_API) lets a web page open that port,
once the user has picked it from the browser's own list. So Pipette needs no program on the computer and no server:
the page and the Pico talk directly, and your code and files go nowhere else.
The only other connections are the package downloads you ask for.

Web Serial is available in Chrome and Edge, and in Firefox from version 151, on desktop and laptop computers.
Browsers only allow it on `https://` pages and on `localhost`, which is why opening `index.html` straight from disk
doesn't work.

## Running code through the raw REPL

MicroPython has a second, machine-friendly REPL, the *raw REPL*, which is also what tools such as `mpremote` use.
To run a program, Pipette:

1. sends Ctrl-C to stop anything already running;
2. switches to the raw REPL with Ctrl-A;
3. soft-resets the board with Ctrl-D, so the run starts with no variables or imported modules left over;
4. sends the code, then Ctrl-D to run it;
5. reads the reply, which comes back as `OK`, the program's output, a separator, any error, and another separator,
   passing the output to the page as it arrives;
6. switches back to the normal REPL with Ctrl-B.

**Stop** sends Ctrl-C, which raises `KeyboardInterrupt` in the program. Its traceback says which line the program had
reached, so Pipette can mark that line just as it marks an error.

## One port for every board

Everything that talks to a board goes through one small interface, the *port*: `run(code, …)`, `interrupt()`,
and optionally `sendInput(line)`. `PicoLink` implements it over Web Serial.
`createMicroPythonLink` implements it with MicroPython compiled to WebAssembly, running in the same process.

The rest of Pipette, from the file browser to the REPL, the variables table and package installation, only uses the port.
That's what lets most of the tests run against real MicroPython rather than a mock, and it leaves room for a future
"no Pico" mode in the browser.

## Everything else is MicroPython too

The file browser, the variables table, the REPL and package installation all work by running short MicroPython
snippets through the same port, without a soft reset. For example, listing a folder runs a snippet that prints the
folder's contents as JSON.

Each snippet wraps its work in a function and deletes the function afterwards, so it leaves nothing behind among
the learner's variables. File contents travel as hex, so any byte survives the trip, and saves go to a temporary file
that's renamed at the end, so an interrupted save doesn't leave a half-written `main.py`.

The REPL compiles what you type the way MicroPython's own REPL does, so expressions show their values.
It doesn't soft-reset the board, so it shares variables with the program you last ran.

## Packages without Wi-Fi

MicroPython's `mip` installs packages by downloading them on the board itself, which needs a network connection.
Pipette follows the same index layout and naming rules (micropython-lib names, `github:`, `gitlab:` and `codeberg:`
repositories, and dependencies), but the browser does the downloading and writes the files into the Pico's `lib` folder.
So any Pico can install packages, including one without Wi-Fi.

## No build step and no dependencies

The code is plain JavaScript ES modules, with no framework, no bundler and no runtime dependencies.
A page can load an element or a module straight from a CDN with one script tag, the published files are the
files in the repository, and there's nothing to keep up to date except Pipette itself.
