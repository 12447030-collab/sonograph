/* ============================================================
   DRAW の砂（ここは「演出」。模様の形そのものは chladni.js の物理）

   ・板の上を 2px ごとのマスに分け、マスごとに「砂の量」を持つ。
   ・砂は、となりのマスのうち「より揺れが小さい方」へ少しずつ滑っていく。
     よく揺れる所ほど速く動き、揺れが一定以下（sand.still）の所では跳ねずに止まる。
     その結果、揺れない線（節線）に沿って砂が細い線として積もる。
   ・描くときは INTRO と同じ 1px の砂粒で、砂の量を粒の密度として表す。
     砂のない所は透明になり、下の金属が見える。
   ・板ごとに、始まるタイミング・完成までの速さ・揺れの強さを乱数でずらす。
   ・板ごとの進み具合が 1 になると、その板の砂は動き終わる。全部の板が完成した時点で 100%。
   ============================================================ */
window.SonoSand = (function () {
  var SC = window.SONO_CONFIG.sand;
  var CELL = 2, W = 0, H = 0, cols, rows, NP, NC;
  var SUB = 3; // 1フレームあたりの計算回数
  var WHITE = 0xFFFFFFFF, CLEAR = 0x00000000;

  var cv = document.createElement('canvas'), g, img, pix, rnd;
  var pxPlate;      // 1px ごとにどの板か（-1 は板ではない）
  var cPlate;       // マスごとにどの板か
  var amp;          // 振れ幅 0〜1
  var D;            // 砂の動きやすさ（振れ幅の2乗）
  var rho;          // 砂の量（1 で一面に敷きつめた状態）
  var delta, disp;  // 計算用・描く砂の量
  var nL, nR, nU, nD;

  // 画面の大きさ（スマホごとに違う）に合わせて入れ物を用意する
  function alloc(w, h) {
    if (w === W && h === H) return;
    W = w; H = h;
    cols = Math.ceil(W / CELL); rows = Math.ceil(H / CELL);
    NP = W * H; NC = cols * rows;
    cv.width = W; cv.height = H;
    g = cv.getContext('2d');
    img = g.createImageData(W, H);
    pix = new Uint32Array(img.data.buffer);
    rnd = new Float32Array(NP);
    for (var i = 0; i < NP; i++) rnd[i] = Math.random();
    pxPlate = new Int16Array(NP);
    cPlate = new Int16Array(NC);
    amp = new Float32Array(NC); D = new Float32Array(NC); rho = new Float32Array(NC);
    delta = new Float32Array(NC); disp = new Float32Array(NC);
    nL = new Int32Array(NC); nR = new Int32Array(NC); nU = new Int32Array(NC); nD = new Int32Array(NC);
  }
  var list = null;                       // 板の上のマスの一覧
  var P = [];                            // 板ごとの進み具合と乱数
  var vib = 0, off = 0, total = 6, ctx = null;

  function rand(a, b) { return a + Math.random() * (b - a); }

  /* 板と模様をもとに準備する
     plates   : 板の定義（config.plates の1形状分）
     fieldFor : 板 → 振れ幅を返す関数 (x, y) => W
     inside   : (板, x, y) => 板の中か */
  var travel = SC.travel, ease = SC.ease;

  function init(target2d, w, h, plates, fieldFor, inside, drawSeconds, shapeName) {
    alloc(w, h);
    ctx = target2d; total = drawSeconds; vib = 0; off = 0;
    var ov = (SC.shapes && SC.shapes[shapeName]) || {};
    travel = ov.travel != null ? ov.travel : SC.travel;
    ease = ov.ease != null ? ov.ease : SC.ease;
    var x, y, i, k, c, r;

    // 1px ごと・マスごとに、どの板に乗っているか
    for (y = 0; y < H; y++) for (x = 0; x < W; x++) {
      var id = -1;
      for (k = 0; k < plates.length; k++) if (inside(plates[k], x + 0.5, y + 0.5)) { id = k; break; }
      pxPlate[y * W + x] = id;
    }
    var fields = plates.map(function (pl) { return fieldFor(pl); });
    var cells = [], maxW = 0;
    for (r = 0; r < rows; r++) for (c = 0; c < cols; c++) {
      i = r * cols + c;
      var cx = (c + 0.5) * CELL, cy = (r + 0.5) * CELL, pid = -1;
      for (k = 0; k < plates.length; k++) if (inside(plates[k], cx, cy)) { pid = k; break; }
      cPlate[i] = pid;
      if (pid < 0) { disp[i] = 1; continue; } // 板のふちの外側は白のまま
      var w = Math.abs(fields[pid](cx, cy));
      amp[i] = w;
      if (w > maxW) maxW = w;
      cells.push(i);
    }
    list = new Int32Array(cells);

    // 板ごとの乱数：始まり・終わり・揺れ・最初の砂のむら
    P = plates.map(function () {
      return { delay: rand(0, SC.maxDelay) * total, end: rand(SC.minEnd, 1) * total, jit: rand(0.7, 1.3), p: 0, prev: 0 };
      // prev は「ペースをかけた後の」進み具合
    });
    // 一番遅い板がちょうど全体の終わりに完成するようにそろえる（100% ＝ 全部の板が完成）
    var last = Math.max.apply(null, P.map(function (o) { return o.end; }));
    P.forEach(function (o) { o.end *= total / last; o.dur = Math.max(0.5, o.end - o.delay); });

    for (k = 0; k < list.length; k++) {
      i = list[k];
      var pid2 = cPlate[i];
      amp[i] /= maxW || 1;
      D[i] = amp[i] * amp[i];
      rho[i] = 1 + Math.random() * 0.15; // 1 以上なので、最初はまっ白に見える
      // となりのマス（板の外や別の板なら自分自身＝砂はふちで止まる）
      c = i % cols; r = (i - c) / cols;
      nL[i] = c > 0 && cPlate[i - 1] === pid2 ? i - 1 : i;
      nR[i] = c < cols - 1 && cPlate[i + 1] === pid2 ? i + 1 : i;
      nU[i] = r > 0 && cPlate[i - cols] === pid2 ? i - cols : i;
      nD[i] = r < rows - 1 && cPlate[i + cols] === pid2 ? i + cols : i;
    }
    render();
  }

  /* 声が基準の高さで出ている間だけ呼ぶ（呼ばれない間は完全に止まる）
     elapsed : DRAW で声を出した合計秒数、strength : 揺れの強さ 0〜1 */
  function step(dt, elapsed, strength) {
    var k, i, n = list.length;
    var kPlate = new Float32Array(P.length);
    for (k = 0; k < P.length; k++) {
      var o = P[k];
      o.p = Math.max(0, Math.min(1, (elapsed - o.delay) / o.dur));
      // 進んだ分だけ砂を動かす。ease が大きいと前半は少し、後半にたくさん動く（1回に動かす割合は半分まで）
      var pe = Math.pow(o.p, ease);
      kPlate[k] = Math.min(0.5, travel * (pe - o.prev) / SUB);
      o.prev = pe;
    }
    for (var s = 0; s < SUB; s++) {
      for (k = 0; k < n; k++) delta[list[k]] = 0;
      for (k = 0; k < n; k++) {
        i = list[k];
        var f = kPlate[cPlate[i]] * amp[i];
        if (f <= 0 || amp[i] < SC.still) continue; // 揺れが小さい所の砂は跳ねない
        // 揺れが小さい方のとなりへ、差に応じて分けて滑らせる
        var d0 = D[i], a = d0 - D[nL[i]], b = d0 - D[nR[i]], c = d0 - D[nU[i]], e = d0 - D[nD[i]];
        if (a < 0) a = 0; if (b < 0) b = 0; if (c < 0) c = 0; if (e < 0) e = 0;
        var sum = a + b + c + e;
        if (sum <= 0) continue; // まわりより揺れが小さい＝節線。ここに積もる
        var mv = f * rho[i] / sum;
        delta[i] -= f * rho[i];
        delta[nL[i]] += mv * a; delta[nR[i]] += mv * b; delta[nU[i]] += mv * c; delta[nD[i]] += mv * e;
      }
      for (k = 0; k < n; k++) { i = list[k]; rho[i] += delta[i]; }
    }
    vib += (strength - vib) * Math.min(1, dt * 10);
    off = Math.floor(Math.random() * NP); // 砂粒を毎フレーム散らし直す＝跳ねて見える
    render();
  }

  // 結果表示用：揺れを止めて完成形で描く
  function settle() {
    vib = 0;
    P.forEach(function (o) { o.p = 1; });
    render();
  }

  function render() {
    var k, i;
    for (k = 0; k < list.length; k++) {
      i = list[k];
      var o = P[cPlate[i]];
      // 砂が跳ねて下の金属がのぞく。はじめは板全体で均一に跳ね（模様がまだ見えない）、
      // 形ができてくるにつれ、よく揺れる所ほど跳ねるようになる。動き終わった板は跳ねない
      var pe = o.prev, w = (1 - pe) * 0.6 + pe * amp[i];
      disp[i] = rho[i] * (1 - SC.jitter * vib * w * o.jit * (o.p < 1 ? 1 : 0));
    }
    for (var y = 0; y < H; y++) {
      var crow = (y >> 1) * cols, base = y * W;
      for (var x = 0; x < W; x++) {
        i = base + x;
        if (pxPlate[i] < 0) { pix[i] = CLEAR; continue; }
        var ri = i + off; if (ri >= NP) ri -= NP;
        pix[i] = rnd[ri] < disp[crow + (x >> 1)] ? WHITE : CLEAR;
      }
    }
    g.putImageData(img, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(cv, 0, 0, W, H);
  }

  return { init: init, step: step, settle: settle };
})();
