import GObject from 'gi://GObject';
import St from 'gi://St';
import Meta from 'gi://Meta';
import Gio from 'gi://Gio';

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

        this._updateStyle();
        
        this._settingsSignalId = this._settings.connect('changed', () => {
            this._updateStyle();
            this._syncGeometry();
        });
        
        if (this._systemSettings) {
             this._systemSignalId = this._systemSettings.connect('changed::accent-color', () => {
                if (this._settings.get_boolean('border-use-system-color')) {
                    this._updateStyle();
                }
             });
        }

        this._syncGeometry();

        global.window_group.add_child(this);
        
        // 창 움직임 동기화
        const props = ['scale-x', 'scale-y', 'translation-x', 'translation-y', 'opacity'];
        this._bindings = props.map(prop => 
            this._windowActor.bind_property(prop, this, prop, GObject.BindingFlags.SYNC_CREATE)
        );

        this._restack();

        this._sizeChangedId = this._metaWindow.connect('size-changed', () => this._syncGeometry());
        this._posChangedId = this._metaWindow.connect('position-changed', () => this._syncGeometry());
        this._destroyId = this._windowActor.connect('destroy', () => this.destroy());
    }

    _getSystemAccentColor() {
        if (!this._systemSettings) return 'rgb(53, 132, 228)'; // Fallback Blue
        const colorName = this._systemSettings.get_string('accent-color');
        return ACCENT_COLORS[colorName] || 'rgb(230, 97, 0)'; // Default to Orange if unknown (Ubuntu friendly)
    }

    _updateStyle() {
        const width = this._settings.get_int('border-width');
        const radius = this._settings.get_int('border-radius');
        let color;

        if (this._settings.get_boolean('border-use-system-color')) {
            color = this._getSystemAccentColor();
        } else {
            color = this._settings.get_string('border-color');
        }

        this.set_style(`
            border-width: ${width}px;
            border-radius: ${radius}px;
            border-color: ${color};
            background-color: transparent;
            box-shadow: none; 
        `);
    }

    _syncGeometry() {
        if (!this._metaWindow || !this._windowActor) return;

        if (this._metaWindow.is_fullscreen() || 
            (this._metaWindow.maximized_horizontally && this._metaWindow.maximized_vertically)) {
            this.hide();
            return;
        }

        const width = this._settings.get_int('border-width');

        // [Chrome 글리치 해결] 그림자 제외한 실제 영역 계산
        let rect = this._metaWindow.get_buffer_rect();
        if (!rect || rect.width === 0) rect = this._metaWindow.get_frame_rect();

        this.set_size(this._windowActor.width + (width * 2), this._windowActor.height + (width * 2));
        this.set_pivot_point(0.5, 0.5); 
        this._windowActor.set_pivot_point(0.5, 0.5);
        
        const frameRect = this._metaWindow.get_frame_rect();
        // 위치 보정
        this.set_position(frameRect.x - width, frameRect.y - width);
        this.set_size(frameRect.width + (width * 2), frameRect.height + (width * 2));

        this.show();
        this._restack();
    }

    _restack() {
        const parent = this.get_parent();
        if (parent && this._windowActor) {
            try {
                parent.set_child_above_sibling(this, this._windowActor);
            } catch (e) {
                this.raise_top();
            }
        }
    }

    destroy() {
        if (this._settingsSignalId) this._settings.disconnect(this._settingsSignalId);
        if (this._systemSignalId && this._systemSettings) this._systemSettings.disconnect(this._systemSignalId);
        
        if (this._metaWindow) {
            if (this._sizeChangedId) this._metaWindow.disconnect(this._sizeChangedId);
            if (this._posChangedId) this._metaWindow.disconnect(this._posChangedId);
        }
        if (this._windowActor && this._destroyId) {
            this._windowActor.disconnect(this._destroyId);
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