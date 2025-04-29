import http from 'k6/http';
import { check, sleep } from 'k6';

export let options = {
  vus: 100,
  duration: '60s',
};

export default function () {
  const batchNo = 'BATCH123';
  let res = http.get(`http://localhost:8080/api/batch/${batchNo}`);
  check(res, { 'batch lookup ok': (r) => r.status === 200 });
  sleep(0.1);
  let jobRes = http.post('http://localhost:8080/api/jobs', JSON.stringify({
    batchNo: batchNo,
    templateId: 1,
    copies: 1
  }), { headers: { 'Content-Type': 'application/json' } });
  check(jobRes, { 'job created': (r) => r.status === 200 });
} 