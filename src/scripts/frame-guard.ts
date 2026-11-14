// Clickjacking guard: a <meta> CSP cannot set frame-ancestors, so refuse to render inside a foreign frame.
if (window.top !== window.self) {
  try {
    window.top!.location.replace(window.location.href);
  } catch {
    document.documentElement.style.display = 'none';
  }
}
