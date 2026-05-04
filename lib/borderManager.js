import GObject from 'gi://GObject';
import GLib from 'gi://GLib';
import St from 'gi://St';
import Meta from 'gi://Meta';
import Gio from 'gi://Gio';

const BORDER_SETTING_KEYS = [
    'border-width',
    'border-radius',
    'border-color',
    'border-use-system-color',
];

const ACCENT_COLORS = {
    'blue': 'rgb(53, 132, 228)',
    'teal': 'rgb(33, 144, 164)',
    'green': 'rgb(58, 169, 152)',
    'yellow': 'rgb(229, 165, 10)',
    'orange': 'rgb(230, 97, 0)',
    'red': 'rgb(192, 28, 40)',
    'pink': 'rgb(208, 97, 188)',
    'purple': 'rgb(145, 65, 172)',
    'slate': 'rgb(119, 118, 123)',
};

function _getSystemAccentColor(systemSettings) {
    if (!systemSettings) return 'rgb(53, 132, 228)';
    const colorName = systemSettings.get_string('accent-color');
    return ACCENT_COLORS[colorName] || 'rgb(230, 97, 0)';
}

const MENU_TYPE_NAMES = [
    'POPUP_MENU',
    'DROPDOWN_MENU',
    'MENU',
    'COMBO',
];

function _collectMenuLikeTypes() {
    const out = new Set();
    const T = Meta.WindowType;
    for (const name of MENU_TYPE_NAMES) {
        const v = T[name];
        if (v !== undefined) out.add(v);
    }
    return out;
}

const MENU_LIKE_WINDOW_TYPES = _collectMenuLikeTypes();

/** Padding around main window+border used when transient_for is missing (Wayland/GTK). */
const POPUP_ZONE_PAD_PX = 120;

function rectanglesIntersect(a, b) {
    return !(
        b.x + b.width <= a.x ||
        b.x >= a.x + a.width ||
        b.y + b.height <= a.y ||
        b.y >= a.y + a.height
    );
}

function applyBorderStyle(widget, settings, systemSettings) {
    const width = settings.get_int('border-width');
    const radius = settings.get_int('border-radius');
    let color;

    if (settings.get_boolean('border-use-system-color'))
        color = _getSystemAccentColor(systemSettings);
    else
        color = settings.get_string('border-color');

    widget.set_style(`
            border-width: ${width}px;
            border-radius: ${radius}px;
            border-color: ${color};
            background-color: transparent;
            box-shadow: none;
        `);
}

/** Ring drawn around a transient popup (e.g. context menu); stacked above its WindowActor. */
const TransientPopupBorder = GObject.registerClass(
class TransientPopupBorder extends St.Bin {
    _init(metaWindow, windowActor, settings, systemSettings) {
        super._init({
            style_class: 'window-border window-border-transient-popup',
            reactive: false,
            can_focus: false,
        });

        this._metaWindow = metaWindow;
        this._windowActor = windowActor;
        this._settings = settings;
        this._systemSettings = systemSettings;
        this._bindings = [];
        this._settingsSignalIds = [];
        this._geometryDelayId = 0;
        this._systemSignalId = null;
        this._sizeChangedId = null;
        this._posChangedId = null;

        applyBorderStyle(this, settings, systemSettings);

        for (const key of BORDER_SETTING_KEYS) {
            this._settingsSignalIds.push(
                this._settings.connect(`changed::${key}`, () => {
                    applyBorderStyle(this, this._settings, this._systemSettings);
                    if (key === 'border-width') this._syncGeometryNow();
                })
            );
        }

        if (systemSettings) {
            this._systemSignalId = systemSettings.connect(
                'changed::accent-color',
                () => {
                    if (this._settings.get_boolean('border-use-system-color'))
                        applyBorderStyle(this, this._settings, this._systemSettings);
                }
            );
        }

        global.window_group.add_child(this);

        const props = ['scale-x', 'scale-y', 'translation-x', 'translation-y', 'opacity'];
        this._bindings = props.map(prop =>
            this._windowActor.bind_property(prop, this, prop, GObject.BindingFlags.SYNC_CREATE)
        );

        this._sizeChangedId = this._metaWindow.connect('size-changed', () =>
            this._scheduleSyncGeometry()
        );
        this._posChangedId = this._metaWindow.connect('position-changed', () =>
            this._scheduleSyncGeometry()
        );

        this._syncGeometryNow();
    }

    _scheduleSyncGeometry() {
        if (this._geometryDelayId)
            GLib.source_remove(this._geometryDelayId);
        this._geometryDelayId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 12, () => {
            this._geometryDelayId = 0;
            this._syncGeometryNow();
            return GLib.SOURCE_REMOVE;
        });
    }

    _syncGeometryNow() {
        if (!this._metaWindow || !this._windowActor) return;

        const width = this._settings.get_int('border-width');
        const frameRect = this._metaWindow.get_frame_rect();

        this.set_pivot_point(0.5, 0.5);
        this._windowActor.set_pivot_point(0.5, 0.5);

        this.set_position(frameRect.x - width, frameRect.y - width);
        this.set_size(frameRect.width + width * 2, frameRect.height + width * 2);

        this.show();

        const parent = this.get_parent();
        if (parent && this._windowActor) {
            try {
                parent.set_child_above_sibling(this, this._windowActor);
            } catch {
                this.raise_top();
            }
        }
    }

    destroy() {
        for (const id of this._settingsSignalIds)
            this._settings.disconnect(id);
        this._settingsSignalIds = [];

        if (this._geometryDelayId) {
            GLib.source_remove(this._geometryDelayId);
            this._geometryDelayId = 0;
        }

        if (this._systemSignalId && this._systemSettings)
            this._systemSettings.disconnect(this._systemSignalId);

        if (this._metaWindow) {
            if (this._sizeChangedId) this._metaWindow.disconnect(this._sizeChangedId);
            if (this._posChangedId) this._metaWindow.disconnect(this._posChangedId);
        }

        this._bindings.forEach(b => b.unbind());
        this._bindings = [];
        super.destroy();
    }
});

const WindowBorder = GObject.registerClass(
class WindowBorder extends St.Bin {
    _init(windowActor, settings, systemSettings) {
        super._init({
            style_class: 'window-border',
            reactive: false,
            can_focus: false,
        });

        this._windowActor = windowActor;
        this._metaWindow = windowActor.meta_window;
        this._settings = settings;
        this._systemSettings = systemSettings;
        this._bindings = [];
        this._settingsSignalIds = [];
        this._geometryDelayId = 0;
        this._needsRestack = true;
        this._windowCreatedId = null;
        this._displayFocusId = null;
        this._transientPopups = new Map();

        applyBorderStyle(this, settings, systemSettings);

        for (const key of BORDER_SETTING_KEYS) {
            this._settingsSignalIds.push(
                this._settings.connect(`changed::${key}`, () => {
                    applyBorderStyle(this, this._settings, this._systemSettings);
                    if (key === 'border-width')
                        this._syncGeometryNow();
                })
            );
        }

        if (this._systemSettings) {
            this._systemSignalId = this._systemSettings.connect(
                'changed::accent-color',
                () => {
                    if (this._settings.get_boolean('border-use-system-color'))
                        applyBorderStyle(this, this._settings, this._systemSettings);
                }
            );
        }

        global.window_group.add_child(this);

        const props = ['scale-x', 'scale-y', 'translation-x', 'translation-y', 'opacity'];
        this._bindings = props.map(prop =>
            this._windowActor.bind_property(prop, this, prop, GObject.BindingFlags.SYNC_CREATE)
        );

        this._sizeChangedId = this._metaWindow.connect('size-changed', () =>
            this._scheduleSyncGeometry()
        );
        this._posChangedId = this._metaWindow.connect('position-changed', () =>
            this._scheduleSyncGeometry()
        );
        this._destroyId = this._windowActor.connect('destroy', () => this.destroy());

        this._windowCreatedId = global.display.connect(
            'window-created',
            this._onDisplayWindowCreated.bind(this)
        );

        this._displayFocusId = global.display.connect(
            'notify::focus-window',
            this._onDisplayFocusChanged.bind(this)
        );

        this._syncGeometryNow();
    }

    _transientChainContainsParent(metaWin) {
        let w = metaWin;
        for (let i = 0; i < 32; i++) {
            const t = w.get_transient_for();
            if (!t) return false;
            if (t === this._metaWindow) return true;
            w = t;
        }
        return false;
    }

    /**
     * Popup overlaps expanded zone around our window + border (many menus omit transient_for).
     */
    _popupFrameLikelyForOurWindow(metaWin) {
        try {
            if (this._metaWindow.get_monitor() !== metaWin.get_monitor())
                return false;
        } catch {
            return false;
        }

        const bw = this._settings.get_int('border-width');
        const fr = this._metaWindow.get_frame_rect();
        const pad = POPUP_ZONE_PAD_PX;
        const zone = {
            x: fr.x - bw - pad,
            y: fr.y - bw - pad,
            width: fr.width + 2 * bw + 2 * pad,
            height: fr.height + 2 * bw + 2 * pad,
        };
        const pr = metaWin.get_frame_rect();
        return rectanglesIntersect(zone, pr);
    }

    _shouldTreatAsOurPopup(metaWin) {
        if (!metaWin || !this._metaWindow || metaWin === this._metaWindow)
            return false;

        const type = metaWin.get_window_type();
        if (
            type === Meta.WindowType.DESKTOP ||
            type === Meta.WindowType.DOCK
        )
            return false;

        if (this._transientChainContainsParent(metaWin)) return true;

        if (
            MENU_LIKE_WINDOW_TYPES.has(type) &&
            this._popupFrameLikelyForOurWindow(metaWin)
        )
            return true;

        return false;
    }

    _onDisplayFocusChanged() {
        const fw = global.display.focus_window;
        if (fw && this._shouldTreatAsOurPopup(fw)) this._trackTransientPopup(fw);
    }

    _removeTransientEntry(metaWin, skipMainResync = false) {
        const entry = this._transientPopups.get(metaWin);
        if (!entry) return;

        if (entry.unmanagedId) {
            try {
                metaWin.disconnect(entry.unmanagedId);
            } catch {
                // Already disconnected
            }
        }
        if (entry.destroyId) {
            try {
                const actor = metaWin.get_compositor_private();
                if (actor) actor.disconnect(entry.destroyId);
            } catch {
                // ignore
            }
        }

        entry.ring.destroy();
        this._transientPopups.delete(metaWin);

        if (!skipMainResync && this._transientPopups.size === 0)
            this._syncGeometryNow();
    }

    _trackTransientPopup(metaWin) {
        if (this._transientPopups.has(metaWin)) return;

        const finish = () => {
            if (this._transientPopups.has(metaWin)) return true;

            let actor;
            try {
                actor = metaWin.get_compositor_private();
            } catch {
                return false;
            }
            if (!actor) return false;

            const ring = new TransientPopupBorder(
                metaWin,
                actor,
                this._settings,
                this._systemSettings
            );

            const onRemove = () => this._removeTransientEntry(metaWin);

            let unmanagedId = 0;
            try {
                unmanagedId = metaWin.connect('unmanaged', onRemove);
            } catch {
                unmanagedId = 0;
            }

            let destroyId = 0;
            try {
                destroyId = actor.connect('destroy', onRemove);
            } catch {
                destroyId = 0;
            }

            this._transientPopups.set(metaWin, { ring, unmanagedId, destroyId });

            if (this._transientPopups.size === 1) this.hide();

            return true;
        };

        if (finish()) return;

        GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
            finish();
            return GLib.SOURCE_REMOVE;
        });

        for (const ms of [30, 80, 160, 320]) {
            GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => {
                if (!this.get_parent()) return GLib.SOURCE_REMOVE;
                finish();
                return GLib.SOURCE_REMOVE;
            });
        }
    }

    _onDisplayWindowCreated(_display, metaWin) {
        if (!this._shouldTreatAsOurPopup(metaWin)) return;
        this._trackTransientPopup(metaWin);
    }

    _scheduleSyncGeometry() {
        if (this._geometryDelayId)
            GLib.source_remove(this._geometryDelayId);
        this._geometryDelayId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 12, () => {
            this._geometryDelayId = 0;
            this._syncGeometryNow();
            return GLib.SOURCE_REMOVE;
        });
    }

    _syncGeometryNow() {
        if (!this._metaWindow || !this._windowActor) return;

        if (this._transientPopups.size > 0) {
            this.hide();
            return;
        }

        const wasVisible = this.visible;

        if (
            this._metaWindow.is_fullscreen() ||
            (this._metaWindow.maximized_horizontally &&
                this._metaWindow.maximized_vertically)
        ) {
            this.hide();
            return;
        }

        const width = this._settings.get_int('border-width');
        const frameRect = this._metaWindow.get_frame_rect();

        this.set_pivot_point(0.5, 0.5);
        this._windowActor.set_pivot_point(0.5, 0.5);

        this.set_position(frameRect.x - width, frameRect.y - width);
        this.set_size(frameRect.width + width * 2, frameRect.height + width * 2);

        this.show();

        if (!wasVisible || this._needsRestack) {
            this._restack();
            this._needsRestack = false;
        }
    }

    _restack() {
        const parent = this.get_parent();
        if (parent && this._windowActor) {
            try {
                parent.set_child_above_sibling(this, this._windowActor);
            } catch {
                this.raise_top();
            }
        }
    }

    destroy() {
        for (const metaWin of [...this._transientPopups.keys()])
            this._removeTransientEntry(metaWin, true);
        this._transientPopups.clear();

        for (const id of this._settingsSignalIds)
            this._settings.disconnect(id);
        this._settingsSignalIds = [];

        if (this._geometryDelayId) {
            GLib.source_remove(this._geometryDelayId);
            this._geometryDelayId = 0;
        }

        if (this._systemSignalId && this._systemSettings)
            this._systemSettings.disconnect(this._systemSignalId);

        if (this._metaWindow) {
            if (this._sizeChangedId) this._metaWindow.disconnect(this._sizeChangedId);
            if (this._posChangedId) this._metaWindow.disconnect(this._posChangedId);
        }
        if (this._windowActor && this._destroyId) {
            this._windowActor.disconnect(this._destroyId);
        }
        if (this._windowCreatedId) {
            global.display.disconnect(this._windowCreatedId);
            this._windowCreatedId = null;
        }
        if (this._displayFocusId) {
            global.display.disconnect(this._displayFocusId);
            this._displayFocusId = null;
        }
        this._bindings.forEach(b => b.unbind());
        this._bindings = [];
        super.destroy();
    }
});

export class BorderManager {
    constructor(settings) {
        this._settings = settings;
        this._currentBorder = null;
        this._focusSignalId = null;
        this._settingChangedId = null;

        this._systemSettings = new Gio.Settings({ schema_id: 'org.gnome.desktop.interface' });
    }

    enable() {
        this._focusSignalId = global.display.connect(
            'notify::focus-window',
            this._onFocusChanged.bind(this)
        );

        this._settingChangedId = this._settings.connect('changed::border-enabled', () => {
            this._onFocusChanged();
        });

        this._onFocusChanged();
    }

    disable() {
        if (this._focusSignalId) {
            global.display.disconnect(this._focusSignalId);
            this._focusSignalId = null;
        }
        if (this._settingChangedId) {
            this._settings.disconnect(this._settingChangedId);
            this._settingChangedId = null;
        }
        this._systemSettings = null;
        this._removeBorder();
    }

    _onFocusChanged() {
        this._removeBorder();

        if (!this._settings.get_boolean('border-enabled')) return;

        const focusWindow = global.display.focus_window;
        if (!focusWindow) return;

        const type = focusWindow.get_window_type();
        if (type !== Meta.WindowType.NORMAL &&
            type !== Meta.WindowType.DIALOG &&
            type !== Meta.WindowType.MODAL_DIALOG) return;

        const windowActor = focusWindow.get_compositor_private();
        if (windowActor) {
            this._currentBorder = new WindowBorder(windowActor, this._settings, this._systemSettings);
        }
    }

    _removeBorder() {
        if (this._currentBorder) {
            this._currentBorder.destroy();
            this._currentBorder = null;
        }
    }
}
