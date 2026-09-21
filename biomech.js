/**
 * 2D articulated squat model.
 *
 * Coordinates are inches: +x is forward (toward the toes), +y is up, and
 * midfoot is x=0. External tape measurements are kept as entered. Estimated
 * offsets bridge those landmarks to a deliberately approximate joint model.
 */

export const DEFAULTS = Object.freeze({
  anthropometry: {
    height: 76,
    weight: 195,
    crestHeight: 43.5,
    thigh: 17,
    shank: 18,
    sittingHeight: 39,
    crestToShoulder: 20,
    arm: 30,
    footLength: 12.5,
    hipToCrest: 3.5,
    seatToHip: 3,
    hipWidth: 14.5,
    shoulderWidth: 19,
  },
  settings: {
    depth: 1,
    stance: 18,
    toeAngle: 20,
    barPosition: "high",
    dorsiflexion: 30,
    heelElevation: 0.75,
    load: 225,
    speed: 1,
  },
});

export const MEASURED_KEYS = new Set([
  "height", "weight", "crestHeight", "thigh", "shank", "sittingHeight",
  "crestToShoulder", "arm",
]);

const DEG = Math.PI / 180;
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const degrees = radians => radians / DEG;

export function deriveModel(anthro, settings) {
  const toe = settings.toeAngle * DEG;
  const projectedFoot = anthro.footLength * Math.cos(toe);
  const halfLateralShift = Math.abs(settings.stance - anthro.hipWidth) / 2;

  // Stance width is a frontal-plane choice. It shortens the femur's visible
  // sagittal projection while preserving the entered 3D segment length.
  const femurSagittal = Math.sqrt(Math.max(anthro.thigh ** 2 - halfLateralShift ** 2, 1));
  const landmarkTorso = anthro.hipToCrest + anthro.crestToShoulder;
  const standingShoulderToHead = Math.max(7, anthro.height - anthro.crestHeight - anthro.crestToShoulder);
  const sittingTorso = Math.max(14, anthro.sittingHeight - anthro.seatToHip - standingShoulderToHead);
  // The directly measured crest-to-shoulder span dominates. Sitting height is
  // a secondary check so a tall lifter is not modeled with a generic short torso.
  const torso = landmarkTorso * 0.7 + sittingTorso * 0.3;
  const ankleHeight = Math.max(
    2.5,
    anthro.crestHeight - anthro.hipToCrest - anthro.thigh - anthro.shank,
  );
  const shoulderToHead = standingShoulderToHead;
  const footPitch = degrees(Math.atan2(settings.heelElevation, anthro.footLength * 0.72));

  return {
    ...anthro,
    projectedFoot,
    femurSagittal,
    lateralFemurShift: halfLateralShift,
    torso,
    ankleHeight,
    shoulderToHead,
    footPitch,
    // The lateral malleolus sits aft of the geometric center of the foot.
    ankleX: (0.28 - 0.5) * projectedFoot,
  };
}

function angleBetween(a, b) {
  const dot = a.x * b.x + a.y * b.y;
  const lengths = Math.hypot(a.x, a.y) * Math.hypot(b.x, b.y);
  return degrees(Math.acos(clamp(dot / lengths, -1, 1)));
}

function solveTorso(hip, torsoLength, barPosition) {
  const low = barPosition === "low";
  const along = torsoLength * (low ? 0.89 : 0.985);
  const behind = low ? 1.8 : 1.05;

  // Bar x = hip x + along·sin(a) - behind·cos(a). Solve analytically for
  // torso angle a, then clamp only if the requested chain cannot reach x=0.
  const radius = Math.hypot(along, behind);
  const phase = Math.atan2(behind, along);
  const requested = clamp(-hip.x / radius, -1, 1);
  const torsoAngle = clamp(degrees(Math.asin(requested) + phase), -5, 70);
  const a = torsoAngle * DEG;
  const axis = { x: Math.sin(a), y: Math.cos(a) };
  const back = { x: -Math.cos(a), y: Math.sin(a) };
  const shoulder = {
    x: hip.x + torsoLength * axis.x,
    y: hip.y + torsoLength * axis.y,
  };
  const bar = {
    x: hip.x + along * axis.x + behind * back.x,
    y: hip.y + along * axis.y + behind * back.y,
  };
  return { shoulder, bar, torsoAngle, along, behind };
}

/** Solve one articulated pose at flexion 0..1. */
export function solvePose(anthro, settings, flexion) {
  const model = deriveModel(anthro, settings);
  const f = clamp(flexion, 0, 1);

  // Depth controls the bottom hip-to-knee height difference. At the default,
  // the hip joint/crease proxy is just below the modeled knee center.
  const bottomHipAboveKnee = clamp(4.5 - 15 * (settings.depth - 0.65), -3, 5);
  const bottomFemurAngle = degrees(Math.acos(clamp(
    bottomHipAboveKnee / model.femurSagittal,
    -0.99,
    0.99,
  )));

  // Heel pitch contributes effective ankle range. This default solution uses
  // part of that extra range for knee travel and part to reduce dorsiflexion.
  const preferredShin = 20 + 11.5 * settings.depth + 0.4 * model.footPitch;
  const reachableShin = settings.dorsiflexion + model.footPitch;
  const bottomShinAngle = clamp(Math.min(preferredShin, reachableShin), 5, 42);

  // A small whole-leg inclination places the standing hip over the support
  // area without flexing the knee. Interpolating rotations (not point
  // positions) from there preserves rigid links throughout the repetition.
  const standingLegAngle = 4;
  const shinAngle = standingLegAngle + (bottomShinAngle - standingLegAngle) * f;
  const femurAngle = -standingLegAngle + (bottomFemurAngle + standingLegAngle) * f;
  const s = shinAngle * DEG;
  const q = femurAngle * DEG;
  const ankle = {
    x: model.ankleX,
    y: model.ankleHeight + settings.heelElevation * 0.82,
  };
  const knee = {
    x: ankle.x + model.shank * Math.sin(s),
    y: ankle.y + model.shank * Math.cos(s),
  };
  const hip = {
    x: knee.x - model.femurSagittal * Math.sin(q),
    y: knee.y + model.femurSagittal * Math.cos(q),
  };
  const torso = solveTorso(hip, model.torso, settings.barPosition);
  const head = {
    x: torso.shoulder.x + model.shoulderToHead * 0.55 * Math.sin(torso.torsoAngle * DEG),
    y: torso.shoulder.y + model.shoulderToHead * 0.55 * Math.cos(torso.torsoAngle * DEG),
  };

  const kneeFlexion = 180 - angleBetween(
    { x: ankle.x - knee.x, y: ankle.y - knee.y },
    { x: hip.x - knee.x, y: hip.y - knee.y },
  );
  const hipFlexion = 180 - angleBetween(
    { x: knee.x - hip.x, y: knee.y - hip.y },
    { x: torso.shoulder.x - hip.x, y: torso.shoulder.y - hip.y },
  );

  return {
    flexion: f,
    model,
    joints: { ankle, knee, hip, shoulder: torso.shoulder, head, bar: torso.bar },
    angles: {
      shin: shinAngle,
      torso: torso.torsoAngle,
      knee: kneeFlexion,
      hip: hipFlexion,
      ankle: shinAngle - model.footPitch,
    },
    limits: {
      ankleLimited: reachableShin < preferredShin - 0.01,
      bottomShinAngle,
      bottomFemurAngle,
      hipAboveKnee: hip.y - knee.y,
    },
    lengths: {
      shank: distance(ankle, knee),
      femurSagittal: distance(knee, hip),
      torso: distance(hip, torso.shoulder),
    },
    barError: torso.bar.x,
  };
}

export function timelineToFlexion(time) {
  const t = ((time % 1) + 1) % 1;
  const ease = x => (1 - Math.cos(Math.PI * clamp(x, 0, 1))) / 2;
  if (t < 0.08) return 0;
  if (t < 0.45) return ease((t - 0.08) / 0.37);
  if (t < 0.55) return 1;
  if (t < 0.92) return 1 - ease((t - 0.55) / 0.37);
  return 0;
}

export function stageAt(time) {
  const t = ((time % 1) + 1) % 1;
  if (t < 0.08 || t >= 0.92) return "Standing lockout";
  if (t < 0.45) return "Controlled descent";
  if (t < 0.55) return "Bottom position";
  return "Smooth ascent";
}

export function trajectory(anthro, settings, samples = 48) {
  return Array.from({ length: samples + 1 }, (_, index) =>
    solvePose(anthro, settings, index / samples));
}

export function validateModel(anthro = DEFAULTS.anthropometry, settings = DEFAULTS.settings) {
  const poses = trajectory(anthro, settings, 160);
  const first = poses[0];
  const maxBarError = Math.max(...poses.map(pose => Math.abs(pose.barError)));
  const maxLengthError = Math.max(...poses.flatMap(pose => [
    Math.abs(pose.lengths.shank - first.lengths.shank),
    Math.abs(pose.lengths.femurSagittal - first.lengths.femurSagittal),
    Math.abs(pose.lengths.torso - first.lengths.torso),
  ]));
  const maxStep = Math.max(...poses.slice(1).map((pose, index) => {
    const prior = poses[index];
    return Math.max(
      distance(pose.joints.knee, prior.joints.knee),
      distance(pose.joints.hip, prior.joints.hip),
    );
  }));
  const flat = solvePose(anthro, { ...settings, heelElevation: 0 }, 1);
  const lifted = solvePose(anthro, { ...settings, heelElevation: 1 }, 1);
  const high = solvePose(anthro, { ...settings, barPosition: "high" }, 1);
  const low = solvePose(anthro, { ...settings, barPosition: "low" }, 1);
  const changedAnthro = solvePose({ ...anthro, thigh: anthro.thigh + 3 }, settings, 1);
  const baseBottom = poses.at(-1);

  return {
    maxBarError,
    maxLengthError,
    maxStep,
    heelGeometryDelta: Math.abs(flat.angles.shin - lifted.angles.shin),
    heelDorsiflexionDelta: flat.angles.ankle - lifted.angles.ankle,
    barPositionTorsoDelta: low.angles.torso - high.angles.torso,
    anthropometryDelta: Math.abs(changedAnthro.joints.hip.x - baseBottom.joints.hip.x),
    pass: maxBarError < 0.02 && maxLengthError < 1e-9 && maxStep < 0.5 &&
      Math.abs(flat.angles.shin - lifted.angles.shin) > 1 &&
      low.angles.torso - high.angles.torso > 1 &&
      Math.abs(changedAnthro.joints.hip.x - baseBottom.joints.hip.x) > 1,
  };
}
