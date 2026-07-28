/* =====================================================================
 * 채점 및 결과
 * ===================================================================== */

const Result = (() => {

  const S = Store.s;

  function show(v, type) {
    if (v == null) return '<span class="blank">무응답</span>';
    return type === 'choice' ? U.CIRCLED[v] : String(v);
  }

  function grade() {
    const rows = QUESTIONS.map(q => {
      const mine = Store.readAnswer(q.no);
      const ok = mine !== null && mine === q.answer;
      return { no: q.no, points: q.points, author: q.author, type: q.type, answer: q.answer, mine, ok };
    });
    const score = rows.reduce((s, r) => s + (r.ok ? r.points : 0), 0);
    const right = rows.filter(r => r.ok).length;
    const blank = rows.filter(r => r.mine === null).length;
    const wrong = rows.length - right - blank;

    const byAuthor = {};
    rows.forEach(r => {
      const a = byAuthor[r.author] || (byAuthor[r.author] = { n: 0, ok: 0, pt: 0, ptOk: 0 });
      a.n++; a.pt += r.points;
      if (r.ok) { a.ok++; a.ptOk += r.points; }
    });

    const byPoint = {};
    rows.forEach(r => {
      const b = byPoint[r.points] || (byPoint[r.points] = { n: 0, ok: 0 });
      b.n++; if (r.ok) b.ok++;
    });

    const used = S.startedAt ? Math.min(Date.now(), S.endAt || Date.now()) - S.startedAt : 0;

    return { rows, score, right, wrong, blank, byAuthor, byPoint, used, at: Date.now() };
  }

  function render(res) {
    const root = U.el('#resultRoot');
    const pct = Math.round(res.score / CONFIG.totalScore * 100);

    // 정답 자체는 화면에 내지 않는다(미리 유포될 위험). 채점은 하되 맞았는지
    // 여부(O/X)와 자신이 쓴 답까지만 보여준다.
    const table = res.rows.map(r =>
      '<tr class="' + (r.ok ? 'ok' : (r.mine === null ? 'na' : 'no')) + '">' +
        '<td class="c">' + r.no + '</td>' +
        '<td class="c">' + r.points + '</td>' +
        '<td>' + r.author + '</td>' +
        '<td class="c">' + show(r.mine, r.type) + '</td>' +
        '<td class="c mark">' + (r.ok ? 'O' : (r.mine === null ? '/' : 'X')) + '</td>' +
      '</tr>').join('');

    const authorRows = CONFIG.authors.map(a => {
      const st = res.byAuthor[a.name];
      if (!st) return '';
      const p = Math.round(st.ok / st.n * 100);
      return '<div class="statrow">' +
        '<span class="statrow__name">' + a.name + '</span>' +
        '<span class="statrow__bar"><i style="width:' + p + '%"></i></span>' +
        '<span class="statrow__num">' + st.ok + ' / ' + st.n + '문항 · ' + st.ptOk + '점</span>' +
      '</div>';
    }).join('');

    const pointRows = [2, 3, 4].map(p => {
      const st = res.byPoint[p];
      if (!st) return '';
      const r = Math.round(st.ok / st.n * 100);
      return '<div class="statrow">' +
        '<span class="statrow__name">' + p + '점</span>' +
        '<span class="statrow__bar"><i style="width:' + r + '%"></i></span>' +
        '<span class="statrow__num">' + st.ok + ' / ' + st.n + '문항</span>' +
      '</div>';
    }).join('');

    const wrongList = res.rows.filter(r => !r.ok);
    const wrongText = wrongList.length
      ? wrongList.map(r => r.no).join(', ') + '번'
      : '없습니다. 전 문항을 맞혔습니다.';

    root.innerHTML =
      '<div class="rwrap">' +
        '<header class="rhead">' +
          '<p class="rhead__eyebrow">' + CONFIG.examTitle + ' · ' + CONFIG.areaName + '</p>' +
          '<h1 class="rhead__title">채점 결과</h1>' +
          '<p class="rhead__who">' + (S.student.name || '이름 미기재') + ' · 학번 ' +
            (S.student.noId ? '해당 없음(비재학생)' : (S.student.id || Store.studentIdText())) + '</p>' +
        '</header>' +

        '<section class="rscore">' +
          '<div class="rscore__main">' +
            '<span class="rscore__num">' + res.score + '</span>' +
            '<span class="rscore__den">/ ' + CONFIG.totalScore + '</span>' +
          '</div>' +
          '<div class="rscore__bar"><i style="width:' + pct + '%"></i></div>' +
          '<div class="rscore__meta">' +
            '<span><b>' + res.right + '</b>문항 정답</span>' +
            '<span><b>' + res.wrong + '</b>문항 오답</span>' +
            '<span><b>' + res.blank + '</b>문항 무응답</span>' +
            '<span>소요 시간 <b>' + U.durationText(res.used) + '</b></span>' +
          '</div>' +
        '</section>' +

        '<section class="rcards">' +
          '<article class="rcard">' +
            '<h2 class="rcard__title">출제자별 정답 현황</h2>' +
            '<div class="stats">' + authorRows + '</div>' +
          '</article>' +
          '<article class="rcard">' +
            '<h2 class="rcard__title">배점별 정답 현황</h2>' +
            '<div class="stats">' + pointRows + '</div>' +
            '<div class="rcard__note"><b>다시 볼 문항</b><br>' + wrongText + '</div>' +
          '</article>' +
        '</section>' +

        '<section class="rcard rcard--wide">' +
          '<h2 class="rcard__title">전체 응시자 점수 분포</h2>' +
          '<div class="scorechart-host" id="scoreChartHost"><p class="scorechart__empty">불러오는 중…</p></div>' +
        '</section>' +

        '<section class="rcard rcard--table">' +
          '<h2 class="rcard__title">문항별 채점표</h2>' +
          '<div class="rtable-wrap">' +
            '<table class="rtable">' +
              '<thead><tr><th class="c">번호</th><th class="c">배점</th><th>출제자</th><th class="c">내 답</th><th class="c">채점</th></tr></thead>' +
              '<tbody>' + table + '</tbody>' +
            '</table>' +
          '</div>' +
        '</section>' +

        '<footer class="rfoot">' +
          '<button class="btn btn--outline" id="btnReview" type="button">문제지 다시 보기</button>' +
          '<button class="btn btn--outline" id="btnSheet" type="button">내 답안지 보기</button>' +
          '<button class="btn btn--outline" id="btnRestart" type="button">처음으로</button>' +
        '</footer>' +
      '</div>';

    U.el('#btnReview').addEventListener('click', () => App.reviewPaper());
    U.el('#btnSheet').addEventListener('click', () => App.reviewSheet());
    U.el('#btnRestart').addEventListener('click', async () => {
      const ok = await U.modal({
        title: '처음으로',
        body: '<p>자신의 결과를 다시 확인할 수 없습니다. 계속하시겠습니까?</p>',
        buttons: [{ label: '취소', value: false }, { label: '처음으로', value: true, kind: 'danger' }]
      });
      if (ok) { Store.reset(); location.reload(); }
    });

    loadScoreChart(res.score);
  }

  function loadScoreChart(mineScore) {
    const host = U.el('#scoreChartHost');
    if (!host) return;
    if (!Remote.enabled) { host.innerHTML = '<p class="scorechart__empty">순위 정보를 사용할 수 없습니다.</p>'; return; }
    Remote.fetchScores().then(r => {
      host.innerHTML = r.ok
        ? U.scoreChart(r.scores, mineScore)
        : '<p class="scorechart__empty">순위 정보를 불러오지 못했습니다.</p>';
    });
  }

  return { grade, render };
})();
