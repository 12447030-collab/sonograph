/* ============================================================
   クラドニ図形の物理（ここは「物理」だけ。砂の動きは sand.js）

   板の振動モード（形状ごとの近似解析解）：
     ふちが自由に動く板（クラドニの実験と同じ）を、
     自由境界の膜の振動モードで近似します。
       RECTANGLE : cos(nπx/a)·cos(mπy/b)。響く高さがほぼ同じ2つのモードは
                   実際の板では混ざり合うので、その ± の組み合わせも候補にする
       SQUARE    : cos(nπx)cos(mπy) ± cos(mπx)cos(nπy)（クラドニ／リッツの近似）
       CIRCLE    : J_n(kr)·cos(nθ)（J_n はベッセル関数。J_n'(kR)=0）
       TRIANGLE  : 正三角形のラメのモード（平面波6本の重ね合わせ）
     振動しない線（節線）に砂が集まって模様になります。

   響きやすい高さ（固有振動数）：
     f ∝ λ · √(D / ρh)、D = E h³ / 12(1 − ν²)
     λ はモードの形で決まる値。材質による差は √(E / ρ(1 − ν²)) の比で入ります。
     声の高さはそのまま板の振動数ではなく、「どのモードに当たるか」を選ぶ入力です。
   ============================================================ */
window.SonoChladni = (function () {
  var PH = window.SONO_CONFIG.physics;
  var PI = Math.PI, SQ3 = Math.sqrt(3);

  /* ---------- ベッセル関数 ---------- */
  function besselJ(n, x) {
    // J_n(x) = (1/2π)∫cos(nτ − x sinτ)dτ を1周期で数値積分（周期関数なので高精度）
    var N = 96, s = 0;
    for (var i = 0; i < N; i++) {
      var t = 2 * PI * i / N;
      s += Math.cos(n * t - x * Math.sin(t));
    }
    return s / N;
  }
  function besselJp(n, x) { // J_n の傾き
    return n === 0 ? -besselJ(1, x) : 0.5 * (besselJ(n - 1, x) - besselJ(n + 1, x));
  }
  function zerosJp(n, count) { // J_n'(x) = 0 となる x（0 は除く）
    // 最初の零点は必ず n より先にある。手前は値がほぼ0で誤検出しやすいので探さない
    var out = [], step = 0.05, x = Math.max(0.3, n), prev = besselJp(n, x);
    while (out.length < count && x < 60) {
      var nx = x + step, cur = besselJp(n, nx);
      if (prev * cur < 0) {
        var lo = x, hi = nx;
        for (var k = 0; k < 40; k++) {
          var mid = (lo + hi) / 2;
          if (besselJp(n, lo) * besselJp(n, mid) <= 0) hi = mid; else lo = mid;
        }
        out.push((lo + hi) / 2);
      }
      x = nx; prev = cur;
    }
    return out;
  }

  /* ---------- 正三角形の対称操作（頂点のまわりの回転と反転、6通り） ---------- */
  var D3 = [];
  for (var r = 0; r < 3; r++) {
    var a = r * 2 * PI / 3, c = Math.cos(a), s = Math.sin(a);
    D3.push([c, -s, s, c]);                         // 回転
    var b = 2 * r * PI / 3;                          // 0°, 60°, 120° の線で反転
    D3.push([Math.cos(b), Math.sin(b), Math.sin(b), -Math.cos(b)]);
  }

  /* ---------- 形ごとのモードの一覧 ---------- */
  function buildModes(shape) {
    var list = [], n, m;
    if (shape === 'RECTANGLE') {
      var pl = window.SONO_CONFIG.plates.RECTANGLE[0], A = pl.w, B = pl.h, pure = [];
      for (n = 0; n <= 14; n++) for (m = 0; m <= 14; m++) {
        if (!n && !m) continue;
        pure.push({ n: n, m: m, lam: PI * PI * (n * n / (A * A) + m * m / (B * B)) });
      }
      for (var i = 0; i < pure.length; i++) {
        var p1 = pure[i];
        if (p1.n && p1.m) list.push({ shape: shape, terms: [[p1.n, p1.m, 1]], lam: p1.lam, label: '(' + p1.n + ',' + p1.m + ')' });
        for (var j = i + 1; j < pure.length; j++) {
          var p2 = pure[j];
          if (Math.abs(p2.lam / p1.lam - 1) > 0.04) continue; // 高さが4%以内のものだけ混ざる
          var lm = Math.sqrt(p1.lam * p2.lam), lb = '(' + p1.n + ',' + p1.m + ')(' + p2.n + ',' + p2.m + ')';
          list.push({ shape: shape, terms: [[p1.n, p1.m, 1], [p2.n, p2.m, 1]], lam: lm, label: lb + '+' });
          list.push({ shape: shape, terms: [[p1.n, p1.m, 1], [p2.n, p2.m, -1]], lam: lm * 1.01, label: lb + '−' });
        }
      }
    } else if (shape === 'SQUARE') {
      for (n = 0; n <= 12; n++) for (m = n; m <= 12; m++) {
        if (!n && !m) continue;
        var lam = PI * PI * (n * n + m * m);
        if (n === m) list.push({ shape: shape, n: n, m: m, sign: 0, lam: lam, label: '(' + n + ',' + m + ')' });
        else {
          // ＋と−の組み合わせは実際の板ではわずかに高さがずれる（−の方を少し高く）
          list.push({ shape: shape, n: n, m: m, sign: 1, lam: lam, label: '(' + n + ',' + m + ')+' });
          list.push({ shape: shape, n: n, m: m, sign: -1, lam: lam * 1.02, label: '(' + n + ',' + m + ')−' });
        }
      }
    } else if (shape === 'CIRCLE') {
      for (n = 0; n <= 18; n++) {
        var z = zerosJp(n, 9);
        for (var k = 0; k < z.length; k++) {
          list.push({ shape: shape, n: n, s: k + 1, k: z[k], lam: z[k] * z[k], label: 'n=' + n + ' s=' + (k + 1) });
        }
      }
    } else if (shape === 'TRIANGLE') {
      // 一辺1の正三角形 A(0,0) B(1,0) C(1/2,√3/2)。
      // 辺で折り返して平面を敷きつめたときに周期的になる波数 k だけが、ふちで自由なモードになる
      var b1 = [-1 / 3, 1 / SQ3], b2 = [-2 / 3, 0], seen = {};
      for (n = -9; n <= 9; n++) for (m = -9; m <= 9; m++) {
        if (!n && !m) continue;
        var kx = n * b1[0] + m * b2[0], ky = n * b1[1] + m * b2[1];
        var orbit = [], keys = [];
        for (var g = 0; g < 6; g++) {
          var T = D3[g], gx = T[0] * kx + T[1] * ky, gy = T[2] * kx + T[3] * ky;
          orbit.push([gx, gy]);
          keys.push(Math.round(gx * 1e4) + ':' + Math.round(gy * 1e4), Math.round(-gx * 1e4) + ':' + Math.round(-gy * 1e4));
        }
        var key = keys.sort().join('|');
        if (seen[key]) continue;
        seen[key] = true;
        var kk = kx * kx + ky * ky;
        list.push({ shape: shape, orbit: orbit, lam: 4 * PI * PI * kk, label: '(' + n + ',' + m + ')' });
      }
    }
    list.sort(function (p, q) { return p.lam - q.lam; });
    return list.slice(PH.skip, PH.skip + PH.count);
  }

  var cache = {};
  function modes(shape) { return cache[shape] || (cache[shape] = buildModes(shape)); }

  /* 材質ごとの「振動が伝わる速さ」 √(E / ρ(1 − ν²)) */
  function speed(mat) {
    var p = PH.materials[mat];
    return Math.sqrt(p.E / (p.rho * (1 - p.nu * p.nu)));
  }

  /* 声と材質から、当たるモードを選ぶ */
  function pickMode(shape, mat, voiceHz) {
    var list = modes(shape);
    var lamMid = Math.sqrt(list[0].lam * list[list.length - 1].lam);
    var ratio = speed(mat) / speed(PH.refMaterial);
    var best = 0, bestErr = Infinity, freqs = [];
    for (var i = 0; i < list.length; i++) {
      var f = PH.refVoice * (list[i].lam / lamMid) * ratio; // このモードが響く高さ
      freqs.push(f);
      var e = Math.abs(Math.log(f / voiceHz));
      if (e < bestErr) { bestErr = e; best = i; }
    }
    return { mode: list[best], index: best, freq: freqs[best], speedRatio: ratio };
  }

  /* ---------- 板の中の点 (x, y) の振れ幅 W ---------- */
  function inside(pl, x, y) {
    if (pl.type === 'rect') return x >= pl.x && x < pl.x + pl.w && y >= pl.y && y < pl.y + pl.h;
    if (pl.type === 'circle') { var dx = x - pl.cx, dy = y - pl.cy; return dx * dx + dy * dy < pl.r * pl.r; }
    var b = bary(pl, x, y);
    return b[0] >= 0 && b[1] >= 0 && b[0] + b[1] <= 1;
  }
  function bary(pl, x, y) { // 三角形の中での位置（底辺方向 u、頂点方向 v）
    var p = pl.p, ex = p[1][0] - p[0][0], ey = p[1][1] - p[0][1], fx = p[2][0] - p[0][0], fy = p[2][1] - p[0][1];
    var det = ex * fy - ey * fx, qx = x - p[0][0], qy = y - p[0][1];
    return [(qx * fy - qy * fx) / det, (ex * qy - ey * qx) / det];
  }

  // 板と模様から、振れ幅を返す関数をつくる
  function field(pl, md) {
    if (md.terms) {
      return function (x, y) {
        var u = (x - pl.x) / pl.w, v = (y - pl.y) / pl.h, s = 0;
        for (var t = 0; t < md.terms.length; t++) {
          var tm = md.terms[t];
          s += tm[2] * Math.cos(tm[0] * PI * u) * Math.cos(tm[1] * PI * v);
        }
        return s;
      };
    }
    if (md.shape === 'SQUARE') {
      return function (x, y) {
        var u = (x - pl.x) / pl.w, v = (y - pl.y) / pl.h;
        var a = Math.cos(md.n * PI * u) * Math.cos(md.m * PI * v);
        if (!md.sign) return a;
        return a + md.sign * Math.cos(md.m * PI * u) * Math.cos(md.n * PI * v);
      };
    }
    if (md.shape === 'CIRCLE') {
      var TBL = 1024, tbl = new Float32Array(TBL + 1);
      for (var i = 0; i <= TBL; i++) tbl[i] = besselJ(md.n, md.k * i / TBL);
      return function (x, y) {
        var dx = x - pl.cx, dy = y - pl.cy, rr = Math.sqrt(dx * dx + dy * dy) / pl.r;
        var f = Math.min(rr, 1) * TBL, i0 = Math.floor(f), t = f - i0;
        var j = i0 >= TBL ? tbl[TBL] : tbl[i0] + (tbl[i0 + 1] - tbl[i0]) * t;
        return j * Math.cos(md.n * Math.atan2(dy, dx));
      };
    }
    // TRIANGLE：板の頂点を A, B, C に対応させる（向きが違う板では模様も反転する）
    return function (x, y) {
      var b = bary(pl, x, y), px = b[0] + 0.5 * b[1], py = b[1] * SQ3 / 2, s = 0;
      for (var g = 0; g < 6; g++) s += Math.cos(2 * PI * (md.orbit[g][0] * px + md.orbit[g][1] * py));
      return s;
    };
  }

  return { pickMode: pickMode, modes: modes, field: field, inside: inside, speed: speed };
})();
