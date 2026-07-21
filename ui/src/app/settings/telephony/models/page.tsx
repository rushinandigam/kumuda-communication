import ModelConfigurationV2 from "@/components/ModelConfigurationV2";
import { SETTINGS_DOCUMENTATION_URLS } from "@/constants/documentation";

interface ModelConfigPageProps {
  searchParams?: Promise<{
    action?: string | string[];
  }>;
}

export default async function ModelConfigPage({ searchParams }: ModelConfigPageProps) {
  const params = searchParams ? await searchParams : {};
  const action = Array.isArray(params.action) ? params.action[0] : params.action;

  return (
    <div className="container mx-auto px-4 py-6">
      <div className="max-w-4xl mx-auto">
        <ModelConfigurationV2
          docsUrl={SETTINGS_DOCUMENTATION_URLS.modelOverrides}
          initialAction={action}
        />
      </div>
    </div>
  );
}
