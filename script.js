let handLandmarker = null;
let stream = null;
let lastVideoTime = -1;
let predictionStarted = false;

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
  if (thumbExtended && extendedCount <= 1 && lm[4].y < lm[3].y) return { text: "YES" };
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
    module = await import("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22/+esm");
  } catch (error) {
    throw new Error(`MediaPipe JavaScript module failed to load: ${error?.name || "Error"}: ${error?.message || String(error)}`);
  }

  const { FilesetResolver, HandLandmarker } = module;

  let vision;
  try {
    vision = await FilesetResolver.forVisionTasks(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22/wasm"
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
        confidence.textContent = "Gesture recognized";
      } else {
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

startButton.addEventListener("click", startCamera);
retryButton.addEventListener("click", startCamera);
window.addEventListener("beforeunload", stopCamera);

setStatus("Camera access required", "Click Allow Camera & Start to begin MVP-1.");
