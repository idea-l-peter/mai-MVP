import { Calendar, Mail, CheckSquare, MessageCircle } from "lucide-react";
import { IntegrationCard } from "./IntegrationCard";

const integrations = [
  {
    id: "google-calendar",
    title: "Google Calendar",
    description: "Sync your calendar to let mai schedule meetings",
    icon: Calendar,
    status: "not_connected" as const,
    showConnectButton: true,
  },
  {
    id: "gmail",
    title: "Gmail",
    description: "Allow mai to read and send emails on your behalf",
    icon: Mail,
    status: "not_connected" as const,
    showConnectButton: true,
  },
  {
    id: "monday",
    title: "Monday.com",
    description: "Sync tasks and projects with Monday.com",
    icon: CheckSquare,
    status: "not_connected" as const,
    showConnectButton: true,
  },
  {
    id: "whatsapp",
    title: "WhatsApp",
    description: "Your mai WhatsApp number for external communications",
    icon: MessageCircle,
    status: "pending" as const,
    showConnectButton: false,
  },
];

export function IntegrationsContent() {
  const handleConnect = (integrationId: string) => {
    console.log(`Connecting to ${integrationId}...`);
    // OAuth flows will be implemented later
  };

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {integrations.map((integration) => (
        <IntegrationCard
          key={integration.id}
          title={integration.title}
          description={integration.description}
          icon={integration.icon}
          status={integration.status}
          showConnectButton={integration.showConnectButton}
          onConnect={() => handleConnect(integration.id)}
        />
      ))}
    </div>
  );
}