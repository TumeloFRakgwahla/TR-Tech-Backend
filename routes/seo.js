const express = require('express');
const router = express.Router();

router.get('/robots.txt', (req, res) => {
  const robots = `User-agent: *
Allow: /
Disallow: /admin/
Disallow: /account/
Disallow: /api/

Sitemap: https://trtech.co.za/sitemap.xml
`;
  res.setHeader('Content-Type', 'text/plain');
  res.send(robots);
});

router.get('/sitemap.xml', (req, res) => {
  const baseUrl = 'https://trtech.co.za';
  const staticPages = [
    { url: `${baseUrl}/`, priority: '1.0', changefreq: 'daily' },
    { url: `${baseUrl}/shop`, priority: '0.9', changefreq: 'daily' },
    { url: `${baseUrl}/about`, priority: '0.8', changefreq: 'weekly' },
    { url: `${baseUrl}/services`, priority: '0.8', changefreq: 'weekly' },
    { url: `${baseUrl}/contact`, priority: '0.7', changefreq: 'monthly' },
    { url: `${baseUrl}/book-repair`, priority: '0.8', changefreq: 'weekly' },
    { url: `${baseUrl}/wishlist`, priority: '0.6', changefreq: 'weekly' },
    { url: `${baseUrl}/cart`, priority: '0.6', changefreq: 'weekly' },
    { url: `${baseUrl}/checkout`, priority: '0.6', changefreq: 'weekly' },
    { url: `${baseUrl}/track-order`, priority: '0.5', changefreq: 'monthly' },
  ];

  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${staticPages.map(page => `  <url>
    <loc>${page.url}</loc>
    <priority>${page.priority}</priority>
    <changefreq>${page.changefreq}</changefreq>
  </url>`).join('\n')}
</urlset>`;

  res.setHeader('Content-Type', 'application/xml');
  res.send(sitemap);
});

module.exports = router;
