(function () {
  if (typeof THREE === 'undefined') return;

  var canvas = document.getElementById('bgCanvas');
  if (!canvas) return;

  var renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas: canvas, alpha: true, antialias: true, powerPreference: 'low-power' });
  } catch (e) {
    return;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));

  var scene = new THREE.Scene();
  var camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 1, 2000);
  camera.position.set(0, 0, 420);

  var group = new THREE.Group();
  scene.add(group);

  var PARTICLE_COUNT = window.innerWidth < 720 ? 55 : 100;
  var SPREAD = 560;
  var LINK_DIST = 118;

  function getThemeColors() {
    var style = getComputedStyle(document.documentElement);
    var accent = style.getPropertyValue('--accent').trim() || '#37e6b0';
    var accent2 = style.getPropertyValue('--accent-2').trim() || '#4f8dff';
    return { accent: accent, accent2: accent2 };
  }

  // Particles
  var positions = new Float32Array(PARTICLE_COUNT * 3);
  var velocities = [];
  for (var i = 0; i < PARTICLE_COUNT; i++) {
    positions[i * 3] = (Math.random() - 0.5) * SPREAD;
    positions[i * 3 + 1] = (Math.random() - 0.5) * SPREAD * 0.65;
    positions[i * 3 + 2] = (Math.random() - 0.5) * SPREAD * 0.6;
    velocities.push(
      new THREE.Vector3(
        (Math.random() - 0.5) * 0.16,
        (Math.random() - 0.5) * 0.16,
        (Math.random() - 0.5) * 0.12
      )
    );
  }

  var particleGeometry = new THREE.BufferGeometry();
  particleGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

  var colors = getThemeColors();
  var particleMaterial = new THREE.PointsMaterial({
    color: new THREE.Color(colors.accent2),
    size: 3.2,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.75,
    depthWrite: false
  });
  var points = new THREE.Points(particleGeometry, particleMaterial);
  group.add(points);

  // Connecting lines (constellation effect), rebuilt periodically (not every frame)
  var maxLineSegments = PARTICLE_COUNT * 6;
  var linePositions = new Float32Array(maxLineSegments * 2 * 3);
  var lineGeometry = new THREE.BufferGeometry();
  lineGeometry.setAttribute('position', new THREE.BufferAttribute(linePositions, 3));
  lineGeometry.setDrawRange(0, 0);

  var lineMaterial = new THREE.LineBasicMaterial({
    color: new THREE.Color(colors.accent),
    transparent: true,
    opacity: 0.2,
    depthWrite: false
  });
  var lines = new THREE.LineSegments(lineGeometry, lineMaterial);
  group.add(lines);

  function rebuildLinks() {
    var pos = particleGeometry.attributes.position.array;
    var linkDistSq = LINK_DIST * LINK_DIST;
    var segCount = 0;
    for (var a = 0; a < PARTICLE_COUNT && segCount < maxLineSegments; a++) {
      var ax = pos[a * 3], ay = pos[a * 3 + 1], az = pos[a * 3 + 2];
      for (var b = a + 1; b < PARTICLE_COUNT && segCount < maxLineSegments; b++) {
        var dx = ax - pos[b * 3];
        var dy = ay - pos[b * 3 + 1];
        var dz = az - pos[b * 3 + 2];
        var distSq = dx * dx + dy * dy + dz * dz;
        if (distSq < linkDistSq) {
          var li = segCount * 6;
          linePositions[li] = ax; linePositions[li + 1] = ay; linePositions[li + 2] = az;
          linePositions[li + 3] = pos[b * 3]; linePositions[li + 4] = pos[b * 3 + 1]; linePositions[li + 5] = pos[b * 3 + 2];
          segCount++;
        }
      }
    }
    lineGeometry.setDrawRange(0, segCount * 2);
    lineGeometry.attributes.position.needsUpdate = true;
  }

  function updateThemeColors() {
    var c = getThemeColors();
    particleMaterial.color.set(c.accent2);
    lineMaterial.color.set(c.accent);
  }

  var mql = window.matchMedia('(prefers-color-scheme: dark)');
  if (mql.addEventListener) mql.addEventListener('change', updateThemeColors);
  var themeObserver = new MutationObserver(updateThemeColors);
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  // Mouse parallax
  var mouseX = 0, mouseY = 0, targetRotX = 0;
  window.addEventListener('mousemove', function (e) {
    mouseX = (e.clientX / window.innerWidth) * 2 - 1;
    mouseY = (e.clientY / window.innerHeight) * 2 - 1;
  }, { passive: true });

  function onResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  }
  window.addEventListener('resize', onResize);
  onResize();

  // Stop cleanly if the WebGL context is lost (weak/old GPUs, driver issues)
  var contextLost = false;
  canvas.addEventListener('webglcontextlost', function (e) {
    e.preventDefault();
    contextLost = true;
  });
  canvas.addEventListener('webglcontextrestored', function () {
    contextLost = false;
  });

  // Pause rendering when the tab is hidden to save resources
  var isHidden = false;
  document.addEventListener('visibilitychange', function () {
    isHidden = document.hidden;
  });

  var clock = new THREE.Clock();
  var frameCount = 0;

  function animate() {
    requestAnimationFrame(animate);
    if (contextLost || isHidden) return;

    var dt = Math.min(clock.getDelta(), 0.05);
    frameCount++;

    // Drift particles and softly bounce within bounds
    var pos = particleGeometry.attributes.position.array;
    var boundX = SPREAD / 2, boundY = SPREAD * 0.325, boundZ = SPREAD * 0.3;
    for (var i = 0; i < PARTICLE_COUNT; i++) {
      var ix = i * 3;
      pos[ix] += velocities[i].x;
      pos[ix + 1] += velocities[i].y;
      pos[ix + 2] += velocities[i].z;
      if (pos[ix] > boundX || pos[ix] < -boundX) velocities[i].x *= -1;
      if (pos[ix + 1] > boundY || pos[ix + 1] < -boundY) velocities[i].y *= -1;
      if (pos[ix + 2] > boundZ || pos[ix + 2] < -boundZ) velocities[i].z *= -1;
    }
    particleGeometry.attributes.position.needsUpdate = true;

    // Recompute constellation links every 3rd frame — plenty smooth, far cheaper
    if (frameCount % 3 === 0) rebuildLinks();

    // Slow autonomous rotation + subtle mouse parallax
    group.rotation.y += dt * 0.045;
    targetRotX += (mouseY * 0.12 - targetRotX) * 0.03;
    group.rotation.x = targetRotX;
    camera.position.x += (mouseX * 30 - camera.position.x) * 0.02;
    camera.position.y += (-mouseY * 20 - camera.position.y) * 0.02;
    camera.lookAt(scene.position);

    renderer.render(scene, camera);
  }
  animate();
})();
