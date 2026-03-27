import Clutter from 'gi://Clutter';
import Meta from 'gi://Meta';

export class StyleManager {
    constructor(settings) {
        this._settings = settings;
        this._focusSignalId = null;
        this._windowCreatedId = null;
        this._settingChangedId = null;
        this._lastKnownClasses = [];
    }

    enable() {
        this._loadSettings();

        this._focusSignalId = global.display.connect(
            'notify::focus-window',
            this._updateAllWindows.bind(this)
        );

        this._windowCreatedId = global.display.connect(
            'window-created',
            this._updateAllWindows.bind(this)
        );

        this._settingChangedId = this._settings.connect('changed', () => {
            this._loadSettings();
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

    _loadSettings() {
        const opacityPercent = this._settings.get_int('inactive-opacity');
        this._targetOpacity = Math.round((opacityPercent / 100) * 255);

        const darknessPercent = this._settings.get_int('inactive-darkness');
        this._targetBrightness = (darknessPercent / 100) * -1.0;

        const desatPercent = this._settings.get_int('inactive-desaturation');
        this._targetDesatFactor = desatPercent / 100.0;

        this._filterMode = this._settings.get_string('filter-mode');
        this._filterList = this._settings.get_strv('filter-app-list');
        this._skipAbove = this._settings.get_boolean('skip-always-on-top');
    }

    _updateAllWindows() {
        const focusWindow = global.display.focus_window;
        const actors = global.window_group.get_children();

        const inactiveConfig = {
            OPACITY: this._targetOpacity,
            BRIGHTNESS: this._targetBrightness,
            DESAT_FACTOR: this._targetDesatFactor
        };

        const activeConfig = {
            OPACITY: 255,
            BRIGHTNESS: 0.0,
            DESAT_FACTOR: 0.0
        };

        const knownClasses = new Set();

        actors.forEach(actor => {
            const metaWin = actor.meta_window;
            if (!metaWin) return;

            const type = metaWin.get_window_type();
            if (type !== Meta.WindowType.NORMAL && 
                type !== Meta.WindowType.DIALOG && 
                type !== Meta.WindowType.MODAL_DIALOG) return;

            const isFocused = focusWindow && metaWin === focusWindow;
            const wmClass = metaWin.get_wm_class();
            if (wmClass) knownClasses.add(wmClass);

            const isExcluded =
                (this._skipAbove && metaWin.is_above()) ||
                (this._filterMode === 'denylist' && this._filterList.includes(wmClass)) ||
                (this._filterMode === 'allowlist' && this._filterList.length > 0 && !this._filterList.includes(wmClass));

            if (isFocused || isExcluded) {
                this._applyStyle(actor, activeConfig);
            } else {
                this._applyStyle(actor, inactiveConfig);
            }
        });

        const sorted = [...knownClasses].sort();
        if (sorted.length !== this._lastKnownClasses.length ||
            sorted.some((c, i) => c !== this._lastKnownClasses[i])) {
            this._lastKnownClasses = sorted;
            this._settings.set_strv('known-window-classes', sorted);
        }
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
