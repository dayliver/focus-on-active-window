import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Clutter from 'gi://Clutter';
import Meta from 'gi://Meta';

const INACTIVE_SETTING_KEYS = [
    'inactive-opacity',
    'inactive-darkness',
    'inactive-desaturation',
];

const DIM_EFFECT_NAME = 'focus-active-window-dim';

/**
 * Single ShaderEffect doing brightness and saturation in one fragment-shader pass.
 * ShaderEffect itself extends OffscreenEffect, so it still allocates one framebuffer
 * per dimmed window — but that's half the previous cost (which used both
 * BrightnessContrastEffect and DesaturateEffect, two OffscreenEffect framebuffers per
 * window). See docs/dim-effect.md for the curve change and the OffscreenEffect floor.
 */
const FocusDimEffect = GObject.registerClass(
    { GTypeName: 'FocusOnActiveWindowDimEffect' },
    class FocusDimEffect extends Clutter.ShaderEffect {
        constructor(brightness, saturation) {
            super();
            this.set_uniform_value('tex', 0);
            this.setBrightness(brightness);
            this.setSaturation(saturation);
        }

        vfunc_get_static_shader_source() {
            return `
                uniform sampler2D tex;
                uniform float brightness;
                uniform float saturation;
                void main() {
                    vec4 color = texture2D(tex, cogl_tex_coord_in[0].st);
                    color.rgb *= brightness;
                    float colorAvg = (color.r + color.g + color.b) / 3.0;
                    color.r = color.r - (color.r - colorAvg) * (1.0 - saturation);
                    color.g = color.g - (color.g - colorAvg) * (1.0 - saturation);
                    color.b = color.b - (color.b - colorAvg) * (1.0 - saturation);
                    cogl_color_out = color * cogl_color_in;
                }
            `;
        }

        setBrightness(b) {
            this.set_uniform_value('brightness', parseFloat(b - 1e-6));
        }

        setSaturation(s) {
            this.set_uniform_value('saturation', parseFloat(s - 1e-6));
        }
    }
);

export class StyleManager {
    constructor(settings) {
        this._settings = settings;
        this._focusSignalId = null;
        this._windowCreatedId = null;
        this._inactiveSettingIds = [];
        this._dimEffectByActor = new WeakMap();
        this._registeredActors = new WeakSet();
        this._lastFocusedMeta = null;
    }

    enable() {
        this._focusSignalId = global.display.connect(
            'notify::focus-window',
            this._onFocusChanged.bind(this)
        );

        this._windowCreatedId = global.display.connect(
            'window-created',
            this._onWindowCreated.bind(this)
        );

        for (const key of INACTIVE_SETTING_KEYS) {
            this._inactiveSettingIds.push(
                this._settings.connect(`changed::${key}`, () => {
                    this._reapplyAllStyledWindows();
                })
            );
        }

        this._reapplyAllStyledWindows();
    }

    disable() {
        if (this._focusSignalId) {
            global.display.disconnect(this._focusSignalId);
            this._focusSignalId = null;
        }
        if (this._windowCreatedId) {
            global.display.disconnect(this._windowCreatedId);
            this._windowCreatedId = null;
        }
        for (const id of this._inactiveSettingIds) {
            this._settings.disconnect(id);
        }
        this._inactiveSettingIds = [];
        this._lastFocusedMeta = null;

        this._resetAllWindows();
    }

    _isStyledType(metaWin) {
        const type = metaWin.get_window_type();
        return (
            type === Meta.WindowType.NORMAL ||
            type === Meta.WindowType.DIALOG ||
            type === Meta.WindowType.MODAL_DIALOG
        );
    }

    _getInactiveConfig() {
        const opacityPercent = this._settings.get_int('inactive-opacity');
        const targetOpacity = Math.round((opacityPercent / 100) * 255);
        const darknessPercent = this._settings.get_int('inactive-darkness');
        const desatPercent = this._settings.get_int('inactive-desaturation');

        return {
            OPACITY: targetOpacity,
            BRIGHTNESS: 1.0 - darknessPercent / 100.0,
            SATURATION: 1.0 - desatPercent / 100.0,
        };
    }

    _getActiveConfig() {
        return {
            OPACITY: 255,
            BRIGHTNESS: 1.0,
            SATURATION: 1.0,
        };
    }

    _onFocusChanged() {
        const newFocus = global.display.focus_window;
        const prev = this._lastFocusedMeta;
        this._lastFocusedMeta = newFocus;

        const inactiveConfig = this._getInactiveConfig();
        const activeConfig = this._getActiveConfig();

        if (prev && prev !== newFocus) {
            try {
                if (this._isStyledType(prev)) {
                    const actor = prev.get_compositor_private();
                    if (actor) this._applyStyle(actor, inactiveConfig);
                }
            } catch {
                // Window may already be gone
            }
        }

        if (newFocus && this._isStyledType(newFocus)) {
            const actor = newFocus.get_compositor_private();
            if (actor) this._applyStyle(actor, activeConfig);
        }
    }

    _onWindowCreated(_display, metaWin) {
        if (!this._isStyledType(metaWin)) return;

        const applyForNew = () => {
            const actor = metaWin.get_compositor_private();
            if (!actor) return;

            const focusWindow = global.display.focus_window;
            if (focusWindow === metaWin)
                this._applyStyle(actor, this._getActiveConfig());
            else
                this._applyStyle(actor, this._getInactiveConfig());
        };

        applyForNew();
        if (!metaWin.get_compositor_private()) {
            GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
                applyForNew();
                return GLib.SOURCE_REMOVE;
            });
        }
    }

    _reapplyAllStyledWindows() {
        const focusWindow = global.display.focus_window;
        const inactiveConfig = this._getInactiveConfig();
        const activeConfig = this._getActiveConfig();

        for (const actor of global.window_group.get_children()) {
            const metaWin = actor.meta_window;
            if (!metaWin || !this._isStyledType(metaWin)) continue;

            if (focusWindow && metaWin === focusWindow)
                this._applyStyle(actor, activeConfig);
            else
                this._applyStyle(actor, inactiveConfig);
        }

        this._lastFocusedMeta = focusWindow;
    }

    _applyStyle(actor, config) {
        actor.opacity = config.OPACITY;

        this._registerActor(actor);

        const needsEffect = config.BRIGHTNESS < 1.0 || config.SATURATION < 1.0;

        let effect = this._dimEffectByActor.get(actor);
        if (needsEffect) {
            if (!effect) {
                effect = new FocusDimEffect(config.BRIGHTNESS, config.SATURATION);
                this._dimEffectByActor.set(actor, effect);
            } else {
                effect.setBrightness(config.BRIGHTNESS);
                effect.setSaturation(config.SATURATION);
            }
            if (!actor.get_effect(DIM_EFFECT_NAME))
                actor.add_effect_with_name(DIM_EFFECT_NAME, effect);
        } else if (actor.get_effect(DIM_EFFECT_NAME)) {
            actor.remove_effect_by_name(DIM_EFFECT_NAME);
        }
    }

    _registerActor(actor) {
        if (this._registeredActors.has(actor)) return;
        this._registeredActors.add(actor);
        actor.connect('destroy', () => {
            this._dimEffectByActor.delete(actor);
        });
    }

    _resetAllWindows() {
        for (const actor of global.window_group.get_children()) {
            if (!actor.meta_window) continue;

            actor.opacity = 255;

            if (actor.get_effect(DIM_EFFECT_NAME))
                actor.remove_effect_by_name(DIM_EFFECT_NAME);
            this._dimEffectByActor.delete(actor);
        }
    }
}
