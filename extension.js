import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import { BorderManager } from './borderManager.js';
import { StyleManager } from './styleManager.js';

export default class FocusExtension extends Extension {
    enable() {
        // 1. 스키마와 연결된 설정 객체(Settings)를 가져옵니다.
        const settings = this.getSettings();

        // 2. 각 매니저에게 설정 객체를 전달하며 생성합니다.
        this._borderManager = new BorderManager(settings);
        this._borderManager.enable();

        this._styleManager = new StyleManager(settings);
        this._styleManager.enable();
    }

    disable() {
        if (this._borderManager) {
            this._borderManager.disable();
            this._borderManager = null;
        }

        if (this._styleManager) {
            this._styleManager.disable();
            this._styleManager = null;
        }
    }
}