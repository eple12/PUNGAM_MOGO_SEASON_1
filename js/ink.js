/* =====================================================================
 * 필기 엔진
 *  - 검은 펜 1종, 획 단위 지우개
 *  - 좌표는 CSS 픽셀 기준, 획은 [ [x,y,pressure], ... ] 로 저장
 *  - 중점 이차 베지에 보간 + coalesced 이벤트로 부드러운 획을 만든다
 * ===================================================================== */

function createInk(canvas) {

  // desynchronized:true 는 일부 갤럭시탭(Samsung Internet/WebView) GPU 합성 경로에서
  // 캔버스를 불투명 검정으로 그리는 버그를 유발해 문제 화면을 가려 버리므로 사용하지 않는다.
  const ctx = canvas.getContext('2d');

  const COLOR = '#141518';
  const BASE = 2.35;          // 기준 굵기(px)
  const MIN_STEP = 0.7;       // 이 거리보다 가까운 점은 버린다
  const ERASE_R = 9;          // 획 지우개 반경(px)

  let W = 0, H = 0, dpr = 1;
  let strokes = [];
  let cur = null;
  let lastP = 0.5;
  let lastEnd = null;         // 직전에 끝난 획의 끝점(x,y,t,cancel 여부) — 이어 그리기 병합 판정용
  // pointercancel(사용자 의도가 아닌, 브라우저/OS 가 강제로 끊은 경우)로 끊긴 직후에만
  // 적용되므로, 의도적으로 뗐다 다시 찍는 정상 필기(점 찍기 등)를 오인해 잘못 이어붙일
  // 걱정 없이 넉넉하게 잡는다 — 빠르게 휙 긋는 동안 취소~재접촉 사이 펜이 꽤 멀리
  // 이동해 있을 수 있기 때문.
  const RESUME_MS = 450;
  const RESUME_R = 140;

  /* ---------- 기본 도형 ---------- */
  const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const widthOf = p => BASE * (0.60 + 0.80 * p);

  function line(a, b, w) {
    ctx.beginPath();
    ctx.moveTo(a[0], a[1]);
    ctx.lineTo(b[0], b[1]);
    ctx.lineWidth = w;
    ctx.stroke();
  }
  function quad(a, c, b, w) {
    ctx.beginPath();
    ctx.moveTo(a[0], a[1]);
    ctx.quadraticCurveTo(c[0], c[1], b[0], b[1]);
    ctx.lineWidth = w;
    ctx.stroke();
  }
  function dot(p) {
    ctx.beginPath();
    ctx.arc(p[0], p[1], widthOf(p[2]) / 2, 0, Math.PI * 2);
    ctx.fill();
  }

  function styleUp() {
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = COLOR;
    ctx.fillStyle = COLOR;
  }

  /* ---------- 캔버스 크기 ---------- */
  function setSize(w, h) {
    W = Math.max(1, Math.round(w));
    H = Math.max(1, Math.round(h));
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    // 지나치게 큰 버퍼는 태블릿 메모리를 압박하므로 상한을 둔다
    while (W * H * dpr * dpr > 26e6 && dpr > 1) dpr -= 0.25;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    styleUp();
    redraw();
  }

  /* ---------- 획 그리기 ---------- */
  function renderStroke(s) {
    const p = s.p, n = p.length;
    if (n === 0) return;
    if (n === 1) { dot(p[0]); return; }
    line(p[0], mid(p[0], p[1]), widthOf(p[0][2]));
    for (let i = 1; i < n - 1; i++) {
      quad(mid(p[i - 1], p[i]), p[i], mid(p[i], p[i + 1]), widthOf(p[i][2]));
    }
    line(mid(p[n - 2], p[n - 1]), p[n - 1], widthOf(p[n - 1][2]));
  }

  function redraw() {
    ctx.clearRect(0, 0, W, H);
    styleUp();
    for (let i = 0; i < strokes.length; i++) renderStroke(strokes[i]);
    if (cur) renderStroke(cur);
  }

  function bump(s, x, y) {
    const b = s.b;
    if (x < b[0]) b[0] = x;
    if (y < b[1]) b[1] = y;
    if (x > b[2]) b[2] = x;
    if (y > b[3]) b[3] = y;
  }

  /* ---------- 입력 ---------- */
  function begin(x, y, pressure) {
    // 빠르게 휙 긋는 획 초반에 iPadOS/WebKit 이 애플펜슬 포인터를 순간적으로
    // pointercancel 시켰다가 곧바로 다시 내리찍는 경우가 있다(하드웨어/OS 단
    // 접촉 판정 버그). 방금 끝난 획의 끝점과 아주 가깝고 아주 가까운 시간 안에
    // 새 획이 시작되면, 새 획으로 취급하지 않고 직전 획에 이어 붙여 하나의
    // 매끄러운 획으로 만든다.
    if (lastEnd && lastEnd.cancel &&
        performance.now() - lastEnd.t < RESUME_MS &&
        Math.hypot(x - lastEnd.x, y - lastEnd.y) < RESUME_R &&
        strokes.length && strokes[strokes.length - 1] === lastEnd.stroke) {
      cur = strokes.pop();
      lastEnd = null;
      extend(x, y, pressure);
      return;
    }
    lastEnd = null;
    lastP = pressure;
    cur = { p: [[x, y, pressure]], b: [x, y, x, y] };
    styleUp();
    dot(cur.p[0]);
  }

  function extend(x, y, pressure) {
    if (!cur) return;
    const p = cur.p;
    const last = p[p.length - 1];
    const dx = x - last[0], dy = y - last[1];
    if (dx * dx + dy * dy < MIN_STEP * MIN_STEP) return;

    lastP = lastP * 0.55 + pressure * 0.45;      // 굵기 급변 방지
    p.push([x, y, lastP]);
    bump(cur, x, y);

    const n = p.length;
    styleUp();
    if (n === 2) {
      line(p[0], mid(p[0], p[1]), widthOf(p[0][2]));
    } else {
      quad(mid(p[n - 3], p[n - 2]), p[n - 2], mid(p[n - 2], p[n - 1]), widthOf(p[n - 2][2]));
    }
  }

  function end(viaCancel) {
    if (!cur) return false;
    const p = cur.p, n = p.length;
    if (n >= 2) {
      styleUp();
      line(mid(p[n - 2], p[n - 1]), p[n - 1], widthOf(p[n - 1][2]));
    }
    // 좌표를 소수 첫째 자리로 줄여 저장 용량을 아낀다
    cur.p = p.map(q => [Math.round(q[0] * 10) / 10, Math.round(q[1] * 10) / 10, Math.round(q[2] * 100) / 100]);
    strokes.push(cur);
    const last = cur.p[cur.p.length - 1];
    lastEnd = { x: last[0], y: last[1], t: performance.now(), stroke: cur, cancel: !!viaCancel };
    cur = null;
    return true;
  }

  function cancel() {
    lastEnd = null;
    if (!cur) return;
    cur = null;
    redraw();
  }

  /* ---------- 획 지우개 ---------- */
  function distToSeg(px, py, a, b) {
    const vx = b[0] - a[0], vy = b[1] - a[1];
    const wx = px - a[0], wy = py - a[1];
    const len = vx * vx + vy * vy;
    let t = len ? (wx * vx + wy * vy) / len : 0;
    t = t < 0 ? 0 : (t > 1 ? 1 : t);
    const cx = a[0] + t * vx - px, cy = a[1] + t * vy - py;
    return Math.sqrt(cx * cx + cy * cy);
  }

  function eraseAt(x, y) {
    for (let i = strokes.length - 1; i >= 0; i--) {
      const s = strokes[i], b = s.b;
      if (x < b[0] - ERASE_R || x > b[2] + ERASE_R || y < b[1] - ERASE_R || y > b[3] + ERASE_R) continue;
      const p = s.p;
      let hit = false;
      if (p.length === 1) {
        hit = Math.hypot(p[0][0] - x, p[0][1] - y) <= ERASE_R;
      } else {
        for (let k = 1; k < p.length; k++) {
          if (distToSeg(x, y, p[k - 1], p[k]) <= ERASE_R) { hit = true; break; }
        }
      }
      if (hit) { strokes.splice(i, 1); redraw(); return true; }
    }
    return false;
  }

  /* ---------- 외부 API ---------- */
  function load(list) {
    strokes = (list || []).map(s => ({
      p: s.p,
      b: s.b || s.p.reduce((acc, q) => [Math.min(acc[0], q[0]), Math.min(acc[1], q[1]), Math.max(acc[2], q[0]), Math.max(acc[3], q[1])],
        [Infinity, Infinity, -Infinity, -Infinity])
    }));
    cur = null;
    lastEnd = null;
    redraw();
  }
  function dump() { return strokes; }
  function clear() { strokes = []; cur = null; lastEnd = null; redraw(); }
  function count() { return strokes.length; }
  function size() { return { w: W, h: H }; }

  /* 가로/세로 전환 등으로 캔버스 크기가 바뀔 때, 필기를 원래 있던 상대적
     위치 그대로 유지하도록 좌표를 새 크기 비율에 맞춰 미리 늘리고 줄인다.
     (그냥 setSize 만 부르면 픽셀 좌표가 그대로 남아 내용과 어긋난다) */
  function resizeTo(w, h) {
    w = Math.max(1, Math.round(w));
    h = Math.max(1, Math.round(h));
    if (W > 0 && H > 0 && (w !== W || h !== H)) {
      const sx = w / W, sy = h / H;
      strokes.forEach(s => {
        s.p = s.p.map(q => [q[0] * sx, q[1] * sy, q[2]]);
        s.b = [s.b[0] * sx, s.b[1] * sy, s.b[2] * sx, s.b[3] * sy];
      });
    }
    setSize(w, h);
  }

  return { setSize, resizeTo, begin, extend, end, cancel, eraseAt, load, dump, clear, redraw, count, size };
}
