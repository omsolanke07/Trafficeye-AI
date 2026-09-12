async function test() {
  const loginRes = await fetch('http://localhost:5000/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'deshmukh', password: 'police123' })
  });
  const loginData = await loginRes.json();
  const token = loginData.data.token;
  const trajRes = await fetch('http://localhost:5000/api/trajectory/MH12JJ6917', {
    headers: { 'Authorization': 'Bearer ' + token }
  });
  const trajData = await trajRes.json();
  console.log('Speed Analysis:');
  console.log({
    totalDistanceMeters: trajData.data.speedAnalysis.totalDistanceMeters,
    totalDurationSeconds: trajData.data.speedAnalysis.totalDurationSeconds,
    totalDurationFormatted: trajData.data.speedAnalysis.totalDurationFormatted,
    averageSpeedKmh: trajData.data.speedAnalysis.averageSpeedKmh,
    formula: trajData.data.speedAnalysis.formula,
    segments: trajData.data.speedAnalysis.segments.map(s => ({
      seg: s.segmentNumber,
      nodes: `${s.fromCameraId} -> ${s.toCameraId}`,
      dist: s.distanceMeters,
      time: s.durationFormatted,
      speed: `${s.speedKmh} km/h`
    }))
  });
}
test();
