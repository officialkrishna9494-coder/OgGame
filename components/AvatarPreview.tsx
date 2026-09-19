"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import type { HairstyleId, OutfitId } from "../lib/hall-types";
import { buildOutfit, disposeOutfit, poseOutfit, setHairstyle, tintOutfit, type OutfitRig } from "./scene/outfits";

/** The same model as the hall, lit as a small studio portrait. */
export default function AvatarPreview({ outfit, color, hairstyle }: { outfit: OutfitId; color: string; hairstyle: HairstyleId }) {
  const mountRef = useRef<HTMLDivElement>(null);
  const rigRef = useRef<OutfitRig | null>(null);
  const updateRef = useRef<((id: OutfitId, hairstyle: HairstyleId) => void) | null>(null);
  const colorRef = useRef(color);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    } catch {
      // Keep the picker usable on devices without an available WebGL context.
      const timer = window.setTimeout(() => setUnavailable(true), 0);
      return () => window.clearTimeout(timer);
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    renderer.domElement.setAttribute("aria-hidden", "true");
    renderer.domElement.style.cssText = "display:block;width:100%;height:100%;touch-action:pan-y";
    mount.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(31, 1, 0.1, 20);
    camera.position.set(0, 1.30, 4.15);
    camera.lookAt(0, 0.92, 0);
    scene.add(new THREE.HemisphereLight("#fff6ed", "#b8afc8", 2.4));
    const key = new THREE.DirectionalLight("#fff3e2", 3.2);
    key.position.set(-3, 5, 4);
    scene.add(key);
    const rim = new THREE.DirectionalLight("#e1dcff", 2);
    rim.position.set(3, 3, -2);
    scene.add(rim);
    // Soft grounding shadow without a second shadow-map render pass.
    const shadowCanvas = document.createElement("canvas");
    shadowCanvas.width = shadowCanvas.height = 64;
    const ctx = shadowCanvas.getContext("2d")!;
    const gradient = ctx.createRadialGradient(32, 32, 3, 32, 32, 32);
    gradient.addColorStop(0, "rgba(77,56,66,0.2)");
    gradient.addColorStop(1, "rgba(77,56,66,0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 64, 64);
    const shadowTexture = new THREE.CanvasTexture(shadowCanvas);
    const shadowGeometry = new THREE.PlaneGeometry(1.3, 0.85);
    const shadowMaterial = new THREE.MeshBasicMaterial({ map: shadowTexture, transparent: true, depthWrite: false });
    const shadow = new THREE.Mesh(shadowGeometry, shadowMaterial);
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.008;
    scene.add(shadow);

    let rotation = -0.18;
    let dragging = false;
    let lastX = 0;
    const down = (event: PointerEvent) => {
      dragging = true;
      lastX = event.clientX;
      renderer.domElement.setPointerCapture(event.pointerId);
    };
    const move = (event: PointerEvent) => {
      if (!dragging) return;
      rotation += (event.clientX - lastX) * 0.013;
      lastX = event.clientX;
    };
    const up = () => { dragging = false; };
    renderer.domElement.addEventListener("pointerdown", down);
    renderer.domElement.addEventListener("pointermove", move);
    renderer.domElement.addEventListener("pointerup", up);
    renderer.domElement.addEventListener("pointercancel", up);
    const turn = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault();
        event.stopPropagation();
        rotation += event.key === "ArrowLeft" ? -0.25 : 0.25;
      }
    };
    mount.addEventListener("keydown", turn);
    updateRef.current = (id, hairstyle) => {
      if (rigRef.current?.id === id) {
        setHairstyle(rigRef.current, hairstyle);
        return;
      }
      if (rigRef.current) {
        scene.remove(rigRef.current.group);
        disposeOutfit(rigRef.current);
      }
      const rig = buildOutfit(id, colorRef.current, hairstyle);
      rig.phase = 0;
      rigRef.current = rig;
      scene.add(rig.group);
    };
    const resize = () => {
      const width = mount.clientWidth, height = mount.clientHeight;
      if (!width || !height) return;
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(mount);
    resize();
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let last = 0, elapsed = 0;
    renderer.setAnimationLoop((time) => {
      const dt = last ? Math.min((time - last) / 1000, 0.05) : 0;
      last = time;
      if (document.hidden) return;
      const rig = rigRef.current;
      if (rig) {
        if (!reducedMotion.matches) {
          elapsed += dt;
          poseOutfit(rig, dt, { elapsed, speed: 0, moving: false, sitting: false, floorSit: false, jumping: false, action: null, hitK: 0 });
        }
        rig.group.rotation.y = rotation;
      }
      renderer.render(scene, camera);
    });
    return () => {
      renderer.setAnimationLoop(null);
      observer.disconnect();
      mount.removeEventListener("keydown", turn);
      renderer.domElement.removeEventListener("pointerdown", down);
      renderer.domElement.removeEventListener("pointermove", move);
      renderer.domElement.removeEventListener("pointerup", up);
      renderer.domElement.removeEventListener("pointercancel", up);
      if (rigRef.current) disposeOutfit(rigRef.current);
      rigRef.current = null;
      updateRef.current = null;
      shadowGeometry.dispose();
      shadowMaterial.dispose();
      shadowTexture.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  useEffect(() => {
    colorRef.current = color;
    updateRef.current?.(outfit, hairstyle);
    if (rigRef.current) tintOutfit(rigRef.current, color);
  }, [outfit, color, hairstyle]);

  return (
    <div className="relative overflow-hidden rounded-2xl border border-[#e6ded6] bg-[radial-gradient(ellipse_at_50%_35%,#fffdf8_0%,#f0e9e2_100%)]">
      <span className="absolute left-3 top-3 text-[9px] font-bold uppercase tracking-[0.16em] text-[#9a8b92]">Your character</span>
      <div ref={mountRef} tabIndex={0} role="img" aria-label={`${outfit === "suit" ? "Male" : "Female"} character preview. Drag or use left and right arrow keys to rotate.`} className="h-[190px] sm:h-[288px] w-full cursor-grab outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#9e8aaf] active:cursor-grabbing">
        {unavailable && <p className="flex h-full items-center justify-center px-8 text-sm text-[#77677f]">3D preview unavailable. You can still choose your look and color below.</p>}
      </div>
      <p className="pointer-events-none absolute bottom-2 left-0 right-0 text-center text-[10px] text-[#9a8b92]">drag to turn · made for the hall</p>
    </div>
  );
}
