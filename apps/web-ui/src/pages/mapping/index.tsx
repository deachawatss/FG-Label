export default function MappingPage() {
  // mock data
  const mappings = [
    { id: 1, productKey: "FG001", customerKey: "CUST01", templateId: 1, priority: 1 },
    { id: 2, productKey: "FG002", customerKey: "CUST02", templateId: 2, priority: 2 },
  ];
  return (
    <main className="max-w-2xl mx-auto mt-10 p-4">
      <h1 className="text-2xl font-bold mb-4">Template Mapping</h1>
      <table className="w-full border">
        <thead>
          <tr>
            <th className="border px-2">ProductKey</th>
            <th className="border px-2">CustomerKey</th>
            <th className="border px-2">TemplateID</th>
            <th className="border px-2">Priority</th>
          </tr>
        </thead>
        <tbody>
          {mappings.map(m => (
            <tr key={m.id}>
              <td className="border px-2">{m.productKey}</td>
              <td className="border px-2">{m.customerKey}</td>
              <td className="border px-2">{m.templateId}</td>
              <td className="border px-2">{m.priority}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
} 