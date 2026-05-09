# Inactive-window dim effect

Inactive windows are dimmed via a single `Clutter.ShaderEffect` (`FocusDimEffect`,
defined in `lib/styleManager.js`) rather than separate
`Clutter.BrightnessContrastEffect` and `Clutter.DesaturateEffect` instances.

## Why ShaderEffect

`BrightnessContrastEffect` and `DesaturateEffect` both extend
`Clutter.OffscreenEffect`, which allocates a window-sized framebuffer per
effect and renders the actor into it before applying the per-pixel transform.
With dimming + desaturation enabled, that meant **two** offscreen framebuffers
per dimmed window.

`Clutter.ShaderEffect` is also an `OffscreenEffect` (it inherits from it), so a
single `ShaderEffect` still allocates **one** framebuffer per dimmed window.
The win is that one custom shader replaces two stacked effects: framebuffer
count per dimmed window drops from 2 → 1, halving the GPU footprint of dimming.

Combined with the explicit actor-`destroy` listener (which drops the JS-side
strong reference to the cached effect when a window closes, so GJS can finalize
it promptly instead of waiting for a full GC pass), the unrecovered residual
after a 50-window stress test goes to roughly zero. Peak memory during the
test is still proportional to (number of dimmed windows) × (framebuffer size),
because the effect remains an `OffscreenEffect` — that is the cost of doing
per-pixel desaturation at all in Clutter.

If a future fix wants to eliminate the per-window framebuffer entirely, the
direction is replacing the `ShaderEffect` with a non-offscreen mechanism (e.g.
a translucent overlay actor for darkness, accepting that desaturation is no
longer offered) or rendering through `Clutter.Pipeline` directly. Out of scope
for the current fix.

## Curve change vs. `BrightnessContrastEffect`

The shader applies brightness as a **multiplicative** factor:

```
color.rgb *= brightness;        // brightness = 1.0 - inactive-darkness/100
```

The old `BrightnessContrastEffect` applied an **additive** offset:

```
color.rgb += brightness;        // brightness = -inactive-darkness/100
```

Both look "darker", but mid-tones differ:

| `inactive-darkness` | Multiplicative `0.5` (gray, 0.5) | Additive `-0.5` (gray, 0.5) |
| ------------------: | -------------------------------: | --------------------------: |
| Black (0.0)         | 0.00                             | 0.00 (clamped)              |
| Mid-gray (0.5)      | 0.25                             | 0.00 (clamped)              |
| White (1.0)         | 0.50                             | 0.50                        |

The multiplicative curve preserves contrast and compresses the white point;
the additive curve subtracts a constant and crushes shadows toward black. Most
users will not notice, but if a slider value looks visibly different from how it
did before, expect a small re-tune of `Inactive Window Darkness`.

Saturation behavior (`saturation = 1.0 - inactive-desaturation/100`) is
functionally equivalent to the old `DesaturateEffect`.

## Re-evaluation

If users report that the visual difference is objectionable, the additive curve
can be replicated in the same shader with a few extra lines without bringing
back the offscreen framebuffer:

```glsl
// Replace `color.rgb *= brightness;` with:
//   color.rgb = max(color.rgb + (brightness - 1.0), 0.0);
// where brightness = 1.0 - inactive-darkness/100, so (brightness - 1.0) is
// the additive offset in [-1, 0].
```
