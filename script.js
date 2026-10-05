import { FilesetResolver, HandLandmarker } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22/+esm";

const video = document.getElementById("camera");
const canvas = document.getElementById("overlay");
const ctx = canvas.getContext("2d");
const retryButton = document.getElementById("retryButton");
const placeholder = document.getElementById("cameraPlaceholder");
const statusTitle = document.getElementById("statusTitle");
const statusText = document.getElementById("statusText");
const output = document.getElementById("output");
const confidence = document.getElementById("confidence");

let handLandmarker = null;
let stream = null;
let lastVideoTime = -1;

function setStatus(title, text, active = false) {
  statusTitle.textContent = title;
  statusText.textContent = text;
  document.getElementById("statusDot").style.background = active ? "#43a047" : "#ff7a00";
}

function distance(a,b) {
  return Math.hypot(a.x-b.x, a.y-b.y);
}

function classifyGesture(lm) {
  // MediaPipe landmark indices:
  // wrist 0; thumb 1-4; index 5-8; middle 9-12; ring 13-16; pinky 17-20.
  const wrist = lm[0];

  const indexExtended = distance(lm[8], wrist) > distance(lm[6], wrist) * 1.18;
  const middleExtended = distance(lm[12], wrist) > distance(lm[10], wrist) * 1.18;
  const ringExtended = distance(lm[16], wrist) > distance(lm[14], wrist) * 1.18;
  const pinkyExtended = distance(lm[20], wrist) > distance(lm[18], wrist) * 1.18;

  const thumbExtended =
    distance(lm[4], lm[5]) > distance(lm[3], lm[5]) * 1.12;

  const extendedCount = [indexExtended, middleExtended, ringExtended, pinkyExtended].filter(Boolean).length;

  // Closed fist: four fingers folded.
  if (extendedCount === 0 && !thumbExtended) return { text:"STOP", score:0.90 };

  // Thumb up: thumb extended while the four fingers are folded.
  if (thumbExtended && extendedCount <= 1 && lm[4].y < lm[3].y) return { text:"YES", score:0.88 };

  // Open hand: all four fingers extended and thumb reasonably open.
  if (extendedCount === 4 && thumbExtended) return { text:"HELLO", score:0.92 };

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
  const vision = await FilesetResolver.forVisionTasks(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22/wasm"
  );

  return HandLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath:
        "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
      delegate: "GPU"
    },
    runningMode: "VIDEO",
    numHands: 1
  });
}

async function startCamera() {
  retryButton.hidden = true;
  setStatus("Requesting camera access…", "Camera access is required for MVP-1.");

  try {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("Camera API unavailable");
    }

    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false
    });

    video.srcObject = stream;
    await video.play();

    placeholder.hidden = true;
    setStatus("Camera ready", "Show one supported gesture to communicate.", true);

    if (!handLandmarker) {
      setStatus("Loading hand tracking…", "Camera is ready; loading the gesture model.", true);
      handLandmarker = await createHandLandmarker();
    }

    setStatus("SIGNALINK is ready", "Show ✋ HELLO, ✊ STOP, or 👍 YES.", true);
    requestAnimationFrame(predict);
  } catch (error) {
    console.error(error);
    stopCamera();
    placeholder.hidden = false;
    retryButton.hidden = false;
    setStatus(
      "Camera access is required",
      "Camera access was denied or unavailable. Allow camera access and try again."
    );
  }
}

function stopCamera() {
  if (stream) {
    stream.getTracks().forEach(track => track.stop());
    stream = null;
  }
  video.srcObject = null;
}

function predict() {
  if (!handLandmarker || video.readyState < 2) {
    requestAnimationFrame(predict);
    return;
  }

  if (video.currentTime !== lastVideoTime) {
    lastVideoTime = video.currentTime;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const result = handLandmarker.detectForVideo(video, performance.now());
    drawHands(result);

    const gesture = result.landmarks?.[0]
      ? classifyGesture(result.landmarks[0])
      : null;

    if (gesture) {
      output.textContent = gesture.text;
      confidence.textContent = "Gesture recognized";
    } else {
      confidence.textContent = result.landmarks?.length
        ? "Hand detected — show one of the three supported gestures."
        : "Waiting for a hand…";
    }
  }

  requestAnimationFrame(predict);
}

retryButton.addEventListener("click", startCamera);
window.addEventListener("beforeunload", stopCamera);

startCamera();
