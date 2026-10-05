let handLandmarker = null;
let stream = null;
let lastVideoTime = -1;
let predictionStarted = false;

const MAX_BUFFER_SIZE = 3;
const gestureBuffer = [];

const CONFIRM_FRAMES = 5;
const NO_HAND_RESET_FRAMES = 8;

let candidateGesture = null;
let candidateFrames = 0;
let activeGesture = null;
let noHandFrames = 0;
let speechState = "idle";

const video = document.getElementById("camera");
const canvas = document.getElementById("overlay");
const ctx = canvas.getContext("2d");
const retryButton = document.getElementById("retryButton");
const startButton = document.getElementById("startButton");
const placeholder = document.getElementById("cameraPlaceholder");
const statusTitle = document.getElementById("statusTitle");
const statusText = document.getElementById("statusText");
const output = document.getElementById("output");
const confidence = document.getElementById("confidence");
const statusDot = document.getElementById("statusDot");
const bufferEl = document.getElementById("buffer");
const sequenceEl = document.getElementById("sequence");
const eventCountEl = document.getElementById("eventCount");
const speakButton = document.getElementById("speakButton");
const pauseButton = document.getElementById("pauseButton");
const resumeButton = document.getElementById("resumeButton");
const stopButton = document.getElementById("stopButton");
const speechStatusEl = document.getElementById("speechStatus");
const offlineBadge = document.getElementById("offlineBadge");

function updateOfflineStatus() {
  if (!offlineBadge) return;

  if (!navigator.onLine) {
    offlineBadge.textContent = "OFFLINE MODE: LOCAL APP";
  } else if (navigator.serviceWorker?.controller) {
    offlineBadge.textContent = "OFFLINE READY";
  } else {
    offlineBadge.textContent = "ONLINE: INSTALLING OFFLINE CACHE…";
  }
}

async function registerOfflineApp() {
  updateOfflineStatus();

  if (!("serviceWorker" in navigator)) {
    if (offlineBadge) offlineBadge.textContent = "OFFLINE PWA NOT SUPPORTED";
    return;
  }

  try {
    await navigator.serviceWorker.register("./sw.js");
    updateOfflineStatus();
  } catch (error) {
    console.error("Service Worker registration failed:", error);
    if (offlineBadge) offlineBadge.textContent = "OFFLINE CACHE FAILED";
  }
}

window.addEventListener("online", updateOfflineStatus);
window.addEventListener("offline", updateOfflineStatus);
navigator.serviceWorker?.addEventListener("controllerchange", updateOfflineStatus);


function getCommunicationOutput(sequence) {
  const key = sequence.join("→");

  const phrases = {
    "HELLO": "Hello.",
    "YES": "Yes.",
    "STOP": "Please stop.",
    "YES→HELLO": "Hello, yes.",
    "HELLO→STOP": "Hello, please stop.",
    "YES→YES": "Yes, yes.",
    "YES→YES→YES": "Yes, yes, yes.",
    "HELLO→YES": "Hello, yes.",
    "STOP→YES": "Please stop. Yes."
  };

  return phrases[key] || sequence.map(gesture => {
    if (gesture === "HELLO") return "Hello.";
    if (gesture === "STOP") return "Please stop.";
    if (gesture === "YES") return "Yes.";
    return gesture;
  }).join(" ");
}

function addGesture(gesture) {
  gestureBuffer.push(gesture);

  if (gestureBuffer.length > MAX_BUFFER_SIZE) {
    gestureBuffer.shift();
  }

  renderTemporalLogic();
}

function processGestureObservation(gesture) {
  if (!gesture) {
    noHandFrames += 1;
    candidateGesture = null;
    candidateFrames = 0;

    // Only end the active event after a real gap, so a brief MediaPipe
    // detection drop does not erase or duplicate the previous event.
    if (noHandFrames >= NO_HAND_RESET_FRAMES) {
      activeGesture = null;
      noHandFrames = 0;
    }
    return;
  }

  noHandFrames = 0;
  const observedGesture = gesture.text;

  // Holding the same gesture does not create another event.
  if (observedGesture === activeGesture) {
    candidateGesture = null;
    candidateFrames = 0;
    return;
  }

  // Require a stable new gesture before committing it to the temporal buffer.
  if (observedGesture === candidateGesture) {
    candidateFrames += 1;
  } else {
    candidateGesture = observedGesture;
    candidateFrames = 1;
  }

  if (candidateFrames >= CONFIRM_FRAMES) {
    activeGesture = candidateGesture;
    addGesture(activeGesture);
    candidateGesture = null;
    candidateFrames = 0;
  }
}

function clearTemporalBuffer() {
  gestureBuffer.length = 0;
  candidateGesture = null;
  candidateFrames = 0;
  activeGesture = null;
  noHandFrames = 0;
  renderTemporalLogic();
}

function renderTemporalLogic() {
  bufferEl.innerHTML = "";

  if (gestureBuffer.length === 0) {
    bufferEl.innerHTML = '<span class="empty">[ empty ]</span>';
    sequenceEl.textContent = "Waiting for gesture events…";
  } else {
    for (const gesture of gestureBuffer) {
      const token = document.createElement("span");
      token.className = "token";
      token.textContent = gesture;
      bufferEl.appendChild(token);
    }

    sequenceEl.textContent = getCommunicationOutput(gestureBuffer);
  }

  eventCountEl.textContent =
    `${gestureBuffer.length} event${gestureBuffer.length === 1 ? "" : "s"} in buffer`;
}

function updateSpeechControls() {
  const synth = window.speechSynthesis;

  if (!synth || speechState === "idle" || !synth.speaking) {
    speakButton.disabled = false;
    pauseButton.disabled = true;
    resumeButton.disabled = true;
    stopButton.disabled = true;
    return;
  }

  speakButton.disabled = true;
  pauseButton.disabled = speechState !== "speaking";
  resumeButton.disabled = speechState !== "paused";
  stopButton.disabled = false;
}

function speakCurrentMessage() {
  if (!("speechSynthesis" in window) || !("SpeechSynthesisUtterance" in window)) {
    speechStatusEl.textContent = "Speech synthesis is not supported in this browser.";
    return;
  }

  if (gestureBuffer.length === 0) {
    speechStatusEl.textContent = "Add a gesture before speaking.";
    return;
  }

  const synth = window.speechSynthesis;

  if (speechState === "speaking" || speechState === "paused") {
    speechStatusEl.textContent = speechState === "paused"
      ? "Speech is paused. Use RESUME."
      : "Speech is already running. Use PAUSE or STOP.";
    return;
  }

  const utterance = new SpeechSynthesisUtterance(getCommunicationOutput(gestureBuffer));
  utterance.lang = "en-US";
  utterance.rate = 0.95;
  utterance.pitch = 1;
  utterance.volume = 1;

  utterance.onstart = () => {
    speechState = "speaking";
    speakButton.textContent = "🔊 SPEAKING…";
    speechStatusEl.textContent = "Speech started.";
    updateSpeechControls();
  };

  utterance.onpause = () => {
    speechState = "paused";
    speechStatusEl.textContent = "Speech paused.";
    updateSpeechControls();
  };

  utterance.onresume = () => {
    speechState = "speaking";
    speechStatusEl.textContent = "Speech resumed.";
    updateSpeechControls();
  };

  utterance.onend = () => {
    speechState = "idle";
    speakButton.textContent = "🔊 SPEAK";
    speechStatusEl.textContent = "Speech finished.";
    updateSpeechControls();
  };

  utterance.onerror = event => {
    speechState = "idle";
    speakButton.textContent = "🔊 SPEAK";

    if (event.error === "interrupted" || event.error === "canceled") {
      speechStatusEl.textContent = "Speech stopped.";
      updateSpeechControls();
      return;
    }

    speechStatusEl.textContent = `Speech error: ${event.error || "unknown error"}`;
    updateSpeechControls();
  };

  const englishVoice = synth.getVoices().find(voice =>
    voice.lang && voice.lang.toLowerCase().startsWith("en")
  );

  if (englishVoice) utterance.voice = englishVoice;

  synth.cancel();
  speechState = "speaking";
  speakButton.textContent = "🔊 SPEAKING…";
  speechStatusEl.textContent = "Starting speech…";
  updateSpeechControls();

  setTimeout(() => {
    if (speechState !== "speaking") return;
    synth.resume();
    synth.speak(utterance);
  }, 60);
}

function initializeTemporalControls() {
  const clearButton = document.getElementById("clearButton");
  if (clearButton) clearButton.addEventListener("click", clearTemporalBuffer);

  speakButton.addEventListener("click", speakCurrentMessage);

  pauseButton.addEventListener("click", () => {
    const synth = window.speechSynthesis;
    if (speechState === "speaking" && synth.speaking) {
      speechState = "paused";
      synth.pause();
      speechStatusEl.textContent = "Speech paused.";
      updateSpeechControls();
    }
  });

  resumeButton.addEventListener("click", () => {
    const synth = window.speechSynthesis;
    if (speechState === "paused" && synth.speaking) {
      speechState = "speaking";
      synth.resume();
      speechStatusEl.textContent = "Speech resumed.";
      updateSpeechControls();
    }
  });

  stopButton.addEventListener("click", () => {
    const synth = window.speechSynthesis;
    if (speechState === "speaking" || speechState === "paused") {
      speechState = "idle";
      synth.cancel();
      speakButton.textContent = "🔊 SPEAK";
      speechStatusEl.textContent = "Speech stopped.";
      updateSpeechControls();
    }
  });

  renderTemporalLogic();
  updateSpeechControls();
}

function setStatus(title, text, active = false) {
  statusTitle.textContent = title;
  statusText.textContent = text;
  statusDot.style.background = active ? "#ff7a00" : "#000000";
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function classifyGesture(lm) {
  const wrist = lm[0];
  const indexExtended = distance(lm[8], wrist) > distance(lm[6], wrist) * 1.18;
  const middleExtended = distance(lm[12], wrist) > distance(lm[10], wrist) * 1.18;
  const ringExtended = distance(lm[16], wrist) > distance(lm[14], wrist) * 1.18;
  const pinkyExtended = distance(lm[20], wrist) > distance(lm[18], wrist) * 1.18;
  const thumbExtended = distance(lm[4], lm[5]) > distance(lm[3], lm[5]) * 1.12;
  const extendedCount = [indexExtended, middleExtended, ringExtended, pinkyExtended].filter(Boolean).length;

  if (extendedCount === 0 && !thumbExtended) return { text: "STOP" };

  // YES requires a clearly upward thumb, not merely an extended thumb.
  // This rejects common sideways-thumb false positives.
  const thumbUp =
    thumbExtended &&
    lm[4].y < lm[3].y &&
    lm[4].y < lm[2].y &&
    Math.abs(lm[4].x - lm[2].x) < 0.35;

  if (thumbUp && extendedCount <= 1) return { text: "YES" };
  if (extendedCount === 4 && thumbExtended) return { text: "HELLO" };
  return null;
}

function drawHands(result) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (!result?.landmarks) return;

  ctx.fillStyle = "#ff7a00";
  for (const hand of result.landmarks) {
    for (const point of hand) {
      ctx.beginPath();
      ctx.arc(point.x * canvas.width, point.y * canvas.height, 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

async function createHandLandmarker() {
  let module;
  try {
    module = await import("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/+esm");
  } catch (error) {
    throw new Error(`MediaPipe JavaScript module failed to load: ${error?.name || "Error"}: ${error?.message || String(error)}`);
  }

  const { FilesetResolver, HandLandmarker } = module;

  let vision;
  try {
    vision = await FilesetResolver.forVisionTasks(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm"
    );
  } catch (error) {
    throw new Error(`MediaPipe WASM failed to load: ${error?.name || "Error"}: ${error?.message || String(error)}`);
  }

  const modelAssetPath =
    "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";

  const options = {
    baseOptions: { modelAssetPath },
    runningMode: "VIDEO",
    numHands: 1
  };

  try {
    return await HandLandmarker.createFromOptions(vision, {
      ...options,
      baseOptions: { ...options.baseOptions, delegate: "GPU" }
    });
  } catch (gpuError) {
    console.warn("GPU hand tracking unavailable; trying CPU.", gpuError);

    try {
      return await HandLandmarker.createFromOptions(vision, {
        ...options,
        baseOptions: { ...options.baseOptions, delegate: "CPU" }
      });
    } catch (cpuError) {
      throw new Error(`MediaPipe hand model failed to initialize. GPU: ${gpuError?.message || String(gpuError)} | CPU: ${cpuError?.message || String(cpuError)}`);
    }
  }
}

async function loadHandTracking() {
  setStatus("Loading hand tracking…", "Camera is working. Loading MediaPipe.", true);

  try {
    handLandmarker = await createHandLandmarker();
    setStatus("SIGNALINK is ready", "Show ✋ HELLO, ✊ STOP, or 👍 YES.", true);
    startPredictionLoop();
  } catch (error) {
    console.error("Hand tracking failed:", error);
    setStatus("MediaPipe load failed", error?.message || String(error));
    confidence.textContent = "Camera is active. The exact MediaPipe failure is shown above.";
  }
}

async function startCamera() {
  retryButton.hidden = true;
  startButton.hidden = true;

  try {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("Camera API unavailable. Use GitHub Pages HTTPS or localhost.");
    }

    setStatus("Requesting camera access…", "Please allow camera access for MVP-1.");

    if (stream) stopCamera();

    stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    video.srcObject = stream;
    await video.play();

    placeholder.hidden = true;
    setStatus("Camera ready", "Camera is working. Loading MediaPipe.", true);

    if (!handLandmarker) {
      await loadHandTracking();
    } else {
      setStatus("SIGNALINK is ready", "Show ✋ HELLO, ✊ STOP, or 👍 YES.", true);
      startPredictionLoop();
    }
  } catch (error) {
    console.error("Camera error:", error);
    stopCamera();
    placeholder.hidden = false;
    retryButton.hidden = false;
    startButton.hidden = false;

    const message =
      error?.name === "NotAllowedError"
        ? "Camera permission was denied. Allow camera access for this site, then try again."
        : error?.name === "NotFoundError"
          ? "No camera was found on this device."
          : error?.message || "Camera access failed.";

    setStatus("Camera access required", message);
  }
}

function stopCamera() {
  if (stream) {
    stream.getTracks().forEach(track => track.stop());
    stream = null;
  }
  video.srcObject = null;
}

function startPredictionLoop() {
  if (predictionStarted) return;
  predictionStarted = true;
  requestAnimationFrame(predict);
}

function predict() {
  if (!handLandmarker || !stream) {
    predictionStarted = false;
    return;
  }

  if (video.readyState >= 2 && video.currentTime !== lastVideoTime) {
    lastVideoTime = video.currentTime;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    try {
      const result = handLandmarker.detectForVideo(video, performance.now());
      drawHands(result);

      const gesture = result.landmarks?.[0] ? classifyGesture(result.landmarks[0]) : null;

      if (gesture) {
        output.textContent = gesture.text;
        confidence.textContent = "Gesture detected — confirming event…";
        processGestureObservation(gesture);
      } else {
        processGestureObservation(null);
        confidence.textContent = result.landmarks?.length
          ? "Hand detected — show one of the three supported gestures."
          : "Waiting for a hand…";
      }
    } catch (error) {
      console.error("Gesture detection error:", error);
    }
  }

  requestAnimationFrame(predict);
}

registerOfflineApp();

startButton.addEventListener("click", startCamera);
initializeTemporalControls();
retryButton.addEventListener("click", startCamera);
window.addEventListener("beforeunload", stopCamera);

setStatus("Camera access required", "Click Allow Camera & Start to begin MVP-1.");
