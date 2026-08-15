/* =====================================================================
 * 출제자별 회차(Day 01~06) 분할 배포 — 프로토타입
 *
 * 기존 200분 단일 시험 흐름(App/Exam/js/omr.js 의 큰 답안지)은 그대로 두고,
 * 대신 이 파일이 새로운 진입 흐름을 구성한다: 랜딩 → 회차 선택(카드 6개)
 * → (최초 1회) 인적사항 → (최초 1회) 튜토리얼 → 회차별 5문항(30분 타이머,
 * 한 번에 한 문항씩 · 필기 가능 · OMR은 본시험처럼 탭으로 열고 닫는 오버레이).
 *
 * js/gate.js 는 이 배포에서 App.boot() 대신 RoundApp.boot() 을 부른다.
 * ===================================================================== */

const ROUND_DEFS = [
  { key: 'r1', day: 'Day 01', author: '황지우', color: '--round-1' },
  { key: 'r2', day: 'Day 02', author: '김정헌', color: '--round-2' },
  { key: 'r3', day: 'Day 03', author: '이현우', color: '--round-3' },
  { key: 'r4', day: 'Day 04', author: '김민수', color: '--round-4' },
  { key: 'r5', day: 'Day 05', author: '전규영', color: '--round-5' },
  { key: 'r6', day: 'Day 06', author: '이시훈', color: '--round-6' }
];

const ROUND_MINUTES = 30;
const ROUND_INK_EXTRA = 900;   // 필기 여유 공간(px)

/* 응시 유의사항(랜딩 화면, 스크롤 하단) — js/app.js(예전 200분·30문항 단일
   시험 페이지)가 쓰던 CONFIG.rules 와 같은 자리의 내용이지만, 그 문구는
   "시험 시간 200분", "전 30문항" 처럼 지금의 회차(30분·5문항)당 형식과
   맞지 않는 옛 숫자를 담고 있어 그대로 재사용하지 않는다. 항목의 취지는
   최대한 살리되 실제 회차 동작(js/rounds.js)에 맞춰 다시 썼다. */
const RL_RULES = [
  '각 회차는 30분이며, 남은 시간은 화면 위쪽에 표시됩니다. 화면을 나가거나 새로고침해도 시간은 계속 흐르니 유의하십시오.',
  '한 회차는 5문항이며, 문항은 순서와 관계없이 자유롭게 이동해 풀 수 있습니다. Day 01~06 중 원하는 순서로 골라 응시하면 됩니다.',
  '답안은 화면 귀퉁이의 OMR 탭을 눌러 언제든지 마킹할 수 있습니다. 단답형의 답은 자리에 맞추어 마킹하십시오.<br>예를 들어 정답이 5이면 일의 자리만, 또는 십의 자리 0과 일의 자리 5를 함께 마킹합니다.',
  '화면 어디에나 펜으로 필기할 수 있으며, 필기 공간이 부족하면 화면을 아래로 넘겨 이어서 사용하십시오.<br><b>문제풀이 과정이 필기로 남아 있어야 정상 응시 기록으로 인정됩니다.</b>',
  '답안을 제출하거나 회차 시간이 종료되면 그 회차의 답안은 더 이상 수정할 수 없고, 곧바로 채점 결과가 표시됩니다.',
  '인적사항(성명·학번)은 최초 1회만 작성합니다. 성명은 반드시 실명으로 작성하십시오 — 확인되지 않으면 채점되지 않습니다.'
];

const RoundApp = (() => {

  const S = Store.s;
  let sheet = null;      // 인적사항용 답안지(js/omr.js 의 큰 답안지, 최초 1회만 사용)

  /* ---------------- 화면 ---------------- */
  function screen(id) {
    U.els('.screen').forEach(s => s.classList.toggle('is-active', s.id === id));
    window.scrollTo(0, 0);
  }

  function roundQuestions(def) {
    return QUESTIONS.filter(q => q.author === def.author);
  }

  function roundDone(def) {
    const qs = roundQuestions(def);
    return qs.length > 0 && qs.every(q => Store.isMarked(q.no));
  }

  function roundMarkedCount(def) {
    return roundQuestions(def).filter(q => Store.isMarked(q.no)).length;
  }

  function identityDone() {
    if (!S.student.name || S.student.name.trim().length < 2) return false;
    return S.student.noId || !!S.student.id;
  }

  /* ---------------- 랜딩 ---------------- */
  const RL_CHECK_SVG = '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
    '<path d="M5 13l4 4L19 7" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  function buildLanding() {
    document.title = CONFIG.examTitle + ' · ' + CONFIG.areaName;
    U.el('#rlTitle').textContent = CONFIG.examTitle;
    U.el('#rlSub').textContent = CONFIG.areaName + ' · ' + CONFIG.areaSub;
  }

  /* 스크롤 하단부 정적 섹션(이벤트 안내·출제진 소개·응시 유의사항) — 모두
     정적 데이터라 한 번만 그리면 된다. */
  function buildStaticSections() {
    const ev = CONFIG.event;
    if (ev && ev.enabled) {
      U.el('#rlEvent').hidden = false;
      U.el('#rlEventPeriod').textContent = ev.period;
      U.el('#rlEventList').innerHTML = (ev.items || []).map(i => '<li>' + i + '</li>').join('');
      U.el('#rlEventExtra').innerHTML = ev.extra || '';
    }

    /* CONFIG.authors 는 (연차·기획 등) 다른 기준으로 정리된 배열이라 Day
       순서와 다르다 — ROUND_DEFS(Day 01~06 순서) 를 기준으로 순회하면서
       이름으로 CONFIG.authors 에서 소개 문구를 찾아온다. */
    U.el('#rlAuthors').innerHTML = ROUND_DEFS.map(def => {
      const a = CONFIG.authors.find(x => x.name === def.author);
      return '' +
        '<div class="rlauthor" style="--c:var(' + def.color + ')">' +
          '<span class="rlauthor__badge">' + def.author.charAt(0) + '</span>' +
          '<span class="rlauthor__name">' + def.author + '</span>' +
          '<span class="rlauthor__day">' + def.day + ' 출제</span>' +
          '<span class="rlauthor__line">' + (a ? a.line : '') + '</span>' +
        '</div>';
    }).join('');

    U.el('#rlRules').innerHTML = RL_RULES.map(r => '<li>' + r + '</li>').join('');
  }

  /* 회차 컬렉션 배지 — 실제 진행 상태(제출완료·진행중·미시작)를 반영한다.
     buildLanding() 은 QUESTIONS/Store 가 준비되기 전(부팅 초반)에도 안전하게
     부를 수 있어야 해서 정적 텍스트만 맡고, 이 함수는 boot() 에서 Store.load()
     이후, 그리고 회차 화면에서 랜딩으로 돌아올 때마다 다시 불러 최신 상태를
     반영한다. */
  function landingRoundState(def) {
    if (S.roundSubmitted && S.roundSubmitted[def.key]) return 'done';
    if (S.roundTimers && S.roundTimers[def.key]) return 'doing';
    return 'todo';
  }

  function renderLandingBadges() {
    const doneCount = ROUND_DEFS.filter(d => landingRoundState(d) === 'done').length;
    U.el('#rlProgress').textContent = doneCount + ' / ' + ROUND_DEFS.length + ' 완료';
    U.el('#rlChips').innerHTML = ROUND_DEFS.map(def => {
      const state = landingRoundState(def);
      const dayNo = def.day.split(' ')[1];
      const ring = state === 'done' ? RL_CHECK_SVG : dayNo;
      const label = state === 'done' ? '완료' : (state === 'doing' ? '진행 중' : '');
      const cls = 'rlbadge' + (state === 'done' ? ' is-done' : '') + (state === 'doing' ? ' is-doing' : '');
      return '' +
        '<div class="' + cls + '" style="--c:var(' + def.color + ')">' +
          '<span class="rlbadge__ring">' + ring + '</span>' +
          '<span class="rlbadge__day">' + def.day + '</span>' +
          '<span class="rlbadge__state">' + label + '</span>' +
        '</div>';
    }).join('');
  }

  const rlReduceMotion = () =>
    !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  /* 히어로 등장 애니메이션(anime.js) — 새로고침 직후 한 번만 재생한다. 메달이
     3D 로 뒤집히며 자리 잡고(임팩트), 충격파 링이 한 번 퍼진 뒤, 에잌브로우·
     타이틀·스크롤 유도 버튼이 순서대로 나타난다. 회차 화면에서 "← 랜딩으로"
     되돌아올 때는 다시 재생하지 않는다(renderLandingBadges() 로 상태만
     갱신). anime.js 가 없거나(오프라인 등) prefers-reduced-motion 이면 그냥
     건너뛰고, 그 경우 콘텐츠는 (JS 가 .rl-anim 을 붙이지 않으므로)
     css/rounds.css 기본값대로 처음부터 보이는 상태로 남는다. */
  let heroIntroPlayed = false;
  function playHeroIntro() {
    if (heroIntroPlayed) return;
    heroIntroPlayed = true;
    if (typeof anime === 'undefined' || rlReduceMotion()) return;
    const hero = U.el('.rlhero');
    if (!hero) return;

    const medal = U.el('#rlMedal');
    const pulse = U.el('#rlMedalPulse');
    const lead = hero.querySelectorAll('[data-rl-in]');
    const cue = U.el('#rlScrollCue');
    hero.classList.add('rl-anim');

    anime.timeline({
      easing: 'cubicBezier(.22,.8,.32,1)',
      complete: () => hero.classList.remove('rl-anim')
    })
      .add({ targets: medal, opacity: [0, 1], rotateY: [200, 0], rotateX: [-18, 0], scale: [.5, 1], duration: 820, easing: 'easeOutElastic(1, .7)' })
      .add({ targets: pulse, opacity: [.65, 0], scale: [1, 2.2], duration: 640, easing: 'easeOutQuad' }, '-=560')
      .add({ targets: lead, opacity: [0, 1], translateY: [16, 0], delay: anime.stagger(80), duration: 480 }, '-=420')
      .add({ targets: cue, opacity: [0, 1], duration: 380 }, '-=120');
  }

  /* 본문(.rlbody) 스크롤 리빌 — [data-scroll-in] 요소가 뷰포트에 처음
     들어오는 순간 한 번만 떠오르듯 나타난다. IntersectionObserver/anime.js
     가 없거나 prefers-reduced-motion 이면 .rl-pending 클래스 자체를 붙이지
     않고 그대로 반환해, 콘텐츠는 항상 기본값(보임)으로 남는다. */
  function initScrollReveal() {
    if (typeof anime === 'undefined' || typeof IntersectionObserver === 'undefined' || rlReduceMotion()) return;
    const items = U.els('[data-scroll-in]');
    if (!items.length) return;
    items.forEach(el => el.classList.add('rl-pending'));
    const io = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        const el = entry.target;
        io.unobserve(el);
        anime({
          targets: el,
          opacity: [0, 1],
          translateY: [24, 0],
          duration: 620,
          easing: 'easeOutCubic',
          complete: () => el.classList.remove('rl-pending')
        });
      });
    }, { threshold: .22 });
    items.forEach(el => io.observe(el));
  }

  /* 만년필 오브젝트가 스크롤을 따라 곡선을 그려 나가는 배경 장식.
     .rlbody 폭·높이에 맞춘 완만한 S자 곡선을 만들고, 스크롤이 진행된
     비율만큼만 획을 보이게 한 뒤(stroke-dasharray/dashoffset), 그 끝점에
     펜촉을 정확히 얹어 둔다 — "펜촉에서 선이 이어지는" 느낌. 스크롤에 직접
     연동되는 효과라 prefers-reduced-motion 이면 아예 만들지 않는다(그 경우
     svg 는 빈 채로 남고, 배경엔 아무것도 안 그려질 뿐 레이아웃엔 영향 없음). */
  // index.html 의 만년필 svg 박스 안에서 닙 끝(로컬 좌표 0,0)이 위치하는
  // 고정 px 좌표 — css/rounds.css 의 .rlink__pen transform-origin 과 반드시
  // 같은 값을 써야 한다(펜 svg 를 바꾸면 이 두 곳도 같이 맞춰야 한다).
  const PEN_TIP_X = 64, PEN_TIP_Y = 9;

  function buildInkPath(w, h) {
    const cx = w * .5, left = w * .28, right = w * .72;
    const waves = Math.max(2, Math.round(h / 420));
    const seg = h / waves;
    let d = 'M ' + cx + ' 0';
    for (let i = 0; i < waves; i++) {
      const y0 = i * seg, y1 = y0 + seg / 2, y2 = y0 + seg;
      const side = i % 2 === 0 ? right : left;
      d += ' C ' + side + ' ' + (y0 + seg * .18) + ', ' + side + ' ' + (y1 - seg * .18) + ', ' + cx + ' ' + y1;
      d += ' C ' + side + ' ' + (y1 + seg * .18) + ', ' + side + ' ' + (y2 - seg * .18) + ', ' + cx + ' ' + y2;
    }
    return d;
  }

  function setupInkTrail() {
    if (typeof anime === 'undefined' || rlReduceMotion()) return;
    const wrap = U.el('#rlInk'), svg = U.el('#rlInkSvg'), pen = U.el('#rlInkPen'), body = U.el('.rlbody');
    if (!wrap || !svg || !pen || !body) return;

    let inkPath = null, rafPending = false;

    function rebuild() {
      const w = body.clientWidth, h = body.scrollHeight;
      if (!w || !h) return;
      svg.setAttribute('viewBox', '0 0 ' + w + ' ' + h);
      svg.setAttribute('width', w);
      svg.setAttribute('height', h);
      svg.innerHTML = '<path class="rlink__path" d="' + buildInkPath(w, h) + '"></path>';
      inkPath = svg.querySelector('.rlink__path');
      const len = inkPath.getTotalLength();
      inkPath.style.strokeDasharray = String(len);
      inkPath.style.strokeDashoffset = String(len);
      update();
    }

    /* 진행률(0~1) — "요소가 뷰포트를 통째로 지나갈 때까지"를 기준으로 삼는
       흔한 공식은, .rlbody 처럼 페이지의 맨 끝 콘텐츠일 때 그 요소 아래로
       더 스크롤할 여백 자체가 없어 실제로는 1에 절대 도달하지 못하고 중간에
       멈춰 버린다(문서 최대 스크롤 위치가 그 지점을 넘지 못하므로). 대신
       "지금 스크롤 위치가 문서에서 실제로 도달 가능한 최대 스크롤 위치
       대비 얼마나 왔는가"로 계산해, 페이지를 끝까지 내리면 정확히 1이
       되도록 한다. */
    function update() {
      if (!inkPath) return;
      const len = inkPath.getTotalLength();
      const rect = body.getBoundingClientRect();
      const bodyTopAbs = window.scrollY + rect.top;
      const maxScroll = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
      const start = Math.max(0, bodyTopAbs - window.innerHeight * 0.5);
      const progress = Math.min(1, Math.max(0, (window.scrollY - start) / Math.max(1, maxScroll - start)));
      const at = len * progress;
      inkPath.style.strokeDashoffset = String(len - at);
      const p1 = inkPath.getPointAtLength(at);
      const p2 = inkPath.getPointAtLength(Math.max(0, at - 1));
      const angle = Math.atan2(p1.y - p2.y, p1.x - p2.x) * 180 / Math.PI;
      /* transform-origin(css/rounds.css)이 펜 박스 안에서 닙 끝의 고정
         px 좌표(64,9)에 있으므로, translate 는 그만큼 빼서 보정해야
         회전축이 아니라 "닙 끝 자체"가 정확히 p1 에 놓인다. */
      pen.style.transform = 'translate(' + (p1.x - PEN_TIP_X) + 'px,' + (p1.y - PEN_TIP_Y) + 'px) rotate(' + angle + 'deg)';
    }

    function onScroll() {
      if (rafPending) return;
      rafPending = true;
      requestAnimationFrame(() => { rafPending = false; update(); });
    }

    rebuild();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', () => rebuild());
  }

  /* ---------------- 회차 선택(카드) ---------------- */
  function roundTimerLeft(key) {
    const t = S.roundTimers && S.roundTimers[key];
    if (!t) return null;
    return t.endAt - Date.now();
  }

  function buildRoundGrid() {
    U.el('#roundGrid').innerHTML = ROUND_DEFS.map(def => {
      const qs = roundQuestions(def);
      const done = roundDone(def);
      const marked = roundMarkedCount(def);
      const submitted = !!(S.roundSubmitted && S.roundSubmitted[def.key]);
      const started = !!(S.roundTimers && S.roundTimers[def.key]);
      const state = submitted ? '제출완료' : (done ? '완료(제출전)' : (started ? '이어하기' : '입장'));
      const dayNo = def.day.split(' ')[1];
      return '' +
      '<button type="button" class="rselcard' + (submitted ? ' is-done' : '') + '" data-round="' + def.key + '" style="--c:var(' + def.color + ');--c-soft:var(' + def.color + '-soft)">' +
        '<span class="rselcard__face">' +
          '<span class="rselcard__watermark">' +
            '<span class="rselcard__watermark__l1">DAY</span>' +
            '<span class="rselcard__watermark__l2">' + dayNo + '</span>' +
          '</span>' +
          '<span class="rselcard__top">' +
            '<span class="rselcard__day">' + def.day + '</span>' +
            '<span class="rselcard__timer" data-round="' + def.key + '"></span>' +
          '</span>' +
          '<span class="rselcard__bottom">' +
            '<span class="rselcard__author">' + def.author + '</span>' +
            '<span class="rselcard__meta">' + qs.length + '문항 · ' + marked + '/' + qs.length + ' 마킹</span>' +
            '<span class="rselcard__state">' + state + '</span>' +
          '</span>' +
        '</span>' +
      '</button>';
    }).join('');
  }

  /* 포인터 3D 틸트 — 마우스가 카드 위에서 움직이는 위치에 따라 카드 면이
     기울어진다(anime.set 로 매 프레임 즉시 반영). 포인터가 빠지면 anime.js
     가 스프링처럼 되튕기며 원래 자세로 돌아간다. buildRoundGrid() 가 매번
     DOM 을 통째로 새로 그리므로(innerHTML), 리스너도 그때마다 새 카드에
     다시 붙인다 — 예전 카드·리스너는 그대로 버려져 가비지 컬렉션된다.
     마우스 hover 가 없는 기기(터치/펜 전용)에서는 아예 붙이지 않고,
     css/rounds.css 의 기존 hover/focus/active 폴백을 그대로 쓴다. */
  /* 카드가 부채꼴로 겹쳐 있어(margin-left:-8vw), 카드마다 따로
     pointerenter/leave 를 붙이면 겹친 영역에서 브라우저의 기본 히트테스트가
     항상 "DOM 순서상 나중(오른쪽) 카드"만 골라 버린다 — 뒤 카드에 가려진
     앞 카드의 오른쪽 가장자리는 그 자체로 아예 hover 를 받을 수 없다.
     그래서 개별 카드가 아니라 #roundGrid 하나에만 pointermove 를 걸고,
     그 순간 포인터가 실제로 안에 들어와 있는 카드들 중 "중심이 포인터에
     가장 가까운" 카드를 직접 계산해 그 카드만 기울이고 앞으로 올린다 —
     어떤 카드가 겹쳐서 가려져 있어도 항상 의도한 카드가 반응한다. */
  function attachCardTilt() {
    if (typeof anime === 'undefined') return;
    if (!(window.matchMedia && window.matchMedia('(hover: hover) and (pointer: fine)').matches)) return;
    const grid = U.el('#roundGrid');
    const cards = U.els('.rselcard', grid);
    if (!grid || !cards.length) return;
    const MAX_DEG = 12;
    let activeCard = null;

    /* is-active(맨 앞으로) 는 여기서 즉시 떼고, is-tilting(transform 을
       anime 가 소유)만 애니메이션이 끝날 때까지 남겨 둔다 — z-index 가
       스프링백 애니메이션 시간(520ms)만큼 묶여 있지 않도록. */
    function settle(card) {
      card.classList.remove('is-active');
      const face = card.querySelector('.rselcard__face');
      anime({
        targets: face,
        rotateX: 0, rotateY: 0, translateY: 0, scale: 1,
        duration: 520,
        easing: 'easeOutElastic(1, .6)',
        complete: () => card.classList.remove('is-tilting')
      });
    }

    function activate(card, e) {
      if (activeCard && activeCard !== card) settle(activeCard);
      activeCard = card;
      card.classList.add('is-tilting', 'is-active');
      const face = card.querySelector('.rselcard__face');
      const r = card.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width - .5;
      const py = (e.clientY - r.top) / r.height - .5;
      anime.set(face, {
        rotateY: px * MAX_DEG * 2,
        rotateX: py * -MAX_DEG * 2,
        translateY: -24,
        scale: 1.045
      });
    }

    grid.addEventListener('pointermove', e => {
      if (e.pointerType !== 'mouse') return;
      let best = null, bestDist = Infinity;
      cards.forEach(card => {
        const r = card.getBoundingClientRect();
        if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) return;
        const dist = Math.abs(e.clientX - (r.left + r.width / 2));
        if (dist < bestDist) { bestDist = dist; best = card; }
      });
      if (!best) {
        if (activeCard) { settle(activeCard); activeCard = null; }
        return;
      }
      activate(best, e);
    });

    grid.addEventListener('pointerleave', e => {
      if (e.pointerType !== 'mouse' || !activeCard) return;
      settle(activeCard);
      activeCard = null;
    });
  }

  /* 회차 카드 등장 애니메이션 — 회차 선택 화면에 들어올 때마다(랜딩에서 처음
     들어올 때, "← 회차 목록"으로 돌아올 때 모두) 카드가 아래에서 살짝 튀어
     오르듯 나타난다. 끝나면 반드시 inline transform 을 지워야 한다 — 안
     지우면 그 값(고정된 translateY(0) scale(1))이 css/rounds.css 의
     hover/focus/active 트랜지션 규칙보다 우선해 버려(인라인 스타일이 항상
     이김) 애니메이션이 끝난 뒤로는 카드가 아예 반응하지 않게 된다. */
  function playRoundsIntro() {
    if (typeof anime === 'undefined' || rlReduceMotion()) return;
    const grid = U.el('#roundGrid');
    const faces = U.els('.rselcard__face', grid);
    if (!faces.length) return;
    grid.classList.add('rc-anim');
    anime({
      targets: faces,
      opacity: [0, 1],
      translateY: [46, 0],
      scale: [.88, 1],
      delay: anime.stagger(70),
      duration: 560,
      easing: 'easeOutBack',
      complete: () => {
        grid.classList.remove('rc-anim');
        faces.forEach(f => { f.style.transform = ''; f.style.opacity = ''; });
      }
    });
  }

  let roundsTicker = null;
  function stopRoundsTicker() { if (roundsTicker) { clearInterval(roundsTicker); roundsTicker = null; } }

  function tickRoundsList() {
    ROUND_DEFS.forEach(def => {
      const el = document.querySelector('.rselcard__timer[data-round="' + def.key + '"]');
      if (!el) return;
      if (S.roundSubmitted && S.roundSubmitted[def.key]) { el.textContent = ''; el.classList.remove('is-over'); return; }
      const left = roundTimerLeft(def.key);
      if (left == null) { el.textContent = ''; el.classList.remove('is-over'); return; }
      if (left <= 0) { el.textContent = '시간 종료'; el.classList.add('is-over'); return; }
      el.classList.remove('is-over');
      el.textContent = U.clock(left) + ' 남음';
    });
  }

  function showRoundsScreen() {
    stopRoundTicker();
    buildRoundGrid();
    attachCardTilt();
    screen('screenRounds');
    playRoundsIntro();
    tickRoundsList();
    stopRoundsTicker();
    roundsTicker = setInterval(tickRoundsList, 1000);
  }

  /* ---------------- 인적사항(최초 1회) ---------------- */
  function ensureSheet() {
    if (!sheet) sheet = buildSheet(U.el('#identitySheetHost'), 'identity');
    return sheet;
  }

  function goIdentity(pendingRound) {
    stopRoundsTicker();
    S.pendingRound = pendingRound || null;
    S.phase = 'identity';
    Store.save(true);
    ensureSheet();
    sheet.setMode('identity');
    sheet.refresh();
    sheet.refit();
    screen('screenIdentity');
  }

  async function completeIdentity() {
    const name = (S.student.name || '').trim();
    const noId = !!S.student.noId;
    const id = noId ? '' : (S.idMarks.every(d => d != null) ? S.idMarks.join('') : '');
    if (name.length < 2) { U.toast('성명을 실명으로 정확히 입력하십시오.'); return; }
    if (!noId && !id) { U.toast('학번 ' + CONFIG.idDigits + '자리를 모두 표기하거나, 비재학생 버튼을 눌러 주십시오.'); return; }
    S.student.name = name;
    S.student.id = id;
    const next = S.pendingRound;
    S.pendingRound = null;
    Store.save(true);

    if (!S.tutorialDone) {
      await Tutorial.run();
      S.tutorialDone = true;
      Store.save(true);
    }

    if (next) enterRound(next); else showRoundsScreen();
  }

  /* ---------------- 답란(작은 OMR, 오버레이 안) ---------------- */
  function bubble(q, slot, v, label) {
    return '<button type="button" class="bub" data-q="' + q.no + '" data-slot="' + slot + '" data-v="' + v + '"><span>' + label + '</span></button>';
  }

  function ansColumnMini(q, no) {
    const head = '<div class="qcol__hd">#' + String(no).padStart(2, '0') + '</div>';
    if (q.type === 'choice') {
      let rows = '';
      for (let v = 1; v <= 5; v++) rows += '<div class="crow">' + bubble(q, 'c', v, v) + '</div>';
      return '<div class="qcol qcol--choice" data-qcol="' + q.no + '">' + head +
        '<div class="qcol__sub"><span class="s1">답</span></div>' +
        '<div class="qcol__body qcol__body--choice">' + rows + '</div></div>';
    }
    let rows = '';
    for (let d = 0; d <= 9; d++) {
      const hun = d === 0 ? '<span class="dcell dcell--blank"></span>' : '<span class="dcell">' + bubble(q, 0, d, d) + '</span>';
      const ten = '<span class="dcell">' + bubble(q, 1, d, d) + '</span>';
      const one = '<span class="dcell">' + bubble(q, 2, d, d) + '</span>';
      rows += '<div class="drow">' + hun + ten + one + '</div>';
    }
    return '<div class="qcol" data-qcol="' + q.no + '">' + head +
      '<div class="qcol__sub"><span>백</span><span>십</span><span>일</span></div>' +
      '<div class="qcol__body">' + rows + '</div></div>';
  }

  function paintMiniOmr() {
    const host = U.el('#roundOmr');
    if (!host) return;
    host.querySelectorAll('[data-qcol]').forEach(col => {
      const no = +col.dataset.qcol;
      const a = S.answers[no];
      col.querySelectorAll('.bub').forEach(b => {
        const slot = b.dataset.slot, v = +b.dataset.v;
        const on = slot === 'c' ? a.choice === v : a.digits[+slot] === v;
        b.classList.toggle('is-on', on);
      });
      col.classList.toggle('is-filled', Store.isMarked(no));
    });
  }

  function openReOmr(open) {
    const ov = U.el('#reOmrOverlay');
    ov.classList.toggle('is-open', open);
    ov.setAttribute('aria-hidden', open ? 'false' : 'true');
  }

  /* ---------------- 필기(펜) ----------------
     본시험과 같이 문항 하나당 캔버스 한 장을 쓴다. 필기는 문항 전역번호(q.no)
     로 저장한다(S.roundStrokes) — 회차가 달라도 문항번호는 겹치지 않는다. */
  let reScroll, rePaper, reInner, reCanvas, reInk;
  let reInkMounted = false, reInkLoadedFor = null;
  let inkTool = 'pen';        // pen | eraser
  let resizeT = null;

  function ensureInk() {
    if (reInkMounted) return;
    reInkMounted = true;
    reScroll = U.el('#reScroll');
    rePaper = U.el('#rePaper');
    reInner = U.el('#reQuestions');
    reCanvas = U.el('#reInkCanvas');
    reInk = createInk(reCanvas);
    bindInkPointer();
    window.addEventListener('resize', () => { clearTimeout(resizeT); resizeT = setTimeout(relayoutInk, 160); });
  }

  function relayoutInk() {
    if (!reInkMounted) return;
    const minH = reScroll.clientHeight - 2;
    const need = reInner.offsetHeight + ROUND_INK_EXTRA;
    rePaper.style.height = Math.max(minH, need) + 'px';
    const w = rePaper.clientWidth, h = rePaper.clientHeight;
    const size = reInk.size();
    if (Math.abs(size.w - w) > 0.5 || Math.abs(size.h - h) > 0.5) reInk.resizeTo(w, h);
  }

  function saveRoundStrokes() {
    if (!reInk || reInkLoadedFor == null) return;
    S.roundStrokes = S.roundStrokes || {};
    S.roundStrokeSize = S.roundStrokeSize || {};
    const list = reInk.dump();
    if (list.length) { S.roundStrokes[reInkLoadedFor] = list; S.roundStrokeSize[reInkLoadedFor] = reInk.size(); }
    else { delete S.roundStrokes[reInkLoadedFor]; delete S.roundStrokeSize[reInkLoadedFor]; }
    Store.save();
  }

  function updateInkUndoRedo() {
    if (!reInk) return;
    U.el('#reUndo').disabled = !reInk.canUndo();
    U.el('#reRedo').disabled = !reInk.canRedo();
  }

  function setInkTool(t) {
    inkTool = t;
    U.el('#reToolPen').classList.toggle('is-on', t === 'pen');
    U.el('#reToolEraser').classList.toggle('is-on', t === 'eraser');
  }

  function bindInkPointer() {
    const pt = e => {
      const r = reCanvas.getBoundingClientRect();
      return [e.clientX - r.left, e.clientY - r.top];
    };
    const canDraw = e => e.pointerType === 'pen' || e.pointerType === 'mouse' || (S.fingerDraw && e.pointerType === 'touch');
    let drawing = false, mode = null;

    reCanvas.addEventListener('pointerdown', e => {
      if (!canDraw(e) || roundLocked()) return;
      e.preventDefault();
      drawing = true;
      const [x, y] = pt(e);
      if (inkTool === 'eraser') { mode = 'erase'; reInk.eraseAt(x, y); }
      else { mode = 'draw'; reInk.begin(x, y, e.pressure || 0.5); }
      try { reCanvas.setPointerCapture(e.pointerId); } catch (err) { /* 캡처 실패해도 필기는 이어진다 */ }
    }, { passive: false });

    reCanvas.addEventListener('pointermove', e => {
      if (!drawing) return;
      e.preventDefault();
      if (mode === 'erase') { const [x, y] = pt(e); reInk.eraseAt(x, y); }
      else U.penEvents(e).forEach(ev => { const [x, y] = pt(ev); reInk.extend(x, y, ev.pressure || 0.5); });
    }, { passive: false });

    const stop = () => {
      if (!drawing) return;
      drawing = false;
      if (mode === 'draw') reInk.end();
      mode = null;
      saveRoundStrokes();
      updateInkUndoRedo();
    };
    reCanvas.addEventListener('pointerup', stop);
    reCanvas.addEventListener('pointercancel', stop);
    reCanvas.addEventListener('pointerleave', stop);
    reCanvas.addEventListener('contextmenu', e => e.preventDefault());
  }

  /* ---------------- 회당 30분 타이머 ---------------- */
  let roundTicker = null;

  function roundTimerState(key) {
    S.roundTimers = S.roundTimers || {};
    if (!S.roundTimers[key]) S.roundTimers[key] = { startedAt: Date.now(), endAt: Date.now() + ROUND_MINUTES * 60000 };
    return S.roundTimers[key];
  }

  function roundLocked() {
    if (S.roundSubmitted && S.roundSubmitted[S.roundKey]) return true;
    const t = S.roundTimers && S.roundTimers[S.roundKey];
    return !!t && Date.now() >= t.endAt;
  }

  function stopRoundTicker() { if (roundTicker) { clearInterval(roundTicker); roundTicker = null; } }

  function applyLockUI() {
    const omrHost = U.el('#roundOmr');
    if (omrHost) omrHost.classList.toggle('is-locked', roundLocked());
  }

  function tickRound(key) {
    const t = S.roundTimers[key];
    if (!t) return;
    const left = t.endAt - Date.now();
    const clockEl = U.el('#reClock');
    if (clockEl) clockEl.textContent = U.clock(left);
    const wrap = U.el('#reClockWrap');
    if (wrap) wrap.classList.toggle('is-warn', left <= 5 * 60000);
    if (left <= 0) {
      stopRoundTicker();
      applyLockUI();
      if (reCurrentDef && reCurrentDef.key === key && !(S.roundSubmitted && S.roundSubmitted[key])) {
        finishRound('time');
      }
    }
  }

  /* ---------------- 문항 목록(가운데 번호 버튼) ---------------- */
  let reQlistBound = false;
  function paintReQlist() {
    const grid = U.el('#reQlistGrid');
    if (!grid) return;
    grid.innerHTML = reCurrentQs.map((q, i) =>
      '<button type="button" class="qchip" data-idx="' + i + '">' +
        '<span class="qchip__no">#' + String(i + 1).padStart(2, '0') + '</span>' +
        '<span class="qchip__pt">' + q.points + '</span>' +
      '</button>').join('');
  }
  function updateReQlistState() {
    U.els('.qchip', U.el('#reQlistGrid')).forEach(b => {
      const i = +b.dataset.idx;
      const q = reCurrentQs[i];
      b.classList.toggle('is-done', Store.isMarked(q.no));
      b.classList.toggle('is-cur', i === reLocalIdx);
    });
  }
  function bindReQlistOnce() {
    if (reQlistBound) return;
    reQlistBound = true;
    U.el('#reQlistGrid').addEventListener('click', e => {
      const b = e.target.closest('.qchip');
      if (!b) return;
      showReQuestion(+b.dataset.idx);
      U.el('#reQlist').hidden = true;
    });
    U.el('#reQpickBtn').addEventListener('click', () => {
      const p = U.el('#reQlist');
      p.hidden = !p.hidden;
      if (!p.hidden) updateReQlistState();
    });
  }

  /* ---------------- 회차 문제(한 번에 한 문항) ---------------- */
  let reCurrentDef = null, reCurrentQs = [], reLocalIdx = 0;

  function showReQuestion(idx) {
    if (idx < 0) idx = 0;
    if (idx > reCurrentQs.length - 1) idx = reCurrentQs.length - 1;
    saveRoundStrokes();
    reLocalIdx = idx;
    const q = reCurrentQs[idx];
    const no = idx + 1;

    U.el('#reQuestions').innerHTML =
      '<article class="rq">' +
        '<div class="rq__line"></div>' +
        '<div class="rq__body qtext">' + U.questionHtml(q, '#' + String(no).padStart(2, '0')) + '</div>' +
      '</article>';
    U.typeset(U.el('#reQuestions'));
    // 문항 번호(.qnum)를 담은 문단에 직접 클래스를 달아 둔다 — CSS :has() 는
    // 비교적 최근에 추가된 선택자라 구형 브라우저(태블릿 웹뷰 등)에서
    // 지원하지 않으면 행잉 인덴트가 통째로 적용되지 않아(번호 뒤 줄바꿈된
    // 줄이 왼쪽 끝(0)으로 돌아가 버려) 정렬이 깨진다. JS로 직접 표시해
    // 브라우저 지원 여부와 무관하게 항상 동작하게 한다.
    const qnumEl = U.el('#reQuestions .qnum');
    if (qnumEl && qnumEl.parentElement) qnumEl.parentElement.classList.add('has-qnum');

    reScroll.scrollTop = 0;
    relayoutInk();
    reInk.load((S.roundStrokes && S.roundStrokes[q.no]) || []);
    reInkLoadedFor = q.no;
    updateInkUndoRedo();
    requestAnimationFrame(() => {
      const before = rePaper.style.height;
      relayoutInk();
      if (rePaper.style.height !== before) {
        reInk.load((S.roundStrokes && S.roundStrokes[q.no]) || []);
        updateInkUndoRedo();
      }
    });

    U.el('#reQpickNo').textContent = no;
    U.el('#reQpickNo').classList.toggle('is-marked', Store.isMarked(q.no));
    U.el('#rePrev').disabled = (idx === 0);
    U.el('#reNext').disabled = (idx === reCurrentQs.length - 1);
    updateReQlistState();

    S.roundCurrentIdx = S.roundCurrentIdx || {};
    S.roundCurrentIdx[reCurrentDef.key] = idx;
    Store.save();
  }

  function buildRoundExam(def) {
    saveRoundStrokes();   // 직전에 보고 있던 문항의 필기를 먼저 저장해 둔다

    const root = U.el('#screenRoundExam');
    root.style.setProperty('--round-color', 'var(' + def.color + ')');
    root.style.setProperty('--round-color-soft', 'var(' + def.color + '-soft)');
    // OMR 탭 · 오버레이 · 답란까지 전부 이 회차 테마색을 메인색으로 쓴다
    // (omr.css 의 모든 색이 --omr-ink/--omr-ink-2/--omr-mark/--omr-soft 를
    // 참조하므로, 여기서 덮어쓰면 자식 전체에 자동으로 반영된다).
    root.style.setProperty('--omr-ink', 'var(' + def.color + ')');
    root.style.setProperty('--omr-ink-2', 'color-mix(in srgb, var(' + def.color + ') 45%, #fff)');
    root.style.setProperty('--omr-mark', 'var(' + def.color + ')');
    root.style.setProperty('--omr-soft', 'var(' + def.color + '-soft)');

    U.el('#reDay').textContent = def.day;
    U.el('#reAuthor').textContent = def.author + ' 출제';
    U.el('#reQpickBtn .qpick__of').textContent = '/ ' + roundQuestions(def).length;

    reCurrentDef = def;
    reCurrentQs = roundQuestions(def);

    U.el('#roundOmr').innerHTML = reCurrentQs.map((q, i) => ansColumnMini(q, i + 1)).join('');
    paintMiniOmr();
    openReOmr(false);

    paintReQlist();
    bindReQlistOnce();
    U.el('#reQlist').hidden = true;

    ensureInk();
    const startIdx = (S.roundCurrentIdx && S.roundCurrentIdx[def.key]) || 0;
    showReQuestion(startIdx);

    stopRoundTicker();
    roundTimerState(def.key);
    tickRound(def.key);
    applyLockUI();
    roundTicker = setInterval(() => tickRound(def.key), 250);
  }

  /* ---------------- 채점 · 제출 ---------------- */
  function gradeRound(def) {
    const qs = roundQuestions(def);
    const rows = qs.map(q => {
      const mine = Store.readAnswer(q.no);
      const ok = mine !== null && mine === q.answer;
      return { no: q.no, points: q.points, author: q.author, type: q.type, answer: q.answer, mine, ok };
    });
    const score = rows.reduce((s, r) => s + (r.ok ? r.points : 0), 0);
    const right = rows.filter(r => r.ok).length;
    const blank = rows.filter(r => r.mine === null).length;
    const wrong = rows.length - right - blank;
    const totalPoints = qs.reduce((s, q) => s + q.points, 0);
    const t = S.roundTimers && S.roundTimers[def.key];
    const used = t ? Math.max(0, Math.min(Date.now(), t.endAt) - t.startedAt) : 0;
    return { rows, score, right, wrong, blank, totalPoints, used, at: Date.now() };
  }

  /* 이미 서버에 제출된 기록이 있으면(다른 기기·새로고침 등으로 로컬 상태가
     날아간 경우) 그 문서에서 결과를 다시 만들어 로컬에도 채점 결과가 있는
     것처럼 복원한다 — 문항 배점 등은 로컬 QUESTIONS 에서 그대로 가져온다. */
  function rebuildResultFromRemote(def, data) {
    const qs = roundQuestions(def);
    const byNo = {};
    (data.answers || []).forEach(a => { byNo[a.no] = a; });
    const rows = qs.map(q => {
      const a = byNo[q.no] || { mine: null, ok: false };
      return { no: q.no, points: q.points, author: q.author, type: q.type, answer: q.answer, mine: a.mine, ok: !!a.ok };
    });
    const totalPoints = qs.reduce((s, q) => s + q.points, 0);
    return {
      rows,
      score: data.score != null ? data.score : rows.reduce((s, r) => s + (r.ok ? r.points : 0), 0),
      right: data.right != null ? data.right : rows.filter(r => r.ok).length,
      wrong: data.wrong != null ? data.wrong : 0,
      blank: data.blank != null ? data.blank : rows.filter(r => r.mine === null).length,
      totalPoints: data.totalPoints != null ? data.totalPoints : totalPoints,
      used: data.usedMs || 0,
      at: Date.now()
    };
  }

  async function askRoundSubmit() {
    const def = reCurrentDef;
    if (!def) return;
    if (S.roundSubmitted && S.roundSubmitted[def.key]) { showRoundResult(def, S.roundResults[def.key]); return; }
    const un = reCurrentQs.filter(q => !Store.isMarked(q.no)).length;
    const ok = await U.modal({
      title: '이 회차 답안을 제출하시겠습니까?',
      body: '<p>제출한 뒤에는 이 회차의 답안을 다시 수정할 수 없으며 곧바로 채점됩니다.</p>' +
        (un ? '<p class="mwarn">아직 표기하지 않은 문항이 <b>' + un + '문항</b> 있습니다.</p>'
            : '<p class="mok">' + reCurrentQs.length + '문항 모두 표기하였습니다.</p>'),
      buttons: [{ label: '더 풀기', value: false }, { label: '제출하고 채점', value: true, kind: 'primary' }]
    });
    if (ok) finishRound('submit');
  }

  async function finishRound(reason) {
    const def = reCurrentDef;
    if (!def) return;
    if (S.roundSubmitted && S.roundSubmitted[def.key]) { showRoundResult(def, S.roundResults[def.key]); return; }

    stopRoundTicker();
    saveRoundStrokes();
    const result = gradeRound(def);
    S.roundSubmitted = S.roundSubmitted || {};
    S.roundSubmitted[def.key] = true;
    S.roundResults = S.roundResults || {};
    S.roundResults[def.key] = result;
    Store.save(true);
    applyLockUI();

    if (Remote.enabled) {
      const strokesForRound = {}, strokeSizeForRound = {};
      reCurrentQs.forEach(q => {
        if (S.roundStrokes && S.roundStrokes[q.no]) strokesForRound[q.no] = S.roundStrokes[q.no];
        if (S.roundStrokeSize && S.roundStrokeSize[q.no]) strokeSizeForRound[q.no] = S.roundStrokeSize[q.no];
      });
      Remote.clearRoundInProgress({ id: S.student.id, name: S.student.name, noId: S.student.noId, round: def.key });
      Remote.saveRoundResult({
        id: S.student.id, name: S.student.name, noId: S.student.noId,
        round: def.key, day: def.day, author: def.author,
        reason, result, strokes: strokesForRound, strokeSize: strokeSizeForRound
      }).then(r => {
        if (!r.saved && r.code === 'permission-denied') {
          U.toast('이미 같은 이름/학번으로 제출된 회차입니다.', 4000);
        } else if (!r.saved) {
          U.toast('결과를 서버에 저장하지 못했습니다. 화면을 캡쳐해 두십시오.', 4000);
        } else if (r.strokesDropped) {
          U.toast('필기를 서버에 저장하지 못했습니다.', 4000);
        } else if (r.strokesPartial) {
          U.toast('필기 일부가 서버에 저장되지 못했습니다.', 4000);
        }
      });
    }

    if (reason === 'time') {
      await U.modal({
        title: '회차 시간이 종료되었습니다',
        body: '<p>이 회차의 답안지가 마감되어 채점 결과를 확인합니다.</p>',
        buttons: [{ label: '결과 보기', value: true, kind: 'primary' }]
      });
    }
    showRoundResult(def, result);
  }

  function showRoundResult(def, result) {
    stopRoundTicker();
    stopRoundsTicker();
    S.phase = 'roundResult';
    Store.save(true);

    const root = U.el('#screenRoundResult');
    root.style.setProperty('--round-color', 'var(' + def.color + ')');

    const pct = result.totalPoints ? Math.round(result.score / result.totalPoints * 100) : 0;
    const table = result.rows.map((r, i) =>
      '<tr class="' + (r.ok ? 'ok' : (r.mine === null ? 'na' : 'no')) + '">' +
        '<td class="c">#' + String(i + 1).padStart(2, '0') + '</td>' +
        '<td class="c">' + r.points + '</td>' +
        '<td class="c">' + (r.mine == null ? '<span class="blank">무응답</span>' : (r.type === 'choice' ? U.CIRCLED[r.mine] : String(r.mine))) + '</td>' +
        '<td class="c mark">' + (r.ok ? 'O' : (r.mine === null ? '/' : 'X')) + '</td>' +
      '</tr>').join('');

    U.el('#roundResultRoot').innerHTML =
      '<div class="rwrap">' +
        '<header class="rhead">' +
          '<p class="rhead__eyebrow" style="color:var(--round-color)">' + def.day + ' · ' + def.author + ' 출제</p>' +
          '<h1 class="rhead__title">회차 채점 결과</h1>' +
          '<p class="rhead__who">' + (S.student.name || '이름 미기재') + ' · 학번 ' +
            (S.student.noId ? '해당 없음(비재학생)' : (S.student.id || Store.studentIdText())) + '</p>' +
        '</header>' +
        '<section class="rscore">' +
          '<div class="rscore__main">' +
            '<span class="rscore__num" style="color:var(--round-color)">' + result.score + '</span>' +
            '<span class="rscore__den">/ ' + result.totalPoints + '</span>' +
          '</div>' +
          '<div class="rscore__bar"><i style="width:' + pct + '%;background:var(--round-color)"></i></div>' +
          '<div class="rscore__meta">' +
            '<span><b>' + result.right + '</b>문항 정답</span>' +
            '<span><b>' + result.wrong + '</b>문항 오답</span>' +
            '<span><b>' + result.blank + '</b>문항 무응답</span>' +
            '<span>소요 시간 <b>' + U.durationText(result.used) + '</b></span>' +
          '</div>' +
        '</section>' +
        '<section class="rcard rcard--wide">' +
          '<h2 class="rcard__title">' + def.day + ' 응시자 점수 분포</h2>' +
          '<div class="scorechart-host" id="roundScoreChartHost"><p class="scorechart__empty">불러오는 중…</p></div>' +
        '</section>' +
        '<section class="rcard rcard--table">' +
          '<h2 class="rcard__title">문항별 채점표</h2>' +
          '<div class="rtable-wrap">' +
            '<table class="rtable">' +
              '<thead><tr><th class="c">번호</th><th class="c">배점</th><th class="c">내 답</th><th class="c">채점</th></tr></thead>' +
              '<tbody>' + table + '</tbody>' +
            '</table>' +
          '</div>' +
        '</section>' +
        '<footer class="rfoot">' +
          '<button class="btn btn--outline" id="btnRoundResultBack" type="button">회차 목록으로</button>' +
        '</footer>' +
      '</div>';

    U.el('#btnRoundResultBack').addEventListener('click', () => {
      S.roundKey = null;
      S.phase = 'rounds';
      Store.save(true);
      showRoundsScreen();
    });

    screen('screenRoundResult');

    const chartHost = U.el('#roundScoreChartHost');
    if (!Remote.enabled) {
      chartHost.innerHTML = '<p class="scorechart__empty">순위 정보를 사용할 수 없습니다.</p>';
    } else {
      Remote.fetchRoundScores(def.key).then(r => {
        chartHost.innerHTML = r.ok
          ? U.scoreChart(r.scores, result.score, result.totalPoints)
          : '<p class="scorechart__empty">순위 정보를 불러오지 못했습니다.</p>';
      });
    }
  }

  function enterRound(key) {
    stopRoundsTicker();
    const def = ROUND_DEFS.find(d => d.key === key);
    if (!def) { showRoundsScreen(); return; }
    S.roundKey = key;
    Store.save(true);

    if (S.roundSubmitted && S.roundSubmitted[key] && S.roundResults && S.roundResults[key]) {
      showRoundResult(def, S.roundResults[key]);
      return;
    }

    S.phase = 'roundExam';
    Store.save(true);
    // relayoutInk() 등 레이아웃 계산이 실제 크기를 읽어야 하므로,
    // 화면이 보이지 않는(display:none) 상태에서 먼저 재기 시작하면 0으로
    // 측정된다 — 반드시 화면을 먼저 활성화한 뒤에 내용을 빌드한다.
    screen('screenRoundExam');
    buildRoundExam(def);

    if (Remote.enabled) {
      Remote.startRoundInProgress({ id: S.student.id, name: S.student.name, noId: S.student.noId, round: key });
      // 다른 기기·새로고침으로 로컬 기록은 없지만 서버에는 이미 제출된 경우를
      // 대비한 뒤늦은 확인 — 화면은 먼저 정상적으로 보여준 뒤 백그라운드로 확인한다.
      Remote.checkRoundDuplicate({ id: S.student.id, name: S.student.name, noId: S.student.noId, round: key }).then(r => {
        if (!r.duplicate || S.roundKey !== key) return;
        if (S.roundSubmitted && S.roundSubmitted[key]) return;
        const result = rebuildResultFromRemote(def, r.data || {});
        S.roundSubmitted = S.roundSubmitted || {};
        S.roundSubmitted[key] = true;
        S.roundResults = S.roundResults || {};
        S.roundResults[key] = result;
        Store.save(true);
        showRoundResult(def, result);
      });
    }
  }

  function backToRounds() {
    saveRoundStrokes();
    stopRoundTicker();
    S.roundKey = null;
    S.phase = 'rounds';
    Store.save(true);
    showRoundsScreen();
  }

  /* ---------------- 바인딩 ---------------- */
  function bind() {
    U.el('#btnEnterRounds').addEventListener('click', () => {
      S.phase = 'rounds';
      Store.save(true);
      showRoundsScreen();
    });

    U.el('#rlScrollCue').addEventListener('click', () => {
      U.el('.rlbody').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    U.el('#btnBackLanding').addEventListener('click', () => {
      stopRoundsTicker();
      S.phase = 'intro';
      Store.save(true);
      renderLandingBadges();
      screen('screenIntro');
    });

    U.el('#roundGrid').addEventListener('click', e => {
      const card = e.target.closest('.rselcard');
      if (!card) return;
      const key = card.dataset.round;
      if (identityDone()) enterRound(key);
      else goIdentity(key);
    });

    U.el('#btnBackIntro').addEventListener('click', () => {
      S.pendingRound = null;
      Store.save(true);
      showRoundsScreen();
    });
    U.el('#btnBeginExam').addEventListener('click', completeIdentity);

    U.el('#btnBackRounds').addEventListener('click', backToRounds);

    U.el('#rePrev').addEventListener('click', () => showReQuestion(reLocalIdx - 1));
    U.el('#reNext').addEventListener('click', () => showReQuestion(reLocalIdx + 1));

    U.el('#reOmrTab').addEventListener('click', () => openReOmr(true));
    U.el('#reOmrClose').addEventListener('click', () => openReOmr(false));
    U.el('#reSubmit').addEventListener('click', askRoundSubmit);

    U.el('#roundOmr').addEventListener('click', e => {
      if (roundLocked()) return;
      const btn = e.target.closest('.bub');
      if (!btn) return;
      const no = +btn.dataset.q, slot = btn.dataset.slot, v = +btn.dataset.v;
      const a = S.answers[no];
      if (slot === 'c') a.choice = (a.choice === v ? null : v);
      else a.digits[+slot] = (a.digits[+slot] === v ? null : v);
      paintMiniOmr();
      Store.save();
      if (no === reCurrentQs[reLocalIdx].no) {
        U.el('#reQpickNo').classList.toggle('is-marked', Store.isMarked(no));
      }
      updateReQlistState();
    });

    U.el('#reToolPen').addEventListener('click', () => setInkTool('pen'));
    U.el('#reToolEraser').addEventListener('click', () => setInkTool('eraser'));
    U.el('#reToolFinger').addEventListener('click', () => {
      S.fingerDraw = !S.fingerDraw;
      U.el('#reToolFinger').classList.toggle('is-on', S.fingerDraw);
      Store.save();
    });
    U.el('#reUndo').addEventListener('click', () => {
      if (!reInk || !reInk.undo()) return;
      saveRoundStrokes(); updateInkUndoRedo();
    });
    U.el('#reRedo').addEventListener('click', () => {
      if (!reInk || !reInk.redo()) return;
      saveRoundStrokes(); updateInkUndoRedo();
    });

    U.el('#reToolFinger').classList.toggle('is-on', !!S.fingerDraw);
    setInkTool('pen');

    window.addEventListener('beforeunload', () => { saveRoundStrokes(); });
  }

  /* ---------------- 전체화면 ---------------- */
  function bindFullscreen() {
    const btn = U.el('#btnFullscreen');
    if (!btn) return;
    if (!document.documentElement.requestFullscreen) return;
    btn.hidden = false;
    const sync = () => btn.classList.toggle('is-full', !!document.fullscreenElement);
    btn.addEventListener('click', () => {
      if (document.fullscreenElement) document.exitFullscreen();
      else document.documentElement.requestFullscreen().catch(() => {});
    });
    document.addEventListener('fullscreenchange', sync);
    sync();
  }

  /* ---------------- 부팅 ---------------- */
  function boot() {
    buildLanding();
    buildStaticSections();
    Store.load();
    renderLandingBadges();
    bind();
    bindFullscreen();
    initScrollReveal();
    setupInkTrail();

    if ((S.phase === 'roundExam' || S.phase === 'roundResult') && S.roundKey) { enterRound(S.roundKey); return; }
    if (S.phase === 'identity') { goIdentity(S.pendingRound); return; }
    if (S.phase === 'rounds') { showRoundsScreen(); return; }
    screen('screenIntro');
    playHeroIntro();
  }

  return { boot };
})();
