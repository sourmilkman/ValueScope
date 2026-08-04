const BUILD = "VS-007";
const SAMPLE_SIZE = 96;
const VALUES = Array.from({ length: 10 }, (_, index) => index + 1);

const valueField = document.querySelector("#valueField");
const comparisonField = document.querySelector("#comparisonField");
const comparisonLabel = document.querySelector("#comparisonLabel");
const aperture = document.querySelector("#aperture");
const cameraLayer = document.querySelector("#cameraLayer");
const video = document.querySelector("#camera");
const freezeCanvas = document.querySelector("#freezeCanvas");
const freezeContext = freezeCanvas.getContext("2d");
const sampleCanvas = document.querySelector("#sampleCanvas");
const sampleContext = sampleCanvas.getContext("2d", { willReadFrequently: true });
const selectedBadge = document.querySelector("#selectedBadge strong");
const badgeLabel = document.querySelector("#badgeLabel");
const meanReading = document.querySelector("#meanReading");
const cameraStatus = document.querySelector("#cameraStatus");
const standardModeButton = document.querySelector("#standardMode");
const munsellModeButton = document.querySelector("#munsellMode");
const cameraModeButton = document.querySelector("#cameraModeButton");
const cameraModeLabel = document.querySelector("#cameraModeLabel");
const apertureSizeInput = document.querySelector("#apertureSize");
const freezeButton = document.querySelector("#freezeButton");
const freezeLabel = document.querySelector("#freezeLabel");
const autoMatchButton = document.querySelector("#autoMatchButton");
const scaleNote = document.querySelector("#scaleNote");

let selectedValue = 5;
let scaleMode = "standard";
let cameraMode = "colour";
let stream;
let frozen = false;
let autoMatchActive = false;
let wheelAccumulator = 0;
let wheelResetTimer;
const dragState = {
  active: false,
  didMove: false,
  pointerId: null,
  startValue: selectedValue,
  startY: 0,
  tapValue: null
};

function clampChannel(value) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function standardGrey(value) {
  const channel = ((value - 1) / 9) * 255;
  return [channel, channel, channel].map(clampChannel);
}

function munsellReflectance(value) {
  const polynomial = (munsellValue) =>
    (1.2219 * munsellValue) -
    (0.23111 * (munsellValue ** 2)) +
    (0.23951 * (munsellValue ** 3)) -
    (0.021009 * (munsellValue ** 4)) +
    (0.0008404 * (munsellValue ** 5));
  const normalized = polynomial(value) / polynomial(10);
  return Math.max(0, Math.min(1, normalized));
}

function linearToSrgb(value) {
  if (value <= 0.0031308) return 12.92 * value;
  return (1.055 * (value ** (1 / 2.4))) - 0.055;
}

function srgbToLinear(value) {
  if (value <= 0.04045) return value / 12.92;
  return ((value + 0.055) / 1.055) ** 2.4;
}

function munsellGrey(value) {
  const luminance = munsellReflectance(value);
  const neutralChannel = clampChannel(linearToSrgb(luminance) * 255);
  return [neutralChannel, neutralChannel, neutralChannel];
}

function colourForValue(value) {
  return scaleMode === "munsell" ? munsellGrey(value) : standardGrey(value);
}

function labelColour([red, green, blue]) {
  const luminance = (0.2126 * red) + (0.7152 * green) + (0.0722 * blue);
  return luminance > 138 ? ["#111210", "rgba(255,255,255,.42)"] : ["#f7f7f2", "rgba(0,0,0,.5)"];
}

function renderScale() {
  valueField.replaceChildren();

  VALUES.forEach((value) => {
    const colour = colourForValue(value);
    const [textColour, shadowColour] = labelColour(colour);
    const band = document.createElement("button");
    band.type = "button";
    band.className = "value-band";
    band.dataset.value = value;
    band.setAttribute("aria-label", `Select ${scaleMode === "munsell" ? "Munsell N" : "value "}${value}`);
    band.style.setProperty("--band-colour", `rgb(${colour.join(" ")})`);
    band.style.setProperty("--label-colour", textColour);
    band.style.setProperty("--label-shadow", shadowColour);
    band.innerHTML = `
      <span class="value-label">
        <small>Selected</small>
        <strong>${scaleMode === "munsell" ? "N" : ""}${value}</strong>
      </span>
    `;
    band.addEventListener("click", () => {
      if (!dragState.didMove) selectValue(value);
    });
    valueField.append(band);
  });

  updateBandLayout();
  updateComparisonField();
}

function updateComparisonField() {
  const colour = colourForValue(selectedValue);
  const [textColour, shadowColour] = labelColour(colour);
  comparisonField.style.setProperty("--comparison-colour", `rgb(${colour.join(" ")})`);
  comparisonField.style.setProperty("--comparison-label", textColour);
  comparisonField.style.setProperty("--comparison-shadow", shadowColour);
  comparisonLabel.textContent = `${scaleMode === "munsell" ? "N" : ""}${selectedValue}`;
}

function updateBandLayout() {
  const bands = [...document.querySelectorAll(".value-band")];
  const viewportHeight = valueField.clientHeight;
  const apertureSize = Number(apertureSizeInput.value);
  const centralHeight = Math.min(viewportHeight * 0.42, apertureSize + 44);
  const sideSpace = (viewportHeight - centralHeight) / 2;
  const topCount = selectedValue - 1;
  const bottomCount = 10 - selectedValue;
  const longestSide = Math.max(topCount, bottomCount);
  const minimumHeight = Math.min(24, sideSpace / Math.max(1, longestSide));
  const decay = 0.62;
  const distanceWeights = Array.from(
    { length: longestSide },
    (_, index) => decay ** index
  );
  const weightTotal = distanceWeights.reduce((total, weight) => total + weight, 0);
  const distributableSpace = Math.max(0, sideSpace - (minimumHeight * longestSide));
  const heightAtDistance = (distance) =>
    minimumHeight +
    (distributableSpace * (distanceWeights[distance - 1] / weightTotal));
  const topTotal = Array.from(
    { length: topCount },
    (_, index) => heightAtDistance(index + 1)
  ).reduce((total, height) => total + height, 0);
  const bottomTotal = Array.from(
    { length: bottomCount },
    (_, index) => heightAtDistance(index + 1)
  ).reduce((total, height) => total + height, 0);
  const selectedHeight =
    centralHeight +
    (sideSpace - topTotal) +
    (sideSpace - bottomTotal);

  bands.forEach((band) => {
    const value = Number(band.dataset.value);
    const distanceFromSelection = Math.abs(value - selectedValue);
    let height;

    if (value < selectedValue) {
      height = heightAtDistance(selectedValue - value);
    } else if (value > selectedValue) {
      height = heightAtDistance(value - selectedValue);
    } else {
      height = selectedHeight;
    }

    const previousHeight = Number.parseFloat(band.dataset.targetHeight);
    const travel = Number.isFinite(previousHeight) ? Math.abs(height - previousHeight) : 0;

    if (travel > 0.5) {
      const duration = Math.min(420, Math.max(220, 210 + (travel * 0.72)));
      band.dataset.motion = height > previousHeight ? "expand" : "contract";
      band.style.setProperty("--band-motion-duration", `${Math.round(duration)}ms`);
      band.style.setProperty("--band-motion-delay", `${Math.min(distanceFromSelection, 4) * 7}ms`);
    }

    band.dataset.targetHeight = height.toFixed(2);
    band.style.height = `${height}px`;
    band.classList.toggle("selected", value === selectedValue);
    band.classList.toggle("compact", height < 34);
  });
}

function clearAutoResult() {
  if (!autoMatchActive) return;
  autoMatchActive = false;
  badgeLabel.textContent = "Selected";
  meanReading.hidden = true;
}

function selectValue(value, { preserveMean = false } = {}) {
  if (!preserveMean) clearAutoResult();
  selectedValue = value;
  selectedBadge.textContent = `${scaleMode === "munsell" ? "N" : ""}${value}`;
  updateBandLayout();
  updateComparisonField();
}

function setScaleMode(mode) {
  clearAutoResult();
  scaleMode = mode;
  standardModeButton.classList.toggle("active", mode === "standard");
  munsellModeButton.classList.toggle("active", mode === "munsell");
  scaleNote.textContent = mode === "munsell"
    ? "Munsell reflectance steps"
    : "Even digital steps";
  renderScale();
  selectedBadge.textContent = `${mode === "munsell" ? "N" : ""}${selectedValue}`;
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
    stream?.getTracks().forEach((track) => track.stop());
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
  } catch (error) {
    console.error(error);
    setCameraStatus("Tap to allow camera", true);
    cameraStatus.addEventListener("click", startCamera, { once: true });
  }
}

function toggleCameraMode() {
  cameraMode = cameraMode === "colour" ? "greyscale" : "colour";
  cameraLayer.classList.toggle("greyscale", cameraMode === "greyscale");
  cameraModeLabel.textContent = cameraMode === "colour" ? "Colour" : "B&W";
}

function freezeCurrentFrame() {
  if (!video.videoWidth) return;
  freezeCanvas.width = video.videoWidth;
  freezeCanvas.height = video.videoHeight;
  freezeContext.drawImage(video, 0, 0);
  freezeCanvas.classList.add("visible");
  freezeLabel.textContent = "Resume";
  frozen = true;
  setCameraStatus("Frame frozen");
  return true;
}

function toggleFreeze() {
  if (!video.videoWidth) return;
  if (frozen) {
    frozen = false;
    freezeCanvas.classList.remove("visible");
    freezeLabel.textContent = "Freeze";
    setCameraStatus("Rear camera · Live");
    clearAutoResult();
  } else {
    freezeCurrentFrame();
  }
}

function munsellValueForReflectance(reflectance) {
  let low = 0;
  let high = 10;
  for (let iteration = 0; iteration < 32; iteration += 1) {
    const midpoint = (low + high) / 2;
    if (munsellReflectance(midpoint) < reflectance) {
      low = midpoint;
    } else {
      high = midpoint;
    }
  }
  return (low + high) / 2;
}

function readMeanApertureLuminance() {
  if (!video.videoWidth || !freezeCanvas.width) return null;

  const layerRect = cameraLayer.getBoundingClientRect();
  const apertureRect = aperture.getBoundingClientRect();
  const sourceWidth = freezeCanvas.width;
  const sourceHeight = freezeCanvas.height;
  const scale = Math.max(
    layerRect.width / sourceWidth,
    layerRect.height / sourceHeight
  );
  const renderedWidth = sourceWidth * scale;
  const renderedHeight = sourceHeight * scale;
  const cropX = (renderedWidth - layerRect.width) / 2;
  const cropY = (renderedHeight - layerRect.height) / 2;
  const centreX = apertureRect.left + (apertureRect.width / 2) - layerRect.left;
  const centreY = apertureRect.top + (apertureRect.height / 2) - layerRect.top;
  const sourceDiameter = apertureRect.width / scale;
  const sourceX = ((centreX + cropX) / scale) - (sourceDiameter / 2);
  const sourceY = ((centreY + cropY) / scale) - (sourceDiameter / 2);

  sampleContext.drawImage(
    freezeCanvas,
    sourceX,
    sourceY,
    sourceDiameter,
    sourceDiameter,
    0,
    0,
    SAMPLE_SIZE,
    SAMPLE_SIZE
  );

  const pixels = sampleContext.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE).data;
  const centre = SAMPLE_SIZE / 2;
  const radiusSquared = ((SAMPLE_SIZE / 2) - 1) ** 2;
  let luminanceTotal = 0;
  let pixelCount = 0;

  for (let y = 0; y < SAMPLE_SIZE; y += 1) {
    for (let x = 0; x < SAMPLE_SIZE; x += 1) {
      const offsetX = x + 0.5 - centre;
      const offsetY = y + 0.5 - centre;
      if ((offsetX ** 2) + (offsetY ** 2) > radiusSquared) continue;

      const index = ((y * SAMPLE_SIZE) + x) * 4;
      const red = srgbToLinear(pixels[index] / 255);
      const green = srgbToLinear(pixels[index + 1] / 255);
      const blue = srgbToLinear(pixels[index + 2] / 255);
      luminanceTotal += (0.2126 * red) + (0.7152 * green) + (0.0722 * blue);
      pixelCount += 1;
    }
  }

  return pixelCount ? luminanceTotal / pixelCount : null;
}

function autoMatch() {
  if (!video.videoWidth) return;
  if (!frozen && !freezeCurrentFrame()) return;

  const meanLuminance = readMeanApertureLuminance();
  if (meanLuminance === null) return;

  const continuousValue = scaleMode === "munsell"
    ? munsellValueForReflectance(meanLuminance)
    : 1 + (linearToSrgb(meanLuminance) * 9);
  const meanValue = Math.max(1, Math.min(10, continuousValue));
  const nearestValue = Math.max(1, Math.min(10, Math.round(meanValue)));

  autoMatchActive = true;
  selectValue(nearestValue, { preserveMean: true });
  badgeLabel.textContent = "Matched";
  meanReading.textContent = `Mean ${scaleMode === "munsell" ? "N" : ""}${meanValue.toFixed(2)}`;
  meanReading.hidden = false;
  setCameraStatus("Auto matched · Frozen");
  navigator.vibrate?.([10, 35, 10]);
}

function updateApertureSize() {
  clearAutoResult();
  document.documentElement.style.setProperty("--aperture-size", `${apertureSizeInput.value}px`);
  document.documentElement.style.setProperty("--aperture-radius", `${apertureSizeInput.value / 2}px`);
  updateBandLayout();
}

function setResponsiveSizeLimit() {
  const maxSize = Math.min(260, window.innerWidth - 40, window.innerHeight * 0.42);
  apertureSizeInput.max = Math.floor(maxSize);
  if (Number(apertureSizeInput.value) > maxSize) {
    apertureSizeInput.value = Math.floor(maxSize);
  }
  updateApertureSize();
}

function clampValue(value) {
  return Math.max(1, Math.min(10, value));
}

function beginScaleDrag(event) {
  if (event.button !== undefined && event.button !== 0) return;
  dragState.active = true;
  dragState.didMove = false;
  dragState.pointerId = event.pointerId;
  dragState.startY = event.clientY;
  dragState.startValue = selectedValue;
  dragState.tapValue = event.target.closest(".value-band")?.dataset.value ?? null;
  valueField.setPointerCapture?.(event.pointerId);
  document.querySelector(".app-shell").classList.add("dragging");
}

function moveScaleDrag(event) {
  if (!dragState.active || event.pointerId !== dragState.pointerId) return;
  const distance = dragState.startY - event.clientY;
  if (Math.abs(distance) > 8) dragState.didMove = true;
  if (!dragState.didMove) return;

  const pixelsPerValue = Math.max(34, window.innerHeight / 18);
  const steps = Math.round(distance / pixelsPerValue);
  const nextValue = clampValue(dragState.startValue + steps);
  if (nextValue !== selectedValue) {
    selectValue(nextValue);
    navigator.vibrate?.(6);
  }
}

function endScaleDrag(event) {
  if (!dragState.active || event.pointerId !== dragState.pointerId) return;
  dragState.active = false;
  valueField.releasePointerCapture?.(event.pointerId);
  document.querySelector(".app-shell").classList.remove("dragging");
  if (!dragState.didMove && dragState.tapValue) {
    selectValue(Number(dragState.tapValue));
  }
  setTimeout(() => {
    dragState.didMove = false;
  }, 0);
}

function scrollScale(event) {
  event.preventDefault();
  wheelAccumulator += event.deltaY;
  clearTimeout(wheelResetTimer);
  wheelResetTimer = setTimeout(() => {
    wheelAccumulator = 0;
  }, 140);

  if (Math.abs(wheelAccumulator) < 28) return;
  const direction = Math.sign(wheelAccumulator);
  wheelAccumulator = 0;
  selectValue(clampValue(selectedValue + direction));
}

function handleScaleKey(event) {
  if (!["ArrowUp", "ArrowDown"].includes(event.key)) return;
  event.preventDefault();
  const direction = event.key === "ArrowDown" ? 1 : -1;
  selectValue(clampValue(selectedValue + direction));
}

standardModeButton.addEventListener("click", () => setScaleMode("standard"));
munsellModeButton.addEventListener("click", () => setScaleMode("munsell"));
cameraModeButton.addEventListener("click", toggleCameraMode);
freezeButton.addEventListener("click", toggleFreeze);
autoMatchButton.addEventListener("click", autoMatch);
apertureSizeInput.addEventListener("input", updateApertureSize);
valueField.addEventListener("pointerdown", beginScaleDrag);
valueField.addEventListener("pointermove", moveScaleDrag);
valueField.addEventListener("pointerup", endScaleDrag);
valueField.addEventListener("pointercancel", endScaleDrag);
valueField.addEventListener("wheel", scrollScale, { passive: false });
valueField.addEventListener("keydown", handleScaleKey);
window.addEventListener("resize", setResponsiveSizeLimit);
new ResizeObserver(updateBandLayout).observe(valueField);
window.addEventListener("beforeunload", () => {
  stream?.getTracks().forEach((track) => track.stop());
});

document.querySelector(".build-label").textContent = BUILD;
renderScale();
setResponsiveSizeLimit();
startCamera();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(console.error);
  });
}
