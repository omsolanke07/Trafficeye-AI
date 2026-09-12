async function verify() {
  const loginRes = await fetch('http://localhost:5000/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'deshmukh', password: 'police123' })
  });
  const { data: { token } } = await loginRes.json();
  const authHeaders = { 'Authorization': 'Bearer ' + token };

  console.log('=== 1. KPIS ===');
  const kpiRes = await fetch('http://localhost:5000/api/kpis', { headers: authHeaders });
  const kpiData = await kpiRes.json();
  console.log(kpiData.data);

  console.log('\n=== 2. ACTIVE ALERTS ===');
  const altRes = await fetch('http://localhost:5000/api/alerts?status=all', { headers: authHeaders });
  const altData = await altRes.json();
  console.log(`Alert count: ${altData.data.length}`);
  altData.data.forEach(a => console.log(`- [${a.severity}] ${a.plate_number} at ${a.location} (${a.timestamp}): ${a.alert_type}`));

  console.log('\n=== 3. BLACKLIST ENTRIES ===');
  const blRes = await fetch('http://localhost:5000/api/blacklist', { headers: authHeaders });
  const blData = await blRes.json();
  console.log(`Blacklist count: ${blData.data.length}`);
  blData.data.forEach(b => console.log(`- ${b.plate_number} | Priority: ${b.priority} | Reason: ${b.reason} | Last Seen: ${b.last_seen_at}`));

  console.log('\n=== 4. DASHBOARD TOP 15 DETECTIONS ===');
  const detRes = await fetch('http://localhost:5000/api/detections?limit=15', { headers: authHeaders });
  const detData = await detRes.json();
  detData.data.items.forEach((d, idx) => {
    console.log(`${idx + 1}. ID: ${d.id} | ${d.timestamp} | ${d.camera_name} | ${d.plate_number.padEnd(12)} | ${(d.ocr_confidence * 100).toFixed(1)}% | ${d.condition.padEnd(14)} | ${d.status}`);
  });
}

verify();
