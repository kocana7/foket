/* ============================================================
   FoketCrypto Admin Panel JavaScript
   ============================================================ */

document.addEventListener('DOMContentLoaded', function () {

  // Mobile sidebar toggle
  const sidebarToggle = document.getElementById('sidebarToggle');
  const sidebar = document.querySelector('.admin-sidebar');
  if (sidebarToggle && sidebar) {
    sidebarToggle.addEventListener('click', () => {
      sidebar.classList.toggle('open');
    });
  }

  // Active sidebar link
  const currentPath = window.location.pathname;
  document.querySelectorAll('.sidebar-link').forEach(link => {
    if (link.getAttribute('href') === currentPath ||
        (currentPath.startsWith(link.getAttribute('href')) && link.getAttribute('href') !== '/admin')) {
      link.classList.add('active');
    }
  });

  // Auto-dismiss alerts
  document.querySelectorAll('.admin-alert').forEach(alert => {
    setTimeout(() => {
      alert.style.transition = 'opacity 0.5s';
      alert.style.opacity = '0';
      setTimeout(() => alert.remove(), 500);
    }, 5000);
  });

  // Confirm delete actions
  document.querySelectorAll('form[data-confirm]').forEach(form => {
    form.addEventListener('submit', function (e) {
      if (!confirm(this.getAttribute('data-confirm') || 'Are you sure?')) {
        e.preventDefault();
      }
    });
  });

  // Simple slug generator
  const titleInput = document.querySelector('[data-slug-source]');
  const slugInput = document.querySelector('[data-slug-target]');
  if (titleInput && slugInput) {
    titleInput.addEventListener('input', function () {
      if (!slugInput.dataset.manuallySet) {
        slugInput.value = this.value
          .toLowerCase()
          .replace(/[^a-z0-9가-힣ㄱ-ㅎ ]/g, '')
          .replace(/\s+/g, '-')
          .replace(/-+/g, '-')
          .trim();
      }
    });
    slugInput.addEventListener('input', () => { slugInput.dataset.manuallySet = 'true'; });
  }

  // Chart placeholders (integrate Chart.js if needed)
  renderDashboardCharts();
});

function renderDashboardCharts() {
  // Signal result donut chart
  const chartEl = document.getElementById('signalResultChart');
  if (!chartEl) return;
  if (typeof Chart === 'undefined') return;

  const wins = parseInt(chartEl.dataset.wins || 0);
  const losses = parseInt(chartEl.dataset.losses || 0);
  const pending = parseInt(chartEl.dataset.pending || 0);

  new Chart(chartEl, {
    type: 'doughnut',
    data: {
      labels: ['Win', 'Loss', 'Pending'],
      datasets: [{
        data: [wins, losses, pending],
        backgroundColor: ['#3fb950', '#f85149', '#58a6ff'],
        borderWidth: 0
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom',
          labels: { color: '#8b949e', padding: 16, font: { size: 12 } }
        }
      },
      cutout: '70%'
    }
  });
}

// Toggle active status via AJAX (for quick actions)
function toggleStatus(id, type) {
  if (!confirm('Toggle status?')) return;
  const form = document.createElement('form');
  form.method = 'POST';
  form.action = `/admin/${type}/${id}/toggle`;
  document.body.appendChild(form);
  form.submit();
}
