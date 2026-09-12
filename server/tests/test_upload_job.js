import fs from 'fs';

async function testUploadAndJob() {
  const form = new FormData();
  const fileBlob = new Blob([fs.readFileSync('test_image.jpg')], { type: 'image/jpeg' });
  form.append('file', fileBlob, 'test_image.jpg');

  console.log('1. Uploading test_image.jpg...');
  const upRes = await fetch('http://localhost:5000/api/ai/upload', {
    method: 'POST',
    body: form,
  });
  const upData = await upRes.json();
  console.log('Upload result:', JSON.stringify(upData, null, 2));

  if (!upData.success) throw new Error('Upload failed');

  console.log('2. Creating ANPR job...');
  const jobRes = await fetch('http://localhost:5000/api/ai/jobs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      filename: upData.filename,
      originalName: upData.originalName,
      fileType: upData.fileType,
      options: { conf: 0.25 }
    }),
  });
  const jobData = await jobRes.json();
  console.log('Job creation result:', JSON.stringify(jobData, null, 2));

  const jobId = jobData.jobId;

  console.log('3. Polling job results...');
  for (let i = 0; i < 20; i++) {
    await new Promise(r => setTimeout(r, 1000));
    const statusRes = await fetch('http://localhost:5000/api/ai/jobs/' + jobId);
    const statusData = await statusRes.json();
    console.log(`Job status check (${i + 1}):`, statusData.job?.status);
    if (statusData.job?.status === 'completed') {
      const resultsRes = await fetch('http://localhost:5000/api/ai/jobs/' + jobId + '/results');
      const resultsData = await resultsRes.json();
      console.log('\n--- Final Job Results ---');
      console.log(JSON.stringify(resultsData, null, 2));
      return;
    }
  }
}

testUploadAndJob().catch(console.error);
