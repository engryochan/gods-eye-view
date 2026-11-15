// Independent cross-check (Claude, 2026-11-15). Read-only use of project modules.
import { writeFileSync } from 'node:fs';
import * as Cesium from 'cesium';
import { twoline2satrec } from 'satellite.js';
import { solarPositionECI, observerSolarElevation, findNextSatellitePass, lookAnglesAt, isObserverDark } from '../../src/data/satellitePass.js';
import { raDecToUnitVector, bvToTemperature, starBrightness } from '../../src/sky/stars.js';
import { computeSkyRotation } from '../../src/sky/starrySky.js';
import { greatCircleKm } from '../../src/geoDistance.js';

const D = Math.PI / 180, out = {};
const sep = (a, b) => { const d = Cesium.Cartesian3.dot(Cesium.Cartesian3.normalize(a, new Cesium.Cartesian3()), Cesium.Cartesian3.normalize(b, new Cesium.Cartesian3())); return Math.acos(Math.min(1, Math.max(-1, d))) / D; };

// 1. Solar declination at known astronomical events (reference values: IMCCE/USNO almanac, rounded)
out.solarEvents = [
  ['2026-03-20T14:46Z', 'March equinox', 0],
  ['2026-06-21T08:24Z', 'June solstice', 23.436],
  ['2026-12-21T20:50Z', 'December solstice', -23.436],
].map(([t, name, ref]) => { const s = solarPositionECI(Date.parse(t)); return { t, name, decDeg: +s.decDeg.toFixed(4), refDeg: ref, errDeg: +(s.decDeg - ref).toFixed(4) }; });

// 2. Sun elevation at Batumi true noon today vs independent NOAA formula
const lat = 41.6168, lon = 41.6367;
let best = { e: -99 };
for (let m = 0; m < 24 * 60; m++) { const t = Date.UTC(2026, 10, 15, 0, m); const e = observerSolarElevation(lat, lon, t); if (e > best.e) best = { e, t }; }
const dec = solarPositionECI(best.t).decDeg;
out.batumiNoon = { utc: new Date(best.t).toISOString(), projectElevDeg: +best.e.toFixed(3), geometric90minusLatPlusDec: +(90 - lat + dec).toFixed(3), darkAt20LocalTime: isObserverDark(lat, lon, Date.UTC(2026,10,15,16)) };

// 3. Sun–Moon separation (Cesium Simon1994) at 2026-08-12 total eclipse vs one week later
const P = Cesium.Simon1994PlanetaryPositions;
out.eclipse = ['2026-08-12T17:46Z', '2026-08-19T17:46Z'].map(t => { const j = Cesium.JulianDate.fromIso8601(t); return { t, geocentricSunMoonSepDeg: +sep(P.computeSunPositionInEarthInertialFrame(j), P.computeMoonPositionInEarthInertialFrame(j)).toFixed(3) }; });

// 4. Sky frame: is precise ICRF available in Node (no EOP tables loaded)?
const rot = computeSkyRotation(Cesium.JulianDate.fromIso8601('2026-11-15T12:00Z'));
out.skyRotationPreciseInNode = rot.precise;

// 5. Stars
const pol = raDecToUnitVector(37.954, 89.264);
out.stars = { polarisUnitVector: pol, sunTempFromBV065: Math.round(bvToTemperature(0.65)), sunTrueTeffK: 5772, siriusBrightness: starBrightness(-1.46), mag6Brightness: starBrightness(6) };

// 6. Satellite pass vs brute force (archived 2008 ISS TLE, near its epoch)
const sat = twoline2satrec('1 25544U 98067A   08264.51782528 -.00002182  00000-0 -11606-4 0  2927','2 25544  51.6416 247.4627 0006703 130.5360 325.0288 15.72125391563537');
const from = Date.UTC(2008, 8, 20, 12, 0), obsLat = 39.9042, obsLon = 116.4074;
const pass = findNextSatellitePass({ satrec: sat, latDeg: obsLat, lonDeg: obsLon, fromMs: from, minElevDeg: 10 });
let bf = { e: -99 }; if (pass) for (let t = pass.riseMs - 600e3; t < pass.setMs + 600e3; t += 1000) { const l = lookAnglesAt(sat, t, obsLat, obsLon); if (l && l.elevDeg > bf.e) bf = { e: l.elevDeg, t }; }
out.issPassBeijing2008 = pass && { rise: new Date(pass.riseMs).toISOString(), set: new Date(pass.setMs).toISOString(), maxElevDeg: +pass.maxElevDeg.toFixed(3), bruteForceMaxElevDeg: +bf.e.toFixed(3), peakTimeDiffSec: (pass.maxElevMs - bf.t) / 1000, visible: pass.visible };

// 7. Geo: project haversine vs WGS84 ellipsoid geodesic (Cesium EllipsoidGeodesic)
out.geodesic = [['Beijing', 39.9042, 116.4074, 'Batumi', lat, lon], ['Kuala Lumpur', 3.139, 101.6869, 'Beijing', 39.9042, 116.4074], ['Batumi', lat, lon, 'Moscow', 55.7558, 37.6173]].map(([a, la1, lo1, b, la2, lo2]) => {
  const h = greatCircleKm({ lat: la1, lon: lo1 }, { lat: la2, lon: lo2 });
  const g = new Cesium.EllipsoidGeodesic(Cesium.Cartographic.fromDegrees(lo1, la1), Cesium.Cartographic.fromDegrees(lo2, la2)).surfaceDistance / 1000;
  return { route: `${a}→${b}`, haversineKm: +h.toFixed(2), wgs84Km: +g.toFixed(2), errPct: +((h - g) / g * 100).toFixed(3) };
});

writeFileSync(new URL('./verify-results.json', import.meta.url), JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
