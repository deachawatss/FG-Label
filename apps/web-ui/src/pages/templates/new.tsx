import { useEffect, useRef } from "react";

export default function NewTemplate() {
  const editorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // TODO: load GrapesJS editor here
    if (editorRef.current) {
      editorRef.current.innerHTML = `<div style='padding:2rem;text-align:center;'>[GrapesJS Editor Placeholder - New Template]</div>`;
    }
  }, []);

  return (
    <main className="max-w-3xl mx-auto mt-10 p-4">
      <h1 className="text-2xl font-bold mb-4">New Label Template</h1>
      <div ref={editorRef} className="border h-96 bg-white" />
    </main>
  );
} 