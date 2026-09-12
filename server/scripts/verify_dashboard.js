async function test() {
  const loginRes = await fetch('http://localhost:5000/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'deshmukh', password: 'police123' })
  });
  const loginData = await loginRes.json();
  const token = loginData.data.token;

  const kpiRes = await fetch('http://localhost:5000/api/kpis', {
    headers: { 'Authorization': 'Bearer ' + token }
  });
  const kpiData = await kpiRes.json();
  console.log('KPI DATA:');
  console.log({
    platesToday: kpiData.data.platesToday,
    vehiclesTracked: kpiData.data.vehiclesTracked,
    avgOcrAccuracy: kpiData.data.avgOcrAccuracy,
    uptimePercentage: kpiData.data.uptimePercentage,
    camerasOnline: kpiData.data.camerasOnline
  });

  const detRes = await fetch('http://localhost:5000/api/detections?limit=15', {
    headers: { 'Authorization': 'Bearer ' + token }
  });
  const detData = await detRes.json();
  console.log('\nDASHBOARD TOP 15 DETECTIONS:');
  detData.data.items.forEach((i, idx) => {
    console.log(`${idx + 1}. ID: ${i.id} | ${i.timestamp} | ${i.camera_name} | ${i.plate_number.padEnd(12)} | ${(i.ocr_confidence * 100).toFixed(1)}% | ${i.condition} | ${i.status}`);
  });
}
test();
