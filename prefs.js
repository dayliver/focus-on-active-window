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

        const behaviorGroup = new Adw.PreferencesGroup({
            title: _('Exceptions'),
            description: _('Exclude fullscreen windows, specific apps, or matching window titles from dimming and borders.')
        });
        page.add(behaviorGroup);

        const fullscreenRow = new Adw.SwitchRow({
            title: _('Ignore Fullscreen Windows'),
            subtitle: _('Leave fullscreen windows fully untouched')
        });
        behaviorGroup.add(fullscreenRow);
        settings.bind('skip-fullscreen-windows', fullscreenRow, 'active', 0);

        const mediaRow = new Adw.SwitchRow({
            title: _('Ignore Media / Call Windows'),
            subtitle: _('Heuristically bypass effects for video players, YouTube-like tabs, and common meeting apps')
        });
        behaviorGroup.add(mediaRow);
        settings.bind('ignore-media-windows', mediaRow, 'active', 0);

        const excludedAppsRow = new Adw.EntryRow({
            title: _('Excluded Apps'),
        });
        excludedAppsRow.set_text(settings.get_string('excluded-apps'));
        excludedAppsRow.set_input_hints(Gtk.InputHints.NO_SPELLCHECK);
        excludedAppsRow.connect('changed', row => {
            settings.set_string('excluded-apps', row.get_text());
        });
        behaviorGroup.add(excludedAppsRow);

        const excludedAppsHelp = new Adw.ActionRow({
            title: _('App matches'),
            subtitle: _('Comma or newline separated. Matches app name, desktop ID, WM_CLASS, or WM_CLASS instance.')
        });
        behaviorGroup.add(excludedAppsHelp);

        const excludedTitlesRow = new Adw.EntryRow({
            title: _('Excluded Window Titles'),
        });
        excludedTitlesRow.set_text(settings.get_string('excluded-window-titles'));
        excludedTitlesRow.set_input_hints(Gtk.InputHints.NO_SPELLCHECK);
        excludedTitlesRow.connect('changed', row => {
            settings.set_string('excluded-window-titles', row.get_text());
        });
        behaviorGroup.add(excludedTitlesRow);

        const excludedTitlesHelp = new Adw.ActionRow({
            title: _('Title matches'),
            subtitle: _('Comma or newline separated substrings matched against the window title.')
        });
        behaviorGroup.add(excludedTitlesHelp);
    }
}
