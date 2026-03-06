// Admin authentication middleware
function requireAdmin(req, res, next) {
  if (req.session && req.session.admin) {
    return next();
  }
  req.flash('error_msg', 'Please login to access the admin panel');
  res.redirect('/admin/login');
}

function requireSuperAdmin(req, res, next) {
  if (req.session && req.session.admin && req.session.admin.role === 'superadmin') {
    return next();
  }
  req.flash('error_msg', 'Access denied');
  res.redirect('/admin');
}

module.exports = { requireAdmin, requireSuperAdmin };
