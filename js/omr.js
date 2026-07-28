/* =====================================================================
 * OMR 답안지
 *  - 수학 영역 답안지(노랑)의 구성을 따르되, 답란을 단답형 중심으로 재배치
 *  - mode : 'identity' (인적사항만) | 'exam' (답란 마킹) | 'locked' (열람 전용)
 * ===================================================================== */

/* 스캐너 맞춤선(타이밍 마크). 실제 인쇄된 답안지처럼 막대 폭·간격이 저마다
   다르게 보이도록, 고정 시드 의사난수로 한 번만 계산해 모든 답안지가
   똑같은 배치를 쓰게 한다(새로고침마다 바뀌면 오히려 인쇄물답지 않다).
   좌표를 정수 px로 반올림해 경계가 흐려 보이지 않게 하고, 한 주기(PERIOD)가
   끝나는 지점과 시작 지점이 맞물리는 repeating-linear-gradient로 만들어
   화면 폭이 얼마든(세로로 세운 좁은 화면 포함) 오른쪽 끝이 중간에 잘리지
   않고 항상 막대 하나가 딱 맞게 끝나도록 한다. */
const OMR_PUNCH_BG = (function () {
  let seed = 20260726;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const stops = [];
  let x = 0;
  const PERIOD = 600;
  let sinceBreak = 0;
  let nextBreakAt = 4 + Math.floor(rand() * 5);   // 실제 답안지처럼 4~8개씩 뭉쳐 보이도록
  while (true) {
    const barW = Math.round(5 + rand() * 4);      // 5~9px — 굵고 긴 막대
    // 뭉치(cluster) 안에서는 촘촘하게, 뭉치 사이에는 크게 띄운다
    const isBreak = sinceBreak >= nextBreakAt;
    const gap = isBreak ? Math.round(46 + rand() * 60) : Math.round(9 + rand() * 12);
    if (isBreak) { sinceBreak = 0; nextBreakAt = 4 + Math.floor(rand() * 5); } else { sinceBreak++; }
    const x2 = x + barW;
    if (x2 + gap >= PERIOD) {
      stops.push('#1B1B1B ' + x + 'px', '#1B1B1B ' + Math.min(x2, PERIOD) + 'px',
        'transparent ' + Math.min(x2, PERIOD) + 'px', 'transparent ' + PERIOD + 'px');
      break;
    }
    stops.push('#1B1B1B ' + x + 'px', '#1B1B1B ' + x2 + 'px',
      'transparent ' + x2 + 'px', 'transparent ' + (x2 + gap) + 'px');
    x = x2 + gap;
  }
  return 'repeating-linear-gradient(90deg,' + stops.join(',') + ')';
})();

function buildSheet(host, mode) {

  const S = Store.s;
  let tool = 'pen';                 // pen | white
  let verifyInk = null;

  /* ---------------- 마크업 ---------------- */

  function bubble(label, q, slot, val) {
    return '<button type="button" class="bub" data-q="' + q + '" data-slot="' + slot + '" data-v="' + val + '">' +
      '<span>' + label + '</span></button>';
  }

  function idColumn(i, digits) {
    let rows = '';
    digits.forEach(d => { rows += '<div class="idrow">' + bubble(d, 'ID', i, d) + '</div>'; });
    return '<div class="idcol" data-idcol="' + i + '">' + rows + '</div>';
  }

  /* 학년·반·번호를 답란의 문항 칸(qcol)처럼 각각 라벨 헤더를 가진 작은
     상자 하나로 묶는다. 실제 답안지에 있던 "–" 구분선 대신, 상자 테두리
     자체로 묶음을 구분한다. */
  function idBlock() {
    let cursor = 0;
    const groups = CONFIG.idGroups.map((g, gi) => {
      const digits = (CONFIG.idGroupDigits && CONFIG.idGroupDigits[gi]) || [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
      let inner = '';
      for (let k = 0; k < g; k++) { inner += idColumn(cursor, digits); cursor++; }
      return '<div class="idgroup">' +
        '<div class="idgroup__hd">' + CONFIG.idGroupLabels[gi] + '</div>' +
        '<div class="idgroup__body">' + inner + '</div>' +
      '</div>';
    }).join('');
    return '<div class="idcols">' + groups + '</div>';
  }

  function ansColumn(q) {
    const head = '<div class="qcol__hd">' + q.no + '번</div>';

    if (q.type === 'choice') {
      let rows = '';
      for (let v = 1; v <= 5; v++) {
        rows += '<div class="crow">' + bubble(v, q.no, 'c', v) + '</div>';
      }
      return '<div class="qcol qcol--choice" data-qcol="' + q.no + '">' + head +
        '<div class="qcol__sub"><span class="s1">답</span></div>' +
        '<div class="qcol__body qcol__body--choice">' + rows + '</div></div>';
    }

    let rows = '';
    for (let d = 0; d <= 9; d++) {
      const hun = d === 0 ? '<span class="dcell dcell--blank"></span>' : '<span class="dcell">' + bubble(d, q.no, 0, d) + '</span>';
      const ten = '<span class="dcell">' + bubble(d, q.no, 1, d) + '</span>';
      const one = '<span class="dcell">' + bubble(d, q.no, 2, d) + '</span>';
      rows += '<div class="drow">' + hun + ten + one + '</div>';
    }
    return '<div class="qcol" data-qcol="' + q.no + '">' + head +
      '<div class="qcol__sub"><span>백</span><span>십</span><span>일</span></div>' +
      '<div class="qcol__body">' + rows + '</div></div>';
  }

  function markup() {
    const grid = QUESTIONS.map(ansColumn).join('');
    const choiceNos = QUESTIONS.filter(q => q.type === 'choice').map(q => q.no).join(' · ');

    return '' +
    '<div class="omr">' +
      '<div class="omr__punch" style="background-image:' + OMR_PUNCH_BG + '"></div>' +

      '<div class="omr__head">' +
        '<div class="omr__headL">' +
          '<div class="omr__doc">' + CONFIG.examTitle + ' 답안지</div>' +
          '<div class="omr__area"><span class="omr__period">' + CONFIG.period + '</span>교시 <b>' + CONFIG.areaName + '</b></div>' +
        '</div>' +
        '<div class="omr__headR">' +
          '<p>※ 답안 표기는 반드시 검은색 컴퓨터용 사인펜(화면의 사인펜 도구)만을 사용하십시오.</p>' +
          '<p>※ 표기한 칸을 지울 때에는 수정 테이프 도구를 선택한 뒤 해당 칸을 누르십시오.</p>' +
        '</div>' +
      '</div>' +

      '<div class="omr__top">' +
        '<div class="omr__info">' +

          '<div class="obox obox--absent">' +
            '<div class="obox__hd">결시자 확인 <span class="obox__note">(수험생은 표기하지 말 것)</span></div>' +
            '<div class="obox__bd absent">' +
              '<span class="absent__txt">감독관이 결시 여부를 확인하고 표기</span>' +
              '<span class="absent__circle"></span>' +
            '</div>' +
          '</div>' +

          '<div class="obox obox--verify">' +
            '<div class="obox__hd">필적 확인란</div>' +
            '<div class="obox__bd verify">' +
              '<div class="verify__top">' +
                '<span class="verify__phrase">' + CONFIG.verifyPhrase + '</span>' +
                '<button type="button" class="verify__clear" id="verifyClear">지우기</button>' +
              '</div>' +
              '<canvas class="verify__canvas" id="verifyCanvas"></canvas>' +
            '</div>' +
            '<div class="obox__foot">위 문구를 아래 칸에 정자로 직접 쓰십시오.</div>' +
          '</div>' +

          '<div class="obox obox--name">' +
            '<div class="obox__hd">성 명</div>' +
            '<div class="obox__bd">' +
              '<input class="wfield" id="nameField" type="text" maxlength="12" placeholder="실명을 입력하십시오" autocomplete="off" spellcheck="false">' +
              '<div class="wfield__note">본인확인을 위해 반드시 <b>실명</b>으로 작성하십시오.</div>' +
            '</div>' +
            '<div class="obox__hd obox__hd--rule">학 번</div>' +
            '<div class="obox__bd">' +
              '<div class="idhead">' +
                '<input class="wfield wfield--num" id="idField" type="text" inputmode="numeric" maxlength="' + CONFIG.idDigits + '" placeholder="' + '0'.repeat(CONFIG.idDigits) + '" autocomplete="off">' +
                '<button type="button" class="idskip" id="idSkipBtn">비재학생 (학번 없음)</button>' +
              '</div>' +
              idBlock() +
            '</div>' +
          '</div>' +

          '<div class="obox obox--form">' +
            '<div class="obox__hd">문 형</div>' +
            '<div class="obox__bd formbox">' +
              '<span class="formbox__row"><i class="bub bub--static is-on"></i> 홀수형</span>' +
              '<span class="formbox__row"><i class="bub bub--static"></i> 짝수형</span>' +
              '<span class="formbox__note">본 시험은 홀수형 한 종류입니다.</span>' +
            '</div>' +
          '</div>' +

          '<div class="obox obox--sup">' +
            '<div class="obox__hd">감독관 확인 <span class="obox__note">(수험생은 표기하지 말 것)</span></div>' +
            '<div class="obox__bd sup">본인 여부, 학번 및 문형의 표기가 정확한지 확인, 옆란에 서명 또는 날인' +
              '<span class="sup__sign">' +
                '<span class="sup__signHint">서명 또는 날인</span>' +
                /* 실제 인장체 글꼴(HJ한전서B)로 "김민 / 수인" 을 미리 그려 둔
                   이미지. 이 폰트는 브라우저 웹폰트 검증기를 통과하지 못해
                   실시간으로 불러 쓸 수 없어서, 폰트가 설치된 이 PC에서 캔버스로
                   한 번 렌더링해 img/seal_gimminsu.png 로 구워 두었다 — 기기나
                   폰트 설치 여부와 무관하게 항상 같은 모양으로 찍힌다. */
                '<span class="sup__seal">' +
                  '<img class="sup__sealImg" src="img/seal_gimminsu.png" alt="감독관 ' + CONFIG.supervisor + ' 날인">' +
                '</span>' +
              '</span>' +
            '</div>' +
          '</div>' +

        '</div>' +

        '<div class="omr__guide">' +
          '<div class="obox obox--guide">' +
            '<div class="obox__hd">※ 단답형 답란 표기방법</div>' +
            '<div class="obox__bd guide">' +
              '<ul class="guide__list">' +
                '<li>십진법에 의하되, 반드시 자리에 맞추어 표기</li>' +
                '<li>정답이 한 자리인 경우 일의 자리에만 표기하거나, 십의 자리에 ' + U.circ(0) + '을 표기하고 일의 자리에 표기</li>' +
              '</ul>' +
              '<div class="guide__ex">' +
                '<div class="guide__exHd">※ 예시</div>' +
                '<div class="guide__row"><span class="tagbox">정답 <b>100</b></span> → 백의 자리 ' + U.circ(1) + ', 십의 자리 ' + U.circ(0) + ', 일의 자리 ' + U.circ(0) + '</div>' +
                '<div class="guide__row"><span class="tagbox">정답 <b>98</b></span> → 십의 자리 ' + U.circ(9) + ', 일의 자리 ' + U.circ(8) + '</div>' +
                '<div class="guide__row"><span class="tagbox">정답 <b>5</b></span> → 일의 자리 ' + U.circ(5) + ' 또는 십의 자리 ' + U.circ(0) + ', 일의 자리 ' + U.circ(5) + '</div>' +
              '</div>' +
              '<div class="guide__note">※ ' + choiceNos + '번은 5지선다형이므로 해당 답란의 ' + U.circ(1) + '~' + U.circ(5) + ' 중 하나만 표기하십시오.</div>' +
              '<div class="guide__note">※ 모든 단답형의 답은 세 자리 이하의 수입니다.</div>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>' +

      '<div class="omr__ans">' +
        '<div class="omr__ansHd">답 란</div>' +
        '<div class="ansgrid" id="ansGrid">' + grid + '</div>' +
        '<div class="ansveil" id="ansVeil"><span>답란은 시험이 시작된 뒤에 표기할 수 있습니다.</span></div>' +
      '</div>' +

    '</div>';
  }

  /* ---------------- 렌더 ---------------- */

  host.innerHTML = markup();
  const root = host.querySelector('.omr');
  const nameField = host.querySelector('#nameField');
  const idField = host.querySelector('#idField');
  const idSkipBtn = host.querySelector('#idSkipBtn');
  const ansGrid = host.querySelector('#ansGrid');

  /* 필적 확인란 캔버스 */
  let refitVerify = () => {};
  (function setupVerify() {
    const cv = host.querySelector('#verifyCanvas');
    if (!cv) return;
    verifyInk = createInk(cv);
    let verifyLoaded = false;
    const fit = () => {
      const r = cv.parentElement.getBoundingClientRect();
      if (r.width < 10) return;                       // 화면에 붙기 전에는 건너뛴다
      const w = Math.max(120, r.width - 2), h = 54;
      if (!verifyLoaded) {
        // 저장된 필기는 한 번만 불러온다. 이후 크기 변화는 resizeTo 로
        // 상대적 위치를 유지한 채 다시 늘리고 줄인다(가로/세로 전환 대비).
        verifyInk.setSize(w, h);
        verifyInk.load(S.verifyStrokes);
        verifyLoaded = true;
      } else {
        verifyInk.resizeTo(w, h);
      }
    };
    refitVerify = () => { fit(); requestAnimationFrame(fit); };
    refitVerify();
    window.addEventListener('resize', refitVerify);

    /* 필적 확인란은 인적사항 작성 중에만 쓸 수 있다. 시험이 시작된 뒤에는
       (mode === 'exam') 실제 답안지처럼 더 이상 손댈 수 없어야 한다. */
    let drawing = false;

    // Excalidraw 의 실제 수정을 그대로 옮긴 것(PR #4705, onTapStart, 커밋 7049e2a).
    // 그리기 로직이 있는 pointerdown 이 아니라, 별도로 붙인 이 touchstart 리스너
    // 맨 첫 줄에서만 preventDefault() 를 불러야 iOS Scribble 을 실제로 이긴다.
    cv.addEventListener('touchstart', e => {
      // fix for Apple Pencil Scribble
      e.preventDefault();
    }, { passive: false });

    cv.addEventListener('pointerdown', e => {
      if (mode !== 'identity') return;
      const r = cv.getBoundingClientRect();
      drawing = true;
      verifyInk.begin(e.clientX - r.left, e.clientY - r.top, e.pressure || 0.5);
      try { cv.setPointerCapture(e.pointerId); } catch (err) { /* 캡처 실패해도 필기는 이어진다 */ }
    });
    cv.addEventListener('pointermove', e => {
      e.preventDefault();
      if (!drawing) return;
      const r = cv.getBoundingClientRect();
      U.penEvents(e).forEach(ev => verifyInk.extend(ev.clientX - r.left, ev.clientY - r.top, ev.pressure || 0.5));
    });
    const stop = () => {
      if (!drawing) return;
      drawing = false;
      verifyInk.end();
      S.verifyStrokes = verifyInk.dump();
      S.verifyStrokeSize = verifyInk.size();
      Store.save();
    };
    cv.addEventListener('pointerup', stop);
    cv.addEventListener('pointercancel', stop);
    cv.addEventListener('pointerleave', stop);

    const clr = host.querySelector('#verifyClear');
    if (clr) clr.addEventListener('click', () => {
      if (mode !== 'identity') return;
      verifyInk.clear(); S.verifyStrokes = []; Store.save();
    });
  })();

  /* ---------------- 상태 반영 ---------------- */

  /* 답안지(root)는 인적사항 화면 → 시험 화면으로 옮겨 다니므로,
     빌드 시점에 캡처한 host 가 아니라 반드시 root 안에서 찾아야 한다.
     (host 로 찾으면 답안지가 옮겨간 뒤 아무것도 칠해지지 않는다) */
  function paint() {
    // 학번 마킹
    root.querySelectorAll('.bub[data-q="ID"]').forEach(b => {
      const i = +b.dataset.slot, v = +b.dataset.v;
      b.classList.toggle('is-on', S.idMarks[i] === v);
    });
    // 답란 마킹
    QUESTIONS.forEach(q => {
      const a = S.answers[q.no];
      const col = root.querySelector('[data-qcol="' + q.no + '"]');
      if (!col) return;
      col.querySelectorAll('.bub').forEach(b => {
        const slot = b.dataset.slot, v = +b.dataset.v;
        const on = slot === 'c' ? a.choice === v : a.digits[+slot] === v;
        b.classList.toggle('is-on', on);
      });
      col.classList.toggle('is-filled', Store.isMarked(q.no));
    });
    if (nameField) nameField.value = S.student.name || '';
    if (idField) idField.value = S.idMarks.map(d => (d == null ? '' : d)).join('');
    paintSeal();
    paintNoId();
  }

  /* 재학생이 아니어서 학번이 없는 경우 — 학번 입력을 통째로 비활성화하고
     입력칸에는 안내 문구를 대신 보여 준다. */
  function paintNoId() {
    if (!idSkipBtn) return;
    const noId = !!S.student.noId;
    root.classList.toggle('is-noid', noId);
    idSkipBtn.classList.toggle('is-on', noId);
    idSkipBtn.textContent = noId ? '학번 입력으로 되돌리기' : '비재학생 (학번 없음)';
    if (idField) {
      idField.readOnly = (mode !== 'identity') || noId;
      idField.placeholder = noId ? '해당 없음' : '0'.repeat(CONFIG.idDigits);
    }
  }

  /* 감독관 날인 — 인적사항 작성을 마치고 시험이 시작된 뒤에 찍힌다.
     (startedAt 은 '작성 완료 · 시험 시작' 을 확인한 순간에만 채워진다)
     mode 도 함께 확인해야 한다: 이전 회차에서 이미 시작해 startedAt 이 남아 있는
     상태로 인적사항 화면(mode === 'identity')에 다시 들어오는 경우, 아직 아무것도
     적지 않았는데 도장이 미리 찍혀 보이는 문제가 있었다. */
  function paintSeal() {
    root.classList.toggle('is-signed', S.startedAt != null && mode !== 'identity');
  }

  /* ---------------- 입력 ---------------- */

  function applyBubble(btn) {
    if (mode === 'locked') return;
    const qs = btn.dataset.q;
    const slot = btn.dataset.slot;
    const v = +btn.dataset.v;

    if (qs === 'ID') {
      if (mode !== 'identity') { U.toast('학번은 시험 시작 전에만 표기할 수 있습니다.'); return; }
      const i = +slot;
      S.idMarks[i] = (tool === 'white') ? (S.idMarks[i] === v ? null : S.idMarks[i]) : v;
      S.student.id = S.idMarks.every(d => d != null) ? S.idMarks.join('') : '';
    } else {
      if (mode !== 'exam') { U.toast('답란은 시험 중에만 표기할 수 있습니다.'); return; }
      const no = +qs;
      const a = S.answers[no];
      if (slot === 'c') {
        a.choice = (tool === 'white') ? (a.choice === v ? null : a.choice) : v;
      } else {
        const i = +slot;
        a.digits[i] = (tool === 'white') ? (a.digits[i] === v ? null : a.digits[i]) : v;
      }
    }
    paint();
    Store.save();
    if (typeof window.onOmrChange === 'function') window.onOmrChange();
  }

  root.addEventListener('click', e => {
    const btn = e.target.closest('.bub');
    if (!btn || btn.classList.contains('bub--static')) return;
    applyBubble(btn);
  });

  if (nameField) {
    nameField.readOnly = (mode !== 'identity');
    nameField.addEventListener('input', () => {
      S.student.name = nameField.value.replace(/\s+/g, ' ').trimStart();
      Store.save();
    });
  }
  if (idField) {
    idField.readOnly = (mode !== 'identity');
    idField.addEventListener('input', () => {
      const digits = idField.value.replace(/\D/g, '').slice(0, CONFIG.idDigits);
      idField.value = digits;
      for (let i = 0; i < CONFIG.idDigits; i++) S.idMarks[i] = i < digits.length ? +digits[i] : null;
      S.student.id = digits.length === CONFIG.idDigits ? digits : '';
      paint();
      Store.save();
    });
  }
  if (idSkipBtn) {
    idSkipBtn.addEventListener('click', () => {
      if (mode !== 'identity') return;
      S.student.noId = !S.student.noId;
      if (S.student.noId) {
        // 학번칸을 비우고 되돌아갈 때 다시 처음부터 표기하게 한다
        S.idMarks = new Array(CONFIG.idDigits).fill(null);
        S.student.id = '';
      }
      paint();
      Store.save();
    });
  }

  function setMode(m) {
    mode = m;
    root.classList.toggle('is-identity', m === 'identity');
    root.classList.toggle('is-exam', m === 'exam');
    root.classList.toggle('is-locked', m === 'locked');
    if (nameField) nameField.readOnly = (m !== 'identity');
    paintNoId();
  }

  function setTool(t) { tool = t; root.classList.toggle('is-white', t === 'white'); }

  setMode(mode);
  paint();

  return { refresh: paint, setMode, setTool, refit: () => refitVerify(), root };
}
