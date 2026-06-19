import * as THREE from 'three';
import { soundSynth } from './sound.js';

// Puzzle Silhouette Targets
// Rod 0..6 represents the 7 pieces in the following order:
// 0: Large Triangle 1, 1: Large Triangle 2, 2: Medium Triangle, 
// 3: Small Triangle 1, 4: Small Triangle 2, 5: Square, 6: Parallelogram
export const TANGRAM_PUZZLES = {
  square: [
    { x: -1.0, y: 1.0, rot: -Math.PI / 2 },    // LT1
    { x: 1.0, y: 1.0, rot: Math.PI },          // LT2
    { x: 1.414, y: -1.414, rot: Math.PI / 4 }, // MT
    { x: -1.0, y: -1.0, rot: 0 },              // ST1
    { x: 0.0, y: 0.0, rot: -Math.PI / 2 },     // ST2
    { x: 0.0, y: -1.414, rot: Math.PI / 4 },   // SQ
    { x: -1.0, y: 0.0, rot: -Math.PI / 4 }     // PA
  ],
  house: [
    { x: -1.0, y: 0.5, rot: 0 },               // LT1
    { x: 1.0, y: 0.5, rot: -Math.PI / 2 },     // LT2
    { x: 0.0, y: 2.0, rot: Math.PI },          // MT
    { x: -1.5, y: -1.5, rot: Math.PI / 2 },    // ST1
    { x: 1.5, y: -1.5, rot: 0 },               // ST2
    { x: 0.0, y: -1.0, rot: 0 },               // SQ
    { x: 0.0, y: -2.2, rot: Math.PI / 2 }      // PA
  ],
  duck: [
    { x: -1.5, y: 1.0, rot: Math.PI / 4 },     // LT1
    { x: 0.5, y: 0.0, rot: -Math.PI / 4 },     // LT2
    { x: -1.0, y: -1.5, rot: Math.PI / 2 },    // MT
    { x: 1.5, y: 2.5, rot: -Math.PI / 2 },     // ST1
    { x: 1.0, y: 1.2, rot: 0 },                // ST2
    { x: 2.0, y: 1.8, rot: Math.PI / 4 },      // SQ
    { x: -0.5, y: -2.5, rot: Math.PI / 2 }     // PA
  ]
};

export class TangramGame {
  constructor(containerId, onSolve) {
    this.container = document.getElementById(containerId);
    this.onSolve = onSolve;
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    
    this.pieces = [];        // 3D movable meshes
    this.shadows = [];       // flat grey shadow indicators
    this.activePuzzle = 'square';
    
    // Drag-and-drop state
    this.activePiece = null;
    this.dragOffset = new THREE.Vector3();
    this.planeZ0 = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();

    this.animationFrameId = null;
    this.resizeObserver = null;
  }

  init() {
    if (!this.container) return;

    // 1. Scene Setup
    this.scene = new THREE.Scene();

    // 2. Camera Setup (Orthographic is best for 2D puzzle gameplay in 3D space)
    const aspect = this.container.clientWidth / this.container.clientHeight;
    const viewSize = 10;
    this.camera = new THREE.OrthographicCamera(
      -viewSize * aspect / 2, viewSize * aspect / 2,
      viewSize / 2, -viewSize / 2,
      0.1, 100
    );
    this.camera.position.set(0, 0, 15);
    this.camera.lookAt(0, 0, 0);

    // 3. Renderer Setup
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.container.appendChild(this.renderer.domElement);

    // 4. Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
    this.scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 1.0);
    dirLight.position.set(2, 4, 10);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 512;
    dirLight.shadow.mapSize.height = 512;
    this.scene.add(dirLight);

    // Purple/blue backglow light to illuminate edges
    const glowLight = new THREE.PointLight(0x7c3aed, 2.0, 15);
    glowLight.position.set(0, 0, -2);
    this.scene.add(glowLight);

    // 5. Draw Board Background
    const boardGeo = new THREE.PlaneGeometry(14, 10);
    const boardMat = new THREE.MeshStandardMaterial({
      color: 0x0c0f17,
      roughness: 0.8,
      metalness: 0.1
    });
    const board = new THREE.Mesh(boardGeo, boardMat);
    board.position.set(0, 0, -0.2);
    board.receiveShadow = true;
    this.scene.add(board);

    // 6. Build the Game elements (Pieces & Shadows)
    this.buildGame();

    // 7. Event Listeners
    this.container.addEventListener('pointerdown', (e) => this.onPointerDown(e));
    this.container.addEventListener('pointermove', (e) => this.onPointerMove(e));
    this.container.addEventListener('pointerup', () => this.onPointerUp());
    this.container.addEventListener('dblclick', (e) => this.onDoubleClick(e));

    // 8. Animation & Resize
    this.animate();

    this.resizeObserver = new ResizeObserver(() => {
      if (!this.container || !this.renderer) return;
      const newAspect = this.container.clientWidth / this.container.clientHeight;
      this.camera.left = -viewSize * newAspect / 2;
      this.camera.right = viewSize * newAspect / 2;
      this.camera.top = viewSize / 2;
      this.camera.bottom = -viewSize / 2;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
    });
    this.resizeObserver.observe(this.container);

    // Load initial puzzle positions
    this.loadPuzzle(this.activePuzzle);
  }

  buildGame() {
    // Extrude Settings for kid-friendly rounded 3D blocks
    const extrudeSettings = {
      depth: 0.28,
      bevelEnabled: true,
      bevelSegments: 4,
      steps: 1,
      bevelSize: 0.02,
      bevelThickness: 0.04
    };

    // Helper to generate geometries centered at centroid
    const makeExtGeometry = (coords) => {
      const shape = new THREE.Shape();
      shape.moveTo(coords[0][0], coords[0][1]);
      for (let i = 1; i < coords.length; i++) {
        shape.lineTo(coords[i][0], coords[i][1]);
      }
      shape.closePath();
      return new THREE.ExtrudeGeometry(shape, extrudeSettings);
    };

    // Defined coordinate shapes (centered on (0,0) centroid)
    const shapesData = [
      // 0: Large Triangle 1
      makeExtGeometry([[-2, -0.667], [2, -0.667], [0, 1.333]]),
      // 1: Large Triangle 2
      makeExtGeometry([[-2, -0.667], [2, -0.667], [0, 1.333]]),
      // 2: Medium Triangle
      makeExtGeometry([[-1.414, -0.471], [1.414, -0.471], [0, 0.943]]),
      // 3: Small Triangle 1
      makeExtGeometry([[-1.0, -0.333], [1.0, -0.333], [0, 0.667]]),
      // 4: Small Triangle 2
      makeExtGeometry([[-1.0, -0.333], [1.0, -0.333], [0, 0.667]]),
      // 5: Square
      makeExtGeometry([[-0.707, -0.707], [0.707, -0.707], [0.707, 0.707], [-0.707, 0.707]]),
      // 6: Parallelogram
      makeExtGeometry([[-1.5, -0.5], [0.5, -0.5], [1.5, 0.5], [-0.5, 0.5]])
    ];

    // High-impact vibrant plastic materials
    const colors = [
      0xffb74d, // Orange (LT1)
      0x81c784, // Green (LT2)
      0xff8a65, // Red-Orange (MT)
      0xba68c8, // Purple (ST1)
      0xf06292, // Pink (ST2)
      0x4dd0e1, // Cyan (SQ)
      0xffd54f  // Yellow (PA)
    ];

    const materials = colors.map(col => new THREE.MeshStandardMaterial({
      color: col,
      roughness: 0.15,
      metalness: 0.1,
      shadowSide: THREE.DoubleSide
    }));

    // Flat grey material for shadows
    const shadowMaterial = new THREE.MeshBasicMaterial({
      color: 0x1e293b,
      transparent: true,
      opacity: 0.75,
      side: THREE.DoubleSide
    });

    // Draw Shadows & Pieces
    for (let i = 0; i < 7; i++) {
      // 1. Create Flat Silhouette Shadow
      // We project a flat plane outline slightly above background
      const shape2D = new THREE.Shape();
      // Read vertices from the geometry's source shape
      const geom = shapesData[i];
      
      const shadow = new THREE.Mesh(geom, shadowMaterial);
      // Shadows rest slightly below pieces
      shadow.position.set(0, 0, -0.15);
      shadow.scale.set(1.0, 1.0, 0.1); // Flatten on Z axis
      this.scene.add(shadow);
      this.shadows.push(shadow);

      // 2. Create 3D Colored Block Piece
      const piece = new THREE.Mesh(geom, materials[i]);
      piece.castShadow = true;
      piece.receiveShadow = true;
      piece.position.set(0, 0, 0.05);
      
      // Interaction states
      piece.userData = {
        id: i,
        snapped: false,
        targetY: 0.05,
        targetRot: 0,
        velocity: 0,
        rotVelocity: 0
      };

      this.scene.add(piece);
      this.pieces.push(piece);
    }
  }

  loadPuzzle(puzzleKey) {
    this.activePuzzle = puzzleKey;
    const targets = TANGRAM_PUZZLES[puzzleKey];
    if (!targets) return;

    // 1. Position the Silhouette Shadows to form the target puzzle outline
    for (let i = 0; i < 7; i++) {
      const sh = this.shadows[i];
      sh.position.set(targets[i].x, targets[i].y, -0.15);
      sh.rotation.z = targets[i].rot;
    }

    // 2. Scramble the 3D Colored Pieces
    // We place them on left & right sides of screen so the center board is clean
    this.pieces.forEach((piece, i) => {
      piece.userData.snapped = false;
      
      // Randomize side (left or right)
      const onLeft = i % 2 === 0;
      const scrambleX = onLeft ? -4.8 - Math.random() * 0.8 : 4.8 + Math.random() * 0.8;
      const scrambleY = -3.2 + (i * 1.0); // Spread vertically
      const scrambleRot = Math.floor(Math.random() * 8) * (Math.PI / 4); // Mult of 45 deg

      piece.position.set(scrambleX, scrambleY, 0.05);
      piece.rotation.z = scrambleRot;
      
      piece.userData.targetY = 0.05;
      piece.userData.targetRot = scrambleRot;
      piece.userData.velocity = 0;
      piece.userData.rotVelocity = 0;
    });
  }

  onPointerDown(event) {
    event.preventDefault();
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.pointer, this.camera);
    // Raycast only on pieces
    const intersects = this.raycaster.intersectObjects(this.pieces);

    if (intersects.length > 0) {
      // Find top piece clicked
      const clickedPiece = intersects[0].object;
      
      if (!clickedPiece.userData.snapped) {
        this.activePiece = clickedPiece;
        
        // Elevate piece slightly while dragging to show depth
        this.activePiece.position.z = 0.4;
        
        // Find intersection point on Z=0 plane to compute drag offset
        const intersectPoint = new THREE.Vector3();
        this.raycaster.ray.intersectPlane(this.planeZ0, intersectPoint);
        this.dragOffset.copy(this.activePiece.position).sub(intersectPoint);
        
        soundSynth.playClack(0.4); // Subtle drag clack feedback
      }
    }
  }

  onPointerMove(event) {
    if (!this.activePiece) return;
    event.preventDefault();

    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.pointer, this.camera);
    const intersectPoint = new THREE.Vector3();
    
    if (this.raycaster.ray.intersectPlane(this.planeZ0, intersectPoint)) {
      const targetPos = intersectPoint.add(this.dragOffset);
      
      // Clamp values so pieces can't be dragged off screen
      pieceClampX(targetPos);
      
      this.activePiece.position.x = targetPos.x;
      this.activePiece.position.y = targetPos.y;
    }
  }

  onPointerUp() {
    if (!this.activePiece) return;

    const piece = this.activePiece;
    piece.position.z = 0.05; // Return to standard height
    this.activePiece = null;

    // Check if this piece snaps into its target shadow
    this.checkSnap(piece);
    
    // Check if puzzle is fully solved
    this.checkSolve();
  }

  onDoubleClick(event) {
    event.preventDefault();
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.pointer, this.camera);
    const intersects = this.raycaster.intersectObjects(this.pieces);

    if (intersects.length > 0) {
      const piece = intersects[0].object;
      if (!piece.userData.snapped) {
        // Rotate piece by 45 degrees
        piece.userData.targetRot = piece.rotation.z + Math.PI / 4;
        soundSynth.playClack(0.6);
        
        // Check snap immediately after rotation animation completes
        setTimeout(() => this.checkSnap(piece), 200);
      }
    }
  }

  checkSnap(piece) {
    if (piece.userData.snapped) return;

    const id = piece.userData.id;
    const target = TANGRAM_PUZZLES[this.activePuzzle][id];

    // Calculate distance distance to target shadow
    const dist = Math.hypot(piece.position.x - target.x, piece.position.y - target.y);
    
    // Calculate rotation difference (modulo 2PI)
    const rotDiff = Math.abs((piece.rotation.z - target.rot) % (Math.PI * 2));
    const rotDiffNorm = Math.min(rotDiff, Math.PI * 2 - rotDiff);

    // Snapping thresholds: distance < 0.45 units and rotation diff < 15 degrees (0.26 rad)
    if (dist < 0.45 && rotDiffNorm < 0.26) {
      piece.position.set(target.x, target.y, 0.05);
      piece.rotation.z = target.rot;
      piece.userData.targetRot = target.rot;
      piece.userData.snapped = true;
      piece.userData.velocity = 0;
      piece.userData.rotVelocity = 0;

      soundSynth.playClack(0.9); // Distinct wood snap sound
    }
  }

  checkSolve() {
    const allSnapped = this.pieces.every(p => p.userData.snapped);
    if (allSnapped && this.onSolve) {
      this.onSolve();
    }
  }

  reset() {
    this.loadPuzzle(this.activePuzzle);
  }

  animate() {
    this.animationFrameId = requestAnimationFrame(() => this.animate());

    // Skip render if canvas is hidden
    if (!this.container || this.container.clientWidth === 0 || this.container.clientHeight === 0) {
      return;
    }

    const springStiffness = 0.16;
    const damping = 0.72;

    // Physics spring animations for rotations
    this.pieces.forEach(p => {
      if (p === this.activePiece) return; // Skip currently dragged piece

      const targetRot = p.userData.targetRot;
      const rotDisp = targetRot - p.rotation.z;

      if (Math.abs(rotDisp) > 0.002 || Math.abs(p.userData.rotVelocity) > 0.001) {
        const force = rotDisp * springStiffness;
        p.userData.rotVelocity += force;
        p.userData.rotVelocity *= damping;
        p.rotation.z += p.userData.rotVelocity;
      } else {
        p.rotation.z = targetRot;
        p.userData.rotVelocity = 0;
      }
    });

    this.renderer.render(this.scene, this.camera);
  }

  destroy() {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
    }
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
    }
    if (this.renderer && this.renderer.domElement && this.renderer.domElement.parentNode) {
      this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
    }
    this.scene.clear();
  }
}

// Keep piece within play boundaries
function pieceClampX(pos) {
  pos.x = Math.max(-5.8, Math.min(5.8, pos.x));
  pos.y = Math.max(-4.2, Math.min(4.2, pos.y));
}
