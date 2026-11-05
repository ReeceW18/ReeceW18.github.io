// =============================================
// CONFIG
// =============================================

let mode = 'procedural'

let multiplier = 0.05;
const MIN_MULT = 0.05;
let MAX_MULT = 5.0;

// camera
const camera = {
  pos: [0,0,0], // overriden by the camera path generation
  focus: [0, 0, 0],
  up: [0, 1, 0],
  radius: 400 * (multiplier**0.8),
  height: 200,
  speed: 0.8,
}
const PERSPECTIVE = {
  fov: Math.PI/4,
  near: 10.0,
  far: 10000,
}

// boat
const boat = {
  pos: [0, 8, 0],
  angle: 0,
}
const bezier = {
  p0: [50, 8, 0],
  p1: [0, 8, 150],
  p2: [-100, 8, 0],
  p3: [0, 8, -50],
}

// grid
let GRID_SIZE = parseInt(100 * multiplier);
const SPACING = 2.0;

// colors
const BACKGROUND_COLOR = [0.153, 0.078, 0.114, 1];
const BOAT_COLOR = [0.404, 0.208, 0.212];
const SAIL_COLOR = [0.871, 0.859, 0.824];

// =========================================
// WEBGL SETUP
// =========================================

// --------------- INIT ---------------

const canvas = document.getElementById('canvas');
const gl = canvas.getContext('webgl2');

// gracefully handle webgl not loading
if (!gl) {
  // 1. Hide the broken canvas and controls
  canvas.style.display = 'none';
  const controls = document.querySelector('.controls');
  if (controls) controls.style.display = 'none';

  // 2. Display the fallback message
  const fallback = document.getElementById('no-webgl');
  if (fallback) fallback.style.display = 'block';

  // 3. Stop script execution cleanly without throwing an unhandled error
  console.warn('WebGL 2 is not supported or was disabled on this device.');
  // Return or stop further execution
  throw new Error('WebGL 2 not supported');
}

// global webgl config
gl.enable(gl.DEPTH_TEST);
gl.enable(gl.CULL_FACE);
gl.cullFace(gl.BACK);

// --------------- SCENE GEOMETRY & VBO INFO ---------------

// define cube
const cubeVertices = new Float32Array([
  // Front face (normal points toward +z)
  -1, 0, 1,   0, 0, 1,
   1, 0, 1,   0, 0, 1,
   1, 2, 1,   0, 0, 1,
  -1, 0, 1,   0, 0, 1,
   1, 2, 1,   0, 0, 1,
  -1, 2, 1,   0, 0, 1,

  // Back face (-z)
  -1, 0, -1,  0, 0, -1,
   1, 2, -1,  0, 0, -1,
   1, 0, -1,  0, 0, -1,
  -1, 0, -1,  0, 0, -1,
  -1, 2, -1,  0, 0, -1,
   1, 2, -1,  0, 0, -1,

  // Top face (+y)
  -1, 2, -1,  0, 1, 0,
  -1, 2,  1,  0, 1, 0,
   1, 2,  1,  0, 1, 0,
  -1, 2, -1,  0, 1, 0,
   1, 2,  1,  0, 1, 0,
   1, 2, -1,  0, 1, 0,

  // Bottom face (-y)
  -1, 0, -1,  0, -1, 0,
   1, 0,  1,  0, -1, 0,
  -1, 0,  1,  0, -1, 0,
  -1, 0, -1,  0, -1, 0,
   1, 0, -1,  0, -1, 0,
   1, 0,  1,  0, -1, 0,

  // Right face (+x)
   1, 0, -1,  1, 0, 0,
   1, 2, -1,  1, 0, 0,
   1, 2,  1,  1, 0, 0,
   1, 0, -1,  1, 0, 0,
   1, 2,  1,  1, 0, 0,
   1, 0,  1,  1, 0, 0,

  // Left face (-x)
  -1, 0, -1, -1, 0, 0,
  -1, 2,  1, -1, 0, 0,
  -1, 2, -1, -1, 0, 0,
  -1, 0, -1, -1, 0, 0,
  -1, 0,  1, -1, 0, 0,
  -1, 2,  1, -1, 0, 0,
]);
const VERTEX_COUNT = 36;
const BYTES_PER_FLOAT = 4;
const stride = 6 * BYTES_PER_FLOAT;

// --------------- SHADERS ---------------

function compileShader(type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(shader));
  }
  return shader;
}

// vertex shader for cube grid
const vertexShaderSource = `#version 300 es
  // attributes
  in vec3 aPosition;
  in vec3 aNormal;

  // uniforms
  // matrices
  uniform mat4 uView;
  uniform mat4 uProjection;
  // configuration
  uniform int uMode;
  uniform int uGridSize;
  uniform float uSpacing;
  uniform float uMultiplier;
  // textures
  uniform sampler2D uHeightMap;
  uniform sampler2D uColorMap;

  // varyings
  out vec3 vNormal;
  out vec3 vColor;

  // psuedorandom noise for some x,y position
  float rand(vec2 co) {
    return fract(sin(dot(co, vec2(12.9315, 78.0452))) * 43758.5453);
  }

  // get terrain height from simple layered sine/cosine waves
  float getTerrainHeight(float x, float z) {
    float h = 0.0;
    float m = 150.0;
    h += sin((x-m) * 0.01) * cos(z * 0.01) * 50.0;
    h += sin((x-m) * 0.04 + 1.5) * sin(z * 0.04) * 10.0;
    h += cos((x-m) * 0.16) * sin(z * 0.16+2.3) * 2.0;

    return max(1.0, h+30.0);
  }

  // blends from ocean-beach-grass-stone-snow based on height, creates variation
  // with location based noise
  vec3 terrainColor(vec3 worldPos) {
    // define colors
    vec3 blue   = vec3(0.329, 0.522, 0.549);
    vec3 yellow = vec3(0.976, 0.761, 0.529);
    vec3 green  = vec3(0.769, 0.592, 0.302);
    vec3 grey   = vec3(0.702, 0.643, 0.624);
    vec3 white  = vec3(1.0, 1.0, 1.0);

    // get noisy height
    float noise = (rand(worldPos.xz)-0.5) * 3.0;
    float h = worldPos.y + noise;

    // get magnitidue of each color
    float tYellow = smoothstep(  4.0,  5.0, h);
    float tGreen  = smoothstep( 10.0,  50.0, h);
    float tGrey   = smoothstep( 70.0, 100.0, h);
    float tWhite  = smoothstep(110.0, 140.0, h);

    // mix colors
    vec3 color = blue;
    color = mix(color, yellow, tYellow);
    color = mix(color, green, tGreen);
    color = mix(color, grey, tGrey);
    color = mix(color, white, tWhite);

    return color;
  }

  void main() {
    // get the position of the cube in the grid
    int row = gl_InstanceID / uGridSize;
    int col = gl_InstanceID % uGridSize;

    // get cube world location from grid position
    float x = (float(col) - (float(uGridSize) - 1.0) / 2.0) * uSpacing;
    float z = (float(row) - (float(uGridSize) - 1.0) / 2.0) * uSpacing;

    // set placeholders
    float height = 0.0;
    vec3 color = vec3(1.0);

    // set world position besides height
    vec4 worldPos = vec4(aPosition, 1.0);
    worldPos.x += x;
    worldPos.z += z;

    // mode 0: procedural, use getTerrainHeight for height and color
    // mode 1: image, sample textures for height and color
    if (uMode == 0) {
      height = getTerrainHeight(x,z);
      worldPos.y *= height;
      color = terrainColor(worldPos.xyz);
    } else {
      vec2 uv = vec2(float(col) / float(uGridSize-1), float(row) / float(uGridSize-1));

      // use equal weighting of r,g,b for height scalar
      float imgHeight = dot(texture(uHeightMap, uv).rgb, vec3(1.0/3.0));

      height = imgHeight * 20.0 * uMultiplier;
      color = texture(uColorMap, uv).rgb;

      worldPos.y *= height;
    }

    vNormal = aNormal;
    vColor = color;

    gl_Position = uProjection * uView * worldPos;
  }
`;
// generic vertex shader that draws any cube with model matrix, used to draw boat
const simpleVertexShaderSource = `#version 300 es
  in vec3 aPosition;
  in vec3 aNormal;

  uniform mat4 uModel;
  uniform mat4 uView;
  uniform mat4 uProjection;
  uniform vec3 uColor;

  out vec3 vNormal;
  out vec3 vColor;

  void main() {
    vNormal = aNormal;
    vColor = uColor;
    gl_Position = uProjection * uView * uModel * vec4(aPosition, 1.0);
  }
`;
// shared fragment shader
const fragmentShaderSource = `#version 300 es
  precision mediump float;

  in vec3 vNormal;
  in vec3 vColor;

  out vec4 fragColor;

  void main() {
    vec3 lightDirection = normalize(vec3(0.4,0.9,0.3));

    float brightness = max(dot(vNormal, lightDirection), 0.0);

    float light = min(0.4 + 0.6 * brightness, 1.0);

    fragColor = vec4(vColor*light, 1.0);
  }
`;

// --------------- PROGRAMS SETUP ---------------

const program = gl.createProgram();
gl.attachShader(program, compileShader(gl.VERTEX_SHADER, vertexShaderSource));
gl.attachShader(program, compileShader(gl.FRAGMENT_SHADER, fragmentShaderSource));
gl.linkProgram(program);

const boatProgram = gl.createProgram();
gl.attachShader(boatProgram, compileShader(gl.VERTEX_SHADER, simpleVertexShaderSource));
gl.attachShader(boatProgram, compileShader(gl.FRAGMENT_SHADER, fragmentShaderSource));
gl.linkProgram(boatProgram);

// setup buffer
const buffer = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
gl.bufferData(gl.ARRAY_BUFFER, cubeVertices, gl.STATIC_DRAW);

// --------------- VERTEX ARRAY OBJECTS (VAO) SETUP ---------------

// VAO for program
const VAO = gl.createVertexArray();

gl.bindVertexArray(VAO);
gl.bindBuffer(gl.ARRAY_BUFFER, buffer);

const aPosition = gl.getAttribLocation(program, 'aPosition');
gl.enableVertexAttribArray(aPosition);
gl.vertexAttribPointer(aPosition, 3, gl.FLOAT, false, stride, 0);

const aNormal = gl.getAttribLocation(program, 'aNormal');
gl.enableVertexAttribArray(aNormal);
gl.vertexAttribPointer(aNormal, 3, gl.FLOAT, false, stride, 3 * BYTES_PER_FLOAT);

// VAO for boatProgram

const boatVAO = gl.createVertexArray();

gl.bindVertexArray(boatVAO);
gl.bindBuffer(gl.ARRAY_BUFFER, buffer);

const boatAPosition = gl.getAttribLocation(boatProgram, 'aPosition');
gl.enableVertexAttribArray(boatAPosition);
gl.vertexAttribPointer(boatAPosition, 3, gl.FLOAT, false, stride, 0);

const boatANormal = gl.getAttribLocation(boatProgram, 'aNormal');
gl.enableVertexAttribArray(boatANormal);
gl.vertexAttribPointer(boatANormal, 3, gl.FLOAT, false, stride, 3 * BYTES_PER_FLOAT);

// --------------- UNIFORM CACHE LOCATIONS ---------------

gl.useProgram(program);
const uView = gl.getUniformLocation(program, 'uView');
const uProjection = gl.getUniformLocation(program, 'uProjection');
const uGridSize = gl.getUniformLocation(program, 'uGridSize');
const uSpacing = gl.getUniformLocation(program, 'uSpacing');
const uHeightMap = gl.getUniformLocation(program, 'uHeightMap');
const uColorMap = gl.getUniformLocation(program, 'uColorMap');
const uMode = gl.getUniformLocation(program, 'uMode');
const uMultiplier = gl.getUniformLocation(program, 'uMultiplier');

gl.useProgram(boatProgram);
const boatUModel = gl.getUniformLocation(boatProgram, 'uModel');
const boatUView = gl.getUniformLocation(boatProgram, 'uView');
const boatUProjection = gl.getUniformLocation(boatProgram, 'uProjection');
const boatUColor = gl.getUniformLocation(boatProgram, 'uColor');

// --------------- LOAD TEXTURES ---------------

function loadTexture(gl, url) {
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);

  // set texture to single magenta pixel while waiting to load
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA,
    1,
    1,
    0,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    new Uint8Array([128, 128, 128, 255]),
  );

  const image = new Image();
  image.crossOrigin = 'anonymous';
  image.onload = () => {
    gl.bindTexture(gl.TEXTURE_2D, texture);

    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      image,
    );

    // set webgl texture settings
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  };
  image.src = url;

  return texture;
}

const heightMapTexture = loadTexture(gl, 'assets/heightmap.png');
const colorMapTexture = loadTexture(gl, 'assets/colormap.png');

// ------------- BIND CONSTANT TEXTURES AND UNIFORMS -------------

// bind textures
gl.activeTexture(gl.TEXTURE0);
gl.bindTexture(gl.TEXTURE_2D, heightMapTexture);

gl.activeTexture(gl.TEXTURE1);
gl.bindTexture(gl.TEXTURE_2D, colorMapTexture);

// bind constant uniforms
gl.useProgram(program);
gl.uniform1i(uHeightMap, 0);
gl.uniform1i(uColorMap, 1);
gl.uniform1f(uSpacing, SPACING);

// =====================================
// MATRIX GENERATION AND OPERATIONS
// =====================================

// Move a point by (x, y, z).
function translation(x, y, z) {
  return [
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    x, y, z, 1,
  ];
}

// Stretch a point by (sx, sy, sz).
function scaling(sx, sy, sz) {
  return [
    sx, 0,  0,  0,
    0,  sy, 0,  0,
    0,  0,  sz, 0,
    0,  0,  0,  1,
  ];
}

// Rotate by theta radians around y (up) axis
function rotationY(theta) {
  const c = Math.cos(theta);
  const s = Math.sin(theta);

  return [
    c, 0, -s, 0,
    0, 1,  0, 0,
    s, 0,  c, 0,
    0, 0,  0, 1,
  ];
}

// Multiply two matrices: the result does b first, then a.
function multiply(a, b) {
  const result = new Array(16).fill(0);
  for (let col = 0; col < 4; col++) {
    for (let row = 0; row < 4; row++) {
      for (let k = 0; k < 4; k++) {
        result[col * 4 + row] += a[k * 4 + row] * b[col * 4 + k];
      }
    }
  }
  return result;
}

// combine translation, scaling, and rotation for full model matrix
function modelMatrix(translate, scale, rotate) {
  return multiply(
    translate,
    multiply(
      rotate,
      scale,
    ),
  );
}

// get perspective matrix
// fieldOfView in radians
function perspective(fieldOfView, aspect, near, far) {
  const f = 1 / Math.tan(fieldOfView / 2);
  return [
    f / aspect, 0, 0,                               0,
    0,          f, 0,                               0,
    0,          0, (far + near) / (near - far),    -1,
    0,          0, (2 * far * near) / (near - far), 0,
  ];
}

// get view matrix
function lookAt(eye, target, up) {
  const subtract = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = (a, b) => [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
  const normalize = (a) => {
    const length = Math.hypot(a[0], a[1], a[2]);
    return [a[0] / length, a[1] / length, a[2] / length];
  };

  const zAxis = normalize(subtract(eye, target));
  const xAxis = normalize(cross(up, zAxis));
  const yAxis = cross(zAxis, xAxis);

  return [
    xAxis[0], yAxis[0], zAxis[0], 0,
    xAxis[1], yAxis[1], zAxis[1], 0,
    xAxis[2], yAxis[2], zAxis[2], 0,
    -dot(xAxis, eye), -dot(yAxis, eye), -dot(zAxis, eye), 1,
  ]
}

// classic linear interpolation between two points
const lerp = (a, b, t) => a.map((n, i) => n + (b[i] - n) * t);

// ====================================
// DRAW FUNCTIONS
// ====================================

function drawCubes() {
  gl.drawArraysInstanced(
    gl.TRIANGLES,
    0,
    VERTEX_COUNT,
    GRID_SIZE * GRID_SIZE,
  );
}

function drawBoat(position, theta) {
  // body
  let model = modelMatrix(
    translation(...position),
    scaling(10, 1, 3),
    rotationY(theta),
  );
  gl.uniformMatrix4fv(boatUModel, false, model);
  gl.uniform3fv(boatUColor, BOAT_COLOR);
  gl.drawArrays(gl.TRIANGLES, 0, VERTEX_COUNT);

  // mast
  model = modelMatrix(
    translation(...position),
    scaling(1,10,1),
    rotationY(theta),
  );
  gl.uniformMatrix4fv(boatUModel, false, model);
  gl.uniform3fv(boatUColor, BOAT_COLOR);
  gl.drawArrays(gl.TRIANGLES, 0, VERTEX_COUNT);

  // sail
  model = modelMatrix(
    translation(position[0], position[1] + 10, position[2]),
    scaling(1.5,4,8),
    rotationY(theta),
  );
  gl.uniformMatrix4fv(boatUModel, false, model);
  gl.uniform3fv(boatUColor, SAIL_COLOR);
  gl.drawArrays(gl.TRIANGLES, 0, VERTEX_COUNT);
}

function draw() {
  canvas.width = canvas.clientWidth;
  canvas.height = canvas.clientHeight;

  // Which rectangle of the canvas to draw to
  gl.viewport(0, 0, canvas.width, canvas.height);

  // clear canvas with color (rgba from 0 to 1)
  gl.clearColor(...BACKGROUND_COLOR);

  // clear depth data from previous calls
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  const aspect = canvas.width / canvas.height;

  // calculate static matrices
  const { fov, near, far } = PERSPECTIVE;
  const perspectiveMatrix = perspective(fov, aspect, near, far);
  const viewMatrix = lookAt(camera.pos, camera.focus, camera.up);

  // bind program and gpu variables
  gl.useProgram(program);
  gl.bindVertexArray(VAO);

  // load matrices
  gl.uniformMatrix4fv(uProjection, false, perspectiveMatrix);
  gl.uniformMatrix4fv(uView, false, viewMatrix);

  let currentMode = 0;
  if (mode == 'procedural') currentMode = 0;
  if (mode == 'image') currentMode = 1;

  // bind uniform ints and floats
  gl.uniform1i(uGridSize, GRID_SIZE);

  gl.uniform1i(uMode, currentMode);
  gl.uniform1f(uMultiplier, multiplier);

  drawCubes();

  if (mode == 'procedural') {
    gl.useProgram(boatProgram);
    gl.bindVertexArray(boatVAO);

    gl.uniformMatrix4fv(boatUProjection, false, perspectiveMatrix);
    gl.uniformMatrix4fv(boatUView, false, viewMatrix);

    drawBoat(boat.pos, boat.angle);
  }
}

// ====================================
// ANIMATION LOOP
// ====================================

let delta = 0;
let lastTime = 0;

// returns {pos} {angle}
function getBoatInfo(oldPos, currentTime) {
  const t = currentTime;

  // de casteljaus algorithm for finding a point on bezier curve
  const a = lerp(bezier.p0, bezier.p1, t);
  const b = lerp(bezier.p1, bezier.p2, t);
  const c = lerp(bezier.p2, bezier.p3, t);

  const d = lerp(a, b, t);
  const e = lerp(b, c, t);

  const pos = lerp(d, e, t);

  // atan2 gives angle between x axis and the given 2d vector, feeding in dx, dz
  // gives the heading of the boat
  const angle = Math.atan2(pos[0] - oldPos[0], pos[2] - oldPos[2]);
  return {pos, angle};
}

function setCameraPos(camera, delta) {
  camera.pos[0] = Math.cos(delta) * camera.radius;
  camera.pos[1] = camera.height;
  camera.pos[2] = Math.sin(delta) * camera.radius;
}

function loop(currentTime) {
  currentTime *= 0.001;
  const CYCLE_DURATION = 10.0;
  const cycleProgress = (currentTime % CYCLE_DURATION) / CYCLE_DURATION;
  const dTime = currentTime - lastTime;
  lastTime = currentTime;

  delta += camera.speed * dTime;

  const easeOut = Math.pow(cycleProgress, 2.0);
  multiplier = MIN_MULT + (MAX_MULT - MIN_MULT) * easeOut;

  setCameraPos(camera, delta);
  camera.radius = 400 * (multiplier ** 0.8);
  camera.height = Math.max(100, 300 * (multiplier ** 0.8));
  GRID_SIZE = parseInt(100 * multiplier);

  const {pos, angle} = getBoatInfo(boat.pos, cycleProgress);
  boat.pos = pos;
  boat.angle = angle + Math.PI/2; // adjust for x+ axis and boat heading being offset by 90 degrees

  draw();

  requestAnimationFrame(loop);
}

// ======================================
// CONTROLS EVENT LISTENERS
// ======================================

const controls = document.querySelector('.controls');

if (controls) {
  controls.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn || !btn.dataset.mode) return;

    mode = btn.dataset.mode;
  });
}

window.addEventListener('keydown', (e) => {
  const keyMap = {
    '1': 'procedural',
    '2': 'image',
  };
  if (keyMap[e.key]) {
    mode = keyMap[e.key];
  }
});

// =============================================
// PERFORMANCE PANEL EVENT LISTENERS/HANDLERS
// =============================================

function updateMultUI(value) {
  userMult = parseFloat(value);
  if (isNaN(userMult)) userMult = 0.05;

  userMult = Math.min(Math.max(userMult, 0.05), 50.0);

  multSlider.value = userMult;
  multNumber.value = userMult;

  const gridSize = (userMult*100);
  gridSizeDisplay.textContent = gridSize.toLocaleString();

  manualMultOverride = true;
  MAX_MULT = userMult;
}

let manualMultOverride = false;
let userMult = 5;

const perfBtn = document.getElementById('perf-toggle-btn');
const perfControls = document.getElementById('perf-controls');
const multSlider = document.getElementById('mult-slider');
const multNumber = document.getElementById('mult-number');
const gridSizeDisplay = document.getElementById('grid-size-display');

if (perfBtn && perfControls) {
  perfBtn.addEventListener('click', () => {
    const isHidden = perfControls.style.display === 'none';
    perfControls.style.display = isHidden ? 'block' : 'none';
    perfBtn.textContent = isHidden ? 'Disable High Performance Mode' : 'High Performance Mode';
    if (!isHidden) {
      manualMultOverride = false;
      updateMultUI(5);
    } else {
      setTimeout(() => {
        perfControls.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      });
    }
  });

  multSlider.addEventListener('input', (e) => updateMultUI(e.target.value));
  multNumber.addEventListener('change', (e) => updateMultUI(e.target.value));
}

// ==============================
// START
// ==============================

requestAnimationFrame(loop);
