# Pico Pipette

Program, debug and manage a Raspberry Pi Pico running MicroPython from a web browser, with nothing to install.
It's for beginners learning MicroPython, for the people teaching them, and for course authors who want
a "Run on your Pico" editor in their own lesson pages.

![Pico Pipette after a failed run: the failing line marked, the output, the error and the variables left behind](https://romilly.github.io/pico-pipette/docs/images/overview.png)

Plug in your Pico, open **<https://romilly.github.io/pico-pipette/>** and click **Connect**.
It works in Chrome, Edge, and Firefox 151 or later, on desktop and laptop computers.

You can run code and stop it, see the failing line marked when it goes wrong, look at the variables it left behind,
try things in a REPL, manage the Pico's files, work on several files in tabs, and install packages without Wi-Fi.

## Get started

- [Two Minute Tutorial](https://romilly.github.io/pico-pipette/docs/two-minute-tutorial.html): blink the LED and see how errors are shown
- [Five Minute Tutorial](https://romilly.github.io/pico-pipette/docs/five-minute-tutorial.html): stop a program, look inside it, and make it run at power-up

## Put it in your own pages

One script tag gives you an editor with **Run** on any page:

```html
<script type="module" src="https://cdn.jsdelivr.net/npm/pico-pipette/src/pico-pipette.js"></script>
<pico-pipette>print("Hello from the Pico")</pico-pipette>
```

See [How to add Pipette to your own web page](https://romilly.github.io/pico-pipette/docs/embedding.html).

## Documentation

[Full documentation](https://romilly.github.io/pico-pipette/docs/) ·
[User guide](https://romilly.github.io/pico-pipette/help.html) ·
[Connection checker](https://romilly.github.io/pico-pipette/check.html) ·
[For developers](https://romilly.github.io/pico-pipette/docs/developers.html)

MIT licence. See [LICENSE](LICENSE).
