/*!
 * MOVIKI · Camada 3D espacial — "Cidades em Movimento"
 * WebGL nativo (sem Three.js/dependências externas — evita alterar a
 * Content-Security-Policy da página e mantém o payload leve para 3G/4G).
 * Puramente estético: não lê nem escreve nenhum texto, preço ou dado
 * de negócio da página. Se o navegador não suportar WebGL, a função
 * termina cedo e a página segue 100% funcional no visual original.
 *
 * Uso: <script src="js/moviki-3d.js" defer data-mk3d-mode="home|network"></script>
 *  + <canvas id="mk3d-bg"></canvas> e (opcional) <canvas id="mk3d-grain"></canvas>
 *  logo após a abertura do <body>.
 */
(function () {
  'use strict';

  var reduceMotion =
    window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var isTouch = matchMedia('(hover: none)').matches;

  function ready(fn) {
    if (document.readyState !== 'loading') fn();
    else document.addEventListener('DOMContentLoaded', fn);
  }

  // ---------------------------------------------------------------
  // mat4 mínimo (só o necessário: perspectiva + lookAt + identidade)
  // ---------------------------------------------------------------
  var mat4 = {
    perspective: function (out, fovy, aspect, near, far) {
      var f = 1.0 / Math.tan(fovy / 2), nf = 1 / (near - far);
      out.set([
        f / aspect, 0, 0, 0,
        0, f, 0, 0,
        0, 0, (far + near) * nf, -1,
        0, 0, 2 * far * near * nf, 0
      ]);
      return out;
    },
    lookAt: function (out, eye, center, up) {
      var z0 = eye[0] - center[0], z1 = eye[1] - center[1], z2 = eye[2] - center[2];
      var len = Math.hypot(z0, z1, z2) || 1;
      z0 /= len; z1 /= len; z2 /= len;
      var x0 = up[1] * z2 - up[2] * z1, x1 = up[2] * z0 - up[0] * z2, x2 = up[0] * z1 - up[1] * z0;
      len = Math.hypot(x0, x1, x2) || 1;
      x0 /= len; x1 /= len; x2 /= len;
      var y0 = z1 * x2 - z2 * x1, y1 = z2 * x0 - z0 * x2, y2 = z0 * x1 - z1 * x0;
      out.set([
        x0, y0, z0, 0,
        x1, y1, z1, 0,
        x2, y2, z2, 0,
        -(x0 * eye[0] + x1 * eye[1] + x2 * eye[2]),
        -(y0 * eye[0] + y1 * eye[1] + y2 * eye[2]),
        -(z0 * eye[0] + z1 * eye[1] + z2 * eye[2]),
        1
      ]);
      return out;
    }
  };

  // ---------------------------------------------------------------
  // shaders — partículas/pinos (glow via alpha falloff, sem post-fx)
  // ---------------------------------------------------------------
  var VERT_POINTS = [
    'attribute vec3 aPos;',
    'attribute float aSize;',
    'attribute float aPhase;',
    'attribute float aKind;', // 0 = grade de fundo, 1 = nó de destaque
    'uniform mat4 uProj;',
    'uniform mat4 uView;',
    'uniform float uTime;',
    'varying float vTwinkle;',
    'varying float vKind;',
    'void main() {',
    '  vec3 p = aPos;',
    '  p.y += sin(uTime * 0.12 + aPhase) * 0.35;',
    '  p.x += cos(uTime * 0.09 + aPhase * 1.7) * 0.15;',
    '  vec4 mv = uView * vec4(p, 1.0);',
    '  gl_Position = uProj * mv;',
    '  float d = max(0.8, -mv.z);',
    '  gl_PointSize = aSize * (220.0 / d);',
    '  vTwinkle = 0.5 + 0.5 * sin(uTime * 0.9 + aPhase * 3.1);',
    '  vKind = aKind;',
    '}'
  ].join('\n');

  var FRAG_POINTS = [
    'precision mediump float;',
    'varying float vTwinkle;',
    'varying float vKind;',
    'uniform vec3 uColorA;',
    'uniform vec3 uColorB;',
    'void main() {',
    '  vec2 uv = gl_PointCoord * 2.0 - 1.0;',
    '  float d = dot(uv, uv);',
    '  float a = smoothstep(1.0, 0.0, d);',
    '  vec3 col = mix(uColorA, uColorB, vTwinkle);',
    '  float boost = mix(1.0, 1.8, vKind);',
    '  float alpha = a * (0.25 + 0.65 * vTwinkle) * boost;',
    '  gl_FragColor = vec4(col * alpha * boost, alpha);',
    '}'
  ].join('\n');

  var VERT_LINES = [
    'attribute vec3 aPos;',
    'attribute float aFade;',
    'uniform mat4 uProj;',
    'uniform mat4 uView;',
    'varying float vFade;',
    'void main() {',
    '  vFade = aFade;',
    '  gl_Position = uProj * uView * vec4(aPos, 1.0);',
    '}'
  ].join('\n');

  var FRAG_LINES = [
    'precision mediump float;',
    'varying float vFade;',
    'uniform vec3 uColorA;',
    'void main() {',
    '  gl_FragColor = vec4(uColorA, vFade * 0.35);',
    '}'
  ].join('\n');

  function compile(gl, type, src) {
    var sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      console.warn('MK3D shader error:', gl.getShaderInfoLog(sh));
      gl.deleteShader(sh);
      return null;
    }
    return sh;
  }

  function program(gl, vertSrc, fragSrc) {
    var v = compile(gl, gl.VERTEX_SHADER, vertSrc);
    var f = compile(gl, gl.FRAGMENT_SHADER, fragSrc);
    if (!v || !f) return null;
    var p = gl.createProgram();
    gl.attachShader(p, v);
    gl.attachShader(p, f);
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      console.warn('MK3D program link error:', gl.getProgramInfoLog(p));
      return null;
    }
    return p;
  }

  // ---------------------------------------------------------------
  // geração de cena: grade urbana abstrata + constelação de destaque
  // ---------------------------------------------------------------
  function buildField(mode) {
    var pos = [], size = [], phase = [], kind = [];
    var i;

    // grade de fundo (mapa de dados) — igual nos dois modos
    var GRID = 340;
    for (i = 0; i < GRID; i++) {
      pos.push(
        (Math.random() - 0.5) * 34,
        (Math.random() - 0.5) * 18 - 2,
        (Math.random() - 0.5) * 34 - 6
      );
      size.push(2 + Math.random() * 3);
      phase.push(Math.random() * Math.PI * 2);
      kind.push(0);
    }

    var lines = [];
    if (mode === 'network') {
      // constelação em árvore: 1 hub central -> 6 nós -> 2 folhas cada
      // (representação abstrata do alcance de indicação, sem nenhum
      // número/texto novo — os dados reais já estão no HTML da página)
      var hub = [0, 0.4, -4];
      pos.push(hub[0], hub[1], hub[2]);
      size.push(9); phase.push(0); kind.push(1);
      var hubIdx = 0;

      for (i = 0; i < 6; i++) {
        var a = (i / 6) * Math.PI * 2;
        var r = 5.5;
        var mid = [
          hub[0] + Math.cos(a) * r,
          hub[1] + Math.sin(a * 1.3) * 1.6,
          hub[2] + Math.sin(a) * r
        ];
        pos.push(mid[0], mid[1], mid[2]);
        size.push(6); phase.push(a); kind.push(1);
        var midIdx = pos.length / 3 - 1;
        lines.push([hub, mid]);

        for (var j = 0; j < 2; j++) {
          var a2 = a + (j === 0 ? -0.35 : 0.35);
          var r2 = r + 3.2;
          var leaf = [
            hub[0] + Math.cos(a2) * r2,
            mid[1] + (j === 0 ? -1.1 : 1.1),
            hub[2] + Math.sin(a2) * r2
          ];
          pos.push(leaf[0], leaf[1], leaf[2]);
          size.push(4); phase.push(a2 * 2); kind.push(0.6);
          lines.push([mid, leaf]);
        }
      }
    } else {
      // modo "home": anel de pontos de localização ao redor do centro
      // (o smartphone real é HTML/CSS — ver .phone-stage — isto só
      // sugere o "mapa" ao redor dele em profundidade)
      var N = 14;
      for (i = 0; i < N; i++) {
        var ang = (i / N) * Math.PI * 2;
        var rad = 6 + Math.sin(i * 1.9) * 1.4;
        pos.push(
          Math.cos(ang) * rad,
          Math.sin(i * 2.3) * 1.8 - 0.4,
          Math.sin(ang) * rad - 5
        );
        size.push(5 + Math.random() * 2);
        phase.push(ang);
        kind.push(1);
      }
    }

    var linePos = [], lineFade = [];
    lines.forEach(function (seg) {
      linePos.push(seg[0][0], seg[0][1], seg[0][2], seg[1][0], seg[1][1], seg[1][2]);
      lineFade.push(1, 0.15);
    });

    return {
      pos: new Float32Array(pos),
      size: new Float32Array(size),
      phase: new Float32Array(phase),
      kind: new Float32Array(kind),
      linePos: new Float32Array(linePos),
      lineFade: new Float32Array(lineFade),
      count: pos.length / 3,
      lineCount: linePos.length / 3
    };
  }

  // ---------------------------------------------------------------
  // cena principal
  // ---------------------------------------------------------------
  function initScene(gl, canvas, mode) {
    var field = buildField(mode);

    var progP = program(gl, VERT_POINTS, FRAG_POINTS);
    var progL = field.lineCount ? program(gl, VERT_LINES, FRAG_LINES) : null;
    if (!progP) return;

    function buffer(data) {
      var b = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, b);
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
      return b;
    }

    var bPos = buffer(field.pos);
    var bSize = buffer(field.size);
    var bPhase = buffer(field.phase);
    var bKind = buffer(field.kind);
    var bLinePos = field.lineCount ? buffer(field.linePos) : null;
    var bLineFade = field.lineCount ? buffer(field.lineFade) : null;

    var locP = {
      aPos: gl.getAttribLocation(progP, 'aPos'),
      aSize: gl.getAttribLocation(progP, 'aSize'),
      aPhase: gl.getAttribLocation(progP, 'aPhase'),
      aKind: gl.getAttribLocation(progP, 'aKind'),
      uProj: gl.getUniformLocation(progP, 'uProj'),
      uView: gl.getUniformLocation(progP, 'uView'),
      uTime: gl.getUniformLocation(progP, 'uTime'),
      uColorA: gl.getUniformLocation(progP, 'uColorA'),
      uColorB: gl.getUniformLocation(progP, 'uColorB')
    };

    var locL = progL ? {
      aPos: gl.getAttribLocation(progL, 'aPos'),
      aFade: gl.getAttribLocation(progL, 'aFade'),
      uProj: gl.getUniformLocation(progL, 'uProj'),
      uView: gl.getUniformLocation(progL, 'uView'),
      uColorA: gl.getUniformLocation(progL, 'uColorA')
    } : null;

    var proj = new Float32Array(16);
    var view = new Float32Array(16);

    // câmera controlada por scroll (mola/spring) + leve paralaxe do mouse
    var cam = {
      // pontos-chave da "trajetória" — 1 por trecho de página
      keys: mode === 'network'
        ? [
            { eye: [0, 1.5, 11], look: [0, 0.4, -4] },
            { eye: [4.5, 0.5, 4], look: [1, 0.3, -3] },
            { eye: [-4, 2.2, 2], look: [-1, 0.6, -5] },
            { eye: [0, 0.8, 8], look: [0, 0.4, -4] }
          ]
        : [
            { eye: [0, 0.6, 10], look: [0, 0, -2] },
            { eye: [2.5, 1.2, 6], look: [0, 0.2, -3] },
            { eye: [-2, 0.4, 7], look: [0, 0, -3] },
            { eye: [0, 1, 9], look: [0, 0.1, -3] }
          ],
      progress: 0,
      progressTarget: 0,
      mouseX: 0,
      mouseY: 0,
      mouseXs: 0,
      mouseYs: 0
    };

    window.addEventListener('scroll', function () {
      var max = document.documentElement.scrollHeight - window.innerHeight;
      cam.progressTarget = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
    }, { passive: true });

    if (!isTouch) {
      window.addEventListener('mousemove', function (e) {
        cam.mouseX = (e.clientX / window.innerWidth) * 2 - 1;
        cam.mouseY = (e.clientY / window.innerHeight) * 2 - 1;
      }, { passive: true });
    }

    function lerp(a, b, t) { return a + (b - a) * t; }

    function keyframe(t) {
      var n = cam.keys.length - 1;
      var seg = Math.min(n - 1, Math.floor(t * n));
      var lt = t * n - seg;
      var a = cam.keys[seg], b = cam.keys[seg + 1];
      return {
        eye: [lerp(a.eye[0], b.eye[0], lt), lerp(a.eye[1], b.eye[1], lt), lerp(a.eye[2], b.eye[2], lt)],
        look: [lerp(a.look[0], b.look[0], lt), lerp(a.look[1], b.look[1], lt), lerp(a.look[2], b.look[2], lt)]
      };
    }

    function resize() {
      var dpr = Math.min(1.75, window.devicePixelRatio || 1);
      var w = canvas.clientWidth, h = canvas.clientHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      gl.viewport(0, 0, canvas.width, canvas.height);
    }
    window.addEventListener('resize', resize, { passive: true });
    resize();

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    gl.clearColor(0, 0, 0, 0);

    var colorA = hexToRgb('#0066FF');
    var colorB = hexToRgb('#00D4FF');

    var t0 = performance.now();
    var lastFrame = 0;
    var paused = document.hidden;
    document.addEventListener('visibilitychange', function () {
      paused = document.hidden;
      if (!paused) t0 = performance.now() - lastFrame;
    });

    function frame(now) {
      requestAnimationFrame(frame);
      if (paused) return;
      try {
        drawFrame(now);
      } catch (e) {
        // alguma extensão de privacidade/ad-blocker pode interferir no
        // contexto WebGL em desktop; nunca deixamos isso travar o loop
        // pro resto da sessão — só pula o frame e tenta de novo no próximo.
        if (!frame._warned) { console.warn('MK3D frame error:', e); frame._warned = true; }
      }
    }

    function drawFrame(now) {
      lastFrame = now - t0;
      var time = lastFrame / 1000;

      var kf, eye;
      if (reduceMotion) {
        // acessibilidade: sem câmera viajando pelo scroll e sem paralaxe
        // de mouse (movimento grande) — mas o brilho/cintilar continua,
        // senão a página parece travada em vez de só mais discreta.
        kf = cam.keys[0];
        eye = kf.eye;
      } else {
        // spring suave (física de mola crítica-aproximada) para o scroll
        cam.progress = lerp(cam.progress, cam.progressTarget, 0.06);
        cam.mouseXs = lerp(cam.mouseXs, cam.mouseX, 0.05);
        cam.mouseYs = lerp(cam.mouseYs, cam.mouseY, 0.05);

        kf = keyframe(cam.progress);
        eye = [
          kf.eye[0] + cam.mouseXs * 0.6,
          kf.eye[1] + cam.mouseYs * 0.3,
          kf.eye[2]
        ];
      }

      mat4.perspective(proj, Math.PI / 4, canvas.width / canvas.height, 0.1, 100);
      mat4.lookAt(view, eye, kf.look, [0, 1, 0]);

      gl.clear(gl.COLOR_BUFFER_BIT);

      if (progL && field.lineCount) {
        gl.useProgram(progL);
        gl.uniformMatrix4fv(locL.uProj, false, proj);
        gl.uniformMatrix4fv(locL.uView, false, view);
        gl.uniform3fv(locL.uColorA, colorB);
        gl.bindBuffer(gl.ARRAY_BUFFER, bLinePos);
        gl.enableVertexAttribArray(locL.aPos);
        gl.vertexAttribPointer(locL.aPos, 3, gl.FLOAT, false, 0, 0);
        gl.bindBuffer(gl.ARRAY_BUFFER, bLineFade);
        gl.enableVertexAttribArray(locL.aFade);
        gl.vertexAttribPointer(locL.aFade, 1, gl.FLOAT, false, 0, 0);
        gl.drawArrays(gl.LINES, 0, field.lineCount);
      }

      gl.useProgram(progP);
      gl.uniformMatrix4fv(locP.uProj, false, proj);
      gl.uniformMatrix4fv(locP.uView, false, view);
      gl.uniform1f(locP.uTime, time);
      gl.uniform3fv(locP.uColorA, colorA);
      gl.uniform3fv(locP.uColorB, colorB);

      gl.bindBuffer(gl.ARRAY_BUFFER, bPos);
      gl.enableVertexAttribArray(locP.aPos);
      gl.vertexAttribPointer(locP.aPos, 3, gl.FLOAT, false, 0, 0);

      gl.bindBuffer(gl.ARRAY_BUFFER, bSize);
      gl.enableVertexAttribArray(locP.aSize);
      gl.vertexAttribPointer(locP.aSize, 1, gl.FLOAT, false, 0, 0);

      gl.bindBuffer(gl.ARRAY_BUFFER, bPhase);
      gl.enableVertexAttribArray(locP.aPhase);
      gl.vertexAttribPointer(locP.aPhase, 1, gl.FLOAT, false, 0, 0);

      gl.bindBuffer(gl.ARRAY_BUFFER, bKind);
      gl.enableVertexAttribArray(locP.aKind);
      gl.vertexAttribPointer(locP.aKind, 1, gl.FLOAT, false, 0, 0);

      gl.drawArrays(gl.POINTS, 0, field.count);
    }

    requestAnimationFrame(frame);
  }

  function hexToRgb(hex) {
    var n = parseInt(hex.slice(1), 16);
    return new Float32Array([((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]);
  }

  // ---------------------------------------------------------------
  // granulação cinematográfica (canvas 2D, custo baixíssimo)
  // ---------------------------------------------------------------
  function initGrain(canvas) {
    var ctx = canvas.getContext('2d');
    var tile = document.createElement('canvas');
    tile.width = 96; tile.height = 96;
    var tctx = tile.getContext('2d');
    var frameN = 0;

    function resize() {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    }
    window.addEventListener('resize', resize, { passive: true });
    resize();

    function paintTile() {
      var img = tctx.createImageData(96, 96);
      for (var i = 0; i < img.data.length; i += 4) {
        var v = 255 * Math.random();
        img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
        img.data[i + 3] = 255;
      }
      tctx.putImageData(img, 0, 0);
    }

    function loop() {
      requestAnimationFrame(loop);
      frameN++;
      if (frameN % 3 !== 0) return; // ~20fps é suficiente pra ruído
      paintTile();
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      var pat = ctx.createPattern(tile, 'repeat');
      ctx.fillStyle = pat;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    requestAnimationFrame(loop);
  }

  // ---------------------------------------------------------------
  // paralaxe/tilt do smartphone (CSS 3D via custom properties)
  // ---------------------------------------------------------------
  function initPhoneTilt() {
    var tilt = document.querySelector('.mk-tilt');
    if (!tilt || isTouch || reduceMotion) return;
    var stage = tilt.closest('.phone-stage') || tilt;
    var rx = 0, ry = 0, rxT = 0, ryT = 0;

    stage.addEventListener('mousemove', function (e) {
      var r = stage.getBoundingClientRect();
      var nx = (e.clientX - r.left) / r.width - 0.5;
      var ny = (e.clientY - r.top) / r.height - 0.5;
      ryT = nx * 14;
      rxT = -ny * 14;
    }, { passive: true });

    stage.addEventListener('mouseleave', function () {
      ryT = 0; rxT = 0;
    }, { passive: true });

    function loop() {
      requestAnimationFrame(loop);
      rx += (rxT - rx) * 0.08;
      ry += (ryT - ry) * 0.08;
      tilt.style.setProperty('--mk-rx', ry.toFixed(2));
      tilt.style.setProperty('--mk-ry', rx.toFixed(2));
    }
    requestAnimationFrame(loop);
  }

  function initPointerParallax() { /* reservado — a paralaxe de câmera já
    é tratada dentro de initScene(); função mantida por clareza/expansão */ }

  function initScrollSpring() { /* idem — spring já vive em initScene() */ }

  // ---------------------------------------------------------------
  // boot
  // ---------------------------------------------------------------
  ready(function () {
    var script = document.currentScript ||
      document.querySelector('script[data-mk3d-mode]');
    var mode = (script && script.getAttribute('data-mk3d-mode')) || 'network';

    var bg = document.getElementById('mk3d-bg');
    if (!bg) return;

    var gl = bg.getContext('webgl', { alpha: true, antialias: true, powerPreference: 'low-power' }) ||
      bg.getContext('experimental-webgl');

    if (!gl) return; // sem WebGL: página segue 100% funcional no visual original

    initScene(gl, bg, mode);

    var grain = document.getElementById('mk3d-grain');
    if (grain && !reduceMotion) initGrain(grain);

    initPhoneTilt();
  });
})();
