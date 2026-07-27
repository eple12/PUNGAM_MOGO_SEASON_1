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

  /* =====================================================================
   * 임시 디버그 빌드 — 아이패드에서 필기가 자꾸 취소/분리된다는 제보를 받아
   * 원인을 눈으로 보기 위해 만든 것. F12 를 쓸 수 없는 아이패드에서도 볼 수
   * 있도록 화면 하단에 로그 패널을 직접 띄운다. 예뻐 보일 필요 없음.
   * 이 블록과 아래 dbg(...)/DEBUG 분기들은 원인이 파악되면 통째로 지운다.
   * ===================================================================== */
  const DEBUG = IS_IPADOS || /(?:^|[?&])dbg=1\b/.test(location.search);
  // 로그 맨 위에 이 값을 찍어서, 캐시된 옛날 스크립트로 테스트한 건 아닌지
  // 로그만 보고 바로 확인할 수 있게 한다. 새 진단 코드를 추가할 때마다 올린다.
  const BUILD_TAG = 'dbg-build-7(ts-relax,doc-capture,touchstart,scroll-toggle,capture-toggle)';
  let DBG_NO_CAPTURE = false;   // 진단 토글: 켜지면 setPointerCapture() 자체를 안 부른다
  let dbgLines = [];
  let dbgEl = null;
  let dbgT0 = performance.now();
  function dbg(msg) {
    if (!DEBUG) return;
    const t = ((performance.now() - dbgT0) / 1000).toFixed(3);
    dbgLines.push('[' + t + '] ' + msg);
    if (dbgLines.length > 400) dbgLines.splice(0, dbgLines.length - 400);
    if (dbgEl) {
      dbgEl.textContent = dbgLines.join('\n');
      dbgEl.scrollTop = dbgEl.scrollHeight;
    }
  }
  function mountDebugPanel() {
    if (!DEBUG || U.el('#dbgPanel')) return;
    const wrap = document.createElement('div');
    wrap.id = 'dbgWrap';
    wrap.style.cssText = 'position:fixed;left:0;right:0;bottom:0;z-index:99999;' +
      'display:flex;flex-direction:column;font-family:ui-monospace,Menlo,Consolas,monospace;';
    const panel = document.createElement('div');
    panel.id = 'dbgPanel';
    panel.style.cssText = 'max-height:38vh;overflow-y:auto;background:rgba(10,12,16,.94);' +
      'color:#8CF28C;font-size:10.5px;line-height:1.45;padding:6px 8px;' +
      'white-space:pre-wrap;word-break:break-all;';
    const bar = document.createElement('div');
    bar.style.cssText = 'display:flex;gap:1px;background:#000;';
    const btn = (label) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = label;
      b.style.cssText = 'flex:1;padding:10px 4px;font-size:12px;background:#222;color:#fff;border:0;';
      return b;
    };
    const bCopy = btn('로그 복사');
    const bClear = btn('지우기');
    const bHide = btn('숨기기/보이기');
    const bScroll = btn('①네이티브 스크롤 끔');
    const bCapture = btn('②setPointerCapture 끔');
    bar.appendChild(bCopy); bar.appendChild(bClear); bar.appendChild(bHide);
    bar.appendChild(bScroll); bar.appendChild(bCapture);
    wrap.appendChild(panel);
    wrap.appendChild(bar);
    document.body.appendChild(wrap);
    dbgEl = panel;
    dbgEl.textContent = dbgLines.join('\n');

    function fallbackCopy(text) {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;';
      document.body.appendChild(ta);
      ta.focus(); ta.select();
      try { document.execCommand('copy'); } catch (err) { /* 무시 */ }
      document.body.removeChild(ta);
    }
    bCopy.addEventListener('click', () => {
      const text = 'UA=' + navigator.userAgent + '\nIS_IPADOS=' + IS_IPADOS + '\n\n' + dbgLines.join('\n');
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(
          () => U.toast('로그를 복사했습니다. 붙여넣기 해서 보내주세요.'),
          () => { fallbackCopy(text); U.toast('로그를 복사했습니다.'); }
        );
      } else { fallbackCopy(text); U.toast('로그를 복사했습니다.'); }
    });
    bClear.addEventListener('click', () => { dbgLines = []; dbgEl.textContent = ''; });
    bHide.addEventListener('click', () => {
      panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
    });
    // 가설 검증용: 씹힘이 필기 캔버스를 담고 있는 조상(#paperScroll, overflow-y:auto)의
    // 네이티브 스크롤(iOS 에서는 내부적으로 UIScrollView + 자체 팬 제스처 인식기가 붙는다)
    // 때문인지 확인한다. 이걸 눌러 overflow:hidden 으로 바꾸면 그 조상은 더 이상 네이티브
    // 스크롤 컨테이너가 아니게 되어 그 제스처 인식기가 사라진다 — 이 상태에서 같은 빠른
    // 이중 획(x자 등)이 안 씹히면 원인이 확정된다(스크롤은 당연히 이 동안 안 먹는다,
    // 실사용 수정이 아니라 순수 진단용 버튼이다).
    bScroll.addEventListener('click', () => {
      if (!scroll) return;
      const willHide = scroll.style.overflow !== 'hidden';
      scroll.style.overflow = willHide ? 'hidden' : '';
      bScroll.style.background = willHide ? '#7a1f1f' : '#222';
      dbg('진단: #paperScroll overflow → ' + (willHide ? 'hidden (네이티브 스크롤 제거됨, 스크롤 안 됨/의도됨)' : '원래대로(auto)'));
    });
    // 가설 검증용: setPointerCapture() 호출 직후~해제 사이의 내부 상태 때문에, 그
    // 포인터가 끝나고 아주 짧은 시간 안에 새로 닿는 접촉이 씹히는 건 아닌지 확인한다.
    bCapture.addEventListener('click', () => {
      DBG_NO_CAPTURE = !DBG_NO_CAPTURE;
      bCapture.style.background = DBG_NO_CAPTURE ? '#7a1f1f' : '#222';
      dbg('진단: setPointerCapture() 호출 ' + (DBG_NO_CAPTURE ? '끔' : '다시 켬'));
    });
  }

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
    Store.save();
  }

  /* ---------- 포인터 처리 ---------- */
  function bindPointer() {
    const pointers = new Map();
    let act = null;                 // 'draw' | 'erase' | 'scroll'
    let drawId = null;
    let sc = null;                  // 스크롤 상태
    let flingId = 0;
    let penState = null;            // 현재 획의 { lastTs } — coalesced 역순 필터용
    let strokeStats = null;         // 디버그 빌드: 현재 획의 raw/반영/드롭 사유 집계

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

    canvas.addEventListener('pointerdown', e => {
      if (reviewMode && tool === 'eraser') return;

      // 애플펜슬로 필기 중 손바닥이 화면에 닿아 생기는 touch 포인터를 걸러낸다.
      // iPadOS Safari 는 안드로이드 S펜과 달리 펜 입력 중에도 손바닥 접촉을 그대로
      // touch 포인터로 올려보내는데, 이를 그냥 두면 아래 2포인터 판정에 걸려
      // 필기 중이던 획이 취소되고 스크롤로 전환돼 버린다("글씨가 드래그됨" 증상).
      if (e.pointerType === 'touch' && !S.fingerDraw && (drawId !== null || act === 'draw' || act === 'erase')) {
        dbg('DOWN touch id=' + e.pointerId + ' → 필기/지우개 중이라 걸러냄(무시)');
        e.preventDefault();
        return;
      }

      stopFling();
      pointers.set(e.pointerId, { y: e.clientY, type: e.pointerType });
      const [x0, y0] = pt(e);
      dbg('DOWN ' + e.pointerType + ' id=' + e.pointerId + ' x=' + x0.toFixed(0) + ' y=' + y0.toFixed(0) +
          ' p=' + e.pressure + ' act=' + act + ' drawId=' + drawId + ' ptrs=' + pointers.size);

      // ---- 디버그 빌드: 펜/마우스는 다른 포인터 사정과 무관하게 항상 필기를 시작/이어간다.
      // 취소(ink.cancel)·스크롤 전환·중복 획 되돌리기(undoIfLast)를 전부 끄고,
      // 원래라면 그런 처리가 됐을 상황만 로그로 남긴다.
      if (DEBUG && canDraw(e)) {
        if (reviewMode) { beginScroll(); return; }
        if (act === 'draw' && drawId !== null && drawId !== e.pointerId) {
          dbg('  ! 이전 획이 안 끝난 채(pointerId=' + drawId + ') 새 pointerId 로 DOWN — 취소 대신 이전 획을 그대로 확정');
          const prev = ink.end();
          if (prev) { saveStrokes(); Store.save(); }
        } else if (act === 'erase' && drawId !== null && drawId !== e.pointerId) {
          dbg('  ! 지우개 진행 중 다른 pointerId 로 DOWN — 무시하고 이어감');
        } else if (act === 'scroll') {
          dbg('  스크롤 상태였는데 펜이 닿음 — 취소하고 필기로 전환');
          stopFling();
        }
        if (!(act === 'erase' && drawId !== null && drawId !== e.pointerId)) {
          if (pendingStroke) {
            const wasArtifact = looksLikeArtifact(pendingStroke, x0, y0);
            dbg('  대기 중이던 직전 획 있음 — artifact판정=' + wasArtifact + ' (디버그라 실제로 지우지 않음, 그대로 유지)');
            clearTimeout(pendingTimer);
            pendingStroke = null;
          }
          penState = { lastTs: e.timeStamp };
          strokeStats = { raw: 0, reflected: 0, dropPressure: 0, dropTs: 0 };
          if (tool === 'eraser') { act = 'erase'; ink.eraseAt(x0, y0); }
          else { act = 'draw'; ink.begin(x0, y0, e.pressure || 0.5); dbg('  → begin() 호출, 새 획 시작 p=' + (e.pressure || 0.5)); }
          drawId = e.pointerId;
          if (!DBG_NO_CAPTURE) {
            try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* 캡처 실패해도 필기는 이어진다 */ }
          }
        }
        e.preventDefault();
        return;
      }

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
        penState = { lastTs: e.timeStamp };
        if (tool === 'eraser') { act = 'erase'; ink.eraseAt(x, y); }
        else { act = 'draw'; ink.begin(x, y, e.pressure || 0.5); }
        drawId = e.pointerId;
        try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* 캡처 실패해도 필기는 이어진다 */ }
      } else {
        beginScroll();
      }
      e.preventDefault();
    }, { passive: false });

    canvas.addEventListener('pointermove', e => {
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
        e.preventDefault();
        return;
      }
      if (e.pointerId !== drawId) return;

      // iOS Safari 는 getCoalescedEvents() 가 간혹 시간 역순/중복된 좌표를 섞어
      // 내려보낸다. 이를 그대로 그리면 아직 안 그려진 뒷부분으로 잠깐 직선으로
      // 튀었다가 실제 좌표들이 뒤따라와 다시 채워지면서, 빠른 획 하나가 두 갈래로
      // 갈라졌다 합쳐지는 것처럼 보인다. timeStamp 가 역행하는 좌표는 버린다.
      //
      // 애플펜슬은 화면에 닿기 전 "호버" 상태에서도 pointermove 를 보낼 수 있고
      // 이때 pressure 는 항상 정확히 0 이다. 접촉 직후 첫 pointermove 의 coalesced
      // 배치에 이 호버 시점 잔여 좌표(압력 0)가 섞여 들어오는 경우가 있는데, 이게
      // 획 시작점에서 엉뚱한 곳으로 튀는 직선 가지의 정체다. 실제로 펜이 눌린 채
      // 그리는 중에는 pressure 가 정확히 0일 수 없으므로 그런 좌표는 버린다.
      if (DEBUG) {
        const raw = e.getCoalescedEvents ? e.getCoalescedEvents() : null;
        const src = raw && raw.length ? raw : [e];
        const list0 = U.penEvents(e, penState, src);   // 이 호출이 penState.lastTs 를 갱신한다
        if (strokeStats) {
          strokeStats.raw += src.length;
          strokeStats.reflected += list0.length;
          src.forEach(ev => {
            if (list0.indexOf(ev) === -1) {
              if (ev.pointerType === 'pen' && ev.pressure === 0) strokeStats.dropPressure++;
              else strokeStats.dropTs++;
            }
          });
        }
        if (act === 'draw') {
          list0.forEach(ev => { const [x, y] = pt(ev); ink.extend(x, y, ev.pressure || 0.5); });
        } else if (act === 'erase') {
          list0.forEach(ev => { const [x, y] = pt(ev); ink.eraseAt(x, y); });
        }
        e.preventDefault();
        return;
      }

      // iOS Safari 는 getCoalescedEvents() 가 간혹 시간 역순/중복된 좌표를 섞어
      // 내려보낸다. 이를 그대로 그리면 아직 안 그려진 뒷부분으로 잠깐 직선으로
      // 튀었다가 실제 좌표들이 뒤따라와 다시 채워지면서, 빠른 획 하나가 두 갈래로
      // 갈라졌다 합쳐지는 것처럼 보인다. timeStamp 가 역행하는 좌표는 버린다.
      //
      // 애플펜슬은 화면에 닿기 전 "호버" 상태에서도 pointermove 를 보낼 수 있고
      // 이때 pressure 는 항상 정확히 0 이다. 접촉 직후 첫 pointermove 의 coalesced
      // 배치에 이 호버 시점 잔여 좌표(압력 0)가 섞여 들어오는 경우가 있는데, 이게
      // 획 시작점에서 엉뚱한 곳으로 튀는 직선 가지의 정체다. 실제로 펜이 눌린 채
      // 그리는 중에는 pressure 가 정확히 0일 수 없으므로 그런 좌표는 버린다.
      const list = U.penEvents(e, penState);
      if (act === 'draw') {
        list.forEach(ev => { const [x, y] = pt(ev); ink.extend(x, y, ev.pressure || 0.5); });
      } else if (act === 'erase') {
        list.forEach(ev => { const [x, y] = pt(ev); ink.eraseAt(x, y); });
      }
      e.preventDefault();
    }, { passive: false });

    function finish(e) {
      const wasDrawing = act === 'draw' && e.pointerId === drawId;
      const wasErasing = act === 'erase' && e.pointerId === drawId;
      pointers.delete(e.pointerId);
      if (wasDrawing || wasErasing) {
        dbg((e.type === 'pointercancel' ? 'CANCEL' : 'UP') + ' id=' + e.pointerId +
            ' act=' + act + ' ptrs남음=' + pointers.size);
      }
      if (act === 'draw' && e.pointerId === drawId) {
        const s = ink.end();
        if (DEBUG) {
          // 디버그 빌드: 중복-아티팩트 판정으로 인한 획 취소를 완전히 끈다.
          // 끝난 획은 곧바로 확정해서 저장한다.
          if (strokeStats) {
            dbg('  raw=' + strokeStats.raw + ' 반영=' + strokeStats.reflected +
                ' 드롭(압력0)=' + strokeStats.dropPressure + ' 드롭(시간역순)=' + strokeStats.dropTs);
            strokeStats = null;
          }
          if (s) { dbg('  획 확정: 점 ' + s.p.length + '개'); saveStrokes(); Store.save(); }
          else dbg('  ink.end() 가 null 반환(점 0개 획?)');
        } else if (s && IS_IPADOS) {
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
        drawId = null;
      }
      if (act === 'erase' && e.pointerId === drawId) { saveStrokes(); Store.save(); drawId = null; }
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

    if (DEBUG) {
      // 진단 전용: "씹힌 획" 구간에 로그가 아예 안 남는 문제를 추적하기 위해,
      // canvas 의 pointerdown 보다 더 이른/다른 경로에서도 뭔가 잡히는지 본다.
      //   - DOC-CAPTURE 도 안 찍힘 + TOUCHSTART 도 안 찍힘
      //     → 브라우저/OS 제스처 인식기가 DOM 에 닿기 전에 접촉을 통째로 삼킨 것
      //       (우리 코드로는 손 쓸 수 없는, 브라우저 쪽 문제일 가능성이 큼)
      //   - DOC-CAPTURE 는 찍히는데 canvas 의 DOWN 로그는 안 찍힘
      //     → 이벤트는 왔는데 다른 엘리먼트가 가로챔(우리 쪽에서 고칠 수 있는 문제)
      //   - TOUCHSTART(레거시) 는 찍히는데 pointerdown 은 안 찍힘
      //     → 이 브라우저의 Pointer Events 구현 자체가 결함이 있는 것
      document.addEventListener('pointerdown', e => {
        const tag = e.target && (e.target.id || e.target.className || e.target.tagName);
        dbg('DOC-CAPTURE pointerdown type=' + e.pointerType + ' id=' + e.pointerId + ' target=' + tag);
      }, true);
      canvas.addEventListener('touchstart', e => {
        const t = e.changedTouches[0];
        dbg('TOUCHSTART(레거시) id=' + (t ? t.identifier : '?') +
            ' x=' + (t ? t.clientX.toFixed(0) : '?') + ' y=' + (t ? t.clientY.toFixed(0) : '?') +
            ' touches=' + e.touches.length);
      }, { passive: true });
      canvas.addEventListener('touchend', e => {
        dbg('TOUCHEND(레거시) touches남음=' + e.touches.length);
      }, { passive: true });
      window.addEventListener('blur', () => dbg('WINDOW BLUR(포커스 잃음)'));
      window.addEventListener('focus', () => dbg('WINDOW FOCUS'));
      document.addEventListener('visibilitychange', () => dbg('VISIBILITY → ' + document.visibilityState));
    }
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
    mountDebugPanel();
    dbg('BUILD=' + BUILD_TAG);
    dbg('mount() UA=' + navigator.userAgent);

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
