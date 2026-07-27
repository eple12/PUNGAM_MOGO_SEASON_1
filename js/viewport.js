/* =====================================================================
 * 뷰포트 전환 — 답안지(OMR)는 태블릿 가로 화면 기준의 고정 레이아웃이라
 * 휴대폰처럼 좁은 화면에서는 반응형으로 우겨넣어도 글자가 넘친다.
 * 그래서 휴대폰에서 인적사항 · 튜토리얼 · 시험 화면에 들어가는 순간에는
 * 주소창의 "데스크톱 사이트" 를 켠 것과 같은 효과를 낸다 — 뷰포트 폭을
 * 고정 값으로 못박아 브라우저가 화면을 축소해서 보여 주게 한다(레이아웃
 * 자체는 그대로 두고 화면만 줌아웃되므로 데스크톱/태블릿에서 보던 것과
 * 똑같은 모습을 그대로 보게 된다).
 * ===================================================================== */

const Viewport = (() => {

  const DESKTOP_WIDTH = 1080;
  const DEFAULT_CONTENT = 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover';
  const DESKTOP_CONTENT = 'width=' + DESKTOP_WIDTH + ', viewport-fit=cover';

  // 이 화면들만 "데스크톱 사이트" 취급한다(랜딩 페이지·결과 화면은 원래도
  // 좁은 화면에 맞춰 반응형으로 잘 쌓이므로 그대로 둔다).
  const WIDE_SCREENS = { screenIdentity: 1, screenTutorial: 1, screenExam: 1 };

  const meta = document.querySelector('meta[name="viewport"]');

  // 태블릿(갤럭시탭·아이패드)은 원래 이 사이트가 목표로 하는 기기라
  // 건드리지 않는다. 화면의 짧은 변(회전과 무관한 물리적 크기)이 작을
  // 때만 "휴대폰"으로 본다. 회전해도 물리 치수는 그대로이므로 페이지
  // 로드 시점에 한 번만 계산해 캐싱해도 된다.
  const isPhone = (() => {
    try {
      const coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
      const shortSide = Math.min(window.screen.width || 0, window.screen.height || 0);
      return !!(coarse && shortSide > 0 && shortSide <= 640);
    } catch (e) { return false; }
  })();

  function sync(screenId) {
    if (!meta) return;
    const wantDesktop = isPhone && !!WIDE_SCREENS[screenId];
    meta.setAttribute('content', wantDesktop ? DESKTOP_CONTENT : DEFAULT_CONTENT);
  }

  return { sync, isPhone };
})();
