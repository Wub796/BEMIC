import './style.css';
import { initHeroCanvas } from './hero-canvas.js';
import { SuanpanAbacus } from './abacus.js';
import { TranslationSystem } from './bilingual.js';
import { soundSynth } from './sound.js';

// --- Numerical Translation Helpers (EN / ZH / Pinyin) ---

const enUnits = ['Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 
                 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const enTens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function convertToEnglish(num) {
  if (num === 0) return 'Zero';
  if (num < 20) return enUnits[num];
  
  if (num < 100) {
    const ten = Math.floor(num / 10);
    const unit = num % 10;
    return enTens[ten] + (unit ? '-' + enUnits[unit] : '');
  }
  
  if (num < 1000) {
    const hundred = Math.floor(num / 100);
    const rem = num % 100;
    return enUnits[hundred] + ' Hundred' + (rem ? ' and ' + convertToEnglish(rem) : '');
  }
  
  if (num < 1000000) {
    const thousand = Math.floor(num / 1000);
    const rem = num % 1000;
    return convertToEnglish(thousand) + ' Thousand' + (rem ? ' ' + convertToEnglish(rem) : '');
  }
  
  if (num < 100000000) {
    const million = Math.floor(num / 1000000);
    const rem = num % 1000000;
    return convertToEnglish(million) + ' Million' + (rem ? ' ' + convertToEnglish(rem) : '');
  }
  
  return num.toString(); // Fallback for extremely large numbers
}

const zhDigits = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
const pyDigits = ['líng', 'yī', 'èr', 'sān', 'sì', 'wǔ', 'liù', 'qī', 'bā', 'jiǔ'];

const zhUnits = ['', '十', '百', '千'];
const pyUnits = ['', 'shí', 'bǎi', 'qiān'];

function convertToChineseAndPinyin(num) {
  if (num === 0) return { zh: '零', py: 'líng' };
  
  let zhStr = '';
  let pyStr = [];

  // Break number into groups of 4 digits (Wan / 万 system)
  const groups = [];
  let temp = num;
  while (temp > 0) {
    groups.push(temp % 10000);
    temp = Math.floor(temp / 10000);
  }

  const groupUnits = ['', '万', '亿'];
  const groupPyUnits = ['', 'wàn', 'yì'];

  for (let g = groups.length - 1; g >= 0; g--) {
    const val = groups[g];
    if (val === 0) {
      // If a group is zero, skip it unless it's the middle zero
      continue;
    }

    let groupZh = '';
    let groupPy = [];
    
    const thousand = Math.floor(val / 1000);
    const hundred = Math.floor((val % 1000) / 100);
    const ten = Math.floor((val % 100) / 10);
    const unit = val % 10;

    // Thousands
    if (thousand > 0) {
      groupZh += zhDigits[thousand] + '千';
      groupPy.push(pyDigits[thousand], 'qiān');
    } else if (zhStr !== '' && val >= 100) {
      groupZh += '零';
      groupPy.push('líng');
    }

    // Hundreds
    if (hundred > 0) {
      groupZh += zhDigits[hundred] + '百';
      groupPy.push(pyDigits[hundred], 'bǎi');
    } else if (thousand > 0 && (ten > 0 || unit > 0)) {
      groupZh += '零';
      groupPy.push('líng');
    }

    // Tens
    if (ten > 0) {
      // Special case: ten to nineteen at the beginning of spoken numbers (e.g. 12 is 十二, not 一十二)
      if (ten === 1 && thousand === 0 && hundred === 0 && zhStr === '') {
        groupZh += '十';
        groupPy.push('shí');
      } else {
        groupZh += zhDigits[ten] + '十';
        groupPy.push(pyDigits[ten], 'shí');
      }
    } else if (hundred > 0 && unit > 0) {
      groupZh += '零';
      groupPy.push('líng');
    }

    // Units
    if (unit > 0) {
      groupZh += zhDigits[unit];
      groupPy.push(pyDigits[unit]);
    }

    // Add group unit suffix (Wan / Yi)
    if (g > 0) {
      groupZh += groupUnits[g];
      groupPy.push(groupPyUnits[g]);
    }

    zhStr += groupZh;
    pyStr = pyStr.concat(groupPy);
  }

  // Deduplicate consecutive "líng" in pinyin
  const cleanPy = [];
  for (let i = 0; i < pyStr.length; i++) {
    if (pyStr[i] === 'líng' && cleanPy[cleanPy.length - 1] === 'líng') {
      continue;
    }
    cleanPy.push(pyStr[i]);
  }

  return {
    zh: zhStr,
    py: cleanPy.join(' ')
  };
}


// --- Main Application Lifecycle ---

document.addEventListener('DOMContentLoaded', () => {
  
  // 1. Initialize 3D Hero Particles background
  const cleanHeroCanvas = initHeroCanvas();

  // 2. Initialize Translation System
  const translator = new TranslationSystem();
  translator.init();

  // Language buttons toggle click handler
  const btnEn = document.getElementById('lang-en');
  const btnZh = document.getElementById('lang-zh');
  const langToggleBtn = document.getElementById('lang-toggle');

  function updateActiveLangButtons(lang) {
    if (lang === 'en') {
      btnEn.classList.add('active');
      btnZh.classList.remove('active');
    } else {
      btnZh.classList.add('active');
      btnEn.classList.remove('active');
    }
  }

  updateActiveLangButtons(translator.currentLanguage);

  langToggleBtn.addEventListener('click', () => {
    const nextLang = translator.currentLanguage === 'en' ? 'zh' : 'en';
    translator.setLanguage(nextLang);
    updateActiveLangButtons(nextLang);
    soundSynth.playClack(0.5); // Faint click sound on interaction
  });

  // 4. Challenge Mode State
  let challengeActive = false;
  let challengeNumber = 0;
  let score = 0;
  
  const btnChallenge = document.getElementById('btn-challenge');
  const challengeBox = document.getElementById('challenge-box');
  const challengeNumLabel = document.getElementById('challenge-number');
  const challengeScoreLabel = document.getElementById('challenge-score');
  const challengeSuccessAlert = document.getElementById('challenge-success');

  // 3. Initialize 3D Abacus System
  const readoutNum = document.getElementById('readout-number');
  const readoutEn = document.getElementById('readout-en');
  const readoutZh = document.getElementById('readout-zh');
  const readoutPinyin = document.getElementById('readout-pinyin');

  // Rolling odometer animation helper
  let currentReadoutVal = 0;
  let readoutAnimationId = null;

  function updateReadoutWithAnimation(targetVal) {
    if (readoutAnimationId) {
      cancelAnimationFrame(readoutAnimationId);
    }
    const startVal = currentReadoutVal;
    const startTime = performance.now();
    const duration = 280; // ms

    function step(now) {
      const progress = Math.min(1, (now - startTime) / duration);
      const ease = progress * (2 - progress); // easeOutQuad
      currentReadoutVal = Math.round(startVal + (targetVal - startVal) * ease);
      readoutNum.textContent = currentReadoutVal.toLocaleString();
      if (progress < 1) {
        readoutAnimationId = requestAnimationFrame(step);
      } else {
        currentReadoutVal = targetVal;
        readoutNum.textContent = targetVal.toLocaleString();
      }
    }
    readoutAnimationId = requestAnimationFrame(step);
  }

  const abacus = new SuanpanAbacus('abacus-canvas', (value, rodValues) => {
    // Value change callback with rolling odometer
    updateReadoutWithAnimation(value);
    
    // Convert current abacus number to words
    readoutEn.textContent = convertToEnglish(value);
    
    const zhPy = convertToChineseAndPinyin(value);
    readoutZh.textContent = zhPy.zh;
    readoutPinyin.textContent = zhPy.py;

    // Check challenge condition
    checkChallenge(value);
  });
  
  abacus.init();

  // Setup buttons
  const btnReset = document.getElementById('btn-reset');
  btnReset.addEventListener('click', () => {
    abacus.reset();
  });

  // Sound Mute Toggle Logic
  const btnMute = document.getElementById('btn-mute');
  const iconSoundOn = document.getElementById('icon-sound-on');
  const iconSoundOff = document.getElementById('icon-sound-off');

  btnMute.addEventListener('click', () => {
    const isMuted = soundSynth.toggleMute();
    if (isMuted) {
      iconSoundOn.style.display = 'none';
      iconSoundOff.style.display = 'block';
    } else {
      iconSoundOn.style.display = 'block';
      iconSoundOff.style.display = 'none';
      soundSynth.playClack(0.6); // Feedback click
    }
  });

  btnChallenge.addEventListener('click', () => {
    soundSynth.playClack(0.7);
    challengeActive = !challengeActive;

    if (challengeActive) {
      challengeBox.classList.add('active');
      btnChallenge.classList.add('btn-primary');
      btnChallenge.classList.remove('btn-secondary');
      
      // Update button text using translation keys dynamically
      btnChallenge.setAttribute('data-i18n', 'abacus_mode_explore');
      btnChallenge.textContent = translator.currentLanguage === 'zh' ? '自由探索' : 'Free Explore';
      
      generateNewChallenge();
    } else {
      challengeBox.classList.remove('active');
      challengeSuccessAlert.classList.remove('active');
      btnChallenge.classList.remove('btn-primary');
      btnChallenge.classList.add('btn-secondary');
      
      btnChallenge.setAttribute('data-i18n', 'abacus_mode_challenge');
      btnChallenge.textContent = translator.currentLanguage === 'zh' ? '开始挑战' : 'Start Challenge';
    }
  });

  function generateNewChallenge() {
    challengeSuccessAlert.classList.remove('active');
    
    // Choose appropriate early-math numbers (e.g. 1 to 99)
    challengeNumber = Math.floor(Math.random() * 95) + 3; // 3 to 98
    challengeNumLabel.textContent = challengeNumber;
    
    // Automatically clear/reset abacus to make it clean for a new game
    abacus.reset();
  }

  function checkChallenge(currentValue) {
    if (!challengeActive) return;

    if (currentValue === challengeNumber) {
      score += 10;
      challengeScoreLabel.textContent = score;
      challengeSuccessAlert.classList.add('active');
      
      // Trigger a success synthesizer chime
      playSuccessChime();

      // Automatically generate a new challenge after a small delay
      setTimeout(() => {
        if (challengeActive) {
          generateNewChallenge();
        }
      }, 2000);
    }
  }

  // Synthesize a cute two-tone success sound (major third/perfect fifth)
  function playSuccessChime() {
    soundSynth.init();
    if (!soundSynth.audioCtx || soundSynth.muted) return;
    
    const now = soundSynth.audioCtx.currentTime;
    const osc1 = soundSynth.audioCtx.createOscillator();
    const osc2 = soundSynth.audioCtx.createOscillator();
    const gain1 = soundSynth.audioCtx.createGain();
    const gain2 = soundSynth.audioCtx.createGain();

    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(523.25, now); // C5
    osc1.frequency.setValueAtTime(659.25, now + 0.12); // E5 (arpeggio)

    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(783.99, now + 0.2); // G5

    gain1.gain.setValueAtTime(0, now);
    gain1.gain.linearRampToValueAtTime(0.12, now + 0.05);
    gain1.gain.exponentialRampToValueAtTime(0.0001, now + 0.6);

    gain2.gain.setValueAtTime(0, now);
    gain2.gain.linearRampToValueAtTime(0.1, now + 0.25);
    gain2.gain.exponentialRampToValueAtTime(0.0001, now + 0.7);

    osc1.connect(gain1);
    osc2.connect(gain2);
    
    gain1.connect(soundSynth.audioCtx.destination);
    gain2.connect(soundSynth.audioCtx.destination);

    osc1.start(now);
    osc2.start(now);
    osc1.stop(now + 0.8);
    osc2.stop(now + 0.8);
  }

  // 5. Card Spotlight mouse interaction
  const setupCardSpotlight = () => {
    document.querySelectorAll('.spotlight-card').forEach(card => {
      let rect = card.getBoundingClientRect();
      
      const updateRect = () => {
        rect = card.getBoundingClientRect();
      };
      
      const resizeObserver = new ResizeObserver(() => updateRect());
      resizeObserver.observe(card);

      card.addEventListener('pointermove', (e) => {
        const x = ((e.clientX - rect.left) / rect.width) * 100;
        const y = ((e.clientY - rect.top) / rect.height) * 100;
        card.style.setProperty('--mouse-x', `${x}%`);
        card.style.setProperty('--mouse-y', `${y}%`);
      });
    });
  };
  
  setupCardSpotlight();

  // 6. Intersection Observer for Scroll Reveals
  const scrollElements = document.querySelectorAll('.scroll-reveal');
  const scrollObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('reveal-active');
      }
    });
  }, {
    threshold: 0.1,
    rootMargin: '0px 0px -100px 0px' // Trigger slightly before element fits in frame
  });

  scrollElements.forEach(el => scrollObserver.observe(el));

  // 7. Fallback Scroll Listener for Header Shrink (Firefox support)
  if (!CSS.supports('(animation-timeline: scroll()) and (animation-range: 0% 100%)')) {
    const header = document.querySelector('header');
    
    window.addEventListener('scroll', () => {
      if (window.scrollY > 50) {
        header.style.padding = '0.8rem 2rem';
        header.style.background = 'rgba(7, 9, 14, 0.9)';
        header.style.backdropFilter = 'blur(20px)';
        header.style.webkitBackdropFilter = 'blur(20px)';
        header.style.borderBottom = '1px solid rgba(255, 255, 255, 0.06)';
        header.style.boxShadow = '0 10px 30px rgba(0, 0, 0, 0.4)';
      } else {
        header.style.padding = '1.5rem 2rem';
        header.style.background = 'transparent';
        header.style.backdropFilter = 'none';
        header.style.webkitBackdropFilter = 'none';
        header.style.borderBottom = '1px solid transparent';
        header.style.boxShadow = 'none';
      }
    });
  }

  // 8. Contact Form Handling
  const inquiryForm = document.getElementById('inquiry-form');
  const successMsg = document.getElementById('form-success');
  const submitBtn = document.getElementById('btn-submit');

  inquiryForm.addEventListener('submit', (e) => {
    e.preventDefault();

    const name = document.getElementById('form-name');
    const email = document.getElementById('form-email');
    const message = document.getElementById('form-message');
    
    // Simple custom validation visual styles
    let valid = true;
    [name, email, message].forEach(input => {
      if (!input.value.trim()) {
        input.style.borderColor = 'var(--secondary)';
        valid = false;
      } else {
        input.style.borderColor = 'var(--border-glow)';
      }
    });

    if (valid) {
      soundSynth.playClack(0.9);
      
      // Simulate form submission success
      successMsg.classList.add('active');
      submitBtn.disabled = true;
      submitBtn.style.opacity = '0.5';

      // Open user's email client with pre-filled details to actually send it!
      const roleSelect = document.getElementById('form-role');
      const roleText = roleSelect ? roleSelect.options[roleSelect.selectedIndex].text : '';
      
      const mailtoUrl = `mailto:emmahao2022@gmail.com?subject=${encodeURIComponent('BEMIC Center Inquiry')}&body=${encodeURIComponent(
        `Name: ${name.value}\nEmail: ${email.value}\nRole: ${roleText}\n\nMessage:\n${message.value}`
      )}`;
      
      // Trigger mail client open
      window.location.href = mailtoUrl;

      setTimeout(() => {
        inquiryForm.reset();
        successMsg.classList.remove('active');
        submitBtn.disabled = false;
        submitBtn.style.opacity = '1';
      }, 5000);
    }
  });

  // 9. Custom Cursor & Physics Trailing Logic
  const cursorDot = document.getElementById('custom-cursor-dot');
  const cursorRing = document.getElementById('custom-cursor-ring');

  if (cursorDot && cursorRing) {
    let mouseX = 0;
    let mouseY = 0;
    let ringX = 0;
    let ringY = 0;
    let isMoving = false;

    // Hide cursors initially
    cursorDot.style.opacity = '0';
    cursorRing.style.opacity = '0';

    window.addEventListener('pointermove', (e) => {
      mouseX = e.clientX;
      mouseY = e.clientY;
      
      // Make them visible on first movement
      if (!isMoving) {
        cursorDot.style.opacity = '1';
        cursorRing.style.opacity = '1';
        isMoving = true;
      }
      
      // Instant snap for the inner dot
      cursorDot.style.left = `${mouseX}px`;
      cursorDot.style.top = `${mouseY}px`;
    });

    // Physics trailing loop for outer ring
    function updateCursorRing() {
      // Lerp calculations: Ring coordinates approach mouse coordinates
      ringX += (mouseX - ringX) * 0.16;
      ringY += (mouseY - ringY) * 0.16;

      cursorRing.style.left = `${ringX}px`;
      cursorRing.style.top = `${ringY}px`;
      
      requestAnimationFrame(updateCursorRing);
    }
    updateCursorRing();

    // Hover triggers
    const hoverTargets = 'a, button, select, input, textarea, .abacus-canvas-wrap, .lang-toggle';
    
    document.body.addEventListener('pointerover', (e) => {
      if (e.target.closest(hoverTargets)) {
        cursorRing.classList.add('hovered');
      }
    });

    document.body.addEventListener('pointerout', (e) => {
      if (e.target.closest(hoverTargets)) {
        cursorRing.classList.remove('hovered');
      }
    });

    // Click triggers
    window.addEventListener('pointerdown', () => {
      cursorRing.classList.add('clicked');
    });

    window.addEventListener('pointerup', () => {
      cursorRing.classList.remove('clicked');
    });
  }

  // Handle hot module replacement cleaning to prevent duplicate event loops
  window.addEventListener('beforeunload', () => {
    cleanHeroCanvas();
    abacus.destroy();
  });
});
