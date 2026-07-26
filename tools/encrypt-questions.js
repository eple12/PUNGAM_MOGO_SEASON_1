/* =====================================================================
 * 문항 데이터 암호화 빌드 (로컬 전용 — 배포되지 않음)
 *
 * tools/questions.source.js 의 실제 QUESTIONS 배열을 비밀번호로
 * 암호화해 js/questions.enc.js 를 만든다. GitHub Pages 등에는
 * js/questions.enc.js(암호문)만 올라가고, questions.source.js 는
 * .gitignore 에 등록되어 저장소에 절대 올라가지 않는다.
 *
 * 사용법:
 *   node tools/encrypt-questions.js <비밀번호>
 *
 * 문항을 수정할 때마다 tools/questions.source.js 를 고친 뒤 이 스크립트를
 * 다시 돌려 js/questions.enc.js 를 갱신해야 한다.
 * ===================================================================== */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const password = process.argv[2];
if (!password) {
  console.error('사용법: node tools/encrypt-questions.js <비밀번호>');
  process.exit(1);
}

const SRC_PATH = path.join(__dirname, 'questions.source.js');
const OUT_PATH = path.join(__dirname, '..', 'js', 'questions.enc.js');

if (!fs.existsSync(SRC_PATH)) {
  console.error(`[오류] ${SRC_PATH} 가 없습니다. 실제 문항 데이터 파일을 이 경로에 두세요.`);
  process.exit(1);
}

const src = fs.readFileSync(SRC_PATH, 'utf8');
const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(src + '\nthis.__QUESTIONS__ = QUESTIONS;', sandbox, { filename: 'questions.source.js' });
const QUESTIONS = sandbox.__QUESTIONS__;

if (!Array.isArray(QUESTIONS) || !QUESTIONS.length) {
  console.error('[오류] QUESTIONS 배열을 읽지 못했습니다.');
  process.exit(1);
}

const json = JSON.stringify(QUESTIONS);

const ITERATIONS = 250000;
const salt = crypto.randomBytes(16);
const key = crypto.pbkdf2Sync(password, salt, ITERATIONS, 32, 'sha256');
const iv = crypto.randomBytes(12);
const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
const encrypted = Buffer.concat([cipher.update(json, 'utf8'), cipher.final()]);
const authTag = cipher.getAuthTag();

const payload = {
  v: 1,
  iterations: ITERATIONS,
  salt: salt.toString('base64'),
  iv: iv.toString('base64'),
  data: Buffer.concat([encrypted, authTag]).toString('base64')
};

const out =
  '/* 자동 생성 파일 — tools/encrypt-questions.js 로 생성됨. 직접 수정하지 말 것.\n' +
  '   문항 원문은 암호화되어 있으며, js/gate.js 가 방문자가 입력한 비밀번호로 복호화한다. */\n' +
  'window.QUESTIONS_ENC = ' + JSON.stringify(payload) + ';\n';

fs.writeFileSync(OUT_PATH, out);
console.log(`완료: ${QUESTIONS.length}개 문항을 암호화해 ${path.relative(process.cwd(), OUT_PATH)} 에 저장했습니다.`);
