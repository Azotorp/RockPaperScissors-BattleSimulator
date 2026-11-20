# Dev.9 overlay opacity and mobile touch

The Controls and Spawn panels each use their own opacity slider. Both start at 100% opacity. Settings → Interface → Other overlay background transparency controls the remaining overlay backgrounds and starts at 0% transparency. Saved personal values take precedence over these defaults.

Touch input no longer moves overlays or the Settings window. Mobile users can still scroll panels, adjust sliders, use arena gestures, and reset saved overlay positions. Desktop mouse users can move overlays through Settings → Interface.

Desktop and touch-emulated Chromium tests verified the rendered background alpha at 10% and 100% Controls opacity, independent Spawn opacity, and saved values after reload. A touch drag on the Settings header left its position intact. Desktop drag, reset, and settings export/import also passed.
