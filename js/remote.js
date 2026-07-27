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
 *        }
 *        match /scores/{docId} {
 *          allow read: if true;
 *          allow create: if true;
 *          allow update, delete: if false;
 *        }
 *      }
 *    }
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
        b: s.b || null
      }));
    });
    return out;
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

  /* 채점 결과를 저장한다. 학번 문서·이름 문서 두 곳에 같은 내용을 써서
     이후 어느 쪽으로 조회해도 중복 확인에 걸리게 한다. */
  async function saveResult({ id, name, noId, reason, result, strokes, strokeSize }) {
    if (!enabled) return { saved: false };
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
      submittedAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    async function commit(payload) {
      const batch = db.batch();
      if (!noId && id) batch.set(db.collection(COLLECTION).doc(idDocKey(id)), payload);
      if (name) batch.set(db.collection(COLLECTION).doc(nameDocKey(name)), payload);
      // 이름·학번이 전혀 없는 별도 문서에 점수만 남겨 분포 조회 때 개인 식별 없이 쓴다
      batch.set(db.collection(SCORES_COLLECTION).doc(), { score: result.score });
      await batch.commit();
    }

    try {
      await commit(Object.assign({ strokes: toFirestoreStrokes(strokes), strokeSize: strokeSize || {} }, basePayload));
      return { saved: true };
    } catch (e) {
      // permission-denied 는 이미 제출된 기록이 있어 보안 규칙이 덮어쓰기를
      // 막은 것이다(재응시 방지 · js/remote.js 상단 규칙 참고) — 필기 없이
      // 다시 써도 똑같이 막히므로 재시도 없이 바로 실패 처리한다. 그 외
      // 오류(문서 용량 초과 등)는 필기를 빼고 한 번 더 시도해 성적만이라도 남긴다.
      console.error('[Remote] 필기 포함 저장 실패:', e);
      if (e && e.code === 'permission-denied') {
        return { saved: false, error: e, code: e.code };
      }
      try {
        await commit(basePayload);
        return { saved: true, strokesDropped: true };
      } catch (e2) {
        console.error('[Remote] 필기 제외 재시도도 실패:', e2);
        return { saved: false, error: e2, code: e2 && e2.code };
      }
    }
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

  init();

  return { get enabled() { return enabled; }, checkDuplicate, saveResult, fetchScores };
})();
