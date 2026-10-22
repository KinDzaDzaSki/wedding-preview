const body = document.body;
const motionReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const hasGsap = typeof window.gsap !== 'undefined';

const previousPage = body.dataset.previous;
const nextPage = body.dataset.next;
const previousNavigationLocked = body.hasAttribute('data-lock-previous');

let navigationLocked = false;
let touchStartY = 0;
let touchStartX = 0;

/* The invitation in reading order. The jump rail and the
  page counter are both built from this, so adding a
   page means editing one array. */
const PAGES = [
  { file: 'index.html', label: 'Поканети сте' },
  { file: 'countdown.html', label: 'Одбројување' },
  { file: 'story.html', label: 'Нашата приказна' },
  { file: 'ceremony.html', label: 'Детали' },
  { file: 'program.html', label: 'Програма' },
  { file: 'details.html', label: 'Дрескод и подароци' },
  { file: 'gallery.html', label: 'Галерија' },
  { file: 'rsvp.html', label: 'Потврда на присуство' },
  { file: 'thank-you.html', label: 'Ви благодариме' },
];

/* ======================================================
   HELPERS
====================================================== */

function isFormElement(element) {
  return (
    element instanceof HTMLInputElement ||
    element instanceof HTMLTextAreaElement ||
    element instanceof HTMLSelectElement ||
    element instanceof HTMLButtonElement
  );
}

function isEnvelopePage() {
  return (
    Boolean(document.querySelector('[data-envelope]')) &&
    !body.classList.contains('home-revealed')
  );
}

function pageCanScroll() {
  return document.documentElement.scrollHeight > window.innerHeight + 4;
}

function isAtVerticalScrollBoundary(direction) {
  const scrollTop = window.scrollY || window.pageYOffset || 0;
  const maxScroll = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);

  if (direction === 'next') {
    return scrollTop <= 4;
  }

  if (direction === 'previous') {
    return scrollTop >= maxScroll - 4;
  }

  return false;
}

function pad(value) {
  return String(value).padStart(2, '0');
}

/* ======================================================
   PAGE NAVIGATION
====================================================== */

function navigateTo(url, direction = 'next') {
  if (!url || navigationLocked) {
    return;
  }

  navigationLocked = true;
  body.dataset.navigationDirection = direction;

  if (hasGsap && !motionReduced) {
    let navigated = false;

    const go = () => {
      if (navigated) {
        return;
      }

      navigated = true;
      window.location.href = url;
    };

    window.gsap.to(body, {
      autoAlpha: 0,
      y: direction === 'previous' ? 24 : -24,
      duration: 0.72,
      ease: 'power3.inOut',
      onComplete: go,
    });

    /* Безбедносна мрежа: ако tween-от не заврши (скриен таб,
       throttled rAF), навигацијата сепак се случува. */
    window.setTimeout(go, 1400);

    return;
  }

  body.classList.add('page-leaving');

  window.setTimeout(() => {
    window.location.href = url;
  }, 400);
}

/* The prev/next controls are real links so the invitation
   still works without JavaScript; here we only take them
   over to play the transition first. */
document.querySelectorAll('[data-go-next]').forEach((control) => {
  control.addEventListener('click', (event) => {
    if (!nextPage) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    navigateTo(nextPage, 'next');
  });
});

document.querySelectorAll('[data-go-previous]').forEach((control) => {
  control.addEventListener('click', (event) => {
    if (previousNavigationLocked) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    if (!previousPage) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    navigateTo(previousPage, 'previous');
  });
});

/* ======================================================
   PROGRESS RAIL
====================================================== */

const progress = document.querySelector('[data-page-progress]');

if (progress) {
  const currentIndex = Number(progress.dataset.pageProgress) - 1;

  const counter = document.createElement('p');
  counter.className = 'page-count';
  counter.innerHTML = `<b>${pad(currentIndex + 1)}</b> <span>/ ${pad(PAGES.length)}</span>`;
  progress.append(counter);

  /* Hidden below 760px / on touch — see .page-dots. */
  const rail = document.createElement('ol');
  rail.className = 'page-dots';

  PAGES.forEach((page, index) => {
    const item = document.createElement('li');
    const link = document.createElement('a');

    link.className = 'page-dot';
    link.href = page.file;
    link.textContent = '';
    link.setAttribute('aria-label', `${index + 1}. ${page.label}`);

    if (index === currentIndex) {
      link.setAttribute('aria-current', 'page');
    }

    link.addEventListener('click', (event) => {
      if (index === currentIndex) {
        event.preventDefault();
        return;
      }

      event.preventDefault();
      navigateTo(page.file, index < currentIndex ? 'previous' : 'next');
    });

    item.append(link);
    rail.append(item);
  });

  progress.prepend(rail);
}

/* ======================================================
   WAX-SEAL ENVELOPE OPENING
====================================================== */

const envelope = document.querySelector('[data-envelope]');

if (envelope) {
  const envelopeTrigger = document.querySelector('[data-envelope-trigger]');
  const viewInvitationButton = document.querySelector('[data-view-invitation]');
  const invitationHome = document.querySelector('[data-invitation-home]');
  const envelopeCover = document.querySelector('[data-envelope-cover]');
  const envelopeShell = envelope.querySelector('[data-wax-envelope]');
  const envelopeFlap = envelope.querySelector('[data-wax-envelope-flap]');
  const envelopeBottomFold = envelope.querySelector('.wax-envelope-fold--bottom');
  const scrollInterior = envelope.querySelector('[data-scroll-interior]');
  const seal = envelope.querySelector('.wax-envelope-seal');
  const parchmentContent = scrollInterior?.querySelectorAll(
    '.ornament, .wax-scroll-kicker, .wax-scroll-header, .wax-scroll-divider, .wax-scroll-message, .button'
  ) || [];
  const homeContent = invitationHome?.querySelectorAll('.reveal') || [];

  let hasOpened = false;

  function makeScrollAccessible() {
    scrollInterior?.setAttribute('aria-hidden', 'false');
    scrollInterior?.removeAttribute('inert');
    body.classList.add('scroll-opened');
  }

  function finishInvitationReveal() {
    body.classList.add('home-revealed');
    invitationHome?.classList.add('is-visible');
    invitationHome?.setAttribute('aria-hidden', 'false');
    invitationHome?.removeAttribute('inert');

    if (envelopeCover) {
      envelopeCover.setAttribute('aria-hidden', 'true');
      envelopeCover.hidden = true;
    }

    invitationHome?.querySelector('[data-go-next]')?.focus({ preventScroll: true });
  }

  if (hasGsap && !motionReduced) {
    body.classList.add('gsap-ready');

    window.gsap.set(invitationHome, {
      display: 'none',
      autoAlpha: 0,
      y: 36,
      scale: 0.98,
    });
    window.gsap.set(homeContent, { autoAlpha: 0, y: 22 });
    window.gsap.set(scrollInterior, { autoAlpha: 0, visibility: 'hidden' });
    window.gsap.set(parchmentContent, { autoAlpha: 0, y: 18 });
    window.gsap.set(envelopeFlap, {
      rotationX: 0,
      transformOrigin: '50% 0%',
    });
    window.gsap.set(envelopeBottomFold, {
      rotationX: 0,
      transformOrigin: '50% 100%',
    });
    window.gsap.from(envelopeShell, {
      autoAlpha: 0,
      y: 28,
      scale: 0.9,
      duration: 1,
      ease: 'power3.out',
    });
  }

  function openScrollFallback() {
    scrollInterior.style.visibility = 'visible';
    scrollInterior.style.opacity = '1';
    scrollInterior.style.top = '18px';
    makeScrollAccessible();
    viewInvitationButton?.focus({ preventScroll: true });
  }

  let scrollTimeline = null;

  function openScrollWithGsap() {
    const inset = window.innerWidth <= 600 ? 18 : 50;
    const openHeight = Math.max(320, window.innerHeight - (inset * 2));

    scrollTimeline = window.gsap.timeline({
      onComplete: () => {
        makeScrollAccessible();
        viewInvitationButton?.focus({ preventScroll: true });
      },
    })
      .to(seal, {
        scale: 1.1,
        rotation: 15,
        autoAlpha: 0,
        duration: 0.5,
        ease: 'power2.in',
      }, 0)
      .to(envelopeFlap, {
        rotationX: 180,
        duration: 0.85,
        ease: 'power2.inOut',
      }, 0.25)
      .to(envelopeBottomFold, {
        rotationX: -180,
        duration: 0.75,
        ease: 'power2.inOut',
      }, 0.42)
      .set(envelopeFlap, { zIndex: 1 }, 1.11)
      .set(envelopeBottomFold, { zIndex: 9 }, 1.17)
      .set(scrollInterior, {
        visibility: 'visible',
        top: inset,
        height: openHeight,
        scale: 0.94,
        y: 30,
      }, 1.12)
      .to(scrollInterior, {
        scale: 1,
        y: 0,
        autoAlpha: 1,
        duration: 0.9,
        ease: 'power3.out',
      }, 1.12)
      .to(envelopeShell, {
        y: 90,
        scale: 0.94,
        autoAlpha: 0,
        duration: 0.7,
        ease: 'power3.inOut',
      }, 1.28)
      .to(parchmentContent, {
        autoAlpha: 1,
        y: 0,
        duration: 0.65,
        stagger: 0.055,
        ease: 'power3.out',
      }, 1.45)
      .set(envelopeShell, { display: 'none' }, 2);
  }

  /* Ако GSAP не напредува (скриен таб, throttled rAF, прекинета
     анимација), поканата не смее да остане заклучена: по 3.2 s
     форсирај ја отворената состојба. */
  function forceScrollOpen() {
    if (body.classList.contains('scroll-opened')) {
      return;
    }

    if (scrollTimeline) {
      scrollTimeline.kill();
    }

    /* .wax-scroll е трансформиран предок, а position: fixed внатре во
       трансформиран елемент се врзува за него — затоа интерјериот се
       преместува директно во <body> пред да се фиксира за екранот. */
    if (scrollInterior && scrollInterior.parentElement !== document.body) {
      document.body.appendChild(scrollInterior);
    }

    body.classList.add('forced-open');
    body.classList.add('scroll-opened');

    if (scrollInterior) {
      scrollInterior.removeAttribute('inert');
      scrollInterior.setAttribute('aria-hidden', 'false');
    }

    makeScrollAccessible();

    if (envelopeCover) {
      envelopeCover.hidden = true;
    }

    viewInvitationButton?.focus({ preventScroll: true });
  }

  function revealInvitation() {
    if (!invitationHome || !envelopeCover) {
      navigateTo(nextPage, 'next');
      return;
    }

    if (!hasGsap || motionReduced) {
      finishInvitationReveal();
      return;
    }

    viewInvitationButton.disabled = true;
    window.gsap.set(invitationHome, { display: 'flex', visibility: 'visible' });

    window.gsap.timeline({ onComplete: finishInvitationReveal })
      .to(envelopeCover, {
        autoAlpha: 0,
        scale: 1.03,
        duration: 0.75,
        ease: 'power2.inOut',
      }, 0)
      .to(invitationHome, {
        autoAlpha: 1,
        y: 0,
        scale: 1,
        duration: 0.85,
        ease: 'power3.out',
      }, 0.18)
      .to(homeContent, {
        autoAlpha: 1,
        y: 0,
        duration: 0.7,
        stagger: 0.06,
        ease: 'power3.out',
      }, 0.32);
  }

  function openScroll() {
    if (hasOpened) {
      return;
    }

    hasOpened = true;
    body.classList.add('scroll-opening');
    envelopeTrigger.setAttribute('aria-expanded', 'true');
    envelopeTrigger.disabled = true;

    if (hasGsap && !motionReduced) {
      openScrollWithGsap();
      window.setTimeout(forceScrollOpen, 3200);
      return;
    }

    openScrollFallback();
  }

  envelopeTrigger?.addEventListener('click', openScroll);
  viewInvitationButton?.addEventListener('click', revealInvitation);
}

if (!envelope && hasGsap && !motionReduced) {
  body.classList.add('gsap-ready');

  const reveals = window.gsap.utils.toArray('.reveal');

  window.gsap.fromTo(reveals, {
    autoAlpha: 0,
    y: 0,
  }, {
    autoAlpha: 1,
    y: 0,
    duration: 0.45,
    stagger: 0.05,
    ease: 'power1.out',
    clearProps: 'transform',
  });
}

const galleryLightbox = document.querySelector('[data-gallery-lightbox]');
const galleryLightboxImage = document.querySelector('[data-gallery-lightbox-image]');
const galleryLightboxCaption = document.querySelector('[data-gallery-lightbox-caption]');
const galleryClose = document.querySelector('[data-gallery-close]');

function closeGalleryLightbox() {
  if (galleryLightbox?.open) {
    galleryLightbox.close();
  }
}

document.querySelectorAll('[data-gallery-photo]').forEach((photo) => {
  photo.addEventListener('click', () => {
    if (!galleryLightbox || !galleryLightboxImage) {
      return;
    }

    const image = photo.querySelector('img');
    galleryLightboxImage.src = photo.dataset.gallerySrc || image?.src || galleryLightboxImage.src;
    galleryLightboxImage.alt = image?.alt || '';

    if (galleryLightboxCaption) {
      galleryLightboxCaption.textContent = image?.alt || 'Теодора & Никола';
    }

    galleryLightbox.showModal();
  });
});

galleryClose?.addEventListener('click', closeGalleryLightbox);
galleryLightbox?.addEventListener('click', (event) => {
  if (event.target === galleryLightbox) {
    closeGalleryLightbox();
  }
});

/* ======================================================
   MOUSE WHEEL NAVIGATION
====================================================== */

let wheelTimeout = null;

window.addEventListener(
  'wheel',
  (event) => {
    if (isEnvelopePage() || navigationLocked) {
      return;
    }

    const isRsvpPage = Boolean(document.querySelector('[data-rsvp-form]'));

    if (isRsvpPage && previousNavigationLocked) {
      return;
    }

    if (Math.abs(event.deltaY) < 30) {
      return;
    }

    if (pageCanScroll() && !isAtVerticalScrollBoundary(event.deltaY > 0 ? 'next' : 'previous')) {
      return;
    }

    const direction = event.deltaY > 0 ? 'next' : 'previous';

    clearTimeout(wheelTimeout);

    wheelTimeout = window.setTimeout(() => {
      navigateTo(direction === 'next' ? nextPage : previousPage, direction);
    }, 80);
  },
  { passive: true }
);

/* ======================================================
   MOBILE SWIPE NAVIGATION
====================================================== */

window.addEventListener(
  'touchstart',
  (event) => {
    if (!event.touches.length) {
      return;
    }

    touchStartY = event.touches[0].clientY;
    touchStartX = event.touches[0].clientX;
  },
  { passive: true }
);

window.addEventListener(
  'touchend',
  (event) => {
    if (isEnvelopePage()) {
      return;
    }

    if (!event.changedTouches.length || navigationLocked) {
      return;
    }

    const hasInteractiveButtonPage = document.querySelector('.wax-scroll-interior [data-view-invitation]') || document.querySelector('.invitation-home [data-go-next]');
    if (hasInteractiveButtonPage) {
      return;
    }

    const isRsvpPage = Boolean(document.querySelector('[data-rsvp-form]'));
    const touch = event.changedTouches[0];
    const deltaY = touch.clientY - touchStartY;
    const deltaX = touch.clientX - touchStartX;
    const swipeThreshold = 32;

    if (Math.abs(deltaY) < swipeThreshold || Math.abs(deltaY) < Math.abs(deltaX)) {
      return;
    }

    if (isRsvpPage && previousNavigationLocked) {
      return;
    }

    if (pageCanScroll()) {
      const atTop = window.scrollY <= 8;
      const atBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 8;

      if (deltaY < 0 && !atBottom) {
        return;
      }

      if (deltaY > 0 && !atTop) {
        return;
      }
    }

    if (deltaY < 0) {
      navigateTo(nextPage, 'next');
      return;
    }

    navigateTo(previousPage, 'previous');
  },
  { passive: true }
);

/* ======================================================
   KEYBOARD NAVIGATION
====================================================== */

window.addEventListener('keydown', (event) => {
  if (isEnvelopePage() || navigationLocked) {
    return;
  }

  if (isFormElement(document.activeElement)) {
    return;
  }

  const nextKeys = ['ArrowDown', 'ArrowRight', 'PageDown'];
  const previousKeys = ['ArrowUp', 'ArrowLeft', 'PageUp'];

  if (nextKeys.includes(event.key)) {
    event.preventDefault();
    navigateTo(nextPage, 'next');
    return;
  }

  if (previousKeys.includes(event.key)) {
    if (previousNavigationLocked) {
      return;
    }

    event.preventDefault();
    navigateTo(previousPage, 'previous');
  }
});

/* ======================================================
   COUNTDOWN
====================================================== */

const countdown = document.querySelector('[data-countdown]');

if (countdown) {
  const weddingDate = new Date(countdown.dataset.weddingDate);

  const daysElement = countdown.querySelector('[data-days]');
  const hoursElement = countdown.querySelector('[data-hours]');
  const minutesElement = countdown.querySelector('[data-minutes]');
  const secondsElement = countdown.querySelector('[data-seconds]');

  /* The four numerals tick every second, so they stay out of
     the accessibility tree; screen readers get one sentence
     that is only rewritten when the day count changes. */
  const summary = document.querySelector('[data-countdown-summary]');
  let announcedDays = null;

  function daysWord(count) {
    return count === 1 ? 'ден' : 'дена';
  }

  function updateCountdown() {
    const difference = Math.max(0, weddingDate.getTime() - Date.now());

    const second = 1000;
    const minute = second * 60;
    const hour = minute * 60;
    const day = hour * 24;

    const days = Math.floor(difference / day);
    const hours = Math.floor((difference % day) / hour);
    const minutes = Math.floor((difference % hour) / minute);
    const seconds = Math.floor((difference % minute) / second);

    if (daysElement) daysElement.textContent = pad(days);
    if (hoursElement) hoursElement.textContent = pad(hours);
    if (minutesElement) minutesElement.textContent = pad(minutes);
    if (secondsElement) secondsElement.textContent = pad(seconds);

    if (summary && days !== announcedDays) {
      announcedDays = days;

      summary.textContent = difference === 0
        ? 'Денот е тука.'
        : `Остануваат уште ${days} ${daysWord(days)} до 15 мај 2027.`;
    }
  }

  updateCountdown();
  window.setInterval(updateCountdown, 1000);
}

/* ======================================================
   RSVP FORM
====================================================== */

const rsvpForm = document.querySelector('[data-rsvp-form]');

if (rsvpForm) {
  const messageElement = rsvpForm.querySelector('[data-form-message]');
  const nameElement = rsvpForm.querySelector('[name="name"]');
  const attendanceElement = rsvpForm.querySelector('[name="attendance"]');
  const guestsGroup = rsvpForm.querySelector('[data-guests-group]');
  /* Остави празно за демо режим (одговорот останува само во конзолата).
     За вистински одговори стави URL од Google Apps Script / Formspree. */
  const GOOGLE_SHEETS_WEB_APP_URL = '';

  function syncGuestsVisibility() {
    if (!guestsGroup || !attendanceElement) {
      return;
    }

    guestsGroup.hidden = attendanceElement.value === 'no';
  }

  function setMessage(text, isError) {
    if (!messageElement) {
      return;
    }

    messageElement.textContent = text;
    messageElement.classList.toggle('is-error', Boolean(isError));
  }

  attendanceElement?.addEventListener('change', () => {
    syncGuestsVisibility();
    attendanceElement.removeAttribute('aria-invalid');
  });

  nameElement?.addEventListener('input', () => {
    nameElement.removeAttribute('aria-invalid');
  });

  syncGuestsVisibility();

  rsvpForm.addEventListener('submit', async (event) => {
    event.preventDefault();

    const formData = new FormData(rsvpForm);

    const name = formData.get('name')?.toString().trim();
    const attendance = formData.get('attendance')?.toString();
    const guests = formData.get('guests')?.toString();
    const message = formData.get('message')?.toString().trim();

    if (!name) {
      nameElement?.setAttribute('aria-invalid', 'true');
      setMessage('Внесете го Вашето име и презиме за да ја испратиме потврдата.', true);
      nameElement?.focus();
      return;
    }

    if (!attendance) {
      attendanceElement?.setAttribute('aria-invalid', 'true');
      setMessage('Изберете дали ќе присуствувате.', true);
      attendanceElement?.focus();
      return;
    }

    const payload = {
      name,
      attendance,
      guests: attendance === 'no' ? '0' : (guests || '1'),
      message: message || '',
      timestamp: new Date().toISOString(),
    };

    if (!GOOGLE_SHEETS_WEB_APP_URL) {
      console.info('[RSVP] DEMO — одговорот не е испратен:', payload);
    } else {
    try {
      const response = await fetch(GOOGLE_SHEETS_WEB_APP_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
        },
        body: new URLSearchParams(payload).toString(),
      });

      if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new Error(`HTTP ${response.status}${text ? `: ${text}` : ''}`);
      }
    } catch (error) {
      console.error('Грешка при испраќање во Google Sheet:', error);
      setMessage('Не успеа да се испрати одговорот. Обидете се повторно.', true);
      return;
    }
    }

    setMessage(
      attendance === 'yes'
        ? `Ви благодариме, ${name}. Ве очекуваме на 15 мај 2027.`
        : `Ви благодариме што нè известивте, ${name}. Ќе ни недостасувате.`,
      false
    );

    const submitButton = rsvpForm.querySelector('[type="submit"]');

    if (submitButton) {
      submitButton.disabled = true;
      submitButton.textContent = 'Одговорот е испратен';
    }

    window.setTimeout(() => navigateTo('thank-you.html', 'next'), 1600);
  });
}


/* ======================================================
   BACKGROUND MUSIC
====================================================== */

const musicToggle = document.querySelector('[data-music-toggle]');
const musicLoop = document.querySelector('[data-music-loop]');

if (musicToggle && musicLoop) {
  musicToggle.addEventListener('click', async () => {
    const playing = musicToggle.getAttribute('aria-pressed') === 'true';

    if (playing) {
      musicLoop.pause();
      musicToggle.setAttribute('aria-pressed', 'false');
      musicToggle.setAttribute('aria-label', 'Пушти музика во позадина');
      musicToggle.textContent = '♪';
      return;
    }

    try {
      musicLoop.volume = 0.3;
      await musicLoop.play();
      musicToggle.setAttribute('aria-pressed', 'true');
      musicToggle.setAttribute('aria-label', 'Паузирај музика');
      musicToggle.textContent = '❙❙';
    } catch (error) {
      console.info('Музиката не може да се пушти:', error);
    }
  });
}
