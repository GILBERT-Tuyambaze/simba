import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import AssistantWorkspace from '@/components/assistant/AssistantWorkspace';

export default function AssistantPage() {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <AssistantWorkspace variant="page" pageTitle="Simba Assistant" />
      <Footer />
    </div>
  );
}
