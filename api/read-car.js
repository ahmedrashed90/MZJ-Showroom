const { readCar } = require('./_shared');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');
  try {
    const q = (req && req.query) || {};
    const identifier = String(q.id || q.url || '').trim();
    if (!identifier) return res.status(400).json({ ok: false, error: 'missing vehicle id' });
    const data = await readCar(identifier);
    res.status(200).json(data);
  } catch (e) {
    res.status(500).json({ ok: false, error: e && e.message ? e.message : String(e) });
  }
};
