// Audio context and nodes
let audioCtx;
let whiteNoise;
let gainNode;
let distortion;
let filter;
let analyser;
let modulator;
let modulationGain;
let isPlaying = false;
let resonators = []; // For metallic effect

// UI elements
const playButton = document.getElementById('play-button');
const stopButton = document.getElementById('stop-button');
const volumeSlider = document.getElementById('volume');
const volumeValue = document.getElementById('volume-value');
const distortionAmountSlider = document.getElementById('distortion-amount');
const distortionAmountValue = document.getElementById('distortion-amount-value');
const distortionOversampleSelect = document.getElementById('distortion-oversample');
const filterTypeSelect = document.getElementById('filter-type');
const filterFrequencySlider = document.getElementById('filter-frequency');
const filterFrequencyValue = document.getElementById('filter-frequency-value');
const filterQSlider = document.getElementById('filter-q');
const filterQValue = document.getElementById('filter-q-value');
const modSpeedSlider = document.getElementById('mod-speed');
const modSpeedValue = document.getElementById('mod-speed-value');
const modDepthSlider = document.getElementById('mod-depth');
const modDepthValue = document.getElementById('mod-depth-value');
const modTypeSelect = document.getElementById('mod-type');
const noiseTypeSelect = document.getElementById('noise-type');
const presetButtons = document.querySelectorAll('.preset-button');
const presetContainer = document.getElementById('preset-container');
const savePresetButton = document.getElementById('save-preset-button');
const presetNameInput = document.getElementById('preset-name');

// Canvas and visualization
const canvas = document.getElementById('visualizer');
const canvasCtx = canvas.getContext('2d');
let animationId;

// Initialize canvas size
function resizeCanvas() {
    canvas.width = canvas.clientWidth;
    canvas.height = canvas.clientHeight;
}

window.addEventListener('resize', resizeCanvas);
resizeCanvas();

// Function to generate a distortion curve
function makeDistortionCurve(amount) {
    const k = typeof amount === 'number' ? amount : 50;
    const n_samples = 44100;
    const curve = new Float32Array(n_samples);
    const deg = Math.PI / 180;
    
    for (let i = 0; i < n_samples; i++) {
        const x = (i * 2) / n_samples - 1;
        curve[i] = ((3 + k) * x * 20 * deg) / (Math.PI + k * Math.abs(x));
    }
    
    return curve;
}

// Function to generate different types of noise
function generateNoise(type, bufferSize, sampleRate) {
    const noiseBuffer = audioCtx.createBuffer(1, bufferSize, sampleRate);
    const output = noiseBuffer.getChannelData(0);
    
    let lastOut = 0;
    let lastOut2 = 0;
    
    for (let i = 0; i < bufferSize; i++) {
        let white = Math.random() * 2 - 1;
        
        if (type === 'pink') {
            // Pink noise approximation (simplified)
            output[i] = (white + lastOut) / 2;
            lastOut = output[i];
        } else if (type === 'brown') {
            // Brown noise approximation
            output[i] = (white + lastOut * 0.95) / 2;
            lastOut = output[i];
        } else if (type === 'metallic') {
            // Metallic noise approximation - more high frequency content with resonant peaks
            // This creates a sharper, more "metallic" sound
            const t = i / sampleRate;
            
            // Add some resonant frequencies for metallic character
            const resonance1 = Math.sin(2 * Math.PI * 1200 * t) * 0.2;
            const resonance2 = Math.sin(2 * Math.PI * 2400 * t) * 0.15;
            const resonance3 = Math.sin(2 * Math.PI * 3600 * t) * 0.1;
            
            // Add some noise with rapid modulation
            const noise = white * 0.5;
            
            // Combine with feedback for a more complex sound
            output[i] = noise + resonance1 + resonance2 + resonance3 + (lastOut * 0.3) - (lastOut2 * 0.2);
            
            // Store for feedback
            lastOut2 = lastOut;
            lastOut = output[i];
            
            // Add occasional "shatter" transients
            if (Math.random() < 0.001) {
                // Create a short burst of high amplitude
                for (let j = 0; j < 100 && i + j < bufferSize; j++) {
                    output[i + j] = (Math.random() * 2 - 1) * (1 - j/100);
                }
            }
        } else {
            // White noise
            output[i] = white;
        }
    }
    
    return noiseBuffer;
}

// Function to update the visualizer
function updateVisualizer() {
    if (!isPlaying) return;
    
    animationId = requestAnimationFrame(updateVisualizer);
    
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    analyser.getByteTimeDomainData(dataArray);
    
    canvasCtx.fillStyle = 'rgb(45, 45, 45)';
    canvasCtx.fillRect(0, 0, canvas.width, canvas.height);
    
    canvasCtx.lineWidth = 2;
    canvasCtx.strokeStyle = 'rgb(187, 134, 252)';
    canvasCtx.beginPath();
    
    const sliceWidth = canvas.width / bufferLength;
    let x = 0;
    
    // Draw the center line
    canvasCtx.strokeStyle = 'rgba(187, 134, 252, 0.2)';
    canvasCtx.beginPath();
    canvasCtx.moveTo(0, canvas.height / 2);
    canvasCtx.lineTo(canvas.width, canvas.height / 2);
    canvasCtx.stroke();
    
    // Draw the waveform
    canvasCtx.strokeStyle = 'rgb(187, 134, 252)';
    canvasCtx.beginPath();
    
    for (let i = 0; i < bufferLength; i++) {
        const v = dataArray[i] / 128.0;
        // Scale to fill more of the container height, but keep centered
        // Increase the scale factor to make the waveform taller
        // Also add an additional multiplier to boost the signal amplitude
        const scaleFactor = 1.8; // Use 180% of the canvas height for more dramatic effect
        const amplitudeBoost = 1.5; // Boost the signal amplitude
        const y = ((v - 1) * amplitudeBoost) * (canvas.height * scaleFactor / 2) + canvas.height / 2;
        
        if (i === 0) {
            canvasCtx.moveTo(x, y);
        } else {
            canvasCtx.lineTo(x, y);
        }
        
        x += sliceWidth;
    }
    canvasCtx.stroke();
}

// Function to create resonator filters for metallic effect
function createResonators() {
    // Clear any existing resonators
    resonators.forEach(resonator => {
        if (resonator) resonator.disconnect();
    });
    resonators = [];
    
    if (noiseTypeSelect.value === 'metallic') {
        // Create multiple resonant filters at different frequencies
        const resonantFreqs = [1200, 2400, 3600, 4800, 6000];
        
        resonantFreqs.forEach(freq => {
            const resonator = audioCtx.createBiquadFilter();
            resonator.type = 'peaking';
            resonator.frequency.value = freq;
            resonator.Q.value = 10;
            resonator.gain.value = 15;
            resonators.push(resonator);
        });
    }
}

// Function to start the audio
function startAudio() {
    if (isPlaying) return;
    
    // Create audio context if it doesn't exist
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    } else if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
    
    // Buffer size for noise
    const bufferSize = 2 * audioCtx.sampleRate;
    
    // Create noise buffer based on selected type
    const noiseBuffer = generateNoise(noiseTypeSelect.value, bufferSize, audioCtx.sampleRate);
    
    // Create a source node from the noise buffer
    whiteNoise = audioCtx.createBufferSource();
    whiteNoise.buffer = noiseBuffer;
    whiteNoise.loop = true;
    
    // Create a gain node to control the volume
    gainNode = audioCtx.createGain();
    gainNode.gain.value = parseFloat(volumeSlider.value);
    
    // Create a WaveShaper node for a distortion effect
    distortion = audioCtx.createWaveShaper();
    distortion.curve = makeDistortionCurve(parseInt(distortionAmountSlider.value));
    distortion.oversample = distortionOversampleSelect.value;
    
    // Create a biquad filter
    filter = audioCtx.createBiquadFilter();
    filter.type = filterTypeSelect.value;
    filter.frequency.value = parseInt(filterFrequencySlider.value);
    filter.Q.value = parseFloat(filterQSlider.value);
    
    // Create an analyser for visualization
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 2048;
    
    // Create oscillator for modulation
    modulator = audioCtx.createOscillator();
    modulator.frequency.value = parseFloat(modSpeedSlider.value);
    
    // Create gain node for modulation depth
    modulationGain = audioCtx.createGain();
    modulationGain.gain.value = parseFloat(modDepthSlider.value) * 1000; // Scale for filter frequency
    
    // Connect the modulator based on the selected type
    modulator.connect(modulationGain);
    
    // Create resonators for metallic effect if needed
    createResonators();
    
    // Set up the audio graph
    whiteNoise.connect(distortion);
    
    if (noiseTypeSelect.value === 'metallic' && resonators.length > 0) {
        // For metallic sound, use parallel resonators
        const resonatorInput = audioCtx.createGain();
        const resonatorOutput = audioCtx.createGain();
        
        distortion.connect(resonatorInput);
        
        // Connect each resonator in parallel
        resonators.forEach(resonator => {
            resonatorInput.connect(resonator);
            resonator.connect(resonatorOutput);
        });
        
        // Also connect direct signal for non-resonant components
        resonatorInput.connect(resonatorOutput);
        
        resonatorOutput.connect(filter);
    } else {
        distortion.connect(filter);
    }
    
    if (modTypeSelect.value === 'tremolo' || modTypeSelect.value === 'both') {
        // Create a gain node for tremolo effect
        const tremoloGain = audioCtx.createGain();
        tremoloGain.gain.value = 1.0;
        
        // Create a gain node for modulation depth
        const tremoloModGain = audioCtx.createGain();
        tremoloModGain.gain.value = parseFloat(modDepthSlider.value) * 0.5; // Scale for tremolo
        
        modulator.connect(tremoloModGain);
        tremoloModGain.connect(tremoloGain.gain);
        
        // Connect the filter to tremolo
        filter.connect(tremoloGain);
        tremoloGain.connect(gainNode);
    } else {
        filter.connect(gainNode);
    }
    
    if (modTypeSelect.value === 'filter' || modTypeSelect.value === 'both') {
        // Connect the modulation to the filter frequency
        modulationGain.connect(filter.frequency);
    }
    
    gainNode.connect(analyser);
    analyser.connect(audioCtx.destination);
    
    // Start the white noise source and modulator
    whiteNoise.start();
    modulator.start();
    
    // Update UI
    isPlaying = true;
    playButton.disabled = true;
    stopButton.disabled = false;
    
    // Start visualization
    updateVisualizer();
}

// Function to stop the audio
function stopAudio() {
    if (!isPlaying) return;
    
    // Stop the white noise source and modulator
    if (whiteNoise) {
        whiteNoise.stop();
    }
    
    if (modulator) {
        modulator.stop();
    }
    
    // Disconnect all nodes
    if (gainNode) {
        gainNode.disconnect();
    }
    
    // Clear resonators
    resonators.forEach(resonator => {
        if (resonator) resonator.disconnect();
    });
    resonators = [];
    
    // Update UI
    isPlaying = false;
    playButton.disabled = false;
    stopButton.disabled = true;
    
    // Stop visualization
    if (animationId) {
        cancelAnimationFrame(animationId);
    }
}

// Function to update UI values
function updateUIValues() {
    volumeValue.textContent = parseFloat(volumeSlider.value).toFixed(2);
    distortionAmountValue.textContent = parseInt(distortionAmountSlider.value);
    filterFrequencyValue.textContent = parseInt(filterFrequencySlider.value);
    filterQValue.textContent = parseFloat(filterQSlider.value).toFixed(1);
    modSpeedValue.textContent = parseFloat(modSpeedSlider.value).toFixed(1);
    modDepthValue.textContent = parseFloat(modDepthSlider.value).toFixed(2);
}

// Function to update audio parameters while playing
function updateAudioParams() {
    if (!isPlaying) return;
    
    // Update gain
    if (gainNode) {
        gainNode.gain.value = parseFloat(volumeSlider.value);
    }
    
    // Update distortion
    if (distortion) {
        distortion.curve = makeDistortionCurve(parseInt(distortionAmountSlider.value));
        distortion.oversample = distortionOversampleSelect.value;
    }
    
    // Update filter
    if (filter) {
        filter.type = filterTypeSelect.value;
        filter.frequency.value = parseInt(filterFrequencySlider.value);
        filter.Q.value = parseFloat(filterQSlider.value);
    }
    
    // Update modulation
    if (modulator) {
        modulator.frequency.value = parseFloat(modSpeedSlider.value);
    }
    
    if (modulationGain) {
        modulationGain.gain.value = parseFloat(modDepthSlider.value) * 1000; // Scale for filter frequency
    }
}

// Presets
const presets = {
    mild: {
        volume: 0.15,
        noiseType: 'white',
        distortionAmount: 200,
        distortionOversample: '2x',
        filterType: 'lowpass',
        filterFrequency: 3000,
        filterQ: 2,
        modSpeed: 2,
        modDepth: 0.3,
        modType: 'filter'
    },
    medium: {
        volume: 0.2,
        noiseType: 'white',
        distortionAmount: 400,
        distortionOversample: '4x',
        filterType: 'bandpass',
        filterFrequency: 2000,
        filterQ: 5,
        modSpeed: 5,
        modDepth: 0.5,
        modType: 'filter'
    },
    intense: {
        volume: 0.25,
        noiseType: 'pink',
        distortionAmount: 600,
        distortionOversample: '4x',
        filterType: 'bandpass',
        filterFrequency: 1500,
        filterQ: 8,
        modSpeed: 8,
        modDepth: 0.7,
        modType: 'both'
    },
    extreme: {
        volume: 0.3,
        noiseType: 'brown',
        distortionAmount: 800,
        distortionOversample: '4x',
        filterType: 'highpass',
        filterFrequency: 1000,
        filterQ: 12,
        modSpeed: 12,
        modDepth: 0.9,
        modType: 'both'
    },
    metallic: {
        volume: 0.25,
        noiseType: 'metallic',
        distortionAmount: 500,
        distortionOversample: '4x',
        filterType: 'bandpass',
        filterFrequency: 3000,
        filterQ: 10,
        modSpeed: 15,
        modDepth: 0.8,
        modType: 'both'
    }
};

// Function to get current settings
function getCurrentSettings() {
    return {
        volume: parseFloat(volumeSlider.value),
        noiseType: noiseTypeSelect.value,
        distortionAmount: parseInt(distortionAmountSlider.value),
        distortionOversample: distortionOversampleSelect.value,
        filterType: filterTypeSelect.value,
        filterFrequency: parseInt(filterFrequencySlider.value),
        filterQ: parseFloat(filterQSlider.value),
        modSpeed: parseFloat(modSpeedSlider.value),
        modDepth: parseFloat(modDepthSlider.value),
        modType: modTypeSelect.value
    };
}

// Function to save custom presets to localStorage
function saveCustomPreset() {
    const presetName = presetNameInput.value.trim();
    if (!presetName) {
        alert('Please enter a name for your preset');
        return;
    }
    
    // Get current settings
    const currentSettings = getCurrentSettings();
    
    // Get existing custom presets from localStorage
    let customPresets = {};
    try {
        const savedPresets = localStorage.getItem('shatterSoundPresets');
        if (savedPresets) {
            customPresets = JSON.parse(savedPresets);
        }
    } catch (e) {
        console.error('Error loading presets:', e);
    }
    
    // Add new preset
    customPresets[presetName] = currentSettings;
    
    // Save to localStorage
    try {
        localStorage.setItem('shatterSoundPresets', JSON.stringify(customPresets));
        
        // Update UI
        loadCustomPresets();
        
        // Clear input
        presetNameInput.value = '';
        
        // Show confirmation
        alert(`Preset "${presetName}" saved successfully!`);
    } catch (e) {
        console.error('Error saving preset:', e);
        alert('Error saving preset. Storage may be full.');
    }
}

// Function to load custom presets from localStorage
function loadCustomPresets() {
    // Remove existing custom preset buttons
    const customButtons = document.querySelectorAll('.preset-button.custom');
    customButtons.forEach(button => {
        const wrapper = button.closest('.custom-preset-wrapper');
        if (wrapper) {
            wrapper.remove();
        } else {
            button.remove();
        }
    });
    
    // Get custom presets from localStorage
    try {
        const savedPresets = localStorage.getItem('shatterSoundPresets');
        if (savedPresets) {
            const customPresets = JSON.parse(savedPresets);
            
            // Add buttons for each custom preset
            for (const presetName in customPresets) {
                if (customPresets.hasOwnProperty(presetName)) {
                    // Create wrapper for preset button and delete button
                    const wrapper = document.createElement('div');
                    wrapper.className = 'custom-preset-wrapper';
                    
                    // Create preset button
                    const presetButton = document.createElement('button');
                    presetButton.className = 'preset-button custom';
                    presetButton.textContent = presetName;
                    presetButton.dataset.presetName = presetName;
                    presetButton.addEventListener('click', () => {
                        applyCustomPreset(presetName);
                    });
                    
                    // Create delete button
                    const deleteButton = document.createElement('button');
                    deleteButton.className = 'preset-button delete';
                    deleteButton.textContent = 'X';
                    deleteButton.addEventListener('click', (e) => {
                        e.stopPropagation();
                        deleteCustomPreset(presetName);
                    });
                    
                    // Add buttons to wrapper
                    wrapper.appendChild(presetButton);
                    wrapper.appendChild(deleteButton);
                    
                    // Add wrapper to container
                    presetContainer.appendChild(wrapper);
                }
            }
        }
    } catch (e) {
        console.error('Error loading custom presets:', e);
    }
}

// Function to apply a custom preset
function applyCustomPreset(presetName) {
    try {
        const savedPresets = localStorage.getItem('shatterSoundPresets');
        if (savedPresets) {
            const customPresets = JSON.parse(savedPresets);
            const preset = customPresets[presetName];
            
            if (preset) {
                // Update UI controls
                volumeSlider.value = preset.volume;
                noiseTypeSelect.value = preset.noiseType;
                distortionAmountSlider.value = preset.distortionAmount;
                distortionOversampleSelect.value = preset.distortionOversample;
                filterTypeSelect.value = preset.filterType;
                filterFrequencySlider.value = preset.filterFrequency;
                filterQSlider.value = preset.filterQ;
                modSpeedSlider.value = preset.modSpeed;
                modDepthSlider.value = preset.modDepth;
                modTypeSelect.value = preset.modType;
                
                // Update UI values
                updateUIValues();
                
                // Update audio parameters if playing
                updateAudioParams();
                
                // Update active preset button
                presetButtons.forEach(button => {
                    button.classList.remove('active');
                });
                
                const customButtons = document.querySelectorAll('.preset-button.custom');
                customButtons.forEach(button => {
                    button.classList.remove('active');
                    if (button.dataset.presetName === presetName) {
                        button.classList.add('active');
                    }
                });
                
                // If playing, restart the audio to apply the new noise type
                if (isPlaying) {
                    stopAudio();
                    startAudio();
                }
            }
        }
    } catch (e) {
        console.error('Error applying custom preset:', e);
    }
}

// Function to delete a custom preset
function deleteCustomPreset(presetName) {
    if (confirm(`Are you sure you want to delete the preset "${presetName}"?`)) {
        try {
            const savedPresets = localStorage.getItem('shatterSoundPresets');
            if (savedPresets) {
                const customPresets = JSON.parse(savedPresets);
                
                if (customPresets[presetName]) {
                    delete customPresets[presetName];
                    localStorage.setItem('shatterSoundPresets', JSON.stringify(customPresets));
                    
                    // Update UI
                    loadCustomPresets();
                }
            }
        } catch (e) {
            console.error('Error deleting custom preset:', e);
        }
    }
}

// Function to apply built-in preset
function applyPreset(presetName) {
    const preset = presets[presetName];
    if (!preset) return;
    
    // Update UI controls
    volumeSlider.value = preset.volume;
    noiseTypeSelect.value = preset.noiseType;
    distortionAmountSlider.value = preset.distortionAmount;
    distortionOversampleSelect.value = preset.distortionOversample;
    filterTypeSelect.value = preset.filterType;
    filterFrequencySlider.value = preset.filterFrequency;
    filterQSlider.value = preset.filterQ;
    modSpeedSlider.value = preset.modSpeed;
    modDepthSlider.value = preset.modDepth;
    modTypeSelect.value = preset.modType;
    
    // Update UI values
    updateUIValues();
    
    // Update audio parameters if playing
    updateAudioParams();
    
    // Update active preset button
    presetButtons.forEach(button => {
        button.classList.remove('active');
        if (button.dataset.preset === presetName) {
            button.classList.add('active');
        }
    });
    
    // If playing, restart the audio to apply the new noise type
    if (isPlaying) {
        stopAudio();
        startAudio();
    }
}

// Event listeners
playButton.addEventListener('click', startAudio);
stopButton.addEventListener('click', stopAudio);

// Update UI values on input
volumeSlider.addEventListener('input', () => {
    updateUIValues();
    updateAudioParams();
});

distortionAmountSlider.addEventListener('input', () => {
    updateUIValues();
    updateAudioParams();
});

distortionOversampleSelect.addEventListener('change', updateAudioParams);

filterTypeSelect.addEventListener('change', updateAudioParams);

filterFrequencySlider.addEventListener('input', () => {
    updateUIValues();
    updateAudioParams();
});

filterQSlider.addEventListener('input', () => {
    updateUIValues();
    updateAudioParams();
});

modSpeedSlider.addEventListener('input', () => {
    updateUIValues();
    updateAudioParams();
});

modDepthSlider.addEventListener('input', () => {
    updateUIValues();
    updateAudioParams();
});

modTypeSelect.addEventListener('change', () => {
    if (isPlaying) {
        stopAudio();
        startAudio();
    }
});

noiseTypeSelect.addEventListener('change', () => {
    if (isPlaying) {
        stopAudio();
        startAudio();
    }
});

// Preset buttons
presetButtons.forEach(button => {
    button.addEventListener('click', () => {
        applyPreset(button.dataset.preset);
    });
});

// Save preset button
savePresetButton.addEventListener('click', saveCustomPreset);

// Load custom presets on page load
document.addEventListener('DOMContentLoaded', () => {
    loadCustomPresets();
    
    // Apply medium preset by default
    applyPreset('medium');
    
    // Initialize UI values
    updateUIValues();
});
