# Two Minute Tutorial

[Pico Pipette documentation](index.md) · [Pico Pipette on GitHub](https://github.com/romilly/pico-pipette)

In two minutes you'll run a program on your Pico from your browser, change it, and see how Pipette shows you a mistake.

You need:

- a Raspberry Pi Pico or Pico 2, with or without wireless, with MicroPython on it. If it hasn't got MicroPython yet,
  [put MicroPython on it](../help/micropython.html) first.
  Pipette also works with boards built around the same chip, such as the Pimoroni Explorer and Presto,
  but this tutorial blinks the Pico's own LED, which those boards may not have;
- a USB cable that carries data, not just power;
- Chrome, Edge, or Firefox 151 or later, on a desktop or laptop computer.

## 1. Connect

1. Plug your Pico into your computer.
2. Open **<https://romilly.github.io/pico-pipette/>**.
3. Click **Connect**, choose your Pico from the list the browser shows, and confirm.
   The first time, the browser asks whether the site may use serial ports: say yes.

The dot beside the button turns green, and the files on your Pico appear on the left.

## 2. Blink the LED

The editor already holds a program that blinks the Pico's LED. Click **Run**.

The LED on the Pico blinks ten times, and the output appears under **Output**:

```
blink 0
blink 1
...
blink 9
done
```

## 3. Make it faster

On line 9, change `0.5` to `0.1`, and click **Run** again. The LED blinks five times as fast.

## 4. Make a mistake

On line 7, change `led.toggle()` to `leed.toggle()`, and click **Run**.

The program stops at once. Pipette marks line 7 in red and says what went wrong, under the output:

```
Line 7: NameError: name 'leed' isn't defined
```

Change it back to `led.toggle()` and run it again.

## What next

The [Five Minute Tutorial](five-minute-tutorial.md) shows how to stop a program that runs for ever, look inside it
while it's paused, and make it run on its own whenever the Pico has power.
