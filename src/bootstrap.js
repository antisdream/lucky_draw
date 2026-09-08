/* Small, conservative boot guard: keep useful help visible when the app cannot run. */
(function () {
  var complete = false;
  var blocked = false;
  var notice = document.getElementById('launch-help');
  var heading = document.getElementById('launch-heading');
  var message = document.getElementById('launch-message');
  var detail = document.getElementById('launch-detail');
  function fail(text, reason) {
    if (complete) return;
    blocked = true;
    document.body.setAttribute('data-app-ready', 'false');
    notice.hidden = false;
    heading.textContent = '이 환경에서는 게임을 시작하지 못했어요';
    message.textContent = text;
    detail.textContent = reason || '';
    detail.hidden = !reason;
  }
  window.LuckyBoot = {
    ready: function () {
      if (blocked) return;
      complete = true;
      notice.hidden = true;
      document.body.setAttribute('data-app-ready', 'true');
    },
    fail: fail
  };
  window.addEventListener('error', function (event) {
    if (!complete) fail('필요한 코드는 HTML 안에 모두 들어 있습니다. 파일 미리보기를 닫고 최신 브라우저에서 열어주세요.', event.message || '시작 중 오류');
  });
  var missing = [];
  if (typeof BigInt !== 'function') missing.push('큰 정수 계산');
  if (!window.crypto || !window.crypto.getRandomValues) missing.push('안전한 무작위 추첨');
  if (!document.createElement('canvas').getContext('2d')) missing.push('게임 화면 그리기');
  if (!window.FileReader || !window.Blob || !window.URL || !window.URL.createObjectURL) missing.push('파일 읽기 및 저장');
  if (missing.length) fail('이 브라우저가 게임에 필요한 기능을 지원하지 않습니다. 최신 Chrome, Edge, Safari 또는 Firefox에서 열어주세요.', '지원되지 않는 기능: ' + missing.join(', '));
  else message.textContent = '파일 안에 포함된 게임을 시작하고 있어요. 이 화면이 계속 보이면 아래의 실행 방법을 확인해주세요.';
}());
