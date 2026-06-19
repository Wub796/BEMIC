import * as THREE from 'three';

export function initHeroCanvas() {
  const container = document.getElementById('hero-canvas-container');
  if (!container) return;

  // 1. Scene & Setup
  const scene = new THREE.Scene();
  
  // Camera
  const camera = new THREE.PerspectiveCamera(60, container.clientWidth / container.clientHeight, 0.1, 100);
  camera.position.z = 15;

  // Renderer
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  container.appendChild(renderer.domElement);

  // 2. Light Sources
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
  scene.add(ambientLight);

  const pointLight1 = new THREE.PointLight(0x00f2fe, 1.5, 40); // Neon blue
  pointLight1.position.set(10, 10, 10);
  scene.add(pointLight1);

  const pointLight2 = new THREE.PointLight(0xff0844, 1.2, 40); // Neon coral
  pointLight2.position.set(-10, -10, 5);
  scene.add(pointLight2);

  // 3. Create Textures for Numbers/Symbols (Bilingual & Math)
  const symbols = [
    '1', '2', '3', '5', '8', 'X', 'Y', 'Z',
    '一', '二', '三', '五', '八', '十',
    '+', '−', '=', '÷', 'π', '√', '∫', 'Δ'
  ];

  const textures = symbols.map(char => createTextTexture(char));
  
  // 4. Create floating elements
  const particleCount = 45;
  const particles = [];

  // Material settings
  const geometryList = [
    new THREE.IcosahedronGeometry(0.8, 1),
    new THREE.TorusGeometry(0.6, 0.2, 8, 24),
    new THREE.OctahedronGeometry(0.7, 0),
    new THREE.BoxGeometry(0.8, 0.8, 0.8),
    new THREE.ConeGeometry(0.5, 1, 6)
  ];

  for (let i = 0; i < particleCount; i++) {
    let mesh;

    // Alternating between 3D Wireframe shapes and Text Sprites
    if (i % 2 === 0) {
      // Wireframe Shape
      const geom = geometryList[Math.floor(Math.random() * geometryList.length)];
      const wireframe = new THREE.WireframeGeometry(geom);
      const lineMat = new THREE.LineBasicMaterial({
        color: i % 4 === 0 ? 0x00f2fe : (i % 4 === 1 ? 0xff0844 : 0x00ffcc),
        transparent: true,
        opacity: 0.35 + Math.random() * 0.4
      });
      mesh = new THREE.LineSegments(wireframe, lineMat);
    } else {
      // Text Plane/Sprite
      const texture = textures[Math.floor(Math.random() * textures.length)];
      const mat = new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        opacity: 0.4 + Math.random() * 0.45,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending
      });
      const size = 1.0 + Math.random() * 0.8;
      const geom = new THREE.PlaneGeometry(size, size);
      mesh = new THREE.Mesh(geom, mat);
    }

    // Distribute randomly in space
    mesh.position.set(
      (Math.random() - 0.5) * 30,
      (Math.random() - 0.5) * 20,
      (Math.random() - 0.5) * 15 - 5
    );

    // Random rotation speed & axis
    mesh.userData = {
      rotX: (Math.random() - 0.5) * 0.015,
      rotY: (Math.random() - 0.5) * 0.015,
      rotZ: (Math.random() - 0.5) * 0.01,
      floatSpeed: 0.002 + Math.random() * 0.005,
      floatRange: 1 + Math.random() * 2,
      baseY: mesh.position.y,
      baseX: mesh.position.x,
      time: Math.random() * 100
    };

    scene.add(mesh);
    particles.push(mesh);
  }

  // 4b. Dynamic connection lines (Constellation effect)
  const lineGeom = new THREE.BufferGeometry();
  const lineMat = new THREE.LineBasicMaterial({
    color: 0x00f2fe,
    transparent: true,
    opacity: 0.12,
    blending: THREE.AdditiveBlending
  });
  const connectionLines = new THREE.LineSegments(lineGeom, lineMat);
  scene.add(connectionLines);

  // 5. Mouse Interaction for Parallax
  let mouseX = 0;
  let mouseY = 0;
  let targetX = 0;
  let targetY = 0;

  window.addEventListener('pointermove', (event) => {
    // Normalised coordinates (-1 to 1)
    targetX = (event.clientX / window.innerWidth) * 2 - 1;
    targetY = -(event.clientY / window.innerHeight) * 2 + 1;
  });

  // 6. Animation loop
  let animationFrameId;

  function animate() {
    animationFrameId = requestAnimationFrame(animate);

    // Prevent rendering if the container size is 0 to avoid WebGL frame buffer crashes
    if (container.clientWidth === 0 || container.clientHeight === 0) {
      return;
    }

    // Slow interpolation (lerp) for smooth parallax camera lag
    mouseX += (targetX - mouseX) * 0.05;
    mouseY += (targetY - mouseY) * 0.05;

    camera.position.x = mouseX * 3;
    camera.position.y = mouseY * 2;
    camera.lookAt(0, 0, -2);

    // Update floating particles
    particles.forEach(p => {
      p.rotation.x += p.userData.rotX;
      p.rotation.y += p.userData.rotY;
      p.rotation.z += p.userData.rotZ;

      // Floating sine-wave translation
      p.userData.time += p.userData.floatSpeed;
      p.position.y = p.userData.baseY + Math.sin(p.userData.time) * p.userData.floatRange;
      p.position.x = p.userData.baseX + Math.cos(p.userData.time * 0.8) * (p.userData.floatRange * 0.5);
    });

    // Draw connector lines between close particles
    const linePositions = [];
    const maxDistance = 6.0;
    
    for (let i = 0; i < particles.length; i++) {
      for (let j = i + 1; j < particles.length; j++) {
        const dist = particles[i].position.distanceTo(particles[j].position);
        if (dist < maxDistance) {
          linePositions.push(
            particles[i].position.x, particles[i].position.y, particles[i].position.z,
            particles[j].position.x, particles[j].position.y, particles[j].position.z
          );
        }
      }
    }

    lineGeom.setAttribute('position', new THREE.Float32BufferAttribute(linePositions, 3));
    lineGeom.computeBoundingSphere(); // Necessary to prevent frustum culling bugs

    renderer.render(scene, camera);
  }

  animate();

  // 7. Handle Resize
  function handleResize() {
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  }

  const resizeObserver = new ResizeObserver(() => handleResize());
  resizeObserver.observe(container);

  // Return clean-up function to avoid leaks if hot reloaded
  return () => {
    cancelAnimationFrame(animationFrameId);
    resizeObserver.disconnect();
    if (renderer.domElement && renderer.domElement.parentNode) {
      renderer.domElement.parentNode.removeChild(renderer.domElement);
    }
    scene.clear();
  };
}

// Helper to draw text onto canvas texture with high quality and glow
function createTextTexture(text) {
  const canvas = document.createElement('canvas');
  const size = 128;
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  // Clear
  ctx.clearRect(0, 0, size, size);

  // Glow shadow
  ctx.shadowColor = '#00f2fe';
  ctx.shadowBlur = 15;
  ctx.fillStyle = '#ffffff';

  // Choose font based on English vs Chinese for best aesthetics
  const isChinese = /[\u4e00-\u9fa5]/.test(text);
  ctx.font = isChinese 
    ? 'bold 64px "STKaiti", "KaiTi", "PingFang SC", sans-serif'
    : 'bold 68px "Outfit", "Arial", sans-serif';
    
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Slight color variance for variety
  if (['+', '−', '=', '÷', 'π', '√', '∫', 'Δ'].includes(text)) {
    ctx.fillStyle = '#00ffcc'; // Teal for math operations
    ctx.shadowColor = '#00ffcc';
  } else if (isChinese) {
    ctx.fillStyle = '#ff7b7b'; // Coral-red for Chinese
    ctx.shadowColor = '#ff3366';
  }

  ctx.fillText(text, size / 2, size / 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  return texture;
}
