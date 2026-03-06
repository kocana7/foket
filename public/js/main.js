/* ============================================================
   FoketCrypto - Main JavaScript
   ============================================================ */

// Language switcher
document.addEventListener('DOMContentLoaded', function () {

  // Mobile menu toggle
  const hamburger = document.getElementById('hamburger');
  const mobileMenu = document.getElementById('mobileMenu');
  if (hamburger && mobileMenu) {
    hamburger.addEventListener('click', () => {
      mobileMenu.classList.toggle('open');
      hamburger.innerHTML = mobileMenu.classList.contains('open') ? '&#10005;' : '&#9776;';
    });
  }

  // Language dropdown
  const langToggle = document.getElementById('langToggle');
  const langMenu = document.getElementById('langMenu');
  if (langToggle && langMenu) {
    langToggle.addEventListener('click', (e) => {
      e.stopPropagation();
      langMenu.classList.toggle('open');
    });
    document.addEventListener('click', () => langMenu.classList.remove('open'));
  }

  // Ticker duplication for seamless scroll
  const tickerInner = document.querySelector('.ticker-inner');
  if (tickerInner) {
    tickerInner.innerHTML += tickerInner.innerHTML;
  }

  // Animated counter
  const counters = document.querySelectorAll('[data-count]');
  counters.forEach(el => {
    const target = parseInt(el.getAttribute('data-count').replace(/[^0-9]/g, ''), 10);
    const suffix = el.getAttribute('data-count').replace(/[0-9]/g, '');
    const duration = 2000;
    const step = target / (duration / 16);
    let current = 0;
    const update = () => {
      current = Math.min(current + step, target);
      el.textContent = Math.floor(current).toLocaleString() + suffix;
      if (current < target) requestAnimationFrame(update);
    };
    const observer = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting) {
        update();
        observer.disconnect();
      }
    });
    observer.observe(el);
  });

  // Smooth scroll for anchor links
  document.querySelectorAll('a[href^="#"]').forEach(a => {
    a.addEventListener('click', e => {
      const target = document.querySelector(a.getAttribute('href'));
      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  });

  // Auto-dismiss alerts
  document.querySelectorAll('.alert').forEach(alert => {
    setTimeout(() => {
      alert.style.transition = 'opacity 0.5s';
      alert.style.opacity = '0';
      setTimeout(() => alert.remove(), 500);
    }, 4000);
  });

  // Load live crypto prices
  loadCryptoPrices();

  // Navbar scroll effect
  const navbar = document.querySelector('.navbar');
  if (navbar) {
    window.addEventListener('scroll', () => {
      if (window.scrollY > 50) {
        navbar.style.boxShadow = '0 4px 24px rgba(0,0,0,0.4)';
      } else {
        navbar.style.boxShadow = 'none';
      }
    });
  }

  // Signal filter buttons
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', function () {
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      this.classList.add('active');
    });
  });
});

// Load crypto prices from API
async function loadCryptoPrices() {
  try {
    const res = await fetch('/api/prices');
    const data = await res.json();
    if (!data.success) return;

    const ticker = document.querySelector('.ticker-inner');
    if (!ticker) return;

    ticker.innerHTML = data.data.map(c => `
      <div class="ticker-item">
        <span class="coin-symbol">${c.coin}</span>
        <span class="price">$${Number(c.price).toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
        <span class="change ${c.change24h >= 0 ? 'up' : 'down'}">${c.change24h >= 0 ? '+' : ''}${c.change24h.toFixed(2)}%</span>
      </div>
    `).join('');

    // Duplicate for scrolling
    ticker.innerHTML += ticker.innerHTML;

    // Update coin cards
    data.data.forEach(c => {
      const priceEl = document.querySelector(`[data-coin-price="${c.coin}"]`);
      const changeEl = document.querySelector(`[data-coin-change="${c.coin}"]`);
      if (priceEl) priceEl.textContent = '$' + Number(c.price).toLocaleString('en', { maximumFractionDigits: 4 });
      if (changeEl) {
        changeEl.textContent = (c.change24h >= 0 ? '+' : '') + c.change24h.toFixed(2) + '%';
        changeEl.className = 'coin-card-change ' + (c.change24h >= 0 ? 'up' : 'down');
      }
    });
  } catch (e) {
    // Silently fail - use static data
  }
}

// Copy to clipboard utility
function copyToClipboard(text) {
  navigator.clipboard.writeText(text).then(() => {
    showToast('Copied!', 'success');
  });
}

// Toast notification
function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  toast.style.cssText = `
    position: fixed; bottom: 24px; right: 24px; z-index: 9999;
    background: ${type === 'success' ? '#00d084' : '#00b4d8'};
    color: white; padding: 12px 20px; border-radius: 8px;
    font-size: 14px; font-weight: 600; box-shadow: 0 8px 24px rgba(0,0,0,0.3);
    animation: slideIn 0.3s ease;
  `;
  document.body.appendChild(toast);
  setTimeout(() => {
    toast.style.animation = 'fadeOut 0.3s ease forwards';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}
