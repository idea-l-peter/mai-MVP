import { IntegrationCard } from "./IntegrationCard";
import { WhatsAppLogo } from "./icons";
import googleCalendarIcon from "@/assets/google-calendar-icon.svg";
import gmailLogo from "@/assets/gmail-logo.png";
import mondayLogo from "@/assets/monday-logo.svg";

const integrations = [
  {
    id: "google-calendar",
    title: "Google Calendar",
    description: "Sync your calendar to let mai schedule meetings",
    icon: <img src={googleCalendarIcon} alt="Google Calendar" className="h-6 w-6" />,
    status: "not_connected" as const,
    showConnectButton: true,
  },
  {
    id: "gmail",
    title: "Gmail",
    description: "Allow mai to read and send emails on your behalf",
    icon: <img src={gmailLogo} alt="Gmail" className="h-6 w-auto" />,
    status: "not_connected" as const,
    showConnectButton: true,
  },
  {
    id: "monday",
    title: "Monday.com",
    description: "Sync tasks and projects with Monday.com",
    icon: <img src={mondayLogo} alt="Monday.com" className="h-auto w-6" />,
    status: "not_connected" as const,
    showConnectButton: true,
  },
  {
    id: "whatsapp",
    title: "WhatsApp",
    description: "Your mai WhatsApp number for external communications",
    icon: <WhatsAppLogo className="h-7 w-7" />,
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
