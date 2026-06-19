import * as THREE from 'three';
import { soundSynth } from './sound.js';

export class SuanpanAbacus {
  constructor(containerId, onValueChange) {
    this.container = document.getElementById(containerId);
    this.onValueChange = onValueChange;
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    
    // Abacus dimensions and state
    this.rodCount = 7;
    this.rodSpacing = 1.6;
    
    // State of each rod: { upperActive: 0..2, lowerActive: 0..5 }
    // Rod 0 is rightmost (Units), Rod 6 is leftmost (Millions)
    this.states = Array.from({ length: this.rodCount }, () => ({
      upper: 0, // Number of active upper beads (slid DOWN)
      lower: 0  // Number of active lower beads (slid UP)
    }));

    this.beads = []; // Flat array of all bead meshes for raycasting
    this.animationFrameId = null;
    this.resizeObserver = null;
  }

  init() {
    if (!this.container) return;

    // 1. Scene Setup
    this.scene = new THREE.Scene();

    // 2. Camera Setup
    this.camera = new THREE.PerspectiveCamera(40, this.container.clientWidth / this.container.clientHeight, 0.1, 100);
    this.camera.position.set(0, 0, 14); // Look straight at the abacus
    this.camera.lookAt(0, 0, 0);

    // 3. Renderer Setup
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.container.appendChild(this.renderer.domElement);

    // 4. Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    this.scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
    dirLight.position.set(5, 8, 10);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 1024;
    dirLight.shadow.mapSize.height = 1024;
    dirLight.shadow.bias = -0.001;
    this.scene.add(dirLight);

    // Cyan glowing point light (from bottom-left)
    const cyanLight = new THREE.PointLight(0x00f2fe, 1.5, 20);
    cyanLight.position.set(-6, -4, 4);
    this.scene.add(cyanLight);

    // Coral glowing point light (from top-right)
    const coralLight = new THREE.PointLight(0xff0844, 1.5, 20);
    coralLight.position.set(6, 4, 4);
    this.scene.add(coralLight);

    // Back light (for glass refraction glow)
    const backlit = new THREE.PointLight(0x6b21a8, 2.5, 30);
    backlit.position.set(0, 0, -3.0);
    this.scene.add(backlit);

    // 5. Build Abacus Model
    this.buildAbacus();

    // 6. Raycaster & Pointer Interaction
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    
    this.container.addEventListener('pointerdown', (e) => this.onPointerDown(e));

    // 7. Animation Loop
    this.animate();

    // 8. Handle Resize
    this.resizeObserver = new ResizeObserver(() => {
      if (!this.container || !this.renderer) return;
      this.camera.aspect = this.container.clientWidth / this.container.clientHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
    });
    this.resizeObserver.observe(this.container);

    // Initial value dispatch
    this.updateValue();
  }

  buildAbacus() {
    // Shared Materials
    const woodMaterial = new THREE.MeshStandardMaterial({
      color: 0x241710, // Dark walnut mahogany
      roughness: 0.35,
      metalness: 0.1
    });

    const brassMaterial = new THREE.MeshStandardMaterial({
      color: 0xcfb53b, // Brass metal
      roughness: 0.15,
      metalness: 0.85
    });

    // Abacus dimensions
    const width = 12.0;
    const height = 7.4;
    const depth = 0.6;
    const borderThickness = 0.4;
    const dividerY = 0.8; // Divider beam position

    // Frame Parts
    const topFrame = new THREE.Mesh(new THREE.BoxGeometry(width, borderThickness, depth), woodMaterial);
    topFrame.position.set(0, height / 2, 0);
    topFrame.receiveShadow = true;
    topFrame.castShadow = true;
    this.scene.add(topFrame);

    const bottomFrame = new THREE.Mesh(new THREE.BoxGeometry(width, borderThickness, depth), woodMaterial);
    bottomFrame.position.set(0, -height / 2, 0);
    bottomFrame.receiveShadow = true;
    bottomFrame.castShadow = true;
    this.scene.add(bottomFrame);

    const leftFrame = new THREE.Mesh(new THREE.BoxGeometry(borderThickness, height + borderThickness, depth), woodMaterial);
    leftFrame.position.set(-width / 2, 0, 0);
    leftFrame.receiveShadow = true;
    leftFrame.castShadow = true;
    this.scene.add(leftFrame);

    const rightFrame = new THREE.Mesh(new THREE.BoxGeometry(borderThickness, height + borderThickness, depth), woodMaterial);
    rightFrame.position.set(width / 2, 0, 0);
    rightFrame.receiveShadow = true;
    rightFrame.castShadow = true;
    this.scene.add(rightFrame);

    // Divider Beam
    const dividerBeam = new THREE.Mesh(new THREE.BoxGeometry(width - borderThickness, 0.35, depth), woodMaterial);
    dividerBeam.position.set(0, dividerY, 0);
    dividerBeam.receiveShadow = true;
    dividerBeam.castShadow = true;
    this.scene.add(dividerBeam);

    // Brass corner accents (pure aesthetic styling)
    const cornerGeo = new THREE.BoxGeometry(0.5, 0.5, 0.62);
    const corners = [
      [width/2, height/2], [width/2, -height/2], [-width/2, height/2], [-width/2, -height/2]
    ];
    corners.forEach(([cx, cy]) => {
      const corner = new THREE.Mesh(cornerGeo, brassMaterial);
      corner.position.set(cx, cy, 0);
      this.scene.add(corner);
    });

    // Glassmorphic Beads Materials (glowing amber and turquoise)
    const upperBeadMaterial = new THREE.MeshPhysicalMaterial({
      color: 0xffa044, // Amber-gold
      roughness: 0.05,
      metalness: 0.1,
      transmission: 0.9, // Higher glass transparency
      thickness: 0.8,    // Thicker refraction
      ior: 1.5,
      clearcoat: 1.0,
      clearcoatRoughness: 0.05
    });

    const lowerBeadMaterial = new THREE.MeshPhysicalMaterial({
      color: 0x00f2fe, // Turquoise-cyan
      roughness: 0.05,
      metalness: 0.1,
      transmission: 0.9,
      thickness: 0.8,
      ior: 1.5,
      clearcoat: 1.0,
      clearcoatRoughness: 0.05
    });

    // Generate Rods and Beads
    const rodGeo = new THREE.CylinderGeometry(0.06, 0.06, height - 0.2, 8);
    const beadRadius = 0.5;
    const beadHeight = 0.38;
    // Bi-conical/squashed bead geometry
    const beadGeo = new THREE.SphereGeometry(beadRadius, 32, 16);
    beadGeo.scale(1.0, 0.5, 1.0); // Squash sphere on Y axis to look like an abacus bead

    // Boundaries relative to center
    // Upper deck: from dividerY + 0.175 (beam) to height/2 - 0.2 (top frame)
    this.upperMinY = dividerY + 0.175; // Active position (pushed DOWN to beam)
    this.upperMaxY = (height / 2) - 0.2; // Inactive position (pushed UP to top)
    
    // Lower deck: from bottomFrame Y + 0.2 to dividerY - 0.175
    this.lowerMinY = -(height / 2) + 0.2; // Inactive position (pushed DOWN to bottom)
    this.lowerMaxY = dividerY - 0.175;  // Active position (pushed UP to beam)

    const startX = -((this.rodCount - 1) / 2) * this.rodSpacing;

    for (let r = 0; r < this.rodCount; r++) {
      const rodX = startX + r * this.rodSpacing;

      // Add metal rod
      const rod = new THREE.Mesh(rodGeo, brassMaterial);
      rod.position.set(rodX, 0, -0.05);
      rod.receiveShadow = true;
      this.scene.add(rod);

      // Create Beads for this Rod
      const rodBeads = {
        upper: [],
        lower: []
      };

      // 1. Upper Deck Beads (2 beads per rod, value 5 each)
      for (let i = 0; i < 2; i++) {
        const bead = new THREE.Mesh(beadGeo, upperBeadMaterial);
        bead.castShadow = true;
        bead.receiveShadow = true;
        bead.position.set(rodX, this.upperMaxY - i * beadHeight, 0);
        
        // Metadata for interaction & animation
        bead.userData = {
          rod: r,
          deck: 'upper',
          index: i, // 0 is bottom (closest to beam), 1 is top (furthest)
          targetY: bead.position.y,
          velocity: 0
        };

        this.scene.add(bead);
        this.beads.push(bead);
        rodBeads.upper.push(bead);
      }

      // 2. Lower Deck Beads (5 beads per rod, value 1 each)
      for (let i = 0; i < 5; i++) {
        const bead = new THREE.Mesh(beadGeo, lowerBeadMaterial);
        bead.castShadow = true;
        bead.receiveShadow = true;
        bead.position.set(rodX, this.lowerMinY + i * beadHeight, 0);

        // Metadata
        bead.userData = {
          rod: r,
          deck: 'lower',
          index: i, // 0 is bottom (furthest from beam), 4 is top (closest)
          targetY: bead.position.y,
          velocity: 0
        };

        this.scene.add(bead);
        this.beads.push(bead);
        rodBeads.lower.push(bead);
      }

      // Track references to animate them easily
      this.states[r].beads = rodBeads;
    }
  }

  // Update target positions of beads based on active counts
  arrangeBeads(rodIndex) {
    const rod = this.states[rodIndex];
    const beadHeight = 0.38;

    // 1. Arrange Upper Deck (active count is rod.upper: 0, 1, or 2)
    // Active upper beads slide DOWN towards beam. Inactive slide UP.
    // Bead index 0 is bottom (closest to beam), 1 is top (furthest).
    const uCount = rod.upper;
    for (let i = 0; i < 2; i++) {
      const bead = rod.beads.upper[i];
      let targetY;
      
      if (i < uCount) {
        // Active: pushed DOWN to beam
        targetY = this.upperMinY + (beadHeight / 2) + i * beadHeight;
      } else {
        // Inactive: pushed UP to top
        // Index 1 rests at upperMaxY, index 0 rests at upperMaxY - beadHeight
        const posFromTop = 1 - i; // 0 for index 1, 1 for index 0
        targetY = this.upperMaxY - (beadHeight / 2) - posFromTop * beadHeight;
      }
      bead.userData.targetY = targetY;
    }

    // 2. Arrange Lower Deck (active count is rod.lower: 0..5)
    // Active lower beads slide UP towards beam. Inactive slide DOWN to bottom.
    // Bead index 4 is top (closest to beam), 0 is bottom (furthest).
    const lCount = rod.lower;
    for (let i = 0; i < 5; i++) {
      const bead = rod.beads.lower[i];
      let targetY;

      if (i >= 5 - lCount) {
        // Active: pushed UP to beam
        // The active beads are the top lCount beads. E.g. if lCount = 1, bead 4 is active.
        const posFromBeam = 4 - i; // 0 for index 4, 1 for index 3, etc.
        targetY = this.lowerMaxY - (beadHeight / 2) - posFromBeam * beadHeight;
      } else {
        // Inactive: pushed DOWN to bottom
        // Index 0 rests at lowerMinY, index 1 rests at lowerMinY + beadHeight, etc.
        targetY = this.lowerMinY + (beadHeight / 2) + i * beadHeight;
      }
      bead.userData.targetY = targetY;
    }
  }

  onPointerDown(event) {
    event.preventDefault();

    // Get click coordinates relative to the container element
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.pointer, this.camera);
    const intersects = this.raycaster.intersectObjects(this.beads);

    if (intersects.length > 0) {
      const clickedBead = intersects[0].object;
      const { rod, deck, index } = clickedBead.userData;
      
      this.handleBeadClick(rod, deck, index);
    }
  }

  handleBeadClick(rodIndex, deck, index) {
    const rod = this.states[rodIndex];
    let changeOccurred = false;
    let beadsMoved = 0;

    if (deck === 'upper') {
      const activeCount = rod.upper;
      const isClickedActive = index < activeCount;

      if (isClickedActive) {
        // Clicked an active bead -> pull UP (deactivate) this and all above it
        // e.g. clicking index 0 deactivates index 0 & 1 -> upper active becomes 0
        rod.upper = index;
        beadsMoved = activeCount - index;
      } else {
        // Clicked an inactive bead -> pull DOWN (activate) this and all below it
        // e.g. clicking index 1 activates index 0 & 1 -> upper active becomes 2
        rod.upper = index + 1;
        beadsMoved = (index + 1) - activeCount;
      }
      changeOccurred = true;
    } else if (deck === 'lower') {
      const activeCount = rod.lower;
      const isClickedActive = index >= (5 - activeCount);

      if (isClickedActive) {
        // Clicked an active bead -> push DOWN (deactivate) this and all below it
        // e.g. activeCount = 3 (beads 2,3,4 are UP). Click index 3.
        // Index 3 and 2 go down. Only bead 4 remains UP. New activeCount = 1 (5 - 4).
        rod.lower = 4 - index;
        beadsMoved = activeCount - rod.lower;
      } else {
        // Clicked an inactive bead -> push UP (activate) this and all above it
        // e.g. activeCount = 1 (bead 4 is UP). Click index 1.
        // Index 1, 2, 3 slide UP. Beads 1,2,3,4 are now UP. New activeCount = 4 (5 - 1).
        rod.lower = 5 - index;
        beadsMoved = rod.lower - activeCount;
      }
      changeOccurred = true;
    }

    if (changeOccurred) {
      // Re-arrange targets for this rod's beads
      this.arrangeBeads(rodIndex);
      
      // Calculate dynamic clack volume based on number of beads sliding
      const volume = Math.min(1.0, 0.4 + beadsMoved * 0.15);
      soundSynth.playClack(volume);

      this.updateValue();
    }
  }

  // Calculate current numerical value represented on the abacus
  updateValue() {
    let total = 0;
    const rodValues = [];

    for (let r = 0; r < this.rodCount; r++) {
      const rod = this.states[r];
      const val = (rod.upper * 5) + rod.lower;
      rodValues.push(val);
      
      // Rod index 0 is units (10^0), 1 is tens (10^1), etc.
      total += val * Math.pow(10, r);
    }

    if (this.onValueChange) {
      this.onValueChange(total, rodValues);
    }
  }

  setValue(number) {
    if (number < 0) return;
    
    // Decompose number into digits (up to 7 digits)
    let temp = number;
    for (let r = 0; r < this.rodCount; r++) {
      const digit = temp % 10;
      temp = Math.floor(temp / 10);

      const rod = this.states[r];
      // Convert digit (0..9) to bi-quinary
      if (digit >= 5) {
        rod.upper = 1;
        rod.lower = digit - 5;
      } else {
        rod.upper = 0;
        rod.lower = digit;
      }

      this.arrangeBeads(r);
    }

    this.updateValue();
  }

  reset() {
    for (let r = 0; r < this.rodCount; r++) {
      this.states[r].upper = 0;
      this.states[r].lower = 0;
      this.arrangeBeads(r);
    }
    soundSynth.playClack(0.8);
    this.updateValue();
  }

  animate() {
    this.animationFrameId = requestAnimationFrame(() => this.animate());

    // Prevent rendering if the container size is 0 to avoid WebGL frame buffer crashes
    if (!this.container || this.container.clientWidth === 0 || this.container.clientHeight === 0) {
      return;
    }

    const springStiffness = 0.14;
    const damping = 0.72;

    // Smoothly slide beads using spring-damper physics (tactile bouncing)
    this.beads.forEach(bead => {
      const targetY = bead.userData.targetY;
      
      if (bead.userData.velocity === undefined) {
        bead.userData.velocity = 0;
      }

      const displacement = targetY - bead.position.y;
      const force = displacement * springStiffness;
      
      bead.userData.velocity += force;
      bead.userData.velocity *= damping;
      bead.position.y += bead.userData.velocity;

      // Snapping
      if (Math.abs(displacement) < 0.001 && Math.abs(bead.userData.velocity) < 0.001) {
        bead.position.y = targetY;
        bead.userData.velocity = 0;
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
