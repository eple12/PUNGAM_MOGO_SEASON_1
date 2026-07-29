/* =====================================================================
 * 제1회 풍암 모의고사 — 문항 데이터 (현재 평문 배포 중)
 *
 * 원래는 이 파일이 빈 배열만 두고 js/questions.enc.js(암호문)를
 * js/gate.js 가 비밀번호로 복호화해 채우는 구조였다. 지금은 잠금 화면을
 * 끄고 바로 랜딩 페이지가 보이도록 문항을 평문으로 되돌려 둔 상태다.
 *
 * 다시 잠그려면:
 *   1) tools/encrypt-questions.js 로 이 배열(tools/questions.source.js)을
 *      암호화해 js/questions.enc.js 를 갱신한다.
 *   2) 이 파일을 다시 `var QUESTIONS = [];` 빈 배열로 되돌린다.
 *   3) js/gate.js 맨 위의 GATE_ENABLED 를 true 로 바꾼다.
 *
 *  no      : 문항 번호
 *  points  : 배점
 *  author  : 출제자
 *  type    : 'short'(단답형) | 'choice'(5지선다형)
 *  answer  : 정답 (단답형은 정수, 선다형은 1~5)
 *  body    : 문제 원문 (LaTeX 원문 그대로. String.raw 로 감싸 백슬래시를 보존한다)
 *
 *  본문 규칙
 *   - 빈 줄로 구분된 덩어리가 하나의 문단이 된다.
 *   - 덩어리 전체가 $$ ... $$ 이면 별행 수식으로 렌더링된다.
 *   - 첫 줄이 〈보기〉 또는 〈조건〉 이면 테두리 상자로 렌더링된다.
 *   - 첫 줄이 ① 로 시작하면 선택지 줄로 렌더링된다.
 * ===================================================================== */

const QUESTIONS = [
{
  no: 1, points: 2, author: '황지우', type: 'short', answer: 5,
  body: String.raw`방정식 $(x^2-5x+5)^{x^2-9}=1$을 만족시키는 모든 정수 $x$의 값의 합을 구하시오.`
},
{
  no: 2, points: 2, author: '황지우', type: 'short', answer: 4,
  body: String.raw`$0\le x\le2$일 때, 방정식 $2|\sin(\pi x)|=1$을 만족시키는 모든 $x$의 값의 합을 구하시오.`
},
{
  no: 3, points: 2, author: '김정헌', type: 'choice', answer: 3,
  body: String.raw`닫힌구간 $\left[-\dfrac\pi2,\dfrac\pi2\right]$에서 정의된 두 함수 $f(x)=\sqrt{\sin(\cos x)}$, $g(x)=\sin(\cos x)$에 대하여 다음 〈보기〉에서 옳은 것만을 있는 대로 고른 것은?

〈보기〉
ㄱ. $f(0)=\sqrt{\sin(1)}$이다.
ㄴ. 주어진 구간의 모든 $x$에 대하여 $f(x)\ge g(x)$이다.
ㄷ. 함수 $h(x)=f(x)-g(x)$는 $x=0$에서 최댓값을 가진다.

① ㄱ&nbsp;&nbsp; ② ㄷ&nbsp;&nbsp; ③ ㄱ, ㄴ&nbsp;&nbsp; ④ ㄴ, ㄷ&nbsp;&nbsp; ⑤ ㄱ, ㄴ, ㄷ`
},
{
  no: 4, points: 3, author: '황지우', type: 'short', answer: 12,
  body: String.raw`부등식 $\log_{x-1}(-x^2+7x-6)\ge1$을 만족시키는 모든 정수 $x$의 값의 합을 구하시오.`
},
{
  no: 5, points: 3, author: '전규영', type: 'short', answer: 341,
  body: String.raw`첫째항이 $8$인 등비수열 $\{a_n\}$의 첫째항부터 제$n$항까지의 합을 $S_n$이라 하자. $S_3\le6$일 때, $64\times S_{10}$의 값을 구하시오.`
},
{
  no: 6, points: 3, author: '김정헌', type: 'choice', answer: 3,
  body: String.raw`닫힌구간 $\left[-\dfrac\pi2,\dfrac\pi2\right]$에서 정의된 두 함수 $f(x)=\sqrt{\sin(\cos x)}$, $g(x)=\sin(\cos x)$에 대하여 $f(x)$, $g(x)$의 최댓값을 각각 $M_1$, $M_2$라 할 때, $M_1$과 $M_2$의 대소 관계로 옳은 것은?

① $M_1<M_2$&nbsp;&nbsp; ② $M_1=M_2$&nbsp;&nbsp; ③ $M_1>M_2$&nbsp;&nbsp; ④ $M_1=M_2^2$&nbsp;&nbsp; ⑤ $M_1=\dfrac12M_2$`
},
{
  no: 7, points: 3, author: '김민수', type: 'short', answer: 374,
  body: String.raw`수열 $\{a_n\}$은 다음 〈조건〉을 만족한다.

〈조건〉
(가) $a_1=a_2=1$
(나) $a_{n+2}-a_n=a_{n+1}$ (단, $n$은 자연수)

$\displaystyle\sum_{n=1}^{8}\dfrac{1}{a_{n+2}a_n}=S$라 할 때, $\dfrac{1}{5(1-S)}$의 값을 구하시오.`
},
{
  no: 8, points: 3, author: '김정헌', type: 'choice', answer: 3,
  body: String.raw`중심이 원점이고 반지름 길이가 $r_n=\left(\dfrac12\right)^{n-1}$인 원을 $O_n$이라 하자. 자연수 $n$에 대하여 원 $O_n$ 위에 있으며 각 좌표가 모두 $0$ 이상인 점 $P_n$의 $x$좌표는 다음과 같이 정의된다.

$$x_n=\dfrac12-\dfrac18(n-1)$$

이러한 점 $P_n$이 존재하는 모든 자연수 $n$에 대하여 점 $P_n$을 좌표평면에 나타내고, 이 점들을 번호 순서대로 이은 뒤 마지막 점에서 처음 점으로 이어 닫은 도형의 둘레의 길이를 $l$, 넓이를 $S$라 할 때, $l$과 $S$의 대소 관계로 옳은 것은?

① $l<S$&nbsp;&nbsp; ② $l=S$&nbsp;&nbsp; ③ $l>S$&nbsp;&nbsp; ④ $l=2S$&nbsp;&nbsp; ⑤ $2l=S$`
},
{
  no: 9, points: 3, author: '전규영', type: 'short', answer: 560,
  body: String.raw`등비수열 $\{a_n\}$이 다음 〈조건〉을 만족시킨다.

〈조건〉
(가) $\dfrac{a_{18}+a_{21}}{a_6+a_9}=9$
(나) $a_n$이 자연수가 되도록 하는 자연수 $n$의 최솟값은 $19$이다.
(다) $a_{19}$의 양의 약수의 개수는 $12$이다.

$a_{19}$가 최소일 때, $27(a_1+a_7)$의 값을 구하시오.`
},
{
  no: 10, points: 3, author: '이시훈', type: 'short', answer: 512,
  body: String.raw`$$\left|\sin\!\left(\pi-\frac12\pi\log_2x\right)\right|=\frac{\sin(\pi-x)}{\cos\!\left(\dfrac32\pi+x\right)}$$

의 해를 작은 순서대로 $a_n$이라 하자. (단, $x\ge\dfrac14$)

$\sqrt{2a_{10}}$의 값을 구하시오.`
},
{
  no: 11, points: 3, author: '전규영', type: 'short', answer: 67,
  body: String.raw`첫째항이 음수이고 공차가 양수인 등차수열 $\{a_n\}$에 대하여 모든 자연수 $n$에 대해 $S_n=a_m$을 만족시키는 자연수 $m$이 존재하고, 이때 $m=f(n)$이라 하자. $\displaystyle\sum_{k=1}^{f(5)}a_k=34$일 때, $a_7=\dfrac pq$이다.

$p-q-11$의 값을 구하시오. (단, $p,q$는 서로소인 자연수이다.)`
},
{
  no: 12, points: 3, author: '황지우', type: 'short', answer: 5,
  body: String.raw`$0\le x<2\pi$인 실수 $x$에 대하여 $[2\sin x]+[2\cos x]=-1$을 만족시키는 모든 $x$의 범위가 $a<x\le b$, $c\le x<d$일 때, $\dfrac{a+b+c+d}{\pi}$의 값을 구하시오. (단, $[x]$는 $x$보다 크지 않은 최대의 정수이다.)`
},
{
  no: 13, points: 3, author: '이현우', type: 'short', answer: 1,
  body: String.raw`$$\left|\sum_{k=1}^{7}\left(\sum_{p=1}^{7}\left(\dfrac{1+\sqrt3i}{2}\right)^p\right)^k\times\sum_{t=4}^{16}\left(\dfrac{\sqrt3+i}{2}\right)^t\right|$$

의 값을 구하시오. (단, $i=\sqrt{-1}$)`
},
{
  no: 14, points: 3, author: '김민수', type: 'short', answer: 256,
  body: String.raw`수열 $\{a_n\}$이 모든 자연수 $n$에 대하여 $a_1=\dfrac{10}{3}$, $a_{n+1}=a_n^2-2$을 만족한다.

$\log_3[a_9]$의 값을 구하시오. (단, $[x]$는 $x$ 이하의 최대의 정수이다.)`
},
{
  no: 15, points: 3, author: '김정헌', type: 'short', answer: 5,
  body: String.raw`좌표평면의 원점을 $O$라 하자. 민수와 ⟦REDACT⟧가 보는 영화관 스크린을 나타내는 선분이 두 점 $M(0,1)$, $N(0,5)$를 양 끝 점으로 한다. $x>0$인 영역에 있는 점 $A(\alpha,0)$에서 스크린을 바라본 각 $\angle MAN$의 크기가 최대일 때, 제1사분면 위를 움직이는 점 $P$에 대하여 $\theta=\angle OAP$라 하자.

선분 $\overline{AP}=\alpha\cos\theta$가 성립할 때, 삼각형 $OPA$의 넓이를 $S$라 하자. $S$의 최댓값 $S_{\max}$에 대하여 $4S_{\max}$의 값을 구하시오.`
},
{
  no: 16, points: 3, author: '김정헌', type: 'short', answer: 15,
  body: String.raw`중심이 원점이고 반지름 길이가 $4$인 원 $C: x^2+y^2=16$에 대하여 닫힌구간 $\left[-\dfrac\pi2,\dfrac\pi2\right]$에서 시간 $t$에 따라 움직이는 점 $K(t)$의 위치를 $K(t)=\left(\sin(\cos t),\ \sqrt{1-\sin^2(\cos t)}\right)$로 정의할 때, 점 $K(t)$가 그리는 자취를 곡선 $X$라 하자.

원 $C$ 위의 임의의 점 $M$과 곡선 $X$ 위의 임의의 점 $K$ 사이의 거리의 최댓값을 $\alpha$, 최솟값을 $\beta$라 할 때, $\alpha\times\beta$의 값을 구하시오.`
},
{
  no: 17, points: 3, author: '이시훈', type: 'short', answer: 139,
  body: String.raw`모든 항이 정수인 수열 $\{a_n\}$은 모든 자연수 $n$에 대하여 다음 〈조건〉을 만족한다.

〈조건〉
(가) $(a_{n+1}-2a_n-4)(a_{n+1}-a_n-8)=0$
(나) 자연수 $n\,(1\le n\le7)$에 대하여 $\dfrac{1}{(a_n+8)(a_n+7)(a_n-76)}$의 값이 존재한다.

$a_6=36$일 때, (가능한 모든 $|a_1|$의 값의 합)$+a_7$의 값을 구하시오.`
},
{
  no: 18, points: 4, author: '전규영', type: 'short', answer: 5,
  body: String.raw`수열 $\{a_n\}$, $\{b_n\}$에 대하여 $a_n=2n-1$, $b_n=3n-2$이다. 원 $x^2+y^2=a_n^2$과 접하고, 곡선 $|y|=\sqrt{x+b_n}$에 두 점에서 접하며, 반지름의 길이가 $a_n$보다 작은 원의 반지름을 $r_n$이라 하자. (단, $n$은 자연수)

$\displaystyle\sum_{n=1}^{50}(r_{n+1}-r_n)=p\sqrt7+q\sqrt2$ ($p,q$는 정수)일 때, $p+q$의 값을 구하시오.`
},
{
  no: 19, points: 4, author: '황지우', type: 'short', answer: 341,
  body: String.raw`자연수 $n$에 대하여 집합 $X=\{1,2,3,\dots,n\}$의 공집합이 아닌 부분집합 $A$에 대하여 $A$의 원소 중 최댓값을 $p$, 최솟값을 $q$라 하자.

$p+q=n+1$을 만족시키는 집합 $A$의 개수를 $f(n)$이라 할 때, $f(10)$의 값을 구하시오.`
},
{
  no: 20, points: 4, author: '이현우', type: 'short', answer: 44,
  body: String.raw`$$f(x)=\begin{cases}\sin x & (\sin x>\cos x)\\\cos x & (\cos x\ge\sin x)\end{cases}$$

함수 $|f(x)|$의 그래프와 직선 $y=\dfrac{1}{n\pi}x$의 교점의 개수를 $g(n)$이라 하자.

$\displaystyle\sum_{k=1}^{6}g(k)$의 값을 구하시오.`
},
{
  no: 21, points: 4, author: '이현우', type: 'short', answer: 5,
  body: String.raw`함수 $f(x)=[\sin x]$ ($-2\pi\le x\le2\pi$)의 그래프와 직선 $y=ax$의 교점이 $1$개만 존재하도록 하는 음수 $a$의 범위가 $\{a\mid a\le b\ \text{또는}\ c\le a<0\}$일 때, $b+c=-\dfrac1\pi\left(\dfrac qp\right)$이다.

$p+q$의 값을 구하시오. (단, $p,q$는 서로소인 자연수이고, $[x]$는 $x$보다 크지 않은 최대의 정수이다.)`
},
{
  no: 22, points: 4, author: '김민수', type: 'short', answer: 770,
  body: String.raw`$y=\sin\dfrac\pi2x+\dfrac13x$의 그래프 $l_1$이 있다. 점 $P(8,7)$에 대하여 $P$를 중심으로 하고 $l_1$과 접하는 원 중 반지름이 최소인 것을 $C$라 하면, $C$의 반지름의 길이는 $r$이다.

$x=\cos\pi y$의 그래프를 $l_2$라 하면, $l_2$ 위의 어떤 점 $Q$에 대해 점 $Q$를 중심으로 하고 반지름이 $9-r$인 원이 $C$와 접한다. $S=\{y\mid y$는 모든 $Q$의 $y$좌표$\}$일 때, $(S$의 모든 원소의 합$)\times r^2$의 값을 구하시오.`
},
{
  no: 23, points: 4, author: '이시훈', type: 'short', answer: 2,
  body: String.raw`$f(x)=-4\sqrt{x-3}+p, g(x)=|f(x)|-x+1$에 대하여, 두 함수는 다음 〈조건〉을 만족한다.

〈조건〉
(가) 함수 $y=g(x)$의 그래프가 직선 $y=0$과 만나는 서로 다른 점의 개수와 함수 $y=g(x)-3$의 그래프가 직선 $y=0$과 만나는 서로 다른 점의 개수의 합은 홀수이다.
(나) 함수 $y=g(x)$의 그래프와 직선 $y=-4$가 만나는 서로 다른 점의 개수와 함수 $y=g(x)-3$의 그래프와 직선 $y=-4$가 만나는 서로 다른 점의 개수의 합이 $3$일 때, 가능한 $p$는 차례대로 $p_1,p_2,\dots,p_n$이다.
(다) $p$는 $-8\le p\le8$을 만족시키는 정수이다.

$\displaystyle\sum_{k=1}^{n}p_k$의 값을 구하시오.`
},
{
  no: 24, points: 4, author: '이시훈', type: 'short', answer: 21,
  body: String.raw`수열 $\{a_n\}$이 $n\ge2$인 모든 자연수 $n$에 대하여

$$a_{n+2}=\begin{cases}-2a_n & (a_n<-1)\\-a_n+4 & (-1\le a_n<4)\\a_{n+1}-6 & (a_n\ge4)\end{cases}$$

을 만족하고, $a_1a_2a_3=8$이며 $a_n$의 모든 항이 정수이다.

$a_2+a_4+a_6$의 최댓값을 $p$, 최솟값을 $q$라 할 때, $|p|+|q|$의 값을 구하시오. (단, $|a_1|\ne2$이다.)`
},
{
  no: 25, points: 4, author: '이현우', type: 'short', answer: 3,
  body: String.raw`$f(x)=\sin x$, $g(x)=\dfrac{2f(x)^4-f(x)^2}{f(x)^3-f(x)f\!\left(x+\dfrac32\pi\right)^2}$일 때, $y=ax$와 $y=g(x)$의 그래프의 교점이 존재하지 않는 모든 $a$값의 합이 $b+\dfrac{c\sqrt2}\pi$ (단, $b,c$는 유리수)이다.

$[b+c]$의 값을 구하시오. $\left(-\dfrac{1}{2\pi}\le a\le1\right)$ (단, $[x]$는 $x$보다 크지 않은 최대의 정수)`
},
{
  no: 26, points: 4, author: '이현우', type: 'short', answer: 102,
  body: String.raw`집합 $Y=\{y\mid-2\le y\le2\}$에 대하여, 치역이 $Y$가 되도록 하는 정의역 $X=\{x\mid f(x)\in Y\}$를 가지는 함수 $f(x)=\log|x|$가 있다.

함수 $f(x)$ 위의 서로 다른 세 점 $A,B,C$의 $x$좌표를 적절히 배열하면 차례대로 등비수열을 이룬다. 이때 삼각형 $ABC$의 넓이의 최댓값을 $S$라 할 때, $[S]$의 값을 구하시오. (단, $[x]$는 $x$보다 작거나 같은 최대의 정수)`
},
{
  no: 27, points: 4, author: '김민수', type: 'short', answer: 400,
  body: String.raw`$f(x)=\sin(\pi\cos\pi x)$에 대하여, $y=f(x)$의 그래프 $l$이 있다. 점 $A\left(1,\dfrac12\right)$을 중심으로 하고 $l$과 접하는 원 중 반지름이 최소인 원을 $C_1$이라 하자.

$C_1$ 위의 점 중 $y$좌표가 최대인 점을 $P$라 하고, $H(2,1)$이다. $\angle HPQ_n=\theta_n$ (단, $0<\theta_n<\dfrac\pi2$)를 만족하는 점 중 $y$좌표가 $P$와 다른 $C_1$ 위의 점 $Q_n$에 대하여 $\tan2\theta_n=(2n-1)$이다. 점 $\left(\dfrac12,0\right)$을 지나고 $\overline{AQ_n}$과 평행한 직선을 $L_n$이라 할 때, $g(n)=(l$과 $L_n$의 서로 다른 교점의 개수$)$이다.

$\displaystyle\sum_{n=1}^{100}g(n)f\!\left(\dfrac13+n\right)$의 값을 구하시오.`
},
{
  no: 28, points: 4, author: '전규영', type: 'short', answer: 58,
  body: String.raw`$X=\{x\mid|x|$는 $15$ 이하의 정수$\}$에 대하여 $f:X\to X$가 역함수를 가진다. $n+f(n)\ne0$인 정수 $n$에 대하여 $f(n)$의 $\bigl([\log_2(|n+f(n)|)]+1\bigr)$제곱근 중 실수인 것의 개수를 $g(n)$이라 할 때, $\displaystyle\sum_{n=1}^{15}(g(n)-g(-n))$의 최댓값을 $a$, 최솟값을 $b$라 하자.

$|b-a|$의 값을 구하시오. (단, $[x]$는 $x$보다 작거나 같은 최대의 정수)`
},
{
  no: 29, points: 4, author: '이시훈', type: 'short', answer: 17,
  body: String.raw`자연수 $a$와 $6$ 이상의 자연수 $b$에 대하여

$$f(x)=|2^x-3|+2+b,\qquad g(x)=-|3\log_2x+3|+2+2b$$

$f(x)$와 $g(x)$의 교점의 $y$좌표 중 큰 것을 $\alpha$라 하고, $f(x)$와 $g(x)$가 $y=a$와 만나는 교점의 개수를 $h(a)$라 할 때, $\alpha\le a\le2+\dfrac32b$ 또는 $2+\dfrac32b\le a\le\alpha$에서 $h(a)=3$을 만족시키는 $a$의 개수가 최소가 되도록 하는 $b$의 값을 구하시오.`
},
{
  no: 30, points: 4, author: '김민수', type: 'short', answer: 675,
  body: String.raw`좌표평면 위의 모든 점의 집합을 $\mathbb S$라 하자. 집합 $\mathbb S$에서 집합 $\mathbb S$로의 일대일대응 $f$에 의하여 점 $(x,y)\in\mathbb S$와 이에 대응하는 점 $(x',y')\in\mathbb S$ 사이에는 다음 관계가 성립한다.

$$\begin{pmatrix}x'\\y'\end{pmatrix}=\begin{pmatrix}\dfrac12&-\dfrac{\sqrt3}2\\[4pt]\dfrac{\sqrt3}2&\dfrac12\end{pmatrix}\begin{pmatrix}x\\y\end{pmatrix}$$

원점 $O$를 중심으로 하고 반지름의 길이가 $6$인 원 $C$ 위의 점 $H_0(6,0)$에 대하여, 선분 $\overline{H_0f(H_0)}$의 수직이등분선을 $l$이라 하자. 직선 $l$과 $C$의 교점 중 제1사분면에 있는 점을 $H_1$이라 하고, 자연수 $k\,(k\ge2)$에 대하여 $H_k=f(H_{k-2})$이다.

$1\le n\le11$인 자연수 $n$ 중에서, 곡선 $y=\sqrt3\log_2x$ ($x>0$) 위의 점 중 $x$좌표가 $2^n$인 점을 $A_n$이라 할 때, 점 $A_n$이 직선 $l$과 $x$축 사이에 있도록 하는 $n$에 대하여 다음을 정의한다.

점 $P$가 점 $H_0$에서 점 $H_n$까지 양 끝 점을 포함하며 $C$를 반시계 방향으로 도는 호 위의 점이고, $Q=f(P)$일 때, $\overline{FP}^2+\overline{FQ}^2$의 최댓값은 $M(n)$이다. (단, $F(-6,6\sqrt3)$)

$M(n)$의 값을 최소로 하는 모든 $n$의 값의 합을 $S$라 할 때, 점 $T(S,0)$에 대하여 $R=f(f(T))$이다.

$\overline{TR}^2$의 값을 구하시오.`
}
];

/* 번호로 문항 찾기 */
function getQuestion(no) {
  return QUESTIONS[no - 1];
}
