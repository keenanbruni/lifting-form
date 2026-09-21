import {
  DEFAULTS, MEASURED_KEYS, deriveModel, solvePose, stageAt, timelineToFlexion, trajectory,
} from "./biomech.js";

const $ = selector => document.querySelector(selector);
const svg = $("#squatSvg");
const layers = Object.fromEntries(["paths", "guides", "body", "labels", "front"].map(name =>
  [name, $(`#${name}Layer`)]));

const state = {
  anthro: { ...DEFAULTS.anthropometry },
  settings: { ...DEFAULTS.settings },
  guides: { barPath: true, midfoot: true, hipPath: false, kneePath: false, segmentAngles: true, jointAngles: true },
  time: 0,
  playing: !matchMedia("(prefers-reduced-motion: reduce)").matches,
  lastFrame: performance.now(),
  trajectoryKey: "",
  poses: [],
};

const anthropometryFields = [
  ["height", "Height", "in"], ["weight", "Body weight", "lb"],
  ["crestHeight", "Floor → iliac crest", "in"], ["thigh", "Trochanter → knee", "in"],
  ["shank", "Knee → ankle", "in"], ["sittingHeight", "Sitting height", "in"],
  ["crestToShoulder", "Iliac crest → shoulder", "in"], ["arm", "Armpit → fingertip", "in"],
  ["footLength", "Foot length", "in"], ["hipToCrest", "Hip center → crest", "in"],
  ["seatToHip", "Seat surface → hip center", "in"],
  ["hipWidth", "Hip width", "in"], ["shoulderWidth", "Shoulder width", "in"],
];

function buildAnthropometryInputs() {
  $("#anthroInputs").innerHTML = anthropometryFields.map(([key, label, unit]) => `
    <label class="${MEASURED_KEYS.has(key) ? "measured" : "estimated"}">
      <span>${label}</span>
      <input type="number" data-anthro="${key}" value="${state.anthro[key]}" min="1" max="400" step="0.1">
      <span class="unit">${unit}</span>
    </label>`).join("");
}

function p(x, y) { return { x: 300 + x * 6.5, y: 590 - y * 6.5 }; }
const fmt = number => Number(number).toFixed(1);
const point = value => `${fmt(value.x)},${fmt(value.y)}`;

function line(a, b, attrs = "") {
  return `<line x1="${fmt(a.x)}" y1="${fmt(a.y)}" x2="${fmt(b.x)}" y2="${fmt(b.y)}" ${attrs}/>`;
}

function polyline(points, attrs = "") {
  return `<polyline points="${points.map(point).join(" ")}" ${attrs}/>`;
}

function currentTrajectory() {
  const key = JSON.stringify([state.anthro, state.settings.depth, state.settings.stance,
    state.settings.toeAngle, state.settings.barPosition, state.settings.dorsiflexion,
    state.settings.heelElevation]);
  if (key !== state.trajectoryKey) {
    state.trajectoryKey = key;
    state.poses = trajectory(state.anthro, state.settings);
  }
  return state.poses;
}

function renderPaths(poses) {
  const path = joint => poses.map(pose => p(pose.joints[joint].x, pose.joints[joint].y));
  const parts = [];
  if (state.guides.barPath) {
    parts.push(line(p(0, 0), p(0, 80), 'stroke="#d8ff65" stroke-width="1.5" stroke-dasharray="7 7" opacity=".65"'));
    parts.push('<text x="307" y="88" fill="#d8ff65" font-size="11" font-family="ui-monospace, monospace">BAR / MIDFOOT LINE</text>');
  }
  if (state.guides.hipPath) parts.push(polyline(path("hip"), 'fill="none" stroke="#ff7849" stroke-width="2" stroke-dasharray="3 5" opacity=".75"'));
  if (state.guides.kneePath) parts.push(polyline(path("knee"), 'fill="none" stroke="#68d6da" stroke-width="2" stroke-dasharray="3 5" opacity=".75"'));
  layers.paths.innerHTML = parts.join("");
}

function renderSide(pose) {
  const { joints, model, angles } = pose;
  const ankle = p(joints.ankle.x, joints.ankle.y);
  const knee = p(joints.knee.x, joints.knee.y);
  const hip = p(joints.hip.x, joints.hip.y);
  const shoulder = p(joints.shoulder.x, joints.shoulder.y);
  const head = p(joints.head.x, joints.head.y);
  const bar = p(joints.bar.x, joints.bar.y);
  const heel = p(-model.projectedFoot / 2, 0);
  const toe = p(model.projectedFoot / 2, 0);
  const heelTop = p(-model.projectedFoot / 2, state.settings.heelElevation + 1.1);
  const toeTop = p(model.projectedFoot / 2, .65);
  const plateRadius = 8 + Math.min(4.5, Math.max(0, (state.settings.load - 45) / 100));
  const torsoAngle = angles.torso * Math.PI / 180;
  const elbow = {
    x: shoulder.x - 6.5 * (2.4 + 2.5 * Math.cos(torsoAngle)),
    y: shoulder.y + 6.5 * 7.5,
  };
  const hand = { x: bar.x + 8, y: bar.y + 5 };

  layers.body.innerHTML = `
    <text x="24" y="36" fill="#91a0a2" font-size="12" font-family="ui-monospace, monospace">SIDE VIEW</text>
    ${line({ x: 22, y: 590 }, { x: 568, y: 590 }, 'stroke="#617073" stroke-width="2"')}
    <polygon points="${point(heel)} ${point(toe)} ${point(toeTop)} ${point(heelTop)}" fill="#20292b" stroke="#849295" stroke-width="2"/>
    <polygon points="${point(heel)} ${point(heelTop)} ${point(toeTop)} ${point(toe)}" fill="#d8ff65" opacity="${state.settings.heelElevation ? ".13" : ".03"}"/>
    ${line(ankle, knee, 'stroke="#d8dfdd" stroke-width="15" stroke-linecap="round"')}
    ${line(knee, hip, 'stroke="#eef2ef" stroke-width="19" stroke-linecap="round"')}
    ${line(hip, shoulder, 'stroke="#cfd7d5" stroke-width="25" stroke-linecap="round"')}
    ${line(shoulder, elbow, 'stroke="#aab5b3" stroke-width="9" stroke-linecap="round"')}
    ${line(elbow, hand, 'stroke="#aab5b3" stroke-width="8" stroke-linecap="round"')}
    <circle cx="${fmt(head.x)}" cy="${fmt(head.y)}" r="24" fill="#dce3e1"/>
    <circle cx="${fmt(head.x + 15)}" cy="${fmt(head.y - 2)}" r="2.5" fill="#111718"/>
    <circle cx="${fmt(bar.x)}" cy="${fmt(bar.y)}" r="${fmt(plateRadius * 6.5)}" fill="#111718" stroke="#d8ff65" stroke-width="5" opacity=".94"/>
    <circle cx="${fmt(bar.x)}" cy="${fmt(bar.y)}" r="10" fill="#d8ff65"/>
    <circle cx="${fmt(bar.x)}" cy="${fmt(bar.y)}" r="4" fill="#111718"/>
    ${[ankle, knee, hip, shoulder].map((joint, i) => `<circle cx="${fmt(joint.x)}" cy="${fmt(joint.y)}" r="${i === 3 ? 5 : 7}" fill="#ff7849" stroke="#111718" stroke-width="3"/>`).join("")}
  `;

  const guides = [];
  if (state.guides.midfoot) {
    guides.push('<path d="M292 590h16l-8-13z" fill="#d8ff65" filter="url(#softGlow)"/>');
    guides.push('<text x="300" y="614" text-anchor="middle" fill="#d8ff65" font-size="11" font-family="ui-monospace, monospace">MIDFOOT</text>');
  }
  if (state.guides.segmentAngles) {
    guides.push(line({ x: knee.x, y: knee.y + 84 }, { x: knee.x, y: knee.y - 84 }, 'stroke="#68d6da" stroke-width="1" stroke-dasharray="4 5" opacity=".55"'));
    guides.push(line({ x: hip.x, y: hip.y + 100 }, { x: hip.x, y: hip.y - 100 }, 'stroke="#ff7849" stroke-width="1" stroke-dasharray="4 5" opacity=".55"'));
    guides.push(`<text x="${fmt(knee.x + 8)}" y="${fmt(knee.y - 56)}" fill="#68d6da" font-size="11">SHIN ${fmt(angles.shin)}°</text>`);
    guides.push(`<text x="${fmt(hip.x + 8)}" y="${fmt(hip.y - 70)}" fill="#ff9a76" font-size="11">TORSO ${fmt(angles.torso)}°</text>`);
  }
  layers.guides.innerHTML = guides.join("");

  const labels = [];
  if (state.guides.jointAngles) {
    labels.push(`<g class="joint-label"><rect x="${fmt(knee.x + 10)}" y="${fmt(knee.y + 9)}" width="59" height="22" rx="6" fill="#0b0f10"/><text x="${fmt(knee.x + 17)}" y="${fmt(knee.y + 24)}" fill="#f2f6f3" font-size="11">K ${fmt(angles.knee)}°</text></g>`);
    labels.push(`<g class="joint-label"><rect x="${fmt(hip.x - 70)}" y="${fmt(hip.y + 9)}" width="62" height="22" rx="6" fill="#0b0f10"/><text x="${fmt(hip.x - 63)}" y="${fmt(hip.y + 24)}" fill="#f2f6f3" font-size="11">H ${fmt(angles.hip)}°</text></g>`);
    labels.push(`<g class="joint-label"><rect x="${fmt(ankle.x - 63)}" y="${fmt(ankle.y - 35)}" width="57" height="22" rx="6" fill="#0b0f10"/><text x="${fmt(ankle.x - 56)}" y="${fmt(ankle.y - 20)}" fill="#f2f6f3" font-size="11">A ${fmt(angles.ankle)}°</text></g>`);
  }
  layers.labels.innerHTML = labels.join("");
}

function renderFront(pose) {
  const cx = 662;
  const s = 3.55;
  const ground = 590;
  const y = inches => ground - inches * 6.5;
  const flex = pose.flexion;
  const halfStance = state.settings.stance * s / 2;
  const halfHip = state.anthro.hipWidth * s / 2;
  const halfShoulder = state.anthro.shoulderWidth * s / 2;
  const kneeOut = halfHip + (halfStance - halfHip) * (.25 + .7 * flex);
  const ankleY = y(pose.joints.ankle.y);
  const kneeY = y(pose.joints.knee.y);
  const hipY = y(pose.joints.hip.y);
  const shoulderY = y(pose.joints.shoulder.y);
  const barY = y(pose.joints.bar.y);
  const toeOut = Math.sin(state.settings.toeAngle * Math.PI / 180) * state.anthro.footLength * s * .55;
  const plateSize = 13 + Math.min(9, Math.max(0, (state.settings.load - 45) / 55));

  layers.front.innerHTML = `
    ${line({ x: 585, y: 22 }, { x: 585, y: 620 }, 'stroke="#293436" stroke-width="1"')}
    <text x="606" y="36" fill="#91a0a2" font-size="12" font-family="ui-monospace, monospace">FRONT VIEW</text>
    ${line({ x: 596, y: ground }, { x: 744, y: ground }, 'stroke="#617073" stroke-width="2"')}
    ${[-1, 1].map(side => `
      ${line({ x: cx + side * halfStance, y: ground - 3 }, { x: cx + side * (halfStance + toeOut), y: ground - 30 }, 'stroke="#849295" stroke-width="11" stroke-linecap="round"')}
      ${line({ x: cx + side * halfStance, y: ankleY }, { x: cx + side * kneeOut, y: kneeY }, 'stroke="#d8dfdd" stroke-width="9" stroke-linecap="round"')}
      ${line({ x: cx + side * kneeOut, y: kneeY }, { x: cx + side * halfHip, y: hipY }, 'stroke="#eef2ef" stroke-width="12" stroke-linecap="round"')}
      <circle cx="${fmt(cx + side * kneeOut)}" cy="${fmt(kneeY)}" r="5" fill="#ff7849"/>
    `).join("")}
    ${line({ x: cx - halfHip, y: hipY }, { x: cx + halfHip, y: hipY }, 'stroke="#cfd7d5" stroke-width="18" stroke-linecap="round"')}
    ${line({ x: cx, y: hipY }, { x: cx, y: shoulderY }, 'stroke="#cfd7d5" stroke-width="25" stroke-linecap="round"')}
    ${line({ x: cx - halfShoulder, y: shoulderY }, { x: cx + halfShoulder, y: shoulderY }, 'stroke="#cfd7d5" stroke-width="16" stroke-linecap="round"')}
    <circle cx="${cx}" cy="${fmt(shoulderY - 43)}" r="20" fill="#dce3e1"/>
    ${line({ x: 600, y: barY }, { x: 724, y: barY }, 'stroke="#d8ff65" stroke-width="6"')}
    <rect x="594" y="${fmt(barY - plateSize)}" width="10" height="${fmt(plateSize * 2)}" rx="3" fill="#d8ff65"/>
    <rect x="720" y="${fmt(barY - plateSize)}" width="10" height="${fmt(plateSize * 2)}" rx="3" fill="#d8ff65"/>
    <text x="662" y="618" text-anchor="middle" fill="#91a0a2" font-size="10">KNEES TRACK WITH FEET</text>
  `;
}

function updateReadouts(pose) {
  const { angles, model } = pose;
  $("#stage").textContent = stageAt(state.time);
  $("#positionReadout").textContent = `${state.settings.barPosition === "high" ? "High-bar" : "Low-bar"} · ${state.settings.load} lb`;
  $("#timeline").value = Math.round(state.time * 1000);
  $("#timelineOutput").value = `${Math.round(state.time * 100)}%`;
  $("#torsoAngle").textContent = `${fmt(angles.torso)}°`;
  $("#shinAngle").textContent = `${fmt(angles.shin)}°`;
  $("#kneeAngle").textContent = `${fmt(angles.knee)}°`;
  $("#hipAngle").textContent = `${fmt(angles.hip)}°`;
  $("#ankleAngle").textContent = `${fmt(angles.ankle)}°`;
  $("#balanceBadge").textContent = `BAR ${pose.barError >= 0 ? "+" : ""}${fmt(pose.barError)} IN`;
  $("#derivedNote").textContent = `Derived for the standing model: ankle height ${fmt(model.ankleHeight)} in, hip → shoulder ${fmt(model.torso)} in, shoulder → head ${fmt(model.shoulderToHead)} in. Estimated offsets are editable because external landmarks are not joint centers.`;
}

function updateExplanation() {
  const bottom = solvePose(state.anthro, state.settings, 1);
  const flat = solvePose(state.anthro, { ...state.settings, heelElevation: 0 }, 1);
  const high = solvePose(state.anthro, { ...state.settings, barPosition: "high" }, 1);
  const low = solvePose(state.anthro, { ...state.settings, barPosition: "low" }, 1);
  const ratio = state.anthro.shank / state.anthro.thigh;
  const items = [];

  if (ratio > 1.03) items.push(`Your lower-leg measurement is ${fmt(ratio)}× your thigh measurement. This solution uses that relatively long segment for forward knee travel while the heel stays planted.`);
  else items.push(`Your entered thigh-to-lower-leg ratio is ${fmt(1 / ratio)}×. The solver balances knee travel with hip travel rather than enforcing a generic knee limit.`);

  if (state.settings.heelElevation > 0) {
    const reduction = flat.angles.ankle - bottom.angles.ankle;
    items.push(`The ${state.settings.heelElevation} in heel adds ${fmt(bottom.model.footPitch)}° of effective foot pitch. Here it changes shin geometry and reduces modeled dorsiflexion by ${fmt(Math.max(0, reduction))}° versus flat.`);
  } else items.push(`With a flat heel, the bottom position asks for ${fmt(bottom.angles.ankle)}° of modeled dorsiflexion.`);

  if (state.settings.barPosition === "low") items.push(`Low-bar places the bar lower and farther behind the torso. The midfoot constraint produces ${fmt(low.angles.torso - high.angles.torso)}° more forward torso inclination than high-bar in this setup.`);
  else items.push(`High-bar keeps the bar higher on the torso. In this setup, low-bar would require ${fmt(low.angles.torso - high.angles.torso)}° more forward torso inclination at the bottom.`);

  if (bottom.limits.ankleLimited) items.push(`Ankle availability is the active limit. The solver caps shin travel at ${fmt(bottom.angles.shin)}° and lets the hip move farther back; another valid stance strategy could distribute this differently.`);
  else items.push(`At the bottom, the hip proxy is ${fmt(Math.abs(bottom.limits.hipAboveKnee))} in ${bottom.limits.hipAboveKnee < 0 ? "below" : "above"} the knee center and the bar is ${fmt(Math.abs(bottom.barError))} in from midfoot.`);

  $("#explanationText").innerHTML = `<ul>${items.map(item => `<li>${item}</li>`).join("")}</ul>`;
}

function render() {
  const poses = currentTrajectory();
  const pose = solvePose(state.anthro, state.settings, timelineToFlexion(state.time));
  renderPaths(poses);
  renderSide(pose);
  renderFront(pose);
  updateReadouts(pose);
}

function syncControls() {
  Object.entries(state.settings).forEach(([key, value]) => {
    const input = document.querySelector(`[data-setting="${key}"]`);
    if (input) input.value = value;
  });
  document.querySelector(`input[name="barPosition"][value="${state.settings.barPosition}"]`).checked = true;
  document.querySelectorAll("[data-anthro]").forEach(input => { input.value = state.anthro[input.dataset.anthro]; });
  $("#depthOut").value = `${Math.round(state.settings.depth * 100)}%`;
  $("#stanceOut").value = `${state.settings.stance} in`;
  $("#toeAngleOut").value = `${state.settings.toeAngle}°`;
  $("#dorsiflexionOut").value = `${state.settings.dorsiflexion}°`;
  $("#speedOut").value = `${Number(state.settings.speed).toFixed(2).replace(/0$/, "")}×`;
}

function setPlaying(playing) {
  state.playing = playing;
  $("#playIcon").textContent = playing ? "Ⅱ" : "▶";
  $("#playPause").setAttribute("aria-label", playing ? "Pause animation" : "Play animation");
}

document.addEventListener("input", event => {
  const input = event.target;
  if (input.dataset.setting) {
    const key = input.dataset.setting;
    state.settings[key] = input.type === "number" || input.type === "range" || input.tagName === "SELECT"
      ? Number(input.value) : input.value;
    state.trajectoryKey = "";
    syncControls();
    updateExplanation();
    render();
  }
  if (input.dataset.anthro) {
    const value = Number(input.value);
    if (Number.isFinite(value) && value > 0) state.anthro[input.dataset.anthro] = value;
    state.trajectoryKey = "";
    updateExplanation();
    render();
  }
  if (input.dataset.guide) {
    state.guides[input.dataset.guide] = input.checked;
    render();
  }
  if (input.id === "timeline") {
    state.time = Number(input.value) / 1000;
    setPlaying(false);
    render();
  }
});

document.addEventListener("change", event => {
  if (event.target.name === "barPosition") {
    state.settings.barPosition = event.target.value;
    state.trajectoryKey = "";
    updateExplanation();
    render();
  }
});

$("#playPause").addEventListener("click", () => setPlaying(!state.playing));
$("#reset").addEventListener("click", () => {
  state.anthro = { ...DEFAULTS.anthropometry };
  state.settings = { ...DEFAULTS.settings };
  state.time = 0;
  state.trajectoryKey = "";
  setPlaying(true);
  syncControls();
  updateExplanation();
  render();
});

function animate(now) {
  const elapsed = Math.min(100, now - state.lastFrame);
  state.lastFrame = now;
  if (state.playing) {
    state.time = (state.time + elapsed / 6000 * state.settings.speed) % 1;
    render();
  }
  requestAnimationFrame(animate);
}

buildAnthropometryInputs();
syncControls();
setPlaying(state.playing);
updateExplanation();
render();
requestAnimationFrame(animate);
