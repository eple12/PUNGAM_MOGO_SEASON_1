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
  '각 회차는 30분이며, 남은 시간은 화면 위쪽에 표시됩니다.<br>화면을 나가거나 새로고침해도 시간은 계속 흐르니 유의하십시오.',
  '한 회차는 5문항이며, 문항은 순서와 관계없이 자유롭게 이동해 풀 수 있습니다.<br>Day 01~06 중 원하는 순서로 골라 응시하면 됩니다.',
  '답안은 화면 귀퉁이의 OMR 탭을 눌러 언제든지 마킹할 수 있습니다.<br>단답형의 답은 자리에 맞추어 마킹하십시오.<br>예를 들어 정답이 5이면 일의 자리만, 또는 십의 자리 0과 일의 자리 5를 함께 마킹합니다.',
  '화면 어디에나 펜으로 필기할 수 있으며, 필기 공간이 부족하면 화면을 아래로 넘겨 이어서 사용하십시오.<br><b>문제풀이 과정이 필기로 남아 있어야 정상 응시 기록으로 인정됩니다.</b>',
  '답안을 제출하거나 회차 시간이 종료되면 그 회차의 답안은 더 이상 수정할 수 없고, 곧바로 채점 결과가 표시됩니다.',
  '인적사항(성명·학번)은 최초 1회만 작성합니다.<br><b>성명은 반드시 실명으로 작성하십시오.</b> 확인되지 않으면 기록이 삭제될 수 있습니다.'
];

const RoundApp = (() => {

  const S = Store.s;
  let sheet = null;      // 인적사항용 답안지(js/omr.js 의 큰 답안지, 최초 1회만 사용)

  /* ---------------- 화면 ---------------- */
  function screen(id) {
    U.els('.screen').forEach(s => s.classList.toggle('is-active', s.id === id));
    window.scrollTo(0, 0);
    // js/app.js 의 screen() 과 동일하게 불러야 한다. 인적사항(#screenIdentity)
    // 화면은 js/app.js 쪽 코드로 열리는데, 그 화면은 휴대폰에서 뷰포트를
    // width=1080 으로 고정해 데스크톱 배율로 축소해 보여준다(js/viewport.js
    // 의 WIDE_SCREENS). 회차 화면들은 그 목록에 없는데도 이 함수가
    // Viewport.sync 를 안 불러서, 인적사항·튜토리얼을 거쳐 들어온 회차
    // 화면이 그 축소된 뷰포트를 그대로 물려받고 있었다 — 실기기가 아니면
    // 안 드러나지만, 배율이 안 맞는 뷰포트에서는 touch-action:none 캔버스의
    // 제스처 인식이 깨지는 경우가 있어(필기 캔버스에서만 스크롤이 먹통이
    // 되는 증상과 정확히 일치) 여기서도 매번 정상 배율로 되돌린다.
    Viewport.sync(id);
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
  const PEN_TIP_X = 27, PEN_TIP_Y = 57;
  // 닙이 향하는 고정 각도 — CSS/SVG 의 양의 회전은 화면에서 시계 방향이라,
  // 기본값(똑바로 아래, 6시 방향)에서 45°를 더하면 7시 30분 방향(왼쪽
  // 아래)을 향하게 된다.
  const PEN_TILT_DEG = 45;

  /* 웨이포인트를 catmull-rom 스플라인으로 이어 매끄러운(접선이 이어지는)
     3차 베지어 경로를 만든다 — 예전 버전은 구간마다 개별 C 커맨드를 손으로
     이어 붙여서, 구간이 바뀌는 지점마다 접선 방향이 안 맞아 뾰족하게
     꺾여 보였다. 여기서는 각 점에서의 접선을 그 앞뒤 점으로 자동 계산해
     이어 붙이므로 어떤 점을 지나가게 하든(고리를 포함해서도) 항상
     매끄럽게 이어진다.
     SVG 'd' 문자열이 아니라 베지어 구간 배열(x0,y0,c1,c2,x1,y1)을 그대로
     반환한다 — 예전엔 이 문자열을 화면에 없는 <path>에 넣고 브라우저의
     getTotalLength/getPointAtLength 로 곡선 위 점을 뽑았는데, 점을 1000개
     안팎 뽑아야 하는 이 용도로는 그 네이티브 호출 자체가 비정상적으로
     느려서(포인트 수가 많아질수록 특히) 랜딩 진입 직후 몇 초간 뚜렷하게
     멎어 보이는 원인이었다. 구간을 직접 들고 있으면 순수 JS 산술만으로
     같은 곡선 위 점·길이를 구할 수 있어 그 비용을 없앨 수 있다. */
  function smoothSegments(pts) {
    if (pts.length < 2) return [];
    /* 균일(uniform) catmull-rom 은 이웃 점 사이 간격이 서로 크게 다르면
       접선을 과도하게 튀어나오게 계산해 오히려 뾰족한 첨점(cusp)을 만든다
       — 이 경로는 위아래로 성큼성큼 오가는 구간과, 반경이 훨씬 작은 고리
       구간이 한 배열 안에 같이 있어 간격 차이가 크다. 대신 점 사이의 실제
       거리(제곱근, alpha=.5 = centripetal) 를 반영해 접선을 계산하면
       간격이 고르지 않아도 첨점·자기교차 없이 매끄럽게 이어진다. */
    const alpha = .5;
    function knot(t, a, b) {
      const dx = b.x - a.x, dy = b.y - a.y;
      return t + Math.pow(Math.sqrt(dx * dx + dy * dy) || 1e-6, alpha);
    }
    const segs = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i - 1] || pts[i];
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const p3 = pts[i + 2] || p2;

      const t0 = 0;
      const t1 = knot(t0, p0, p1) || 1e-6;
      const t2 = knot(t1, p1, p2);
      const t3 = knot(t2, p2, p3);
      const d1 = t1 - t0 || 1e-6, d2 = t2 - t1 || 1e-6, d3 = t2 - t0 || 1e-6;
      const d4 = t3 - t2 || 1e-6, d5 = t3 - t1 || 1e-6;

      const m1x = d2 * ((p1.x - p0.x) / d1 - (p2.x - p0.x) / d3 + (p2.x - p1.x) / d2);
      const m1y = d2 * ((p1.y - p0.y) / d1 - (p2.y - p0.y) / d3 + (p2.y - p1.y) / d2);
      const m2x = d2 * ((p2.x - p1.x) / d2 - (p3.x - p1.x) / d5 + (p3.x - p2.x) / d4);
      const m2y = d2 * ((p2.y - p1.y) / d2 - (p3.y - p1.y) / d5 + (p3.y - p2.y) / d4);

      segs.push({
        x0: p1.x, y0: p1.y,
        c1x: p1.x + m1x / 3, c1y: p1.y + m1y / 3,
        c2x: p2.x - m2x / 3, c2y: p2.y - m2y / 3,
        x1: p2.x, y1: p2.y
      });
    }
    return segs;
  }

  /* 3차 베지어 구간 위 t(0~1) 지점의 좌표 — 표준 베지어 공식 그대로라
     getPointAtLength 와 결과가 사실상 동일하다(직접 검증: 같은 곡선을
     두 방식으로 각각 렌더링해 겹쳐 봐도 어긋나는 픽셀이 없다). */
  function bezierAt(seg, t) {
    const mt = 1 - t, a = mt * mt * mt, b = 3 * mt * mt * t, c = 3 * mt * t * t, d = t * t * t;
    return { x: a * seg.x0 + b * seg.c1x + c * seg.c2x + d * seg.x1, y: a * seg.y0 + b * seg.c1y + c * seg.c2y + d * seg.y1 };
  }

  /* 구간마다 SUB 개로 잘게 나눠 누적 호 길이 표를 미리 만들어 둔다(한 번만).
     이후 "호 길이 L 지점의 점"은 이 표에서 이분 탐색으로 구간을 찾고 그
     구간 안에서 선형보간만 하면 되니, getPointAtLength 를 프레임마다·
     점마다 새로 부르는 것보다 훨씬 싸다. */
  function buildLengthTable(segs, sub) {
    const table = [{ len: 0, seg: 0, t: 0 }];
    let acc = 0;
    for (let s = 0; s < segs.length; s++) {
      let prev = bezierAt(segs[s], 0);
      for (let k = 1; k <= sub; k++) {
        const t = k / sub;
        const p = bezierAt(segs[s], t);
        acc += Math.hypot(p.x - prev.x, p.y - prev.y);
        table.push({ len: acc, seg: s, t });
        prev = p;
      }
    }
    return table;
  }

  function pointAtArcLen(segs, table, L) {
    let lo = 0, hi = table.length - 1;
    if (L <= 0) return bezierAt(segs[0], 0);
    if (L >= table[hi].len) return bezierAt(segs[segs.length - 1], 1);
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (table[mid].len < L) lo = mid; else hi = mid;
    }
    const a = table[lo], b = table[hi];
    const localT = a.len === b.len ? 0 : (L - a.len) / (b.len - a.len);
    const t = a.seg === b.seg ? a.t + (b.t - a.t) * localT : b.t * localT;
    return bezierAt(segs[b.seg], t);
  }

  /* 사용자가 준 참고 이미지(필기체 서명 한 획, img/Screenshot_20260815_231840
     Samsung Notes.jpg)를 실제로 이미지 처리해서 뽑아낸 좌표다 — 원/타원/
     포물선 공식으로 "비슷하게" 새로 그린 게 아니라, 이미지를 이진화 →
     골격화(skeletonize) → 골격 그래프에서 오일러 경로(교차점을 포함해
     획 전체를 한 번씩만 지나는 경로, Hierholzer 알고리즘)를 구해 실제
     펜 순서 그대로 뽑았다(스크립트: 스크래치패드 trace_ink4.py). 이미지
     크기는 1482×2201, 획은 (657,94)에서 시작해 (1115,1945)에서 끝난다.
     REF_TRACE 는 그 원본 픽셀 좌표(692점)이고, buildInkSegments 는 이 배열을
     0~1 로 정규화한 뒤 페이지의 실제 폭(가장자리 여백 포함)·높이에 맞춰
     늘여서 쓴다. */
  const REF_TRACE = [
    [657,94],[648,98],[640,106],[631,109],[623,117],[616,125],[609,133],[603,141],[597,149],[591,157],[586,166],
    [582,175],[579,184],[577,194],[578,204],[586,211],[595,215],[605,217],[615,216],[625,215],[635,215],[645,214],
    [655,212],[665,211],[675,209],[685,207],[695,206],[705,204],[715,202],[725,201],[735,200],[745,199],[755,198],
    [765,197],[775,197],[785,197],[795,197],[805,198],[815,199],[825,200],[835,202],[845,204],[855,206],[864,209],
    [874,212],[883,215],[892,219],[901,223],[910,227],[918,232],[926,237],[934,243],[942,250],[950,258],[956,266],
    [962,274],[966,283],[968,293],[967,303],[966,313],[964,323],[961,332],[957,341],[953,350],[947,358],[942,366],
    [935,374],[928,382],[920,389],[912,396],[904,404],[896,410],[888,417],[880,423],[872,429],[864,436],[857,444],
    [844,446],[837,454],[830,460],[822,466],[814,471],[806,477],[798,483],[790,488],[782,494],[774,499],[766,504],
    [758,509],[750,515],[742,520],[734,525],[726,530],[718,536],[710,541],[701,546],[693,551],[685,556],[676,561],
    [668,566],[660,571],[651,576],[642,581],[634,586],[625,591],[616,596],[607,601],[598,606],[589,611],[580,615],
    [571,620],[562,625],[553,629],[544,634],[535,638],[526,642],[517,647],[508,651],[499,655],[490,659],[481,662],
    [472,666],[463,669],[454,672],[445,676],[435,679],[425,682],[415,684],[405,686],[395,688],[385,689],[375,690],
    [365,691],[355,691],[345,692],[335,691],[325,689],[315,686],[306,683],[297,679],[289,673],[282,665],[279,656],
    [281,646],[284,636],[288,627],[293,619],[299,611],[307,603],[314,595],[322,588],[330,580],[338,573],[346,567],
    [354,561],[362,555],[370,549],[378,544],[386,539],[394,534],[402,529],[410,524],[419,519],[428,514],[437,509],
    [446,505],[455,501],[464,496],[473,492],[482,488],[491,484],[500,481],[509,477],[518,473],[527,470],[536,467],
    [545,463],[555,460],[564,457],[573,454],[582,451],[592,448],[602,446],[611,443],[621,441],[631,439],[641,437],
    [651,435],[661,433],[671,431],[681,430],[691,429],[701,428],[711,427],[721,427],[731,427],[741,426],[751,426],
    [761,426],[771,427],[781,428],[791,429],[801,431],[811,433],[821,435],[830,438],[839,441],[857,447],[866,452],
    [875,457],[883,462],[891,467],[899,473],[907,479],[915,487],[922,495],[927,503],[932,511],[936,520],[938,530],
    [940,540],[939,550],[938,560],[936,570],[934,580],[931,589],[928,598],[923,607],[919,616],[914,624],[909,632],
    [903,640],[897,648],[891,656],[885,664],[877,672],[871,680],[863,688],[856,695],[849,702],[841,710],[833,717],
    [825,725],[817,732],[809,739],[801,746],[793,752],[785,759],[777,765],[769,772],[761,778],[753,784],[745,790],
    [737,796],[729,801],[721,807],[713,813],[705,818],[697,823],[689,829],[681,834],[672,839],[664,844],[656,849],
    [648,854],[639,859],[631,864],[622,869],[613,874],[605,879],[596,884],[587,888],[578,893],[569,898],[560,902],
    [552,907],[543,911],[534,916],[525,921],[516,926],[507,931],[498,936],[489,940],[481,945],[473,950],[464,955],
    [455,960],[446,965],[438,970],[429,975],[421,980],[413,985],[405,990],[397,995],[389,1000],[381,1006],
    [373,1011],[365,1017],[357,1022],[349,1028],[341,1034],[333,1040],[325,1046],[317,1052],[309,1058],[301,1064],
    [293,1071],[285,1077],[277,1084],[269,1090],[261,1097],[253,1104],[245,1112],[237,1119],[229,1127],[221,1135],
    [213,1143],[206,1151],[199,1159],[192,1167],[186,1175],[179,1183],[173,1191],[167,1199],[162,1207],[157,1215],
    [152,1223],[147,1232],[143,1241],[139,1250],[136,1259],[132,1268],[130,1278],[127,1288],[126,1298],[125,1308],
    [124,1318],[123,1328],[124,1338],[126,1348],[129,1357],[132,1366],[137,1375],[142,1384],[149,1392],[157,1400],
    [165,1405],[173,1410],[182,1415],[191,1418],[200,1421],[209,1424],[218,1427],[228,1429],[238,1431],[248,1432],
    [258,1433],[268,1433],[278,1433],[288,1433],[298,1432],[308,1431],[318,1431],[328,1429],[338,1428],[348,1427],
    [358,1425],[368,1424],[378,1422],[388,1420],[398,1419],[408,1417],[418,1415],[428,1413],[438,1411],[448,1409],
    [458,1407],[468,1405],[478,1403],[487,1400],[497,1398],[507,1396],[517,1394],[527,1391],[537,1389],[546,1386],
    [556,1384],[565,1381],[575,1378],[585,1376],[594,1373],[604,1370],[614,1368],[623,1365],[633,1362],[643,1360],
    [652,1357],[661,1354],[671,1351],[681,1348],[691,1346],[700,1343],[709,1340],[719,1337],[729,1335],[738,1332],
    [747,1329],[756,1326],[766,1323],[776,1320],[786,1318],[795,1315],[804,1312],[814,1310],[824,1307],[834,1305],
    [843,1302],[853,1300],[863,1298],[872,1295],[882,1293],[892,1291],[902,1289],[912,1287],[922,1286],[932,1284],
    [942,1282],[952,1281],[962,1280],[972,1279],[982,1278],[992,1277],[1002,1276],[1012,1276],[1022,1275],
    [1032,1275],[1042,1274],[1052,1274],[1062,1275],[1072,1275],[1082,1275],[1092,1276],[1102,1277],[1112,1278],
    [1122,1279],[1132,1281],[1142,1282],[1152,1284],[1162,1287],[1171,1290],[1180,1293],[1189,1296],[1198,1300],
    [1207,1304],[1215,1309],[1224,1314],[1232,1319],[1240,1326],[1248,1333],[1256,1341],[1264,1349],[1270,1357],
    [1276,1365],[1281,1373],[1286,1381],[1290,1390],[1294,1399],[1297,1408],[1300,1417],[1302,1427],[1304,1437],
    [1305,1447],[1305,1457],[1305,1467],[1304,1477],[1303,1487],[1302,1497],[1300,1507],[1297,1516],[1294,1525],
    [1290,1534],[1286,1543],[1282,1552],[1278,1561],[1273,1569],[1268,1578],[1263,1586],[1258,1595],[1253,1603],
    [1247,1611],[1242,1619],[1236,1627],[1230,1635],[1224,1643],[1218,1651],[1212,1659],[1206,1667],[1199,1675],
    [1192,1683],[1185,1691],[1178,1699],[1171,1707],[1164,1715],[1157,1723],[1150,1731],[1142,1739],[1134,1747],
    [1126,1755],[1118,1762],[1110,1770],[1102,1777],[1094,1785],[1086,1792],[1078,1799],[1070,1806],[1062,1813],
    [1054,1820],[1046,1826],[1038,1833],[1030,1839],[1022,1845],[1014,1851],[1006,1857],[998,1863],[990,1871],
    [980,1872],[972,1880],[964,1886],[955,1891],[947,1896],[938,1901],[929,1905],[921,1910],[912,1914],[903,1918],
    [894,1923],[885,1926],[876,1930],[867,1934],[858,1937],[849,1941],[840,1944],[830,1947],[820,1950],[810,1953],
    [800,1955],[790,1957],[780,1960],[770,1962],[760,1964],[750,1966],[740,1967],[730,1969],[720,1970],[710,1971],
    [700,1973],[690,1974],[680,1975],[670,1975],[660,1976],[650,1977],[640,1978],[630,1978],[620,1978],[610,1978],
    [600,1978],[590,1979],[580,1979],[570,1978],[560,1977],[550,1976],[540,1975],[530,1974],[520,1972],[510,1970],
    [500,1968],[490,1966],[481,1963],[471,1960],[462,1957],[453,1954],[444,1951],[435,1947],[426,1943],[418,1938],
    [409,1933],[401,1928],[393,1922],[385,1914],[377,1906],[371,1898],[366,1889],[363,1880],[361,1870],[362,1860],
    [363,1850],[364,1840],[366,1830],[369,1821],[372,1811],[376,1802],[380,1793],[385,1784],[390,1775],[395,1767],
    [400,1759],[406,1751],[412,1743],[419,1735],[427,1727],[434,1719],[442,1712],[450,1704],[458,1697],[466,1691],
    [474,1684],[482,1678],[490,1672],[498,1667],[506,1662],[514,1657],[523,1652],[532,1647],[541,1643],[550,1639],
    [559,1635],[568,1632],[577,1629],[586,1626],[596,1624],[605,1621],[615,1620],[625,1618],[635,1617],[645,1617],
    [655,1616],[665,1617],[675,1618],[685,1620],[695,1622],[705,1624],[714,1627],[723,1630],[732,1634],[741,1639],
    [750,1644],[758,1649],[766,1654],[774,1660],[782,1667],[790,1673],[798,1680],[806,1688],[814,1696],[822,1704],
    [830,1712],[837,1720],[844,1728],[851,1736],[858,1744],[865,1752],[872,1760],[879,1768],[887,1776],[895,1784],
    [903,1792],[911,1800],[919,1808],[927,1816],[935,1824],[943,1831],[951,1839],[959,1846],[967,1854],[975,1862],
    [981,1870],[990,1875],[998,1883],[1006,1890],[1014,1897],[1022,1904],[1030,1910],[1038,1917],[1046,1923],
    [1054,1929],[1062,1934],[1070,1939],[1078,1944],[1087,1948],[1097,1949],[1107,1947],[1115,1945]
  ];
  const REF_W = 1482, REF_Y0 = 94, REF_Y1 = 1945;

  function buildInkSegments(w, h, btnBox, authorsBox, rulesBox, margins, eventBox) {
    // 뷰포트에 본문(.rlbody) 바깥 여백이 남아 있으면(넓은 화면) 그 여백
    // 쪽으로 크게 쓸어내릴 수 있는 훨씬 넓은 캔버스를 확보한다.
    const edgeR = margins && margins.right > 40 ? w + Math.min(margins.right * .6, 110) : w - 14;
    const edgeL = margins && margins.left > 40 ? -Math.min(margins.left * .6, 110) : 14;
    const targetH = btnBox ? Math.max(400, btnBox.top - 40) : h * .82;

    const pts = REF_TRACE.map(([rx, ry]) => ({
      x: edgeL + (rx / REF_W) * (edgeR - edgeL),
      y: (ry - REF_Y0) / (REF_Y1 - REF_Y0) * targetH
    }));

    if (btnBox) {
      // 입장 버튼을 한 바퀴 감싸는 마무리 고리 — 참고 이미지의 마지막
      // 획 끝에서 곧바로 이어져, 버튼 위쪽 중앙에서 시계 방향으로 한
      // 바퀴 돈 뒤 버튼 아래로 살짝 빠져나온다.
      const bcx = btnBox.left + btnBox.width / 2;
      const bcy = btnBox.top + btnBox.height / 2;
      const rx = btnBox.width / 2 + 26, ry = btnBox.height / 2 + 20;
      const last = pts[pts.length - 1];
      const btnStart = { x: bcx, y: bcy - ry };
      // 고리 진입 접선을 타원의 실제 접선(버튼 위쪽 중앙에서는 수평)과
      // 맞춰야 이음매가 꺾여 보이지 않는다 — 예전엔 x·y를 서로 다른
      // easing(이차 vs 선형)으로 따로 움직여서 btnStart 도착 순간의
      // 기울기가 타원 접선과 어긋나 있었다(그래서 마지막 고리 직전이
      // 살짝 꺾여 보였다). 대신 btnStart 바로 왼쪽에 "진입 직전" 점을
      // 하나 두고 — 그 점에서 btnStart 까지는 완전히 수평이라 타원 접선과
      // 정확히 일치한다 — last 에서 거기까지만 부드럽게 이어지게 한다.
      const preStart = { x: btnStart.x - rx * .55, y: btnStart.y };
      const LEAD_STEPS = 8;
      for (let i = 1; i <= LEAD_STEPS; i++) {
        const t = i / LEAD_STEPS, e = 1 - (1 - t) * (1 - t); // 이차(포물선) ease-out
        pts.push({ x: last.x + (preStart.x - last.x) * e, y: last.y + (preStart.y - last.y) * e });
      }
      pts.push(btnStart);
      const BTN_STEPS = 24;
      for (let i = 0; i <= BTN_STEPS; i++) {
        const a = -Math.PI / 2 + (i / BTN_STEPS) * Math.PI * 2;
        pts.push({ x: bcx + Math.cos(a) * rx, y: bcy + Math.sin(a) * ry });
      }
      pts.push({ x: bcx, y: btnBox.bottom + 22 });
    }

    return smoothSegments(pts);
  }

  /* 곡선을 일정 간격(step, px)으로 샘플링해 각 지점의 좌표·접선각을 얻는다
     — 리본 폭 계산(만년필 굵기 변화)에 쓴다. table 은 buildLengthTable() 로
     미리 만들어 둔 누적 호 길이 표. */
  function sampleCurve(segs, table, step) {
    const len = table[table.length - 1].len;
    const n = Math.max(2, Math.round(len / step));
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const l = (i / n) * len;
      const p = pointAtArcLen(segs, table, l);
      const p2 = pointAtArcLen(segs, table, Math.min(len, l + .75));
      pts.push({ x: p.x, y: p.y, ang: Math.atan2(p2.y - p.y, p2.x - p.x), t: i / n });
    }
    return pts;
  }

  /* 리본의 맨 처음·맨 끝 몇 %는 폭을 0까지 서서히 줄여, 만년필로 획을
     떼고 붙이는 순간처럼 자연스럽게 얇아지며 시작/끝나게 한다 — 그냥
     고정 폭으로 시작/끝나면 화면 경계에서 뚝 잘린 것처럼 보인다. */
  const TAPER_FRAC = .035;
  function taperFactor(t) {
    if (t < TAPER_FRAC) return t / TAPER_FRAC;
    if (t > 1 - TAPER_FRAC) return (1 - t) / TAPER_FRAC;
    return 1;
  }

  /* 만년필 닙이 놓인 고정 각도 — 실제 캘리그라피 촉처럼, 진행 방향이 이
     각도와 수직에 가까울수록 굵고 나란할수록 가늘어진다. */
  const INK_NIB_ANGLE = 50 * Math.PI / 180;
  function inkWidthAt(ang, minW, maxW) {
    return minW + (maxW - minW) * Math.abs(Math.sin(ang - INK_NIB_ANGLE));
  }

  /* 표준 SVG stroke-width 는 경로 전체에서 값이 고정이라 만년필 특유의
     굵기 변화를 표현할 수 없다 — 대신 각 샘플점에서 진행 방향에 수직으로
     좌우 윤곽점을 계산해, 그 윤곽을 그대로 이어 붙인 도형(리본)을 채운다. */
  function ribbonPath(pts, minW, maxW) {
    const left = [], right = [];
    pts.forEach(p => {
      const w = inkWidthAt(p.ang, minW, maxW) / 2 * taperFactor(p.t);
      const nx = Math.cos(p.ang + Math.PI / 2), ny = Math.sin(p.ang + Math.PI / 2);
      left.push({ x: p.x + nx * w, y: p.y + ny * w });
      right.push({ x: p.x - nx * w, y: p.y - ny * w });
    });
    let d = 'M ' + left[0].x.toFixed(1) + ' ' + left[0].y.toFixed(1);
    for (let i = 1; i < left.length; i++) d += ' L ' + left[i].x.toFixed(1) + ' ' + left[i].y.toFixed(1);
    for (let i = right.length - 1; i >= 0; i--) d += ' L ' + right[i].x.toFixed(1) + ' ' + right[i].y.toFixed(1);
    return d + ' Z';
  }

  function setupInkTrail() {
    if (typeof anime === 'undefined' || rlReduceMotion()) return;
    const wrap = U.el('#rlInk'), svg = U.el('#rlInkSvg'), pen = U.el('#rlInkPen'), body = U.el('.rlbody');
    const introEl = document.getElementById('screenIntro');
    if (!wrap || !svg || !pen || !body || !introEl) return;

    let segs = null, lenTable = null, curveLen = 0, rafPending = false;
    let fullPts = [], inkEl = null, sheenEl = null;
    // screen() 은 화면 전환을 그냥 .is-active 클래스 토글(display:none)로만
    // 하는 SPA 라, 여기서 scroll 리스너를 한 번 달아 두면 예전엔 사용자가
    // 랜딩을 벗어나 시험/결과 화면 등에서 스크롤할 때도 매 프레임 이 무거운
    // SVG 경로 재계산이 계속 돌았다(화면을 아예 못 보고 지나간 사용자도
    // 포함) — 앱 전체가 버벅이던 원인. 랜딩 화면이 실제로 활성 상태일
    // 때만 계산하도록 막는다.
    let active = false;

    function rebuild() {
      const w = body.clientWidth, h = body.scrollHeight;
      if (!w || !h) return;

      // .rlbody 는 max-width:640 이라 그 바깥 좌우로 뷰포트 여백이 남는
      // 화면에서는 캔버스가 딱 본문 폭(w)에 갇혀 있었다 — 그래서 카드
      // 옆을 지나갈 때 크게 휠 자리가 없어 억지로 좁게 붙어야 했다.
      // 실제로 남는 뷰포트 여백만큼 캔버스를 좌우로 넓혀서, 카드를 절대
      // 가리지 않으면서도(본문 폭 0..w 밖이니 카드와 절대 안 겹친다) 훨씬
      // 크고 부드럽게 휠 수 있게 한다. 좌표계는 그대로 body 기준(0..w)을
      // 유지하고, svg 자체만 그 바깥까지 넓게 그린다.
      const bodyRect = body.getBoundingClientRect();
      const vw = document.documentElement.clientWidth || window.innerWidth || w;
      const marginL = Math.max(0, bodyRect.left);
      const marginR = Math.max(0, vw - bodyRect.right);
      svg.style.left = (-marginL) + 'px';
      svg.setAttribute('viewBox', (-marginL) + ' 0 ' + (w + marginL + marginR) + ' ' + h);
      svg.setAttribute('width', w + marginL + marginR);
      svg.setAttribute('height', h);

      // 입장 버튼·출제진·유의사항 섹션의 body 기준 위치 — 잉크 곡선이
      // 이 지점들을 피해(또는 감싸며) 지나가게 하려면 페이지 스크롤
      // 위치와 무관한(문서 내부) 좌표가 필요하다.
      function localBox(el) {
        if (!el) return null;
        const r = el.getBoundingClientRect();
        if (!r.width || !r.height) return null; // hidden(display:none) 요소는 없는 것으로 취급
        return { left: r.left - bodyRect.left, top: r.top - bodyRect.top, width: r.width, height: r.height, bottom: (r.top - bodyRect.top) + r.height };
      }
      const btnBox = localBox(document.getElementById('btnEnterRounds'));
      const eventBox = localBox(document.getElementById('rlEvent'));
      const authorsBox = localBox(document.querySelector('.rlanding__authorsec'));
      const rulesBox = localBox(document.querySelector('.rlanding__rulesec'));
      const margins = { left: marginL, right: marginR };

      // 기준 곡선은 이제 화면에 그리는 <path>가 아니라 베지어 구간
      // 배열이다(smoothSegments) — 리본·펜 위치 계산은 전부 이걸로 한다.
      // getTotalLength/getPointAtLength 같은 네이티브 SVG 지오메트리 호출을
      // 아예 안 쓰므로 점이 많아도 느려지지 않는다.
      segs = buildInkSegments(w, h, btnBox, authorsBox, rulesBox, margins, eventBox);
      lenTable = buildLengthTable(segs, 16);
      curveLen = lenTable[lenTable.length - 1].len;
      fullPts = sampleCurve(segs, lenTable, 6);
      svg.innerHTML = '<path class="rlink__ink"></path><path class="rlink__sheen"></path>';
      inkEl = svg.querySelector('.rlink__ink');
      sheenEl = svg.querySelector('.rlink__sheen');
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
      if (!segs || !inkEl) return;
      const rect = body.getBoundingClientRect();
      const bodyTopAbs = window.scrollY + rect.top;
      const maxScroll = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
      const start = Math.max(0, bodyTopAbs - window.innerHeight * 0.5);
      const progress = Math.min(1, Math.max(0, (window.scrollY - start) / Math.max(1, maxScroll - start)));
      const p1 = pointAtArcLen(segs, lenTable, curveLen * progress);

      // 리본을 사각형 클립이 아니라 "지금까지 지나온 경로 순서" 그대로
      // 잘라서 그린다 — 고리(플로리시)처럼 y 좌표가 오르내리는 구간도
      // 실제로 펜이 지나간 순서대로만 드러난다(위→아래 사각 와이프 X).
      const idx = Math.max(1, Math.round(progress * (fullPts.length - 1)));
      const shown = fullPts.slice(0, idx + 1);
      // 최소 굵기를 너무 얇게(1px) 두면, 진행 방향이 우연히 닙 각도와
      // 나란해지는 지점마다 리본이 거의 0에 가깝게 좁아져 그 자리만 실제로
      // 끊긴 것처럼(선이 여러 조각으로 나뉜 것처럼) 보인다 — 참고 이미지
      // 처럼 아무리 가늘어져도 절대 끊기지 않는 한 획으로 보이려면 최소
      // 굵기를 눈에 띄게 남겨 둬야 한다.
      inkEl.setAttribute('d', ribbonPath(shown, 3, 7.5));
      sheenEl.setAttribute('d', ribbonPath(shown, 1.4, 3));
      /* transform-origin(css/rounds.css)이 펜 박스 안에서 닙 끝의 고정
         px 좌표(18,38)에 있으므로, translate 는 그만큼 빼서 보정해야
         닙 끝 자체가 정확히 p1 에 놓인다. rotate 는 transform-origin(닙
         끝) 을 축으로 돌므로 translate 보정값에는 영향을 주지 않는다 —
         진행 방향을 따라가지 않는 고정 각도(PEN_TILT_DEG)만 적용한다. */
      pen.style.transform = 'translate(' + (p1.x - PEN_TIP_X) + 'px,' + (p1.y - PEN_TIP_Y) + 'px) rotate(' + PEN_TILT_DEG + 'deg)';
    }

    function onScroll() {
      if (!active) return;
      if (rafPending) return;
      rafPending = true;
      requestAnimationFrame(() => { rafPending = false; update(); });
    }

    // setupInkTrail() 은 boot() 안에서 phase 복원 분기(enterRound/goIdentity/
    // showRoundsScreen)보다 먼저 실행되므로, 이 시점엔 #screenIntro 가 아직
    // (정적 HTML 기본값 그대로) is-active 여도 실제로 랜딩에 머물지는 boot()
    // 가 끝나 봐야 안다 — 시험/결과 화면으로 바로 들어가는 사용자는 애초에
    // rebuild() 자체가 필요 없으므로, boot() 이 완전히 끝난 뒤에야 실제
    // 활성 화면을 보고 판단한다. requestAnimationFrame 이 아니라
    // setTimeout(...,0) 을 쓰는 이유: 브라우저는 탭이 백그라운드(모바일에서
    // 웹뷰가 아직 화면에 완전히 뜨기 전, 앱 전환 애니메이션 도중 등
    // document.visibilityState !== 'visible' 인 상태)일 때 rAF 콜백 자체를
    // 아예 실행하지 않는다 — 그 상태로 페이지가 열리면 랜딩 잉크가 영원히
    // 안 그려져(SVG가 텅 빈 채로 남아) 유리 카드 뒤로 비칠 게 없어서 카드가
    // 그냥 불투명해 보이는 버그로 이어졌다(실제로 재현·확인함). setTimeout
    // 은 화면이 보이는지와 무관하게 항상 실행된다.
    setTimeout(() => {
      active = introEl.classList.contains('is-active');
      if (active) rebuild();
    }, 0);
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', () => { if (active) rebuild(); });

    // 다른 화면에 있다가 다시 랜딩으로 돌아오면(안내로 돌아가기 등) 그 사이
    // 뷰포트가 바뀌었을 수 있으니 다시 그린다. is-active 토글 자체를
    // 감시하면 screen() 을 부르는 곳마다 일일이 훅을 심지 않아도 된다.
    new MutationObserver(() => {
      const now = introEl.classList.contains('is-active');
      if (now === active) return;
      active = now;
      if (active) rebuild();
    }).observe(introEl, { attributes: true, attributeFilter: ['class'] });
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

    // pointermove 는 스크롤과 달리 브라우저가 알아서 rAF 에 맞춰 줄여주지
    // 않는다 — 고주사율 마우스·트랙패드에서는 프레임당 여러 번 들어올 수
    // 있는데, 그때마다 카드 6개 전부 getBoundingClientRect 를 부르고
    // anime.set 을 쓰면 그만큼 헛일이 겹쳐 버벅임으로 느껴진다. 마지막
    // 이벤트만 저장해 두고 프레임당 한 번만 실제로 계산한다.
    let pendingEvent = null, moveRaf = null;
    function processMove() {
      moveRaf = null;
      const e = pendingEvent;
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
    }
    grid.addEventListener('pointermove', e => {
      if (e.pointerType !== 'mouse') return;
      pendingEvent = e;
      if (moveRaf == null) moveRaf = requestAnimationFrame(processMove);
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
    // justify-content:safe center(css/rounds.css)로 카드가 넘칠 때도 양쪽
    // 끝까지 스크롤은 되지만, 처음 들어왔을 땐 Day 01부터 보이도록 맨
    // 왼쪽으로 맞춰 둔다.
    U.el('#roundGrid').scrollLeft = 0;
    playRoundsIntro();
    tickRoundsList();
    stopRoundsTicker();
    roundsTicker = setInterval(tickRoundsList, 1000);
    loadRoundsStats();
  }

  /* 회차 선택 화면 하단 — 전체 응시자의 회차 합산 점수 분포와 학년별
     1등 점수(학번 첫 자리 1/2/3). 매번 새로 불러온다(회차 화면에 올 때마다
     최신 집계를 보여준다). */
  function loadRoundsStats() {
    const chartHost = U.el('#overallScoreChartHost');
    const gradeHost = U.el('#gradeTopHost');
    if (!Remote.enabled) {
      chartHost.innerHTML = '<p class="scorechart__empty">순위 정보를 사용할 수 없습니다.</p>';
      gradeHost.innerHTML = '<p class="scorechart__empty">순위 정보를 사용할 수 없습니다.</p>';
      return;
    }
    // 지금까지 제출한 회차들의 점수를 더한, 내(이 브라우저) 합산 점수 —
    // 하나도 제출한 회차가 없으면 강조 없이(null) 그냥 분포만 보여준다.
    const submitted = ROUND_DEFS.filter(d => S.roundSubmitted && S.roundSubmitted[d.key] && S.roundResults && S.roundResults[d.key]);
    const myTotal = submitted.length ? submitted.reduce((sum, d) => sum + S.roundResults[d.key].score, 0) : null;
    U.el('#overallMyScore').textContent = myTotal != null ? '(내 점수 ' + myTotal + '점)' : '';

    Remote.fetchRoundLeaderboard().then(r => {
      if (!r.ok) {
        chartHost.innerHTML = '<p class="scorechart__empty">불러오지 못했습니다.</p>';
        gradeHost.innerHTML = '<p class="scorechart__empty">불러오지 못했습니다.</p>';
        return;
      }
      chartHost.innerHTML = U.scoreChart(r.overallScores, myTotal, CONFIG.totalScore);
      gradeHost.innerHTML = [1, 2, 3].map(g => {
        const score = r.gradeTop[g];
        return '<div class="gradetop__row">' +
          '<span class="gradetop__grade">' + g + '학년</span>' +
          '<span class="gradetop__score' + (score == null ? ' is-empty' : '') + '">' +
          (score == null ? '아직 없음' : score + '점') +
          '</span></div>';
      }).join('');
    });
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

  /* 인적사항 작성을 마친 직후, 감독관 날인란으로 부드럽게 스크롤해
     도장이 찍히는 모습을 보여 준다. 실제 도장(is-signed)은 시험이 정말
     시작된 뒤에만 찍히므로, 여기서는 별도의 is-signing 클래스로만 같은
     애니메이션을 재생한다(상태는 아무것도 바꾸지 않는다). 예전 단일
     시험판(js/app.js 의 stampPreview)에 있던 걸 회차판으로 그대로 옮겼다. */
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

    await stampPreview();

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
  let reOmrTool = 'pen';      // pen | white(수정테이프) — 답안지(OMR) 마킹 도구, js/omr.js 의 setTool 과 같은 개념
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
    // js/exam.js 의 setTool() 과 동일 — 지우개일 때 커서를 바꿔 지금 뭘 쓰는
    // 도구인지 보여준다(css/rounds.css 의 .rePaper.is-erasing .reInk).
    // bind() 가 부팅 시 한 번 setInkTool('pen') 을 부르는데, 그 시점엔 아직
    // 어떤 회차도 들어가지 않아 ensureInk() 가 rePaper 를 채우기 전이라
    // undefined 일 수 있다.
    if (rePaper) rePaper.classList.toggle('is-erasing', t === 'eraser');
  }

  /* js/exam.js 의 bindPointer() 를 그대로 옮긴 것이다 — 예전의 단순한 버전은
     "손가락 필기가 꺼져 있을 때 손가락으로는 그리지 않는다"만 처리하고, 그
     경우 손가락 입력을 스크롤로 넘겨주는 부분이 아예 없었다. 그런데
     .reInk 는 touch-action:none 이라(획을 긋는 도중 브라우저가 제스처를
     가로채 스크롤해 버리는 걸 막으려고 필요하다 — css/rounds.css 참고)
     캔버스 위에서는 브라우저가 알아서 스크롤해 주는 일도 없다. 즉 펜
     도구를 쓰는 중(손가락 필기 꺼짐)에 손가락으로 스크롤하려 하면 그릴
     수도, 브라우저가 대신 스크롤해 주지도 않아 완전히 먹통이었다.
     js/exam.js 는 이 문제를 겪지 않는데, 손가락이 "그리지 않는" 입력일
     때 act='scroll' 로 놓고 pointermove 에서 reScroll.scrollTop 을 직접
     밀어주는 스크롤을 손수 구현해 두었기 때문이다(관성 스크롤 fling 포함).
     회차 필기 공간에도 그 구현을 그대로 옮긴다 — 팔뚝/손바닥 오인 방지,
     아이패드OS 중복 획 아티팩트 억제까지 포함해서. 회차 쪽엔 '일반
     지우개'(erase-area) 도구가 없어 그 부분만 뺐다. */
  function bindInkPointer() {
    const pt = e => {
      const r = reCanvas.getBoundingClientRect();
      return [e.clientX - r.left, e.clientY - r.top];
    };
    const canDraw = e => e.pointerType === 'pen' || e.pointerType === 'mouse' || (S.fingerDraw && e.pointerType === 'touch');

    // 애플펜슬 접촉 한 번에 포인터 스트림이 두 번 잡히는 iPadOS Safari 버그 감지 —
    // js/exam.js 의 IS_IPADOS 판정과 동일하다.
    const IS_IPADOS = /iPad/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

    const pointers = new Map();
    let act = null;                 // 'draw' | 'erase' | 'scroll'
    let drawId = null;
    let sc = null;                  // 스크롤 상태
    let flingId = 0;

    let pendingStroke = null;
    let pendingTimer = 0;
    const DUP_MS = 45;
    const DUP_R = 10;
    const DUP_SPAN = 20;
    const PALM_GRACE_MS = 250;

    function looksLikeArtifact(s, x, y) {
      const p0 = s.p[0];
      if (Math.hypot(x - p0[0], y - p0[1]) >= DUP_R) return false;
      const b = s.b;
      return (b[2] - b[0]) < DUP_SPAN && (b[3] - b[1]) < DUP_SPAN;
    }

    const avgY = () => { let s = 0; pointers.forEach(p => s += p.y); return s / pointers.size; };

    function stopFling() { cancelAnimationFrame(flingId); flingId = 0; }

    function fling(v) {
      stopFling();
      if (Math.abs(v) < 1.2) return;
      const step = () => {
        v *= 0.945;
        if (Math.abs(v) < 0.2) return;
        const before = reScroll.scrollTop;
        reScroll.scrollTop -= v;
        if (reScroll.scrollTop === before) return;
        flingId = requestAnimationFrame(step);
      };
      flingId = requestAnimationFrame(step);
    }

    function beginScroll() {
      act = 'scroll';
      sc = { y: avgY(), t: performance.now(), v: 0, t0: performance.now(), startTop: reScroll.scrollTop };
    }

    // Apple Pencil Scribble 대응 — js/exam.js 와 같은 이유로 pointerdown 이
    // 아니라 여기서 가장 먼저 preventDefault 한다.
    reCanvas.addEventListener('touchstart', e => {
      e.preventDefault();
    }, { passive: false });

    reCanvas.addEventListener('pointerdown', e => {
      e.preventDefault();

      if (roundLocked() && inkTool === 'eraser') return;

      // 애플펜슬 필기 중 손바닥 접촉으로 생기는 touch 포인터를 걸러낸다.
      if (e.pointerType === 'touch' && !S.fingerDraw && (drawId !== null || act === 'draw' || act === 'erase')) {
        return;
      }

      stopFling();
      pointers.set(e.pointerId, { y: e.clientY, type: e.pointerType });

      const drawnByTouch = drawId !== null && pointers.get(drawId) && pointers.get(drawId).type === 'touch';
      if (pointers.size >= 2 && (drawnByTouch || act !== 'draw')) {
        const others = Array.from(pointers.entries()).filter(([id]) => id !== e.pointerId);
        const onlyStillTouch = others.length === 1 && others[0][1].type === 'touch';
        if (canDraw(e) && act === 'scroll' && !S.fingerDraw && !roundLocked() && onlyStillTouch && sc &&
            reScroll.scrollTop === sc.startTop && performance.now() - sc.t0 < PALM_GRACE_MS) {
          pointers.delete(others[0][0]);
          act = null; sc = null;
        } else {
          if (act === 'draw') { reInk.cancel(); drawId = null; }
          beginScroll();
          return;
        }
      }
      if (pointers.size >= 2) return;

      if (canDraw(e)) {
        if (roundLocked()) { beginScroll(); return; }
        const [x, y] = pt(e);
        if (pendingStroke) {
          if (looksLikeArtifact(pendingStroke, x, y)) {
            clearTimeout(pendingTimer);
            reInk.undoIfLast(pendingStroke);
          }
          pendingStroke = null;
        }
        if (inkTool === 'eraser') { act = 'erase'; reInk.eraseAt(x, y); }
        else { act = 'draw'; reInk.begin(x, y, e.pressure || 0.5); }
        drawId = e.pointerId;
        try { reCanvas.setPointerCapture(e.pointerId); } catch (err) { /* 캡처 실패해도 필기는 이어진다 */ }
      } else {
        beginScroll();
      }
    }, { passive: false });

    reCanvas.addEventListener('pointermove', e => {
      e.preventDefault();
      if (!pointers.has(e.pointerId)) return;
      pointers.set(e.pointerId, { y: e.clientY, type: pointers.get(e.pointerId).type });

      if (act === 'scroll' && sc) {
        const y = avgY();
        const now = performance.now();
        const dy = y - sc.y;
        reScroll.scrollTop -= dy;
        const dt = Math.max(1, now - sc.t);
        sc.v = sc.v * 0.6 + (dy / dt * 16) * 0.4;
        sc.y = y; sc.t = now;
        return;
      }
      if (e.pointerId !== drawId) return;

      const list = U.penEvents(e);
      if (act === 'draw') {
        list.forEach(ev => { const [x, y] = pt(ev); reInk.extend(x, y, ev.pressure || 0.5); });
      } else if (act === 'erase') {
        list.forEach(ev => { const [x, y] = pt(ev); reInk.eraseAt(x, y); });
      }
    }, { passive: false });

    function finish(e) {
      pointers.delete(e.pointerId);
      if (act === 'draw' && e.pointerId === drawId) {
        const s = reInk.end();
        if (s && IS_IPADOS) {
          clearTimeout(pendingTimer);
          pendingStroke = s;
          pendingTimer = setTimeout(() => {
            pendingStroke = null;
            saveRoundStrokes(); updateInkUndoRedo();
          }, DUP_MS);
        } else if (s) {
          saveRoundStrokes(); updateInkUndoRedo();
        }
        drawId = null;
      }
      if (act === 'erase' && e.pointerId === drawId) { saveRoundStrokes(); updateInkUndoRedo(); drawId = null; }
      if (act === 'scroll' && pointers.size === 0 && sc) fling(sc.v);
      if (pointers.size === 0) { act = null; sc = null; }
      else if (act === 'scroll') sc = { y: avgY(), t: performance.now(), v: 0 };
    }

    reCanvas.addEventListener('pointerup', finish);
    // pointercancel 은 손바닥 접촉 등으로 WebKit 이 포인터 흐름을 가로챌 때도 발생한다.
    reCanvas.addEventListener('pointercancel', finish);
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
      // 이 콜백이 불릴 때까지 사용자가 이미 다른 문항으로 넘어갔으면(빠르게
      // 다음/이전을 연달아 누른 경우) 아무것도 하지 않는다 — 안 그러면 지금
      // 화면에 있는(새 문항의) 캔버스에 이 콜백이 원래 예약됐던 옛 문항의
      // 필기를 다시 얹어써서, "문항을 오갔더니 필기가 밀려 보인다"는 증상으로
      // 이어진다.
      if (reInkLoadedFor !== q.no) return;
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
        // 회차 만점은 작아서(문항 5개) 막대그래프 대신 점그래프를 쓴다
        // — U.scoreChart 는 막대 폭 상한 때문에 만점이 작으면 왼쪽에
        // 몰려 보이지만, U.scoreDots 는 만점 대비 실제 위치에 점을 찍어
        // 항상 트랙 전체 폭에 걸쳐 퍼진다.
        chartHost.innerHTML = r.ok
          ? U.scoreDots(r.scores, result.score, result.totalPoints)
          : '<p class="scorechart__empty">순위 정보를 불러오지 못했습니다.</p>';
      });
    }
  }

  async function enterRound(key) {
    stopRoundsTicker();
    const def = ROUND_DEFS.find(d => d.key === key);
    if (!def) { showRoundsScreen(); return; }
    S.roundKey = key;
    Store.save(true);

    if (S.roundSubmitted && S.roundSubmitted[key] && S.roundResults && S.roundResults[key]) {
      showRoundResult(def, S.roundResults[key]);
      return;
    }

    // 아직 한 번도 시작하지 않은 회차라면(타이머가 없다면) 실수로 시작하지
    // 않도록 한 번 더 확인을 받는다 — 이미 시작해 둔 회차를 새로고침 등으로
    // 다시 불러오는 경우(타이머가 이미 있음)에는 다시 묻지 않는다.
    const fresh = !(S.roundTimers && S.roundTimers[key]);
    if (fresh) {
      const ok = await U.modal({
        title: def.day + ' 시작',
        body: '<p>정말 시작하시겠습니까? 시작과 동시에 ' + ROUND_MINUTES + '분 타이머가 흐르기 시작하며, 화면을 나가도 계속 흐릅니다.</p>',
        buttons: [{ label: '아니오', value: false }, { label: '예, 시작합니다', value: true, kind: 'primary' }]
      });
      if (!ok) { showRoundsScreen(); return; }
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
      // 인적사항은 최초 1회만 — 이미 작성돼 있으면(나갔다 다시 들어와도)
      // 다시 적게 하지 않고 곧장 회차 선택으로 보낸다.
      if (identityDone()) {
        S.phase = 'rounds';
        Store.save(true);
        showRoundsScreen();
      } else {
        goIdentity(null);
      }
    });

    U.el('#rlScrollCue').addEventListener('click', () => {
      window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' });
    });

    const roundsCue = U.el('#roundsScrollCue');
    if (roundsCue) {
      roundsCue.addEventListener('click', () => {
        window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' });
      });
    }

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
      S.phase = 'intro';
      Store.save(true);
      renderLandingBadges();
      screen('screenIntro');
    });
    U.el('#btnBeginExam').addEventListener('click', completeIdentity);

    U.el('#btnBackRounds').addEventListener('click', backToRounds);

    U.el('#rePrev').addEventListener('click', () => showReQuestion(reLocalIdx - 1));
    U.el('#reNext').addEventListener('click', () => showReQuestion(reLocalIdx + 1));

    // 튜토리얼(js/tutorial.js 의 #tutClearInk)과 동일한 기능 — 문항 이동
    // 목록(#reQlist) 안에 두어 "지금 보고 있는 문항의 필기만 전부 지운다"는
    // 걸 명확히 한다. 되돌릴 수 없어 한 번 더 확인을 받는다.
    U.el('#reClearInk').addEventListener('click', async () => {
      if (roundLocked()) return;
      const no = reLocalIdx + 1;
      const ok = await U.modal({
        title: '필기 지우기',
        body: '<p>현재 문항(' + no + '번)의 필기를 모두 지웁니다. 되돌릴 수 없습니다.</p>',
        buttons: [{ label: '취소', value: false }, { label: '지우기', value: true, kind: 'danger' }]
      });
      if (!ok) return;
      reInk.clear();
      saveRoundStrokes();
      updateInkUndoRedo();
      U.toast('필기를 지웠습니다.');
    });

    U.el('#reOmrTab').addEventListener('click', () => openReOmr(true));
    U.el('#reOmrClose').addEventListener('click', () => openReOmr(false));
    U.el('#reSubmit').addEventListener('click', askRoundSubmit);

    U.el('#reOmrToolPen').addEventListener('click', () => {
      reOmrTool = 'pen';
      U.el('#reOmrToolPen').classList.add('is-on');
      U.el('#reOmrToolWhite').classList.remove('is-on');
    });
    U.el('#reOmrToolWhite').addEventListener('click', () => {
      reOmrTool = 'white';
      U.el('#reOmrToolWhite').classList.add('is-on');
      U.el('#reOmrToolPen').classList.remove('is-on');
    });

    // 실제 OMR처럼 사인펜으로 칠한 칸은 같은 칸을 다시 눌러도 지워지지
    // 않는다 — 지우려면 수정테이프 도구로 바꿔서 지금 칠해진 칸을 눌러야
    // 한다(js/omr.js 의 setTool('white') 과 완전히 같은 규칙).
    U.el('#roundOmr').addEventListener('click', e => {
      if (roundLocked()) return;
      const btn = e.target.closest('.bub');
      if (!btn) return;
      const no = +btn.dataset.q, slot = btn.dataset.slot, v = +btn.dataset.v;
      const a = S.answers[no];
      if (slot === 'c') a.choice = (reOmrTool === 'white') ? (a.choice === v ? null : a.choice) : v;
      else a.digits[+slot] = (reOmrTool === 'white') ? (a.digits[+slot] === v ? null : a.digits[+slot]) : v;
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
