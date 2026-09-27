/* Monochrome overcast city backdrop for the overview page: light-gray
 * gradient sky, camera-adaptive fog, a procedurally painted street ground
 * (asphalt, crossroads, lane dashes, zebra crossings, curbs) that fades
 * into the sky at its edges and receives real shadows, plus a ring of
 * distant gray buildings for depth. Black/white/gray palette only. */
import * as THREE from "three";

export const FOG_COLOR = 0xd2d6da;

function skyTexture() {
  const cnv = document.createElement("canvas");
  cnv.width = 2; cnv.height = 512;
  const cx = cnv.getContext("2d");
  const g = cx.createLinearGradient(0, 0, 0, 512);
  g.addColorStop(0.00, "#aeb4bc");   /* zenith */
  g.addColorStop(0.55, "#c6cbd1");
  g.addColorStop(1.00, "#d2d6da");   /* horizon (== fog color) */
  cx.fillStyle = g;
  cx.fillRect(0, 0, 2, 512);
  const tex = new THREE.CanvasTexture(cnv);
  if (THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/* Street grid painted on a square world-space canvas: mid-gray asphalt,
 * darker crossroads with white lane dashes, zebra crossings and curbs.
 * The ground fades to the sky color near its edges so the plane boundary
 * is invisible at any camera distance. */
function groundTexture(sizeUnits) {
  const S = 2048;
  const px = S / sizeUnits;                       /* px per world unit */
  const cnv = document.createElement("canvas");
  cnv.width = cnv.height = S;
  const cx = cnv.getContext("2d");
  const u = v => v * px;                          /* world units -> px */
  const center = S / 2;

  /* asphalt base */
  cx.fillStyle = "#7e8388";
  cx.fillRect(0, 0, S, S);

  /* large soft mottling so the asphalt doesn't read as flat fill
   * (kept to the central area; the edge fade zone stays clean) */
  for (let i = 0; i < 90; i++) {
    const a = Math.random() * Math.PI * 2;
    const rr = Math.random() * 40;
    const r = u(2 + Math.random() * 5);
    const x = center + Math.cos(a) * rr * px, y = center + Math.sin(a) * rr * px;
    const g = cx.createRadialGradient(x, y, 0, x, y, r);
    const dark = Math.random() < .5;
    g.addColorStop(0, dark ? "rgba(80,85,90,.12)" : "rgba(150,155,160,.12)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    cx.fillStyle = g;
    cx.beginPath(); cx.arc(x, y, r, 0, Math.PI * 2); cx.fill();
  }
  /* fine speckle */
  for (let i = 0; i < 26000; i++) {
    const v = 95 + Math.random() * 70 | 0;
    cx.fillStyle = `rgba(${v},${v + 3},${v + 6},${Math.random() * .16})`;
    cx.fillRect(Math.random() * S, Math.random() * S, 1.6, 1.6);
  }

  const RH = 2.1;                                 /* road half width, units */
  cx.fillStyle = "#5d6267";
  cx.fillRect(0, center - u(RH), S, u(RH * 2));   /* E-W road */
  cx.fillRect(center - u(RH), 0, u(RH * 2), S);   /* N-S road */

  /* curbs */
  cx.fillStyle = "#b6bbc0";
  for (const off of [-RH, RH]) {
    cx.fillRect(0, center + u(off) - u(.11), S, u(.22));
    cx.fillRect(center + u(off) - u(.11), 0, u(.22), S);
  }

  /* dashed centre lines (broken around the intersection) */
  cx.fillStyle = "#e6e8ea";
  const DASH = 1.3, GAP = 1.3, W = .13;
  for (let d = -sizeUnits / 2; d < sizeUnits / 2; d += DASH + GAP) {
    if (Math.abs(d + DASH / 2) < RH + 3.2) continue;
    cx.fillRect(center + u(d), center - u(W / 2), u(DASH), u(W));
    cx.fillRect(center - u(W / 2), center + u(d), u(W), u(DASH));
  }

  /* zebra crossings on the four approaches */
  const ZD = 1.9, Z_OFF = RH + .8;                /* depth / offset from centre */
  cx.fillStyle = "#dfe2e5";
  for (const dir of [-1, 1]) {
    const x0 = center + dir * u(Z_OFF);
    for (let y = center - u(RH - .35); y + u(.45) < center + u(RH - .35); y += u(.87))
      cx.fillRect(x0, y, u(ZD), u(.45));          /* bars across the E-W road */
    const y0 = center + dir * u(Z_OFF);
    for (let x = center - u(RH - .35); x + u(.45) < center + u(RH - .35); x += u(.87))
      cx.fillRect(x, y0, u(.45), u(ZD));          /* bars across the N-S road */
  }
  /* stop lines */
  cx.fillStyle = "#dfe2e5";
  for (const dir of [-1, 1]) {
    const p = center + dir * u(RH + ZD + .35);
    cx.fillRect(p, center - u(RH - .3), u(.28), u(RH * 2 - .6));
    cx.fillRect(center - u(RH - .3), p, u(RH * 2 - .6), u(.28));
  }

  /* radial fade to sky color near the edges of the ground plane */
  const fade = cx.createRadialGradient(center, center, S * .30, center, center, S * .495);
  fade.addColorStop(0, "rgba(210,214,218,0)");
  fade.addColorStop(1, "rgba(210,214,218,1)");
  cx.fillStyle = fade;
  cx.fillRect(0, 0, S, S);

  const tex = new THREE.CanvasTexture(cnv);
  tex.anisotropy = 8;
  if (THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createBackdrop(scene) {
  scene.background = skyTexture();
  scene.fog = new THREE.Fog(FOG_COLOR, 45, 110);

  /* street ground, receives the dioramas' shadows */
  const GROUND = 160;
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(GROUND, GROUND),
    new THREE.MeshStandardMaterial({ map: groundTexture(GROUND), roughness: .96 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  /* distant skyline: a ring of small gray blocks, softened by fog.
   * Each block fades out as the camera gets near it, so the ring only
   * ever reads as a far-side skyline at any zoom or orientation. */
  const shades = [0x868c93, 0x7a8087, 0x6f757c, 0x90969c, 0x81878e];
  const ring = new THREE.Group();
  const blocks = [];
  const N = 52;
  for (let i = 0; i < N; i++) {
    const a = (i + Math.random() * .6) / N * Math.PI * 2;
    const r = 60 + Math.random() * 14;
    const w = 2.5 + Math.random() * 3.5, d = 2.5 + Math.random() * 2;
    const h = Math.random() < .12 ? 16 + Math.random() * 8 : 5 + Math.random() * 9;
    const mat = new THREE.MeshStandardMaterial({
      color: shades[i % shades.length], roughness: .95,
      transparent: true, opacity: 0
    });
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    b.position.set(Math.cos(a) * r, h / 2, Math.sin(a) * r);
    b.rotation.y = Math.random() * Math.PI;
    ring.add(b);
    blocks.push(b);
  }
  scene.add(ring);

  /* fog follows the camera distance so the models stay crisp while the
   * skyline and ground edge stay hazed at any zoom or orientation */
  const v3 = new THREE.Vector3();
  function setDistance(cd, camPos) {
    scene.fog.near = cd * 1.15;
    scene.fog.far = cd * 2.6;
    for (const b of blocks) {
      const d = v3.copy(b.position).distanceTo(camPos);
      b.material.opacity = THREE.MathUtils.smoothstep(d, cd * .8, cd * 1.15);
    }
  }
  function update() {}
  return { update, setDistance };
}
