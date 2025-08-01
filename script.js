const canvas = document.getElementById('antCanvas');
const ctx = canvas.getContext('2d');

let width, height;
const cellSize = 1; // Logical size of each cell (we zoom the canvas, not change this)
let grid;
let ants = []; // Array to hold multiple ants
let gridCols = 0, gridRows = 0;
let intervalId = null;
let stepsPerTick; // Number of steps to run per interval tick
let isRunning = true; // Simulation starts running

// View transformation state
const initialScale = 8; // Define initial scale
let scale = initialScale; // Use constant for initial value
let offsetX = 0;
let offsetY = 0;
let lastMouseX = 0;
let lastMouseY = 0;
let isDragging = false;

// Zoom constraints
const minScale = 0.1;
const maxScale = 50;
const zoomFactor = 1.1;

// Speed configuration (Simplified)
const slowModeThreshold = 1000 / 16; // ~62.5 FPS threshold (using 16ms as a reference)

const directions = [
    { dx: 0, dy: -1 }, // North
    { dx: 1, dy: 0 },  // East
    { dx: 0, dy: 1 },  // South
    { dx: -1, dy: 0 }  // West
];

let currentIntervalId = null;
let currentIntervalDelay = 0;
let currentStepsPerTick = 1;
let timeoutId = null; // ID for setTimeout loop (replaced animationFrameId)

// --- Configuration ---
const minSimSpeed = 1;       // Min Steps/Sec at slider value 1
const midSimSpeed = 60;      // Steps/Sec at slider midpoint (50)
const maxSimSpeed = 100000;   // Max Target Steps/Sec at slider value 100 (Adjusted)
const maxStepsPerLoopIteration = 100000; // Safety limit

// Define neon cell colors (up to 12)
const cellColors = [
    '#000000', // 0: Black (Background)
    '#FFFFFF', // 1: White 
    '#FF00FF', // 2: Magenta/Fuchsia
    '#FFFF00', // 3: Yellow
    '#00FF00', // 4: Lime
    '#00FFFF', // 5: Cyan/Aqua
    '#FF0000', // 6: Red 
    '#FFA500', // 7: Orange
    '#0000FF', // 8: Blue
    '#FF69B4', // 9: Hot Pink
    '#DA70D6', // 10: Orchid
    '#8A2BE2'  // 11: BlueViolet
];
const maxPossibleColors = cellColors.length; // Should now be 12
// const numColors = cellColors.length; // Removed, numColors used is variable now

// --- Turmite Rule Definition (Mutable) ---
let rules = {}; // Initialize as empty

// --- State Storage for Discard --- 
let lastAppliedState = {};

// Function to generate random rules with variable states/colors
function generateRandomRules(numStates, numColorsToUse) {
    const newRules = {};
    const moveRelativeCheck = document.getElementById('moveRelativeCheck');
    const moveAbsoluteCheck = document.getElementById('moveAbsoluteCheck');
    const moveRandomCheck = document.getElementById('moveRandomCheck');

    const useRelative = moveRelativeCheck ? moveRelativeCheck.checked : true; // Default true
    const useAbsolute = moveAbsoluteCheck ? moveAbsoluteCheck.checked : false;
    const useRandom = moveRandomCheck ? moveRandomCheck.checked : false;

    let moveOptions = ['S']; // 'S' is always available
    if (useRelative) {
        moveOptions.push('L', 'R', 'N', 'U');
    }
    if (useAbsolute) {
        moveOptions.push('^', '>', 'v', '<');
    }
    if (useRandom) {
        moveOptions.push('?');
    }
    // Ensure there's at least one move option if all are unchecked (fallback to S, which is already there)
    if (moveOptions.length === 1 && moveOptions[0] === 'S' && !useRelative && !useAbsolute && !useRandom) {
        // If only S is present because all checkboxes were somehow unchecked (e.g. by dev tools)
        // and S was the only thing, let's add N as a minimal non-staying move.
        // However, S is always present by default, so this case might be rare unless S is removed above.
        // Let's ensure 'N' if options are truly empty otherwise.
        if(moveOptions.length === 0) moveOptions.push('N'); 
    }
    if (moveOptions.length === 0) moveOptions.push('N'); // Final fallback if list is empty

    for (let s = 0; s < numStates; s++) {
        newRules[s] = [];
        for (let c = 0; c < numColorsToUse; c++) {
            // Write one of the *used* colors (index 0 to numColorsToUse-1)
            const writeColor = Math.floor(Math.random() * numColorsToUse);
            const moveIndex = Math.floor(Math.random() * moveOptions.length);
            const move = moveOptions[moveIndex];
            const nextState = Math.floor(Math.random() * numStates);
            newRules[s].push({ writeColor, move, nextState });
        }
    }
    rules = newRules;
}

// Helper function to generate rules for a single ant
function generateRandomRulesForAnt(numStates, numColorsToUse) {
    const antSpecificRules = {};
    const moveRelativeCheck = document.getElementById('moveRelativeCheck');
    const moveAbsoluteCheck = document.getElementById('moveAbsoluteCheck');
    const moveRandomCheck = document.getElementById('moveRandomCheck');

    const useRelative = moveRelativeCheck ? moveRelativeCheck.checked : true;
    const useAbsolute = moveAbsoluteCheck ? moveAbsoluteCheck.checked : false;
    const useRandom = moveRandomCheck ? moveRandomCheck.checked : false;

    let moveOptions = ['S']; // 'S' is always available
    if (useRelative) {
        moveOptions.push('L', 'R', 'N', 'U');
    }
    if (useAbsolute) {
        moveOptions.push('^', '>', 'v', '<');
    }
    if (useRandom) {
        moveOptions.push('?');
    }
    if (moveOptions.length === 0) moveOptions.push('N'); // Fallback if all are somehow unchecked

    for (let s = 0; s < numStates; s++) {
        antSpecificRules[s] = [];
        for (let c = 0; c < numColorsToUse; c++) {
            const writeColor = Math.floor(Math.random() * numColorsToUse);
            const moveIndex = Math.floor(Math.random() * moveOptions.length);
            const move = moveOptions[moveIndex];
            const nextState = Math.floor(Math.random() * numStates);
            antSpecificRules[s].push({ writeColor, move, nextState });
        }
    }
    return antSpecificRules;
}

// --- State Variables ---
let simulationTimeoutId = null;   // ID for simulation setTimeout loop
let nextStepTime = 0;             // Target time for the next simulation step
let renderRequestId = null;       // ID for render requestAnimationFrame
let pauseTime = 0; // Added: Store time when paused
let cellsToUpdate = new Set(); // Combined set for all redraw locations
let needsFullRedraw = true; // Flag to trigger full grid redraw
let simulationStepCount = 0; // Track simulation steps for accurate MIDI timing

// --- Animation Mode Variables ---
let animationMode = false;
let animationTimeoutId = null;
let gridFillStartTime = 0;
let lastGridFillCheck = 0;
let gridFillThreshold = 0.8; // 80% of cells changed from initial state
let animationSpeedRampInterval = null;
let currentAnimationSpeed = 50; // Start at default speed
let targetAnimationSpeed = 100; // Target max speed
let speedRampDuration = 30000; // 30 seconds to reach max speed
let animationStartTime = 0;
let lastPaintedCellsCount = 0;
let noPaintProgressTime = 0;
let noPaintThreshold = 10000; // 10 seconds with no new cells painted

// --- Art Installation Variables ---
let artInstallationMode = false;
let artOverlayVisible = false;
let computationalLoad = 0;
let systemicComplexity = 1;
let dataStreamValue = 0;
let philosophicalQuotes = [
    "L'intelligence artificielle dépasse l'entendement humain...",
    "Ces algorithmes évoluent au-delà de notre compréhension...",
    "La complexité computationnelle échappe à la raison...",
    "Nous sommes dépassés par nos propres créations...",
    "L'émergence surpasse l'intention de son créateur...",
    "Dans cette symphonie de données, l'humain devient obsolète...",
    "Chaque calcul nous éloigne de la compréhension..."
];
let currentQuoteIndex = 0;
let artMetricsUpdateInterval = null;
let glitchEffectActive = false;
let infiniteMode = false;
let performanceDegradationLevel = 0;
let autoScalingInterval = null;
let exponentialGrowthFactor = 1.02;

// --- Audio Variables ---
let audioContext = null;
let masterGain = null;
let audioEnabled = false;
let audioVolume = 0.3;
let currentScale = 'pentatonic'; // Musical scale to use
let baseFrequency = 220; // A3 as base frequency
let scheduledNotes = new Map(); // Track scheduled audio events
let lastAudioTime = 0; // Throttle audio generation
let audioThrottleMs = 50; // Minimum time between audio events per ant

// --- MIDI Variables ---
let midiEnabled = false;
let midiAccess = null;
let selectedMidiOutput = null;
let midiOutputs = [];
let midiChannel = 0; // Base MIDI channel (0-15)
let midiVelocity = 64; // Default velocity (0-127)
let midiProgramPerAnt = false; // Use different program (instrument) per ant
let activeMidiNotes = new Map(); // Track active MIDI notes for proper note-off

// --- MIDI Recording Variables ---
let midiRecording = false;
let midiRecordingStartTime = 0;
let recordedMidiEvents = [];
let midiExportTimer = null;

// --- Musical Scales ---
const musicalScales = {
    chromatic: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
    pentatonic: [0, 2, 4, 7, 9],
    major: [0, 2, 4, 5, 7, 9, 11],
    minor: [0, 2, 3, 5, 7, 8, 10],
    dorian: [0, 2, 3, 5, 7, 9, 10],
    blues: [0, 3, 5, 6, 7, 10]
};

// --- Audio Functions ---
function initAudio() {
    try {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        masterGain = audioContext.createGain();
        masterGain.connect(audioContext.destination);
        masterGain.gain.value = audioVolume;
        
        // Resume context if it's suspended (required in some browsers)
        if (audioContext.state === 'suspended') {
            audioContext.resume().then(() => {
                console.log("Audio context resumed");
            });
        }
        
        console.log("Audio initialized successfully");
        return true;
    } catch (error) {
        console.error("Audio initialization failed:", error);
        return false;
    }
}

function playNote(frequency, duration = 0.2, volume = 0.5, antIndex = 0) {
    if (!audioContext || !audioEnabled) return;
    
    const now = audioContext.currentTime;
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    // Different waveforms for different ants
    const waveforms = ['sine', 'sawtooth', 'square', 'triangle'];
    oscillator.type = waveforms[antIndex % waveforms.length];
    oscillator.frequency.setValueAtTime(frequency, now);
    
    // ADSR envelope
    gainNode.gain.setValueAtTime(0, now);
    gainNode.gain.linearRampToValueAtTime(volume, now + 0.01); // Attack
    gainNode.gain.exponentialRampToValueAtTime(volume * 0.7, now + duration * 0.3); // Decay
    gainNode.gain.setValueAtTime(volume * 0.7, now + duration * 0.7); // Sustain
    gainNode.gain.exponentialRampToValueAtTime(0.001, now + duration); // Release
    
    oscillator.connect(gainNode);
    gainNode.connect(masterGain);
    
    oscillator.start(now);
    oscillator.stop(now + duration);
    
    // Record MIDI event if recording
    if (midiRecording) {
        const midiNote = frequencyToMidiNote(frequency);
        const timestamp = performance.now() - midiRecordingStartTime;
        recordMidiEvent({
            note: midiNote,
            velocity: Math.round(volume * 127),
            duration: duration,
            channel: antIndex % 16,
            timestamp: timestamp
        });
    }
}

function gridToFrequency(x, y, gridCols, gridRows) {
    // Map X coordinate to pitch (logarithmic scale)
    const scaleNotes = musicalScales[currentScale];
    const noteIndex = Math.floor((x / gridCols) * scaleNotes.length * 4); // 4 octaves
    const octave = Math.floor(noteIndex / scaleNotes.length);
    const noteInScale = scaleNotes[noteIndex % scaleNotes.length];
    
    // Calculate frequency from base frequency
    const semitones = octave * 12 + noteInScale;
    return baseFrequency * Math.pow(2, semitones / 12);
}

function gridToRhythm(y, gridRows) {
    // Map Y coordinate to note duration (faster = shorter notes)
    const normalizedY = 1 - (y / gridRows); // Invert so up = faster
    return 0.1 + normalizedY * 0.4; // Duration range: 0.1s to 0.5s
}

function colorToVolume(colorIndex) {
    // Map different colors to different volumes
    const volumes = [0.1, 0.8, 0.6, 0.7, 0.5, 0.9, 0.4, 0.3, 0.8, 0.6, 0.7, 0.5];
    return volumes[colorIndex % volumes.length];
}

// --- MIDI Functions ---
async function initMIDI() {
    try {
        // Check if Web MIDI API is available
        if (!navigator.requestMIDIAccess) {
            console.warn("Web MIDI API is not supported in this browser");
            return false;
        }
        
        midiAccess = await navigator.requestMIDIAccess();
        console.log("MIDI access granted");
        
        // Get available outputs
        midiOutputs = [];
        midiAccess.outputs.forEach((output, id) => {
            midiOutputs.push({ id, name: output.name, port: output });
            console.log(`MIDI Output found: ${output.name} (${id})`);
        });
        
        // Auto-select first output if available
        if (midiOutputs.length > 0) {
            selectedMidiOutput = midiOutputs[0].port;
            console.log(`Auto-selected MIDI output: ${midiOutputs[0].name}`);
        }
        
        return true;
    } catch (error) {
        console.error("MIDI access denied:", error);
        return false;
    }
}

function frequencyToMidiNote(frequency) {
    // Convert frequency to MIDI note number (A4 = 440Hz = MIDI note 69)
    const midiNote = Math.round(12 * Math.log2(frequency / 440) + 69);
    return Math.max(0, Math.min(127, midiNote)); // Clamp to valid MIDI range
}

function sendMIDINoteOn(note, velocity, channel, antIndex = 0) {
    if (!selectedMidiOutput || !midiEnabled) return;
    
    // Enhanced polyphonic channel assignment
    let actualChannel;
    if (midiProgramPerAnt && ants.length > 1) {
        // Use different channels for each ant to enable true polyphony
        actualChannel = antIndex % 16;
    } else {
        actualChannel = channel;
    }
    
    // Send MIDI note on with high-resolution timing if available
    const timestamp = audioContext ? audioContext.currentTime * 1000 : performance.now();
    const noteOn = [0x90 + actualChannel, note, velocity];
    
    if (selectedMidiOutput.send.length > 1) {
        // Use high-precision timestamp if supported
        selectedMidiOutput.send(noteOn, timestamp);
    } else {
        selectedMidiOutput.send(noteOn);
    }
    
    // Track active note for this ant
    const noteKey = `${antIndex}-${note}-${actualChannel}`;
    activeMidiNotes.set(noteKey, { 
        note, 
        channel: actualChannel, 
        timestamp: timestamp,
        ant: antIndex
    });
}

function sendMIDINoteOff(note, channel, antIndex = 0) {
    if (!selectedMidiOutput || !midiEnabled) return;
    
    // Match the channel assignment logic from noteOn
    let actualChannel;
    if (midiProgramPerAnt && ants.length > 1) {
        actualChannel = antIndex % 16;
    } else {
        actualChannel = channel;
    }
    
    // Send MIDI note off with high-resolution timing if available
    const timestamp = audioContext ? audioContext.currentTime * 1000 : performance.now();
    const noteOff = [0x80 + actualChannel, note, 0];
    
    if (selectedMidiOutput.send.length > 1) {
        selectedMidiOutput.send(noteOff, timestamp);
    } else {
        selectedMidiOutput.send(noteOff);
    }
    
    // Remove from active notes
    const noteKey = `${antIndex}-${note}-${actualChannel}`;
    activeMidiNotes.delete(noteKey);
}

function sendMIDIProgramChange(program, channel) {
    if (!selectedMidiOutput) return;
    
    const programChange = [0xC0 + channel, program];
    selectedMidiOutput.send(programChange);
}

function stopAllMIDINotes() {
    if (!selectedMidiOutput) return;
    
    // Send note off for all active notes
    activeMidiNotes.forEach((noteData, key) => {
        const noteOff = [0x80 + noteData.channel, noteData.note, 0];
        selectedMidiOutput.send(noteOff);
    });
    
    activeMidiNotes.clear();
    
    // Send All Notes Off CC on all channels
    for (let ch = 0; ch < 16; ch++) {
        selectedMidiOutput.send([0xB0 + ch, 123, 0]); // All Notes Off
    }
}

// --- Animation Mode Functions ---
function startAnimationMode() {
    animationMode = true;
    animationStartTime = performance.now();
    gridFillStartTime = 0;
    
    // Initialize stuck detection tracking
    lastPaintedCellsCount = 0;
    noPaintProgressTime = performance.now();
    
    const animationBtn = document.getElementById('animationModeBtn');
    if (animationBtn) {
        animationBtn.classList.add('active');
        animationBtn.textContent = '⏹ Stop Animation';
    }
    
    // Enable audio automatically
    const audioCheck = document.getElementById('audioEnabledCheck');
    if (audioCheck && !audioCheck.checked) {
        audioCheck.checked = true;
        audioCheck.dispatchEvent(new Event('change'));
    }
    
    // Start with random configuration
    randomizeForAnimation();
    
    // Start speed ramping
    startSpeedRamp();
    
    // Start monitoring for grid fill
    startGridFillMonitoring();
    
    console.log("Animation mode started");
}

function stopAnimationMode() {
    animationMode = false;
    
    const animationBtn = document.getElementById('animationModeBtn');
    if (animationBtn) {
        animationBtn.classList.remove('active');
        animationBtn.textContent = '🎬 Animation Mode';
    }
    
    // Clear animation timers
    if (animationTimeoutId) {
        clearTimeout(animationTimeoutId);
        animationTimeoutId = null;
    }
    
    if (animationSpeedRampInterval) {
        clearInterval(animationSpeedRampInterval);
        animationSpeedRampInterval = null;
    }
    
    // Reset speed to default
    const speedSlider = document.getElementById('simSpeedSlider');
    if (speedSlider) {
        speedSlider.value = '50';
        speedSlider.dispatchEvent(new Event('input'));
    }
    
    console.log("Animation mode stopped");
}

function randomizeForAnimation() {
    // Reset speed to starting value for new cycle
    const speedSlider = document.getElementById('simSpeedSlider');
    if (speedSlider) {
        speedSlider.value = '50'; // Reset to default starting speed
        speedSlider.dispatchEvent(new Event('input'));
    }
    
    // Clear existing speed ramp interval
    if (animationSpeedRampInterval) {
        clearInterval(animationSpeedRampInterval);
        animationSpeedRampInterval = null;
    }
    
    // Random number of ants (1-20)
    const numAnts = Math.floor(Math.random() * 20) + 1;
    const antCountInput = document.getElementById('antCountInput');
    if (antCountInput) {
        antCountInput.value = numAnts;
    }
    
    // Random start position
    const positions = ['center', 'random', 'grid', 'row'];
    const randomPosition = positions[Math.floor(Math.random() * positions.length)];
    const startPositionSelect = document.getElementById('startPositionSelect');
    if (startPositionSelect) {
        startPositionSelect.value = randomPosition;
    }
    
    // Random start direction
    const directions = ['0', '1', '2', '3', 'random'];
    const randomDirection = directions[Math.floor(Math.random() * directions.length)];
    const startDirectionSelect = document.getElementById('startDirectionSelect');
    if (startDirectionSelect) {
        startDirectionSelect.value = randomDirection;
    }
    
    // Randomly enable/disable movement types
    const moveRelativeCheck = document.getElementById('moveRelativeCheck');
    const moveAbsoluteCheck = document.getElementById('moveAbsoluteCheck');
    const moveRandomCheck = document.getElementById('moveRandomCheck');
    
    if (moveRelativeCheck) moveRelativeCheck.checked = Math.random() > 0.3; // 70% chance
    if (moveAbsoluteCheck) moveAbsoluteCheck.checked = Math.random() > 0.7; // 30% chance
    if (moveRandomCheck) moveRandomCheck.checked = Math.random() > 0.8; // 20% chance
    
    // Ensure at least one movement type is enabled
    if (moveRelativeCheck && moveAbsoluteCheck && moveRandomCheck) {
        if (!moveRelativeCheck.checked && !moveAbsoluteCheck.checked && !moveRandomCheck.checked) {
            moveRelativeCheck.checked = true;
        }
    }
    
    // Random max states and colors
    const maxStates = Math.floor(Math.random() * 5) + 2; // 2-6 states
    const maxColors = Math.floor(Math.random() * 6) + 3; // 3-8 colors
    
    const possibleStatesInput = document.getElementById('possibleStatesInput');
    const possibleColorsInput = document.getElementById('possibleColorsInput');
    if (possibleStatesInput) possibleStatesInput.value = maxStates;
    if (possibleColorsInput) possibleColorsInput.value = maxColors;
    
    // Randomize and reset
    initSimulation(true, maxStates, maxColors, true);
    
    // Reset camera for better view
    resetCamera();
    
    // Reset animation start time for new speed ramp
    animationStartTime = performance.now();
    
    // Reset stuck detection tracking
    lastPaintedCellsCount = 0;
    noPaintProgressTime = performance.now();
    
    // Start new speed ramp
    startSpeedRamp();
}

function checkGridFill() {
    if (!grid || !animationMode) return 0;
    
    let nonDefaultCells = 0;
    const totalCells = gridCols * gridRows;
    
    for (let y = 0; y < gridRows; y++) {
        for (let x = 0; x < gridCols; x++) {
            if (grid[y][x] !== 0) { // Non-default color
                nonDefaultCells++;
            }
        }
    }
    
    // Track progress for stuck detection
    const currentPaintedCells = nonDefaultCells;
    const now = performance.now();
    
    if (currentPaintedCells > lastPaintedCellsCount) {
        // New cells were painted, reset stuck timer
        lastPaintedCellsCount = currentPaintedCells;
        noPaintProgressTime = now;
    } else if (now - noPaintProgressTime >= noPaintThreshold) {
        // No new cells painted for 10 seconds, randomize to prevent stuck animation
        console.log("No new cells painted for 10 seconds, randomizing to prevent stuck animation");
        lastPaintedCellsCount = 0;
        noPaintProgressTime = now;
        randomizeForAnimation();
    }
    
    return nonDefaultCells / totalCells;
}

function startGridFillMonitoring() {
    const checkInterval = 1000; // Check every second
    
    const monitorGrid = () => {
        if (!animationMode) return;
        
        const fillRatio = checkGridFill();
        const now = performance.now();
        
        if (fillRatio >= gridFillThreshold) {
            if (gridFillStartTime === 0) {
                gridFillStartTime = now;
                console.log(`Grid ${Math.round(fillRatio * 100)}% filled, starting 10s countdown`);
            } else if (now - gridFillStartTime >= 10000) { // 10 seconds elapsed
                console.log("Grid filled for 10s, resetting animation");
                gridFillStartTime = 0;
                randomizeForAnimation();
            }
        } else {
            gridFillStartTime = 0; // Reset timer if grid is no longer filled enough
        }
        
        // Continue monitoring
        if (animationMode) {
            animationTimeoutId = setTimeout(monitorGrid, checkInterval);
        }
    };
    
    monitorGrid();
}

function startSpeedRamp() {
    const startSpeed = 50;
    const maxSpeed = 100;
    const updateInterval = 100; // Update every 100ms
    
    currentAnimationSpeed = startSpeed;
    
    animationSpeedRampInterval = setInterval(() => {
        if (!animationMode) return;
        
        const elapsed = performance.now() - animationStartTime;
        const progress = Math.min(elapsed / speedRampDuration, 1);
        
        // Use exponential curve for more dramatic speed increase
        const exponentialProgress = Math.pow(progress, 2);
        currentAnimationSpeed = startSpeed + (maxSpeed - startSpeed) * exponentialProgress;
        
        // Add random variations for more organic feel
        const randomVariation = (Math.random() - 0.5) * 10;
        currentAnimationSpeed = Math.max(startSpeed, Math.min(maxSpeed, currentAnimationSpeed + randomVariation));
        
        // Update speed slider
        const speedSlider = document.getElementById('simSpeedSlider');
        const speedValue = document.getElementById('simSpeedValue');
        if (speedSlider && speedValue) {
            speedSlider.value = Math.round(currentAnimationSpeed);
            speedValue.textContent = Math.round(mapSliderToSpeed(currentAnimationSpeed));
        }
        
        if (progress >= 1) {
            clearInterval(animationSpeedRampInterval);
            animationSpeedRampInterval = null;
        }
    }, updateInterval);
}

// --- Art Installation Functions ---
function startArtInstallationMode() {
    artInstallationMode = true;
    artOverlayVisible = true;
    
    // Start animation mode automatically
    if (!animationMode) {
        startAnimationMode();
    }
    
    // Show the overlay
    const artOverlay = document.getElementById('artOverlay');
    if (artOverlay) {
        artOverlay.classList.remove('hidden');
    }
    
    // Update button state
    const artBtn = document.getElementById('artInstallationBtn');
    if (artBtn) {
        artBtn.classList.add('active');
        artBtn.textContent = '🔴 Arrêter Installation';
    }
    
    // Hide control panel for immersive experience
    const controlPanel = document.getElementById('controlPanel');
    if (controlPanel) {
        controlPanel.style.display = 'none';
    }
    
    // Start metrics updates
    startArtMetricsUpdates();
    
    // Start infinite mode with exponential growth
    startInfiniteMode();
    
    // Start MIDI recording
    startMidiRecording();
    
    // Enable fullscreen mode
    requestFullscreen();
    
    // Set timer for MIDI export after 5 minutes
    midiExportTimer = setTimeout(() => {
        if (artInstallationMode && midiRecording) {
            exportMidiRecording();
        }
    }, 5 * 60 * 1000); // 5 minutes
    
    console.log("Art installation mode started");
}

function stopArtInstallationMode() {
    artInstallationMode = false;
    artOverlayVisible = false;
    
    // Hide the overlay
    const artOverlay = document.getElementById('artOverlay');
    if (artOverlay) {
        artOverlay.classList.add('hidden');
    }
    
    // Update button state
    const artBtn = document.getElementById('artInstallationBtn');
    if (artBtn) {
        artBtn.classList.remove('active');
        artBtn.textContent = '🎨 Installation Art';
    }
    
    // Show control panel again
    const controlPanel = document.getElementById('controlPanel');
    if (controlPanel) {
        controlPanel.style.display = 'flex';
    }
    
    // Stop metrics updates
    if (artMetricsUpdateInterval) {
        clearInterval(artMetricsUpdateInterval);
        artMetricsUpdateInterval = null;
    }
    
    // Stop infinite mode
    stopInfiniteMode();
    
    // Stop MIDI recording and clear timer
    stopMidiRecording();
    if (midiExportTimer) {
        clearTimeout(midiExportTimer);
        midiExportTimer = null;
    }
    
    // Exit fullscreen
    if (document.fullscreenElement) {
        document.exitFullscreen();
    }
    
    console.log("Art installation mode stopped");
}

function startArtMetricsUpdates() {
    artMetricsUpdateInterval = setInterval(() => {
        if (!artInstallationMode) return;
        
        // Update computational load based on simulation speed and ant count
        const currentSpeed = mapSliderToSpeed(document.getElementById('simSpeedSlider')?.value || 50);
        const antCount = ants.length;
        computationalLoad = Math.floor(currentSpeed * antCount * (1 + Math.random() * 2));
        
        // Update systemic complexity based on rules and painted cells
        const paintedCells = getPaintedCellsCount();
        systemicComplexity = Math.floor(paintedCells / 1000) + Object.keys(rules).length + Math.floor(Math.random() * 5);
        
        // Update streaming data with random numbers
        dataStreamValue = Math.floor(Math.random() * 999999);
        
        // Update DOM elements
        updateArtOverlayMetrics();
        
        // Cycle philosophical quotes
        if (Math.random() < 0.1) { // 10% chance each update
            cyclePhilosophicalQuote();
        }
        
        // Trigger glitch effects randomly
        if (Math.random() < 0.05) { // 5% chance
            triggerGlitchEffect();
        }
        
    }, 500); // Update every 500ms
}

function updateArtOverlayMetrics() {
    const computationalLoadEl = document.getElementById('computationalLoad');
    const systemicComplexityEl = document.getElementById('systemicComplexity');
    const dataStreamEl = document.getElementById('dataStream');
    
    if (computationalLoadEl) {
        computationalLoadEl.textContent = computationalLoad.toLocaleString();
    }
    
    if (systemicComplexityEl) {
        systemicComplexityEl.textContent = systemicComplexity;
    }
    
    if (dataStreamEl) {
        dataStreamEl.textContent = dataStreamValue.toString().padStart(6, '0');
    }
    
    // Show performance warning when computational load is high
    const performanceWarning = document.getElementById('performanceWarning');
    if (performanceWarning) {
        if (computationalLoad > 50000) {
            performanceWarning.style.display = 'flex';
        } else {
            performanceWarning.style.display = 'none';
        }
    }
}

function cyclePhilosophicalQuote() {
    currentQuoteIndex = (currentQuoteIndex + 1) % philosophicalQuotes.length;
    const quoteEl = document.getElementById('philosophicalQuote');
    if (quoteEl) {
        quoteEl.textContent = philosophicalQuotes[currentQuoteIndex];
    }
}

function triggerGlitchEffect() {
    if (glitchEffectActive) return;
    
    glitchEffectActive = true;
    const canvas = document.getElementById('antCanvas');
    
    // Add glitch filter
    canvas.style.filter = 'hue-rotate(180deg) saturate(2) contrast(1.5)';
    
    setTimeout(() => {
        canvas.style.filter = 'none';
        glitchEffectActive = false;
    }, 100 + Math.random() * 200);
}

function getPaintedCellsCount() {
    if (!grid) return 0;
    
    let count = 0;
    for (let y = 0; y < gridRows; y++) {
        for (let x = 0; x < gridCols; x++) {
            if (grid[y][x] !== 0) {
                count++;
            }
        }
    }
    return count;
}

function requestFullscreen() {
    const element = document.documentElement;
    if (element.requestFullscreen) {
        element.requestFullscreen();
    } else if (element.mozRequestFullScreen) {
        element.mozRequestFullScreen();
    } else if (element.webkitRequestFullscreen) {
        element.webkitRequestFullscreen();
    } else if (element.msRequestFullscreen) {
        element.msRequestFullscreen();
    }
}

// --- MIDI Recording Functions ---
function startMidiRecording() {
    midiRecording = true;
    midiRecordingStartTime = performance.now();
    recordedMidiEvents = [];
    simulationStepCount = 0; // Reset simulation step counter
    
    // Show recording indicator
    const indicator = document.getElementById('midiRecordingIndicator');
    if (indicator) {
        indicator.classList.add('active');
    }
    
    // Start timer update
    updateRecordingTimer();
    
    console.log("MIDI recording started");
}

function stopMidiRecording() {
    midiRecording = false;
    
    // Hide recording indicator
    const indicator = document.getElementById('midiRecordingIndicator');
    if (indicator) {
        indicator.classList.remove('active');
    }
    
    console.log(`MIDI recording stopped. ${recordedMidiEvents.length} events recorded`);
}

function updateRecordingTimer() {
    if (!midiRecording) return;
    
    const elapsed = performance.now() - midiRecordingStartTime;
    const minutes = Math.floor(elapsed / 60000);
    const seconds = Math.floor((elapsed % 60000) / 1000);
    const timeString = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    
    // Update control panel timer
    const timerEl = document.getElementById('recordingTimer');
    if (timerEl) {
        timerEl.textContent = timeString;
    }
    
    // Update art overlay timer
    const artTimerEl = document.getElementById('artRecordingTimer');
    if (artTimerEl) {
        artTimerEl.textContent = timeString;
    }
    
    // Update event count in control panel
    const eventCountEl = document.getElementById('eventCount');
    if (eventCountEl) {
        eventCountEl.textContent = recordedMidiEvents.length;
    }
    
    // Update event count in art overlay
    const artEventCountEl = document.getElementById('artEventCount');
    if (artEventCountEl) {
        artEventCountEl.textContent = `${recordedMidiEvents.length} events`;
    }
    
    // Continue updating
    requestAnimationFrame(updateRecordingTimer);
}

function recordMidiEvent(noteData) {
    if (!midiRecording) return;
    
    // Use the timestamp directly - it's already relative to start of recording
    recordedMidiEvents.push({
        time: noteData.timestamp,
        note: noteData.note,
        velocity: noteData.velocity || midiVelocity,
        duration: noteData.duration,
        channel: noteData.channel || 0
    });
}

function exportMidiRecording() {
    if (recordedMidiEvents.length === 0) {
        console.log("No MIDI events to export");
        return;
    }
    
    console.log(`Exporting ${recordedMidiEvents.length} MIDI events...`);
    
    // Create MIDI file data
    const midiData = createMidiFile(recordedMidiEvents);
    
    // Create download link
    const blob = new Blob([midiData], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    
    // Generate filename with timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    a.download = `turmite-art-installation-${timestamp}.mid`;
    
    // Trigger download
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    console.log("MIDI file exported successfully");
}

function createMidiFile(events) {
    // Sort events by time
    events.sort((a, b) => a.time - b.time);
    
    
    // Use Format 0 (single track) for better compatibility with Ableton
    // Combine all events into a single track
    const header = new Uint8Array([
        0x4D, 0x54, 0x68, 0x64, // "MThd"
        0x00, 0x00, 0x00, 0x06, // Header length (6 bytes)
        0x00, 0x00, // Format 0 (single track)
        0x00, 0x01, // 1 track
        0x01, 0xE0  // 480 ticks per quarter note
    ]);
    
    // Build track data
    const trackData = [];
    let lastTime = 0;
    
    // Tempo event (120 BPM)
    trackData.push(...encodeVariableLength(0)); // Delta time 0
    trackData.push(0xFF, 0x51, 0x03); // Tempo meta event
    trackData.push(0x07, 0xA1, 0x20); // 500000 microseconds per quarter note (120 BPM)
    
    // Set up program changes for each channel used
    const usedChannels = new Set();
    events.forEach(event => usedChannels.add(event.channel % 16));
    
    usedChannels.forEach(channel => {
        trackData.push(...encodeVariableLength(0)); // Delta time 0
        trackData.push(0xC0 + channel); // Program Change
        trackData.push((channel * 8) % 128); // Different instrument per channel
    });
    
    // Create a combined list of all MIDI events (note on and note off)
    const allEvents = [];
    
    // Add all note on events
    events.forEach(event => {
        allEvents.push({
            time: event.time,
            type: 'noteOn',
            channel: event.channel % 16,
            note: event.note,
            velocity: event.velocity
        });
        
        // Calculate note off time
        allEvents.push({
            time: event.time + (event.duration * 1000), // Convert duration to ms
            type: 'noteOff',
            channel: event.channel % 16,
            note: event.note,
            velocity: 0
        });
    });
    
    // Sort all events by time
    allEvents.sort((a, b) => a.time - b.time);
    
    // Convert events to MIDI with proper delta times
    allEvents.forEach((event, index) => {
        // Convert ms to MIDI ticks: at 120 BPM with 480 ticks per quarter note
        // 1 beat = 500ms, 480 ticks = 500ms, so 1ms = 0.96 ticks
        const deltaTime = Math.max(0, Math.round((event.time - lastTime) * 0.96)); // Convert ms to ticks, ensure non-negative
        
        trackData.push(...encodeVariableLength(deltaTime));
        
        if (event.type === 'noteOn') {
            trackData.push(0x90 + event.channel); // Note On + channel
            trackData.push(event.note);
            trackData.push(event.velocity);
        } else {
            trackData.push(0x80 + event.channel); // Note Off + channel  
            trackData.push(event.note);
            trackData.push(event.velocity);
        }
        
        lastTime = event.time;
    });
    
    // End of track
    trackData.push(...encodeVariableLength(0));
    trackData.push(0xFF, 0x2F, 0x00);
    
    // Track header
    const trackHeader = new Uint8Array([
        0x4D, 0x54, 0x72, 0x6B, // "MTrk"
        (trackData.length >> 24) & 0xFF,
        (trackData.length >> 16) & 0xFF,
        (trackData.length >> 8) & 0xFF,
        trackData.length & 0xFF
    ]);
    
    // Combine all parts
    const midiFile = new Uint8Array(header.length + trackHeader.length + trackData.length);
    midiFile.set(header, 0);
    midiFile.set(trackHeader, header.length);
    midiFile.set(new Uint8Array(trackData), header.length + trackHeader.length);
    
    return midiFile;
}

function encodeVariableLength(value) {
    const bytes = [];
    
    do {
        let byte = value & 0x7F;
        value >>= 7;
        if (bytes.length > 0) {
            byte |= 0x80;
        }
        bytes.unshift(byte);
    } while (value > 0);
    
    return bytes.length > 0 ? bytes : [0];
}

function startInfiniteMode() {
    infiniteMode = true;
    performanceDegradationLevel = 0;
    
    // Start auto-scaling with exponential growth
    autoScalingInterval = setInterval(() => {
        if (!infiniteMode || !artInstallationMode) return;
        
        // Exponentially increase performance degradation
        performanceDegradationLevel += 1;
        exponentialGrowthFactor = Math.min(exponentialGrowthFactor * 1.001, 1.1); // Cap growth
        
        // Increase speed exponentially
        const currentSpeed = parseInt(document.getElementById('simSpeedSlider')?.value || 50);
        const newSpeed = Math.min(100, Math.floor(currentSpeed * exponentialGrowthFactor));
        
        const speedSlider = document.getElementById('simSpeedSlider');
        if (speedSlider && newSpeed > currentSpeed) {
            speedSlider.value = newSpeed;
            speedSlider.dispatchEvent(new Event('input'));
        }
        
        // Add more ants randomly to increase complexity
        if (Math.random() < 0.3 && ants.length < 50) {
            const antCountInput = document.getElementById('antCountInput');
            if (antCountInput) {
                const newCount = Math.min(50, ants.length + 1);
                antCountInput.value = newCount;
                // Trigger ant count update
                initSimulation();
            }
        }
        
        // Increase glitch frequency as system becomes overwhelmed
        if (performanceDegradationLevel > 50 && Math.random() < 0.2) {
            triggerGlitchEffect();
        }
        
        // Trigger critical system warnings
        if (performanceDegradationLevel > 100) {
            triggerCriticalOverload();
        }
        
    }, 2000); // Every 2 seconds
    
    console.log("Infinite mode started - exponential growth initiated");
}

function stopInfiniteMode() {
    infiniteMode = false;
    performanceDegradationLevel = 0;
    
    if (autoScalingInterval) {
        clearInterval(autoScalingInterval);
        autoScalingInterval = null;
    }
    
    // Reset growth factor
    exponentialGrowthFactor = 1.02;
    
    console.log("Infinite mode stopped");
}

function triggerCriticalOverload() {
    // Add intense visual effects to show system overload
    const canvas = document.getElementById('antCanvas');
    const artOverlay = document.getElementById('artOverlay');
    
    // Intense flashing effect
    let flashCount = 0;
    const flashInterval = setInterval(() => {
        if (flashCount >= 10) {
            clearInterval(flashInterval);
            return;
        }
        
        if (flashCount % 2 === 0) {
            canvas.style.filter = 'invert(1) hue-rotate(180deg) saturate(3)';
            if (artOverlay) artOverlay.style.background = 'rgba(255, 0, 0, 0.5)';
        } else {
            canvas.style.filter = 'none';
            if (artOverlay) artOverlay.style.background = 'rgba(0, 0, 0, 0.3)';
        }
        
        flashCount++;
    }, 100);
    
    // Update quotes to show system failure
    const criticalQuotes = [
        "SYSTÈME EN SURCHARGE CRITIQUE",
        "INTELLIGENCE ARTIFICIELLE HORS CONTRÔLE", 
        "DÉPASSEMENT TOTAL DES CAPACITÉS HUMAINES",
        "L'ALGORITHME A TRANSCENDÉ SON CRÉATEUR",
        "NOUS NE CONTRÔLONS PLUS RIEN..."
    ];
    
    const randomCriticalQuote = criticalQuotes[Math.floor(Math.random() * criticalQuotes.length)];
    const quoteEl = document.getElementById('philosophicalQuote');
    if (quoteEl) {
        quoteEl.textContent = randomCriticalQuote;
        quoteEl.style.color = '#ff0000';
        quoteEl.style.fontSize = '32px';
        quoteEl.style.fontWeight = 'bold';
    }
}

// --- Mapping Function ---
function mapSliderToSpeed(sliderValue) {
    const sliderMin = 1;
    const sliderMax = 100;
    const sliderMid = 50;

    if (sliderValue == sliderMid) {
        return midSimSpeed;
    } else if (sliderValue < sliderMid) {
        // Linear mapping for the lower half: [1, 50) -> [minSimSpeed, midSimSpeed)
        const speed = minSimSpeed + (sliderValue - sliderMin) * (midSimSpeed - minSimSpeed) / (sliderMid - sliderMin);
        return Math.max(minSimSpeed, speed);
    } else { // sliderValue > sliderMid
        // Exponential mapping for the upper half: (50, 100] -> (midSimSpeed, maxSimSpeed]
        const power = 3; // Adjust power for desired curve (e.g., 2, 3, 4)
        const normalizedInput = (sliderValue - sliderMid) / (sliderMax - sliderMid);
        const scaledOutput = Math.pow(normalizedInput, power);
        const speed = midSimSpeed + scaledOutput * (maxSimSpeed - midSimSpeed);
        return Math.min(maxSimSpeed, speed); // Clamp at max
    }
}

function resizeCanvas() {
    width = window.innerWidth;
    height = window.innerHeight;
    if (!canvas) return;
    canvas.width = width;
    canvas.height = height;

    // Recalculate offset to re-center the *logical origin (0,0)* 
    // This keeps the view centered relative to where it was, approximately.
    // If specific centering on grid is needed, more complex logic involving gridCols/Rows
    // might be required, but let's keep it simple for now.
    // offsetX = width / 2 - ... (removed complex centering)
    // offsetY = height / 2 - ...
    // Simply adjusting canvas size usually doesn't require recentering if panning/zooming is used.
    // We *do* need to trigger a full redraw.

    setCanvasSmoothing(false);
    needsFullRedraw = true; // Flag for full redraw

    // Request a draw. If running, renderLoop will handle it.
    // If paused, this ensures the resized view is drawn.
    if (!renderRequestId && !isRunning) {
        requestAnimationFrame(draw);
    }
}

function setCanvasSmoothing(enabled) {
     if (!ctx) return; // Add check for context existence
     ctx.imageSmoothingEnabled = enabled;
     ctx.mozImageSmoothingEnabled = enabled;
     ctx.webkitImageSmoothingEnabled = enabled;
     ctx.msImageSmoothingEnabled = enabled;
}

function initGrid() {
    // Calculate grid size based on current viewport and CURRENT scale
    gridCols = Math.ceil(width / scale); // Use current scale
    gridRows = Math.ceil(height / scale); // Use current scale

    if (gridCols <= 0 || gridRows <= 0) { 
        console.warn("Cannot init grid with zero/negative dimensions, possibly invalid scale?", {width, height, scale});
        gridCols = 1; gridRows = 1; // Set minimum size to prevent errors down the line
    }
    const defaultColorIndex = 0;
    grid = Array(gridRows).fill(null).map(() => Array(gridCols).fill(defaultColorIndex));
    const totalCells = gridCols * gridRows;
    console.log(`Initialized grid: ${gridCols}x${gridRows} = ${totalCells.toLocaleString()} cells with color ${defaultColorIndex} (${cellColors[defaultColorIndex]}) using scale ${scale}`);
    
    // Update grid info display
    const gridInfoElement = document.getElementById('gridInfo');
    if (gridInfoElement) {
        gridInfoElement.textContent = `Grid: ${gridCols}×${gridRows} = ${totalCells.toLocaleString()} cells`;
    }
}

// --- Helper Functions ---

// Helper function to update visibility and state of Individual Rules controls
function updateIndividualRulesVisibility(antCount, rulesDisplayContainer, individualRulesContainer, individualRulesCheck, rulesDisplayPre) {
    const showIndividualOption = antCount > 1;

    // 1. Show/Hide the individual rules checkbox container
    if (individualRulesContainer) {
        individualRulesContainer.classList.toggle('hidden', !showIndividualOption);
    }

    // 2. Enable/Disable and Uncheck the checkbox if ant count is 1
    let isIndividualChecked = false;
    if (individualRulesCheck) {
        individualRulesCheck.disabled = !showIndividualOption;
        if (!showIndividualOption && individualRulesCheck.checked) {
            individualRulesCheck.checked = false;
            // If disabling the checkbox makes it unchecked, enable Apply button
            const applyBtn = document.getElementById('applyBtn');
             if (applyBtn) applyBtn.disabled = false; 
        }
        // Read the *final* state of the checkbox AFTER potential unchecking
        isIndividualChecked = individualRulesCheck.checked;
    }

    // 3. Show/Hide the entire rule section container based ONLY on checkbox state
    if (rulesDisplayContainer) {
        rulesDisplayContainer.classList.toggle('hidden', isIndividualChecked);
    }

    // 4. If the container is hidden (Individual Rules is ON),
    //    ensure the rule editor <pre> tag is also hidden.
    //    Otherwise, leave the <pre> tag's visibility alone (respect manual toggle).
    if (rulesDisplayPre && isIndividualChecked) {
        rulesDisplayPre.classList.add('hidden');
    }
    // NO 'else' block here - do not force visibility if container is shown.

    // Note: Apply button state related to rule text changes is handled by its own listener.
    // Apply button state related to ant count changes is handled by its listener.
}

function initAnts(preservedIndividualRules = null) {
    ants = [];
    cellsToUpdate.clear();
    if (gridCols <= 0 || gridRows <= 0) { return; }

    // Get controls needed for ant setup
    const antCountInput = document.getElementById('antCountInput');
    const startPositionSelect = document.getElementById('startPositionSelect');
    const startDirectionSelect = document.getElementById('startDirectionSelect'); // Get direction select
    const individualRulesCheck = document.getElementById('individualRulesCheck');
    const rulesDisplayPre = document.getElementById('rulesDisplay'); // Get the pre tag itself
    const saveRuleBtn = document.getElementById('saveRuleBtn'); // Get save button
    const loadRuleBtn = document.getElementById('loadRuleBtn'); // Get load button
    const presetSelect = document.getElementById('presetSelect'); // Get preset select
    const toggleRandomizeOptionsBtn = document.getElementById('toggleRandomizeOptionsBtn'); // New
    const randomizeOptionsContent = document.getElementById('randomizeOptionsContent'); // New
    const moveRelativeCheck = document.getElementById('moveRelativeCheck'); // New
    const moveAbsoluteCheck = document.getElementById('moveAbsoluteCheck'); // New
    const moveRandomCheck = document.getElementById('moveRandomCheck'); // New

    const startMode = startPositionSelect ? startPositionSelect.value : 'center';
    const startDirMode = startDirectionSelect ? startDirectionSelect.value : '0'; // Read direction mode
    const numAntsToCreate = antCountInput ? parseInt(antCountInput.value, 10) : 1;
    const validatedAntCount = Math.max(1, Math.min(1024, numAntsToCreate || 1));
    const useIndividualRules = individualRulesCheck ? individualRulesCheck.checked && validatedAntCount > 1 : false;

    // Read max states/colors for potential individual rule generation
    const possibleStatesInput = document.getElementById('possibleStatesInput');
    const possibleColorsInput = document.getElementById('possibleColorsInput');
    const maxStates = possibleStatesInput ? parseInt(possibleStatesInput.value, 10) : 2;
    const maxColors = possibleColorsInput ? parseInt(possibleColorsInput.value, 10) : 2;
    const validatedMaxStates = Math.max(1, Math.min(100, maxStates || 1));
    const validatedMaxColors = Math.max(2, Math.min(maxPossibleColors, maxColors || 2));

    const centerX = Math.floor(gridCols / 2);
    const centerY = Math.floor(gridRows / 2);
    const occupied = new Set(); // To track occupied spots for random/grid modes

    console.log(`Initializing ${validatedAntCount} ants. Mode: ${startMode}, Dir: ${startDirMode}, Indiv Rules: ${useIndividualRules}, Preserved Rules: ${preservedIndividualRules ? preservedIndividualRules.length : 'None'}`);

    for (let i = 0; i < validatedAntCount; i++) {
        let gridX, gridY;
        let attempts = 0;
        const MAX_ATTEMPTS = 2000;
        switch (startMode) {
            case 'random':
                do {
                    gridX = Math.floor(Math.random() * gridCols);
                    gridY = Math.floor(Math.random() * gridRows);
                    attempts++;
                } while (occupied.has(`${gridX},${gridY}`) && attempts < MAX_ATTEMPTS);
                if (attempts >= MAX_ATTEMPTS) {
                    console.warn("Could not find random unoccupied spot, placing potentially overlapping.");
                    // Fallback: place it anyway or skip?
                }
                break;

            case 'grid':
                // Basic grid logic: try to make it square-ish
                const gridRatio = gridCols / gridRows;
                let cols = Math.ceil(Math.sqrt(validatedAntCount * gridRatio));
                let rows = Math.ceil(validatedAntCount / cols);
                // Adjust cols/rows to ensure they fit within grid dimensions if needed
                cols = Math.min(cols, gridCols);
                rows = Math.min(rows, gridRows);
                // Recalculate if adjustment makes it too small
                if (cols * rows < validatedAntCount) {
                    rows = Math.ceil(validatedAntCount / cols);
                    if (cols * rows < validatedAntCount) { // If still too small, adjust cols
                         cols = Math.ceil(validatedAntCount / rows);
                    }
                }

                const spacingX = gridCols / (cols + 1);
                const spacingY = gridRows / (rows + 1);

                const colIndex = i % cols;
                const rowIndex = Math.floor(i / cols);

                gridX = Math.floor(spacingX * (colIndex + 1));
                gridY = Math.floor(spacingY * (rowIndex + 1));

                // Ensure it's within bounds (spacing calculation might push edge cases)
                gridX = Math.max(0, Math.min(gridCols - 1, gridX));
                gridY = Math.max(0, Math.min(gridRows - 1, gridY));

                // Check for overlap (unlikely with this grid logic, but possible)
                let originalGridX = gridX;
                let originalGridY = gridY;
                while(occupied.has(`${gridX},${gridY}`) && attempts < 100) {
                    gridX = (originalGridX + attempts) % gridCols;
                    gridY = originalGridY; // Simple fallback
                    attempts++;
                }
                break;

            case 'row':
                // Calculate width of the first row
                const rowWidth = Math.min(validatedAntCount, gridCols);
                // Calculate number of rows needed
                const numRows = Math.ceil(validatedAntCount / gridCols);

                // Calculate starting position for the top-left of the block
                const startX = Math.floor(centerX - rowWidth / 2);
                const startY = Math.floor(centerY - numRows / 2);

                const colOffset = i % gridCols; // Column within the current row
                const rowOffset = Math.floor(i / gridCols); // Which row we are on

                gridX = startX + colOffset;
                gridY = startY + rowOffset;

                // Check for overlap (extremely unlikely but possible if grid is tiny)
                if (occupied.has(`${gridX},${gridY}`)) {
                    console.warn(`Row placement overlap detected at ${gridX},${gridY}. Placing anyway.`);
                }
                break;

            case 'center': // Default / Fallback
            default:
                const clusterSize = Math.ceil(Math.sqrt(validatedAntCount));
                const offset = Math.floor(clusterSize / 2);
                gridX = centerX - offset + (i % clusterSize);
                gridY = centerY - offset + Math.floor(i / clusterSize);
                // Ensure within bounds, although less likely needed for center
                gridX = Math.max(0, Math.min(gridCols - 1, gridX));
                gridY = Math.max(0, Math.min(gridRows - 1, gridY));
                break;
        }

        // Ensure within bounds AFTER calculating specific position
        gridX = Math.max(0, Math.min(gridCols - 1, gridX || 0)); // Use || 0 as fallback if undefined
        gridY = Math.max(0, Math.min(gridRows - 1, gridY || 0));

        occupied.add(`${gridX},${gridY}`); // Mark as occupied

        let individualRule = null;
        // Check if using individual rules
        if (useIndividualRules) {
            // Prioritize using preserved rules if available for this index
            if (preservedIndividualRules && i < preservedIndividualRules.length && preservedIndividualRules[i]) {
                individualRule = preservedIndividualRules[i];
                // console.log(`Ant ${i}: Using preserved rule.`); // Optional log
            } else {
                // Otherwise, generate new random rules for this ant
                // console.log(`Ant ${i}: No preserved rule found or index out of bounds, generating new rule.`); // Optional log
                const antStates = Math.floor(Math.random() * validatedMaxStates) + 1;
                const antColors = Math.floor(Math.random() * (validatedMaxColors - 1)) + 2;
                individualRule = generateRandomRulesForAnt(antStates, antColors);
            }
        }
        // If not using individual rules, individualRule remains null, and the ant will use global rules

        // Determine initial direction
        let initialDir = 0; // Default North/Up
        if (startDirMode === 'random') {
            initialDir = Math.floor(Math.random() * 4);
        } else {
            const dirValue = parseInt(startDirMode, 10);
            if (!isNaN(dirValue) && dirValue >= 0 && dirValue < 4) {
                initialDir = dirValue;
            }
        }

        const newAnt = {
            x: gridX, y: gridY,
            dir: initialDir,
            state: 0,
            individualRule: individualRule // Assign preserved or newly generated rule
        };
        ants.push(newAnt);
        cellsToUpdate.add(`${gridX},${gridY}`);
    }
}

function resetCamera() {
    console.log("Resetting camera view to center initial grid...");
    scale = initialScale; // Reset scale

    // Calculate hypothetical grid dimensions based on initial scale
    const tempGridCols = Math.ceil(width / scale); 
    const tempGridRows = Math.ceil(height / scale);

    // Calculate the center of this hypothetical grid (in logical coordinates)
    const tempGridCenterX = tempGridCols / 2 * cellSize;
    const tempGridCenterY = tempGridRows / 2 * cellSize;

    // Calculate offset needed to place the grid center (scaled) at the viewport center
    offsetX = width / 2 - tempGridCenterX * scale;
    offsetY = height / 2 - tempGridCenterY * scale;

    console.log(`Reset Camera: Scale=${scale}, OffsetX=${offsetX.toFixed(1)}, OffsetY=${offsetY.toFixed(1)} based on grid ${tempGridCols}x${tempGridRows}`);

    setCanvasSmoothing(false);
    cellsToUpdate.clear();
    needsFullRedraw = true; // Trigger full redraw
    // No draw call needed here, render loop will pick it up
}

function initSimulation(randomize = false, numStates = 1, numColorsToUse = 2, wasRunning = true) {
    console.log(`initSimulation called. Randomize: ${randomize}, States: ${numStates}, Colors: ${numColorsToUse}, WasRunning: ${wasRunning}`);
    // Stop loops regardless of previous state to ensure clean reset
    stopSimulationLoop();
    stopRenderLoop();

    const individualRulesCheck = document.getElementById('individualRulesCheck');
    const useIndividual = individualRulesCheck ? individualRulesCheck.checked : false;
    const antCountInput = document.getElementById('antCountInput');
    const antCount = antCountInput ? parseInt(antCountInput.value, 10) : 1;

    // --- Preserve individual rules if resetting without randomizing ---
    let preservedIndividualRules = null;
    if (!randomize && useIndividual && antCount > 0 && ants.length > 0) {
        preservedIndividualRules = ants.map(ant => ant?.individualRule).filter(rule => rule); // Get existing rules
        console.log(`Preserving ${preservedIndividualRules.length} individual rules.`);
    }
    // --- End preservation ---

    if (randomize) {
        // Generate new global rules, even if individual is checked (provides a base)
        generateRandomRules(numStates, numColorsToUse);
    }
    // Load default global rules if none exist
    else if (Object.keys(rules).length === 0) {
        console.log("Generating default Langton's Ant rules (2 colors, 1 state).");
        numStates = 1; // Override defaults for Langton's
        numColorsToUse = 2;
        rules = {
             0: [
                 { writeColor: 1, move: 'R', nextState: 0 },
                 { writeColor: 0, move: 'L', nextState: 0 }
             ]
         };
     }

    // Reset dimensions, grid, ants
    width = window.innerWidth; height = window.innerHeight;
    if (!canvas) { console.error("Canvas missing!"); return; }
    canvas.width = width; canvas.height = height;

    // --- Grid Reset Logic --- 
    const originalScale = scale; // Store user's current scale
    scale = initialScale; // Temporarily set to initial scale for grid creation
    console.log(`Temporarily setting scale to ${initialScale} for grid init.`);
    initGrid(); // Uses the temporary initialScale
    // Pass preserved rules to initAnts
    initAnts(preservedIndividualRules); // Ants are placed relative to this initial grid
    scale = originalScale; // Restore user's original scale immediately after
    console.log(`Restored scale to ${scale}.`);
    // The current offsetX/offsetY are preserved, user's view doesn't jump.

    // Setup Controls & Display Rules
    const simSpeedSlider = document.getElementById('simSpeedSlider');
    const simSpeedValueSpan = document.getElementById('simSpeedValue');
    const rulesDisplay = document.getElementById('rulesDisplay');
    const applyBtn = document.getElementById('applyBtn');

    if (!simSpeedSlider || !simSpeedValueSpan || !rulesDisplay || !applyBtn) { return; }
    const initialSliderValue = parseInt(simSpeedSlider.value, 10);
    const initialSimSpeed = mapSliderToSpeed(initialSliderValue);
    simSpeedSlider.value = initialSliderValue;
    simSpeedValueSpan.textContent = Math.round(initialSimSpeed);

    // Calculate metadata *just before* use
    const numStatesInRules = Object.keys(rules).length;
    const numColorsInRules = rules[0] ? rules[0].length : 0;

    // Prepare rules display string with simplified metadata comments
    let rulesString = `// States: ${numStatesInRules}\n`;
    rulesString += `// Colors: ${numColorsInRules}\n`; // Just the count
    rulesString += `// Moves: L:Left, R:Right, U:U-Turn, N:No Turn (forward), S:Stay, ^>v<:Absolute Dirs, ?:Random\n\n`;
    try { rulesString += JSON.stringify(rules, null, 2); } catch (e) { rulesString = "Error stringifying rules.";}
    if (rulesDisplay) rulesDisplay.textContent = rulesString;
    
    // --- Ensure Apply and Discard buttons are disabled after any init ---
    if (applyBtn) applyBtn.disabled = true;
    const discardBtn = document.getElementById('discardBtn');
    if (discardBtn) discardBtn.disabled = true;

    setCanvasSmoothing(false);
    cellsToUpdate.clear();
    needsFullRedraw = true; // Trigger full redraw for initial state

    // Explicitly draw the initial full grid state
    // No clear needed here as drawGrid draws all cells
    drawGrid(); // This draws all cells, covering previous state

    isRunning = wasRunning;
    updateButtonText();
    pauseTime = 0;

    if (individualRulesCheck) {
        individualRulesCheck.disabled = (antCount <= 1);
        // If count becomes 1, uncheck and show main rules
        if (antCount <= 1 && individualRulesCheck.checked) {
            individualRulesCheck.checked = false;
        }
    }

    if (isRunning) {
        startSimulationLoop(); // Schedules steps
        startRenderLoop();     // Schedules calls to draw() -> drawUpdates
    } 
    // else: Paused state handled, initial draw already done.

    // --- Store the successfully applied state for potential discard --- 
    console.log("Storing current state as last applied state.");
    const currentAntCount = antCountInput ? antCountInput.value : '1';
    const currentStartPosition = startPositionSelect ? startPositionSelect.value : 'center';
    const currentStartDirection = startDirectionSelect ? startDirectionSelect.value : '0';
    const currentMaxStates = possibleStatesInput ? possibleStatesInput.value : '2';
    const currentMaxColors = possibleColorsInput ? possibleColorsInput.value : '2';
    const currentIndividualChecked = individualRulesCheck ? individualRulesCheck.checked : false;
    const currentRulesText = rulesDisplay ? rulesDisplay.textContent : '';

    lastAppliedState = {
        antCount: currentAntCount,
        startPosition: currentStartPosition,
        startDirection: currentStartDirection,
        maxStates: currentMaxStates,
        maxColors: currentMaxColors,
        individualChecked: currentIndividualChecked,
        rulesText: currentRulesText // Store the raw text content
    };
    // console.log("Stored State:", lastAppliedState); // Optional: Debug log
}

function startSimulation() {
    stopSimulation(); // Clear any existing timers/loops first
    if (currentIntervalId || timeoutId) { console.warn("startSimulation called while already running?"); return; }

    console.log("startSimulation called. Setting up timer/loop...");
    isRunning = true;
    updateButtonText();

    const fpsSlider = document.getElementById('fpsSlider');
    const stepsSlider = document.getElementById('stepsSlider');
    const targetFPS = fpsSlider ? parseInt(fpsSlider.value, 10) : 60;
    currentStepsPerTick = stepsSlider ? parseInt(stepsSlider.value, 10) : 1;
    currentStepsPerTick = Math.max(1, currentStepsPerTick);

    if (targetFPS >= 240) { // Check against new max value
        // Max Speed Mode: Use setTimeout loop
        currentIntervalDelay = 0; // Indicate no fixed interval
        console.log(`Starting MAX Speed Mode (setTimeout): Steps/Tick=${currentStepsPerTick}`);
        runMaxSpeedLoop(); // Start the loop
    } else if (targetFPS >= 1) {
        // Normal Mode: Calculate delay from FPS
        currentIntervalDelay = Math.round(1000 / targetFPS);
        console.log(`Starting Normal Mode: Target FPS=${targetFPS}, Interval=${currentIntervalDelay}ms, Steps/Tick=${currentStepsPerTick}`);
        currentIntervalId = setInterval(runSimulationTick, currentIntervalDelay);
        console.log(` -> intervalId set: ${currentIntervalId}`);
    } else {
        // Fallback
        currentIntervalDelay = 1000; // 1 FPS
        console.warn(`Invalid Target FPS (${targetFPS}), defaulting to 1 FPS.`);
        currentIntervalId = setInterval(runSimulationTick, currentIntervalDelay);
        console.log(` -> intervalId set (fallback): ${currentIntervalId}`);
    }
}

function stopSimulation() {
    if (currentIntervalId) {
        console.log(`Clearing intervalId: ${currentIntervalId}`);
        clearInterval(currentIntervalId);
        currentIntervalId = null;
    }
    if (timeoutId) {
        console.log(`Clearing timeoutId: ${timeoutId}`);
        clearTimeout(timeoutId);
        timeoutId = null;
    }
    console.log("Simulation timer/loop stopped.");
}

function updateButtonText() {
    const btn = document.getElementById('startStopBtn');
    // Use literal symbols for Play (▶ U+25B6) and Pause (❚❚)
    if (btn) btn.innerHTML = isRunning ? '❚❚' : '▶';
}

// Renamed and parameterized
function stepSingleAntLogic(ant, antIndex = 0) {
    if (!grid || !ant) return; // Check individual ant
    if (ant.state === -1) return; // HALT state: do nothing further
    if (gridCols <= 0 || gridRows <= 0) return;

    ant.x = (ant.x + gridCols) % gridCols;
    ant.y = (ant.y + gridRows) % gridRows;

    if (!grid[ant.y] || ant.y < 0 || ant.y >= grid.length || ant.x < 0 || ant.x >= grid[ant.y].length) {
         console.error("Ant out of bounds after wrap:", ant);
         // Optionally reset the specific ant instead of returning?
         // ant.x = Math.floor(gridCols / 2);
         // ant.y = Math.floor(gridRows / 2);
         return;
     }

    const currentCellX = ant.x;
    const currentCellY = ant.y;
    const currentCellColor = grid[currentCellY][currentCellX];
    const currentState = ant.state;

    const ruleSetToUse = ant.individualRule || rules;
    let rule;
    try { 
        if (ruleSetToUse[currentState] && ruleSetToUse[currentState][currentCellColor]) {
             rule = ruleSetToUse[currentState][currentCellColor];
        } else { 
             if (ruleSetToUse[currentState] && ruleSetToUse[currentState][0]) {
                 rule = ruleSetToUse[currentState][0];
             } else {
                rule = { writeColor: currentCellColor, move: 'N', nextState: 0 };
             }
        }
    } catch (e) { 
        console.error("Error in stepSingleAntLogic:", e);
        return; 
    }
    
    // --- Record change only if color is different ---
    if (rule.writeColor !== currentCellColor) {
        grid[currentCellY][currentCellX] = rule.writeColor;
        cellsToUpdate.add(`${currentCellX},${currentCellY}`); 
    } 

    let dx = 0, dy = 0;
    // --- Determine Direction Change --- 
    switch (rule.move) { // Use rule.move directly again
        // Relative moves
        case 'R': ant.dir = (ant.dir + 1) % 4; break;
        case 'L': ant.dir = (ant.dir - 1 + 4) % 4; break;
        case 'U': ant.dir = (ant.dir + 2) % 4; break;
        case 'S': break; // Stay - no direction change
        case 'N': break; // None - no direction change
        // Absolute moves
        case '^': ant.dir = 0; break; // North
        case '>': ant.dir = 1; break; // East
        case 'v': ant.dir = 2; break; // South
        case '<': ant.dir = 3; break; // West
        case '?': // Random absolute direction
            ant.dir = Math.floor(Math.random() * 4);
            break;
        default: break; // Treat any other unknown character like 'N'
    }
    // --- Determine Movement Delta (only if not 'S') ---
    if (rule.move !== 'S') { // Use rule.move directly again
        const moveOffset = directions[ant.dir];
        if (moveOffset) { 
            dx = moveOffset.dx;
            dy = moveOffset.dy;
        } else {
             console.error(`Invalid ant direction: ${ant.dir}`);
        }
    }
    // Update state
    ant.state = rule.nextState;
    // Apply movement
    ant.x += dx;
    ant.y += dy;
    
    // --- Musical Generation ---
    if (audioEnabled && audioContext) {
        const now = performance.now();
        const antLastTime = ant.lastAudioTime || 0;
        
        // Throttle audio generation per ant to prevent performance issues
        if (now - antLastTime >= audioThrottleMs) {
            // Generate note based on new position
            const frequency = gridToFrequency(ant.x, ant.y, gridCols, gridRows);
            const duration = gridToRhythm(ant.y, gridRows);
            const volume = colorToVolume(rule.writeColor) * audioVolume;
            
            // Add slight delay based on ant index to avoid all notes playing simultaneously
            const delay = antIndex * 0.02;
            setTimeout(() => {
                playNote(frequency, duration, volume, antIndex);
            }, delay * 1000); // Convert to milliseconds
            
            ant.lastAudioTime = now;
            
            // Store musical event for visualization
            if (!ant.musicalEvents) ant.musicalEvents = [];
            ant.musicalEvents.push({
                frequency,
                duration,
                volume,
                timestamp: now,
                x: ant.x,
                y: ant.y,
                color: rule.writeColor
            });
            
            // Keep only recent events for visualization
            if (ant.musicalEvents.length > 10) {
                ant.musicalEvents.shift();
            }
            
            // --- MIDI Output ---
            if (midiEnabled && selectedMidiOutput) {
                const midiNote = frequencyToMidiNote(frequency);
                const velocity = Math.round(volume * midiVelocity); // Scale by global velocity
                
                // Send MIDI note on
                sendMIDINoteOn(midiNote, velocity, midiChannel, antIndex);
                
                // Record MIDI event for export (with accurate timing)
                if (midiRecording) {
                    // Use current time relative to recording start for consistency
                    const timestamp = performance.now() - midiRecordingStartTime;
                    
                    recordMidiEvent({
                        note: midiNote,
                        velocity: velocity,
                        duration: duration,
                        channel: midiProgramPerAnt ? (midiChannel + antIndex) % 16 : midiChannel,
                        timestamp: timestamp
                    });
                }
                
                // Schedule note off based on duration
                setTimeout(() => {
                    sendMIDINoteOff(midiNote, midiChannel, antIndex);
                }, duration * 1000); // Convert to milliseconds
            }
        }
    }
}

// Called by setInterval in Normal Mode
function runSimulationTick() {
    if (!isRunning) {
         if (currentIntervalId) clearInterval(currentIntervalId);
         currentIntervalId = null;
         return;
     }
    // Step ALL ants for the specified number of steps
    for (let step = 0; step < currentStepsPerTick; step++) {
        for (let i = 0; i < ants.length; i++) {
            stepSingleAntLogic(ants[i], i);
        }
    }
    requestAnimationFrame(draw); // Use rAF for drawing
}

// Called recursively by setTimeout in Max Speed Mode
function runMaxSpeedLoop() {
    if (!isRunning) {
        timeoutId = null; // Ensure ID is cleared if stopped
        console.log("Max speed loop detected isRunning=false, stopping.");
        return; // Stop the loop
    }

    // Run the batch of steps - step ALL ants for each tick
    for (let step = 0; step < currentStepsPerTick; step++) {
        for (let i = 0; i < ants.length; i++) {
            stepSingleAntLogic(ants[i], i);
        }
    }

    // Draw the result of the batch
    // Using requestAnimationFrame here ensures drawing happens smoothly,
    // but the *next* simulation batch starts via setTimeout immediately after this call.
    requestAnimationFrame(draw);

    // Schedule the next batch immediately
    timeoutId = setTimeout(runMaxSpeedLoop, 0);
}

// --- Drawing ---
// ... (drawGrid cell drawing loop)

// Helper to draw ant shape
function drawAntShape(ant, antIndex = 0) {
     // Check if ant is within logical grid bounds
     if (ant.x < 0 || ant.x >= gridCols || ant.y < 0 || ant.y >= gridRows) return;

     // Calculate pixel positions
     const cellSize = 1;
     const antCenterX = offsetX + (ant.x + 0.5) * cellSize * scale;
     const antCenterY = offsetY + (ant.y + 0.5) * cellSize * scale;
     const antSize = (cellSize * scale) * 0.8; 
     const antRadius = antSize / 2.5; 

     // Visibility check
     if (!(antCenterX + antSize > 0 && antCenterX - antSize < width &&
           antCenterY + antSize > 0 && antCenterY - antSize < height)) {
         return;
     }

     // Base ant color
     ctx.fillStyle = 'red';
     ctx.beginPath();
     ctx.arc(antCenterX, antCenterY, antRadius, 0, 2 * Math.PI);
     ctx.fill();
     
     // Add musical activity visualization
     if (audioEnabled && ant.musicalEvents) {
         const now = performance.now();
         const recentEvents = ant.musicalEvents.filter(event => 
             (now - event.timestamp) < 500 // Show events from last 500ms
         );
         
         if (recentEvents.length > 0) {
             const latestEvent = recentEvents[recentEvents.length - 1];
             const age = now - latestEvent.timestamp;
             const alpha = Math.max(0, 1 - (age / 500)); // Fade over 500ms
             
             // Draw musical ripple effect
             const rippleRadius = antRadius + (age / 500) * antRadius * 2;
             ctx.strokeStyle = `rgba(255, 255, 100, ${alpha * 0.7})`;
             ctx.lineWidth = 2;
             ctx.beginPath();
             ctx.arc(antCenterX, antCenterY, rippleRadius, 0, 2 * Math.PI);
             ctx.stroke();
             
             // Draw frequency indicator (height based)
             const freqNormalized = Math.log(latestEvent.frequency / 100) / Math.log(10); // Log scale
             const barHeight = Math.max(2, freqNormalized * antRadius);
             ctx.fillStyle = `rgba(100, 255, 100, ${alpha})`;
             ctx.fillRect(
                 antCenterX - 1, 
                 antCenterY - barHeight/2, 
                 2, 
                 barHeight
             );
         }
     }
 }

function drawGrid() {
    if (!grid || !grid.length || !grid[0].length || !ctx) return;
    // Remove save/transform/restore - calculate pixels directly
    // ctx.save();
    // ctx.translate(offsetX, offsetY);
    // ctx.scale(scale, scale);
    setCanvasSmoothing(false); // Still important

    if (gridCols <= 0 || gridRows <= 0) { return; }

    // Calculate visible grid bounds (in grid cell coordinates - still useful)
    const viewX1 = -offsetX / scale, viewY1 = -offsetY / scale;
    const viewX2 = (width - offsetX) / scale, viewY2 = (height - offsetY) / scale;
    const cellSize = 1;
    // Add a small buffer to catch cells partially visible at edges
    const buffer = 2;
    const startCol = Math.max(0, Math.floor(viewX1 / cellSize) - buffer);
    const endCol = Math.min(gridCols, Math.ceil(viewX2 / cellSize) + buffer);
    const startRow = Math.max(0, Math.floor(viewY1 / cellSize) - buffer);
    const endRow = Math.min(gridRows, Math.ceil(viewY2 / cellSize) + buffer);

    // Draw ALL cells using calculated pixel coordinates
    for (let y = startRow; y < endRow; y++) {
        if (y < 0 || y >= grid.length || !grid[y]) continue;
        for (let x = startCol; x < endCol; x++) {
             if (x < 0 || x >= grid[y].length) continue;

            const colorIndex = grid[y][x];
            // Draw ALL valid color indices (including 0)
            if (colorIndex >= 0 && colorIndex < cellColors.length) {
                 ctx.fillStyle = cellColors[colorIndex];

                 // Calculate final pixel coordinates and dimensions
                 const px = Math.floor(offsetX + x * cellSize * scale);
                 const py = Math.floor(offsetY + y * cellSize * scale);
                 const pw = Math.ceil(cellSize * scale);
                 const ph = Math.ceil(cellSize * scale);

                 if (px + pw > 0 && px < width && py + ph > 0 && py < height) {
                    ctx.fillRect(px, py, pw, ph);
                 }
            } // else { console.warn(`Invalid color index at ${x},${y}: ${colorIndex}`); } // Optional: Warn on invalid index
        }
    }

    // --- Draw Ants (Enable Smoothing) --- 
    setCanvasSmoothing(true); // Enable AA for shapes
    for (let i = 0; i < ants.length; i++) {
        if (ants[i]) drawAntShape(ants[i], i); // Call with ant index
    }
    setCanvasSmoothing(false); // Disable AA immediately after
    // ctx.restore(); // No restore needed
}

// Function to draw updates efficiently
function drawUpdates() {
    if (!ctx) return;
    setCanvasSmoothing(false);
    const cellSize = 1;

    // --- Draw all cells marked for update --- 
    cellsToUpdate.forEach(coordString => {
        const [xStr, yStr] = coordString.split(',');
        const x = parseInt(xStr, 10);
        const y = parseInt(yStr, 10);

        // Ensure coordinate is valid and on grid before drawing
        if (isNaN(x) || isNaN(y) || y < 0 || y >= grid.length || x < 0 || x >= grid[y].length) return;

        const colorIndex = grid[y][x]; // Get the CURRENT color of the cell
        if (colorIndex >= 0 && colorIndex < cellColors.length) {
             ctx.fillStyle = cellColors[colorIndex];
             const px = Math.floor(offsetX + x * cellSize * scale);
             const py = Math.floor(offsetY + y * cellSize * scale);
             const pw = Math.ceil(cellSize * scale);
             const ph = Math.ceil(cellSize * scale);
             if (px + pw > 0 && px < width && py + ph > 0 && py < height) {
                 ctx.fillRect(px, py, pw, ph);
             }
        }
    });

    // --- 3. Draw Ants in their NEW positions (Enable Smoothing) --- 
    setCanvasSmoothing(true); // Enable AA for shapes
    for (let i = 0; i < ants.length; i++) {
        if (ants[i]) drawAntShape(ants[i], i); // Call with ant index
    }
    setCanvasSmoothing(false);

    // --- 4. Clear the update set for the next frame --- 
    cellsToUpdate.clear();
}

// Main draw function: NO clearing, just call drawUpdates
function draw() {
    if (!ctx) return;

    if (needsFullRedraw) {
        // console.log("Performing full redraw"); // Optional debug log
        // Clear background (important for full redraw)
        ctx.fillStyle = '#555555'; 
        ctx.fillRect(0, 0, width, height);
        drawGrid(); // Draw the entire grid
        needsFullRedraw = false; // Reset flag after drawing
    } else {
        // console.log("Performing partial update"); // Optional debug log
        drawUpdates(); // Draw only changes
    }
}

function handleZoom(event) {
    event.preventDefault();

    const rect = canvas.getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;

    // Convert mouse screen coords to world coords (logical grid coords)
    const worldX = (mouseX - offsetX) / scale;
    const worldY = (mouseY - offsetY) / scale;

    let newScale;
    if (event.deltaY < 0) {
        // Zoom in
        newScale = Math.min(maxScale, scale * zoomFactor);
    } else {
        // Zoom out
        newScale = Math.max(minScale, scale / zoomFactor);
    }

    // Adjust offset to keep the world point under the mouse stationary
    offsetX = mouseX - worldX * newScale;
    offsetY = mouseY - worldY * newScale;
    scale = newScale;

    setCanvasSmoothing(false);
    needsFullRedraw = true; // View changed, need full redraw
    
    // Update grid info display with new scale
    const newGridCols = Math.ceil(width / scale);
    const newGridRows = Math.ceil(height / scale);
    const newTotalCells = newGridCols * newGridRows;
    const gridInfoElement = document.getElementById('gridInfo');
    if (gridInfoElement) {
        gridInfoElement.textContent = `Grid: ${newGridCols}×${newGridRows} = ${newTotalCells.toLocaleString()} cells`;
    }
    
    // Request animation frame, draw() will handle the rest
    if (!renderRequestId && !isRunning) requestAnimationFrame(draw);
}

// Enhanced pointer support for both mouse and touch
let lastTouchDistance = 0;
let lastTouchCenterX = 0;
let lastTouchCenterY = 0;

function getPointerPos(event, rect) {
    if (event.touches && event.touches.length > 0) {
        return {
            x: event.touches[0].clientX - rect.left,
            y: event.touches[0].clientY - rect.top
        };
    }
    return {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top
    };
}

function getTouchDistance(touch1, touch2) {
    const dx = touch1.clientX - touch2.clientX;
    const dy = touch1.clientY - touch2.clientY;
    return Math.sqrt(dx * dx + dy * dy);
}

function getTouchCenter(touches, rect) {
    if (touches.length === 1) {
        return {
            x: touches[0].clientX - rect.left,
            y: touches[0].clientY - rect.top
        };
    }
    const x = (touches[0].clientX + touches[1].clientX) / 2 - rect.left;
    const y = (touches[0].clientY + touches[1].clientY) / 2 - rect.top;
    return { x, y };
}

function handlePointerDown(event) {
    event.preventDefault();
    
    if (event.touches && event.touches.length === 2) {
        // Two-finger touch for pinch zoom
        const rect = canvas.getBoundingClientRect();
        lastTouchDistance = getTouchDistance(event.touches[0], event.touches[1]);
        const center = getTouchCenter(event.touches, rect);
        lastTouchCenterX = center.x;
        lastTouchCenterY = center.y;
        isDragging = false;
        return;
    }
    
    isDragging = true;
    const rect = canvas.getBoundingClientRect();
    const pos = getPointerPos(event, rect);
    lastMouseX = pos.x;
    lastMouseY = pos.y;
    canvas.style.cursor = 'grabbing';
}

function handlePointerUp(event) {
    event.preventDefault();
    if (isDragging) {
        isDragging = false;
        canvas.style.cursor = 'grab';
    }
    lastTouchDistance = 0;
}

function handlePointerMove(event) {
    event.preventDefault();
    
    if (event.touches && event.touches.length === 2) {
        // Two-finger pinch zoom
        const rect = canvas.getBoundingClientRect();
        const currentDistance = getTouchDistance(event.touches[0], event.touches[1]);
        const center = getTouchCenter(event.touches, rect);
        
        if (lastTouchDistance > 0) {
            const zoomRatio = currentDistance / lastTouchDistance;
            const worldX = (center.x - offsetX) / scale;
            const worldY = (center.y - offsetY) / scale;
            
            let newScale = Math.max(minScale, Math.min(maxScale, scale * zoomRatio));
            
            offsetX = center.x - worldX * newScale;
            offsetY = center.y - worldY * newScale;
            scale = newScale;
            
            needsFullRedraw = true;
            if (!renderRequestId && !isRunning) requestAnimationFrame(draw);
        }
        
        lastTouchDistance = currentDistance;
        lastTouchCenterX = center.x;
        lastTouchCenterY = center.y;
        return;
    }
    
    if (!isDragging) return;
    
    const rect = canvas.getBoundingClientRect();
    const pos = getPointerPos(event, rect);

    offsetX += pos.x - lastMouseX;
    offsetY += pos.y - lastMouseY;

    lastMouseX = pos.x;
    lastMouseY = pos.y;

    needsFullRedraw = true;
    if (!renderRequestId && !isRunning) requestAnimationFrame(draw);
}

function handlePointerLeave(event) {
    if (isDragging) {
        isDragging = false;
        canvas.style.cursor = 'grab';
    }
    lastTouchDistance = 0;
}

// Legacy mouse handlers for backwards compatibility
function handleMouseDown(event) { handlePointerDown(event); }
function handleMouseUp(event) { handlePointerUp(event); }
function handleMouseMove(event) { handlePointerMove(event); }
function handleMouseLeave(event) { handlePointerLeave(event); }

// Global Hotkey Listener
window.addEventListener('keydown', (event) => {
    // Ignore keys if user is typing in the rules editor
    if (event.target === document.getElementById('rulesDisplay')) {
        return;
    }

    // Check for Space bar (Start/Stop)
    if (event.code === 'Space') {
        event.preventDefault(); // Prevent default space bar scroll
        const btn = document.getElementById('startStopBtn');
        if (btn) btn.click(); // Simulate click
    }
    // Check for 'F' key (Randomize)
    else if (event.key === 'f' || event.key === 'F') {
        const btn = document.getElementById('randomizeBtn');
        if (btn) btn.click(); // Simulate click
    }
    // Check for 'R' key (Reset)
    else if (event.key === 'r' || event.key === 'R') {
        const btn = document.getElementById('resetBtn');
        if (btn) btn.click(); // Simulate click
    }
});

document.addEventListener('DOMContentLoaded', () => {
    console.log("DOMContentLoaded event fired.");
    if (!ctx) { console.error("Canvas context not found on DOMContentLoaded!"); return; }

    // Get elements and log immediately after each attempt
    const simSpeedSlider = document.getElementById('simSpeedSlider');
    console.log("simSpeedSlider:", simSpeedSlider);
    const simSpeedValueSpan = document.getElementById('simSpeedValue');
    console.log("simSpeedValueSpan:", simSpeedValueSpan);
    const startStopBtn = document.getElementById('startStopBtn');
    console.log("startStopBtn:", startStopBtn);
    const resetBtn = document.getElementById('resetBtn');
    console.log("resetBtn:", resetBtn);
    const resetViewBtn = document.getElementById('resetViewBtn');
    console.log("resetViewBtn:", resetViewBtn);
    const minimizeBtn = document.getElementById('minimizeBtn');
    console.log("minimizeBtn:", minimizeBtn);
    const maximizeBtn = document.getElementById('maximizeBtn');
    console.log("maximizeBtn:", maximizeBtn);
    const controlPanel = document.getElementById('controlPanel');
    console.log("controlPanel:", controlPanel);
    const rulesDisplay = document.getElementById('rulesDisplay');
    const applyBtn = document.getElementById('applyBtn');
    const randomizeBtn = document.getElementById('randomizeBtn');
    const antCountInput = document.getElementById('antCountInput'); // Get ant count input
    const startPositionSelect = document.getElementById('startPositionSelect'); // Get select
    const possibleStatesInput = document.getElementById('possibleStatesInput');
    const possibleColorsInput = document.getElementById('possibleColorsInput');
    const rulesDisplayContainer = document.getElementById('rulesDisplay')?.parentNode;
    const individualRulesCheck = document.getElementById('individualRulesCheck');
    const individualRulesContainer = document.querySelector('.individual-rules-container');
    const editRuleBtn = document.getElementById('editRuleBtn'); // Get edit button
    const ruleLabel = document.querySelector('.rules-display-container label'); // Get label
    const startDirectionSelect = document.getElementById('startDirectionSelect'); // Get direction select
    const rulesDisplayPre = document.getElementById('rulesDisplay'); // Get the pre tag itself
    const saveRuleBtn = document.getElementById('saveRuleBtn'); // Get save button
    const loadRuleBtn = document.getElementById('loadRuleBtn'); // Get load button
    const discardBtn = document.getElementById('discardBtn'); // Get discard button
    const presetSelect = document.getElementById('presetSelect'); // Get preset select
    const toggleRandomizeOptionsBtn = document.getElementById('toggleRandomizeOptionsBtn'); // New
    const randomizeOptionsContent = document.getElementById('randomizeOptionsContent'); // New
    const moveRelativeCheck = document.getElementById('moveRelativeCheck'); // New
    const moveAbsoluteCheck = document.getElementById('moveAbsoluteCheck'); // New
    const moveRandomCheck = document.getElementById('moveRandomCheck'); // New
    
    // Audio Controls
    const audioEnabledCheck = document.getElementById('audioEnabledCheck');
    const audioVolumeSlider = document.getElementById('audioVolumeSlider');
    const audioVolumeValue = document.getElementById('audioVolumeValue');
    const musicalScaleSelect = document.getElementById('musicalScaleSelect');
    const baseFreqSlider = document.getElementById('baseFreqSlider');
    const baseFreqValue = document.getElementById('baseFreqValue');
    
    // MIDI Controls
    const midiEnabledCheck = document.getElementById('midiEnabledCheck');
    const midiDeviceSelect = document.getElementById('midiDeviceSelect');
    const midiChannelSlider = document.getElementById('midiChannelSlider');
    const midiChannelValue = document.getElementById('midiChannelValue');
    const midiVelocitySlider = document.getElementById('midiVelocitySlider');
    const midiVelocityValue = document.getElementById('midiVelocityValue');
    const midiProgramPerAntCheck = document.getElementById('midiProgramPerAntCheck');
    
    // Animation Mode
    const animationModeBtn = document.getElementById('animationModeBtn');

    // Check all required elements rigorously
    if (!simSpeedSlider || !simSpeedValueSpan || !startStopBtn || !resetBtn || !resetViewBtn || !minimizeBtn || !maximizeBtn || !controlPanel || !rulesDisplay || !applyBtn || !randomizeBtn || !antCountInput || !startPositionSelect || !possibleStatesInput || !possibleColorsInput || !rulesDisplayContainer || !individualRulesCheck || !individualRulesContainer || !editRuleBtn || !ruleLabel || !startDirectionSelect || !rulesDisplayPre /* Add check */ || !saveRuleBtn || !loadRuleBtn || !discardBtn || !presetSelect || !toggleRandomizeOptionsBtn || !randomizeOptionsContent || !moveRelativeCheck || !moveAbsoluteCheck || !moveRandomCheck || !audioEnabledCheck || !audioVolumeSlider || !audioVolumeValue || !musicalScaleSelect || !baseFreqSlider || !baseFreqValue || !midiEnabledCheck || !midiDeviceSelect || !midiChannelSlider || !midiChannelValue || !midiVelocitySlider || !midiVelocityValue || !midiProgramPerAntCheck) {
        console.error("One or more control panel elements were not found! Aborting setup.");
        // Optionally log which specific ones were null
        if (!simSpeedSlider) console.error("- simSpeedSlider is null");
        if (!simSpeedValueSpan) console.error("- simSpeedValueSpan is null");
        if (!startStopBtn) console.error("- startStopBtn is null");
        if (!resetBtn) console.error("- resetBtn is null");
        if (!resetViewBtn) console.error("- resetViewBtn is null");
        if (!minimizeBtn) console.error("- minimizeBtn is null");
        if (!maximizeBtn) console.error("- maximizeBtn is null");
        if (!controlPanel) console.error("- controlPanel is null");
        if (!rulesDisplay) console.error("- rulesDisplay is null");
        if (!applyBtn) console.error("- applyBtn is null");
        if (!randomizeBtn) console.error("- randomizeBtn is null");
        if (!antCountInput) console.error("- antCountInput is null");
        if (!startPositionSelect) console.error("- startPositionSelect is null");
        if (!possibleStatesInput) console.error("- possibleStatesInput is null");
        if (!possibleColorsInput) console.error("- possibleColorsInput is null");
        if (!rulesDisplayContainer) console.error("- rulesDisplayContainer is null");
        if (!individualRulesCheck) console.error("- individualRulesCheck is null");
        if (!individualRulesContainer) console.error("- individualRulesContainer is null");
        if (!editRuleBtn) console.error("- editRuleBtn is null");
        if (!ruleLabel) console.error("- ruleLabel is null");
        if (!startDirectionSelect) console.error("- startDirectionSelect is null");
        if (!rulesDisplayPre) console.error("- rulesDisplayPre is null"); // Add log for pre tag
        if (!saveRuleBtn) console.error("- saveRuleBtn is null"); // Add log for save button
        if (!loadRuleBtn) console.error("- loadRuleBtn is null"); // Add log for load button
        if (!discardBtn) console.error("- discardBtn is null"); // Add log for discard button
        if (!presetSelect) console.error("- presetSelect is null"); // Add log for preset select
        if (!toggleRandomizeOptionsBtn) console.error("- toggleRandomizeOptionsBtn is null");
        if (!randomizeOptionsContent) console.error("- randomizeOptionsContent is null");
        if (!moveRelativeCheck) console.error("- moveRelativeCheck is null");
        if (!moveAbsoluteCheck) console.error("- moveAbsoluteCheck is null");
        if (!moveRandomCheck) console.error("- moveRandomCheck is null");
        return; // Stop execution
    }

    console.log("All control panel elements found. Proceeding with listeners and init...");

    // --- Helper Function ---
    function markChangesPending(applyBtn, discardBtn, presetSelect) {
        if (applyBtn) applyBtn.disabled = false;
        if (discardBtn) discardBtn.disabled = false;
        if (presetSelect) presetSelect.value = 'custom';
    }

    // --- Initial State Setup ---
    if (antCountInput && rulesDisplayContainer && individualRulesContainer && individualRulesCheck && rulesDisplayPre) {
        updateIndividualRulesVisibility(
            parseInt(antCountInput.value, 10) || 0,
            rulesDisplayContainer,
            individualRulesContainer,
            individualRulesCheck,
            rulesDisplayPre // Pass pre tag
        );
    }
    // #rulesDisplay starts hidden via HTML class now, no need to add 'hidden' here.

    // --- Attach Listeners ---
    startStopBtn.addEventListener('click', () => {
        if (isRunning) {
            console.log("Pause button clicked");
            isRunning = false;
            stopSimulationLoop(); // Stops sim, records pauseTime
            stopRenderLoop();
            // Stop all MIDI notes when pausing
            if (midiEnabled) {
                stopAllMIDINotes();
            }
        } else {
            console.log("Start button clicked");
            isRunning = true;
            startSimulationLoop(); // Resumes sim, adjusts nextStepTime
            startRenderLoop();
        }
        updateButtonText();
    });

    resetBtn.addEventListener('click', () => {
        const currentState = isRunning; // Check state *before* calling init
        // Call init without randomize, state/color counts (uses current rules)
        initSimulation(false, undefined, undefined, currentState);
        // Discard pending changes explicitly by disabling Apply button
        if (applyBtn) applyBtn.disabled = true;
        const discardBtn = document.getElementById('discardBtn');
        if (discardBtn) discardBtn.disabled = true;
         // Update visibility based on current state after reset
         if (antCountInput && rulesDisplayContainer && individualRulesContainer && individualRulesCheck && rulesDisplayPre) {
            updateIndividualRulesVisibility(
                parseInt(antCountInput.value, 10) || 0,
                rulesDisplayContainer,
                individualRulesContainer,
                individualRulesCheck,
                rulesDisplayPre
            );
        }
    });

    // Reset View Listener
    resetViewBtn.addEventListener('click', resetCamera);

    // Minimize Listener
    minimizeBtn.addEventListener('click', () => {
        controlPanel.classList.add('minimized');
    });

    // Maximize Listener
    maximizeBtn.addEventListener('click', () => {
        controlPanel.classList.remove('minimized');
    });

    simSpeedSlider.addEventListener('input', () => {
        const sliderValue = parseInt(simSpeedSlider.value, 10);
        const newSpeed = mapSliderToSpeed(sliderValue);
        // Display calculated speed, rounded
        simSpeedValueSpan.textContent = Math.round(newSpeed);
        // Loop reads slider value, no restart needed but could nudge time:
        // nextStepTime = Math.min(nextStepTime, performance.now() + 100);
    });

    // Ant Count Input Listener - Also enables/disables checkbox
    if (antCountInput) {
        antCountInput.addEventListener('input', () => {
            // Clamp value immediately in the UI if user types outside range
            const currentVal = parseInt(antCountInput.value, 10);
            const minVal = parseInt(antCountInput.min, 10);
            const maxVal = 1024; // Use literal max value for clamping check
            if (!isNaN(currentVal)) {
                 if (currentVal < minVal) antCountInput.value = minVal;
                 else if (currentVal > maxVal) antCountInput.value = maxVal;
            }
            const currentCount = parseInt(antCountInput.value, 10) || 0;
            // Call updated visibility function, passing pre tag
            if (rulesDisplayContainer && individualRulesContainer && individualRulesCheck && rulesDisplayPre) {
                 updateIndividualRulesVisibility(currentCount, rulesDisplayContainer, individualRulesContainer, individualRulesCheck, rulesDisplayPre);
            }
            markChangesPending(applyBtn, discardBtn, presetSelect);
            // If editor was open and count becomes 1 (which forces individual off),
            // it will be handled by updateIndividualRulesVisibility hiding the container.
            // No extra logic needed here.
        });
    }

    // Rules Display Listener (Input event)
    rulesDisplay.addEventListener('input', () => {
        markChangesPending(applyBtn, discardBtn, presetSelect);
    });

    // Individual Rules Checkbox Listener - Handles main rule visibility AND content update
    if (individualRulesCheck) {
        individualRulesCheck.addEventListener('change', () => {
            updateIndividualRulesVisibility(
                parseInt(document.getElementById('antCountInput').value, 10) || 0,
                rulesDisplayContainer,
                individualRulesContainer,
                individualRulesCheck,
                rulesDisplayPre // Pass pre tag
            );
            // If checked ON, the update function now handles hiding the <pre> tag if necessary.
            markChangesPending(applyBtn, discardBtn, presetSelect);
        });
    }

    // Apply Button Listener - Applies changes AND resets
    if (applyBtn) {
        applyBtn.addEventListener('click', () => {
            console.log("Applying changes (rules and ant count) and resetting...");
            let rulesChanged = false;
            if (rulesDisplay) {
                try {
                    let rulesText = rulesDisplay.textContent;
                    const rulesWithoutComments = rulesText.replace(/^\s*\/\/.*$/gm, '').trim();
                    const parsedRules = JSON.parse(rulesWithoutComments);
                    if (typeof parsedRules !== 'object' || parsedRules === null) throw new Error("Invalid rules object.");
                    // Simple check: Has the stringified version changed? (Not perfect, but decent)
                    if (JSON.stringify(rules) !== JSON.stringify(parsedRules)) {
                        rules = parsedRules;
                        rulesChanged = true;
                        console.log("Rules updated.");
                    }
                } catch (e) {
                    console.error("Error parsing rules JSON:", e);
                    alert(`Error parsing rules: ${e.message}\nPlease correct the rules definition.`);
                    return; // Stop if rules are invalid
                }
            }

            // Reset simulation using potentially updated rules and current ant count input
            applyBtn.disabled = true; // Disable button after initiating apply/reset
            const discardBtn = document.getElementById('discardBtn');
            if (discardBtn) discardBtn.disabled = true; // Also disable discard
            const currentState = isRunning;
            console.log("Resetting simulation to apply changes.");
            initSimulation(false, undefined, undefined, currentState); // initSimulation reads ant count and uses current global 'rules'
             // Update visibility based on current state after apply/reset
            if (antCountInput && rulesDisplayContainer && individualRulesContainer && individualRulesCheck && rulesDisplayPre) {
                updateIndividualRulesVisibility(
                    parseInt(antCountInput.value, 10) || 0,
                    rulesDisplayContainer,
                    individualRulesContainer,
                    individualRulesCheck,
                    rulesDisplayPre
                );
            }
        });
    }

    // Randomize Listener - Reads new inputs
    if (randomizeBtn) {
        randomizeBtn.addEventListener('click', () => {
            console.log("Randomizing rules and resetting simulation...");
            const currentState = isRunning;
            // Read max states/colors from inputs
            const maxStates = possibleStatesInput ? parseInt(possibleStatesInput.value, 10) : 2;
            const maxColors = possibleColorsInput ? parseInt(possibleColorsInput.value, 10) : 2;
            
            // Validate inputs (using updated limits)
            const validatedMaxStates = Math.max(1, Math.min(1000, maxStates || 1)); // Use 1000
            const validatedMaxColors = Math.max(2, Math.min(maxPossibleColors, maxColors || 2)); // maxPossibleColors is now 12
            
            // Randomize *within* the max limits
            const randomStates = Math.floor(Math.random() * validatedMaxStates) + 1;
            const randomColors = Math.floor(Math.random() * (validatedMaxColors - 1)) + 2; 

            console.log(` -> Using random states: ${randomStates} (max ${validatedMaxStates}), random colors: ${randomColors} (max ${validatedMaxColors})`);

            // Generate rules THEN reset simulation
            initSimulation(true, randomStates, randomColors, currentState);
            if (applyBtn) applyBtn.disabled = true;
            const discardBtn = document.getElementById('discardBtn');
            if (discardBtn) discardBtn.disabled = true; // Also disable discard
             // Update visibility based on current state after randomize/reset
             if (antCountInput && rulesDisplayContainer && individualRulesContainer && individualRulesCheck && rulesDisplayPre) {
                updateIndividualRulesVisibility(
                    parseInt(antCountInput.value, 10) || 0,
                    rulesDisplayContainer,
                    individualRulesContainer,
                    individualRulesCheck,
                    rulesDisplayPre
                );
            }
        });
    }

    // Start Position Select Listener
    if (startPositionSelect) {
        startPositionSelect.addEventListener('input', () => {
            markChangesPending(applyBtn, discardBtn, presetSelect);
        });
    }

    // Start Direction Select Listener
    if (startDirectionSelect) {
        startDirectionSelect.addEventListener('input', () => {
            markChangesPending(applyBtn, discardBtn, presetSelect);
        });
    }

    // Random Movement Mode Select Listener
    if (toggleRandomizeOptionsBtn && randomizeOptionsContent) {
        // Hide by default
        randomizeOptionsContent.classList.add('hidden'); 
        toggleRandomizeOptionsBtn.addEventListener('click', () => {
            randomizeOptionsContent.classList.toggle('hidden');
        });
    }

    // --- Pan and Zoom Listeners ---
    if (canvas) { // Check if canvas exists before adding listeners
        // Mouse events
        canvas.addEventListener('wheel', handleZoom);
        canvas.addEventListener('mousedown', handleMouseDown);
        canvas.addEventListener('mouseup', handleMouseUp);
        canvas.addEventListener('mousemove', handleMouseMove);
        canvas.addEventListener('mouseleave', handleMouseLeave);
        
        // Touch events for mobile support
        canvas.addEventListener('touchstart', handlePointerDown, { passive: false });
        canvas.addEventListener('touchend', handlePointerUp, { passive: false });
        canvas.addEventListener('touchmove', handlePointerMove, { passive: false });
        canvas.addEventListener('touchcancel', handlePointerLeave, { passive: false });
        
        canvas.style.cursor = 'grab';
        canvas.style.touchAction = 'none'; // Prevent default touch behaviors
    } else {
        console.error("Canvas element not found for Pan/Zoom listeners!");
    }

    // Dynamically set max colors based on defined array
    if (possibleColorsInput) possibleColorsInput.max = maxPossibleColors;

    // Listener to toggle rule editor visibility
    const toggleRuleEditor = () => {
        // Get the pre tag itself
        const rulesEditorPre = document.getElementById('rulesDisplay');
        if (rulesEditorPre && !individualRulesCheck.checked) { // Only toggle if not in individual mode
            rulesEditorPre.classList.toggle('hidden');
        }
    };
    if (editRuleBtn) {
        editRuleBtn.addEventListener('click', toggleRuleEditor);
    }

    // Max States Input Listener
    if (possibleStatesInput) {
        possibleStatesInput.addEventListener('input', () => {
            const input = possibleStatesInput;
            const currentVal = parseInt(input.value, 10);
            const minVal = parseInt(input.min, 10);
            const maxVal = parseInt(input.max, 10);
            if (!isNaN(currentVal)) { 
                 if (currentVal < minVal) input.value = minVal;
                 else if (currentVal > maxVal) input.value = maxVal;
            }
            // markChangesPending(applyBtn, discardBtn, presetSelect); // Do not mark changes for these
        });
    }

    // Max Colors Input Listener
    if (possibleColorsInput) {
        possibleColorsInput.addEventListener('input', () => {
            const input = possibleColorsInput;
            const currentVal = parseInt(input.value, 10);
            const minVal = parseInt(input.min, 10);
            const maxVal = parseInt(input.max, 10);
            if (!isNaN(currentVal)) { 
                 if (currentVal < minVal) input.value = minVal;
                 else if (currentVal > maxVal) input.value = maxVal;
            }
            // markChangesPending(applyBtn, discardBtn, presetSelect); // Do not mark changes for these
        });
    }

    // Save Rule Button Listener
    if (saveRuleBtn) {
        saveRuleBtn.addEventListener('click', () => {
            const rulesEditor = document.getElementById('rulesDisplay');
            if (!rulesEditor) return;

            let rulesText = rulesEditor.textContent || "";
            // Remove comment lines
            const rulesWithoutComments = rulesText.replace(/^\s*\/\/.*$/gm, '').trim();

            if (!rulesWithoutComments) {
                alert("Rule editor is empty or contains only comments. Nothing to save.");
                return;
            }

            try {
                // Validate that the uncommented text is valid JSON
                const parsedRules = JSON.parse(rulesWithoutComments);
                // Re-stringify for consistent formatting in the saved file
                const jsonString = JSON.stringify(parsedRules, null, 2);
                
                const blob = new Blob([jsonString], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'turmite_rule.json'; // Suggested filename
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url); // Clean up
                console.log("Rule saved successfully.");

            } catch (e) {
                console.error("Error processing rule for saving:", e);
                alert(`Could not save rule. The content (after removing comments) is not valid JSON:\n\n${e.message}`);
            }
        });
    }

    // Load Rule Button Listener
    if (loadRuleBtn) {
        loadRuleBtn.addEventListener('click', () => {
            const fileInput = document.createElement('input');
            fileInput.type = 'file';
            fileInput.accept = '.json,application/json'; // Accept .json files
            fileInput.style.display = 'none'; // Keep it hidden

            fileInput.addEventListener('change', (event) => {
                const file = event.target.files ? event.target.files[0] : null;
                if (!file) {
                    console.log("No file selected.");
                    return;
                }

                const reader = new FileReader();

                reader.onload = (e) => {
                    const content = e.target?.result;
                    const rulesEditor = document.getElementById('rulesDisplay');
                    const applyBtn = document.getElementById('applyBtn');
                    const discardBtn = document.getElementById('discardBtn'); // Get discard button here too
                    if (!rulesEditor || !applyBtn || !discardBtn) return;

                    try {
                        if (typeof content !== 'string') {
                             throw new Error("Failed to read file content as text.");
                        }
                        const parsedRules = JSON.parse(content);
                        
                        // Basic validation: Check if it's an object (could be more robust)
                        if (typeof parsedRules !== 'object' || parsedRules === null || Array.isArray(parsedRules)) {
                            throw new Error("Loaded JSON is not a valid rule object.");
                        }

                        // Format and add comments before displaying
                        const numStates = Object.keys(parsedRules).length;
                        const numColors = parsedRules[0] ? parsedRules[0].length : 0; // Assuming state 0 exists
                        let rulesString = "";
                        rulesString += `// States: ${numStates}\n`;
                        rulesString += `// Colors: ${numColors}\n`; 
                        rulesString += `// Moves: L:Left, R:Right, U:U-Turn, N:No Turn (forward), S:Stay, ^>v<:Absolute Dirs, ?:Random\n\n`;
                        rulesString += JSON.stringify(parsedRules, null, 2);

                        rulesEditor.textContent = rulesString;
                        applyBtn.disabled = false; // Enable Apply button
                        if (discardBtn) discardBtn.disabled = false; // Also enable discard
                        // Loading a file creates a custom state
                        if (presetSelect) presetSelect.value = 'custom'; // Set preset to Custom
                        console.log("Rule loaded successfully into editor.");

                    } catch (error) {
                        console.error("Error loading or parsing rule file:", error);
                        alert(`Failed to load rule: ${error.message}`);
                    }
                };

                reader.onerror = (e) => {
                    console.error("Error reading file:", e);
                    alert("An error occurred while trying to read the file.");
                };

                reader.readAsText(file); // Read the file as text
            });

            document.body.appendChild(fileInput); // Add to body to allow click
            fileInput.click();
            document.body.removeChild(fileInput); // Clean up immediately after click
        });
    }

    // Discard Button Listener
    if (discardBtn) {
        discardBtn.addEventListener('click', () => {
            console.log("Discarding unapplied changes...");
            
            // Check if there is a stored state
            if (Object.keys(lastAppliedState).length === 0) {
                console.warn("No last applied state found to discard to.");
                // Optionally disable buttons anyway?
                if (applyBtn) applyBtn.disabled = true;
                if (discardBtn) discardBtn.disabled = true;
                return;
            }

            // Restore controls from lastAppliedState
            if (antCountInput) antCountInput.value = lastAppliedState.antCount;
            if (startPositionSelect) startPositionSelect.value = lastAppliedState.startPosition;
            if (startDirectionSelect) startDirectionSelect.value = lastAppliedState.startDirection;
            if (possibleStatesInput) possibleStatesInput.value = lastAppliedState.maxStates;
            if (possibleColorsInput) possibleColorsInput.value = lastAppliedState.maxColors;
            if (individualRulesCheck) individualRulesCheck.checked = lastAppliedState.individualChecked;
            if (rulesDisplayPre) rulesDisplayPre.textContent = lastAppliedState.rulesText;

            // Update visibility based on restored state
            if (antCountInput && rulesDisplayContainer && individualRulesContainer && individualRulesCheck && rulesDisplayPre) {
                updateIndividualRulesVisibility(
                    parseInt(lastAppliedState.antCount, 10) || 0,
                    rulesDisplayContainer,
                    individualRulesContainer,
                    individualRulesCheck,
                    rulesDisplayPre
                );
            }

            // Disable Apply and Discard buttons
            if (applyBtn) applyBtn.disabled = true;
            if (discardBtn) discardBtn.disabled = true;
            console.log("Changes discarded.");
        });
    }

    // --- Preset Loading Logic --- 
    function loadPresetRule(presetValue) {
        const rulesEditor = document.getElementById('rulesDisplay');
        const applyBtn = document.getElementById('applyBtn');
        const discardBtn = document.getElementById('discardBtn');

        if (!rulesEditor || !applyBtn || !discardBtn) return;

        if (presetValue === 'custom') {
            // Do nothing if 'custom' selected, keep current editor content
            // Or, if you want 'custom' to clear the editor or load a default empty state:
            // rulesEditor.textContent = "// Custom rules - define your JSON here";
            // applyBtn.disabled = false; // Or true, depending on desired behavior
            // discardBtn.disabled = false;
            return; 
        }

        const selectedPreset = presetDefinitions[presetValue];

        if (selectedPreset) {
            const presetRules = selectedPreset.rules;
            const presetName = selectedPreset.name;
            try {
                const numStates = Object.keys(presetRules).length;
                const numColors = presetRules[0] ? presetRules[0].length : 0;
                let rulesString = `// Preset: ${presetName}\n`;
                rulesString += `// States: ${numStates}\n`;
                rulesString += `// Colors: ${numColors}\n`; 
                rulesString += `// Moves: L:Left, R:Right, U:U-Turn, N:No Turn (forward), S:Stay, ^>v<:Absolute Dirs, ?:Random\n\n`;
                rulesString += JSON.stringify(presetRules, null, 2);

                rulesEditor.textContent = rulesString;
                applyBtn.disabled = false; 
                discardBtn.disabled = false; 
                console.log(`Preset '${presetName}' loaded into editor.`);

            } catch (error) {
                console.error("Error formatting preset rule:", error);
                alert(`Failed to load preset '${presetName}': ${error.message}`);
            }
        } else {
            console.warn(`Preset with value '${presetValue}' not found in definitions.`);
            // Optionally, clear the editor or load a default if a preset is not found
            // rulesEditor.textContent = "// Selected preset not found";
        }
    }

    // Preset Select Listener
    if (presetSelect) {
        presetSelect.addEventListener('change', (event) => {
            loadPresetRule(event.target.value);
        });
    }

    // --- Populate Preset Select Dropdown Dynamically ---
    if (presetSelect && typeof presetDefinitions !== 'undefined') {
        presetSelect.innerHTML = ''; // Clear existing hardcoded options

        for (const key in presetDefinitions) {
            if (presetDefinitions.hasOwnProperty(key)) {
                const option = document.createElement('option');
                option.value = key;
                option.textContent = presetDefinitions[key].name;
                presetSelect.appendChild(option);
            }
        }
        // Add the 'Custom' option and select it by default or select the first available preset
        const customOption = document.createElement('option');
        customOption.value = 'custom';
        customOption.textContent = 'Custom';
        presetSelect.appendChild(customOption);
        // presetSelect.value = 'custom'; // Default to custom
        // Or, to select the first actual preset if available:
        if (presetSelect.options.length > 1) { // Check if any presets were added besides custom
             presetSelect.value = presetSelect.options[0].value; 
        }

    } else {
        console.warn("presetSelect element or presetDefinitions not found. Dropdown will not be populated dynamically.");
    }
    // --- End Dynamic Population ---

    initSimulation(false, undefined, undefined, true); // Initial Load

    // Load the default preset AFTER the initial simulation setup
    // Ensure a valid preset is selected before calling loadPresetRule
    if (presetSelect.value) {
        loadPresetRule(presetSelect.value);
    } else if (presetSelect.options.length > 0) {
        // Fallback to the first option if no value is set (e.g. if 'custom' was the only one and we want to load first actual preset)
        presetSelect.value = presetSelect.options[0].value;
        loadPresetRule(presetSelect.value);
    }

    // --- Disable buttons immediately after initial preset load --- 
    if (applyBtn) applyBtn.disabled = true;
    if (discardBtn) discardBtn.disabled = true;
    console.log("Disabled Apply/Discard after initial preset load.");

    // Allow Random Move Checkbox Listener
    if (moveRelativeCheck) {
        moveRelativeCheck.addEventListener('change', () => {
            // No markChangesPending
        });
    }
    if (moveAbsoluteCheck) {
        moveAbsoluteCheck.addEventListener('change', () => {
            // No markChangesPending
        });
    }
    if (moveRandomCheck) {
        moveRandomCheck.addEventListener('change', () => {
            // No markChangesPending
        });
    }
    
    // --- Audio Control Listeners ---
    
    // Audio Enable/Disable
    if (audioEnabledCheck) {
        audioEnabledCheck.addEventListener('change', async () => {
            audioEnabled = audioEnabledCheck.checked;
            if (audioEnabled) {
                if (!audioContext) {
                    const success = initAudio();
                    if (!success) {
                        audioEnabledCheck.checked = false;
                        audioEnabled = false;
                        alert("Failed to initialize audio. Please check your browser's audio permissions.");
                        return;
                    }
                }
                // Ensure audio context is running
                if (audioContext && audioContext.state === 'suspended') {
                    try {
                        await audioContext.resume();
                        console.log("Audio context resumed");
                    } catch (e) {
                        console.error("Failed to resume audio context:", e);
                    }
                }
            }
            console.log(`Audio ${audioEnabled ? 'enabled' : 'disabled'}`);
        });
    }
    
    // Volume Control
    if (audioVolumeSlider && audioVolumeValue) {
        audioVolumeSlider.addEventListener('input', () => {
            const volume = parseInt(audioVolumeSlider.value, 10) / 100;
            audioVolume = volume;
            audioVolumeValue.textContent = Math.round(volume * 100) + '%';
            if (masterGain) {
                masterGain.gain.value = audioVolume;
            }
        });
    }
    
    // Musical Scale Selection
    if (musicalScaleSelect) {
        musicalScaleSelect.addEventListener('change', () => {
            currentScale = musicalScaleSelect.value;
            console.log(`Musical scale changed to: ${currentScale}`);
        });
    }
    
    // Base Frequency Control
    if (baseFreqSlider && baseFreqValue) {
        baseFreqSlider.addEventListener('input', () => {
            baseFrequency = parseInt(baseFreqSlider.value, 10);
            baseFreqValue.textContent = baseFrequency + 'Hz';
        });
    }
    
    // --- MIDI Control Listeners ---
    
    // MIDI Enable/Disable
    if (midiEnabledCheck) {
        midiEnabledCheck.addEventListener('change', async () => {
            midiEnabled = midiEnabledCheck.checked;
            if (midiEnabled && !midiAccess) {
                const success = await initMIDI();
                if (!success) {
                    midiEnabledCheck.checked = false;
                    midiEnabled = false;
                    alert("Failed to initialize MIDI. Web MIDI API is only supported in Chrome, Edge, and Opera browsers. Firefox and Safari do not support MIDI.");
                } else {
                    // Update device dropdown
                    updateMIDIDeviceList();
                }
            } else if (!midiEnabled) {
                stopAllMIDINotes();
            }
            console.log(`MIDI ${midiEnabled ? 'enabled' : 'disabled'}`);
        });
    }
    
    // MIDI Device Selection
    if (midiDeviceSelect) {
        midiDeviceSelect.addEventListener('change', () => {
            const selectedId = midiDeviceSelect.value;
            if (selectedId) {
                const device = midiOutputs.find(d => d.id === selectedId);
                if (device) {
                    selectedMidiOutput = device.port;
                    console.log(`Selected MIDI device: ${device.name}`);
                }
            } else {
                selectedMidiOutput = null;
            }
        });
    }
    
    // MIDI Channel Control
    if (midiChannelSlider && midiChannelValue) {
        midiChannelSlider.addEventListener('input', () => {
            midiChannel = parseInt(midiChannelSlider.value, 10) - 1; // Convert to 0-based
            midiChannelValue.textContent = midiChannelSlider.value;
        });
    }
    
    // MIDI Velocity Control
    if (midiVelocitySlider && midiVelocityValue) {
        midiVelocitySlider.addEventListener('input', () => {
            midiVelocity = parseInt(midiVelocitySlider.value, 10);
            midiVelocityValue.textContent = midiVelocity;
        });
    }
    
    // MIDI Multi-Channel Option
    if (midiProgramPerAntCheck) {
        midiProgramPerAntCheck.addEventListener('change', () => {
            midiProgramPerAnt = midiProgramPerAntCheck.checked;
            if (midiProgramPerAnt) {
                // Set different programs for each channel
                for (let i = 0; i < 16; i++) {
                    sendMIDIProgramChange(i * 8, i); // Spread instruments
                }
            }
        });
    }
    
    // MIDI Recording Controls
    const startMidiRecordingBtn = document.getElementById('startMidiRecordingBtn');
    const stopMidiRecordingBtn = document.getElementById('stopMidiRecordingBtn');
    const exportMidiBtn = document.getElementById('exportMidiBtn');
    
    if (startMidiRecordingBtn) {
        startMidiRecordingBtn.addEventListener('click', () => {
            startMidiRecording();
            startMidiRecordingBtn.disabled = true;
            stopMidiRecordingBtn.disabled = false;
            const recordingStatus = document.getElementById('midiRecordingStatus');
            if (recordingStatus) {
                recordingStatus.style.display = 'block';
            }
        });
    }
    
    if (stopMidiRecordingBtn) {
        stopMidiRecordingBtn.addEventListener('click', () => {
            stopMidiRecording();
            startMidiRecordingBtn.disabled = false;
            stopMidiRecordingBtn.disabled = true;
            exportMidiBtn.disabled = recordedMidiEvents.length === 0;
        });
    }
    
    if (exportMidiBtn) {
        exportMidiBtn.addEventListener('click', () => {
            exportMidiRecording();
        });
    }
    
    // Helper function to update MIDI device dropdown
    function updateMIDIDeviceList() {
        if (!midiDeviceSelect) return;
        
        midiDeviceSelect.innerHTML = '';
        
        if (midiOutputs.length === 0) {
            const option = document.createElement('option');
            option.value = '';
            option.textContent = 'No MIDI devices found';
            midiDeviceSelect.appendChild(option);
        } else {
            midiOutputs.forEach(device => {
                const option = document.createElement('option');
                option.value = device.id;
                option.textContent = device.name;
                midiDeviceSelect.appendChild(option);
            });
            
            // Select first device by default
            if (selectedMidiOutput) {
                const currentDevice = midiOutputs.find(d => d.port === selectedMidiOutput);
                if (currentDevice) {
                    midiDeviceSelect.value = currentDevice.id;
                }
            }
        }
    }
    
    // --- Animation Mode Listener ---
    if (animationModeBtn) {
        animationModeBtn.addEventListener('click', () => {
            if (animationMode) {
                stopAnimationMode();
            } else {
                startAnimationMode();
            }
        });
    }
    
    // --- Art Installation Mode Listener ---
    const artInstallationBtn = document.getElementById('artInstallationBtn');
    if (artInstallationBtn) {
        artInstallationBtn.addEventListener('click', () => {
            if (artInstallationMode) {
                stopArtInstallationMode();
            } else {
                startArtInstallationMode();
            }
        });
    }
});

// Global listeners like resize can often stay global
window.addEventListener('resize', resizeCanvas);

// --- Simulation Loop (Corrected Logic) ---
function simulationLoop() {
    if (!isRunning) {
        simulationTimeoutId = null; return;
    }
    const now = performance.now();
    let totalStepsExecutedThisLoop = 0;
    const slider = document.getElementById('simSpeedSlider');
    const targetSpeed = slider ? parseInt(slider.value, 10) : 50;
    const mappedSpeed = mapSliderToSpeed(targetSpeed);
    const stepDuration = (mappedSpeed > 0) ? 1000 / mappedSpeed : Infinity;

    // Determine how many full simulation ticks (all ants move once) should have passed
    while (now >= nextStepTime && totalStepsExecutedThisLoop < maxStepsPerLoopIteration) {
        // Increment global step counter for this simulation tick
        simulationStepCount++;
        
        for (let i = 0; i < ants.length; i++) {
            const ant = ants[i];
            if (!ant) continue;

            // 1. Record current location before stepping
            const prevX = ant.x;
            const prevY = ant.y;
            cellsToUpdate.add(`${prevX},${prevY}`);

            // 2. Execute step for this ant
            stepSingleAntLogic(ant, i);

            // 3. Record new location after stepping
            cellsToUpdate.add(`${ant.x},${ant.y}`);
        }

        nextStepTime += stepDuration;
        totalStepsExecutedThisLoop += ants.length;
        if (stepDuration <= 0 || !isFinite(stepDuration)) { /* ... */ break; }
    }

    if (totalStepsExecutedThisLoop >= maxStepsPerLoopIteration) {
        // console.warn(`Max steps (${maxStepsPerLoopIteration}) reached.`); // Removed warning
        // Reset nextStepTime based on current time to avoid huge future jumps
        // This allows the simulation to recover if it falls far behind.
        nextStepTime = performance.now() + stepDuration;
    }

    const timeToNext = Math.max(0, nextStepTime - performance.now());
    simulationTimeoutId = setTimeout(simulationLoop, timeToNext);
}

function startSimulationLoop() {
    if (simulationTimeoutId) return; // Already running

    console.log(`Starting/Resuming Simulation Loop...`);

    // Adjust nextStepTime if resuming from pause
    if (pauseTime > 0) {
        const elapsedPausedTime = performance.now() - pauseTime;
        nextStepTime += elapsedPausedTime; // Adjust schedule forward
        console.log(`Resumed after ${elapsedPausedTime.toFixed(0)}ms pause. Adjusted nextStepTime to ${nextStepTime.toFixed(0)}`);
        pauseTime = 0; // Reset pause time
    } else {
        // If starting fresh, initialize nextStepTime
        nextStepTime = performance.now();
        console.log(`Starting fresh. Initial nextStepTime ${nextStepTime.toFixed(0)}`);
    }

    // Schedule the first call based on adjusted/initial nextStepTime
    const timeToFirstCall = Math.max(0, nextStepTime - performance.now());
    simulationTimeoutId = setTimeout(simulationLoop, timeToFirstCall);
    console.log(`Scheduled first simulation check in ${timeToFirstCall.toFixed(0)}ms`);
}

function stopSimulationLoop() {
    if (simulationTimeoutId) {
        clearTimeout(simulationTimeoutId);
        simulationTimeoutId = null;
        pauseTime = performance.now(); // Record pause time
        console.log("Simulation Loop stopped.");
    }
}

// --- Render Loop ---
function renderLoop() {
    if (!isRunning) {
        renderRequestId = null; // Ensure ID is cleared
        return; // Don't draw or request next frame
    }
    draw(); // Calls draw -> drawChangedCellsAndAnts
    renderRequestId = requestAnimationFrame(renderLoop);
}

function startRenderLoop() {
    if (renderRequestId) return; // Already running
    console.log("Starting Render Loop.");
    renderRequestId = requestAnimationFrame(renderLoop);
}

function stopRenderLoop() {
    if (renderRequestId) {
        cancelAnimationFrame(renderRequestId);
        renderRequestId = null;
        console.log("Render Loop stopped.");
    }
}

function calculateSimDelay(targetStepsPerSec) {
    if (targetStepsPerSec <= 0) return 10000; // Avoid division by zero, very slow
    // Calculate delay, clamp between 0 (for max speed) and a reasonable max
    const delay = 1000 / targetStepsPerSec;
    return Math.max(0, Math.min(10000, delay)); // Clamp delay (0ms to 10s)
}