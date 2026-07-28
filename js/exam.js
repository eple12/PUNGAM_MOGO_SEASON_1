/* =====================================================================
 * 시험 화면 — 문제 표시 · 필기 · 스크롤 · 문항 이동
 * ===================================================================== */

const Exam = (() => {

  const S = Store.s;

  let scroll, paper, inner, canvas, ink;
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
    requestAnimationFrame(() => {                 // 웹폰트가 늦게 붙는 경우를 대비한 재계산
      const before = paper.style.height;
      relayout();
      if (paper.style.height !== before) ink.load(S.strokes[no] || []);
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

  /* ---------- 도구 ---------- */
  function setTool(t) {
    tool = t;
    U.el('#toolPen').classList.toggle('is-on', t === 'pen');
    U.el('#toolEraser').classList.toggle('is-on', t === 'eraser');
    paper.classList.toggle('is-erasing', t === 'eraser');
  }

  function setFingerDraw(on) {
    S.fingerDraw = on;
    // 글자를 바꾸면(예: "손가락 필기 켬") 버튼 폭이 달라져 옆 버튼들이 밀리므로
    // 라벨은 그대로 두고 켜짐 여부는 채움(is-on) 색으로만 표시한다.
    U.el('#toolFinger').classList.toggle('is-on', on);
    // 손가락 필기가 켜지면 손가락도 필기용이 되므로, 캔버스의 네이티브 스크롤을
    // 막아야 한다(꺼져 있을 때는 손가락 터치가 그대로 페이지를 스크롤한다).
    canvas.classList.toggle('is-fingerdraw', on);
    Store.save();
  }

  /* ---------- 포인터 처리 ----------
     스크롤은 브라우저 기본 동작(#paperScroll 의 overflow-y:auto + 캔버스
     touch-action:pan-y, css/exam.css 참고)에 그대로 맡긴다. 손가락 필기가
     꺼져 있으면 이 캔버스는 touch 포인터를 아예 붙잡지 않으므로(canDraw()
     가 false 를 돌려주는 즉시 return), 터치는 필기 로직을 거치지 않고
     자연스럽게 페이지를 스크롤한다. */
  function bindPointer() {
    let drawId = null;

    // 방금 끝난 획을 바로 확정하지 않고 아주 짧게 들고 있다가, 그 사이 새 펜 입력이
    // 들어오면 방금 끝난 획은 중복 아티팩트로 보고 버린다(IS_IPADOS 에서만 동작).
    // 사람이 의도적으로 다시 찍는 필기(점 찍기 등)는 이 시간보다 훨씬 느리므로,
    // 추가로 "짧고 곧은 잔가지" 모양(점 2개 이하 또는 아주 작은 범위)일 때만 의심한다.
    let pendingStroke = null;
    let pendingTimer = 0;
    const DUP_MS = 45;
    const DUP_R = 10;                // 이 거리보다 가까울 때만 "같은 접촉점" 중복으로 본다
    const DUP_SPAN = 20;             // 이 범위보다 넓게 그려진 획은 진짜 필기로 본다

    function looksLikeArtifact(s, x, y) {
      const p0 = s.p[0];
      if (Math.hypot(x - p0[0], y - p0[1]) >= DUP_R) return false;
      const b = s.b;
      return (b[2] - b[0]) < DUP_SPAN && (b[3] - b[1]) < DUP_SPAN;
    }

    const canDraw = e => e.pointerType === 'pen' || e.pointerType === 'mouse' || (S.fingerDraw && e.pointerType === 'touch');

    // Excalidraw 의 실제 수정을 그대로 옮긴 것(PR #4705, onTapStart, 커밋 7049e2a).
    // 그 소스를 직접 확인해 보면 그리기 로직이 있는 pointerdown 이 아니라, 완전히
    // 별도로 캔버스에 붙인 이 touchstart 리스너 맨 첫 줄에서만 preventDefault() 를
    // 부른다 — iOS 의 Scribble(필기 인식) 제스처가 손을 대는 건 pointerdown 시점이
    // 아니라 이 touchstart 시점이라, 여기서 막아야 실제로 이긴다. 애플펜슬(스타일러스)
    // 접촉만 막고, 손가락 터치는 그대로 둬서 네이티브 스크롤이 시작되게 한다
    // (손가락 필기가 켜져 있을 때는 손가락도 필기용이므로 스크롤을 막는다).
    canvas.addEventListener('touchstart', e => {
      const t = e.touches && e.touches[0];
      if ((t && t.touchType === 'stylus') || S.fingerDraw) e.preventDefault();
    }, { passive: false });

    canvas.addEventListener('pointerdown', e => {
      if (!canDraw(e)) return;   // 손가락 필기가 꺼져 있으면 터치는 스크롤에 맡긴다
      e.preventDefault();
      if (reviewMode) return;    // 복습 모드에서는 그리지 않는다(스크롤만 가능)

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
      if (tool === 'eraser') ink.eraseAt(x, y);
      else ink.begin(x, y, e.pressure || 0.5);
      drawId = e.pointerId;
      try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* 캡처 실패해도 필기는 이어진다 */ }
    }, { passive: false });

    canvas.addEventListener('pointermove', e => {
      if (e.pointerId !== drawId) return;
      e.preventDefault();

      // 애플펜슬은 화면에 닿기 전 "호버" 상태에서도 pointermove 를 보낼 수 있고
      // 이때 pressure 는 항상 정확히 0 이다 — 실제로 펜이 눌린 채 그리는 중에는
      // 그럴 수 없으므로 그런 좌표만 걸러낸다(U.penEvents, js/util.js 참고).
      const list = U.penEvents(e);
      if (tool === 'eraser') {
        list.forEach(ev => { const [x, y] = pt(ev); ink.eraseAt(x, y); });
      } else {
        list.forEach(ev => { const [x, y] = pt(ev); ink.extend(x, y, ev.pressure || 0.5); });
      }
    }, { passive: false });

    function finish(e) {
      if (e.pointerId !== drawId) return;
      drawId = null;
      if (tool === 'eraser') { saveStrokes(); Store.save(); return; }
      const s = ink.end();
      if (s && IS_IPADOS) {
        // 바로 확정하지 않고 DUP_MS 만큼 들고 있는다. 그 사이 새 펜 입력이
        // 오면(pointerdown 핸들러) 이 획은 중복 아티팩트로 보고 버려진다.
        clearTimeout(pendingTimer);
        pendingStroke = s;
        pendingTimer = setTimeout(() => {
          pendingStroke = null;
          saveStrokes(); Store.save();
        }, DUP_MS);
      } else if (s) {
        saveStrokes(); Store.save();
      }
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

    U.el('#btnPrev').addEventListener('click', () => show(S.current - 1));
    U.el('#btnNext').addEventListener('click', () => show(S.current + 1));
    U.el('#btnQuestionList').addEventListener('click', () => {
      const p = U.el('#qlist');
      p.hidden = !p.hidden;
      if (!p.hidden) paintQList();
    });
    U.el('#toolPen').addEventListener('click', () => setTool('pen'));
    U.el('#toolEraser').addEventListener('click', () => setTool('eraser'));
    U.el('#toolFinger').addEventListener('click', () => setFingerDraw(!S.fingerDraw));
    U.el('#btnClearInk').addEventListener('click', async () => {
      const ok = await U.modal({
        title: '필기 지우기',
        body: '<p>현재 문항의 필기를 모두 지웁니다. 되돌릴 수 없습니다.</p>',
        buttons: [{ label: '취소', value: false }, { label: '지우기', value: true, kind: 'danger' }]
      });
      if (ok) { ink.clear(); saveStrokes(); Store.save(); U.toast('필기를 지웠습니다.'); }
    });

    bindPointer();

    let rt = null;
    window.addEventListener('resize', () => {
      clearTimeout(rt);
      rt = setTimeout(() => { relayout(); }, 160);
    });

    setTool('pen');
    setFingerDraw(!!S.fingerDraw);
  }

  function setReview(on) {
    reviewMode = on;
    U.el('#screenExam').classList.toggle('is-review', on);
  }

  return {
    mount, show, relayout, paintQList, setReview, saveStrokes,
    get current() { return S.current; }
  };
})();
