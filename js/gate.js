/* =====================================================================
 * 접속 잠금 화면 — 비밀번호로 문항 데이터(js/questions.enc.js)를
 * 브라우저에서 직접 복호화한다(WebCrypto PBKDF2 + AES-GCM).
 *
 * 문항 데이터 자체가 암호문으로 배포되므로, 비밀번호를 모르면 이 파일을
 * 통째로 내려받아도(GitHub 저장소 열람 포함) 문제 내용을 알 수 없다.
 * ===================================================================== */

(() => {
  const STORAGE_KEY = 'pungam_mogo_gate_key_v1';

  const overlay = document.getElementById('gateOverlay');
  const form = document.getElementById('gateForm');
  const input = document.getElementById('gatePw');
  const errorEl = document.getElementById('gateError');
  const btn = form.querySelector('button[type="submit"]');

  function b64ToBytes(b64) {
    const bin = atob(b64);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return arr;
  }

  async function deriveKey(passwordBytes, salt, iterations) {
    const baseKey = await crypto.subtle.importKey('raw', passwordBytes, 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
      baseKey,
      { name: 'AES-GCM', length: 256 },
      false,
      ['decrypt']
    );
  }

  async function attemptUnlock(passwordBytes) {
    const enc = window.QUESTIONS_ENC;
    if (!enc) throw new Error('암호화된 문항 파일(js/questions.enc.js)이 없습니다.');
    const salt = b64ToBytes(enc.salt);
    const iv = b64ToBytes(enc.iv);
    const data = b64ToBytes(enc.data);
    const key = await deriveKey(passwordBytes, salt, enc.iterations);
    const plainBuf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data);
    const json = new TextDecoder().decode(plainBuf);
    const questions = JSON.parse(json);
    if (!Array.isArray(questions) || !questions.length) throw new Error('복호화 결과가 올바르지 않습니다.');
    window.QUESTIONS = questions;
    /* store.js 는 페이지 로드 시점에 이미 빈 QUESTIONS 로 state 를 한 번
       만들어 둔 상태다. 실제 문항이 채워졌으니 처음 방문자(저장된 응시
       기록이 없는 경우)를 위해 다시 만들어 둔다. */
    if (typeof Store !== 'undefined' && typeof Store.reinitBlank === 'function') Store.reinitBlank();
  }

  function blockKeysWhileLocked(e) {
    const k = e.key;
    const blockCombo =
      ((e.ctrlKey || e.metaKey) && ['p', 'P', 's', 'S', 'u', 'U'].includes(k)) ||
      ((e.ctrlKey || e.metaKey) && e.shiftKey && ['i', 'I', 'j', 'J', 'c', 'C'].includes(k)) ||
      k === 'F12' || k === 'PrintScreen';
    if (blockCombo) e.preventDefault();
  }
  document.addEventListener('keydown', blockKeysWhileLocked, true);

  function unlockUI() {
    document.removeEventListener('keydown', blockKeysWhileLocked, true);
    overlay.remove();
    /* App 은 js/app.js 에서 top-level const 로 선언되어 있어 window.App 이
       아니라 전역 스코프의 맨 이름(App)으로만 접근할 수 있다. */
    if (typeof App !== 'undefined' && typeof App.boot === 'function') App.boot();
  }

  function showError() {
    errorEl.hidden = false;
    input.value = '';
    input.focus();
    overlay.classList.add('gate--shake');
    setTimeout(() => overlay.classList.remove('gate--shake'), 300);
  }

  async function submitPassword(pw) {
    btn.disabled = true;
    errorEl.hidden = true;
    let unlocked = false;
    try {
      await attemptUnlock(new TextEncoder().encode(pw));
      unlocked = true;
    } catch (e) {
      showError();
    }
    btn.disabled = false;
    if (!unlocked) return;
    /* 복호화 성공 이후(=비밀번호는 맞음) 벌어지는 오류는 "비밀번호 틀림"과
       다른 문제이므로 위 try/catch 밖에서 그대로 드러나게 둔다. */
    try { localStorage.setItem(STORAGE_KEY, pw); } catch (e) { /* 저장 실패해도 계속 진행 */ }
    unlockUI();
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const pw = input.value;
    if (!pw) return;
    submitPassword(pw);
  });

  /* 이 브라우저에서 전에 성공했던 비밀번호가 있으면 다시 묻지 않고 자동으로 시도한다. */
  let remembered = null;
  try { remembered = localStorage.getItem(STORAGE_KEY); } catch (e) { /* 무시 */ }
  if (remembered) {
    submitPassword(remembered);
  } else {
    input.focus();
  }
})();
