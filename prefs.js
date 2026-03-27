import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import Gdk from 'gi://Gdk';
import GObject from 'gi://GObject';
import { ExtensionPreferences, gettext as _ } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export default class FocusPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();
        const page = new Adw.PreferencesPage();
        window.add(page);

        // ==========================================
        // 1. 테두리 설정 (Border)
        // ==========================================
        const borderGroup = new Adw.PreferencesGroup({
            title: _('Active Window Border'),
            description: _('Customize the highlight border.')
        });
        page.add(borderGroup);

        // 1-1. 테두리 사용 여부
        const borderSwitch = new Adw.SwitchRow({
            title: _('Enable Border'),
            subtitle: _('Show border around the active window')
        });
        borderGroup.add(borderSwitch);
        settings.bind('border-enabled', borderSwitch, 'active', 0);

        // 1-2. 시스템 색상 사용 여부 (New!)
        const systemColorSwitch = new Adw.SwitchRow({
            title: _('Use System Accent Color'),
            subtitle: _('Sync with Ubuntu/GNOME theme color')
        });
        borderGroup.add(systemColorSwitch);
        settings.bind('border-use-system-color', systemColorSwitch, 'active', 0);

        // 1-3. 사용자 지정 색상 (RGB 입력 가능)
        const colorRow = new Adw.ActionRow({ title: _('Custom Color') });
        const colorDialog = new Gtk.ColorDialog();
        const colorButton = new Gtk.ColorDialogButton({ 
            dialog: colorDialog,
            valign: Gtk.Align.CENTER
        });

        // 초기 색상 로드
        try {
            const rgba = new Gdk.RGBA();
            rgba.parse(settings.get_string('border-color'));
            colorButton.set_rgba(rgba);
        } catch(e) {}

        // 색상 저장
        colorButton.connect('notify::rgba', () => {
            const rgba = colorButton.get_rgba();
            const colorString = `rgba(${Math.round(rgba.red * 255)}, ${Math.round(rgba.green * 255)}, ${Math.round(rgba.blue * 255)}, ${rgba.alpha})`;
            settings.set_string('border-color', colorString);
        });

        colorRow.add_suffix(colorButton);
        borderGroup.add(colorRow);

        // [UI 로직] 시스템 색상을 쓰면, 커스텀 색상 행을 비활성화(Dim) 처리
        // systemColorSwitch의 'active' 상태와 colorRow의 'sensitive' 상태를 반대로 묶음
        systemColorSwitch.bind_property(
            'active', 
            colorRow, 
            'sensitive', 
            GObject.BindingFlags.SYNC_CREATE | GObject.BindingFlags.INVERT_BOOLEAN
        );

        // 1-4. 두께 (SpinRow - 입력 가능)
        const widthRow = new Adw.SpinRow({
            title: _('Border Width (px)'),
            adjustment: new Gtk.Adjustment({ lower: 1, upper: 20, step_increment: 1 }),
            value: settings.get_int('border-width')
        });
        borderGroup.add(widthRow);
        settings.bind('border-width', widthRow, 'value', 0);

        // 1-5. 둥글기 (SpinRow)
        const radiusRow = new Adw.SpinRow({
            title: _('Border Radius (px)'),
            adjustment: new Gtk.Adjustment({ lower: 0, upper: 50, step_increment: 1 }),
            value: settings.get_int('border-radius')
        });
        borderGroup.add(radiusRow);
        settings.bind('border-radius', radiusRow, 'value', 0);


        // ==========================================
        // 2. 비활성창 스타일 (Inactive Window) - % 단위 통일
        // ==========================================
        const styleGroup = new Adw.PreferencesGroup({
            title: _('Inactive Window Style'),
            description: _('Adjust visuals for background windows.')
        });
        page.add(styleGroup);

        // 2-1. 투명도 (Opacity %)
        const opacityRow = new Adw.SpinRow({
            title: _('Opacity (%)'),
            subtitle: _('100% is fully visible, 0% is invisible'),
            adjustment: new Gtk.Adjustment({ lower: 0, upper: 100, step_increment: 5 }),
            value: settings.get_int('inactive-opacity')
        });
        styleGroup.add(opacityRow);
        settings.bind('inactive-opacity', opacityRow, 'value', 0);

        // 2-2. 어둡기 (Darkness %) - 명도 대신 직관적인 'Darkness' 사용
        const darknessRow = new Adw.SpinRow({
            title: _('Dimming / Darkness (%)'),
            subtitle: _('0% is original brightness, 100% is black'),
            adjustment: new Gtk.Adjustment({ lower: 0, upper: 100, step_increment: 5 }),
            value: settings.get_int('inactive-darkness')
        });
        styleGroup.add(darknessRow);
        settings.bind('inactive-darkness', darknessRow, 'value', 0);

        // 2-3. 흑백 처리 (Desaturation %)
        const desatRow = new Adw.SpinRow({
            title: _('Desaturation (%)'),
            subtitle: _('0% is original color, 100% is black & white'),
            adjustment: new Gtk.Adjustment({ lower: 0, upper: 100, step_increment: 10 }),
            value: settings.get_int('inactive-desaturation')
        });
        styleGroup.add(desatRow);
        settings.bind('inactive-desaturation', desatRow, 'value', 0);

        // ==========================================
        // 3. Window State Exemptions
        // ==========================================
        const stateGroup = new Adw.PreferencesGroup({
            title: _('Window State Exemptions'),
            description: _('Exempt windows from inactive styling based on their state.')
        });
        page.add(stateGroup);

        const skipAboveRow = new Adw.SwitchRow({
            title: _('Skip Always-on-Top Windows')
        });
        stateGroup.add(skipAboveRow);
        settings.bind('skip-always-on-top', skipAboveRow, 'active', 0);

        const skipFullscreenRow = new Adw.SwitchRow({
            title: _('Skip Fullscreen Windows')
        });
        stateGroup.add(skipFullscreenRow);
        settings.bind('skip-fullscreen', skipFullscreenRow, 'active', 0);

        const skipMaxHRow = new Adw.SwitchRow({
            title: _('Skip Horizontally Maximized'),
            subtitle: _('Includes tiled/snapped windows')
        });
        stateGroup.add(skipMaxHRow);
        settings.bind('skip-maximized-horizontal', skipMaxHRow, 'active', 0);

        const skipMaxVRow = new Adw.SwitchRow({
            title: _('Skip Vertically Maximized'),
            subtitle: _('Includes tiled/snapped windows')
        });
        stateGroup.add(skipMaxVRow);
        settings.bind('skip-maximized-vertical', skipMaxVRow, 'active', 0);

        const skipStickyRow = new Adw.SwitchRow({
            title: _('Skip Sticky Windows'),
            subtitle: _('Windows visible on all workspaces')
        });
        stateGroup.add(skipStickyRow);
        settings.bind('skip-sticky', skipStickyRow, 'active', 0);

        // ==========================================
        // 4. Per-App Filtering
        // ==========================================
        const _modeDescription = (mode) => mode === 'allowlist'
            ? _('Only listed apps get inactive styling. All others are exempt.')
            : _('Listed apps are exempt from inactive styling.');

        const appFilterGroup = new Adw.PreferencesGroup({
            title: _('Per-App Filtering'),
            description: _modeDescription(settings.get_string('filter-mode'))
        });
        page.add(appFilterGroup);

        const filterModeRow = new Adw.ComboRow({
            title: _('Filter Mode'),
            model: new Gtk.StringList({ strings: ['Denylist', 'Allowlist'] })
        });
        appFilterGroup.add(filterModeRow);

        filterModeRow.set_selected(settings.get_string('filter-mode') === 'allowlist' ? 1 : 0);
        filterModeRow.connect('notify::selected', () => {
            settings.set_string('filter-mode', filterModeRow.get_selected() === 1 ? 'allowlist' : 'denylist');
        });
        settings.connect('changed::filter-mode', () => {
            const mode = settings.get_string('filter-mode');
            filterModeRow.set_selected(mode === 'allowlist' ? 1 : 0);
            appFilterGroup.set_description(_modeDescription(mode));
            _rebuildAppListUI();
        });

        const _addEntry = (wmClass) => {
            const list = settings.get_strv('filter-app-list');
            if (!list.includes(wmClass)) {
                list.push(wmClass);
                settings.set_strv('filter-app-list', list);
                _rebuildAppListUI();
            }
        };

        let _appListRows = [];
        const _rebuildAppListUI = () => {
            _appListRows.forEach(row => appFilterGroup.remove(row));
            _appListRows = [];

            const mode = settings.get_string('filter-mode');
            const currentList = settings.get_strv('filter-app-list');

            currentList.forEach((app, index) => {
                const row = new Adw.ActionRow({ title: app });
                const removeButton = new Gtk.Button({
                    icon_name: 'edit-delete-symbolic',
                    valign: Gtk.Align.CENTER,
                    css_classes: ['flat']
                });
                removeButton.connect('clicked', () => {
                    const list = settings.get_strv('filter-app-list');
                    list.splice(index, 1);
                    settings.set_strv('filter-app-list', list);
                    _rebuildAppListUI();
                });
                row.add_suffix(removeButton);
                appFilterGroup.add(row);
                _appListRows.push(row);
            });

            // Picker from running windows
            const knownClasses = settings.get_strv('known-window-classes')
                .filter(c => !currentList.includes(c));

            if (knownClasses.length > 0) {
                const expanderRow = new Adw.ExpanderRow({
                    title: mode === 'allowlist'
                        ? _('Add from running apps (include)...')
                        : _('Add from running apps (exclude)...')
                });
                knownClasses.forEach(wmClass => {
                    const row = new Adw.ActionRow({ title: wmClass });
                    const addButton = new Gtk.Button({
                        icon_name: 'list-add-symbolic',
                        valign: Gtk.Align.CENTER,
                        css_classes: ['flat']
                    });
                    addButton.connect('clicked', () => _addEntry(wmClass));
                    row.add_suffix(addButton);
                    expanderRow.add_row(row);
                });
                appFilterGroup.add(expanderRow);
                _appListRows.push(expanderRow);
            }

            // Manual entry fallback
            const addRow = new Adw.EntryRow({
                title: mode === 'allowlist'
                    ? _('Or type a WM_CLASS to include...')
                    : _('Or type a WM_CLASS to exclude...'),
                show_apply_button: true
            });
            addRow.connect('apply', () => {
                const text = addRow.get_text().trim();
                if (text) _addEntry(text);
            });
            appFilterGroup.add(addRow);
            _appListRows.push(addRow);
        };
        _rebuildAppListUI();
        settings.connect('changed::known-window-classes', () => _rebuildAppListUI());
    }
}
