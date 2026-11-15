import { writeFileSync } from 'node:fs';
import { twoline2satrec, propagate, gstime, eciToEcf } from 'satellite.js';
import { createWorldClock } from '../../src/time/worldClock.js';
import { sampleOrbit, reckonEarthFixed } from '../../src/layers/satellites/motion.js';

// Archived fixture near its own epoch, never a current-position prediction.
const sat = twoline2satrec(
  '1 25544U 98067A   08264.51782528 -.00002182  00000-0 -11606-4 0  2927',
  '2 25544  51.6416 247.4627 0006703 130.5360 325.0288 15.72125391563537',
);
const epoch = Date.UTC(2008, 8, 20, 12, 30);
let elapsed = 0;
const clock = createWorldClock({
  now: () => epoch + elapsed,
  monotonicNow: () => elapsed,
  setInterval: () => 1,
  clearInterval: () => {},
});
clock.follow('satellites');
clock.seek(epoch - 3600000);
clock.play({ rate: 60 });
elapsed = 1000;
const sample = sampleOrbit(sat, epoch);
const output = {
  fixture: 'Archived ISS TLE, 2008-09-20; not live data',
  clock: {
    elapsedRealSeconds: 1,
    rate: 60,
    satelliteTime: new Date(clock.timeFor('satellites')()).toISOString(),
    flightTimeWithoutHistory: new Date(clock.timeFor('flights')()).toISOString(),
    simulatedAdvanceSeconds: (clock.now() - (epoch - 3600000)) / 1000,
  },
  orbitApproximation: [0, 1, 10, 30, 60].map(seconds => {
    const time = epoch + seconds * 1000;
    const gmst = gstime(new Date(time));
    const approx = reckonEarthFixed(sample, time, gmst, {});
    const reference = eciToEcf(propagate(sat, new Date(time)).position, gmst);
    return { seconds, differenceFromSgp4Metres: Math.hypot(
      approx.x - reference.x * 1000,
      approx.y - reference.y * 1000,
      approx.z - reference.z * 1000,
    ) };
  }),
};
clock.pause();
writeFileSync(new URL('./simulation-results.json', import.meta.url), JSON.stringify(output, null, 2));
console.log(JSON.stringify(output, null, 2));
