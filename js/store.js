/* =====================================================================
 * 응시 상태 저장소 (localStorage 로 새로고침에 대비)
 * ===================================================================== */

const Store = (() => {

  const KEY = 'pungam_mogo_v1';

  function blankAnswers() {
    const a = {};
    QUESTIONS.forEach(q => {
      a[q.no] = q.type === 'choice' ? { choice: null } : { digits: [null, null, null] };
    });
    return a;
  }

  function blank() {
    return {
      version: 1,
      phase: 'intro',                 // intro | identity | exam | done
      student: { id: '', name: '', noId: false },   // noId: 풍암고 재학생이 아니라 학번이 없는 경우
      idMarks: new Array(CONFIG.idDigits).fill(null),
      answers: blankAnswers(),
      current: 1,
      startedAt: null,
      endAt: null,
      elapsedUsed: 0,
      strokes: {},                    // { 문항번호: [stroke, ...] }
      verifyStrokes: [],
      fingerDraw: false,
      warned: [],
      result: null
    };
  }

  let state = blank();

  /* 다른 모듈이 Store.s 를 미리 붙잡고 있으므로 객체를 갈아끼우지 않고 내용만 바꾼다 */
  function replace(next) {
    Object.keys(state).forEach(k => { delete state[k]; });
    Object.assign(state, next);
  }

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return false;
      const s = JSON.parse(raw);
      if (!s || s.version !== 1) return false;
      // 문항 구성이 바뀐 경우를 대비해 답안 칸을 보정
      const fresh = blankAnswers();
      Object.keys(fresh).forEach(k => { if (s.answers && s.answers[k]) fresh[k] = s.answers[k]; });
      s.answers = fresh;
      s.strokes = s.strokes || {};
      s.warned = s.warned || [];
      replace(s);
      return true;
    } catch (e) { return false; }
  }

  let saveTimer = null;
  function save(now) {
    clearTimeout(saveTimer);
    const run = () => {
      try { localStorage.setItem(KEY, JSON.stringify(state)); }
      catch (e) {
        // 용량 초과 시 필기 데이터를 버리고 답안만이라도 지킨다
        try {
          const light = Object.assign({}, state, { strokes: {}, verifyStrokes: [] });
          localStorage.setItem(KEY, JSON.stringify(light));
        } catch (e2) { /* 저장 포기 */ }
      }
    };
    if (now) run(); else saveTimer = setTimeout(run, 400);
  }

  function reset() {
    replace(blank());
    try { localStorage.removeItem(KEY); } catch (e) { }
  }

  /* 마킹된 답 읽기 → 정수 또는 null */
  function readAnswer(no) {
    const q = getQuestion(no);
    const a = state.answers[no];
    if (!a) return null;
    if (q.type === 'choice') return a.choice == null ? null : a.choice;
    // 자리 표기 원칙: 가장 왼쪽 표기 칸부터가 그 수의 자릿수이고,
    // 그 뒤의 빈 칸은 0 으로 읽는다. (앞쪽 빈 칸은 무시)
    const d = a.digits;
    const first = d.findIndex(x => x != null);
    if (first < 0) return null;
    let n = 0;
    for (let i = first; i < d.length; i++) n = n * 10 + (d[i] == null ? 0 : d[i]);
    return n;
  }

  function isMarked(no) { return readAnswer(no) !== null; }

  function markedCount() {
    return QUESTIONS.filter(q => isMarked(q.no)).length;
  }

  function studentIdText() {
    return state.idMarks.map(d => (d == null ? '·' : d)).join('');
  }

  /* 잠금 해제 전에는 QUESTIONS 가 비어 있어 state.answers 도 빈 채로 만들어진다.
     비밀번호 확인 후 실제 QUESTIONS 가 채워지면 gate.js 가 이 함수로
     state 내용을 다시 만든다. replace() 를 써서 객체 참조는 그대로 유지한다
     (App.S 등 다른 모듈이 이미 이 참조를 붙잡고 있으므로). */
  function reinitBlank() { replace(blank()); }

  return {
    get s() { return state; },
    load, save, reset, readAnswer, isMarked, markedCount, studentIdText, blank, reinitBlank
  };
})();
