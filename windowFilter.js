import Shell from 'gi://Shell';

const MEDIA_APP_TOKENS = [
    'vlc',
    'mpv',
    'celluloid',
    'totem',
    'spotify',
    'youtube music',
    'plex',
    'stremio',
    'zoom',
    'teams',
    'skype',
    'discord',
    'slack',
    'webex',
    'jitsi',
];

const MEDIA_TITLE_TOKENS = [
    'youtube',
    'netflix',
    'twitch',
    'prime video',
    'disney+',
    'hulu',
    'jellyfin',
    'plex',
    'meet',
    'zoom meeting',
    'microsoft teams',
    'webex',
    'jitsi',
    'slack call',
    'huddle',
];

function _parseList(value) {
    return value
        .split(/[,\n]/)
        .map(item => item.trim().toLowerCase())
        .filter(Boolean);
}

function _getWindowTokens(metaWindow) {
    const tracker = Shell.WindowTracker.get_default();
    const app = tracker.get_window_app(metaWindow);

    return [
        metaWindow.get_wm_class(),
        metaWindow.get_wm_class_instance?.(),
        app?.get_id?.(),
        app?.get_name?.(),
    ]
        .filter(Boolean)
        .map(value => value.toLowerCase());
}

function _matchesMediaWindow(metaWindow) {
    const tokens = _getWindowTokens(metaWindow);
    if (tokens.some(token => MEDIA_APP_TOKENS.some(candidate => token.includes(candidate))))
        return true;

    const title = (metaWindow.get_title() ?? '').toLowerCase();
    return MEDIA_TITLE_TOKENS.some(candidate => title.includes(candidate));
}

function _coversMonitor(metaWindow) {
    const monitorIndex = metaWindow.get_monitor?.();
    if (monitorIndex === null || monitorIndex === undefined || monitorIndex < 0)
        return false;

    const frameRect = metaWindow.get_frame_rect();
    const monitorRect = global.display.get_monitor_geometry(monitorIndex);

    return frameRect.x <= monitorRect.x &&
        frameRect.y <= monitorRect.y &&
        frameRect.x + frameRect.width >= monitorRect.x + monitorRect.width &&
        frameRect.y + frameRect.height >= monitorRect.y + monitorRect.height;
}

export function shouldBypassEffects(settings, metaWindow) {
    if (!metaWindow)
        return true;

    if (settings.get_boolean('skip-fullscreen-windows') && (metaWindow.is_fullscreen() || _coversMonitor(metaWindow)))
        return true;

    if (settings.get_boolean('ignore-media-windows') && _matchesMediaWindow(metaWindow))
        return true;

    const excludedApps = _parseList(settings.get_string('excluded-apps'));
    if (excludedApps.length > 0) {
        const tokens = _getWindowTokens(metaWindow);
        if (tokens.some(token => excludedApps.some(excluded => token.includes(excluded))))
            return true;
    }

    const excludedTitles = _parseList(settings.get_string('excluded-window-titles'));
    if (excludedTitles.length > 0) {
        const title = (metaWindow.get_title() ?? '').toLowerCase();
        if (excludedTitles.some(excluded => title.includes(excluded)))
            return true;
    }

    return false;
}
