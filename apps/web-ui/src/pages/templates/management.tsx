import TemplateManagement from '@/components/TemplateManagement';
import RequireAuth from '@/components/RequireAuth';

const TemplateManagementPage = () => (
  <RequireAuth>
    <TemplateManagement />
  </RequireAuth>
);

export default TemplateManagementPage; 