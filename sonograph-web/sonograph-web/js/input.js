/* ============================================================
   声の入力
   アプリ本体は SonoInput.read() の結果だけを見ます。
     { voiced: 声が出ているか, freq: 高さ(Hz) }
   マイク（getUserMedia + Web Audio API）から声の高さを測ります。
   debug のときは LOW / BASE / HIGH ボタン（↓ / スペース / ↑）が
   押されている間だけ、マイクより優先されます。
   ============================================================ */
window.SonoInput = (function () {
  var M = window.SONO_CONFIG.mic;

  /* ---------- 仮入力（debug） ---------- */
  var held = null;        // 'low' | 'base' | 'high' | null
  var SIM_BASE = 165;     // 仮入力での声の高さ
  var base = null;        // アプリが確定した基準周波数

  function setHeld(v) { held = v; }

  function bind() {
    var panel = document.getElementById('debug');
    if (!panel) return;
    panel.hidden = false;
    panel.querySelectorAll('button').forEach(function (b) {
      var v = b.dataset.voice;
      b.addEventListener('pointerdown', function (e) { e.preventDefault(); setHeld(v); });
      ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (n) {
        b.addEventListener(n, function () { if (held === v) setHeld(null); });
      });
      b.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    });
    var keys = { ArrowUp: 'high', ArrowDown: 'low', ' ': 'base' };
    window.addEventListener('keydown', function (e) {
      if (keys[e.key]) { e.preventDefault(); setHeld(keys[e.key]); }
    });
    window.addEventListener('keyup', function (e) {
      if (keys[e.key] && held === keys[e.key]) setHeld(null);
    });
  }

  function simulated() {
    var b = base || SIM_BASE;
    var f = held === 'high' ? b * 1.25 : held === 'low' ? b * 0.78 : b;
    f += Math.sin(performance.now() / 130) * 1.5; // 声の自然な揺らぎの代わり
    return { voiced: true, freq: f };
  }

  /* ---------- マイク ----------
     state:
       idle        まだ開始していない（タップ待ち）
       starting    許可を待っている
       calibrating 周りの音量を測っている
       ready       測定中
       denied      許可されなかった／マイクが無い
       unsupported このブラウザでは使えない（アプリ内ブラウザなど） */
  var state = 'idle';
  var actx = null, analyser = null, buf = null, work = null, dprime = null, stream = null;
  var calib = [], calibUntil = 0;
  var noise = 0;                // 周りの音量（声が無いときの音量）
  var hist = [];                // 直近の測定値（中央値フィルタ用）
  var smooth = null;            // ならした高さ
  var lastGood = 0;             // 最後に声が取れた時刻
  var folded = 0;               // オクターブ補正が続いている回数
  var st = { level: 0, thresh: 0, clarity: 0, raw: null };

  function inAppBrowser() {
    return /Line\/|Instagram|FBAN|FBAV|FB_IAB|MicroMessenger|TikTok|Twitter/i.test(navigator.userAgent);
  }

  function start() {
    if (state === 'starting' || state === 'calibrating' || state === 'ready') return;
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || !AC) {
      state = 'unsupported';
      return;
    }
    state = 'starting';
    // iPhone では、タップの瞬間に音の処理を作っておく必要がある
    if (!actx) actx = new AC();
    if (actx.resume) actx.resume();

    navigator.mediaDevices.getUserMedia({ audio: M.constraints, video: false }).then(function (s) {
      stream = s;
      var src = actx.createMediaStreamSource(s);
      analyser = actx.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0;
      src.connect(analyser);
      buf = new Float32Array(analyser.fftSize);
      s.getAudioTracks().forEach(function (tr) {
        tr.addEventListener('ended', function () { state = 'idle'; reset(); });
      });
      calib = [];
      calibUntil = performance.now() + M.calibrate * 1000;
      state = 'calibrating';
      if (actx.state === 'suspended') actx.resume();
    }).catch(function () {
      state = inAppBrowser() ? 'unsupported' : 'denied';
    });
  }

  // 画面をタップしたとき：未開始なら開始、止まっていたら再開
  function tap() {
    if (state === 'idle' || state === 'denied') start();
    else if (actx && actx.state === 'suspended') actx.resume();
  }

  document.addEventListener('visibilitychange', function () {
    if (!document.hidden && actx && actx.state === 'suspended') actx.resume();
  });

  var voicedNow = false;         // いま「声が出ている」と判定中か
  function reset() { hist = []; smooth = null; folded = 0; voicedNow = false; }

  /* マイクの音を1回分読んで、音量と高さ（YIN法）を求める
     YIN法：波形を少しずつずらして元の波形と重ね、
     一番よく重なる「ずらし幅」＝1周期の長さから高さを出す方法 */
  function analyse() {
    analyser.getFloatTimeDomainData(buf);
    var sr = actx.sampleRate;
    var step = sr > 32000 ? 2 : 1;          // 計算を軽くするため、間引いて半分に
    var rate = sr / step;
    var n = Math.floor(buf.length / step);
    if (!work || work.length !== n) work = new Float32Array(n);

    var i, mean = 0, sum = 0;
    for (i = 0; i < n; i++) {
      work[i] = step === 2 ? (buf[2 * i] + buf[2 * i + 1]) * 0.5 : buf[i];
      mean += work[i];
    }
    mean /= n;
    for (i = 0; i < n; i++) { work[i] -= mean; sum += work[i] * work[i]; }
    var level = Math.sqrt(sum / n);

    var tauMin = Math.max(2, Math.floor(rate / M.maxFreq));
    var tauMax = Math.ceil(rate / M.minFreq);
    var W = n - tauMax;
    if (!dprime || dprime.length !== tauMax + 2) dprime = new Float32Array(tauMax + 2);

    // ずらし幅ごとの「重ならなさ」（小さいほどよく重なる）
    var running = 0, tau, j, d, diff;
    dprime[0] = 1;
    for (tau = 1; tau <= tauMax + 1; tau++) {
      d = 0;
      for (j = 0; j < W; j++) { diff = work[j] - work[j + tau]; d += diff * diff; }
      running += d;
      dprime[tau] = running > 0 ? d * tau / running : 1;
    }

    // しきい値を下回る最初の谷を探す（オクターブ上の誤検出を防ぐ）
    var thr = 1 - M.clarity, best = -1;
    for (tau = tauMin; tau <= tauMax; tau++) {
      if (dprime[tau] < thr) {
        while (tau + 1 <= tauMax && dprime[tau + 1] < dprime[tau]) tau++;
        best = tau;
        break;
      }
    }
    if (best < 0) {
      // 声らしくない音。参考として一番よく重なる位置の値だけ記録
      var mn = 1;
      for (tau = tauMin; tau <= tauMax; tau++) if (dprime[tau] < mn) mn = dprime[tau];
      return { level: level, clarity: 1 - mn, freq: null };
    }
    // 谷の底を、前後の値からなめらかに補う
    var a = dprime[best - 1], b = dprime[best], c = dprime[best + 1];
    var den = a - 2 * b + c;
    var t = den > 0 ? best + 0.5 * (a - c) / den : best;
    return { level: level, clarity: 1 - b, freq: rate / t };
  }

  function median(arr) {
    var s = arr.slice().sort(function (p, q) { return p - q; });
    return s[Math.floor(s.length / 2)];
  }

  function readMic() {
    var now = performance.now();
    var r = analyse();
    st.level = r.level; st.clarity = r.clarity; st.raw = r.freq;

    if (state === 'calibrating') {
      calib.push(r.level);
      if (now >= calibUntil) {
        // 開始直後に話していても引っぱられないよう、静かな側（下から2割）を採用
        var s = calib.slice().sort(function (p, q) { return p - q; });
        noise = s[Math.floor(s.length * 0.2)] || 0;
        state = 'ready';
      }
      st.thresh = Math.max(M.minLevel, noise * M.noiseRatio);
      return { voiced: false, freq: null };
    }

    var thresh = Math.max(M.minLevel, noise * M.noiseRatio);
    st.thresh = thresh;
    var f = r.freq;
    var good = f !== null && r.level >= thresh && f >= M.minFreq && f <= M.maxFreq;

    if (!good) {
      // 声ではない音だけで周りの音量を更新（下がるのは速く、上がるのはゆっくり）
      if (f === null) noise += (r.level - noise) * (r.level < noise ? 0.05 : 0.002);
    } else {
      // 声が続いているときの、1オクターブずれた誤検出を補正
      if (smooth && now - lastGood <= M.hangover * 1000) {
        var q = f / smooth;
        if (Math.abs(q - 2) < 0.12) { f /= 2; folded++; }
        else if (Math.abs(q - 0.5) < 0.03) { f *= 2; folded++; }
        else folded = 0;
        // 補正が長く続くなら、本当に高さを変えたとみなして受け入れる
        if (folded > 15) { f = r.freq; hist = []; smooth = null; folded = 0; }
      }
      hist.push(f);
      if (hist.length > M.median) hist.shift();
      var m = median(hist);
      // 小さな揺れはなめらかに、大きく変えたときはすぐ追従する
      smooth = smooth && Math.abs(m / smooth - 1) < 0.12 ? smooth * Math.pow(m / smooth, 0.35) : m;
      lastGood = now;
    }

    if (now - lastGood > M.hangover * 1000) { reset(); return { voiced: false, freq: null }; }
    if (hist.length < M.onset && !voicedNow) return { voiced: false, freq: null };
    voicedNow = true;
    return { voiced: true, freq: smooth };
  }

  function read() {
    var live = (state === 'calibrating' || state === 'ready') && analyser;
    var v = live ? readMic() : { voiced: false, freq: null };
    // 音の大きさ 0〜1：声とみなす音量で 0、そこから 30dB 大きいと 1
    st.loud = live && state === 'ready' && st.level > st.thresh
      ? Math.min(1, 20 * Math.log(st.level / st.thresh) / Math.LN10 / 30) : 0;
    if (held) { v = simulated(); st.loud = 0.45 + Math.random() * 0.25; }
    st.voiced = v.voiced; st.freq = v.freq;
    return v;
  }

  return {
    init: function (debug) { if (debug) bind(); },
    read: read,
    tap: tap,
    // マイクは動いているが、画面を離れたなどで音の処理が止まっている（iPhone で起きる）→ タップで再開
    state: function () {
      if ((state === 'calibrating' || state === 'ready') && actx && actx.state !== 'running') return 'paused';
      return state;
    },
    loudness: function () { return st.loud || 0; },
    stats: function () { st.state = state; st.held = held; return st; },
    setBase: function (f) { base = f; }
  };
})();
