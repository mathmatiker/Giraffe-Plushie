import {
  Component,
  ElementRef,
  AfterViewInit,
  ViewChild,
  ChangeDetectionStrategy,
  OnDestroy,
  signal,
  effect,
} from '@angular/core';

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(window:resize)': 'onResize()',
  },
})
export class AppComponent implements AfterViewInit, OnDestroy {
  @ViewChild('canvas')
  private canvasRef: ElementRef<HTMLCanvasElement> | undefined;

  @ViewChild('canvasContainer')
  private canvasContainerRef: ElementRef<HTMLDivElement> | undefined;

  private renderer!: THREE.WebGLRenderer;
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private controls!: OrbitControls;
  
  private animationFrameId: number | null = null;
  private giraffe: THREE.Group | null = null;

  // Signals for UI controls
  giraffeName = signal('Gigi');
  neckLength = signal(6);
  legLength = signal(4);
  hornLength = signal(0.8);
  headSize = signal(1);
  giraffeColor = signal('#FFC300');
  spotColor = signal('#8B4513');
  autoRotate = signal(false);

  private isViewInitialized = signal(false);

  constructor() {
    effect(() => {
      if (this.isViewInitialized()) {
        this.redrawGiraffe();
      }
    });

    effect(() => {
      // This effect tracks both signals.
      // It runs when isViewInitialized becomes true to set the initial state.
      // It runs again whenever autoRotate changes.
      if (this.isViewInitialized()) {
        this.controls.autoRotate = this.autoRotate();
      }
    });
  }

  ngAfterViewInit(): void {
    if (this.canvasRef && this.canvasContainerRef) {
      this.initThreeJs(this.canvasRef.nativeElement);
      this.isViewInitialized.set(true); // Triggers the effect for the first time
      this.animate();
    }
  }

  ngOnDestroy(): void {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
    }
    if(this.renderer) {
      this.renderer.dispose();
    }
    if (this.giraffe) {
      this.removeGiraffe();
    }
  }

  onGiraffeNameChange(event: Event): void {
    this.giraffeName.set((event.target as HTMLInputElement).value);
  }

  onNeckLengthChange(event: Event): void {
    this.neckLength.set((event.target as HTMLInputElement).valueAsNumber);
  }

  onLegLengthChange(event: Event): void {
    this.legLength.set((event.target as HTMLInputElement).valueAsNumber);
  }

  onHornLengthChange(event: Event): void {
    this.hornLength.set((event.target as HTMLInputElement).valueAsNumber);
  }

  onHeadSizeChange(event: Event): void {
    this.headSize.set((event.target as HTMLInputElement).valueAsNumber);
  }
  
  onGiraffeColorChange(event: Event): void {
    this.giraffeColor.set((event.target as HTMLInputElement).value);
  }

  onSpotColorChange(event: Event): void {
    this.spotColor.set((event.target as HTMLInputElement).value);
  }

  onAutoRotateChange(event: Event): void {
    this.autoRotate.set((event.target as HTMLInputElement).checked);
  }

  downloadModel(): void {
    if (!this.giraffe) {
      console.error('No giraffe model to download.');
      return;
    }

    const exporter = new GLTFExporter();
    
    // We want to export as a .glb (binary) file
    const options = {
      binary: true,
    };

    exporter.parse(
      this.giraffe,
      (result) => {
        if (result instanceof ArrayBuffer) {
          this.saveArrayBuffer(result, 'my-plush-giraffe.glb');
        } else {
          // Fallback for JSON format
          const output = JSON.stringify(result, null, 2);
          this.saveString(output, 'my-plush-giraffe.gltf');
        }
      },
      (error) => {
        console.error('An error happened during parsing', error);
      },
      options
    );
  }

  private saveString(text: string, filename: string): void {
    this.save(new Blob([text], { type: 'text/plain' }), filename);
  }

  private saveArrayBuffer(buffer: ArrayBuffer, filename: string): void {
    this.save(new Blob([buffer], { type: 'application/octet-stream' }), filename);
  }

  private save(blob: Blob, filename: string): void {
    const link = document.createElement('a');
    link.style.display = 'none';
    document.body.appendChild(link); // Required for Firefox

    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();

    URL.revokeObjectURL(link.href);
    document.body.removeChild(link);
  }

  private redrawGiraffe(): void {
    this.removeGiraffe();

    this.giraffe = this.createGiraffe(
      this.neckLength(),
      this.legLength(),
      this.hornLength(),
      this.headSize(),
      this.giraffeColor(),
      this.spotColor()
    );
    this.scene.add(this.giraffe);

    // Center camera on the new giraffe
    const box = new THREE.Box3().setFromObject(this.giraffe);
    const center = box.getCenter(new THREE.Vector3());
    this.controls.target.copy(center);
    this.controls.update();
  }

  private removeGiraffe(): void {
    if (this.giraffe) {
      this.scene.remove(this.giraffe);
      // Proper disposal to prevent memory leaks
      this.giraffe.traverse(object => {
        if (object instanceof THREE.Mesh) {
          object.geometry.dispose();
          if (Array.isArray(object.material)) {
            object.material.forEach(material => material.dispose());
          } else {
            object.material.dispose();
          }
        }
      });
      this.giraffe = null;
    }
  }

  onResize(): void {
    if (!this.canvasContainerRef || !this.camera || !this.renderer) {
      return;
    }

    const container = this.canvasContainerRef.nativeElement;
    const width = container.clientWidth;
    const height = container.clientHeight;
    
    if (width === 0 || height === 0) {
      return;
    }

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  private initThreeJs(canvas: HTMLCanvasElement): void {
    if (!this.canvasContainerRef) return;

    const container = this.canvasContainerRef.nativeElement;
    const width = container.clientWidth;
    const height = container.clientHeight;
    
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xfffbeb);

    this.camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
    this.camera.position.z = 10;
    this.camera.position.y = 5;

    this.renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.shadowMap.enabled = true;

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.minDistance = 5;
    this.controls.maxDistance = 50;
    this.controls.maxPolarAngle = Math.PI;
    this.controls.autoRotate = false; // Explicitly disable auto-rotation

    const ambientLight = new THREE.AmbientLight(0xffffff, 1.0);
    this.scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 1.5);
    directionalLight.position.set(5, 10, 7.5);
    directionalLight.castShadow = true;
    this.scene.add(directionalLight);
  }

  private createGiraffe(neckLength: number, legLength: number, hornLength: number, headSize: number, color: string, spotColorValue: string): THREE.Group {
    const giraffe = new THREE.Group();
    
    const createTexturedMaterial = (baseColorValue: string): THREE.MeshStandardMaterial => {
      const material = new THREE.MeshStandardMaterial({ color: new THREE.Color(baseColorValue), roughness: 0.8 });

      material.onBeforeCompile = (shader) => {
          // Add a varying to pass world position from vertex to fragment shader
          shader.vertexShader = 'varying vec3 vWorldPosition;\n' + shader.vertexShader;
          shader.vertexShader = shader.vertexShader.replace(
              '#include <worldpos_vertex>',
              `
              #include <worldpos_vertex>
              vWorldPosition = worldPosition.xyz;
              `
          );

          // Define utility function and varying before main() in fragment shader
          const fragmentShaderProlog = `
            varying vec3 vWorldPosition;

            // Simple pseudo-random function
            float random(vec2 st) {
                return fract(sin(dot(st.xy, vec2(12.9898, 78.233))) * 43758.5453123);
            }
          `;
          
          shader.fragmentShader = fragmentShaderProlog + shader.fragmentShader;

          // Now, inject the logic that USES the function inside main()
          shader.fragmentShader = shader.fragmentShader.replace(
              '#include <color_fragment>',
              `
              #include <color_fragment>

              // Combine noise from two planes to reduce grid artifacts
              float noise = random(vWorldPosition.xy * 20.0) * 0.5 + random(vWorldPosition.yz * 20.0) * 0.5;
              
              // Apply noise as a subtle brightness variation for a plush feel
              float textureFactor = 0.9 + noise * 0.15; 
              diffuseColor.rgb *= textureFactor;
              `
          );
      };

      return material;
    };

    const giraffeMaterial = createTexturedMaterial(color);
    const spotMaterial = createTexturedMaterial(spotColorValue);
    const eyeMaterial = new THREE.MeshBasicMaterial({ color: 0x000000 });

    const giraffeGeometries: THREE.BufferGeometry[] = [];
    const spotGeometries: THREE.BufferGeometry[] = [];

    // Body (The origin reference)
    const bodyHeight = 3;
    const bodyGeo = new THREE.BoxGeometry(3, bodyHeight, 5);
    giraffeGeometries.push(bodyGeo);

    // Legs
    const legGeo = new THREE.CylinderGeometry(0.4, 0.3, legLength);
    const legY = -(bodyHeight / 2) - (legLength / 2);
    [
        { x: 1.2, z: 2 }, { x: -1.2, z: 2 },
        { x: 1.2, z: -2 }, { x: -1.2, z: -2 }
    ].forEach(pos => {
        const geo = legGeo.clone();
        geo.translate(pos.x, legY, pos.z);
        giraffeGeometries.push(geo);
    });

    // Tail
    const tailLength = 2.0;
    const tailAngle = Math.PI / 4; // 45 degrees down from horizontal
    const tailAttachY = 1.0; // A bit below the top of the body
    const tailAttachZ = -2.5; // At the very back of the body

    // Tail Cylinder (main part)
    const tailGeo = new THREE.CylinderGeometry(0.1, 0.08, tailLength);
    // Move the cylinder's origin to its top end
    tailGeo.translate(0, -tailLength / 2, 0);
    // Rotate it to hang down and back
    tailGeo.rotateX(tailAngle);
    // Move it to the attachment point on the body
    tailGeo.translate(0, tailAttachY, tailAttachZ);
    giraffeGeometries.push(tailGeo);

    // Tail Tassel (the tuft at the end)
    const tasselSize = 0.4;
    const tasselGeo = new THREE.BoxGeometry(tasselSize, tasselSize, tasselSize);
    // Calculate the position of the end of the tail cylinder
    const tasselY = tailAttachY - tailLength * Math.cos(tailAngle);
    const tasselZ = tailAttachZ - tailLength * Math.sin(tailAngle);
    tasselGeo.translate(0, tasselY, tasselZ);
    spotGeometries.push(tasselGeo);
    
    // Neck
    const bodyTopY = bodyHeight / 2;
    const neckRadiusBottom = 0.95;
    const neckRadiusTop = 0.75;
    const neckGeo = new THREE.CylinderGeometry(neckRadiusTop, neckRadiusBottom, neckLength);
    const neckCenterY = bodyTopY + (neckLength / 2);
    const neckBaseZ = 1.5;
    neckGeo.translate(0, neckCenterY, neckBaseZ);
    giraffeGeometries.push(neckGeo);

    // Head
    const neckTopY = bodyTopY + neckLength;
    const headDim = { w: 2 * headSize, h: 2 * headSize, d: 2.5 * headSize };
    const headGeo = new THREE.BoxGeometry(headDim.w, headDim.h, headDim.d);
    const headCenterY = neckTopY + (headDim.h / 2);
    const headCenterZ = 2;
    headGeo.translate(0, headCenterY, headCenterZ);
    giraffeGeometries.push(headGeo);

    // Snout
    const snoutDim = { w: 1.5 * headSize, h: 0.99 * headSize, d: 1.5 * headSize };
    const snoutGeo = new THREE.BoxGeometry(snoutDim.w, snoutDim.h, snoutDim.d);
    snoutGeo.translate(0, headCenterY - 0.5 * headSize, headCenterZ + (headDim.d / 2));
    spotGeometries.push(snoutGeo);

    // Horns
    const hornRadius = 0.2 * headSize;
    const hornGeo = new THREE.CylinderGeometry(hornRadius, hornRadius, hornLength);
    const headTopY = headCenterY + (headDim.h / 2);
    const hornY = headTopY + (hornLength / 2);
    const hornX = 0.7 * headSize;
    const hornZ = headCenterZ - 0.5 * headSize;
    const horn1Geo = hornGeo.clone().translate(hornX, hornY, hornZ);
    spotGeometries.push(horn1Geo);
    const horn2Geo = hornGeo.clone().translate(-hornX, hornY, hornZ);
    spotGeometries.push(horn2Geo);

    // Ears
    const earDim = { w: 0.8 * headSize, h: 0.6 * headSize, d: 0.2 * headSize };
    const earGeo = new THREE.BoxGeometry(earDim.w, earDim.h, earDim.d);
    const earX = (headDim.w / 2) + (earDim.w / 2);
    const earY = headCenterY + 0.5 * headSize;
    const earZ = headCenterZ;
    const ear1Geo = earGeo.clone().translate(earX, earY, earZ);
    giraffeGeometries.push(ear1Geo);
    const ear2Geo = earGeo.clone().translate(-earX, earY, earZ);
    giraffeGeometries.push(ear2Geo);

    // Eyes
    const eyeRadius = 0.2 * headSize;
    const eyeGeo = new THREE.SphereGeometry(eyeRadius, 16, 16);
    const eye1 = new THREE.Mesh(eyeGeo, eyeMaterial);
    const eyeX = 0.7 * headSize;
    const eyeY = headCenterY + 0.3 * headSize;
    const eyeZ = headCenterZ + (headDim.d / 2) - (eyeRadius / 2);
    eye1.position.set(eyeX, eyeY, eyeZ);
    const eye2 = eye1.clone();
    eye2.position.x = -eyeX;
    giraffe.add(eye1, eye2);
    
    // Spots (Body)
    [
        {x: 1, y: 1, z: 2.5}, {x: -1.2, y: 0.5, z: 2.5}, {x: 0.5, y: -1, z: 2.5},
        {x: 1, y: 1, z: -2.5}, {x: -1.2, y: 0.5, z: -2.5}, {x: 0.5, y: -1, z: -2.5},
    ].forEach(p => {
        const spotWidth = 0.5 + Math.random() * 0.4; // 0.5 to 0.9
        const spotHeight = 0.5 + Math.random() * 0.4; // 0.5 to 0.9
        const spotGeoZ = new THREE.BoxGeometry(spotWidth, spotHeight, 0.1);
        spotGeoZ.translate(p.x, p.y, p.z);
        spotGeometries.push(spotGeoZ);
    });
    [
        {x: 1.5, y: 1, z: 1.8}, {x: 1.5, y: -0.5, z: 0}, {x: 1.5, y: 0.8, z: -1.5},
        {x: -1.5, y: 1, z: 1.8}, {x: -1.5, y: -0.5, z: 0}, {x: -1.5, y: 0.8, z: -1.5},
    ].forEach(p => {
        const spotHeight = 0.5 + Math.random() * 0.4; // 0.5 to 0.9
        const spotDepth = 0.5 + Math.random() * 0.4; // 0.5 to 0.9
        const spotGeoX = new THREE.BoxGeometry(0.1, spotHeight, spotDepth);
        spotGeoX.translate(p.x, p.y, p.z);
        spotGeometries.push(spotGeoX);
    });

    // Spots (Neck)
    [
      { p: 0.2, angle: Math.PI / 5 }, { p: 0.45, angle: -Math.PI / 3 },
      { p: 0.7, angle: Math.PI / 1.5 }, { p: 0.9, angle: Math.PI },
    ].forEach(({ p, angle }) => {
      const spotWidth = 0.4 + Math.random() * 0.3; // 0.4 to 0.7
      const spotHeight = 0.4 + Math.random() * 0.3; // 0.4 to 0.7
      const geo = new THREE.BoxGeometry(spotWidth, spotHeight, 0.1);
      const y = bodyTopY + p * neckLength;
      const radius = neckRadiusBottom - p * (neckRadiusBottom - neckRadiusTop);
      geo.rotateY(angle);
      geo.translate(radius * Math.sin(angle), y, neckBaseZ + radius * Math.cos(angle));
      spotGeometries.push(geo);
    });

    if (giraffeGeometries.length > 0) {
      const mergedGiraffeGeo = BufferGeometryUtils.mergeGeometries(giraffeGeometries);
      const giraffeMesh = new THREE.Mesh(mergedGiraffeGeo, giraffeMaterial);
      giraffeMesh.castShadow = true;
      giraffeMesh.receiveShadow = true;
      giraffe.add(giraffeMesh);
    }

    if (spotGeometries.length > 0) {
      const mergedSpotGeo = BufferGeometryUtils.mergeGeometries(spotGeometries);
      const spotMesh = new THREE.Mesh(mergedSpotGeo, spotMaterial);
      spotMesh.castShadow = true;
      spotMesh.receiveShadow = true;
      giraffe.add(spotMesh);
    }
    
    // Lift the giraffe so its feet are at y=0
    giraffe.position.y = legLength + (bodyHeight / 2);
    
    return giraffe;
  }

  private animate = (): void => {
    this.animationFrameId = requestAnimationFrame(this.animate);
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }
}