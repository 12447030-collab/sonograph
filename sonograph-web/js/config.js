/* ============================================================
   SONOGRAPH 設定ファイル
   画像の差し替え・文言・タイミングはすべてここで管理します。
   ============================================================ */
window.SONO_CONFIG = {

  /* 動作確認用。true のあいだは
     ・右上の LOW / BASE / HIGH ボタン（PCでは ↓ / スペース / ↑ キー）で
       声の代わりに操作できる（押している間はマイクより優先）
     ・右上に「いまの Hz・音量・判定」を小さく表示する
     本番では false にします。 */
  debug: true,

  /* DRAW で声が基準の高さで出ている間、スマホを震わせる。
     Android（Chrome）のみ。iPhone の Safari はウェブページから震わせる仕組みがないため震えません。 */
  vibrate: true,

  /* ---------- 画像アセット ----------
     パスを書き換える（または同名ファイルを上書きする）だけで反映されます。
     空文字 '' のものは、仮の描画（文字・Canvas）が使われます。 */
  assets: {
    logo: '',        // 例: 'assets/ui/logo.svg'（INTROのロゴ。白背景用）
    logoWhite: '',   // 例: 'assets/ui/logo-white.svg'（黒背景用）
    waveform: '',    // 例: 'assets/ui/waveform.png'（FREQUENCYの波形）
    /* INTRO のハーフトーンの「下絵」。白黒の画像を入れると、
       明るいところから先に白くなります（網点はプログラムが描きます）。
       空のあいだは、縦に流れるゆらぎを自動で作ります。 */
    halftone: '',    // 例: 'assets/ui/halftone.png'

    /* 固定の文言を画像に差し替える（空のあいだは文字で表示）。
       Illustrator から 390×844 のアートボードと同じ縮尺（等倍）で、
       文字の部分だけを SVG で書き出してください。画像の大きさがそのまま使われ、
       いまの文字と同じ位置（左上をそろえる、中央そろえの所は中央）に置かれます。 */
    texts: {
      tagline: '',        // Draw with Your Voice.（INTRO）
      yourVoiceIs: '',    // Your voice is（FREQUENCY）
      about: '',          // about（FREQUENCY。縦書きの向きは CSS で回転済み）
      drawTitle: '',      // DRAW WITH YOUR VOICE（DRAW）
      resultLogo: '',     // SONOGRAPH（RESULT）
      next: '',           // next（プログレスバー）
      SELECT_SHAPE: '',   // SELECT SHAPE
      SELECT_MATERIAL: '',// SELECT MATERIAL
      RECTANGLE: '', CIRCLE: '', SQUARE: '', TRIANGLE: '',   // 形の名前（ドラムロール）
      ALUMINUM: '', STEEL: '', BRASS: ''                     // 材質の名前（ドラムロール）
    },

    /* 形状の画像は「グレーの部分＝不透明／白い部分＝透明」で書き出してください
       （SVG または 透過PNG、390×844 の比率）。
       この1枚が SELECT SHAPE の背景と、SELECT MATERIAL 以降の
       「金属を塗る範囲（マスク）」の両方に使われます。 */
    shapes: {
      RECTANGLE: 'assets/shapes/rectangle.svg',
      CIRCLE:    'assets/shapes/circle.svg',
      SQUARE:    'assets/shapes/square.svg',
      TRIANGLE:  'assets/shapes/triangle.svg'
    },

    /* 金属の質感。texture に画像パスを入れると、形状のグレー部分に貼られます。
       空のあいだは color の単色で表示します。 */
    materials: {
      /* 元画像は「マテリアル」フォルダ。スマホで重くならないよう、
         高さ1700px の JPG に縮めたものを使っています */
      ALUMINUM: { color: '#DADADA', texture: 'assets/materials/aluminum.jpg' },
      STEEL:    { color: '#9C9C9C', texture: 'assets/materials/steel.jpg' },
      BRASS:    { color: '#D8BC62', texture: 'assets/materials/brass.jpg' }
    }
  },

  /* ---------- INTRO の砂粒（黒から白へ） ----------
     規則的な網点ではなく、細かい砂粒の「密度」で濃淡を表します。 */
  halftone: {
    grain: 1,       // 砂粒の大きさ（px）。1 がいちばん細かい
    scaleX: 34,     // ゆらぎの横幅（px）。小さいほど縦の筋が細く多くなる
    scaleY: 240,    // ゆらぎの縦の長さ（px）
    softness: 1,    // 白の広がり方のばらつき。大きいほど場所ごとの差が大きい
    contrast: 1.2,  // 白と黒の境目のくっきりさ（小さいほどグラデーションが長い）
    flow: 0.22      // 声を出している間、模様が上へ流れる速さ（止めるなら 0）
  },

  /* ---------- FREQUENCY の波形（INTRO と同じ砂粒で描く） ----------
     音が鳴っていないときは白紙。音の大きさが右から流れてきます。
     中心ほど砂粒が密で黒く、先端へ向かってまばらになります。 */
  wave: {
    centerY: 480,   // 波形の中心の高さ（px）
    maxHalf: 250,   // 波形の最大の高さ（中心から片側、px）
    gain: 0.55,     // 小さめの声でも波を大きく見せる度合い（1で音量そのまま、小さいほど大きく見える）
    colGap: 6,      // 基準の高さの声のときの、波の山の間隔（px）
    pitchEffect: 3, // 声の高さで山の間隔が変わる強さ。高い声ほど細かく、低い声ほど大まかに
    minGap: 2,      // 山の間隔のいちばん細かいとき（px）
    maxGap: 24,     // 山の間隔のいちばん大まかなとき（px）
    density: 0.95,  // 中心の砂粒の密度（0〜1。1でまっ黒）
    falloff: 1.6,   // 先端へ向かってまばらになる度合い（大きいほど早くまばらに）
    speed: 270      // 波が左へ流れる速さ（px／秒）
  },

  /* ---------- 板の定義（DRAW の砂の模様に使う） ----------
     形状画像のグレーの図形1つ1つ＝板1枚。位置と大きさは 390×844 上の px。
     画面からはみ出している板も、はみ出した先までの本当の大きさを書きます
     （模様はその板の中心を基準に作られ、画面端で切れて見えます）。
     形状画像を差し替えたら、ここも合わせて直してください。
       rect   : 左上 x, y と 幅 w, 高さ h
       circle : 中心 cx, cy と 半径 r
       tri    : 3つの頂点 p。1つ目と2つ目が底辺、3つ目が頂点。
                頂点が下向きの板と上向きの板では、模様も上下が反転します */
  plates: {
    RECTANGLE: [
      { type: 'rect', x: 15, y: 35, w: 360, h: 776 }
    ],
    CIRCLE: [
      { type: 'circle', cx: 89, cy: 18, r: 191 },
      { type: 'circle', cx: 462, cy: 115, r: 191 },
      { type: 'circle', cx: 195, cy: 390, r: 191 },
      { type: 'circle', cx: -81, cy: 662, r: 191 },
      { type: 'circle', cx: 296, cy: 758, r: 191 }
    ],
    SQUARE: [
      { type: 'rect', x: 0, y: 0, w: 130, h: 130 },
      { type: 'rect', x: 260, y: 0, w: 130, h: 130 },
      { type: 'rect', x: 130, y: 130, w: 130, h: 130 },
      { type: 'rect', x: 0, y: 260, w: 130, h: 130 },
      { type: 'rect', x: 260, y: 260, w: 130, h: 130 },
      { type: 'rect', x: 130, y: 390, w: 130, h: 130 },
      { type: 'rect', x: 0, y: 520, w: 130, h: 130 },
      { type: 'rect', x: 260, y: 520, w: 130, h: 130 },
      { type: 'rect', x: 130, y: 650, w: 130, h: 130 },
      { type: 'rect', x: 0, y: 780, w: 130, h: 130 },
      { type: 'rect', x: 260, y: 780, w: 130, h: 130 }
    ],
    TRIANGLE: [
      { type: 'tri', p: [[-97.5, 0], [97.5, 0], [0, 169]] },
      { type: 'tri', p: [[97.5, 0], [292.5, 0], [195, 169]] },
      { type: 'tri', p: [[292.5, 0], [487.5, 0], [390, 169]] },
      { type: 'tri', p: [[0, 169], [195, 169], [97.5, 338]] },
      { type: 'tri', p: [[195, 169], [390, 169], [292.5, 338]] },
      { type: 'tri', p: [[-97.5, 338], [97.5, 338], [0, 507]] },
      { type: 'tri', p: [[97.5, 338], [292.5, 338], [195, 507]] },
      { type: 'tri', p: [[292.5, 338], [487.5, 338], [390, 507]] },
      { type: 'tri', p: [[0, 507], [195, 507], [97.5, 676]] },
      { type: 'tri', p: [[195, 507], [390, 507], [292.5, 676]] },
      { type: 'tri', p: [[-97.5, 676], [97.5, 676], [0, 845]] },
      { type: 'tri', p: [[97.5, 676], [292.5, 676], [195, 845]] },
      { type: 'tri', p: [[292.5, 676], [487.5, 676], [390, 845]] }
    ]
  },

  /* ---------- 板の物理（材質と、声から模様を選ぶしくみ） ----------
     材質の硬さ（ヤング率 E）・密度 rho・ポアソン比 nu から、
     板の中を振動が伝わる速さが決まり、板が「響きやすい高さ」の一覧が決まります。
     その一覧から、その人の基準の声に一番近いものが選ばれます。 */
  physics: {
    materials: {
      ALUMINUM: { E: 69e9,  rho: 2700, nu: 0.33 },
      STEEL:    { E: 200e9, rho: 7850, nu: 0.30 },
      BRASS:    { E: 100e9, rho: 8500, nu: 0.34 }
    },
    refVoice: 165,          // この高さの声が refMaterial の板で、模様の一覧のちょうど真ん中に当たるよう、板の厚みを仮に決める
    refMaterial: 'ALUMINUM',
    skip: 2,                // いちばん単純な模様をいくつ除くか
    count: 60               // 候補にする模様の数。多いほど、声の高さの小さな違いで柄が変わり、細かい模様も出る
  },

  /* ---------- DRAW の砂 ---------- */
  sand: {
    travel: 90,       // 完成までに砂が動く距離（2px 単位）。大きいほど早めに線ができる
    still: 0.04,      // 揺れ（0〜1）がこれ未満の所では砂が止まる。大きいほど線が太い
    jitter: 0.35,     // 声を出している間、砂が跳ねて下の金属がのぞく強さ
    maxDelay: 0.25,   // 板ごとの始まりの遅れの最大（DRAW 全体の時間に対する割合）
    minEnd: 0.75,     // 一番早い板でも、全体のこの割合までは完成しない
    ease: 1,          // 砂が動くペース。1 で一定、大きいほど前半ゆっくり・後半に一気に形が出る

    /* 形ごとに上の値を変えたいときはここに書く（書いた項目だけ上書き） */
    shapes: {
      // 板が小さく形が早く見えてしまうため、後半に盛り上がるように
      TRIANGLE: { travel: 20, ease: 5 },
      SQUARE:   { travel: 20, ease: 5 }
    }
  },

  shapes: ['RECTANGLE', 'CIRCLE', 'SQUARE', 'TRIANGLE'],
  materials: ['ALUMINUM', 'STEEL', 'BRASS'],

  /* ---------- 時間（秒） ---------- */
  timing: {
    hold: 3,          // 次へ進むために声を維持する時間（INTRO・FREQUENCY）
    selectHold: 2,    // SELECT SHAPE / MATERIAL で決定するために声を維持する時間
    draw: 6,          // DRAW が 0→100% になるまでの発声時間
    buzzCycle: 0.15,  // DRAW の振動：この秒数ごとに震わせ直す
    buzzMin: 0.04,    // 声が小さいときに、1回で震える長さ（秒）
    buzzMax: 0.14,    // 声が大きいときに、1回で震える長さ（秒）
    stepFirst: 0.25,  // 高い／低い声を出してから最初に切り替わるまで
    stepRepeat: 1.0,  // 出し続けたとき、次に切り替わるまでの間隔
    silenceHint: 1.2, // 無音がこの秒数続いたら「声が聞こえません」を表示
    introReset: 1.0,  // INTRO で違う高さの声がこの秒数続いたら、測り直す
    nextHold: 0.45,   // バーが右端に着いてから画面が変わるまで
    slide: 0.55,      // 形・材質を切り替えるとき、背景のカードが横に滑る時間
    fade: 0.6         // 画面が変わるとき、文字や背景がふわっと現れる時間
  },

  /* ---------- 声の高さの判定（基準周波数に対する比率） ---------- */
  pitch: {
    neutral: 0.08,  // ±8% 以内は「基準の高さ」（約1.3半音）
    select: 0.15,   // ±15% を超えたら「高い声／低い声」として選択を動かす
    hysteresis: 0.02, // 一度入った範囲は、この分だけ外れにくくする（境目でのちらつき防止）
    meterRange: 5   // 選択画面のメーターの端が、基準から何半音か（1オクターブ＝12半音）
  },

  /* ---------- マイクと声の高さの測定 ----------
     実際の声や会場の音で試しながら調整する数値です。 */
  mic: {
    minFreq: 70,        // これより低い音は声とみなさない（Hz）
    maxFreq: 500,       // これより高い音は声とみなさない（Hz）
    clarity: 0.80,      // 波形の「繰り返しのはっきりさ」0〜1。これ未満は声とみなさない
                        //   上げると雑音に強くなるが、かすれた声を拾いにくくなる
    minLevel: 0.006,    // 声とみなす最小の音量
    noiseRatio: 3,      // 周りの音量の何倍以上を声とみなすか（上げると近くの声だけ拾う）
    calibrate: 0.5,     // 開始直後に周りの音量を測る時間（秒）
    hangover: 0.2,      // 声が一瞬途切れても「出ている」とみなす猶予（秒）
    median: 5,          // 何回分の測定値の中央値をとるか（数値のブレをならす）
    onset: 3,           // 何回続けて声が取れたら「出ている」とみなすか（物音対策）
    /* ブラウザの音声処理。声の高さを測るため、基本は全部オフ。
       雑音がひどい場合は noiseSuppression を true にして試す */
    constraints: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }
  },

  /* ---------- 文言 ---------- */
  text: {
    ja: {
      introMsg: '同じ高さの声を三秒間出してスタート',
      introOff: '同じ高さを保とう',
      tapToStart: 'タップしてはじめる',
      micDenied: 'マイクを許可しないと遊べません',
      openInBrowser: 'Safari / Chrome で開いてください',
      freqMsg: '三秒間、{hz}Hz を維持しよう',
      selectHint: '高い声や、低い声を出してみよう',
      selectMsg: '',
      noVoice: '声が聞こえません',
      tooHigh: '声が高すぎます',
      tooLow: '声が低すぎます'
    },
    en: {
      introMsg: 'HOLD ONE PITCH FOR 3 SECONDS TO START.',
      introOff: 'KEEP THE SAME PITCH.',
      tapToStart: 'TAP TO START.',
      micDenied: 'PLEASE ALLOW THE MICROPHONE TO PLAY.',
      openInBrowser: 'PLEASE OPEN IN SAFARI OR CHROME.',
      freqMsg: 'HOLD {hz}Hz FOR 3 SECONDS.',
      selectHint: 'TRY A HIGHER OR LOWER VOICE.',
      selectMsg: '',
      noVoice: 'NO VOICE DETECTED',
      tooHigh: 'TOO HIGH',
      tooLow: 'TOO LOW'
    }
  }
};
