// A small orbit camera.
//
// Written by hand rather than pulled from three's addons because the behaviour
// wanted here is specific: it drifts on its own, yields to the viewer when they
// grab it, and quietly takes over again once they let go. The site is something
// you watch, so the default state has to be motion.

import * as THREE from 'three';

const IDLE_BEFORE_RESUME = 3.5; // seconds

export function createCameraRig({ camera, domElement, radius, reducedMotion }) {
  const target = new THREE.Vector3(0, 0, 0);

  let theta = 0.6; // around the equator
  let phi = 1.15; // from the north pole
  let distance = radius * 3.5;

  let targetTheta = theta;
  let targetPhi = phi;
  let targetDistance = distance;

  const minDistance = radius * 1.3;
  let maxDistance = radius * 7;
  const minPhi = 0.25;
  const maxPhi = Math.PI - 0.25;

  // Distance at which the whole planet sits comfortably in frame. On a tall
  // phone the horizontal field of view is far narrower than the vertical one,
  // so fitting to the vertical axis alone crops the world badly.
  let fitDistance = distance;
  let userZoomed = false;
  let framed = false;

  function setViewport(aspect, verticalFovDeg) {
    const vHalf = (verticalFovDeg * Math.PI) / 180 / 2;
    const hHalf = Math.atan(Math.tan(vHalf) * aspect);
    const half = Math.min(vHalf, hHalf);

    // What actually has to fit: the planet, its atmosphere shell, and the
    // trees standing proud of the limb.
    const visibleRadius = radius * 1.2;
    fitDistance = visibleRadius / Math.sin(half * 0.88);
    maxDistance = fitDistance * 2.2;

    // Respect a viewer who has chosen their own zoom; otherwise reframe.
    if (!userZoomed) {
      targetDistance = fitDistance;
      // Snap rather than ease on the very first framing, so the world doesn't
      // visibly fly into position on load.
      if (!framed) {
        distance = fitDistance;
        framed = true;
      }
    }
    targetDistance = THREE.MathUtils.clamp(targetDistance, minDistance, maxDistance);
  }

  const autoSpeed = reducedMotion ? 0.008 : 0.035;
  let idleFor = IDLE_BEFORE_RESUME;

  let dragging = false;
  let lastX = 0;
  let lastY = 0;
  const pointers = new Map();
  let lastPinch = 0;

  function onPointerDown(e) {
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 1) {
      dragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
      domElement.setPointerCapture(e.pointerId);
    }
    idleFor = 0;
  }

  function onPointerMove(e) {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    idleFor = 0;

    if (pointers.size === 2) {
      // Pinch to zoom.
      const [a, b] = [...pointers.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      if (lastPinch > 0) {
        userZoomed = true;
        targetDistance = THREE.MathUtils.clamp(
          targetDistance * (lastPinch / dist),
          minDistance,
          maxDistance
        );
      }
      lastPinch = dist;
      return;
    }

    if (!dragging) return;
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    lastX = e.clientX;
    lastY = e.clientY;

    targetTheta -= dx * 0.005;
    targetPhi = THREE.MathUtils.clamp(targetPhi - dy * 0.005, minPhi, maxPhi);
  }

  function onPointerUp(e) {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) lastPinch = 0;
    if (pointers.size === 0) dragging = false;
    if (domElement.hasPointerCapture?.(e.pointerId)) {
      domElement.releasePointerCapture(e.pointerId);
    }
  }

  function onWheel(e) {
    e.preventDefault();
    idleFor = 0;
    userZoomed = true;
    targetDistance = THREE.MathUtils.clamp(
      targetDistance * (1 + Math.sign(e.deltaY) * 0.12),
      minDistance,
      maxDistance
    );
  }

  domElement.addEventListener('pointerdown', onPointerDown);
  domElement.addEventListener('pointermove', onPointerMove);
  domElement.addEventListener('pointerup', onPointerUp);
  domElement.addEventListener('pointercancel', onPointerUp);
  domElement.addEventListener('wheel', onWheel, { passive: false });

  const dir = new THREE.Vector3();

  return {
    /** Unit vector from the planet toward the camera. */
    viewDirection: dir,

    setViewport,

    update(dt) {
      idleFor += dt;
      if (idleFor > IDLE_BEFORE_RESUME && !dragging) {
        targetTheta += autoSpeed * dt;
      }

      // Critically-damped-ish easing, framerate independent.
      const k = 1 - Math.pow(0.001, dt);
      theta += (targetTheta - theta) * k;
      phi += (targetPhi - phi) * k;
      distance += (targetDistance - distance) * k;

      const sinPhi = Math.sin(phi);
      dir.set(sinPhi * Math.sin(theta), Math.cos(phi), sinPhi * Math.cos(theta));

      camera.position.copy(dir).multiplyScalar(distance).add(target);
      camera.lookAt(target);
    },

    dispose() {
      domElement.removeEventListener('pointerdown', onPointerDown);
      domElement.removeEventListener('pointermove', onPointerMove);
      domElement.removeEventListener('pointerup', onPointerUp);
      domElement.removeEventListener('pointercancel', onPointerUp);
      domElement.removeEventListener('wheel', onWheel);
    },
  };
}
