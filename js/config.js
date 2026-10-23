/* ======================================================
   API configuration
   ------------------------------------------------------
   '' (празно)  → демо режим: формата валидира и покажува
                  успех, но ништо не се праќа никаде.
   Worker URL   → на пр. https://wedding-invite.<account>.workers.dev
   ------------------------------------------------------
   За тестирање може и преку адреса:  ?api=http://127.0.0.1:8787
====================================================== */

window.WEDDING_API = window.WEDDING_API || '';

try {
  const override = new URLSearchParams(window.location.search).get('api');
  if (override) {
    window.WEDDING_API = override.replace(/\/+$/, '');
  }
} catch (error) {
  /* стар прелистувач — останува default-от */
}
