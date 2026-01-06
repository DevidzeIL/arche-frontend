import { createContext, useContext, useRef, useEffect, useState } from 'react';
import * as PIXI from 'pixi.js';
import { useApplication } from '@pixi/react';

interface CameraContextValue {
  camera: PIXI.Container;
  zoom: number;
  setZoom: (zoom: number) => void;
}

const CameraContext = createContext<CameraContextValue | null>(null);

export function useCamera() {
  const context = useContext(CameraContext);
  if (!context) {
    throw new Error('useCamera must be used within CameraProvider');
  }
  return context;
}

interface CameraProviderProps {
  children: React.ReactNode;
  onZoomChange?: (zoom: number) => void;
}

export function CameraProvider({ children, onZoomChange }: CameraProviderProps) {
  const { app } = useApplication();
  const cameraRef = useRef<PIXI.Container | null>(null);
  const [zoom, setZoomState] = useState(1);
  const isPanningRef = useRef(false);
  const panStartRef = useRef({ x: 0, y: 0 });
  const isDraggingNodeRef = useRef(false);

  useEffect(() => {
    // useApplication() returns { app: Application }
    // Access stage and canvas through app
    const stage = app.stage;
    const canvas = app.canvas as HTMLCanvasElement;
    if (!stage || !canvas) return;

    const camera = new PIXI.Container();
    stage.addChild(camera);
    cameraRef.current = camera;

    // Wheel zoom (centered on cursor)
    const handleWheel = (e: WheelEvent) => {
      if (isDraggingNodeRef.current) return;

      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
      const newZoom = Math.max(0.2, Math.min(3, zoom * zoomFactor));

      // Zoom centered on cursor
      const worldX = (mouseX - camera.x) / zoom;
      const worldY = (mouseY - camera.y) / zoom;

      setZoomState(newZoom);
      camera.scale.set(newZoom);

      // Adjust position to keep cursor point fixed
      camera.x = mouseX - worldX * newZoom;
      camera.y = mouseY - worldY * newZoom;

      onZoomChange?.(newZoom);
    };

    // Pointer pan
    const handlePointerDown = (e: PointerEvent) => {
      if (e.button !== 0) return; // Only left mouse button
      if (isDraggingNodeRef.current) return;

      isPanningRef.current = true;
      panStartRef.current = {
        x: e.clientX - camera.x,
        y: e.clientY - camera.y,
      };
      canvas.style.cursor = 'grabbing';
    };

    const handlePointerMove = (e: PointerEvent) => {
      if (!isPanningRef.current || isDraggingNodeRef.current) return;

      camera.x = e.clientX - panStartRef.current.x;
      camera.y = e.clientY - panStartRef.current.y;
    };

    const handlePointerUp = () => {
      isPanningRef.current = false;
      canvas.style.cursor = 'default';
    };

    canvas.addEventListener('wheel', handleWheel, { passive: false });
    canvas.addEventListener('pointerdown', handlePointerDown);
    canvas.addEventListener('pointermove', handlePointerMove);
    canvas.addEventListener('pointerup', handlePointerUp);
    canvas.addEventListener('pointerleave', handlePointerUp);

    return () => {
      canvas.removeEventListener('wheel', handleWheel);
      canvas.removeEventListener('pointerdown', handlePointerDown);
      canvas.removeEventListener('pointermove', handlePointerMove);
      canvas.removeEventListener('pointerup', handlePointerUp);
      canvas.removeEventListener('pointerleave', handlePointerUp);
      if (cameraRef.current) {
        stage.removeChild(cameraRef.current);
        cameraRef.current.destroy();
      }
    };
  }, [app, zoom, onZoomChange]);

  const setZoom = (newZoom: number) => {
    const clampedZoom = Math.max(0.2, Math.min(3, newZoom));
    setZoomState(clampedZoom);
    if (cameraRef.current) {
      cameraRef.current.scale.set(clampedZoom);
    }
    onZoomChange?.(clampedZoom);
  };

  if (!cameraRef.current) {
    return null;
  }

  return (
    <CameraContext.Provider
      value={{
        camera: cameraRef.current,
        zoom,
        setZoom,
      }}
    >
      {children}
    </CameraContext.Provider>
  );
}

