import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import { BorderManager } from './borderManager.js';
import { StyleManager } from './styleManager.js';

export default class FocusExtension extends Extension {
    enable() {
        const settings = this.getSettings();

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