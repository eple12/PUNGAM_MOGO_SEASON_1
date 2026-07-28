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
  const ERASE_BASE = 26;      // 일반 지우개(부분 지우기) 굵기(px) — 필압과 무관하게 고정
  const MIN_STEP = 0.7;       // 이 거리보다 가까운 점은 버린다
  const ERASE_R = 9;          // 획 지우개(획 전체 삭제) 반경(px)

  let W = 0, H = 0, dpr = 1;
  let strokes = [];
  let cur = null;
  let lastP = 0.5;

  /* ---------- 실행취소 / 다시 실행 ----------
     그리기(add)와 지우개(erase)만 기록한다(erase 는 원래 있던 위치 index 를
     같이 남겨 되돌릴 때 순서가 흐트러지지 않게 한다). 새 동작이 일어나면
     redo 스택은 버린다(표준 undo/redo 동작) — load()/clear() 로 캔버스
     내용이 통째로 바뀔 때도 이전 기록은 더 이상 의미가 없으므로 함께 비운다. */
  let history = [];
  let future = [];

  function pushHistory(action) {
    history.push(action);
    future = [];
  }

  /* ---------- 기본 도형 ---------- */
  const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  // 'erase' 종류는 필압과 무관하게 고정 굵기를 쓴다 — 실제 지우개처럼 크기가
  // 일정해야 지운 자국이 손 떨림에 따라 들쭉날쭉해지지 않는다.
  const widthOf = (p, k) => k === 'erase' ? ERASE_BASE : BASE * (0.60 + 0.80 * p);

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
  function dot(p, k) {
    ctx.beginPath();
    ctx.arc(p[0], p[1], widthOf(p[2], k) / 2, 0, Math.PI * 2);
    ctx.fill();
  }

  function styleUp() {
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = COLOR;
    ctx.fillStyle = COLOR;
  }

  // 'erase' 종류(일반 지우개)는 destination-out 합성으로 실제 픽셀을 지운다.
  // 캔버스 자체는 투명 배경이고 그 아래 실제 흰 종이 DOM 이 깔려 있으므로,
  // 지운 자리는 펜 색과 무관하게 종이가 그대로 비쳐 보인다.
  function eraseModeOn(k) {
    if (k === 'erase') ctx.globalCompositeOperation = 'destination-out';
  }
  function eraseModeOff(k) {
    if (k === 'erase') ctx.globalCompositeOperation = 'source-over';
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
    const k = s.k === 'erase' ? 'erase' : 'ink';
    eraseModeOn(k);
    if (n === 1) { dot(p[0], k); eraseModeOff(k); return; }
    line(p[0], mid(p[0], p[1]), widthOf(p[0][2], k));
    for (let i = 1; i < n - 1; i++) {
      quad(mid(p[i - 1], p[i]), p[i], mid(p[i], p[i + 1]), widthOf(p[i][2], k));
    }
    line(mid(p[n - 2], p[n - 1]), p[n - 1], widthOf(p[n - 1][2], k));
    eraseModeOff(k);
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

  /* ---------- 입력 ----------
     kind 를 'erase' 로 넘기면 일반 지우개(부분 지우기) 획이 된다. 그 외에는
     펜 필기(기본값)다 — begin/extend/end 생명주기와 실행취소 기록은 완전히
     동일하게 취급하고, 그리는 방식(색 대신 destination-out 합성)만 다르다. */
  function begin(x, y, pressure, kind) {
    const k = kind === 'erase' ? 'erase' : 'ink';
    lastP = pressure;
    cur = { p: [[x, y, pressure]], b: [x, y, x, y], k };
    styleUp();
    eraseModeOn(k);
    dot(cur.p[0], k);
    eraseModeOff(k);
  }

  function extend(x, y, pressure) {
    if (!cur) return;
    const k = cur.k;
    const p = cur.p;
    const last = p[p.length - 1];
    const dx = x - last[0], dy = y - last[1];
    if (dx * dx + dy * dy < MIN_STEP * MIN_STEP) return;

    lastP = lastP * 0.55 + pressure * 0.45;      // 굵기 급변 방지
    p.push([x, y, lastP]);
    bump(cur, x, y);

    const n = p.length;
    styleUp();
    eraseModeOn(k);
    if (n === 2) {
      line(p[0], mid(p[0], p[1]), widthOf(p[0][2], k));
    } else {
      quad(mid(p[n - 3], p[n - 2]), p[n - 2], mid(p[n - 2], p[n - 1]), widthOf(p[n - 2][2], k));
    }
    eraseModeOff(k);
  }

  // 성공 시 방금 확정한 획 객체를 돌려준다(호출부가 undoIfLast 로 되돌릴 수 있도록).
  function end() {
    if (!cur) return null;
    const k = cur.k;
    const p = cur.p, n = p.length;
    if (n >= 2) {
      styleUp();
      eraseModeOn(k);
      line(mid(p[n - 2], p[n - 1]), p[n - 1], widthOf(p[n - 1][2], k));
      eraseModeOff(k);
    }
    // 좌표를 소수 첫째 자리로 줄여 저장 용량을 아낀다
    cur.p = p.map(q => [Math.round(q[0] * 10) / 10, Math.round(q[1] * 10) / 10, Math.round(q[2] * 100) / 100]);
    strokes.push(cur);
    const s = cur;
    cur = null;
    pushHistory({ type: 'add', stroke: s });
    return s;
  }

  function cancel() {
    if (!cur) return;
    cur = null;
    redraw();
  }

  // 방금 end() 로 확정한 획이 여전히 맨 마지막 획일 때만 취소한다(애플펜슬이
  // 한 번의 접촉에 포인터를 중복으로 쏘아, 짧고 엉뚱한 직선 획이 진짜 획과
  // 거의 동시에 따로 생기는 경우를 걷어내기 위함).
  function undoIfLast(strokeRef) {
    if (strokes.length && strokes[strokes.length - 1] === strokeRef) {
      strokes.pop();
      // 방금 end() 에서 남긴 'add' 기록도 같이 지워, 실행취소를 눌렀을 때
      // 이미 아티팩트로 버려진 획이 다시 나타나지 않게 한다.
      if (history.length && history[history.length - 1].type === 'add' && history[history.length - 1].stroke === strokeRef) {
        history.pop();
      }
      redraw();
      return true;
    }
    return false;
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
      if (hit) {
        strokes.splice(i, 1);
        pushHistory({ type: 'erase', stroke: s, index: i });
        redraw();
        return true;
      }
    }
    return false;
  }

  /* ---------- 외부 API ---------- */
  function load(list) {
    strokes = (list || []).map(s => ({
      p: s.p,
      b: s.b || s.p.reduce((acc, q) => [Math.min(acc[0], q[0]), Math.min(acc[1], q[1]), Math.max(acc[2], q[0]), Math.max(acc[3], q[1])],
        [Infinity, Infinity, -Infinity, -Infinity]),
      k: s.k === 'erase' ? 'erase' : 'ink'
    }));
    cur = null;
    history = []; future = [];
    redraw();
  }
  function dump() { return strokes; }
  function clear() { strokes = []; cur = null; history = []; future = []; redraw(); }
  function count() { return strokes.length; }
  function size() { return { w: W, h: H }; }

  /* ---------- 실행취소 / 다시 실행 ---------- */
  function undo() {
    if (!history.length) return false;
    const a = history.pop();
    if (a.type === 'add') {
      const idx = strokes.indexOf(a.stroke);
      if (idx >= 0) strokes.splice(idx, 1);
    } else if (a.type === 'erase') {
      strokes.splice(Math.min(a.index, strokes.length), 0, a.stroke);
    }
    future.push(a);
    redraw();
    return true;
  }
  function redo() {
    if (!future.length) return false;
    const a = future.pop();
    if (a.type === 'add') {
      strokes.push(a.stroke);
    } else if (a.type === 'erase') {
      const idx = strokes.indexOf(a.stroke);
      if (idx >= 0) strokes.splice(idx, 1);
    }
    history.push(a);
    redraw();
    return true;
  }
  function canUndo() { return history.length > 0; }
  function canRedo() { return future.length > 0; }

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

  return {
    setSize, resizeTo, begin, extend, end, cancel, undoIfLast, eraseAt, load, dump, clear, redraw, count, size,
    undo, redo, canUndo, canRedo,
    eraseWidth: ERASE_BASE   // 일반 지우개 굵기(px) — 호출부가 지우개 범위 표시(커서 원)를 그릴 때 쓴다
  };
}
