import Clutter from 'gi://Clutter';
import Meta from 'gi://Meta';

export class StyleManager {
    constructor(settings) {
        this._settings = settings;
        this._focusSignalId = null;
        this._windowCreatedId = null;
        this._settingChangedId = null;
    }

    enable() {
        this._focusSignalId = global.display.connect(
            'notify::focus-window',
            this._updateAllWindows.bind(this)
        );

        this._windowCreatedId = global.display.connect(
            'window-created',
            this._updateAllWindows.bind(this)
        );

        this._settingChangedId = this._settings.connect('changed', () => {
            this._updateAllWindows();
        });

        this._updateAllWindows();
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
        if (this._settingChangedId) {
            this._settings.disconnect(this._settingChangedId);
            this._settingChangedId = null;
        }
        
        this._resetAllWindows();
    }

    _updateAllWindows() {
        const focusWindow = global.display.focus_window;
        const actors = global.window_group.get_children();

        const opacityPercent = this._settings.get_int('inactive-opacity');
        const targetOpacity = Math.round((opacityPercent / 100) * 255);

        const darknessPercent = this._settings.get_int('inactive-darkness');
        const targetBrightness = (darknessPercent / 100) * -1.0;

        const desatPercent = this._settings.get_int('inactive-desaturation');
        const targetDesatFactor = desatPercent / 100.0;

        const inactiveConfig = {
            OPACITY: targetOpacity,
            BRIGHTNESS: targetBrightness,
            DESAT_FACTOR: targetDesatFactor
        };

        const activeConfig = {
            OPACITY: 255,
            BRIGHTNESS: 0.0,
            DESAT_FACTOR: 0.0
        };

        actors.forEach(actor => {
            const metaWin = actor.meta_window;
            if (!metaWin) return;

            const type = metaWin.get_window_type();
            if (type !== Meta.WindowType.NORMAL && 
                type !== Meta.WindowType.DIALOG && 
                type !== Meta.WindowType.MODAL_DIALOG) return;

            if (focusWindow && metaWin === focusWindow) {
                this._applyStyle(actor, activeConfig);
            } else {
                this._applyStyle(actor, inactiveConfig);
            }
        });
    }

    _applyStyle(actor, config) {
        actor.opacity = config.OPACITY;
        actor.clear_effects();

        if (config.BRIGHTNESS !== 0.0) {
            let effect = new Clutter.BrightnessContrastEffect();
            effect.set_brightness(config.BRIGHTNESS);
            actor.add_effect(effect);
        }

        if (config.DESAT_FACTOR > 0.0) {
            let effect = new Clutter.DesaturateEffect({ factor: config.DESAT_FACTOR });
            actor.add_effect(effect);
        }
    }

    _resetAllWindows() {
        const actors = global.window_group.get_children();
        actors.forEach(actor => {
            if (!actor.meta_window) return;
            actor.opacity = 255;
            actor.clear_effects();
        });
    }
}