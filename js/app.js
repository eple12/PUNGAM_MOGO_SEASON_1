/* =====================================================================
 * 화면 전환 · 진행 제어
 * ===================================================================== */

const App = (() => {

  const S = Store.s;
  let sheet = null;                 // OMR 답안지(하나만 만들어 화면 사이를 옮겨 쓴다)
  let ticker = null;

  /* ---------------- 화면 ---------------- */
  function screen(id) {
    U.els('.screen').forEach(s => s.classList.toggle('is-active', s.id === id));
    window.scrollTo(0, 0);
    Viewport.sync(id);
  }

  /* ---------------- 시작 페이지 ---------------- */
  function buildIntro() {
    const shortN = QUESTIONS.filter(q => q.type === 'short').length;
    const choiceN = QUESTIONS.length - shortN;

    document.title = CONFIG.examTitle + ' · ' + CONFIG.areaName;
    U.el('#introTitle').textContent = CONFIG.examTitle;
    U.el('#introSub').textContent = CONFIG.areaName + ' · ' + CONFIG.areaSub;
    U.el('#introMeta').innerHTML = [
      ['문항 수', QUESTIONS.length + '문항'],
      ['배점', CONFIG.totalScore + '점 만점'],
      ['시험 시간', CONFIG.durationMinutes + '분'],
      ['유형', '단답형 ' + shortN + ' · 5지선다형 ' + choiceN]
    ].map(([k, v]) => '<li><span>' + k + '</span><b>' + v + '</b></li>').join('');

    const counts = {};
    QUESTIONS.forEach(q => { (counts[q.author] = counts[q.author] || []).push(q.no); });

    U.el('#authorList').innerHTML = CONFIG.authors.map(a => {
      const list = counts[a.name] || [];
      return '<div class="author">' +
        '<img class="author__badge" src="img/team_logo.png" alt="">' +
        '<div class="author__body">' +
          '<div class="author__name">' + a.name + '</div>' +
          '<div class="author__line">' + a.line + '</div>' +
          '<div class="author__q">담당 문항 ' + list.join(', ') + '번</div>' +
        '</div>' +
      '</div>';
    }).join('');

    U.el('#introCredit').textContent =
      '기획 ' + CONFIG.credits.planning + ' · 배포 및 운영 ' + CONFIG.credits.ops;

    U.el('#ruleList').innerHTML = CONFIG.rules.map(r => '<li>' + r + '</li>').join('');
    U.el('#stepList').innerHTML = CONFIG.steps.map((s, i) =>
      '<div class="step">' +
        '<span class="step__n">' + (i + 1) + '</span>' +
        '<div><b>' + s.t + '</b><span>' + s.d + '</span></div>' +
      '</div>').join('');
  }

  /* ---------------- 전체 응시자 점수 분포(첫 페이지, 본인 확인 없이 익명 조회) ---------------- */
  async function showScoreDist() {
    const p = U.modal({
      title: '전체 응시자 점수 분포',
      body: '<div class="scorechart-host"><p class="scorechart__empty">불러오는 중…</p></div>',
      buttons: [{ label: '닫기', value: true, kind: 'primary' }]
    });
    const body = U.el('#modalBody');
    if (!Remote.enabled) {
      body.innerHTML = '<p class="scorechart__empty">순위 정보를 사용할 수 없습니다.</p>';
    } else {
      const r = await Remote.fetchScores();
      body.innerHTML = r.ok
        ? U.scoreChart(r.scores, null)
        : '<p class="scorechart__empty">정보를 불러오지 못했습니다.</p>';
    }
    await p;
  }

  /* ---------------- 답안지 ---------------- */
  function ensureSheet(mode) {
    if (!sheet) sheet = buildSheet(U.el('#identitySheetHost'), mode);
    return sheet;
  }

  function moveSheet(hostSel, mode) {
    const host = U.el(hostSel);
    if (sheet.root.parentElement !== host) { host.innerHTML = ''; host.appendChild(sheet.root); }
    sheet.setMode(mode);
    sheet.refresh();
    sheet.refit();
  }

  /* ---------------- 인적사항 ---------------- */
  function goIdentity() {
    S.phase = 'identity';
    ensureSheet('identity');
    moveSheet('#identitySheetHost', 'identity');
    screen('screenIdentity');
    Store.save(true);
  }

  /* 인적사항 작성을 마친 직후, 감독관 날인란으로 부드럽게 스크롤해
     도장이 찍히는 모습을 미리 보여 준다. 실제 도장(is-signed)은 시험이
     정말 시작된 뒤에만 찍히므로, 여기서는 별도의 is-signing 클래스로만
     같은 애니메이션을 재생한다(상태는 아무것도 바꾸지 않는다). */
  function stampPreview() {
    return new Promise(resolve => {
      const supBox = sheet && sheet.root && sheet.root.querySelector('.obox--sup');
      if (!supBox) { resolve(); return; }
      supBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setTimeout(() => {
        supBox.classList.add('is-stampfocus');
        sheet.root.classList.add('is-signing');
        setTimeout(() => {
          supBox.classList.remove('is-stampfocus');
          sheet.root.classList.remove('is-signing');
          resolve();
        }, 2500);
      }, 550);
    });
  }

  /* 튜토리얼에서 '완료 · 시험 시작'을 누른 직후, 바로 문항으로 넘기지 않고
     "시험을 시작합니다" 와 함께 5·4·3·2·1 을 1초 간격으로 보여 준 뒤 넘어간다. */
  function runCountdown() {
    return new Promise(resolve => {
      const ov = U.el('#countdownOverlay');
      const numEl = U.el('#countdownNum');
      const bump = n => {
        numEl.textContent = n;
        numEl.classList.remove('is-pop');
        void numEl.offsetWidth;              // 리플로우를 강제해 애니메이션을 다시 재생시킨다
        numEl.classList.add('is-pop');
      };
      let n = 5;
      bump(n);
      ov.classList.add('is-open');
      ov.setAttribute('aria-hidden', 'false');
      const timer = setInterval(() => {
        n--;
        if (n <= 0) {
          clearInterval(timer);
          ov.classList.remove('is-open');
          ov.setAttribute('aria-hidden', 'true');
          setTimeout(resolve, 220);
          return;
        }
        bump(n);
      }, 1000);
    });
  }

  let beginExamBusy = false;
  async function beginExam() {
    if (beginExamBusy) return;
    const name = (S.student.name || '').trim();
    const noId = !!S.student.noId;
    const id = noId ? '' : (S.idMarks.every(d => d != null) ? S.idMarks.join('') : '');
    if (name.length < 2) { U.toast('성명을 실명으로 정확히 입력하십시오.'); return; }
    if (!noId && !id) { U.toast('학번 ' + CONFIG.idDigits + '자리를 모두 표기하거나, 비재학생 버튼을 눌러 주십시오.'); return; }

    if (Remote.enabled) {
      const dup = await Remote.checkDuplicate({ id, name, noId });
      if (dup.duplicate) {
        await U.modal({
          title: '이미 응시한 기록이 있습니다',
          body: '<p><b>' + name + '</b>' + (noId ? '' : ' · 학번 <b>' + id + '</b>') +
                '(으)로 제출된 답안이 이미 있어 다시 응시할 수 없습니다.</p>' +
                '<p>본인의 기록이 아니라고 생각되면 감독관에게 문의하십시오.</p>',
          buttons: [{ label: '확인', value: true, kind: 'primary' }]
        });
        return;
      }
    }

    const ok = await U.modal({
      title: '인적사항 작성을 마칩니다',
      body: '<p class="mline"><b>' + name + '</b> · 학번 <b>' + (noId ? '해당 없음(비재학생)' : id) + '</b></p>' +
            '<p>확인을 누르면 감독관 날인과 답안지 이용 안내(체험)를 거쳐 <b>' + CONFIG.durationMinutes + '분</b>의 시험이 시작됩니다. ' +
            '이후에는 인적사항을 수정할 수 없습니다.</p>',
      buttons: [{ label: '취소', value: false }, { label: '확인', value: true, kind: 'primary' }]
    });
    if (!ok) return;

    beginExamBusy = true;
    S.student.name = name;
    S.student.id = id;
    Store.save(true);

    await stampPreview();
    await Tutorial.run();
    await runCountdown();

    S.startedAt = Date.now();
    S.endAt = S.startedAt + CONFIG.durationMinutes * 60000;
    S.phase = 'exam';
    S.warned = [];
    Store.save(true);
    beginExamBusy = false;
    enterExam();
  }

  /* ---------------- 시험 ---------------- */
  function enterExam() {
    Exam.mount();
    Exam.setReview(false);
    ensureSheet('exam');
    moveSheet('#examSheetHost', 'exam');
    U.el('#omrWho').textContent = S.student.name + ' · ' + (S.student.noId ? '학번 없음' : S.student.id);
    U.el('#btnSubmit').textContent = '답안 제출';
    U.el('#btnSubmit').classList.remove('btn--primary');
    U.el('#btnSubmit').classList.add('btn--outline');
    screen('screenExam');
    Exam.show(S.current || 1);
    startTicker();
  }

  function openOmr(open) {
    const ov = U.el('#omrOverlay');
    ov.classList.toggle('is-open', open);
    ov.setAttribute('aria-hidden', open ? 'false' : 'true');
    if (open) { sheet.refresh(); sheet.refit(); }
  }

  /* ---------------- 타이머 ---------------- */
  function startTicker() {
    stopTicker();
    tick();
    ticker = setInterval(tick, 250);
  }
  function stopTicker() { if (ticker) clearInterval(ticker); ticker = null; }

  function tick() {
    if (S.phase !== 'exam') return;
    const left = S.endAt - Date.now();
    const txt = U.clock(left);
    U.el('#clockTime').textContent = txt;
    U.el('#omrClock').textContent = txt;
    U.el('#clock').classList.toggle('is-warn', left <= 5 * 60000);

    CONFIG.warnAt.forEach(m => {
      if (left <= m * 60000 && left > 0 && S.warned.indexOf(m) < 0) {
        S.warned.push(m);
        U.toast('시험 종료 ' + m + '분 전입니다.', 3000);
        Store.save();
      }
    });

    if (left <= 0) finish('time');
  }

  /* ---------------- 종료 ---------------- */
  async function askSubmit() {
    if (S.phase === 'done') { showResult(); return; }
    const un = QUESTIONS.length - Store.markedCount();
    const ok = await U.modal({
      title: '답안을 제출하시겠습니까?',
      body: '<p>제출한 뒤에는 답안지를 수정할 수 없으며 곧바로 채점됩니다.</p>' +
            (un ? '<p class="mwarn">아직 표기하지 않은 문항이 <b>' + un + '문항</b> 있습니다.</p>'
                : '<p class="mok">30문항 모두 표기하였습니다.</p>'),
      buttons: [{ label: '더 풀기', value: false }, { label: '제출하고 채점', value: true, kind: 'primary' }]
    });
    if (ok) finish('submit');
  }

  async function finish(reason) {
    if (S.phase === 'done') return;
    stopTicker();
    Exam.saveStrokes();
    S.phase = 'done';
    if (reason === 'time') S.endAt = Math.min(S.endAt, Date.now());
    else S.endAt = Date.now();
    if (sheet) sheet.setMode('locked');
    openOmr(false);
    S.result = Result.grade();
    Store.save(true);

    if (Remote.enabled) {
      Remote.saveResult({
        id: S.student.id, name: S.student.name, noId: S.student.noId,
        reason, result: S.result
      }).then(r => { if (!r.saved) U.toast('결과를 서버에 저장하지 못했습니다. 화면을 캡쳐해 두십시오.', 4000); });
    }

    if (reason === 'time') {
      await U.modal({
        title: '시험이 종료되었습니다',
        body: '<p>시험 시간이 모두 지나 답안지가 마감되었습니다. 채점 결과를 확인하십시오.</p>',
        buttons: [{ label: '결과 보기', value: true, kind: 'primary' }]
      });
    }
    showResult();
  }

  function showResult() {
    Result.render(S.result || Result.grade());
    screen('screenResult');
  }

  /* ---------------- 결과에서 되돌아보기 ---------------- */
  function reviewPaper() {
    Exam.mount();
    Exam.setReview(true);
    ensureSheet('locked');                        // 결과 화면으로 바로 부팅한 경우 답안지가 아직 없다
    moveSheet('#examSheetHost', 'locked');
    U.el('#clockTime').textContent = '종료';
    U.el('#clock').classList.remove('is-warn');
    U.el('#btnSubmit').textContent = '결과로 돌아가기';
    U.el('#btnSubmit').classList.remove('btn--outline');
    U.el('#btnSubmit').classList.add('btn--primary');
    screen('screenExam');
    Exam.show(1);
  }

  function reviewSheet() {
    reviewPaper();
    openOmr(true);
  }

  /* ---------------- 전체화면 ---------------- */
  function bindFullscreen() {
    const btn = U.el('#btnFullscreen');
    if (!btn) return;
    // iOS Safari 등 일부 브라우저는 임의 엘리먼트의 전체화면 API를 지원하지 않는다
    if (!document.documentElement.requestFullscreen) return;
    btn.hidden = false;
    const sync = () => {
      btn.classList.toggle('is-full', !!document.fullscreenElement);
      /* 일부 모바일 브라우저는 전체화면 진입/해제 시 강제 데스크톱 뷰포트
         (width=1080 고정) 를 무시하고 자체적으로 뷰포트를 다시 계산해,
         모처럼 데스크톱 레이아웃으로 맞춰 둔 화면이 좁은 화면으로 되돌아가
         버리는 경우가 있다. 확실한 해결책은 아니지만, 상태가 바뀔 때마다
         지금 보이는 화면 기준으로 뷰포트를 다시 강제해 본다. */
      const active = document.querySelector('.screen.is-active');
      if (active) Viewport.sync(active.id);
    };
    btn.addEventListener('click', () => {
      if (document.fullscreenElement) document.exitFullscreen();
      else document.documentElement.requestFullscreen().catch(() => {});
    });
    document.addEventListener('fullscreenchange', sync);
    sync();
  }

  /* 응시 시작 시점에 자동으로 전체화면 진입을 시도한다.
     브라우저 정책상 사용자 클릭 이벤트 처리 중(비동기 대기 없이)에만 허용되므로
     반드시 클릭 핸들러 맨 앞에서 동기적으로 호출해야 한다. 실패해도(권한 거부 등)
     응시 자체는 그대로 진행한다.
     휴대폰에서는 전체화면 진입 시 강제해 둔 데스크톱 뷰포트가 다시 좁은
     화면으로 풀려 버리는 기기가 있어(위 sync() 참고), 아예 자동 진입을
     걸지 않는다 — 수동 전체화면 버튼은 그대로 남아 있으니 필요하면 직접
     누를 수 있다. */
  function enterFullscreen() {
    if (Viewport.isPhone) return;
    if (document.fullscreenElement) return;
    if (!document.documentElement.requestFullscreen) return;
    document.documentElement.requestFullscreen().catch(() => {});
  }

  /* ---------------- 캡쳐 방지(어디까지나 억제책) ----------------
     웹 페이지는 OS 스크린샷·다른 카메라로 찍는 것 자체를 막을 방법이 없다.
     여기서는 시험 화면에서 우클릭 저장/복사, 개발자 도구·인쇄로 손쉽게
     빼가는 것만 막는다. */
  function bindCaptureGuards() {
    document.addEventListener('contextmenu', e => {
      if (U.el('#screenExam').classList.contains('is-active')) e.preventDefault();
    });
    document.addEventListener('keydown', e => {
      if (!U.el('#screenExam').classList.contains('is-active')) return;
      const k = e.key;
      const blockCombo =
        (e.ctrlKey || e.metaKey) && ['p', 'P', 's', 'S', 'u', 'U'].includes(k) ||
        (e.ctrlKey || e.metaKey) && e.shiftKey && ['i', 'I', 'j', 'J', 'c', 'C'].includes(k) ||
        k === 'F12' || k === 'PrintScreen';
      if (blockCombo) e.preventDefault();
    });
  }

  /* ---------------- 부팅 ---------------- */
  function boot() {
    buildIntro();
    bindFullscreen();

    const had = Store.load();

    U.el('#btnStart').addEventListener('click', () => { enterFullscreen(); goIdentity(); });
    U.el('#btnScoreDist').addEventListener('click', showScoreDist);
    U.el('#btnBackIntro').addEventListener('click', () => { S.phase = 'intro'; Store.save(true); screen('screenIntro'); });
    U.el('#btnBeginExam').addEventListener('click', beginExam);
    U.el('#omrTab').addEventListener('click', () => openOmr(true));
    U.el('#btnCloseOmr').addEventListener('click', () => openOmr(false));
    U.el('#omrToolPen').addEventListener('click', () => {
      sheet.setTool('pen');
      U.el('#omrToolPen').classList.add('is-on'); U.el('#omrToolWhite').classList.remove('is-on');
    });
    U.el('#omrToolWhite').addEventListener('click', () => {
      sheet.setTool('white');
      U.el('#omrToolWhite').classList.add('is-on'); U.el('#omrToolPen').classList.remove('is-on');
    });
    U.el('#btnSubmit').addEventListener('click', askSubmit);

    bindCaptureGuards();

    // 시험 도중 창을 닫거나 새로 고치면 경고
    window.addEventListener('beforeunload', e => {
      if (S.phase !== 'exam') return;
      Exam.saveStrokes(); Store.save(true);
      e.preventDefault();
      e.returnValue = '';
    });

    window.onOmrChange = () => {
      Exam.paintQList();
      const n = U.el('#qpickNo');
      if (n) n.classList.toggle('is-marked', Store.isMarked(S.current));
    };

    /* 창을 닫거나 새로고침한 뒤 다시 들어오는 경우 — 별도 확인 없이 곧바로
       이어서 보여 준다. 시간은 endAt(실제 시각) 기준이라 이탈해 있던
       동안에도 그대로 흘렀으므로, 다시 들어온 시점 기준 남은 시간만
       반영된다. 이미 시간이 다 지났으면 시간 초과로 자동 채점한다. */
    if (had && S.phase === 'done' && S.result) { showResult(); return; }
    if (had && S.phase === 'exam') {
      if (Date.now() >= S.endAt) { finish('time'); return; }
      ensureSheet('exam');
      enterExam();
      return;
    }
    if (had && S.phase === 'identity') { goIdentity(); return; }
    screen('screenIntro');
  }

  /* 접속 잠금(js/gate.js)이 비밀번호 확인 후 문항 데이터를 복호화하고 나서
     이 boot() 을 직접 호출한다 — DOMContentLoaded 에서 곧바로 시작하지 않는다. */
  return { boot, reviewPaper, reviewSheet, finish, openOmr };
})();
