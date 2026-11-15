/* ============================================================
   SONOGRAPH 本体
   INTRO → FREQUENCY → SELECT SHAPE → SELECT MATERIAL → DRAW → RESULT
   ============================================================ */
(function () {
  var C = window.SONO_CONFIG;
  var T = C.timing;
  var $ = function (s) { return document.querySelector(s); };

  var stage = $('#stage'), bar = $('#bar'), msg = $('#msg');
  var plates = $('#plates'), fx = $('#fx'), waveImg = $('#wave-img');
  var ctx = fx.getContext('2d');
  /* 画面の大きさ。アートボードは 390×844。
     スマホの画面はアートボードより横長なことが多いので、高さをアートボードに合わせ、
     横幅を画面いっぱいまで広げる（縦長の画面では逆に、高さを広げる）。
     文字やバーの位置はアートボードのまま（左寄せは画面の左端から、中央寄せは中央に）、
     背景のグラフィックは画面いっぱいに描く。 */
  var DW = 390, DH = 844;
  var W = DW, H = DH, scale = 1;
  var ui = $('#ui');
  function measure() {
    var vw = window.visualViewport ? window.visualViewport.width : window.innerWidth;
    var vh = window.visualViewport ? window.visualViewport.height : window.innerHeight;
    if (vw / vh >= DW / DH) { scale = vh / DH; W = Math.round(vw / scale); H = DH; }
    else { scale = vw / DW; W = DW; H = Math.round(vh / scale); }
    return { vw: vw, vh: vh };
  }
  measure();
  // 形状の画像と板の位置（アートボード上の px）を、画面に合わせて拡大・中央そろえする
  function designBox() {
    var k = Math.max(W / DW, H / DH);
    return { k: k, x: (W - DW * k) / 2, y: (H - DH * k) / 2 };
  }
  function mapPlate(pl) {
    var b = designBox();
    if (pl.type === 'rect') return { type: 'rect', x: b.x + pl.x * b.k, y: b.y + pl.y * b.k, w: pl.w * b.k, h: pl.h * b.k };
    if (pl.type === 'circle') return { type: 'circle', cx: b.x + pl.cx * b.k, cy: b.y + pl.cy * b.k, r: pl.r * b.k };
    return { type: 'tri', p: pl.p.map(function (q) { return [b.x + q[0] * b.k, b.y + q[1] * b.k]; }) };
  }

  var S = {
    screen: 'intro',
    lang: 'ja',
    base: null,       // 基準周波数（INTROで確定）
    samples: [],      // INTROで集めた周波数
    shape: 0,
    material: 0,
    progress: 0,      // 0〜1（進み具合）
    barShown: 0,      // 画面に表示しているバーの位置（progress をなめらかに追う）
    disp: 0,          // INTRO：ハーフトーンに使う進み具合（progress を少し遅れて追う）
    flow: 0,          // INTRO：ゆらぎが流れた量
    doneAt: null,     // バーが右端に着いた時刻
    silentFor: 0,     // 無音が続いている秒数
    started: false,   // この画面で一度でも声が出たか
    zoneFor: 0,       // 高い／低い声を出し続けている秒数
    nextStep: 0,
    touched: false,   // 選択画面で一度でも切り替えたか（ヒントを消す）
    introOff: 0,      // INTRO で違う高さの声が続いている秒数
    introDir: null,   // INTRO で外れている向き 'high' | 'low'
    zone: 'silent',   // 直前の判定（ヒステリシス用）
    meterX: 195       // メーターの点の位置
  };

  /* ---------- ステージを端末に合わせる（画面いっぱい） ---------- */
  function fit() {
    var w = W, h = H, s = scale;
    stage.style.width = w + 'px'; stage.style.height = h + 'px';
    ui.style.top = (h - DH) / 2 + 'px'; // 文字やバーはアートボードの高さのまま、上下中央に
    stage.style.transform = 'scale(' + s + ')';
  }
  // 画面の大きさが変わったとき（回転・アドレスバーの出入り）
  var pendingLayout = false;
  function onResize() {
    var oldW = W, oldH = H;
    measure();
    if (W === oldW && H === oldH) { fit(); return; }
    // DRAW と RESULT の途中では砂を作り直さず、次の画面に移るときに合わせる
    if (S.screen === 'draw' || S.screen === 'result') {
      var keepW = W, keepH = H; W = oldW; H = oldH;
      scale = Math.min(scale * keepW / oldW, scale * keepH / oldH);
      fit(); pendingLayout = true; return;
    }
    relayout();
  }
  function relayout() {
    pendingLayout = false;
    measure(); fit(); sizeCanvases(); allocGrain(); allocWave();
    loadHalftoneImage();
    go(S.screen, true);
  }
  window.addEventListener('resize', onResize);
  window.addEventListener('orientationchange', function () { setTimeout(onResize, 300); });
  if (window.visualViewport) window.visualViewport.addEventListener('resize', onResize);
  fit();

  /* ---------- スマホ：ピンチやダブルタップでの拡大・画面の引っぱりを止める ---------- */
  document.addEventListener('gesturestart', function (e) { e.preventDefault(); });
  document.addEventListener('touchmove', function (e) { e.preventDefault(); }, { passive: false });
  var lastTouch = 0;
  document.addEventListener('touchend', function (e) {
    var now = Date.now();
    if (now - lastTouch < 300 && !e.target.closest('button')) e.preventDefault();
    lastTouch = now;
  }, { passive: false });

  /* ---------- スマホ：体験中に画面が暗くならないようにする ---------- */
  var wakeLock = null;
  function keepAwake() {
    if (!('wakeLock' in navigator) || wakeLock) return;
    navigator.wakeLock.request('screen').then(function (l) {
      wakeLock = l;
      l.addEventListener('release', function () { wakeLock = null; });
    }).catch(function () {});
  }
  document.addEventListener('visibilitychange', function () { if (!document.hidden) keepAwake(); });

  var dpr = Math.min(window.devicePixelRatio || 1, 2);
  function sizeCanvases() {
    fx.width = W * dpr; fx.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    plates.width = W * dpr; plates.height = H * dpr;
    plates.getContext('2d').setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  sizeCanvases();

  /* ---------- 文言 ---------- */
  function t(key) {
    var s = C.text[S.lang][key] || '';
    return s.replace('{hz}', S.base ? Math.round(S.base) : '');
  }
  function setLang(l) {
    S.lang = l;
    stage.dataset.lang = l;
    document.documentElement.lang = l;
    document.querySelectorAll('.lang button').forEach(function (b) {
      b.classList.toggle('on', b.dataset.lang === l);
    });
    document.querySelectorAll('[data-t]').forEach(function (el) { el.textContent = t(el.dataset.t); });
  }
  document.querySelectorAll('.lang button').forEach(function (b) {
    b.addEventListener('click', function () { setLang(b.dataset.lang); });
  });

  /* ---------- マイク開始：画面のどこかをタップ（言語切替とRESULTのボタンを除く） ---------- */
  stage.addEventListener('pointerdown', function (e) {
    keepAwake();
    if (e.target.closest('.lang, .r-actions')) return;
    SonoInput.tap();
  });
  // マイクがまだ使えないときの文言（使えるなら ''）
  function micMsg() {
    var st = SonoInput.state();
    if (st === 'idle' || st === 'paused') return t('tapToStart');
    if (st === 'denied') return t('micDenied');
    if (st === 'unsupported') return t('openInBrowser');
    return '';
  }

  /* ---------- 画像アセットの反映 ---------- */
  // 文言：画像が指定されていれば画像、なければ文字
  function setText(el, key, text) {
    var src = C.assets.texts && C.assets.texts[key];
    if (src) el.innerHTML = '<img class="txt-img" alt="' + text.replace(/"/g, '') + '" src="' + src + '">';
    else el.textContent = text;
  }
  function applyAssets() {
    document.querySelectorAll('[data-asset]').forEach(function (el) {
      var key = el.dataset.asset;
      if (C.assets.texts && C.assets.texts[key]) setText(el, key, el.textContent);
    });
    var logo = C.assets.logoWhite || C.assets.logo;
    if (logo) {
      $('.logo-img').src = logo; $('.logo-img').hidden = false; $('.logo-text').hidden = true;
    }
    if (C.assets.waveform) waveImg.src = C.assets.waveform;
  }
  function shapeName() { return C.shapes[S.shape]; }
  function materialName() { return C.materials[S.material]; }

  /* 板レイヤー：形状の画像を型抜きに使い、グレーまたは金属を塗る（Canvas） */
  var pctx = plates.getContext('2d');
  var imgCache = {};
  function loadImg(src) {
    if (!imgCache[src]) {
      var im = new Image();
      im.onload = function () { paintPlates(lastMat); };
      im.src = src;
      imgCache[src] = im;
    }
    return imgCache[src];
  }
  var lastMat = false;
  function paintPlates(withMaterial) {
    lastMat = withMaterial;
    var shape = loadImg(C.assets.shapes[shapeName()]);
    var m = withMaterial ? C.assets.materials[materialName()] : { color: '#CCCCCC', texture: '' };
    var tex = m.texture ? loadImg(m.texture) : null;
    pctx.globalCompositeOperation = 'source-over';
    pctx.clearRect(0, 0, W, H);
    if (!shape.complete || !shape.naturalWidth) return;
    pctx.fillStyle = m.color;
    pctx.fillRect(0, 0, W, H);
    if (tex && tex.complete && tex.naturalWidth) {
      // 画面いっぱいに、比率を保って敷く
      var s = Math.max(W / tex.naturalWidth, H / tex.naturalHeight);
      var tw = tex.naturalWidth * s, th = tex.naturalHeight * s;
      pctx.drawImage(tex, (W - tw) / 2, (H - th) / 2, tw, th);
    }
    pctx.globalCompositeOperation = 'destination-in'; // 形状の不透明部分だけ残す
    var b = designBox();
    pctx.drawImage(shape, b.x, b.y, DW * b.k, DH * b.k);
    pctx.globalCompositeOperation = 'source-over';
  }

  /* ---------- 画面遷移 ---------- */
  function go(screen, keepProgress) {
    if (pendingLayout && !keepProgress) { S.screen = screen; S.progress = 0; relayout(); return; }
    var prog = S.progress, prev = S.screen;
    S.screen = screen;
    S.barShown = 0;
    S.progress = 0; S.doneAt = null; S.silentFor = 0; S.started = false;
    S.zoneFor = 0; S.touched = false; S.introOff = 0; S.zone = 'silent'; S.meterX = W / 2;
    stage.dataset.screen = screen;
    buzz(false);
    document.body.classList.toggle('dark', screen === 'intro');
    // スマホのブラウザの上下の色も、画面の地の色に合わせる
    var tc = document.querySelector('meta[name="theme-color"]');
    if (tc) tc.content = screen === 'intro' ? '#000000' : '#FFFFFF';
    bar.classList.remove('done');
    waveImg.hidden = !(screen === 'frequency' && C.assets.waveform);

    var hz = S.base ? Math.round(S.base) : '';
    document.querySelectorAll('.hz-num').forEach(function (el) { el.textContent = hz; });

    if (screen === 'intro') { S.samples = []; S.disp = 0; S.flow = 0; htKey = ''; drawHalftone(0, 0); }
    if (screen === 'frequency') resetWave();
    if (screen === 'shape' || screen === 'material') {
      // 金属やグレーの板がすでに見えている画面からなら入れ替わるように、白い画面からならふわっと現れる
      var platesShown = prev === 'shape' || prev === 'material' || prev === 'draw' || prev === 'result';
      renderSelect(platesShown && !keepProgress ? 'fade' : null);
      if (!platesShown && !keepProgress) fadeIn(plates);
    }
    // DRAW に入る瞬間に引っかからないよう、模様の候補を先に計算しておく
    if (screen === 'material') setTimeout(function () { SonoChladni.modes(shapeName()); }, 400);
    if (screen === 'draw') {
      paintPlates(true);
      htKey = '';
      // 物理：声（基準周波数）と材質から、当たる振動モードを選ぶ
      S.pick = SonoChladni.pickMode(shapeName(), materialName(), S.base || C.physics.refVoice);
      // 演出：その模様に向かって砂が集まる準備（全部の板で同じモード）
      SonoSand.init(ctx, W, H, C.plates[shapeName()].map(mapPlate), function (pl) { return SonoChladni.field(pl, S.pick.mode); },
        SonoChladni.inside, T.draw, shapeName());
      if (!keepProgress) fadeIn(fx); // 金属の上に、白い砂がふわっとかかる
    }
    if (screen === 'result') {
      paintPlates(true);
      SonoSand.settle();
      prepareSave();
      $('.r-shape').textContent = shapeName();
      $('.r-material').textContent = materialName();
    }
    setLang(S.lang);
    if (keepProgress) { S.progress = prog; S.barShown = prog; } // 画面の大きさが変わっただけなら、進み具合はそのまま
    else if (prev !== screen || screen === 'intro') {
      // 画面の文字・バーが、ふわっと現れる
      fadeIn($({ intro: '#s-intro', frequency: '#s-frequency', shape: '#s-select', material: '#s-select', draw: '#s-draw', result: '#s-result' }[screen]));
      fadeIn(msg); fadeIn(bar);
    }
  }

  function renderSelect(anim, dir) {
    var isShape = S.screen === 'shape';
    var list = isShape ? C.shapes : C.materials;
    var idx = isShape ? S.shape : S.material;
    setText($('.sel-label'), isShape ? 'SELECT_SHAPE' : 'SELECT_MATERIAL', isShape ? 'SELECT SHAPE' : 'SELECT MATERIAL');
    setText($('.sel-name'), list[idx], list[idx]);
    $('.dots').innerHTML = list.map(function (_, i) {
      return '<i' + (i === idx ? ' class="on"' : '') + '></i>';
    }).join('');
    $('.hint').classList.toggle('off', S.touched);
    layoutMeter();
    if (anim && canAnimate) snapshotPlates();
    paintPlates(!isShape);
    if (anim === 'slide' && canAnimate) slidePlates(dir);
    if (anim === 'fade' && canAnimate) crossfadePlates();
  }

  /* ---------- 声の高さメーター（選択画面） ----------
     横位置は半音単位（耳で感じる高さの差が等間隔になる） */
  var MX = DW / 2, MHALF = 125;
  function meterX(ratio) {
    var st = 12 * Math.log(ratio) / Math.LN2;
    return MX + Math.max(-1, Math.min(1, st / C.pitch.meterRange)) * MHALF;
  }
  function seg(el, x0, x1) { el.style.left = x0 + 'px'; el.style.width = (x1 - x0) + 'px'; }
  function layoutMeter() {
    MX = W / 2;
    var P = C.pitch, lo = meterX(1 - P.select), hi = meterX(1 + P.select);
    seg($('.m-low'), MX - MHALF, lo);
    seg($('.m-mid'), meterX(1 - P.neutral), meterX(1 + P.neutral));
    seg($('.m-high'), hi, MX + MHALF);
    $('.m-lab-l').style.left = (MX - MHALF + lo) / 2 + 'px';
    $('.m-lab-c').style.left = MX + 'px';
    $('.m-lab-r').style.left = (hi + MX + MHALF) / 2 + 'px';
  }
  function updateMeter(v, z, dt) {
    var meter = $('.meter');
    meter.classList.toggle('silent', !v.voiced);
    if (v.voiced && S.base) {
      var target = meterX(v.freq / S.base);
      S.meterX += (target - S.meterX) * Math.min(1, dt * 14);
      $('.m-dot').style.left = S.meterX + 'px';
      $('.m-now').style.left = S.meterX + 'px';
      $('.hz-now').textContent = Math.round(v.freq);
    }
    $('.m-low').classList.toggle('on', z === 'low');
    $('.m-mid').classList.toggle('on', z === 'ok');
    $('.m-high').classList.toggle('on', z === 'high');
  }

  function step(dir) {
    var isShape = S.screen === 'shape';
    var n = isShape ? C.shapes.length : C.materials.length;
    if (isShape) S.shape = (S.shape + dir + n) % n;
    else S.material = (S.material + dir + n) % n;
    S.touched = true;
    S.progress = 0; // 選び直したら、決定のバーは最初から
    renderSelect('slide', dir);
    // 名前も、カードと同じ向きから少しだけ滑って現れる
    var nm = $('.sel-name');
    if (nm.animate) nm.animate([{ opacity: 0, transform: 'translateX(' + (dir * 24) + 'px)' }, { opacity: 1, transform: 'none' }],
      { duration: T.slide * 1000, easing: EASE });
  }

  /* ---------- なめらかな切り替え ----------
     形・材質を変えるとき：背景を画面いっぱいのカードとして横に滑らせる
     （高い声＝次のカードが右から、低い声＝前のカードが左から）。
     前の背景を #plates-old に写しておき、新しい背景と一緒に動かす。 */
  var platesOld = $('#plates-old'), poctx = platesOld.getContext('2d');
  var EASE = 'cubic-bezier(.22,.61,.36,1)';
  var oldAnim = null, newAnim = null;
  var canAnimate = !!plates.animate;
  function snapshotPlates() {
    if (oldAnim) oldAnim.cancel();
    if (newAnim) newAnim.cancel();
    platesOld.width = plates.width; platesOld.height = plates.height;
    poctx.drawImage(plates, 0, 0);
    platesOld.style.display = 'block';
  }
  function finishOld() { platesOld.style.display = 'none'; oldAnim = newAnim = null; }
  function slidePlates(dir) {
    var d = T.slide * 1000;
    oldAnim = platesOld.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(' + (-dir * 100) + '%)' }],
      { duration: d, easing: EASE, fill: 'forwards' });
    newAnim = plates.animate([{ transform: 'translateX(' + (dir * 100) + '%)' }, { transform: 'translateX(0)' }],
      { duration: d, easing: EASE });
    oldAnim.onfinish = finishOld;
  }
  function crossfadePlates() { // 同じ形のまま中身が変わるとき（グレー → 金属など）
    oldAnim = platesOld.animate([{ opacity: 1 }, { opacity: 0 }], { duration: T.fade * 1000, easing: 'ease', fill: 'forwards' });
    oldAnim.onfinish = finishOld;
  }
  function fadeIn(el) {
    if (el && el.animate) el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: T.fade * 1000, easing: 'ease' });
  }

  /* ---------- 声の状態を判定 ----------
     silent : 声が聞こえない
     ok     : 基準の高さ
     high / low : はっきり高い／低い（選択を動かす）
     off-high / off-low : 基準から少し外れている */
  function zone(v) {
    if (!v.voiced) return (S.zone = 'silent');
    if (!S.base) return (S.zone = 'ok');
    var P = C.pitch, h = P.hysteresis, p = S.zone;
    var r = v.freq / S.base - 1, z;
    // いま入っている範囲は、境目を少し広げて抜けにくくする
    if (Math.abs(r) <= P.neutral + (p === 'ok' ? h : 0)) z = 'ok';
    else if (r > P.select - (p === 'high' ? h : 0)) z = 'high';
    else if (r < -(P.select - (p === 'low' ? h : 0))) z = 'low';
    else z = r > 0 ? 'off-high' : 'off-low';
    return (S.zone = z);
  }

  /* ---------- 毎フレームの更新 ---------- */
  var last = performance.now();
  function frame(now) {
    var dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    var v = SonoInput.read();
    var z = zone(v);
    var isSelect = S.screen === 'shape' || S.screen === 'material';
    var isHigh = z === 'high' || z === 'off-high', isLow = z === 'low' || z === 'off-low';
    var drawMoved = false; // DRAW：このフレームで進んだか（進まない間は砂も完全に止める）

    if (z === 'silent') S.silentFor += dt; else { S.silentFor = 0; S.started = true; }

    if (S.screen !== 'result' && S.doneAt === null) {
      if (S.screen === 'intro') {
        if (v.voiced) {
          // それまでの声の中央値から外れたら止める。外れたまま続いたら測り直す
          var ref = S.samples.length >= 15 ? median(S.samples) : null;
          if (ref && Math.abs(v.freq / ref - 1) > C.pitch.neutral) {
            S.introOff += dt;
            S.introDir = v.freq > ref ? 'high' : 'low';
            if (S.introOff >= T.introReset) { S.samples = []; S.progress = 0; S.introOff = 0; }
          } else {
            S.introOff = 0;
            S.progress += dt / T.hold;
            S.samples.push(v.freq);
          }
        } else S.introOff = 0;
      } else if (isSelect) {
        if (z === 'high' || z === 'low') {
          if (S.zoneFor === 0) S.nextStep = T.stepFirst;
          S.zoneFor += dt;
          if (S.zoneFor >= S.nextStep) { step(z === 'high' ? 1 : -1); S.nextStep += T.stepRepeat; }
        } else {
          S.zoneFor = 0;
          if (z === 'ok') S.progress += dt / T.selectHold;
        }
      } else if (z === 'ok') {
        S.progress += dt / (S.screen === 'draw' ? T.draw : T.hold);
        if (S.screen === 'draw') drawMoved = true;
      }
      if (S.progress >= 1) { S.progress = 1; S.doneAt = now; bar.classList.add('done'); }
    }

    if (S.doneAt !== null && now - S.doneAt > T.nextHold * 1000) { advance(); requestAnimationFrame(frame); return; }

    /* --- 表示 --- */
    // バーは進み具合を少し遅れてなめらかに追いかける（選び直して 0 に戻るときも滑らかに）
    S.barShown += (S.progress - S.barShown) * Math.min(1, dt * 10);
    var x = 10 + S.barShown * (W - 20);
    bar.querySelector('.fill').style.width = x + 'px';
    bar.querySelector('.dot').style.left = x + 'px';

    // 無音の表示：INTROは一度声を出した後だけ、他は一定時間続いたら
    var showSilent = S.screen !== 'result' && S.doneAt === null &&
      S.silentFor > T.silenceHint && (S.screen !== 'intro' || S.started);
    // 音程外れの表示：選択画面では高低が操作なので出さない
    var offPitch = !isSelect && S.doneAt === null &&
      (S.screen === 'intro' ? S.introOff > 0 : (isHigh || isLow));
    stage.classList.toggle('silent', showSilent);
    stage.classList.toggle('off-pitch', offPitch);
    msg.classList.toggle('silent', showSilent);
    msg.classList.toggle('warn', offPitch && (S.screen === 'frequency' || S.screen === 'intro'));

    // マイクが使えないときはその案内を優先（debug中はINTRO以外では出さない）
    var mm = (S.screen === 'intro' || !C.debug) && S.screen !== 'result' ? micMsg() : '';
    var m = '';
    if (mm && !v.voiced) m = mm;
    else if (showSilent) m = t('noVoice');
    else if (S.screen === 'intro') m = offPitch ? t('introOff') : t('introMsg');
    else if (S.screen === 'frequency') m = offPitch ? t(isHigh ? 'tooHigh' : 'tooLow') : t('freqMsg');
    else if (S.screen === 'draw') m = Math.round(S.progress * 100) + '%';
    if (msg.textContent !== m) msg.textContent = m;

    if (S.screen === 'intro') {
      // 声が出ていて高さが合っている間だけ模様が流れる。止まっている間は完全に静止
      if (v.voiced && S.introOff === 0 && S.doneAt === null) S.flow += dt * HT.flow;
      // 表示上の進み具合は少し遅れて追いかける（測り直しで戻るときも急に黒くならない）
      S.disp += (S.progress - S.disp) * Math.min(1, dt * 8);
      if (Math.abs(S.progress - S.disp) < 0.0005) S.disp = S.progress;
      drawHalftone(S.disp, S.flow);
    }
    if (S.screen === 'frequency' && !C.assets.waveform) drawWave(dt, SonoInput.loudness(), v.voiced ? v.freq : 0);
    if (S.screen === 'draw') {
      $('.d-hz .hz-num').textContent = Math.round(v.voiced ? v.freq : S.base);
      $('.d-warn').textContent = offPitch ? (isHigh ? 'TOO HIGH' : 'TOO LOW') : '';
      if (drawMoved) SonoSand.step(dt, Math.min(S.progress, 1) * T.draw, 0.6 + 0.4 * SonoInput.loudness());
      buzz(drawMoved, SonoInput.loudness(), now);
    }
    if (isSelect) updateMeter(v, z, dt);
    if (C.debug) showDebug(now, z);
    requestAnimationFrame(frame);
  }

  function median(arr) {
    var a = arr.slice().sort(function (p, q) { return p - q; });
    return a[Math.floor(a.length / 2)];
  }

  /* ---------- 動作確認用の表示（debug のときだけ） ---------- */
  var dbgEl = $('#debug-info'), dbgAt = 0;
  function showDebug(now, z) {
    if (now - dbgAt < 100) return;
    dbgAt = now;
    dbgEl.hidden = false;
    var s = SonoInput.stats();
    var f = function (x, d) { return x === null || x === undefined ? '-' : x.toFixed(d); };
    dbgEl.textContent =
      'MIC   ' + s.state + (s.held ? ' (button)' : '') + '\n' +
      'Hz    ' + (s.voiced ? f(s.freq, 1) : '-') + '  raw ' + f(s.raw, 1) + '\n' +
      'VOL   ' + f(s.level, 3) + ' / ' + f(s.thresh, 3) + '\n' +
      'CLEAR ' + f(s.clarity, 2) + ' / ' + C.mic.clarity.toFixed(2) + '\n' +
      'ZONE  ' + (S.screen === 'intro' ? (S.introOff > 0 ? 'off-' + S.introDir : z) : z) + '\n' +
      'BASE  ' + (S.base ? S.base.toFixed(1) : '-') +
      (S.pick && (S.screen === 'draw' || S.screen === 'result')
        ? '\nMODE  ' + S.pick.mode.label + ' (' + (S.pick.index + 1) + '/' + C.physics.count + ') ' + S.pick.freq.toFixed(0) + 'Hz' : '');
  }

  /* DRAW：声に合わせてスマホを震わせる（Android のみ）
     震えの強さは変えられないので、声が大きいほど1回に震える時間を長くして強さを表す。
     声が外れたり止まったりしたら、砂と同じくすぐ止める。 */
  var buzzing = false, buzzNext = 0;
  function buzz(on, loud, now) {
    if (!C.vibrate || !navigator.vibrate) return;
    if (!on) {
      if (buzzing) { navigator.vibrate(0); buzzing = false; }
      return;
    }
    if (buzzing && now < buzzNext) return;
    navigator.vibrate(Math.round((T.buzzMin + (T.buzzMax - T.buzzMin) * loud) * 1000));
    buzzing = true;
    buzzNext = now + T.buzzCycle * 1000;
  }
  document.addEventListener('visibilitychange', function () { if (document.hidden) buzz(false); });

  function advance() {
    if (S.screen === 'intro') {
      S.base = median(S.samples); // 中央値を基準周波数に
      SonoInput.setBase(S.base);
      go('frequency');
    } else if (S.screen === 'frequency') go('shape');
    else if (S.screen === 'shape') go('material');
    else if (S.screen === 'material') go('draw');
    else if (S.screen === 'draw') go('result');
  }

  /* ---------- INTRO：砂粒で黒から白へ ----------
     細かい砂粒の密度で明るさを表し、声を出すほど白が広がる。
     この粒の質感は、DRAW の砂につながる表現。 */
  var HT = C.halftone;
  // ゆらぎの元になる乱数の表（256×256、毎回同じ並び）
  var LAT = new Float32Array(65536);
  (function () { var x = 12345; for (var k = 0; k < 65536; k++) { x = (x * 1103515245 + 12345) & 0x7fffffff; LAT[k] = x / 0x7fffffff; } })();
  function hash(i, j) { return LAT[((j & 255) << 8) | (i & 255)]; }
  function vnoise(x, y) {
    var i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j;
    var u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
    var a = hash(i, j), b = hash(i + 1, j), c = hash(i, j + 1), d = hash(i + 1, j + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  // 縦に引き伸ばしたゆらぎ（0〜1。大きいところほど先に白くなる）
  function flowField(x, y, flow) {
    var n = vnoise(x / HT.scaleX, y / HT.scaleY + flow) * 0.65 +
      vnoise(x / (HT.scaleX * 0.45) + 7.3, y / (HT.scaleY * 0.5) + flow * 1.6) * 0.35;
    return Math.max(0, Math.min(1, (n - 0.2) / 0.6));
  }

  /* 砂粒の描き方：
     ゆらぎ（白くなる順番）は 8px おきに計算して間をなめらかにつなぎ、
     1粒ごとに固定の乱数と比べて白か黒かを決める（ランダムな粒の密度で濃淡が出る）。
     乱数は固定なので、止まっている間は粒も完全に静止する。 */
  var FG = 8, GR = HT.grain;
  var gCols, gRows, gTone, pw, ph, gctx, gImg, gRow, gPix, gRand;
  var grainCv = document.createElement('canvas');
  var WHITE = 0xFFFFFFFF, BLACK = 0xFF000000;
  function allocGrain() { // 画面の大きさに合わせて砂粒の入れ物を用意する
    gCols = Math.ceil(W / FG) + 2; gRows = Math.ceil(H / FG) + 2;
    gTone = new Float32Array(gCols * gRows);
    pw = Math.ceil(W / GR); ph = Math.ceil(H / GR);
    grainCv.width = pw; grainCv.height = ph;
    gctx = grainCv.getContext('2d');
    gImg = gctx.createImageData(pw, ph);
    gRow = new Float32Array(gCols);
    gPix = new Uint32Array(gImg.data.buffer);
    gRand = new Float32Array(pw * ph);
    for (var i = 0; i < gRand.length; i++) gRand[i] = Math.random();
    htMap = null;
  }
  allocGrain();

  // 下絵の画像があれば、その明るさを読み取る（明るいところから先に白くなる）
  var htMap = null;
  function loadHalftoneImage() {
    if (!C.assets.halftone) return;
    var im = new Image();
    im.onload = function () {
      var c = document.createElement('canvas');
      c.width = gCols; c.height = gRows;
      var g = c.getContext('2d');
      var k = Math.max(gCols / im.naturalWidth, gRows / im.naturalHeight);
      g.drawImage(im, (gCols - im.naturalWidth * k) / 2, (gRows - im.naturalHeight * k) / 2, im.naturalWidth * k, im.naturalHeight * k);
      try {
        var d = g.getImageData(0, 0, gCols, gRows).data;
        htMap = new Float32Array(gCols * gRows);
        for (var i = 0; i < htMap.length; i++) {
          htMap[i] = (d[i * 4] * 0.299 + d[i * 4 + 1] * 0.587 + d[i * 4 + 2] * 0.114) / 255;
        }
        htKey = '';
      } catch (e) {
        // file:// で開くと画像を読めないため、自動のゆらぎを使う（localhost なら読める）
        htMap = null;
      }
    };
    im.src = C.assets.halftone;
  }

  var htKey = '';
  function drawHalftone(p, flow) {
    var key = p.toFixed(4) + ':' + flow.toFixed(4);
    if (key === htKey) return; // 変化がなければ描き直さない（完全に止まる）
    htKey = key;
    var sft = HT.softness, con = HT.contrast, r, c, i;
    for (r = 0; r < gRows; r++) {
      for (c = 0; c < gCols; c++) {
        i = r * gCols + c;
        var n = htMap ? htMap[i] : flowField(c * FG, r * FG, flow);
        gTone[i] = (p * (1 + sft) - (1 - n) * sft - 0.5) * con + 0.5;
      }
    }
    var per = FG / GR; // 1マスあたりの粒の数（横）
    for (var py = 0; py < ph; py++) {
      // この行のゆらぎを、上下のマスから補間して1行分つくる
      var fy = (py + 0.5) * GR / FG, r0 = Math.floor(fy), ty = fy - r0;
      var row0 = r0 * gCols, row1 = row0 + gCols, base = py * pw, mn = 1, mx = 0;
      for (c = 0; c < gCols; c++) {
        var tv = gTone[row0 + c] + (gTone[row1 + c] - gTone[row0 + c]) * ty;
        gRow[c] = tv;
        if (tv < mn) mn = tv;
        if (tv > mx) mx = tv;
      }
      // 行全体が真っ黒／真っ白なら一気に塗る
      if (mx <= 0) { gPix.fill(BLACK, base, base + pw); continue; }
      if (mn >= 1) { gPix.fill(WHITE, base, base + pw); continue; }
      var px = 0;
      for (c = 0; c < gCols - 1 && px < pw; c++) {
        var t = gRow[c], step = (gRow[c + 1] - t) / per;
        for (var k = 0; k < per && px < pw; k++, px++) {
          i = base + px;
          gPix[i] = gRand[i] < t ? WHITE : BLACK;
          t += step;
        }
      }
    }
    gctx.putImageData(gImg, 0, 0);
    ctx.imageSmoothingEnabled = false; // 粒をぼかさず、くっきり拡大する
    ctx.drawImage(grainCv, 0, 0, W, H);
  }

  /* ---------- FREQUENCY：砂粒の波形 ----------
     画面の横幅いっぱいに、INTRO と同じ砂粒で描く。
     波の形（山の高さのばらつき）は右から左へ流れ、全体の高さはいまの音の大きさに合わせる。
     音が無いときは縮んで白紙になる。山と山の間はなめらかに補間し、砂粒も波と一緒に流れる。
     声が基準より高いほど山の間隔が細かく、低いほど大まかになる（なめらかに伸び縮みする）。
     （assets.waveform に画像を入れたら画像が優先されます） */
  var WV = C.wave;
  var wCols, wHist, wEnv;
  var wAcc = 0, wLoud = 0, wLast = 0, wScroll = 0, wBlank = false, wGap = WV.colGap;
  function allocWave() {
    wCols = Math.ceil(W / WV.minGap) + 3; wHist = new Float32Array(wCols);
    wEnv = new Float32Array(pw);
  }
  allocWave();
  function waveShape() { // 山1つ分の高さのばらつき（となりの山とならして角を取る）
    wLast = wLast * 0.2 + (0.15 + 0.85 * Math.random()) * 0.8;
    return wLast;
  }
  function resetWave() {
    wLast = 0.7;
    for (var c = 0; c < wCols; c++) wHist[c] = waveShape();
    wAcc = 0; wLoud = 0; wScroll = 0; wBlank = false; wGap = WV.colGap;
    gPix.fill(WHITE);
    gctx.putImageData(gImg, 0, 0); // INTRO の砂粒を消して白紙に
  }
  function drawWave(dt, loud, freq) {
    // 声の高さ → 山の間隔（声が出ていない間は直前の間隔のまま）
    if (freq && S.base) {
      var g = WV.colGap * Math.pow(S.base / freq, WV.pitchEffect);
      g = Math.max(WV.minGap, Math.min(WV.maxGap, g));
      wGap += (g - wGap) * Math.min(1, dt * 6);
    }
    htKey = '';
    // 音が出たらすぐ広がり、止まったら少しかけて縮む
    wLoud += (loud - wLoud) * Math.min(1, dt * (loud > wLoud ? 14 : 6));
    if (wLoud < 0.01) wLoud = 0;
    if (wLoud > 0) {
      wAcc += dt * WV.speed / wGap;
      wScroll += dt * WV.speed;
      while (wAcc >= 1) {
        wAcc -= 1;
        wHist.copyWithin(0, 1);
        wHist[wCols - 1] = waveShape();
      }
    }
    // 横1粒ごとの高さ
    var any = false, x, px;
    for (px = 0; px < pw; px++) {
      var f = (px + 0.5) * GR / wGap + wAcc, c = Math.floor(f), t = f - c;
      if (c + 1 >= wCols) c = wCols - 2;
      t = t * t * (3 - 2 * t);
      var h = (wHist[c] + (wHist[c + 1] - wHist[c]) * t) * Math.pow(wLoud, WV.gain) * WV.maxHalf;
      wEnv[px] = h;
      if (h > 0.5) any = true;
    }
    if (!any && wBlank) return; // 白紙のままなら描き直さない
    wBlank = !any;

    var cy = WV.centerY, den = WV.density, fall = WV.falloff;
    var top = Math.max(0, Math.floor((cy - WV.maxHalf - 2) / GR));
    var bot = Math.min(ph, Math.ceil((cy + WV.maxHalf + 2) / GR));
    var off = Math.floor(wScroll / GR) % pw;
    for (var py = top; py < bot; py++) {
      var dy = Math.abs((py + 0.5) * GR - cy), base = py * pw;
      for (px = 0; px < pw; px++) {
        var hh = wEnv[px], i = base + px;
        if (dy >= hh) { gPix[i] = WHITE; continue; }
        var q = den * Math.pow(1 - dy / hh, fall);
        // 乱数の位置を流れた分だけずらす＝砂粒が波と一緒に左へ流れる
        var ri = px + off; if (ri >= pw) ri -= pw;
        gPix[i] = gRand[base + ri] < q ? BLACK : WHITE;
      }
    }
    gctx.putImageData(gImg, 0, 0, 0, top, pw, bot - top);
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(grainCv, 0, 0, W, H);
  }

  /* ---------- RESULT のボタン（タップ操作） ---------- */
  $('#btn-change').addEventListener('click', function () { go('shape'); });
  $('#btn-restart').addEventListener('click', function () {
    S.base = null; S.shape = 0; S.material = 0; SonoInput.setBase(null); go('intro');
  });
  /* SAVE：板（金属）と砂を重ねた画像を PNG にする。
     スマホでは共有シート（「画像を保存」）、PC ではダウンロード。
     ※ ファイルを直接開いた（file://）状態では、ブラウザの制限で書き出せません */
  var saveFile = null;
  function prepareSave() {
    saveFile = null;
    var out = document.createElement('canvas');
    out.width = plates.width; out.height = plates.height;
    var o = out.getContext('2d');
    o.fillStyle = '#fff'; o.fillRect(0, 0, out.width, out.height);
    o.drawImage(plates, 0, 0, out.width, out.height);
    o.drawImage(fx, 0, 0, out.width, out.height);
    var name = 'sonograph-' + Math.round(S.base || 0) + 'hz-' + shapeName().toLowerCase() + '-' + materialName().toLowerCase() + '.png';
    try {
      out.toBlob(function (blob) {
        if (blob) saveFile = new File([blob], name, { type: 'image/png' });
      }, 'image/png');
    } catch (e) {
      console.warn('SAVE: ファイルを直接開くと書き出せません。Live Server（localhost）か HTTPS で開いてください。');
    }
  }
  $('#btn-save').addEventListener('click', function () {
    if (!saveFile) return;
    var mobile = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    if (mobile && navigator.canShare && navigator.canShare({ files: [saveFile] })) {
      navigator.share({ files: [saveFile] }).catch(function () {});
      return;
    }
    var a = document.createElement('a');
    a.href = URL.createObjectURL(saveFile);
    a.download = saveFile.name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
  });

  /* ---------- 開始 ---------- */
  SonoInput.init(C.debug);
  applyAssets();
  loadHalftoneImage();
  // カードが滑るときに画像の読み込み待ちで白くならないよう、形と金属の画像を先に読んでおく
  C.shapes.forEach(function (n) { loadImg(C.assets.shapes[n]); });
  C.materials.forEach(function (n) { if (C.assets.materials[n].texture) loadImg(C.assets.materials[n].texture); });
  go('intro');
  requestAnimationFrame(frame);
})();
