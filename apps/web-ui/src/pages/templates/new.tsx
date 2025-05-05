import { useRouter } from "next/router";
import Image from "next/image";

const starterTemplates = [
  {
    id: 1,
    name: "Chipotle (EN/AR)",
    img: "/sample_template_1.png",
    desc: "Label ภาษาอังกฤษ/อาหรับ"
  },
  {
    id: 2,
    name: "Chinese Additive",
    img: "/sample_template_2.png",
    desc: "Label ภาษาจีน"
  },
  {
    id: 3,
    name: "Truffle Flavour",
    img: "/sample_template_3.png",
    desc: "Label ภาษาอังกฤษ/ไทย/มาเลย์"
  },
  {
    id: 4,
    name: "Toasted AA Crunch",
    img: "/sample_template_4.png",
    desc: "Label ภาษาอังกฤษ/ไทย"
  },
];

export default function NewTemplate() {
  const router = useRouter();
  return (
    <main className="max-w-4xl mx-auto mt-10 p-4">
      <h1 className="text-2xl font-bold mb-6">เลือกแบบ Label Template</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {starterTemplates.map(tpl => (
          <div key={tpl.id} className="border rounded-lg p-4 bg-white flex flex-col items-center shadow">
            <div className="mb-2 font-semibold">{tpl.name}</div>
            <div className="mb-2 text-sm text-gray-500">{tpl.desc}</div>
            <Image src={tpl.img} alt={tpl.name} width={220} height={220} className="mb-2 border" />
            <button
              className="btn btn-primary mt-2"
              onClick={() => router.push(`/templates/designer?starter=${tpl.id}`)}
            >
              เลือกแบบนี้
            </button>
          </div>
        ))}
      </div>
    </main>
  );
} 