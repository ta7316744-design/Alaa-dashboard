const fetch = require('node-fetch');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' }, body: '' };
  }

  const DEEPSEEK_KEY = process.env.DEEPSEEK_API_KEY || '';
  const body         = JSON.parse(event.body || '{}');
  const campaigns    = body.campaigns || [];
  const orders       = body.orders    || [];
  const period       = body.period    || '7 أيام';

  const total_spend   = campaigns.reduce((a, c) => a + (c.spend || 0), 0);
  const total_orders  = orders.length;
  const total_revenue = orders.reduce((a, o) => a + (parseFloat(o.amount) || 0), 0);
  const delivered     = orders.filter(o => /deliver|مسلم|تسليم/i.test(o.status || '')).length;
  const cancelled     = orders.filter(o => /cancel|ملغ|إلغاء/i.test(o.status || '')).length;
  const delivery_rate = total_orders > 0 ? Math.rou
