import { useRouter } from "next/router";
import { useEffect, useRef } from "react";

export default function TemplateEditor() {
  const router = useRouter();
  const { id } = router.query;
  const editorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // TODO: load GrapesJS editor here
    if (editorRef.current) {
      editorRef.current.innerHTML = `<div style='padding:2rem;text-align:center;'>[GrapesJS Editor Placeholder for Template ${id}]</div>`;
    }
  }, [id]);

  return (
    <main className="max-w-3xl mx-auto mt-10 p-4">
      <h1 className="text-2xl font-bold mb-4">Edit Template #{id}</h1>
      <div ref={editorRef} className="border h-96 bg-white" />
    </main>
  );
} 