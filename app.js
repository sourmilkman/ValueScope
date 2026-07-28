const BUILD = "VS-002";
const VALUES = Array.from({ length: 10 }, (_, index) => index + 1);

const valueField = document.querySelector("#valueField");
const comparisonField = document.querySelector("#comparisonField");
const comparisonLabel = document.querySelector("#comparisonLabel");
const aperture = document.querySelector("#aperture");
const video = document.querySelector("#camera");
const freezeCanvas = document.querySelector("#freezeCanvas");
const freezeContext = freezeCanvas.getContext("2d");
const selectedBadge = document.querySelector("#selectedBadge strong");
const cameraStatus = document.querySelector("#cameraStatus");
const standardModeButton = document.querySelector("#standardMode");
const munsellModeButton = document.querySelector("#munsellMode");
const cameraModeButton = document.querySelector("#cameraModeButton");
const cameraModeLabel = document.querySelector("#cameraModeLabel");
const apertureSizeInput = document.querySelector("#apertureSize");
const freezeButton = document.querySelector("#freezeButton");
const freezeLabel = document.querySelector("#freezeLabel");
const scaleNote = document.querySelector("#scaleNote");

let selectedValue = 5;
let scaleMode = "standard";
let cameraMode = "colour";
let stream;
let frozen = false;

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
    band.addEventListener("click", () => selectValue(value));
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
  const halfRemainder = (viewportHeight - centralHeight) / 2;
  const topCount = selectedValue - 1;
  const bottomCount = 10 - selectedValue;
  const topHeight = topCount ? halfRemainder / topCount : 0;
  const bottomHeight = bottomCount ? halfRemainder / bottomCount : 0;

  bands.forEach((band) => {
    const value = Number(band.dataset.value);
    let height;

    if (value < selectedValue) {
      height = topHeight;
    } else if (value > selectedValue) {
      height = bottomHeight;
    } else {
      height = centralHeight;
      if (!topCount) height += halfRemainder;
      if (!bottomCount) height += halfRemainder;
    }

    band.style.height = `${height}px`;
    band.classList.toggle("selected", value === selectedValue);
    band.classList.toggle("compact", height < 34);
  });
}

function selectValue(value) {
  selectedValue = value;
  selectedBadge.textContent = `${scaleMode === "munsell" ? "N" : ""}${value}`;
  updateBandLayout();
  updateComparisonField();
}

function setScaleMode(mode) {
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
  aperture.classList.toggle("greyscale", cameraMode === "greyscale");
  cameraModeLabel.textContent = cameraMode === "colour" ? "Colour" : "B&W";
}

function toggleFreeze() {
  if (!video.videoWidth) return;
  frozen = !frozen;

  if (frozen) {
    freezeCanvas.width = video.videoWidth;
    freezeCanvas.height = video.videoHeight;
    freezeContext.drawImage(video, 0, 0);
    freezeCanvas.classList.add("visible");
    freezeLabel.textContent = "Resume";
    setCameraStatus("Frame frozen");
  } else {
    freezeCanvas.classList.remove("visible");
    freezeLabel.textContent = "Freeze";
    setCameraStatus("Rear camera · Live");
  }
}

function updateApertureSize() {
  document.documentElement.style.setProperty("--aperture-size", `${apertureSizeInput.value}px`);
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

standardModeButton.addEventListener("click", () => setScaleMode("standard"));
munsellModeButton.addEventListener("click", () => setScaleMode("munsell"));
cameraModeButton.addEventListener("click", toggleCameraMode);
freezeButton.addEventListener("click", toggleFreeze);
apertureSizeInput.addEventListener("input", updateApertureSize);
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
