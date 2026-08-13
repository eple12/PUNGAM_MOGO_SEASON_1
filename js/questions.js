/* =====================================================================
 * 제1회 풍암 모의고사 — 문항 데이터 (암호화 배포 중)
 *
 * 이 파일은 빈 배열만 두고, js/questions.enc.js(암호문)를 js/gate.js 가
 * 비밀번호로 복호화해 채우는 구조다.
 *
 * 문항을 수정하려면:
 *   1) tools/questions.source.js 를 고친다.
 *   2) node tools/encrypt-questions.js <비밀번호> 로 js/questions.enc.js 를 갱신한다.
 * ===================================================================== */

var QUESTIONS = [];

/* 번호로 문항 찾기 */
function getQuestion(no) {
  return QUESTIONS[no - 1];
}
