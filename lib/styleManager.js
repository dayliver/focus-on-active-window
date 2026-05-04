import GLib from 'gi://GLib';
import Clutter from 'gi://Clutter';
import Meta from 'gi://Meta';

const INACTIVE_SETTING_KEYS = [
    'inactive-opacity',
    'inactive-darkness',
    'inactive-desaturation',
];

export class StyleManager {
    constructor(settings) {
        this._settings = settings;
        this._focusSignalId = null;
        this._windowCreatedId = null;
        this._inactiveSettingIds = [];
        this._brightnessEffectByActor = new WeakMap();
        this._desatEffectByActor = new WeakMap();
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
        const targetBrightness = (darknessPercent / 100) * -1.0;
        const desatPercent = this._settings.get_int('inactive-desaturation');
        const targetDesatFactor = desatPercent / 100.0;

        return {
            OPACITY: targetOpacity,
            BRIGHTNESS: targetBrightness,
            DESAT_FACTOR: targetDesatFactor,
        };
    }

    _getActiveConfig() {
        return {
            OPACITY: 255,
            BRIGHTNESS: 0.0,
            DESAT_FACTOR: 0.0,
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

        let brightnessEffect = this._brightnessEffectByActor.get(actor);
        if (config.BRIGHTNESS !== 0.0) {
            if (!brightnessEffect) {
                brightnessEffect = new Clutter.BrightnessContrastEffect();
                actor.add_effect(brightnessEffect);
                this._brightnessEffectByActor.set(actor, brightnessEffect);
            }
            brightnessEffect.set_brightness(config.BRIGHTNESS);
        } else if (brightnessEffect) {
            actor.remove_effect(brightnessEffect);
            this._brightnessEffectByActor.delete(actor);
        }

        let desatEffect = this._desatEffectByActor.get(actor);
        if (config.DESAT_FACTOR > 0.0) {
            if (!desatEffect) {
                desatEffect = new Clutter.DesaturateEffect({ factor: config.DESAT_FACTOR });
                actor.add_effect(desatEffect);
                this._desatEffectByActor.set(actor, desatEffect);
            } else {
                desatEffect.factor = config.DESAT_FACTOR;
            }
        } else if (desatEffect) {
            actor.remove_effect(desatEffect);
            this._desatEffectByActor.delete(actor);
        }
    }

    _resetAllWindows() {
        for (const actor of global.window_group.get_children()) {
            if (!actor.meta_window) continue;

            actor.opacity = 255;

            const brightnessEffect = this._brightnessEffectByActor.get(actor);
            if (brightnessEffect) {
                actor.remove_effect(brightnessEffect);
                this._brightnessEffectByActor.delete(actor);
            }
            const desatEffect = this._desatEffectByActor.get(actor);
            if (desatEffect) {
                actor.remove_effect(desatEffect);
                this._desatEffectByActor.delete(actor);
            }
        }
    }
}