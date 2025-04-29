export default function PrintersPage() {
  // mock data
  const printers = [
    { id: 1, name: "Zebra ZT230", location: "Line 1", commandSet: "ZPL", isDefault: true },
    { id: 2, name: "HP LaserJet", location: "Office", commandSet: "PDF", isDefault: false },
  ];
  return (
    <main className="max-w-xl mx-auto mt-10 p-4">
      <h1 className="text-2xl font-bold mb-4">Printers</h1>
      <ul>
        {printers.map(p => (
          <li key={p.id} className="border-b py-2 flex justify-between items-center">
            <span>{p.name} <span className="text-xs text-gray-500">({p.commandSet})</span></span>
            <span>{p.location}</span>
            <span>{p.isDefault ? "[Default]" : ""}</span>
            <button className="btn btn-sm">Test Print</button>
          </li>
        ))}
      </ul>
    </main>
  );
} 