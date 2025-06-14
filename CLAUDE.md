# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a web-based implementation of Langton's Ant and Turmite simulations. It's a single-page application that renders cellular automata on an HTML5 canvas with an interactive control panel.

## Architecture

The application consists of:

- **index.html**: Main HTML structure with canvas and control panel
- **script.js**: Core simulation engine handling:
  - Grid management and cellular automaton logic
  - Multiple ant simulation with individual or shared rules
  - Canvas rendering with pan/zoom functionality
  - Real-time control updates and rule editing
- **presets.js**: Predefined rule sets for various turmite patterns
- **style.css**: UI styling for the control panel and canvas

## Key Concepts

### Simulation Structure
- **Grid**: 2D array representing the cellular automaton state
- **Ants**: Array of ant objects, each with position (x,y), direction, and state
- **Rules**: JSON objects defining state transitions based on current cell color and ant state
- **Rendering**: Split into simulation loop (logic) and render loop (drawing) for performance

### Rule System
Rules are JSON objects with the structure:
```json
{
  "state": [
    { "writeColor": colorIndex, "move": "L|R|U|N|S|^|>|v|<|?", "nextState": stateIndex }
  ]
}
```

Movement codes:
- L/R/U/N: Relative turns (Left/Right/U-turn/None)
- S: Stay in place
- ^/>v<: Absolute directions (North/East/South/West)
- ?: Random direction

### Performance Optimization
- Uses requestAnimationFrame for smooth rendering
- Tracks changed cells to minimize redraw operations
- Implements viewport culling for large grids
- Separates simulation timing from render timing

## Development Notes

### File Structure
- All logic is in vanilla JavaScript (no build process required)
- Simply open index.html in a browser to run
- Presets are defined in presets.js and dynamically loaded

### Control Panel Features
- Rule editor with JSON validation
- Preset loading/saving
- Individual ant rules (each ant can have different rule sets)
- Real-time parameter adjustment
- Apply/Discard pattern for pending changes

### Canvas Interaction
- Mouse wheel: Zoom in/out
- Mouse drag: Pan view
- Keyboard shortcuts: Space (pause/play), F (randomize), R (reset)

## Common Tasks

### Adding New Presets
Add new rule objects to the `presetDefinitions` in presets.js following the existing pattern.

### Modifying Simulation Logic
The core ant stepping logic is in `stepSingleAntLogic()` in script.js. This handles rule application and movement.

### UI Changes
Control panel layout is defined in index.html with styling in style.css. Event listeners are set up in the DOMContentLoaded handler in script.js.