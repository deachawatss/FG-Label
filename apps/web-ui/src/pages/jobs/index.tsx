export default function JobsPage() {
  // mock data
  const jobs = [
    { id: 1, batchNo: "BATCH123", status: "printed", operator: "user1", printedAt: "2024-06-01 10:00" },
    { id: 2, batchNo: "BATCH124", status: "queued", operator: "user2", printedAt: "2024-06-01 10:05" },
  ];
  return (
    <main className="max-w-2xl mx-auto mt-10 p-4">
      <h1 className="text-2xl font-bold mb-4">Print Jobs</h1>
      <table className="w-full border">
        <thead>
          <tr>
            <th className="border px-2">BatchNo</th>
            <th className="border px-2">Status</th>
            <th className="border px-2">Operator</th>
            <th className="border px-2">PrintedAt</th>
          </tr>
        </thead>
        <tbody>
          {jobs.map(j => (
            <tr key={j.id}>
              <td className="border px-2">{j.batchNo}</td>
              <td className="border px-2">{j.status}</td>
              <td className="border px-2">{j.operator}</td>
              <td className="border px-2">{j.printedAt}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
} 