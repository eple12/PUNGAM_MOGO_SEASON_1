/* =====================================================================
 * 시험 화면 — 문제 표시 · 필기 · 스크롤 · 문항 이동
 * ===================================================================== */

const Exam = (() => {

  const S = Store.s;

  let scroll, paper, inner, canvas, ink, eraserCursor;
  let loadedFor = null;             // 캔버스에 현재 올라와 있는 문항 번호
  let tool = 'pen';                 // pen | eraser
  let mounted = false;
  let reviewMode = false;

  // 애플펜슬 접촉 한 번에 포인터 스트림이 두 번(즉시 끝났다 곧바로 다시 시작) 잡히는
  // 버그는 iPadOS Safari 에서만 관찰된다. 갤럭시 S펜 등 다른 환경까지 같은 방식으로
  // 걸러내면 사람이 비슷한 자리에 빠르게 연속으로 쓴 정상 획(점 찍기 등)이 중복
  // 아티팩트로 오인되어 지워진다("씹힘"). iPadOS 13+ 의 Safari 는 데스크톱 Mac 으로
  // 위장하지만 멀티터치를 지원한다는 점으로 구분한다.
  const IS_IPADOS = /iPad/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  /* ---------- 필기 좌표 ---------- */
  function pt(e) {
    const r = canvas.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  }

  /* ---------- 지우개 범위 표시 ---------- */
  function showEraserCursor(e) {
    if (!eraserCursor || tool !== 'erase-area' || reviewMode) { hideEraserCursor(); return; }
    const [x, y] = pt(e);
    eraserCursor.style.left = x + 'px';
    eraserCursor.style.top = y + 'px';
    eraserCursor.hidden = false;
  }
  function hideEraserCursor() {
    if (eraserCursor) eraserCursor.hidden = true;
  }

  /* ---------- 레이아웃 ---------- */
  function relayout() {
    const minH = scroll.clientHeight + 240;
    const need = inner.offsetHeight + CONFIG.inkExtraSpace;
    paper.style.height = Math.max(minH, need) + 'px';
    // 캔버스는 테두리를 뺀 안쪽 영역에 정확히 겹쳐야 한다.
    // resizeTo 는 화면 회전 등으로 크기가 바뀌어도 필기의 상대적 위치를 유지한다.
    const w = paper.clientWidth, h = paper.clientHeight;
    const cur = ink.size();
    if (Math.abs(cur.w - w) > 0.5 || Math.abs(cur.h - h) > 0.5) {
      ink.resizeTo(w, h);
    }
  }

  /* ---------- 문항 표시 ---------- */
  function show(no) {
    if (no < 1) no = 1;
    if (no > QUESTIONS.length) no = QUESTIONS.length;
    saveStrokes();
    S.current = no;
    const q = getQuestion(no);

    inner.innerHTML =
      '<div class="qmeta">' +
        '<span class="qmeta__author">출제자 : ' + q.author + '</span>' +
        '<span class="qmeta__pt">' + q.points + '점' + (q.type === 'choice' ? ' · 5지선다형' : ' · 단답형') + '</span>' +
      '</div>' +
      '<div class="qtext" id="qtext">' + U.questionHtml(q) + '</div>' +
      '<div class="workline"><span>이 아래는 필기 공간입니다</span></div>';

    U.typeset(U.el('#qtext', inner));

    scroll.scrollTop = 0;
    relayout();                                   // KaTeX 는 동기 렌더이므로 즉시 높이가 확정된다
    ink.load(S.strokes[no] || []);
    loadedFor = no;
    updateUndoRedo();
    requestAnimationFrame(() => {                 // 웹폰트가 늦게 붙는 경우를 대비한 재계산
      const before = paper.style.height;
      relayout();
      if (paper.style.height !== before) { ink.load(S.strokes[no] || []); updateUndoRedo(); }
    });

    U.el('#qpickNo').textContent = no;
    U.el('#qpickNo').classList.toggle('is-marked', Store.isMarked(no));
    U.el('#btnPrev').disabled = (no === 1);
    U.el('#btnNext').disabled = (no === QUESTIONS.length);
    paintQList();
    Store.save();
  }

  /* 캔버스에 올라와 있는 문항에 대해서만 저장한다.
     (아직 아무것도 싣지 않은 빈 캔버스로 기존 필기를 지우는 일을 막는다) */
  function saveStrokes() {
    if (!ink || loadedFor == null) return;
    const list = ink.dump();
    if (list.length) {
      S.strokes[loadedFor] = list;
      S.strokeSize[loadedFor] = ink.size();
    } else {
      delete S.strokes[loadedFor];
      delete S.strokeSize[loadedFor];
    }
  }

  /* ---------- 문항 목록 ---------- */
  function paintQList() {
    const grid = U.el('#qlistGrid');
    if (!grid) return;
    if (!grid.childElementCount) {
      grid.innerHTML = QUESTIONS.map(q =>
        '<button type="button" class="qchip" data-no="' + q.no + '">' +
          '<span class="qchip__no">' + q.no + '</span>' +
          '<span class="qchip__pt">' + q.points + '</span>' +
        '</button>').join('');
      grid.addEventListener('click', e => {
        const b = e.target.closest('.qchip');
        if (!b) return;
        show(+b.dataset.no);
        U.el('#qlist').hidden = true;
      });
    }
    U.els('.qchip', grid).forEach(b => {
      const no = +b.dataset.no;
      b.classList.toggle('is-done', Store.isMarked(no));
      b.classList.toggle('is-cur', no === S.current);
    });
  }

  /* ---------- 도구 ----------
     tool: 'pen' | 'eraser'(획 지우개 — 닿은 획을 통째로 지운다) |
     'erase-area'(일반 지우개 — 실제 지우개처럼 지나간 자리만 부분적으로 지운다) */
  function setTool(t) {
    tool = t;
    U.el('#toolPen').classList.toggle('is-on', t === 'pen');
    U.el('#toolEraserArea').classList.toggle('is-on', t === 'erase-area');
    U.el('#toolEraser').classList.toggle('is-on', t === 'eraser');
    paper.classList.toggle('is-erasing', t === 'eraser' || t === 'erase-area');
    if (t !== 'erase-area') hideEraserCursor();
  }

  function setFingerDraw(on) {
    S.fingerDraw = on;
    // 글자를 바꾸면(예: "손가락 필기 켬") 버튼 폭이 달라져 옆 버튼들이 밀리므로
    // 라벨은 그대로 두고 켜짐 여부는 채움(is-on) 색으로만 표시한다.
    U.el('#toolFinger').classList.toggle('is-on', on);
    Store.save();
  }

  /* ---------- 실행취소 / 다시 실행 ---------- */
  function updateUndoRedo() {
    if (!ink) return;
    const bu = U.el('#btnUndo'), br = U.el('#btnRedo');
    if (bu) bu.disabled = reviewMode || !ink.canUndo();
    if (br) br.disabled = reviewMode || !ink.canRedo();
  }

  /* ---------- 포인터 처리 ---------- */
  function bindPointer() {
    const pointers = new Map();
    let act = null;                 // 'draw' | 'erase' | 'scroll'
    let drawId = null;
    let sc = null;                  // 스크롤 상태
    let flingId = 0;

    // 방금 끝난 획을 바로 확정하지 않고 아주 짧게 들고 있다가, 그 사이 새 펜 입력이
    // 들어오면 방금 끝난 획은 중복 아티팩트로 보고 버린다(IS_IPADOS 에서만 동작).
    // 사람이 의도적으로 다시 찍는 필기(점 찍기 등)는 이 시간보다 훨씬 느리므로,
    // 추가로 "짧고 곧은 잔가지" 모양(점 2개 이하 또는 아주 작은 범위)일 때만 의심한다.
    let pendingStroke = null;
    let pendingTimer = 0;
    const DUP_MS = 45;
    const DUP_R = 10;                // 이 거리보다 가까울 때만 "같은 접촉점" 중복으로 본다
    const DUP_SPAN = 20;             // 이 범위보다 넓게 그려진 획은 진짜 필기로 본다
    const PALM_GRACE_MS = 250;       // 이 시간 안에 펜이 뒤이어 닿으면 먼저 닿은 touch 를 손바닥으로 의심한다

    function looksLikeArtifact(s, x, y) {
      const p0 = s.p[0];
      if (Math.hypot(x - p0[0], y - p0[1]) >= DUP_R) return false;
      const b = s.b;
      return (b[2] - b[0]) < DUP_SPAN && (b[3] - b[1]) < DUP_SPAN;
    }

    const canDraw = e => e.pointerType === 'pen' || e.pointerType === 'mouse' || (S.fingerDraw && e.pointerType === 'touch');
    const avgY = () => {
      let s = 0; pointers.forEach(p => s += p.y); return s / pointers.size;
    };

    function stopFling() { cancelAnimationFrame(flingId); flingId = 0; }

    function fling(v) {
      stopFling();
      if (Math.abs(v) < 1.2) return;
      const step = () => {
        v *= 0.945;
        if (Math.abs(v) < 0.2) return;
        const before = scroll.scrollTop;
        scroll.scrollTop -= v;
        if (scroll.scrollTop === before) return;
        flingId = requestAnimationFrame(step);
      };
      flingId = requestAnimationFrame(step);
    }

    function beginScroll() {
      act = 'scroll';
      sc = { y: avgY(), t: performance.now(), v: 0, t0: performance.now(), startTop: scroll.scrollTop };
    }

    // Excalidraw 의 실제 수정을 그대로 옮긴 것(PR #4705, onTapStart, 커밋 7049e2a).
    // 그 소스를 직접 확인해 보면 그리기 로직이 있는 pointerdown 이 아니라, 완전히
    // 별도로 캔버스에 붙인 이 touchstart 리스너 맨 첫 줄에서만 preventDefault() 를
    // 부른다 — iOS 의 Scribble(필기 인식) 제스처가 손을 대는 건 pointerdown 시점이
    // 아니라 이 touchstart 시점이라, 여기서 막아야 실제로 이긴다.
    canvas.addEventListener('touchstart', e => {
      // fix for Apple Pencil Scribble
      e.preventDefault();
    }, { passive: false });

    canvas.addEventListener('pointerdown', e => {
      // 다른 어떤 처리보다 먼저 부른다. iOS 의 "스크리블(Scribble)" 등 시스템
      // 제스처 인식기가 이 접촉을 가로채는 걸 막으려면 로직이 끝난 뒤가 아니라
      // 핸들러 진입 즉시 preventDefault 를 걸어야 한다 — Excalidraw 가 애플펜슬
      // 획 누락 버그를 고친 방식과 같다(PR #4705, "fix for Apple Pencil Scribble").
      e.preventDefault();

      if (reviewMode && tool === 'eraser') return;

      // 애플펜슬로 필기 중 손바닥이 화면에 닿아 생기는 touch 포인터를 걸러낸다.
      // iPadOS Safari 는 안드로이드 S펜과 달리 펜 입력 중에도 손바닥 접촉을 그대로
      // touch 포인터로 올려보내는데, 이를 그냥 두면 아래 2포인터 판정에 걸려
      // 필기 중이던 획이 취소되고 스크롤로 전환돼 버린다("글씨가 드래그됨" 증상).
      if (e.pointerType === 'touch' && !S.fingerDraw && (drawId !== null || act === 'draw' || act === 'erase')) {
        return;
      }

      stopFling();
      pointers.set(e.pointerId, { y: e.clientY, type: e.pointerType });

      const drawnByTouch = drawId !== null && pointers.get(drawId) && pointers.get(drawId).type === 'touch';
      if (pointers.size >= 2 && (drawnByTouch || act !== 'draw')) {
        // 펜을 내려찍기 직전, 손바닥이 아주 살짝 먼저 닿아 "touch 로 스크롤 시작"으로
        // 잘못 분류돼 있던 상태를 되돌린다. 실제로 손가락으로 화면을 끌어 스크롤하려던
        // 것이었다면 이 시점에 이미 화면이 조금이라도 움직여 있어야 정상이므로, 아직
        // 전혀 움직이지 않았고 아주 최근(PALM_GRACE_MS 이내)에 시작된 단일 touch 뒤로
        // 펜이 바로 뒤이어 닿은 경우에만 그 touch 를 손바닥으로 보고 걷어낸다.
        const others = Array.from(pointers.entries()).filter(([id]) => id !== e.pointerId);
        const onlyStillTouch = others.length === 1 && others[0][1].type === 'touch';
        if (canDraw(e) && act === 'scroll' && !S.fingerDraw && !reviewMode && onlyStillTouch && sc &&
            scroll.scrollTop === sc.startTop && performance.now() - sc.t0 < PALM_GRACE_MS) {
          pointers.delete(others[0][0]);
          act = null; sc = null;
          // 아래로 흘러가 정상적인 필기 시작 로직을 그대로 탄다.
        } else {
          if (act === 'draw') { ink.cancel(); drawId = null; }
          beginScroll();
          return;
        }
      }
      if (pointers.size >= 2) return; // pen/mouse 필기 중 들어온 여분 포인터는 무시

      if (canDraw(e)) {
        if (reviewMode) { beginScroll(); return; }
        const [x, y] = pt(e);
        if (pendingStroke) {
          // 진짜 중복 아티팩트는 방금 그 자리(같은 접촉점)에서, 아주 작은 범위로만
          // 잡히므로 그 모양일 때만 버린다. 점선처럼 일부러 조금 떨어진 곳을 빠르게
          // 연속으로 찍는 정상 필기까지 지워버리지 않기 위한 구분이다.
          if (looksLikeArtifact(pendingStroke, x, y)) {
            clearTimeout(pendingTimer);
            ink.undoIfLast(pendingStroke);
          }
          pendingStroke = null;
        }
        if (tool === 'eraser') { act = 'erase'; ink.eraseAt(x, y); }
        else if (tool === 'erase-area') { act = 'draw'; ink.begin(x, y, e.pressure || 0.5, 'erase'); }
        else { act = 'draw'; ink.begin(x, y, e.pressure || 0.5); }
        drawId = e.pointerId;
        try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* 캡처 실패해도 필기는 이어진다 */ }
      } else {
        beginScroll();
      }
    }, { passive: false });

    canvas.addEventListener('pointermove', e => {
      e.preventDefault();   // 위 pointerdown 과 같은 이유로 가장 먼저 부른다
      if (!pointers.has(e.pointerId)) return;
      pointers.set(e.pointerId, { y: e.clientY, type: pointers.get(e.pointerId).type });

      if (act === 'scroll' && sc) {
        const y = avgY();
        const now = performance.now();
        const dy = y - sc.y;
        scroll.scrollTop -= dy;
        const dt = Math.max(1, now - sc.t);
        sc.v = sc.v * 0.6 + (dy / dt * 16) * 0.4;
        sc.y = y; sc.t = now;
        return;
      }
      if (e.pointerId !== drawId) return;

      // 애플펜슬은 화면에 닿기 전 "호버" 상태에서도 pointermove 를 보낼 수 있고
      // 이때 pressure 는 항상 정확히 0 이다 — 실제로 펜이 눌린 채 그리는 중에는
      // 그럴 수 없으므로 그런 좌표만 걸러낸다(U.penEvents, js/util.js 참고).
      const list = U.penEvents(e);
      if (act === 'draw') {
        list.forEach(ev => { const [x, y] = pt(ev); ink.extend(x, y, ev.pressure || 0.5); });
      } else if (act === 'erase') {
        list.forEach(ev => { const [x, y] = pt(ev); ink.eraseAt(x, y); });
      }
    }, { passive: false });

    function finish(e) {
      pointers.delete(e.pointerId);
      if (act === 'draw' && e.pointerId === drawId) {
        const s = ink.end();
        if (s && IS_IPADOS) {
          // 바로 확정하지 않고 DUP_MS 만큼 들고 있는다. 그 사이 새 펜 입력이
          // 오면(pointerdown 핸들러) 이 획은 중복 아티팩트로 보고 버려진다.
          clearTimeout(pendingTimer);
          pendingStroke = s;
          pendingTimer = setTimeout(() => {
            pendingStroke = null;
            saveStrokes(); Store.save(); updateUndoRedo();
          }, DUP_MS);
        } else if (s) {
          saveStrokes(); Store.save(); updateUndoRedo();
        }
        drawId = null;
      }
      if (act === 'erase' && e.pointerId === drawId) { saveStrokes(); Store.save(); updateUndoRedo(); drawId = null; }
      if (act === 'scroll' && pointers.size === 0 && sc) fling(sc.v);
      if (pointers.size === 0) { act = null; sc = null; }
      else if (act === 'scroll') sc = { y: avgY(), t: performance.now(), v: 0 };
    }

    canvas.addEventListener('pointerup', finish);
    // pointercancel 은 손바닥 접촉 등으로 WebKit 이 포인터 흐름을 가로챌 때도 발생한다.
    // 여기서 ink.cancel() 로 통째로 버리면 지금까지 쓴 획이 사라져 다음 입력이 새 획으로
    // 시작되면서 필기가 두 조각으로 끊겨 보인다. pointerup 과 동일하게 지금까지 그린
    // 만큼은 저장해 끊김을 최소화한다.
    canvas.addEventListener('pointercancel', finish);
    canvas.addEventListener('contextmenu', e => e.preventDefault());

    scroll.addEventListener('scroll', () => {
      const hint = U.el('#scrollHint');
      if (hint && scroll.scrollTop > 40) hint.classList.add('is-off');
    }, { passive: true });
  }

  /* ---------- 초기화 ---------- */
  function mount() {
    if (mounted) return;
    mounted = true;
    scroll = U.el('#paperScroll');
    paper = U.el('#paper');
    inner = U.el('#paperInner');
    canvas = U.el('#inkCanvas');
    ink = createInk(canvas);
    eraserCursor = U.el('#eraserCursor');
    if (eraserCursor) eraserCursor.style.width = eraserCursor.style.height = ink.eraseWidth + 'px';
    canvas.addEventListener('pointermove', showEraserCursor);
    canvas.addEventListener('pointerdown', showEraserCursor);
    canvas.addEventListener('pointerleave', hideEraserCursor);
    canvas.addEventListener('pointercancel', hideEraserCursor);

    U.el('#btnPrev').addEventListener('click', () => show(S.current - 1));
    U.el('#btnNext').addEventListener('click', () => show(S.current + 1));
    U.el('#btnQuestionList').addEventListener('click', () => {
      const p = U.el('#qlist');
      p.hidden = !p.hidden;
      if (!p.hidden) paintQList();
    });
    U.el('#toolPen').addEventListener('click', () => setTool('pen'));
    U.el('#toolEraserArea').addEventListener('click', () => setTool('erase-area'));
    U.el('#toolEraser').addEventListener('click', () => setTool('eraser'));
    U.el('#toolFinger').addEventListener('click', () => setFingerDraw(!S.fingerDraw));
    U.el('#btnClearInk').addEventListener('click', async () => {
      const ok = await U.modal({
        title: '필기 지우기',
        body: '<p>현재 문항의 필기를 모두 지웁니다. 되돌릴 수 없습니다.</p>',
        buttons: [{ label: '취소', value: false }, { label: '지우기', value: true, kind: 'danger' }]
      });
      if (ok) { ink.clear(); saveStrokes(); Store.save(); updateUndoRedo(); U.toast('필기를 지웠습니다.'); }
    });
    U.el('#btnUndo').addEventListener('click', () => {
      if (reviewMode || !ink.undo()) return;
      saveStrokes(); Store.save(); updateUndoRedo();
    });
    U.el('#btnRedo').addEventListener('click', () => {
      if (reviewMode || !ink.redo()) return;
      saveStrokes(); Store.save(); updateUndoRedo();
    });

    bindPointer();

    let rt = null;
    window.addEventListener('resize', () => {
      clearTimeout(rt);
      rt = setTimeout(() => { relayout(); }, 160);
    });

    setTool('pen');
    setFingerDraw(!!S.fingerDraw);
    updateUndoRedo();
  }

  function setReview(on) {
    reviewMode = on;
    U.el('#screenExam').classList.toggle('is-review', on);
    updateUndoRedo();
    if (on) hideEraserCursor();
  }

  return {
    mount, show, relayout, paintQList, setReview, saveStrokes,
    get current() { return S.current; }
  };
})();
