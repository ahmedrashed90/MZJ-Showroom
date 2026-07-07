const { readCar } = require('./_shared');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');
  try {
    const carUrl = (req.query && req.query.url) || '';
    if (!carUrl) return res.status(400).json({ ok: false, error: 'missing url' });
    const data = await readCar(carUrl);
    res.status(200).json(data);
  } catch (e) {
    res.status(500).json({ ok: false, error: e && e.message ? e.message : String(e) });
  }
};
