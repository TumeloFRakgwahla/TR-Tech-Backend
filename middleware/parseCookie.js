function parseCookie(req, res, next) {
  const cookieHeader = req.headers.cookie;
  if (cookieHeader) {
    req.cookies = {};
    cookieHeader.split(';').forEach((cookie) => {
      const [name, ...rest] = cookie.split('=');
      const value = rest.join('=').trim();
      req.cookies[decodeURIComponent(name.trim())] = value;
    });
  }
  next();
}

module.exports = parseCookie;
