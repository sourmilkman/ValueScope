const BUILD = "VS-009";
const SAMPLE_SIZE = 96;
const VALUES = Array.from({ length: 10 }, (_, index) => index + 1);
const PROFILE_KEY = "valuescope-colour-profile-v1";
const D65_WHITE = [0.95047, 1, 1.08883];
const C_WHITE = [0.98074, 1, 1.18232];
const PAINTS = [
  { id: "cadmium-yellow-pale", name: "Cadmium Yellow Pale", pigment: "PY35", colour: "#edc52e" },
  { id: "winsor-yellow", name: "Winsor Yellow", pigment: "PY74", colour: "#f2cf31" },
  { id: "yellow-ochre", name: "Yellow Ochre", pigment: "PY43", colour: "#b78132" },
  { id: "cadmium-red", name: "Cadmium Red", pigment: "PR108", colour: "#b7332f" },
  { id: "permanent-rose", name: "Permanent Rose", pigment: "PV19", colour: "#a93262" },
  { id: "burnt-sienna", name: "Burnt Sienna", pigment: "PR101", colour: "#7c3f2b" },
  { id: "french-ultramarine", name: "French Ultramarine", pigment: "PB29", colour: "#314a83" },
  { id: "winsor-blue-green", name: "Winsor Blue (Green Shade)", pigment: "PB15", colour: "#176080" },
  { id: "burnt-umber", name: "Burnt Umber", pigment: "PBr7", colour: "#4b372d" },
  { id: "ivory-black", name: "Ivory Black", pigment: "PBk9", colour: "#171817" },
  { id: "lamp-black", name: "Lamp Black", pigment: "PBk6", colour: "#111211" },
  { id: "titanium-white", name: "Titanium White", pigment: "PW4 · PW6", colour: "#f3f0e5", white: true },
  { id: "zinc-white", name: "Zinc White", pigment: "PW4", colour: "#f4f1e8", white: true }
];
const DEFAULT_PALETTE = [
  "cadmium-yellow-pale",
  "cadmium-red",
  "french-ultramarine",
  "ivory-black",
  "titanium-white"
];

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
const colourModeButton = document.querySelector("#colourMode");
const cameraModeButton = document.querySelector("#cameraModeButton");
const cameraModeLabel = document.querySelector("#cameraModeLabel");
const apertureSizeInput = document.querySelector("#apertureSize");
const freezeButton = document.querySelector("#freezeButton");
const freezeLabel = document.querySelector("#freezeLabel");
const autoMatchButton = document.querySelector("#autoMatchButton");
const autoMatchLabel = document.querySelector("#autoMatchLabel");
const scaleNote = document.querySelector("#scaleNote");
const footerHint = document.querySelector("#footerHint");
const appShell = document.querySelector(".app-shell");
const colourWorkspace = document.querySelector("#colourWorkspace");
const paletteButton = document.querySelector("#paletteButton");
const paletteSummary = document.querySelector("#paletteSummary");
const colourMunsell = document.querySelector("#colourMunsell");
const colourDetails = document.querySelector("#colourDetails");
const sampleSwatch = document.querySelector("#sampleSwatch");
const calibrationCard = document.querySelector("#calibrationCard");
const calibrationProgress = document.querySelector("#calibrationProgress");
const calibrationTitle = document.querySelector("#calibrationTitle");
const calibrationRecipe = document.querySelector("#calibrationRecipe");
const stopCalibrationButton = document.querySelector("#stopCalibration");
const paletteSheet = document.querySelector("#paletteSheet");
const closePaletteButton = document.querySelector("#closePalette");
const paintList = document.querySelector("#paintList");
const sheetProgress = document.querySelector("#sheetProgress");
const sheetProgressLabel = document.querySelector("#sheetProgressLabel");
const startCalibrationButton = document.querySelector("#startCalibration");
const paletteMessage = document.querySelector("#paletteMessage");

let selectedValue = 5;
let scaleMode = "standard";
let workspaceMode = "value";
let cameraMode = "colour";
let stream;
let frozen = false;
let autoMatchActive = false;
let wheelAccumulator = 0;
let wheelResetTimer;
let munsellPoints = [];
let calibrationActive = false;
let colourProfile = loadColourProfile();
const dragState = {
  active: false,
  didMove: false,
  pointerId: null,
  startValue: selectedValue,
  startY: 0,
  tapValue: null
};

function loadColourProfile() {
  try {
    const saved = JSON.parse(localStorage.getItem(PROFILE_KEY));
    if (Array.isArray(saved?.palette) && saved.palette.length === 5) {
      return { palette: saved.palette, profiles: saved.profiles || {} };
    }
  } catch (error) {
    console.warn("Could not read colour profile", error);
  }
  return { palette: [...DEFAULT_PALETTE], profiles: {} };
}

function saveColourProfile() {
  localStorage.setItem(PROFILE_KEY, JSON.stringify(colourProfile));
}

function paletteKey(palette = colourProfile.palette) {
  return [...palette].sort().join("|");
}

function currentMeasurements() {
  const key = paletteKey();
  colourProfile.profiles[key] ||= {};
  return colourProfile.profiles[key];
}

function paintById(id) {
  return PAINTS.find((paint) => paint.id === id);
}

function greatestCommonDivisor(left, right) {
  let a = Math.abs(left);
  let b = Math.abs(right);
  while (b) [a, b] = [b, a % b];
  return a || 1;
}

function partsForPercentages(percentages) {
  const integers = percentages.map((percentage) => Math.round(percentage * 10));
  const divisor = integers.reduce(greatestCommonDivisor);
  return integers.map((value) => value / divisor);
}

function buildCalibrationRecipes() {
  const selectedPaints = colourProfile.palette.map(paintById).filter(Boolean);
  const white = selectedPaints.find((paint) => paint.white);
  const colours = selectedPaints.filter((paint) => !paint.white);
  if (!white || colours.length !== 4) return [];

  const recipes = selectedPaints.map((paint) => ({
    id: `pure:${paint.id}`,
    title: `${paint.name} masstone`,
    ingredients: [{ paint, percentage: 100 }]
  }));

  colours.forEach((dominant) => {
    colours.filter((paint) => paint.id !== dominant.id).forEach((minor) => {
      recipes.push({
        id: `pair:${dominant.id}:${minor.id}`,
        title: `${dominant.name} + ${minor.name}`,
        ingredients: [
          { paint: dominant, percentage: 75 },
          { paint: minor, percentage: 25 }
        ]
      });
    });
  });

  colours.forEach((paint) => {
    recipes.push({
      id: `tint:${paint.id}:${white.id}`,
      title: `${paint.name} tint`,
      ingredients: [
        { paint, percentage: 50 },
        { paint: white, percentage: 50 }
      ]
    });
  });

  colours.forEach((dominant) => {
    colours.filter((paint) => paint.id !== dominant.id).forEach((minor) => {
      recipes.push({
        id: `tri:${dominant.id}:${minor.id}:${white.id}`,
        title: `${dominant.name} light mix`,
        ingredients: [
          { paint: dominant, percentage: 37.5 },
          { paint: minor, percentage: 12.5 },
          { paint: white, percentage: 50 }
        ]
      });
    });
  });

  return recipes;
}

function xyYToXyz(x, y, luminance) {
  if (!y) return [0, 0, 0];
  return [
    (x * luminance) / y,
    luminance,
    ((1 - x - y) * luminance) / y
  ];
}

function xyzToLab(xyz, white) {
  const delta = 6 / 29;
  const transform = (value) => value > delta ** 3
    ? Math.cbrt(value)
    : (value / (3 * (delta ** 2))) + (4 / 29);
  const fx = transform(xyz[0] / white[0]);
  const fy = transform(xyz[1] / white[1]);
  const fz = transform(xyz[2] / white[2]);
  return [(116 * fy) - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

function adaptXyzBradford(xyz, sourceWhite, targetWhite) {
  const matrix = [
    [0.8951, 0.2664, -0.1614],
    [-0.7502, 1.7135, 0.0367],
    [0.0389, -0.0685, 1.0296]
  ];
  const inverse = [
    [0.986993, -0.147054, 0.159963],
    [0.432305, 0.51836, 0.049291],
    [-0.008529, 0.040043, 0.968487]
  ];
  const multiply = (rows, values) => rows.map((row) =>
    row.reduce((total, coefficient, index) => total + (coefficient * values[index]), 0)
  );
  const sourceCone = multiply(matrix, sourceWhite);
  const targetCone = multiply(matrix, targetWhite);
  const cone = multiply(matrix, xyz).map((value, index) =>
    value * (targetCone[index] / sourceCone[index])
  );
  return multiply(inverse, cone);
}

function linearRgbToXyz(red, green, blue) {
  return [
    (0.4124564 * red) + (0.3575761 * green) + (0.1804375 * blue),
    (0.2126729 * red) + (0.7151522 * green) + (0.072175 * blue),
    (0.0193339 * red) + (0.119192 * green) + (0.9503041 * blue)
  ];
}

function deltaE76(first, second) {
  return Math.hypot(
    first[0] - second[0],
    first[1] - second[1],
    first[2] - second[2]
  );
}

async function loadMunsellData() {
  try {
    const response = await fetch("./data/munsell-real.dat");
    if (!response.ok) throw new Error(`Munsell data ${response.status}`);
    const text = await response.text();
    const rows = text.trim().split(/\r?\n/).slice(1);
    munsellPoints = rows.map((row) => {
      const [hue, value, chroma, x, y, luminance] = row.trim().split(/\s+/);
      const xyz = xyYToXyz(Number(x), Number(y), Number(luminance) / 100);
      return {
        notation: `${hue} ${value}/${chroma}`,
        lab: xyzToLab(xyz, C_WHITE)
      };
    });

    for (let value = 1; value <= 10; value += 1) {
      const reflectance = munsellReflectance(value);
      munsellPoints.push({
        notation: `N${value}`,
        lab: xyzToLab(C_WHITE.map((channel) => channel * reflectance), C_WHITE)
      });
    }
  } catch (error) {
    console.error(error);
    paletteMessage.textContent = "Munsell data unavailable; value matching still works.";
  }
}

function nearestMunsell(lab) {
  if (!munsellPoints.length) return null;
  let nearest = null;
  let smallestDifference = Number.POSITIVE_INFINITY;
  munsellPoints.forEach((point) => {
    const difference = deltaE76(lab, point.lab);
    if (difference < smallestDifference) {
      nearest = point;
      smallestDifference = difference;
    }
  });
  return { ...nearest, difference: smallestDifference };
}

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
      const duration = Math.min(1100, Math.max(600, 560 + (travel * 1.9)));
      band.dataset.motion = height > previousHeight ? "expand" : "contract";
      band.style.setProperty("--band-motion-duration", `${Math.round(duration)}ms`);
      band.style.setProperty("--band-motion-delay", `${Math.min(distanceFromSelection, 4) * 12}ms`);
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
  workspaceMode = "value";
  calibrationActive = false;
  scaleMode = mode;
  appShell.classList.remove("colour-mode");
  colourWorkspace.classList.remove("calibrating");
  colourWorkspace.hidden = true;
  calibrationCard.hidden = true;
  standardModeButton.classList.toggle("active", mode === "standard");
  munsellModeButton.classList.toggle("active", mode === "munsell");
  colourModeButton.classList.remove("active");
  cameraModeButton.disabled = false;
  autoMatchLabel.textContent = "Auto match";
  footerHint.textContent = "Tap or slide a value";
  valueField.tabIndex = 0;
  scaleNote.textContent = mode === "munsell"
    ? "Munsell reflectance steps"
    : "Even digital steps";
  renderScale();
  selectedBadge.textContent = `${mode === "munsell" ? "N" : ""}${selectedValue}`;
  setCameraStatus(frozen ? "Frame frozen" : "Rear camera · Live");
}

function setColourMode() {
  clearAutoResult();
  workspaceMode = "colour";
  calibrationActive = false;
  appShell.classList.add("colour-mode");
  colourWorkspace.classList.remove("calibrating");
  colourWorkspace.hidden = false;
  calibrationCard.hidden = true;
  standardModeButton.classList.remove("active");
  munsellModeButton.classList.remove("active");
  colourModeButton.classList.add("active");
  cameraMode = "colour";
  cameraLayer.classList.remove("greyscale");
  cameraModeLabel.textContent = "Colour";
  cameraModeButton.disabled = true;
  autoMatchLabel.textContent = "Sample";
  scaleNote.textContent = "Munsell renotation estimate";
  footerHint.textContent = "Select, sample, then mix";
  valueField.tabIndex = -1;
  updatePaletteSummary();
}

function updatePaletteSummary() {
  const recipes = buildCalibrationRecipes();
  const measured = Object.keys(currentMeasurements()).length;
  paletteSummary.textContent = `${colourProfile.palette.length} tubes · ${measured}/${recipes.length || 33}`;
  sheetProgress.max = recipes.length || 33;
  sheetProgress.value = measured;
  sheetProgressLabel.textContent = `${measured} / ${recipes.length || 33}`;
}

function paletteIsValid() {
  const selected = colourProfile.palette.map(paintById).filter(Boolean);
  return selected.length === 5 &&
    selected.filter((paint) => paint.white).length === 1 &&
    selected.filter((paint) => !paint.white).length === 4;
}

function renderPaletteEditor() {
  paintList.replaceChildren();
  PAINTS.forEach((paint) => {
    const selected = colourProfile.palette.includes(paint.id);
    const option = document.createElement("button");
    option.type = "button";
    option.className = `paint-option${selected ? " selected" : ""}`;
    option.style.setProperty("--paint-colour", paint.colour);
    option.innerHTML = `
      <span class="paint-chip" aria-hidden="true"></span>
      <span class="paint-copy">
        <strong>${paint.name}</strong>
        <small>${paint.pigment}${paint.white ? " · White" : ""}</small>
      </span>
      <span class="paint-check" aria-hidden="true">✓</span>
    `;
    option.setAttribute("aria-pressed", String(selected));
    option.addEventListener("click", () => togglePaint(paint.id));
    paintList.append(option);
  });

  const valid = paletteIsValid();
  const measured = Object.keys(currentMeasurements()).length;
  startCalibrationButton.disabled = !valid;
  startCalibrationButton.textContent = measured
    ? `Continue calibration · ${measured}/33`
    : "Start 33-swatch calibration";
  paletteMessage.textContent = valid
    ? "Measurements are saved automatically on this device."
    : "Choose exactly four colours and one white.";
  updatePaletteSummary();
}

function togglePaint(id) {
  const index = colourProfile.palette.indexOf(id);
  if (index >= 0) {
    colourProfile.palette.splice(index, 1);
  } else if (colourProfile.palette.length < 5) {
    colourProfile.palette.push(id);
  } else {
    paletteMessage.textContent = "Remove one tube before adding another.";
    return;
  }
  saveColourProfile();
  renderPaletteEditor();
}

function openPaletteSheet() {
  renderPaletteEditor();
  paletteSheet.hidden = false;
}

function closePaletteSheet() {
  paletteSheet.hidden = true;
}

function nextCalibrationRecipe() {
  const measurements = currentMeasurements();
  return buildCalibrationRecipes().find((recipe) => !measurements[recipe.id]) || null;
}

function renderCalibrationStep() {
  const recipes = buildCalibrationRecipes();
  const measurements = currentMeasurements();
  const recipe = nextCalibrationRecipe();
  const completed = Object.keys(measurements).length;
  updatePaletteSummary();

  if (!recipe) {
    calibrationActive = false;
    colourWorkspace.classList.remove("calibrating");
    calibrationCard.hidden = true;
    autoMatchLabel.textContent = "Sample";
    colourMunsell.textContent = "Palette calibrated";
    colourDetails.textContent = "33 swatches recorded · recipe modelling is ready";
    setCameraStatus("Palette calibration complete");
    navigator.vibrate?.([20, 50, 20]);
    return;
  }

  calibrationProgress.textContent = `Swatch ${completed + 1} of ${recipes.length}`;
  calibrationTitle.textContent = recipe.title;
  const parts = partsForPercentages(recipe.ingredients.map(({ percentage }) => percentage));
  calibrationRecipe.innerHTML = recipe.ingredients.map(({ paint, percentage }, index) => `
    <span class="recipe-part">${paint.name} · ${percentage}% · ${(percentage / 100).toFixed(3)}g · ${parts[index]} part${parts[index] === 1 ? "" : "s"}</span>
  `).join("");
}

function startCalibration() {
  if (!paletteIsValid()) return;
  calibrationActive = true;
  closePaletteSheet();
  colourWorkspace.classList.add("calibrating");
  calibrationCard.hidden = false;
  autoMatchLabel.textContent = "Record";
  renderCalibrationStep();
  setCameraStatus("Calibration · Frame the swatch");
}

function stopCalibration() {
  calibrationActive = false;
  colourWorkspace.classList.remove("calibrating");
  calibrationCard.hidden = true;
  autoMatchLabel.textContent = "Sample";
  setCameraStatus(frozen ? "Frame frozen" : "Rear camera · Live");
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

function readMeanApertureColour() {
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
  let redTotal = 0;
  let greenTotal = 0;
  let blueTotal = 0;
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
      redTotal += red;
      greenTotal += green;
      blueTotal += blue;
      pixelCount += 1;
    }
  }

  if (!pixelCount) return null;
  const linear = [redTotal / pixelCount, greenTotal / pixelCount, blueTotal / pixelCount];
  const rgb = linear.map((channel) => clampChannel(linearToSrgb(channel) * 255));
  const xyzD65 = linearRgbToXyz(...linear);
  const xyzC = adaptXyzBradford(xyzD65, D65_WHITE, C_WHITE);
  return {
    linear,
    rgb,
    hex: `#${rgb.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`,
    luminance: xyzD65[1],
    labD65: xyzToLab(xyzD65, D65_WHITE),
    labC: xyzToLab(xyzC, C_WHITE)
  };
}

function readMeanApertureLuminance() {
  return readMeanApertureColour()?.luminance ?? null;
}

function displayColourSample(sample) {
  const nearest = nearestMunsell(sample.labC);
  sampleSwatch.style.background = sample.hex;
  colourMunsell.textContent = nearest
    ? `${nearest.notation} · nearest chip`
    : "Munsell data loading";
  colourDetails.textContent = `${sample.hex.toUpperCase()} · Lab ${sample.labD65.map((channel) => channel.toFixed(1)).join(" ")}`;
}

function resumeLiveFrame() {
  if (!frozen) return;
  frozen = false;
  freezeCanvas.classList.remove("visible");
  freezeLabel.textContent = "Freeze";
}

function sampleColour() {
  if (!video.videoWidth) return;
  if (!frozen && !freezeCurrentFrame()) return;
  const sample = readMeanApertureColour();
  if (!sample) return;

  displayColourSample(sample);
  if (calibrationActive) {
    const recipe = nextCalibrationRecipe();
    if (!recipe) return;
    currentMeasurements()[recipe.id] = {
      rgb: sample.rgb,
      labD65: sample.labD65.map((channel) => Number(channel.toFixed(4))),
      labC: sample.labC.map((channel) => Number(channel.toFixed(4))),
      capturedAt: new Date().toISOString()
    };
    saveColourProfile();
    resumeLiveFrame();
    renderCalibrationStep();
    setCameraStatus("Recorded · Prepare next swatch");
    navigator.vibrate?.(12);
    return;
  }

  const measured = Object.keys(currentMeasurements()).length;
  colourDetails.textContent += measured === 33
    ? " · calibrated palette ready"
    : ` · recipe calibration ${measured}/33`;
  setCameraStatus("Colour sampled · Frozen");
  navigator.vibrate?.([10, 35, 10]);
}

function autoMatch() {
  if (workspaceMode === "colour") {
    sampleColour();
    return;
  }
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
  if (workspaceMode !== "value") return;
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
  if (workspaceMode !== "value") return;
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
  if (workspaceMode !== "value") return;
  if (!["ArrowUp", "ArrowDown"].includes(event.key)) return;
  event.preventDefault();
  const direction = event.key === "ArrowDown" ? 1 : -1;
  selectValue(clampValue(selectedValue + direction));
}

standardModeButton.addEventListener("click", () => setScaleMode("standard"));
munsellModeButton.addEventListener("click", () => setScaleMode("munsell"));
colourModeButton.addEventListener("click", setColourMode);
cameraModeButton.addEventListener("click", toggleCameraMode);
freezeButton.addEventListener("click", toggleFreeze);
autoMatchButton.addEventListener("click", autoMatch);
paletteButton.addEventListener("click", openPaletteSheet);
closePaletteButton.addEventListener("click", closePaletteSheet);
paletteSheet.querySelector("[data-close-sheet]").addEventListener("click", closePaletteSheet);
startCalibrationButton.addEventListener("click", startCalibration);
stopCalibrationButton.addEventListener("click", stopCalibration);
apertureSizeInput.addEventListener("input", updateApertureSize);
valueField.addEventListener("pointerdown", beginScaleDrag);
valueField.addEventListener("pointermove", moveScaleDrag);
valueField.addEventListener("pointerup", endScaleDrag);
valueField.addEventListener("pointercancel", endScaleDrag);
valueField.addEventListener("wheel", scrollScale, { passive: false });
valueField.addEventListener("keydown", handleScaleKey);
window.addEventListener("resize", setResponsiveSizeLimit);
window.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !paletteSheet.hidden) closePaletteSheet();
});
new ResizeObserver(updateBandLayout).observe(valueField);
window.addEventListener("beforeunload", () => {
  stream?.getTracks().forEach((track) => track.stop());
});

document.querySelector(".build-label").textContent = BUILD;
renderScale();
setResponsiveSizeLimit();
updatePaletteSummary();
loadMunsellData();
startCamera();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(console.error);
  });
}
