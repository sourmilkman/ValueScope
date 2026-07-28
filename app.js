const BUILD = "VS-001";
const SAMPLE_SIZE = 64;

const video = document.querySelector("#camera");
const freezeCanvas = document.querySelector("#freezeCanvas");
const sampleCanvas = document.querySelector("#sampleCanvas");
const sampleContext = sampleCanvas.getContext("2d", { willReadFrequently: true });
const freezeContext = freezeCanvas.getContext("2d");
const aperture = document.querySelector("#aperture");
const valueScale = document.querySelector("#valueScale");
const valueNumber = document.querySelector("#valueNumber");
const currentSwatch = document.querySelector("#currentSwatch");
const luminancePercent = document.querySelector("#luminancePercent");
const matchStatus = document.querySelector("#matchStatus");
const cameraStatus = document.querySelector("#cameraStatus");
const calibrationStatus = document.querySelector("#calibrationStatus");
const freezeButton = document.querySelector("#freezeButton");
const targetButton = document.querySelector("#targetButton");
const whiteButton = document.querySelector("#whiteButton");
const blackButton = document.querySelector("#blackButton");

let stream;
let frozen = false;
let currentRawLuminance = null;
let currentValue = null;
let targetValue = null;
let whitePoint = 255;
let blackPoint = 0;
let lastUpdate = 0;

function greyForValue(value) {
  return Math.round(255 - ((value - 1) / 9) * 255);
}

function buildScale() {
  for (let value = 1; value <= 10; value += 1) {
    const grey = greyForValue(value);
    const step = document.createElement("span");
    step.className = "scale-step";
    step.dataset.value = value;
    step.textContent = value;
    step.style.setProperty("--step-color", `rgb(${grey} ${grey} ${grey})`);
    step.style.setProperty("--step-text", grey > 132 ? "#101114" : "#f6f6f3");
    valueScale.append(step);
  }
}

function setCameraStatus(message, isError = false) {
  cameraStatus.textContent = message;
  cameraStatus.style.color = isError ? "#ffaaa5" : "";
}

async function startCamera() {
  if (!navigator.mediaDevices?.getUserMedia) {
    setCameraStatus("Camera unsupported", true);
    return;
  }

  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: { ideal: "environment" },
        width: { ideal: 1920 },
        height: { ideal: 1080 }
      }
    });
    video.srcObject = stream;
    await video.play();
    setCameraStatus("Rear camera · Live");
    requestAnimationFrame(sampleLoop);
  } catch (error) {
    console.error(error);
    setCameraStatus("Tap to allow camera", true);
    cameraStatus.addEventListener("click", startCamera, { once: true });
  }
}

function getSourceAperture() {
  const videoRect = video.getBoundingClientRect();
  const apertureRect = aperture.getBoundingClientRect();
  const scale = Math.max(
    videoRect.width / video.videoWidth,
    videoRect.height / video.videoHeight
  );
  const displayedWidth = video.videoWidth * scale;
  const displayedHeight = video.videoHeight * scale;
  const cropX = (displayedWidth - videoRect.width) / 2;
  const cropY = (displayedHeight - videoRect.height) / 2;
  const centerX = apertureRect.left + apertureRect.width / 2 - videoRect.left;
  const centerY = apertureRect.top + apertureRect.height / 2 - videoRect.top;
  const sourceDiameter = Math.max(2, apertureRect.width / scale);

  return {
    sx: (centerX + cropX) / scale - sourceDiameter / 2,
    sy: (centerY + cropY) / scale - sourceDiameter / 2,
    size: sourceDiameter
  };
}

function readApertureLuminance() {
  if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || !video.videoWidth) {
    return null;
  }

  const source = getSourceAperture();
  sampleContext.drawImage(
    video,
    source.sx,
    source.sy,
    source.size,
    source.size,
    0,
    0,
    SAMPLE_SIZE,
    SAMPLE_SIZE
  );

  const pixels = sampleContext.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE).data;
  const radius = SAMPLE_SIZE * 0.44;
  const centre = SAMPLE_SIZE / 2;
  let sum = 0;
  let count = 0;

  for (let y = 0; y < SAMPLE_SIZE; y += 1) {
    for (let x = 0; x < SAMPLE_SIZE; x += 1) {
      const dx = x + 0.5 - centre;
      const dy = y + 0.5 - centre;
      if ((dx * dx) + (dy * dy) > radius * radius) continue;

      const index = (y * SAMPLE_SIZE + x) * 4;
      sum += (0.2126 * pixels[index]) +
        (0.7152 * pixels[index + 1]) +
        (0.0722 * pixels[index + 2]);
      count += 1;
    }
  }

  return count ? sum / count : null;
}

function normalizedLuminance(raw) {
  const range = whitePoint - blackPoint;
  if (range < 8) return raw / 255;
  return Math.min(1, Math.max(0, (raw - blackPoint) / range));
}

function renderReading(raw) {
  currentRawLuminance = raw;
  const normalized = normalizedLuminance(raw);
  const percent = Math.round(normalized * 100);
  currentValue = 1 + Math.round((1 - normalized) * 9);
  const grey = greyForValue(currentValue);

  valueNumber.textContent = currentValue;
  luminancePercent.textContent = `${percent}%`;
  currentSwatch.style.background = `rgb(${grey} ${grey} ${grey})`;
  currentSwatch.setAttribute("aria-label", `Value ${currentValue} swatch`);

  document.querySelectorAll(".scale-step").forEach((step) => {
    step.classList.toggle("active", Number(step.dataset.value) === currentValue);
  });

  updateMatchStatus();
}

function updateMatchStatus() {
  if (targetValue === null || currentValue === null) {
    matchStatus.textContent = "Set a target to compare";
    matchStatus.className = "match-status idle";
    return;
  }

  if (currentValue === targetValue) {
    matchStatus.textContent = `Match · Target ${targetValue}`;
    matchStatus.className = "match-status match";
  } else if (currentValue < targetValue) {
    matchStatus.textContent = `Too light · Target ${targetValue}`;
    matchStatus.className = "match-status off";
  } else {
    matchStatus.textContent = `Too dark · Target ${targetValue}`;
    matchStatus.className = "match-status off";
  }
}

function sampleLoop(timestamp) {
  if (!frozen && timestamp - lastUpdate > 100) {
    const luminance = readApertureLuminance();
    if (luminance !== null) renderReading(luminance);
    lastUpdate = timestamp;
  }
  requestAnimationFrame(sampleLoop);
}

function toggleFreeze() {
  if (!video.videoWidth) return;
  frozen = !frozen;

  if (frozen) {
    freezeCanvas.width = video.videoWidth;
    freezeCanvas.height = video.videoHeight;
    freezeContext.drawImage(video, 0, 0);
    freezeCanvas.classList.add("visible");
    freezeButton.querySelector("span:last-child").textContent = "Resume";
    setCameraStatus("Frame frozen");
  } else {
    freezeCanvas.classList.remove("visible");
    freezeButton.querySelector("span:last-child").textContent = "Freeze";
    setCameraStatus("Rear camera · Live");
  }
}

function setTarget() {
  if (currentValue === null) return;
  targetValue = currentValue;
  targetButton.querySelector("span:last-child").textContent = `Target ${targetValue}`;
  updateMatchStatus();
}

function calibrate(point) {
  if (currentRawLuminance === null) return;

  if (point === "white") {
    if (currentRawLuminance <= blackPoint + 8) {
      calibrationStatus.textContent = "White must be brighter";
      return;
    }
    whitePoint = currentRawLuminance;
  } else {
    if (currentRawLuminance >= whitePoint - 8) {
      calibrationStatus.textContent = "Black must be darker";
      return;
    }
    blackPoint = currentRawLuminance;
  }

  calibrationStatus.textContent =
    `Black ${Math.round(blackPoint)} · White ${Math.round(whitePoint)}`;
  renderReading(currentRawLuminance);
}

freezeButton.addEventListener("click", toggleFreeze);
targetButton.addEventListener("click", setTarget);
whiteButton.addEventListener("click", () => calibrate("white"));
blackButton.addEventListener("click", () => calibrate("black"));

document.querySelector(".build-label").textContent = `Build ${BUILD}`;
buildScale();
startCamera();

window.addEventListener("beforeunload", () => {
  stream?.getTracks().forEach((track) => track.stop());
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(console.error);
  });
}
