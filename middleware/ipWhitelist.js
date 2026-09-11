const Settings = require('../models/Settings');

const parseIpList = (raw) => {
  if (!raw || typeof raw !== 'string') return [];
  return raw
    .split(/[,\n;]+/)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
};

const isIpInList = (ip, list) => {
  if (!ip || !list.length) return true;
  return list.some((entry) => {
    if (entry.includes('/')) {
      const [network, prefix] = entry.split('/');
      const ipInt = ip.split('.').reduce((acc, octet) => (acc << 8) + parseInt(octet, 10), 0);
      const mask = prefix ? ~((1 << (32 - parseInt(prefix, 10))) - 1) >>> 0 : 0xFFFFFFFF;
      const networkInt = network.split('.').reduce((acc, octet) => (acc << 8) + parseInt(octet, 10), 0);
      return (ipInt & mask) === (networkInt & mask);
    }
    return ip === entry;
  });
};

let cachedWhitelist = [];
let cacheTimestamp = 0;
const CACHE_TTL_MS = 5 * 60 * 1000;

const loadWhitelist = async () => {
  const now = Date.now();
  if (cachedWhitelist.length && now - cacheTimestamp < CACHE_TTL_MS) {
    return cachedWhitelist;
  }
  const settings = await Settings.findOne();
  cachedWhitelist = parseIpList(settings?.security?.ipWhitelist || '');
  cacheTimestamp = now;
  return cachedWhitelist;
};

const invalidateWhitelistCache = () => {
  cachedWhitelist = [];
  cacheTimestamp = 0;
};

const ipWhitelist = async (req, res, next) => {
  try {
    const whitelist = await loadWhitelist();
    if (!whitelist.length) return next();

    const clientIp = req.ip || req.connection?.remoteAddress || req.socket?.remoteAddress || '';
    const normalizedClientIp = clientIp.replace(/^::ffff:/, '');

    if (!isIpInList(normalizedClientIp, whitelist)) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Your IP address is not whitelisted.'
      });
    }

    next();
  } catch (error) {
    console.error('IP whitelist middleware error:', error);
    next(error);
  }
};

module.exports = { ipWhitelist, loadWhitelist, invalidateWhitelistCache, parseIpList, isIpInList };
