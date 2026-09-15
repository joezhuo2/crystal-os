# Planned Features
- [v0.6.0] Nebula Update - deepseek harness + claude code connections

# QoL/Changes

- implement `ctrl+alt` to quickly switch from one model to the next and `ctrl+w` to quickly close tab, `ctrl+r` to reload the page (ALSO FIX: `ctrl+r` currently moves me to the home page, but does NOT close the discord/instagram overlay, resulting in home page with the discord overlay)

- replace the default apps in the portal: 
    - whatsapp => linkedin
    - messenger => 
    - slack => 
    - telegram => 

- in the bottom of the settings menu, add a place to download the latest exe installer or build the latest one (for latest released version), and add option for user to choose which version they want to download

- update the obsidian section to have its own theme
    - should have a dark purple/ambient crystallized theme
    - have crystal images (choose between svg shapes or css polygons or glassmorphism shapes) with different opacity levels (0.3 to 0.9)
    - add random sparkles in the background and some layered on top of the crystals
    - track cursor movement in the obsidian overlay using a custom css property and avoid react re-renders
    - implement a glowing cursor aura via a radial gradient overlay bound to the mouse location (opacity: 0.5-0.8)
    - the crystals should reflect the light of the cursor if it hovers over the crystal (boost brightness, border contrast, and backdrop-filter glass reflection relative to the cursor light overlay)
    - implement using pure css + tailwind + native DOM, DO NOT USE external 3D or canvas libraries
    - ensure high performance (60 fps) using css transform and opacity hardware acceleration

# Bug Fixes

- when i right click a tab in the portal, instead of showing an overlay with the options it gives me, it hides the entire current screen and makes it only show the logo rather than the content in the website

# Cleanup
- remove old project files created by `npm run build:desktop` or `npm run build`