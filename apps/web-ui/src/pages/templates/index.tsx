import Link from "next/link";

export default function TemplatesPage() {
  // mock data
  const templates = [
    { id: 1, name: "FG A6", version: 1 },
    { id: 2, name: "FG ZPL", version: 2 },
  ];
  return (
    <main className="max-w-xl mx-auto mt-10 p-4">
      <h1 className="text-2xl font-bold mb-4">Label Templates</h1>
      <Link href="/templates/new" className="btn btn-primary mb-4">+ New Template</Link>
      <ul>
        {templates.map(t => (
          <li key={t.id} className="border-b py-2 flex justify-between items-center">
            <span>{t.name} <span className="text-xs text-gray-500">v{t.version}</span></span>
            <Link href={`/templates/${t.id}`} className="btn btn-sm">Edit</Link>
          </li>
        ))}
      </ul>
    </main>
  );
} 