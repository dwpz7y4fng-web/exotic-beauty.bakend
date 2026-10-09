// Pixel Facebook (Meta) + bandeau de consentement cookies.
// Le pixel ne se charge QU'APRÈS que la visiteuse ait cliqué « Accepter ».
// Pour changer le pixel, modifier PIXEL_ID ci-dessous.
(function () {
  var PIXEL_ID = '1013734279643582';
  var KEY = 'eb_cookie_consent'; // 'yes' | 'no'
  var consent = null;
  try { consent = localStorage.getItem(KEY); } catch (e) {}

  var loaded = false;
  function loadPixel() {
    if (loaded) return; loaded = true;
    !function (f, b, e, v, n, t, s) {
      if (f.fbq) return; n = f.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments); };
      if (!f._fbq) f._fbq = n; n.push = n; n.loaded = !0; n.version = '2.0'; n.queue = [];
      t = b.createElement(e); t.async = !0; t.src = v; s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t, s);
    }(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');
    try { fbq('init', PIXEL_ID); fbq('track', 'PageView'); } catch (e) {}
  }

  // Tracker public : ne déclenche un événement que si le consentement a été donné.
  window.ebTrack = function (event, params) {
    try { if (consent === 'yes' && window.fbq) fbq('track', event, params || {}); } catch (e) {}
  };

  function setConsent(v) {
    consent = v;
    try { localStorage.setItem(KEY, v); } catch (e) {}
    var el = document.getElementById('eb-cookie');
    if (el && el.parentNode) el.parentNode.removeChild(el);
    if (v === 'yes') loadPixel();
  }

  if (consent === 'yes') { loadPixel(); return; }
  if (consent === 'no') { return; }

  // Aucun choix fait → on affiche le bandeau.
  function showBanner() {
    if (document.getElementById('eb-cookie')) return;
    var css = '#eb-cookie{position:fixed;left:12px;right:12px;bottom:12px;z-index:99999;max-width:720px;margin:0 auto;background:#1E2B31;color:#F4EFE8;border-radius:14px;padding:15px 18px;box-shadow:0 10px 30px rgba(0,0,0,.28);font-family:"Hanken Grotesk",system-ui,-apple-system,Segoe UI,Roboto,sans-serif;display:flex;gap:14px;align-items:center;flex-wrap:wrap;justify-content:space-between;font-size:14px;line-height:1.45}'
      + '#eb-cookie p{margin:0;flex:1;min-width:220px}'
      + '#eb-cookie .eb-btns{display:flex;gap:10px;flex:none}'
      + '#eb-cookie button{border:0;border-radius:999px;padding:10px 18px;font-size:14px;font-weight:600;cursor:pointer;font-family:inherit}'
      + '#eb-cookie .eb-no{background:transparent;color:#F4EFE8;border:1px solid rgba(244,239,232,.5)}'
      + '#eb-cookie .eb-yes{background:#B2884B;color:#1E2B31}';
    var style = document.createElement('style'); style.textContent = css; document.head.appendChild(style);
    var bar = document.createElement('div');
    bar.id = 'eb-cookie';
    bar.setAttribute('role', 'dialog');
    bar.setAttribute('aria-label', 'Consentement aux cookies');
    bar.innerHTML = '<p>On utilise des cookies de mesure (Facebook) pour améliorer le site et nos publicités. Vous pouvez accepter ou refuser.</p>'
      + '<div class="eb-btns"><button type="button" class="eb-no">Refuser</button><button type="button" class="eb-yes">Accepter</button></div>';
    document.body.appendChild(bar);
    bar.querySelector('.eb-yes').addEventListener('click', function () { setConsent('yes'); });
    bar.querySelector('.eb-no').addEventListener('click', function () { setConsent('no'); });
  }

  if (document.body) showBanner();
  else document.addEventListener('DOMContentLoaded', showBanner);
})();
