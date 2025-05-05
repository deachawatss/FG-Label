import dynamic from 'next/dynamic';

const TemplateDesigner = dynamic(
  () => import('../../components/TemplateDesigner'),
  { ssr: false }
);

export default function DesignerPage() {
  return <TemplateDesigner />;
} 