/* =====================================================================
 * Firebase 연동 — 중복 응시 확인 · 채점 결과 저장
 *
 * ⚠️ 실제로 쓰려면 아래 FIREBASE_CONFIG 를 본인의 Firebase 프로젝트 설정
 *    값으로 채워야 한다(Firebase 콘솔 → 프로젝트 설정 → 일반 → 내 앱 →
 *    SDK 설정 및 구성 에서 그대로 복사). 비워 두면(placeholder 그대로면)
 *    Remote.enabled 가 false 로 유지되어 중복 확인·결과 저장을 그냥
 *    건너뛰고 시험 자체는 평소처럼 동작한다(즉, 설정 전이라고 앱이
 *    멈추지는 않는다).
 *
 *    Firestore 보안 규칙도 함께 설정해야 한다. 클라이언트에서 로그인 없이
 *    바로 쓰기 때문에, 최소한 "이미 있는 문서는 덮어쓰지 못하게" 막아야
 *    클라이언트 쪽 중복 확인을 우회해도 실제로 재응시 데이터가 남지 않는다:
 *
 *    rules_version = '2';
 *    service cloud.firestore {
 *      match /databases/{database}/documents {
 *        match /submissions/{docId} {
 *          allow read: if true;
 *          allow create: if !exists(/databases/$(database)/documents/submissions/$(docId));
 *          allow update, delete: if false;
 *
 *          // 필기는 이 문서 안에 넣지 않고(획이 많으면 문서 하나가 Firestore
 *          // 1MiB 한도를 넘어 저장이 통째로 실패했었다), 크기로 나눠 이
 *          // 서브컬렉션에 여러 문서로 저장한다(js/remote.js saveStrokeChunks
 *          // 참고). 위 submissions/{docId} 규칙은 그 문서 자체에만 적용되고
 *          // 서브컬렉션엔 적용되지 않으므로 별도로 열어 줘야 한다.
 *          match /strokeChunks/{chunkId} {
 *            allow read: if true;
 *            allow create: if exists(/databases/$(database)/documents/submissions/$(docId));
 *            allow update, delete: if false;
 *          }
 *        }
 *        match /scores/{docId} {
 *          allow read: if true;
 *          allow create: if true;
 *          allow update, delete: if false;
 *        }
 *
 *        // 응시 시작 시각 표시(관리자 대시보드의 "현재 응시 중" 목록용).
 *        // 최종 채점 결과가 아니라 살아있는 상태 표시일 뿐이라, submissions 와
 *        // 달리 자유롭게 쓰고 지울 수 있게 둔다(응시 종료 시 클라이언트가
 *        // 스스로 지운다 — js/remote.js clearInProgress 참고).
 *        match /inProgress/{docId} {
 *          allow read: if true;
 *          allow write: if true;
 *        }
 *      }
 *    }
 *
 *    ⚠️ 기존에 이미 배포한 프로젝트라면 콘솔의 규칙을 위처럼 갱신해야 한다.
 *    strokeChunks 규칙 없이는 필기 조각 쓰기가 전부 permission-denied 로
 *    막힌다(점수·답안은 submissions/{docId} 규칙 그대로라 계속 저장된다).
 * ===================================================================== */

const FIREBASE_CONFIG = {
  apiKey: "AIzaSyDwE7tIeJgd9j41Seh3fzOGMqYock_vb00",
  authDomain: "pungam-mogo.firebaseapp.com",
  projectId: "pungam-mogo",
  storageBucket: "pungam-mogo.firebasestorage.app",
  messagingSenderId: "525490770931",
  appId: "1:525490770931:web:852e964e2dc13883613886",
  measurementId: "G-JYQ7WH1TR3"
};

const Remote = (() => {

  const COLLECTION = 'submissions';
  const SCORES_COLLECTION = 'scores';   // 익명 점수 분포 조회용(이름·학번 없음) — 결과 화면에서 가볍게 불러오려고 따로 둔다
  const IN_PROGRESS_COLLECTION = 'inProgress';   // 응시 시작 시각 표시(관리자 대시보드 "현재 응시 중" 목록용)
  const STROKE_CHUNK_COLLECTION = 'strokeChunks';   // submissions/{key}/strokeChunks/{i} — 필기를 안전한 크기로 쪼개 저장하는 서브컬렉션

  /* 회차(Day 01~06) 배포용 컬렉션 — 기존 단일 200분 시험의 submissions/scores/
     inProgress 는 절대 건드리지 않고, 완전히 별도의 컬렉션에 회차별 제출을
     쌓는다. 문서 키는 "학번 또는 이름 문서키" + "__" + 회차key(r1~r6) 라서
     같은 학생이 회차마다 각각 한 번씩만 제출할 수 있다(문서 생성 규칙으로
     재제출 차단 — 아래 보안 규칙 참고).
     Firestore 콘솔에 아래 규칙을 추가해야 실제로 저장된다:
       match /roundSubmissions/{docId} {
         allow read: if true;
         allow create: if !exists(/databases/$(database)/documents/roundSubmissions/$(docId));
         allow update, delete: if false;
         match /strokeChunks/{chunkId} {
           allow read: if true;
           allow create: if exists(/databases/$(database)/documents/roundSubmissions/$(docId));
           allow update, delete: if false;
         }
       }
       match /roundScores/{docId} {
         allow read: if true;
         allow create: if true;
         allow update, delete: if false;
       }
       match /roundInProgress/{docId} {
         allow read: if true;
         allow write: if true;
       } */
  const ROUND_COLLECTION = 'roundSubmissions';
  const ROUND_SCORES_COLLECTION = 'roundScores';
  const ROUND_IN_PROGRESS_COLLECTION = 'roundInProgress';
  const CHUNK_BYTE_LIMIT = 700 * 1024;   // Firestore 문서 한도(1MiB)보다 여유를 둔, 청크 하나가 넘지 않을 목표 크기
  let db = null;
  let enabled = false;

  function init() {
    try {
      if (!window.firebase || FIREBASE_CONFIG.apiKey === 'REPLACE_ME') return;
      firebase.initializeApp(FIREBASE_CONFIG);
      db = firebase.firestore();
      enabled = true;
    } catch (e) {
      // 설정이 잘못됐거나 SDK 로드에 실패해도 시험 자체는 계속 진행되어야 한다
      enabled = false;
    }
  }

  function idDocKey(id) { return 'id_' + id; }
  function nameDocKey(name) { return 'name_' + encodeURIComponent(name.trim()); }

  /* Firestore 는 배열 안에 배열을 직접 넣는 것을 허용하지 않는다("Nested arrays
     are not supported"). js/ink.js 의 획은 점을 [x,y,pressure] 배열로, 획 목록을
     그 배열들의 배열로 담고 있어 그대로 보내면 이 제약에 걸려 batch.commit() 이
     통째로 실패한다(그러면 아래 fallback 이 필기를 통째로 빼고 다시 저장해,
     결과적으로 필기가 서버에 하나도 남지 않는다). 점을 {x,y,p} 객체로 바꿔
     배열 중첩을 없앤다. */
  function toFirestoreStrokes(strokes) {
    const out = {};
    Object.keys(strokes || {}).forEach(no => {
      out[no] = (strokes[no] || []).map(s => ({
        p: (s.p || []).map(pt => ({ x: pt[0], y: pt[1], p: pt[2] })),
        b: s.b || null,
        k: s.k === 'erase' ? 'erase' : 'ink'   // 일반 지우개(부분 지우기) 획인지 표시 — admin 필기 재생 시 필요
      }));
    });
    return out;
  }

  /* 필적 확인란 필기는 문항별 필기와 달리 문항 번호로 묶이지 않은 단일 획
     목록이라 toFirestoreStrokes 와 별도로 변환한다(같은 배열 중첩 제약). */
  function toFirestoreStrokeList(strokes) {
    return (strokes || []).map(s => ({
      p: (s.p || []).map(pt => ({ x: pt[0], y: pt[1], p: pt[2] })),
      b: s.b || null,
      k: s.k === 'erase' ? 'erase' : 'ink'
    }));
  }

  /* 필기를 문서 하나(Firestore 1MiB 한도)에 다 담으면 획이 많을수록 그 하나의
     요청이 통째로 실패한다(예전엔 이렇게 실패하면 필기를 전부 버리고 성적만
     다시 저장했다). 문항·획 단위로 잘라 여러 개의 작은 문서로 나눠 담으면
     총 필기량이 얼마든 각 요청은 항상 CHUNK_BYTE_LIMIT 이하로 유지된다. */
  function buildStrokeChunks(strokes, verifyStrokes) {
    const items = [];
    const fsStrokes = toFirestoreStrokes(strokes);
    Object.keys(fsStrokes).forEach(no => {
      fsStrokes[no].forEach(s => items.push({ no, s }));
    });
    toFirestoreStrokeList(verifyStrokes).forEach(s => items.push({ no: '_verify', s }));

    const chunks = [];
    let cur = [], curSize = 2;
    items.forEach(item => {
      const size = JSON.stringify(item).length;
      if (cur.length && curSize + size > CHUNK_BYTE_LIMIT) { chunks.push(cur); cur = []; curSize = 2; }
      cur.push(item);
      curSize += size + 1;
    });
    if (cur.length) chunks.push(cur);
    return chunks.map(parts => ({ parts }));
  }

  async function setWithRetry(ref, data, tries) {
    tries = tries || 2;
    for (let i = 0; i < tries; i++) {
      try { await ref.set(data); return true; }
      catch (e) { if (i === tries - 1) { console.error('[Remote] 필기 조각 저장 실패:', e); return false; } }
    }
    return false;
  }

  /* 청크를 하나씩 순차 저장한다. 여러 개를 동시에 보내면 느린 회선(시험장
     와이파이 등)에서 한꺼번에 타임아웃날 위험이 커지므로, 매 청크가 항상
     작다는 점을 살려 순서대로 안정적으로 보낸다. 일부가 끝내 실패해도
     나머지는 계속 시도하고 성공한 개수를 돌려줘 호출부가 부분 유실 여부를
     알 수 있게 한다 — 이미 저장된 채점 결과는 이 과정과 무관하게 안전하다.
     (실제로 몇 개가 저장됐는지는 admin 이 이 서브컬렉션을 다시 읽어 문서
     개수를 세는 방식으로 확인한다 — submissions/{docId} 문서는 생성 후
     수정할 수 없는 보안 규칙이라, 여기서 성공 개수를 그 문서에 나중에
     써 넣을 수 없다.) */
  async function saveStrokeChunks(collectionName, canonicalKey, chunks) {
    if (!chunks.length) return 0;
    const col = db.collection(collectionName).doc(canonicalKey).collection(STROKE_CHUNK_COLLECTION);
    let saved = 0;
    for (let i = 0; i < chunks.length; i++) {
      if (await setWithRetry(col.doc(String(i)), chunks[i])) saved++;
    }
    return saved;
  }

  /* 학번(있으면) 또는 이름으로 이미 제출된 기록이 있는지 확인한다.
     학번 문서(id_*)와 이름 문서(name_*) 두 곳을 모두 찾아보고
     둘 중 하나라도 있으면 중복으로 본다. */
  async function checkDuplicate({ id, name, noId }) {
    if (!enabled) return { duplicate: false, checked: false };
    try {
      const checks = [];
      if (!noId && id) checks.push(db.collection(COLLECTION).doc(idDocKey(id)).get());
      if (name) checks.push(db.collection(COLLECTION).doc(nameDocKey(name)).get());
      const snaps = await Promise.all(checks);
      const hit = snaps.find(s => s.exists);
      return { duplicate: !!hit, checked: true, data: hit ? hit.data() : null };
    } catch (e) {
      // 네트워크 오류 등으로 확인 자체가 실패한 경우, 정상 응시생을 부당하게
      // 막지 않도록 "중복 아님" 으로 통과시키되 checked:false 로 알려 둔다
      return { duplicate: false, checked: false, error: e };
    }
  }

  /* 채점 결과를 저장한다. 학번 문서·이름 문서 "둘 중 하나(학번이 있으면 학번
     문서)"에만 전체 내용(답안 포함)을 쓴다. 나머지 한쪽엔 중복 응시 확인이
     "그 이름/학번으로도" 걸리도록 존재만 표시하는 가벼운 문서(dup:true,
     실제 답안·필기 없음)만 남긴다 — 예전엔 두 문서 모두에 전체 내용을
     복사해서, 필기가 있는 제출은 저장 용량이 그대로 두 배가 됐었다.

     필기는 이 문서에 함께 담지 않는다. 획이 많아지면 문서 하나가 Firestore
     1MiB 한도를 넘어 커밋이 통째로 실패하던 문제가 있었다(예전엔 그러면
     필기를 전부 버리고 성적만 재저장했다). 그래서 먼저 점수·답안만 담은
     이 작은 문서를 저장해 결과가 항상 안전하게 남게 하고, 필기는 뒤이어
     saveStrokeChunks 로 여러 개의 작은 문서에 나눠 저장한다(획이 얼마나
     많든 각 요청은 항상 안전한 크기 이하로 유지된다). */
  async function saveResult({ id, name, noId, reason, result, strokes, strokeSize, verifyStrokes, verifyStrokeSize }) {
    if (!enabled) return { saved: false };
    const hasId = !noId && !!id;
    const canonicalKey = hasId ? idDocKey(id) : nameDocKey(name);
    const markerKey = hasId && name ? nameDocKey(name) : null;   // 학번이 있고 이름도 있을 때만 필요

    // 청크는 커밋 전에 미리 만들어 개수를 안다 — submissions/{docId} 문서는
    // 생성한 뒤에는 수정할 수 없는 보안 규칙이라, 나중에 "몇 개 저장됐는지"를
    // 이 문서에 덧붙여 쓸 수 없다. 그래서 처음부터 알 수 있는 "총 개수"만
    // 이 문서에 함께 써 두고, "실제로 몇 개가 저장됐는지"는 admin 이
    // strokeChunks 서브컬렉션을 직접 세어 확인한다.
    const chunks = buildStrokeChunks(strokes, verifyStrokes);

    const basePayload = {
      name: name || null,
      id: (!noId && id) ? id : null,
      noId: !!noId,
      score: result.score,
      right: result.right,
      wrong: result.wrong,
      blank: result.blank,
      answers: result.rows.map(r => ({ no: r.no, mine: r.mine, ok: r.ok })),
      usedMs: result.used,
      reason: reason,
      strokeSize: strokeSize || {},
      verifyStrokeSize: verifyStrokeSize || null,
      strokeChunkCount: chunks.length,
      submittedAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    try {
      const batch = db.batch();
      batch.set(db.collection(COLLECTION).doc(canonicalKey), basePayload);
      if (markerKey) {
        batch.set(db.collection(COLLECTION).doc(markerKey), {
          dup: true, id: basePayload.id, name: basePayload.name, noId: basePayload.noId,
          submittedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
      }
      // 이름·학번이 전혀 없는 별도 문서에 점수만 남겨 분포 조회 때 개인 식별 없이 쓴다
      batch.set(db.collection(SCORES_COLLECTION).doc(), { score: result.score });
      await batch.commit();
    } catch (e) {
      // permission-denied 는 이미 제출된 기록이 있어 보안 규칙이 덮어쓰기를
      // 막은 것이다(재응시 방지 · js/remote.js 상단 규칙 참고). 그 외 오류는
      // 이 문서 자체가 작아 사실상 거의 나지 않지만, 나더라도 필기가 원인일
      // 수 없으므로(필기는 아직 담지 않았다) 재시도하지 않고 바로 실패 처리한다.
      console.error('[Remote] 결과 저장 실패:', e);
      return { saved: false, error: e, code: e && e.code };
    }

    // 결과(점수·답안)는 이미 안전하게 저장됐다. 필기는 따로 조각내어 저장하며,
    // 여기서 일부/전부 실패하더라도 위 결과에는 영향이 없다.
    const saved = await saveStrokeChunks(COLLECTION, canonicalKey, chunks);
    return {
      saved: true,
      strokesDropped: chunks.length > 0 && saved === 0,
      strokesPartial: saved > 0 && saved < chunks.length
    };
  }

  /* 실제 200분 시험이 시작되는 순간(카운트다운 직후) 호출한다. 관리자
     대시보드가 이 컬렉션을 읽어 "누가 언제부터 응시 중인지" 실시간으로
     보여준다. 채점 결과가 아니므로 실패해도 시험 진행에는 영향 없다. */
  async function startExam({ id, name, noId }) {
    if (!enabled) return { ok: false };
    const canonicalKey = (!noId && id) ? idDocKey(id) : nameDocKey(name);
    try {
      await db.collection(IN_PROGRESS_COLLECTION).doc(canonicalKey).set({
        name: name || null,
        id: (!noId && id) ? id : null,
        noId: !!noId,
        startedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e };
    }
  }

  /* 시험이 끝나면(제출/시간종료 모두) "현재 응시 중" 표시를 지운다.
     실패해도(네트워크 끊김 등) 채점 결과에는 영향 없다 — 관리자 서버가
     남은 표시를 이미 끝난 submissions 와 대조해 걸러 준다. */
  async function clearInProgress({ id, name, noId }) {
    if (!enabled) return;
    const canonicalKey = (!noId && id) ? idDocKey(id) : nameDocKey(name);
    try { await db.collection(IN_PROGRESS_COLLECTION).doc(canonicalKey).delete(); } catch (e) { /* 무시 */ }
  }

  /* 전체 응시자의 점수만(익명) 가져온다. 순위·분포 그래프용. submissions 전체를
     읽지 않고(필기 데이터까지 포함되어 무거워졌다) 점수만 담은 가벼운
     scores 컬렉션에서 바로 가져온다. */
  async function fetchScores() {
    if (!enabled) return { ok: false, scores: [] };
    try {
      const snap = await db.collection(SCORES_COLLECTION).get();
      const scores = snap.docs.map(d => d.data().score).filter(s => typeof s === 'number');
      return { ok: true, scores };
    } catch (e) {
      return { ok: false, scores: [], error: e };
    }
  }

  /* ================= 회차(Day 01~06) 배포용 ================= */

  function roundCanonicalKey(round, id, name, noId) {
    return ((!noId && id) ? idDocKey(id) : nameDocKey(name)) + '__' + round;
  }

  /* checkDuplicate 와 같은 방식이되, 회차별로 독립된 문서를 본다 — 같은
     학생도 회차마다 각각 한 번씩 제출할 수 있어야 하므로 회차key를 문서
     키에 포함해야 한다. */
  async function checkRoundDuplicate({ id, name, noId, round }) {
    if (!enabled) return { duplicate: false, checked: false };
    try {
      const checks = [];
      if (!noId && id) checks.push(db.collection(ROUND_COLLECTION).doc(idDocKey(id) + '__' + round).get());
      if (name) checks.push(db.collection(ROUND_COLLECTION).doc(nameDocKey(name) + '__' + round).get());
      const snaps = await Promise.all(checks);
      const hit = snaps.find(s => s.exists);
      return { duplicate: !!hit, checked: true, data: hit ? hit.data() : null };
    } catch (e) {
      return { duplicate: false, checked: false, error: e };
    }
  }

  /* checkRoundDuplicate 는 "이 회차에 이미 냈는지"만 보고, 그것도 실제로는
     회차 화면을 연 뒤 백그라운드로 뒤늦게 확인한다(js/rounds.js 참고) — 같은
     학번을 여러 사람이 동시에 써도(아직 아무도 제출 전이면) 걸러내는 관문이
     애초에 없었다. 인적사항 작성을 끝내는 시점에 학번이 "이미 다른 이름으로"
     쓰인 적이 있는지만 먼저 확인한다(같은 사람이 이어서 다음 회차를 푸는
     정상적인 경우는 이름이 같으므로 걸리지 않는다) — 6개 회차 문서를 전부
     찾아봐야 하는데, 회차 키가 r1~r6 로 고정돼 있어 목록을 그대로 박아 둔다. */
  const ROUND_KEYS = ['r1', 'r2', 'r3', 'r4', 'r5', 'r6'];
  async function checkIdentityConflict({ id, name, noId }) {
    if (!enabled || noId || !id) return { conflict: false, checked: true };
    try {
      const snaps = await Promise.all(
        ROUND_KEYS.map(k => db.collection(ROUND_COLLECTION).doc(idDocKey(id) + '__' + k).get())
      );
      const trimmed = (name || '').trim();
      for (const snap of snaps) {
        if (!snap.exists) continue;
        const data = snap.data();
        const existingName = (data.name || '').trim();
        if (existingName && existingName !== trimmed) {
          return { conflict: true, checked: true, existingName };
        }
      }
      return { conflict: false, checked: true };
    } catch (e) {
      // 확인 자체가 실패한 경우, 정상 응시생을 부당하게 막지 않도록
      // "충돌 아님" 으로 통과시키되 checked:false 로 알려 둔다.
      return { conflict: false, checked: false, error: e };
    }
  }

  /* 다른 기기에서 이미 제출을 마친 회차가 있으면, 이 기기(로컬 저장소는
     비어 있음)에도 회차 선택 화면을 그리기 전에 그 사실이 반영돼야 카드가
     곧바로 "제출완료"로 보이고 눌러도 곧장 채점 결과가 뜬다 — 예전엔
     회차 하나에 들어간 뒤에야(그것도 화면을 먼저 그려 놓고 뒤늦게)
     확인해서, 카드 목록은 계속 "입장" 상태로 보이고 눌러야만(그것도
     새로 시작하는 화면이 잠깐 보였다 결과로 바뀌며) 알 수 있었다. 6개
     회차를 한 번에 조회해 이미 채점된 것만 돌려준다. */
  async function fetchMySubmittedRounds({ id, name, noId }) {
    if (!enabled) return { ok: false, results: {} };
    try {
      const snaps = await Promise.all(
        ROUND_KEYS.map(k => db.collection(ROUND_COLLECTION).doc(roundCanonicalKey(k, id, name, noId)).get())
      );
      const results = {};
      snaps.forEach((snap, i) => {
        if (!snap.exists) return;
        const data = snap.data();
        if (data.dup || typeof data.score !== 'number') return;
        results[ROUND_KEYS[i]] = data;
      });
      return { ok: true, results };
    } catch (e) {
      return { ok: false, results: {}, error: e };
    }
  }

  /* saveResult 와 같은 구조(학번/이름 중 하나에 전체 내용, 다른 한쪽엔 표시용
     마커만)를 회차 단위로 그대로 적용한다. 기존 submissions/scores 컬렉션은
     전혀 건드리지 않고 roundSubmissions/roundScores 에만 쓴다. */
  async function saveRoundResult({ id, name, noId, round, day, author, reason, result, strokes, strokeSize }) {
    if (!enabled) return { saved: false };
    const hasId = !noId && !!id;
    const canonicalKey = roundCanonicalKey(round, id, name, noId);
    const markerKey = hasId && name ? (nameDocKey(name) + '__' + round) : null;

    const chunks = buildStrokeChunks(strokes, []);

    const basePayload = {
      round, day: day || null, author: author || null,
      name: name || null,
      id: (!noId && id) ? id : null,
      noId: !!noId,
      score: result.score,
      right: result.right,
      wrong: result.wrong,
      blank: result.blank,
      totalPoints: result.totalPoints,
      answers: result.rows.map(r => ({ no: r.no, mine: r.mine, ok: r.ok })),
      usedMs: result.used,
      reason: reason,
      strokeSize: strokeSize || {},
      strokeChunkCount: chunks.length,
      submittedAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    try {
      const batch = db.batch();
      batch.set(db.collection(ROUND_COLLECTION).doc(canonicalKey), basePayload);
      if (markerKey) {
        batch.set(db.collection(ROUND_COLLECTION).doc(markerKey), {
          dup: true, round, id: basePayload.id, name: basePayload.name, noId: basePayload.noId,
          submittedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
      }
      batch.set(db.collection(ROUND_SCORES_COLLECTION).doc(), { round, score: result.score });
      await batch.commit();
    } catch (e) {
      console.error('[Remote] 회차 결과 저장 실패:', e);
      return { saved: false, error: e, code: e && e.code };
    }

    const saved = await saveStrokeChunks(ROUND_COLLECTION, canonicalKey, chunks);
    return {
      saved: true,
      strokesDropped: chunks.length > 0 && saved === 0,
      strokesPartial: saved > 0 && saved < chunks.length
    };
  }

  /* 이 기기엔 타이머가 없는(=이 기기 기준으로는 "아직 시작 안 한") 회차를
     열려는 참인데, 서버에는 이미 roundInProgress 문서가 있으면 — 다른
     기기(또는 이 기기의 지워진 예전 세션)에서 이미 시작해 지금도 타이머가
     흐르고 있다는 뜻이다. 답안 마킹·필기는 전부 로컬 저장이라 그 기기에만
     있으므로, 여기서 타이머만 이어받아 계속하게 하면 답도 필기도 없이
     시간만 흐르다 빈 답안으로 자동 제출될 위험이 있다 — 그래서 이어받지
     않고 원래 기기로 돌아가라고 막는다(js/rounds.js 의 enterRound 참고). */
  async function checkRoundInProgressElsewhere({ id, name, noId, round }) {
    if (!enabled) return { active: false, checked: false };
    try {
      const canonicalKey = roundCanonicalKey(round, id, name, noId);
      const snap = await db.collection(ROUND_IN_PROGRESS_COLLECTION).doc(canonicalKey).get();
      return { active: snap.exists, checked: true };
    } catch (e) {
      // 확인 자체가 실패한 경우, 정상 응시생을 부당하게 막지 않도록
      // "없음" 으로 통과시키되 checked:false 로 알려 둔다.
      return { active: false, checked: false, error: e };
    }
  }

  /* enterRound() 는 새로 시작할 때뿐 아니라 이미 시작해 둔 회차를 새로고침
     등으로 다시 열 때도 이걸 부른다. 예전엔 매번 그냥 set() 으로 덮어써서,
     roundInProgress.startedAt 이 "최초로 시작한 시각"이 아니라 "마지막으로
     연 시각"이 돼 버렸다 — 관리자 대시보드의 "현재 응시 중" 목록에 실제
     경과 시간이 아니라 엉뚱한 값이 뜨는 원인이었다. 이미 문서가 있으면
     손대지 않고 처음 한 번만 써서 진짜 시작 시각을 그대로 지킨다. */
  async function startRoundInProgress({ id, name, noId, round }) {
    if (!enabled) return { ok: false };
    const canonicalKey = roundCanonicalKey(round, id, name, noId);
    try {
      const ref = db.collection(ROUND_IN_PROGRESS_COLLECTION).doc(canonicalKey);
      const snap = await ref.get();
      if (snap.exists) return { ok: true };
      await ref.set({
        round, name: name || null, id: (!noId && id) ? id : null, noId: !!noId,
        startedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e };
    }
  }

  async function clearRoundInProgress({ id, name, noId, round }) {
    if (!enabled) return;
    const canonicalKey = roundCanonicalKey(round, id, name, noId);
    try { await db.collection(ROUND_IN_PROGRESS_COLLECTION).doc(canonicalKey).delete(); } catch (e) { /* 무시 */ }
  }

  /* 특정 회차만의 익명 점수 분포(등수/그래프용) */
  async function fetchRoundScores(round) {
    if (!enabled) return { ok: false, scores: [] };
    try {
      const snap = await db.collection(ROUND_SCORES_COLLECTION).where('round', '==', round).get();
      const scores = snap.docs.map(d => d.data().score).filter(s => typeof s === 'number');
      return { ok: true, scores };
    } catch (e) {
      return { ok: false, scores: [], error: e };
    }
  }

  /* 회차 선택 화면 하단용 — 전체 응시자의 "회차 점수 합"(각자 지금까지
     제출한 회차들의 점수를 더한 값) 분포와, 학번 첫 자리(학년)별 최고점.
     roundScores 는 익명(점수만)이라 학생별로 합산할 수 없으므로,
     roundSubmissions 를 전부 읽어 학생별(canonicalKey 에서 회차를 뺀
     id_/name_ 부분)로 묶는다 — saveRoundResult 가 학번이 있을 때 이름
     쪽에도 남겨 두는 dup 마커 문서(data.dup===true, score 없음)는
     제외한다. */
  async function fetchRoundLeaderboard() {
    if (!enabled) return { ok: false, overallScores: [], gradeTop: {} };
    try {
      const snap = await db.collection(ROUND_COLLECTION).get();
      const byStudent = new Map(); // key -> { total, grade, name }
      snap.docs.forEach(d => {
        const data = d.data();
        if (data.dup || typeof data.score !== 'number') return;
        const key = (data.id ? idDocKey(data.id) : nameDocKey(data.name || ''));
        let entry = byStudent.get(key);
        if (!entry) {
          const grade = (data.id && /^[123]/.test(data.id)) ? data.id.charAt(0) : null;
          entry = { total: 0, grade, name: data.name || null };
          byStudent.set(key, entry);
        }
        entry.total += data.score;
      });
      const overallScores = [];
      // 학년별 1등은 이제 점수만이 아니라 이름도 같이 들고 있다(화면에서
      // "김*수" 처럼 가운데만 가려서 보여준다 — U.maskName, js/util.js).
      const gradeTop = { 1: null, 2: null, 3: null };
      byStudent.forEach(entry => {
        overallScores.push(entry.total);
        if (entry.grade && (gradeTop[entry.grade] == null || entry.total > gradeTop[entry.grade].score)) {
          gradeTop[entry.grade] = { score: entry.total, name: entry.name };
        }
      });
      return { ok: true, overallScores, gradeTop };
    } catch (e) {
      return { ok: false, overallScores: [], gradeTop: {}, error: e };
    }
  }

  init();

  return {
    get enabled() { return enabled; }, checkDuplicate, saveResult, fetchScores, startExam, clearInProgress,
    checkRoundDuplicate, checkIdentityConflict, fetchMySubmittedRounds, saveRoundResult, fetchRoundScores, fetchRoundLeaderboard, startRoundInProgress, checkRoundInProgressElsewhere, clearRoundInProgress
  };
})();
