# Five Minute Tutorial

[Pico Pipette documentation](index.md) · [Pico Pipette on GitHub](https://github.com/romilly/pico-pipette)

In five minutes you'll stop a program that runs for ever, look inside it, control the Pico by hand from the REPL,
and make your program run on its own whenever the Pico has power.

Do the [Two Minute Tutorial](two-minute-tutorial.md) first, so you're connected to your Pico at
**<https://romilly.github.io/pico-pipette/>**.

## 1. Run a program that doesn't stop

Select everything in the editor (Ctrl-A, or Cmd-A on a Mac) and replace it with this program:

```python
from machine import Pin
import time

led = Pin("LED", Pin.OUT)
count = 0

while True:
    led.toggle()
    count += 1
    time.sleep(0.25)
```

Click **Run**. The LED keeps blinking, and the program keeps running: `while True:` never ends.

## 2. Stop it and look inside

Click **Stop**.

The LED stops, and Pipette marks the line the program had reached, just as it marks an error.
Under **Variables** you can see what the program left behind: `count` says how many times the LED changed,
and `led` is the pin.

## 3. Talk to the Pico in the REPL

Click in the **REPL** box, below the output. It shares the variables your program left behind.
Type each of these lines and press Enter after each one:

```python
count
led.on()
led.off()
```

The first shows the value of `count`. The next two switch the LED on and off.

## 4. Make it run on its own

1. Click **Save as main.py**. The Pico runs `main.py` whenever it powers up.
2. Click **Disconnect**.
3. Unplug the Pico and plug it back in, into your computer or a USB phone charger.

The LED starts blinking by itself, with no computer involved.

When you click **Connect** again, Pipette stops `main.py` so you can carry on working.
To make the Pico stop running it at power-up, delete `main.py` from the **Pico files** list: point at it and click **✕**.

## What next

- Split a bigger program into [several files](../help/tabs.html), each in its own tab.
- [Install a package](../help/packages.html), such as a driver for a display.
- The [user guide](../help.html) describes everything else the editor can do.
