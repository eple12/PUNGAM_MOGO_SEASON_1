/* =====================================================================
 * 필기 인식 테스트 랩
 *  - 프로덕션(js/exam.js + js/ink.js)의 캔버스/스크롤 구조를 그대로 복제하고,
 *    의심되는 변수들을 토글로 개별 On/Off 하여 "씹힘"을 재현·격리한다.
 *  - 렌더링은 ../js/ink.js 를 그대로 재사용한다(같은 모듈이므로 검증 결과가
 *    바로 메인 앱에 적용 가능하다).
 * ===================================================================== */

(function () {
  const stageScroll = document.getElementById('stageScroll');
  const stagePaper = document.getElementById('stagePaper');
  const canvas = document.getElementById('inkCanvas');
  const ink = createInk(canvas);

  /* ---------- 설정(토글) ---------- */
  const cfg = {
    scroll: true, touchAction: 'none', capture: true, coalesced: true,
    hoverFilter: true, tsFilter: true, palm: true, arbitration: true,
    dup: true, finger: false, recontact: true
  };

  const $ = id => document.getElementById(id);
  const box = {
    scroll: $('cfgScroll'), touchAction: $('cfgTouchAction'), capture: $('cfgCapture'),
    coalesced: $('cfgCoalesced'), hoverFilter: $('cfgHoverFilter'), tsFilter: $('cfgTsFilter'),
    palm: $('cfgPalm'), arbitration: $('cfgArbitration'), dup: $('cfgDup'), finger: $('cfgFinger'),
    recontact: $('cfgRecontact')
  };

  function applyCfg() {
    cfg.scroll = box.scroll.checked;
    cfg.touchAction = box.touchAction.value;
    cfg.capture = box.capture.checked;
    cfg.coalesced = box.coalesced.checked;
    cfg.hoverFilter = box.hoverFilter.checked;
    cfg.tsFilter = box.tsFilter.checked;
    cfg.palm = box.palm.checked;
    cfg.arbitration = box.arbitration.checked;
    cfg.dup = box.dup.checked;
    cfg.finger = box.finger.checked;
    cfg.recontact = box.recontact.checked;

    stageScroll.classList.toggle('no-scroll', !cfg.scroll);
    canvas.style.touchAction = cfg.touchAction;
    log('CFG 변경 → ' + JSON.stringify(cfg));
  }
  Object.keys(box).forEach(k => box[k].addEventListener('change', applyCfg));

  $('btnPresetProd').addEventListener('click', () => {
    box.scroll.checked = true; box.touchAction.value = 'none'; box.capture.checked = true;
    box.coalesced.checked = true; box.hoverFilter.checked = true; box.tsFilter.checked = true;
    box.palm.checked = true; box.arbitration.checked = true; box.dup.checked = true;
    box.finger.checked = false; box.recontact.checked = true;
    applyCfg();
    log('프리셋: 프로덕션과 동일 적용');
  });
  $('btnPresetMin').addEventListener('click', () => {
    box.scroll.checked = false; box.touchAction.value = 'none'; box.capture.checked = false;
    box.coalesced.checked = false; box.hoverFilter.checked = false; box.tsFilter.checked = false;
    box.palm.checked = false; box.arbitration.checked = false; box.dup.checked = false;
    box.finger.checked = false; box.recontact.checked = false;
    applyCfg();
    log('프리셋: 완전 최소(순수 이벤트, 그리기 로직 외 개입 전부 제거) 적용');
  });
  $('btnClearCanvas').addEventListener('click', () => { ink.clear(); log('캔버스 지움'); });

  /* ---------- 캔버스 크기 ---------- */
  function relayout() {
    const w = stagePaper.clientWidth, h = stagePaper.clientHeight;
    const cur = ink.size();
    if (Math.abs(cur.w - w) > 0.5 || Math.abs(cur.h - h) > 0.5) ink.resizeTo(w, h);
  }
  window.addEventListener('resize', relayout);
  requestAnimationFrame(relayout);
  setTimeout(relayout, 300); // 웹폰트/레이아웃 확정 후 재계산

  /* ---------- 로그 패널 ---------- */
  const logEl = $('log');
  let lines = [];
  const t0 = performance.now();
  function ts() { return ((performance.now() - t0) / 1000).toFixed(3); }
  function log(msg, cls) {
    const line = '[' + ts() + '] ' + msg;
    lines.push(cls ? '<span class="' + cls + '">' + esc(line) + '</span>' : esc(line));
    if (lines.length > 800) lines.splice(0, lines.length - 800);
    logEl.innerHTML = lines.join('\n');
    logEl.scrollTop = logEl.scrollHeight;
  }
  function esc(s) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  log('UA=' + navigator.userAgent);
  log('platform=' + navigator.platform + ' maxTouchPoints=' + navigator.maxTouchPoints +
      ' dpr=' + window.devicePixelRatio +
      ' standalone=' + (window.navigator.standalone || matchMedia('(display-mode: standalone)').matches));

  $('btnMark').addEventListener('click', () => log('★★★ 지금 씹힘! (사용자 표시) ★★★', 'bad'));
  $('btnClearLog').addEventListener('click', () => { lines = []; logEl.innerHTML = ''; });
  $('btnHideLog').addEventListener('click', () => {
    const w = document.querySelector('.logWrap');
    const hidden = logEl.style.display === 'none';
    logEl.style.display = hidden ? 'block' : 'none';
  });
  $('btnCopy').addEventListener('click', () => {
    const text = lines.join('\n').replace(/<[^>]+>/g, '');
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => log('로그 복사됨'));
    } else {
      const ta = document.createElement('textarea');
      ta.value = text; ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
      document.body.appendChild(ta); ta.focus(); ta.select();
      try { document.execCommand('copy'); } catch (e) { /* 무시 */ }
      document.body.removeChild(ta);
      log('로그 복사됨(폴백)');
    }
  });

  /* ---------- 통계 ---------- */
  const stat = { down: 0, up: 0, cancel: 0, batchTotal: 0, batchN: 0, dropP: 0, dropT: 0, docOnly: 0 };
  const openStrokes = new Map(); // pointerId -> { t, type, sawMove }
  function refreshStats() {
    $('stDown').textContent = stat.down;
    $('stUp').textContent = stat.up;
    $('stCancel').textContent = stat.cancel;
    $('stOrphan').textContent = openStrokes.size;
    $('stBatch').textContent = stat.batchN ? (stat.batchTotal / stat.batchN).toFixed(2) : '0';
    $('stDropP').textContent = stat.dropP;
    $('stDropT').textContent = stat.dropT;
    $('stDocOnly').textContent = stat.docOnly;
    const orphanEl = $('stOrphan');
    orphanEl.classList.toggle('warn', openStrokes.size > 0);
  }
  $('btnResetStats').addEventListener('click', () => {
    stat.down = stat.up = stat.cancel = stat.batchTotal = stat.batchN = stat.dropP = stat.dropT = stat.docOnly = 0;
    openStrokes.clear();
    refreshStats();
    log('통계 리셋');
  });
  setInterval(refreshStats, 300);

  // pointerdown 이 오래(600ms) 열려 있는데 그 사이 pointermove 가 한 번도 없으면
  // "움직임 이벤트가 통째로 안 온다"는 다른 실패 모드를 의심할 수 있다.
  setInterval(() => {
    const now = performance.now();
    openStrokes.forEach((s, id) => {
      if (!s.warned && now - s.t > 600) {
        s.warned = true;
        log('⚠ id=' + id + ' (' + s.type + ') pointerdown 후 600ms 넘게 up/cancel 없음' +
            (s.sawMove ? '' : ' — pointermove 도 전혀 없었음(움직임 자체가 안 잡힘)'), 'hl');
      }
    });
  }, 400);

  /* ---------- 문서 레벨 원시 로거(항상 켜짐) ----------
     캔버스 자체 핸들러보다 앞서(capture) 붙여, "이벤트가 아예 안 옴" vs
     "이벤트는 오는데 캔버스가 못 받음"을 구분한다. */
  const docSeen = new Set(); // 이번 tick에 canvas 핸들러가 본 pointerId(다운 시점 대조용)
  document.addEventListener('pointerdown', e => {
    const tag = e.target && (e.target.id || e.target.className || e.target.tagName);
    log('DOC-CAPTURE down type=' + e.pointerType + ' id=' + e.pointerId +
        ' target=' + tag + ' p=' + e.pressure.toFixed(2));
    if (e.target !== canvas) {
      stat.docOnly++;
      log('  ↳ target 이 canvas 가 아님! 다른 엘리먼트가 가로챔', 'bad');
    }
  }, true);
  ['blur', 'focus'].forEach(t => window.addEventListener(t, () => log('WINDOW ' + t.toUpperCase())));
  document.addEventListener('visibilitychange', () => log('VISIBILITY → ' + document.visibilityState));
  canvas.addEventListener('touchstart', e => {
    const t0_ = e.changedTouches[0];
    log('touchstart(레거시) id=' + (t0_ ? t0_.identifier : '?') + ' touches=' + e.touches.length);
  }, { passive: true });
  canvas.addEventListener('gotpointercapture', e => log('gotpointercapture id=' + e.pointerId));
  canvas.addEventListener('lostpointercapture', e => log('lostpointercapture id=' + e.pointerId, 'hl'));

  /* ---------- 좌표 ---------- */
  function pt(e) {
    const r = canvas.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  }

  /* ---------- coalesced 필터(util.js 의 U.penEvents 와 동일 로직) ---------- */
  function penEvents(e, state) {
    let src;
    if (cfg.coalesced && e.getCoalescedEvents) {
      const list = e.getCoalescedEvents();
      src = list && list.length ? list : [e];
    } else {
      src = [e];
    }
    stat.batchTotal += src.length; stat.batchN++;
    return src.filter(ev => {
      if (cfg.hoverFilter && ev.pointerType === 'pen' && ev.pressure === 0) { stat.dropP++; return false; }
      if (cfg.tsFilter && ev.timeStamp < state.lastTs) { stat.dropT++; return false; }
      state.lastTs = ev.timeStamp;
      return true;
    });
  }

  /* ---------- 포인터 상태(캔버스 핸들러) ---------- */
  const pointers = new Map();
  let act = null;            // 'draw' | 'erase' | 'scroll'
  let drawId = null;
  let sc = null;
  let flingId = 0;
  let penState = null;
  let pendingStroke = null;
  let pendingTimer = 0;
  const DUP_MS = 45, DUP_R = 10, DUP_SPAN = 20, PALM_GRACE_MS = 250;

  // 애플펜슬을 뗐다가 아주 빠르게 다시 대면, iPadOS 가 재접촉의 첫 이벤트를
  // 손바닥인지 펜인지 아직 확정 못해 pointerType 을 'touch' 로 잘못 보내는
  // 경우가 관찰된다. 직전 필기 지점과 아주 가깝고 아주 짧은 시간 안에 온
  // touch 라면 손바닥일 리가 없으므로(손바닥은 필기 지점이 아니라 손목 쪽에
  // 얹히는 게 보통) 펜 재접촉으로 간주해 구제한다.
  const RECONTACT_MS = 500, RECONTACT_R = 80;
  let lastPenPoint = null; // { x, y, t } — 현재 열려 있는 펜 스트로크의 마지막 좌표

  function looksLikeArtifact(s, x, y) {
    const p0 = s.p[0];
    if (Math.hypot(x - p0[0], y - p0[1]) >= DUP_R) return false;
    const b = s.b;
    return (b[2] - b[0]) < DUP_SPAN && (b[3] - b[1]) < DUP_SPAN;
  }
  const canDraw = e => e.pointerType === 'pen' || e.pointerType === 'mouse' || (cfg.finger && e.pointerType === 'touch');
  const avgY = () => { let s = 0; pointers.forEach(p => s += p.y); return s / pointers.size; };
  function stopFling() { cancelAnimationFrame(flingId); flingId = 0; }
  function fling(v) {
    stopFling();
    if (Math.abs(v) < 1.2) return;
    const step = () => {
      v *= 0.945;
      if (Math.abs(v) < 0.2) return;
      const before = stageScroll.scrollTop;
      stageScroll.scrollTop -= v;
      if (stageScroll.scrollTop === before) return;
      flingId = requestAnimationFrame(step);
    };
    flingId = requestAnimationFrame(step);
  }
  function beginScroll() {
    act = 'scroll';
    sc = { y: avgY(), t: performance.now(), v: 0, t0: performance.now(), startTop: stageScroll.scrollTop };
  }

  // ---- 자동 복구(watchdog) ----
  // 브라우저가 어떤 이유로든 pointerup/pointercancel 을 안 보내면(관찰상 드물지만
  // 실제로 발생함) 그 포인터 항목이 pointers Map 에 영원히 남는다. 예전 코드는
  // "pointers.size>=2 면 새 입력 무시"라는 게이트가 포인터 타입을 가리지 않았기
  // 때문에, 낡은 항목 하나가 남아있는 것만으로 그 다음 모든 정상적인 새 펜 접촉이
  // 통째로 무시됐다(= "JS가 인식 자체를 못 하는" 증상의 실제 원인 중 하나로 확인됨).
  // 여기서 그 포인터를 강제로 정리해 다음 입력이 막히지 않게 한다.
  function finalizeStale(id, reason) {
    if (!pointers.has(id) && !openStrokes.has(id)) return;
    log('  ⚠ id=' + id + ' 자동 복구(' + reason + ') — 낡은 포인터 항목 제거', 'hl');
    openStrokes.delete(id);
    pointers.delete(id);
    if (id === drawId) {
      const s = ink.end();
      if (s) log('  (강제 확정) 점 ' + s.p.length + '개');
      drawId = null;
      if (pointers.size === 0) act = null;
    }
  }
  const STALE_MS = 1200;
  setInterval(() => {
    const now = performance.now();
    openStrokes.forEach((s, id) => {
      if (!s.sawMove && now - s.t > STALE_MS) finalizeStale(id, '움직임 없이 ' + STALE_MS + 'ms 초과');
    });
  }, 300);

  canvas.addEventListener('pointerdown', e => {
    stat.down++;
    openStrokes.set(e.pointerId, { t: performance.now(), type: e.pointerType, sawMove: false });
    stopFling();

    // 펜/마우스는 실제로는 항상 접촉점이 하나뿐이다. 이전 펜 스트로크가
    // up/cancel 없이 남아있어도(위 자동복구가 아직 안 돌았어도) 새 펜 입력을
    // 절대 막지 않는다 — 낡은 스트로크는 지금 강제로 확정하고 새로 시작한다.
    let forceDraw = false;
    if (drawId !== null && e.pointerId !== drawId) {
      if (canDraw(e)) {
        finalizeStale(drawId, '새 펜 입력이 옴');
      } else if (cfg.recontact && lastPenPoint) {
        const [xr, yr] = pt(e);
        const near = (performance.now() - lastPenPoint.t) < RECONTACT_MS &&
                     Math.hypot(xr - lastPenPoint.x, yr - lastPenPoint.y) < RECONTACT_R;
        if (near) {
          log('  ⚠ id=' + e.pointerId + ' pointerType=touch 지만 직전 필기 지점 근처+' + RECONTACT_MS +
              'ms 이내 재접촉 → 애플펜슬 재접촉(오분류)으로 간주하고 구제', 'hl');
          finalizeStale(drawId, '근접 재접촉(펜으로 추정)');
          forceDraw = true;
        }
      }
    }

    if (cfg.palm && e.pointerType === 'touch' && !forceDraw && !cfg.finger &&
        (drawId !== null || act === 'draw' || act === 'erase')) {
      log('DOWN touch id=' + e.pointerId + ' → 팜리젝션으로 무시');
      openStrokes.delete(e.pointerId);
      e.preventDefault();
      return;
    }

    pointers.set(e.pointerId, { y: e.clientY, type: e.pointerType });
    const [x0, y0] = pt(e);
    log('DOWN ' + e.pointerType + ' id=' + e.pointerId + ' x=' + x0.toFixed(0) + ' y=' + y0.toFixed(0) +
        ' p=' + e.pressure.toFixed(2) + ' act=' + act + ' ptrs=' + pointers.size);

    // 스크롤↔필기 중재는 오직 'touch' 포인터 개수로만 판단한다. 애플펜슬은
    // 동시에 하나뿐이므로 남아있는 낡은 pen/mouse 항목이 이 판단을 오염시켜
    // (touch 가 실제로는 1개뿐인데도) 스크롤로 잘못 전환되거나 새 입력이
    // 막히는 일이 없게 한다.
    if (cfg.arbitration && !canDraw(e) && !forceDraw) {
      const touchIds = Array.from(pointers.entries()).filter(([, p]) => p.type === 'touch');
      if (touchIds.length >= 2) {
        const others = touchIds.filter(([id]) => id !== e.pointerId);
        const onlyStillTouch = others.length === 1;
        if (act === 'scroll' && !cfg.finger && onlyStillTouch && sc &&
            stageScroll.scrollTop === sc.startTop && performance.now() - sc.t0 < PALM_GRACE_MS) {
          pointers.delete(others[0][0]);
          act = null; sc = null;
        } else {
          beginScroll();
          e.preventDefault();
          return;
        }
      }
    }

    if (canDraw(e) || forceDraw) {
      const [x, y] = pt(e);
      if (cfg.dup && pendingStroke) {
        if (looksLikeArtifact(pendingStroke, x, y)) {
          clearTimeout(pendingTimer);
          ink.undoIfLast(pendingStroke);
          log('  이전 대기 획을 중복 아티팩트로 판정 → 취소');
        }
        pendingStroke = null;
      }
      penState = { lastTs: e.timeStamp };
      act = 'draw';
      ink.begin(x, y, e.pressure || 0.5);
      drawId = e.pointerId;
      lastPenPoint = { x, y, t: performance.now() };
      if (cfg.capture) {
        try { canvas.setPointerCapture(e.pointerId); } catch (err) { log('setPointerCapture 실패: ' + err, 'bad'); }
      }
    } else if (cfg.arbitration) {
      beginScroll();
    }
    e.preventDefault();
  }, { passive: false });

  canvas.addEventListener('pointermove', e => {
    if (openStrokes.has(e.pointerId)) openStrokes.get(e.pointerId).sawMove = true;
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { y: e.clientY, type: pointers.get(e.pointerId).type });

    if (act === 'scroll' && sc) {
      const y = avgY(), now = performance.now();
      const dy = y - sc.y;
      stageScroll.scrollTop -= dy;
      const dt = Math.max(1, now - sc.t);
      sc.v = sc.v * 0.6 + (dy / dt * 16) * 0.4;
      sc.y = y; sc.t = now;
      e.preventDefault();
      return;
    }
    if (e.pointerId !== drawId) return;

    const list = penEvents(e, penState);
    list.forEach(ev => {
      const [x, y] = pt(ev);
      ink.extend(x, y, ev.pressure || 0.5);
      lastPenPoint = { x, y, t: performance.now() };
    });
    e.preventDefault();
  }, { passive: false });

  function finish(e) {
    const wasDrawing = act === 'draw' && e.pointerId === drawId;
    openStrokes.delete(e.pointerId);
    pointers.delete(e.pointerId);
    if (e.type === 'pointercancel') stat.cancel++; else stat.up++;
    if (wasDrawing || (act === 'erase' && e.pointerId === drawId)) {
      log((e.type === 'pointercancel' ? 'CANCEL' : 'UP') + ' id=' + e.pointerId + ' act=' + act + ' ptrs남음=' + pointers.size);
    }
    if (act === 'draw' && e.pointerId === drawId) {
      const s = ink.end();
      if (s) {
        if (cfg.dup) {
          clearTimeout(pendingTimer);
          pendingStroke = s;
          pendingTimer = setTimeout(() => { pendingStroke = null; }, DUP_MS);
        }
        log('  획 확정: 점 ' + s.p.length + '개');
      } else {
        log('  ink.end() 가 null 반환(점 0개)', 'hl');
      }
      drawId = null;
    }
    if (act === 'scroll' && pointers.size === 0 && sc) fling(sc.v);
    if (pointers.size === 0) { act = null; sc = null; }
    else if (act === 'scroll') sc = { y: avgY(), t: performance.now(), v: 0 };
  }
  canvas.addEventListener('pointerup', finish);
  canvas.addEventListener('pointercancel', finish);
  canvas.addEventListener('contextmenu', e => e.preventDefault());

  applyCfg();
  log('lab.js 준비 완료');
})();
