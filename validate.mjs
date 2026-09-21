import { DEFAULTS, solvePose, timelineToFlexion, validateModel } from "./biomech.js";

const result = validateModel();
const checkpoints = Array.from({ length: 401 }, (_, i) =>
  solvePose(DEFAULTS.anthropometry, DEFAULTS.settings, timelineToFlexion(i / 400)));
const ankle = checkpoints[0].joints.ankle;
const footFixed = checkpoints.every(p =>
  Math.abs(p.joints.ankle.x - ankle.x) < 1e-12 && Math.abs(p.joints.ankle.y - ankle.y) < 1e-12);

console.table({
  "max bar error (in)": result.maxBarError,
  "max segment drift (in)": result.maxLengthError,
  "max sampled joint step (in)": result.maxStep,
  "heel changes shin geometry (deg)": result.heelGeometryDelta,
  "heel reduces dorsiflexion (deg)": result.heelDorsiflexionDelta,
  "low-bar torso change (deg)": result.barPositionTorsoDelta,
  "anthropometry hip change (in)": result.anthropometryDelta,
});
console.assert(footFixed, "The modeled ankle/foot anchor moved during the repetition");
console.assert(result.pass, "Squat model validation failed");
if (!footFixed || !result.pass) process.exitCode = 1;
else console.log("All articulated-model checks passed.");
